# grm-service/baseline.py
#
# Persistent GRM baseline (p_i(t0)) — the fixed reference point the systemic
# index is measured against.
#
# WHY: compute_grm() works on RELATIVE rates p_i(t)/p_i(t0). The oracle only
# gives ABSOLUTE USD-relative rates, so the service must divide by a fixed
# baseline. That baseline MUST be:
#   • created ONCE, automatically, from the first VALID aggregated rate + weight set,
#   • persistent (survives container / scheduler / service restarts),
#   • never silently replaced during normal operation,
#   • self-describing enough to reproduce a computation months later.
#
# The baseline lives in the SAME SQLite DB as snapshots (single durable file on
# the Docker volume). It is immutable once written: a new baseline is a NEW row
# with a new baseline_id; normal operation only ever reads the active one.

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import config
from grm_math import FORMULA_VERSION

_LOCK = threading.Lock()


def _connect() -> sqlite3.Connection:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


@contextmanager
def _db():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_baseline_table() -> None:
    """Create the baseline table if missing. Additive: never drops anything."""
    with _LOCK, _db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS grm_baseline (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                baseline_id     TEXT NOT NULL UNIQUE,   -- stable id (e.g. 'bl_<ts>')
                created_ts      TEXT NOT NULL,          -- ISO-8601 UTC of creation
                basket_id       TEXT NOT NULL,          -- basket this baseline is for
                assets_json     TEXT NOT NULL,          -- ordered list of symbols
                rates_json      TEXT NOT NULL,          -- {SYM: absolute p_i(t0)}
                weights_json    TEXT NOT NULL,          -- {SYM: weight} at t0
                weight_meta_json TEXT,                 -- source checks at t0
                weight_sources_json TEXT,              -- source statuses at t0
                formula_version INTEGER NOT NULL,       -- formula this baseline serves
                active          INTEGER NOT NULL DEFAULT 1
            );
            """
        )
        # Additive migration for a database created before source-derived
        # weights were persisted. Existing baselines remain immutable; the new
        # columns are only populated for a newly created baseline.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(grm_baseline)").fetchall()}
        if "weight_meta_json" not in columns:
            conn.execute("ALTER TABLE grm_baseline ADD COLUMN weight_meta_json TEXT;")
        if "weight_sources_json" not in columns:
            conn.execute("ALTER TABLE grm_baseline ADD COLUMN weight_sources_json TEXT;")


def get_active_baseline(basket_id: str) -> Optional[Dict[str, Any]]:
    """Return the active baseline for a basket, or None if none exists yet.

    A baseline is only usable if its formula_version matches the CURRENT formula
    and its basket matches — otherwise it is incompatible and callers must treat
    the GRM as unavailable (we never silently rescale history)."""
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM grm_baseline WHERE basket_id=? AND active=1 "
            "ORDER BY id DESC LIMIT 1",
            (basket_id,),
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    try:
        d["assets"] = json.loads(d.pop("assets_json"))
        d["rates"] = json.loads(d.pop("rates_json"))
        d["weights"] = json.loads(d.pop("weights_json"))
        for key in ("weight_meta_json", "weight_sources_json"):
            raw = d.pop(key, None)
            decoded_key = key.removesuffix("_json")
            try:
                d[decoded_key] = json.loads(raw) if raw else None
            except Exception:
                d[decoded_key] = None
    except Exception:
        # A corrupt baseline row: surface as incompatible (caller -> unavailable).
        return {"_corrupt": True, "baseline_id": d.get("baseline_id"),
                "basket_id": d.get("basket_id"),
                "formula_version": d.get("formula_version")}
    return d


def baseline_is_compatible(baseline: Dict[str, Any], basket_id: str,
                           required_symbols: List[str]) -> bool:
    """A baseline is compatible only if it is not corrupt, matches the current
    formula_version and basket, and covers exactly the basket's symbols."""
    if not baseline or baseline.get("_corrupt"):
        return False
    if baseline.get("formula_version") != FORMULA_VERSION:
        return False
    if baseline.get("basket_id") != basket_id:
        return False
    base_rates = baseline.get("rates") or {}
    return set(base_rates.keys()) == set(required_symbols)


def create_baseline_atomic(
    baseline_id: str,
    created_ts: str,
    basket_id: str,
    assets: List[str],
    rates: Dict[str, float],
    weights: Dict[str, float],
    weight_meta: Optional[Dict[str, dict]] = None,
    weight_sources: Optional[List[dict]] = None,
) -> Optional[Dict[str, Any]]:
    """Create the baseline for a basket ONCE, atomically.

    If an active baseline for this basket already exists, this is a NO-OP and the
    existing one is returned (a restart / race must never mint a new baseline).
    Uses a transaction + UNIQUE(baseline_id) so concurrent callers can't both
    insert. Returns the active baseline (existing or newly created)."""
    with _LOCK, _db() as conn:
        # BEGIN IMMEDIATE takes the write lock up-front so the check-then-insert
        # is atomic against other writers on this single-file DB.
        conn.execute("BEGIN IMMEDIATE;")
        existing = conn.execute(
            "SELECT * FROM grm_baseline WHERE basket_id=? AND active=1 "
            "ORDER BY id DESC LIMIT 1",
            (basket_id,),
        ).fetchone()
        if existing:
            conn.execute("COMMIT;")
            d = dict(existing)
            try:
                d["assets"] = json.loads(d.pop("assets_json"))
                d["rates"] = json.loads(d.pop("rates_json"))
                d["weights"] = json.loads(d.pop("weights_json"))
                for key in ("weight_meta_json", "weight_sources_json"):
                    raw = d.pop(key, None)
                    decoded_key = key.removesuffix("_json")
                    d[decoded_key] = json.loads(raw) if raw else None
            except Exception:
                d = {"_corrupt": True}
            return d
        conn.execute(
            """
            INSERT INTO grm_baseline
              (baseline_id, created_ts, basket_id, assets_json, rates_json,
               weights_json, weight_meta_json, weight_sources_json,
               formula_version, active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                baseline_id,
                created_ts,
                basket_id,
                json.dumps(assets),
                json.dumps(rates),
                json.dumps(weights),
                json.dumps(weight_meta) if weight_meta is not None else None,
                json.dumps(weight_sources) if weight_sources is not None else None,
                FORMULA_VERSION,
            ),
        )
        conn.execute("COMMIT;")
    return {
        "baseline_id": baseline_id,
        "created_ts": created_ts,
        "basket_id": basket_id,
        "assets": assets,
        "rates": rates,
        "weights": weights,
        "weight_meta": weight_meta,
        "weight_sources": weight_sources,
        "formula_version": FORMULA_VERSION,
        "active": 1,
    }

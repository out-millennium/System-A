# grm-service/storage.py
#
# Professional storage model for the GRM Service (Stage 1, requirement 4).
#
# History is kept in SQLite (a single file on a Docker volume) so it is durable
# and queryable for later analysis with plain SQL. Two tables:
#
#   snapshots      — one row per systemic GRM computation, storing EVERYTHING
#                    needed to reproduce/analyse it: time, basket, weights,
#                    per-source raw view, medians used, results (L/I/A), and
#                    quality meta.
#   source_events  — the oracle error/latency journal: one row per source per
#                    collection attempt.
#
# The store is deliberately dependency-free (stdlib sqlite3) and safe for the
# single-writer background scheduler + read endpoints.

import json
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import config

_LOCK = threading.Lock()


def _connect() -> sqlite3.Connection:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


@contextmanager
def _db():
    """Open a connection that is ALWAYS committed (on success) and CLOSED on
    exit. sqlite3's own `with conn` context commits but never closes, which on
    Windows leaves the DB file locked (breaks temp-dir cleanup / tests). This
    wrapper closes it, keeping behaviour identical across OSes."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _add_column_if_missing(conn, table: str, column: str, ddl: str) -> None:
    """Additive migration helper: add a column only if it doesn't exist yet, so
    an EXISTING database gains the new columns without losing any data."""
    cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl};")


def init_db() -> None:
    with _LOCK, _db() as conn:
        # `rates_json` stores the ABSOLUTE aggregated rates used; `relative_rates_json`
        # stores the p_i(t)/p_i(t0) actually fed to compute_grm (from v2 onward).
        # Weight columns preserve the source-derived input and its quality decision.
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS snapshots (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                ts                  TEXT NOT NULL,          -- ISO-8601 UTC
                basket_id           TEXT NOT NULL,
                weights_json        TEXT NOT NULL,          -- {SYM: weight}
                rates_json          TEXT NOT NULL,          -- {SYM: absolute rate}
                medians_json        TEXT NOT NULL,          -- full aggregator medians
                sources_json        TEXT NOT NULL,          -- per-source statuses
                meta_json           TEXT NOT NULL,          -- per-asset quality meta
                L                   REAL NOT NULL,
                I                   REAL NOT NULL,
                A                   REAL NOT NULL,
                formula_version     INTEGER,               -- formula used (NULL = legacy v1)
                baseline_id         TEXT,                  -- baseline this snapshot used
                relative_rates_json TEXT,                  -- {SYM: p_i(t)/p_i(t0)}
                weight_meta_json    TEXT,                  -- per-asset weight QC
                weight_sources_json TEXT,                  -- weight-source statuses
                weight_observations_json TEXT,              -- raw weight values by source
                asset_classes_json  TEXT                   -- per-asset class
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);")
        # Additive migration for EXISTING databases created before versioning.
        # Old rows keep formula_version = NULL, which we backfill to the legacy
        # marker (1) so they remain identifiable as pre-baseline history and are
        # never confused with current (v3) results. They are NOT recomputed.
        _add_column_if_missing(conn, "snapshots", "formula_version", "formula_version INTEGER")
        _add_column_if_missing(conn, "snapshots", "baseline_id", "baseline_id TEXT")
        _add_column_if_missing(conn, "snapshots", "relative_rates_json", "relative_rates_json TEXT")
        _add_column_if_missing(conn, "snapshots", "weight_meta_json", "weight_meta_json TEXT")
        _add_column_if_missing(conn, "snapshots", "weight_sources_json", "weight_sources_json TEXT")
        _add_column_if_missing(conn, "snapshots", "weight_observations_json", "weight_observations_json TEXT")
        _add_column_if_missing(conn, "snapshots", "asset_classes_json", "asset_classes_json TEXT")
        conn.execute(
            "UPDATE snapshots SET formula_version = 1 WHERE formula_version IS NULL;"
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS source_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT NOT NULL,
                source      TEXT NOT NULL,
                ok          INTEGER NOT NULL,
                latency_ms  INTEGER NOT NULL,
                currencies  INTEGER NOT NULL DEFAULT 0,
                error       TEXT NOT NULL DEFAULT ''
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_source_events_ts ON source_events(ts);")

    # Baseline table lives in the same DB file; create it alongside snapshots.
    import baseline
    baseline.init_baseline_table()


def save_snapshot(
    ts: str,
    basket_id: str,
    weights: Dict[str, float],
    rates: Dict[str, float],
    medians: Dict[str, float],
    sources: List[dict],
    meta: Dict[str, dict],
    L: float,
    I: float,
    A: float,
    formula_version: Optional[int] = None,
    baseline_id: Optional[str] = None,
    relative_rates: Optional[Dict[str, float]] = None,
    weight_meta: Optional[Dict[str, dict]] = None,
    weight_sources: Optional[List[dict]] = None,
    weight_observations: Optional[Dict[str, List[dict]]] = None,
    asset_classes: Optional[Dict[str, str]] = None,
) -> None:
    with _LOCK, _db() as conn:
        conn.execute(
            """
            INSERT INTO snapshots
              (ts, basket_id, weights_json, rates_json, medians_json,
               sources_json, meta_json, L, I, A,
               formula_version, baseline_id, relative_rates_json,
               weight_meta_json, weight_sources_json, weight_observations_json,
               asset_classes_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                ts,
                basket_id,
                json.dumps(weights),
                json.dumps(rates),
                json.dumps(medians),
                json.dumps(sources),
                json.dumps(meta),
                L,
                I,
                A,
                formula_version,
                baseline_id,
                json.dumps(relative_rates) if relative_rates is not None else None,
                json.dumps(weight_meta) if weight_meta is not None else None,
                json.dumps(weight_sources) if weight_sources is not None else None,
                json.dumps(weight_observations) if weight_observations is not None else None,
                json.dumps(asset_classes) if asset_classes is not None else None,
            ),
        )
        _prune(conn)


def save_source_events(ts: str, statuses: List[dict]) -> None:
    if not statuses:
        return
    with _LOCK, _db() as conn:
        conn.executemany(
            """
            INSERT INTO source_events (ts, source, ok, latency_ms, currencies, error)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    ts,
                    s.get("source", ""),
                    1 if s.get("ok") else 0,
                    int(s.get("latency_ms", 0)),
                    int(s.get("currencies", 0)),
                    s.get("error", "") or "",
                )
                for s in statuses
            ],
        )


def _prune(conn: sqlite3.Connection) -> None:
    """Keep the snapshot table bounded (config.HISTORY_MAX_ROWS)."""
    cap = config.HISTORY_MAX_ROWS
    if cap and cap > 0:
        conn.execute(
            """
            DELETE FROM snapshots
            WHERE id NOT IN (
                SELECT id FROM snapshots ORDER BY id DESC LIMIT ?
            )
            """,
            (cap,),
        )


def history(limit: int = 720) -> List[Dict[str, Any]]:
    """Most-recent-last list of {ts, L, I, A} (back-compat with the old API)."""
    with _db() as conn:
        rows = conn.execute(
            "SELECT ts, L, I, A FROM snapshots ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def latest_snapshot() -> Optional[Dict[str, Any]]:
    """Full most-recent snapshot (for /grm/current and diagnostics)."""
    with _db() as conn:
        row = conn.execute(
            "SELECT * FROM snapshots ORDER BY id DESC LIMIT 1"
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    for k in (
        "weights_json", "rates_json", "medians_json", "sources_json",
        "meta_json", "relative_rates_json", "weight_meta_json",
        "weight_sources_json", "weight_observations_json", "asset_classes_json",
    ):
        if k in d:
            try:
                d[k[:-5]] = json.loads(d.pop(k))
            except Exception:
                d[k[:-5]] = None
    return d


def recent_source_events(limit: int = 60) -> List[Dict[str, Any]]:
    with _db() as conn:
        rows = conn.execute(
            "SELECT ts, source, ok, latency_ms, currencies, error "
            "FROM source_events ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def snapshot_nearest(target_ts: str) -> Optional[Dict[str, Any]]:
    """Return the snapshot whose timestamp is CLOSEST to `target_ts` (ISO-8601).

    Picks the nearest by absolute time distance (before or after), so a date/time
    query always resolves to the snapshot that was in effect around that moment.
    Returns the full decoded snapshot (same shape as latest_snapshot) or None if
    there are no snapshots at all.
    """
    with _db() as conn:
        # Two candidates: the newest <= target and the oldest >= target; the DB
        # does the comparison on the ISO string (lexicographic == chronological
        # for UTC ISO-8601). We then pick whichever is closer in Python.
        below = conn.execute(
            "SELECT * FROM snapshots WHERE ts <= ? ORDER BY ts DESC LIMIT 1",
            (target_ts,),
        ).fetchone()
        above = conn.execute(
            "SELECT * FROM snapshots WHERE ts >= ? ORDER BY ts ASC LIMIT 1",
            (target_ts,),
        ).fetchone()

    def _decode(row):
        d = dict(row)
        for k in (
            "weights_json", "rates_json", "medians_json", "sources_json",
            "meta_json", "relative_rates_json", "weight_meta_json",
            "weight_sources_json", "weight_observations_json", "asset_classes_json",
        ): 
            if k in d:
                try:
                    d[k[:-5]] = json.loads(d.pop(k))
                except Exception:
                    d[k[:-5]] = None
        return d

    from datetime import datetime

    def _parse(ts):
        try:
            return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        except Exception:
            return None

    cands = [r for r in (below, above) if r is not None]
    if not cands:
        return None
    tgt = _parse(target_ts)
    if tgt is None:
        return _decode(cands[0])
    best = min(
        cands,
        key=lambda r: abs((_parse(r["ts"]) - tgt).total_seconds())
        if _parse(r["ts"]) else 1e18,
    )
    return _decode(best)

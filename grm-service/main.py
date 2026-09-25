# grm-service/main.py
#
# GRM Service — external analytical model over System A (NOT part of System A).
#
# Stage 1 makes the systemic GRM fully AUTOMATIC:
#   - a background scheduler (scheduler.py) recomputes the systemic GRM on an
#     interval using the professional Oracle Aggregator (oracles.py), a
#     source-weighted dynamic or named basket, central config (config.py) and durable SQLite history
#     (storage.py);
#   - the Frontend performs no computation — it reads /grm/current, /grm/history
#     and /grm/diagnostics;
#   - the manual /grm/compute endpoint is PRESERVED as an independent research
#     tool for the personal-cabinet GRM Calculator (it never feeds the system).
#
# None of this changes System A: the GRM does not touch the Core ledger.

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from config import config
from grm_math import compute_grm, median as _median, FORMULA_VERSION
import oracles
import storage
import scheduler
import os

load_dotenv()

CORE_API_URL = os.getenv("CORE_API_URL", "http://localhost:8000")
CORE_ADMIN_KEY = os.getenv("CORE_ADMIN_KEY")
GRM_VERSION = "0.4.0"

app = FastAPI(title="GRM Service")

from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)

ADMIN_HEADERS = {"x-admin-key": CORE_ADMIN_KEY}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("grm")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


def audit(event: str, **kwargs):
    logger.info(json.dumps({"event": event, "ts": datetime.now(timezone.utc).isoformat(), **kwargs}))


# ---------------------------------------------------------------------------
# Health / version
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/version")
def version():
    return {
        "service": "grm",
        "version": GRM_VERSION,
        "formula_version": FORMULA_VERSION,
        "note": "GRM is external to System A and does not alter the core ledger.",
    }


# ---------------------------------------------------------------------------
# Systemic (automatic) GRM — computed by the background scheduler
# ---------------------------------------------------------------------------

@app.get("/grm/current")
async def grm_current():
    """The latest TRUSTED systemic GRM (I/A/L + basket, rates, versions, meta).

    This is what external consumers (e.g. Meridian) and the Frontend read. The
    value is produced entirely inside the GRM Service; callers never compute it.

    GRM_UNAVAILABLE contract: when there is no trusted current GRM (insufficient
    quorum / incomplete basket / cannot build relative rates / incompatible or
    missing baseline), this returns HTTP 503 with a machine-readable reason.
    Consumers MUST treat that as unavailable and NOT create a quote.
    """
    if scheduler.state.latest is None:
        # Not computed yet (just started) — compute on demand once. Single-flight
        # so concurrent first requests don't each stampede the oracle sources.
        snap = await scheduler.compute_once_singleflight()
        if snap is None:
            reason = scheduler.state.unavailable_reason or "not_available_yet"
            raise HTTPException(
                status_code=503,
                detail={"status": "GRM_UNAVAILABLE", "reason": reason},
            )
        return snap
    return scheduler.state.latest


@app.get("/grm/baseline")
async def grm_baseline():
    """The active persistent baseline p_i(t0) for the systemic basket (or an
    explicit unavailable status if none has been established yet). Read-only;
    exposed for reproducibility/audit — the baseline is created automatically by
    the scheduler and never edited here."""
    import baseline as baseline_store

    basket_id = scheduler.systemic_basket_key()
    bl = baseline_store.get_active_baseline(basket_id)
    if not bl or bl.get("_corrupt"):
        raise HTTPException(
            status_code=503,
            detail={"status": "GRM_UNAVAILABLE", "reason": "no_baseline"},
        )
    return {
        "baseline_id": bl["baseline_id"],
        "created_ts": bl["created_ts"],
        "basket_id": bl["basket_id"],
        "assets": bl["assets"],
        "rates": bl["rates"],
        "weights": bl["weights"],
        "weight_meta": bl.get("weight_meta"),
        "weight_sources": bl.get("weight_sources"),
        "formula_version": bl["formula_version"],
    }


@app.get("/grm/history")
async def get_grm_history(limit: int = 720):
    """Systemic GRM history as {ts, L, I, A} (most-recent-last)."""
    return {"history": storage.history(limit=max(1, min(limit, 5000)))}


@app.get("/grm/at")
async def grm_at(ts: str):
    """The stored snapshot CLOSEST to a given timestamp (ISO-8601, UTC).

    Powers the "look up the GRM at a date/time" search. Returns the nearest
    historical snapshot's I/A/L plus its formula_version and baseline_id for
    reproducibility, or 404 if there is no history yet.
    """
    snap = storage.snapshot_nearest(ts)
    if snap is None:
        raise HTTPException(status_code=404, detail="no snapshot found")
    return {
        "ts": snap.get("ts"),
        "L": snap.get("L"),
        "I": snap.get("I"),
        "A": snap.get("A"),
        "basket_id": snap.get("basket_id"),
        "formula_version": snap.get("formula_version"),
        "baseline_id": snap.get("baseline_id"),
        "weights": snap.get("weights"),
        "weight_meta": snap.get("weight_meta"),
        "asset_classes": snap.get("asset_classes"),
    }


@app.get("/grm/config")
async def grm_config():
    """Central configuration (requirement 11) — read-only view."""
    return {
        "update_interval_s": config.UPDATE_INTERVAL_S,
        "oracle_timeout_s": config.ORACLE_TIMEOUT_S,
        "quality": {
            "max_spread": config.QUALITY_MAX_SPREAD,
            "min_sources_per_asset": config.MIN_SOURCES_PER_ASSET,
            "outlier_mad_k": config.OUTLIER_MAD_K,
            "weight_max_spread": config.WEIGHT_MAX_SPREAD,
            "min_weight_sources": config.MIN_WEIGHT_SOURCES,
            "rate_min": config.RATE_MIN,
            "rate_max": config.RATE_MAX,
        },
        "systemic_basket": scheduler.systemic_basket_key(),
        "weight_mode": "source_derived",
        "weight_universe_version": config.WEIGHT_UNIVERSE_VERSION,
        "sources": [s.name for s in oracles.SOURCES],
        "weight_sources": [s.name for s in oracles.configured_weight_sources()],
        "history_max_rows": config.HISTORY_MAX_ROWS,
    }


@app.get("/grm/diagnostics")
async def grm_diagnostics():
    """Infrastructure diagnostics (requirement 12): source state, last update,
    error history, data quality, medians/weights in use, next update time."""
    st = scheduler.state
    return {
        "last_run": st.last_run.isoformat() if st.last_run else None,
        "next_run": st.next_run.isoformat() if st.next_run else None,
        "last_error": st.last_error,
        "unavailable_reason": st.unavailable_reason,
        "formula_version": FORMULA_VERSION,
        "latest": st.latest,
        "sources_configured": [s.name for s in oracles.SOURCES],
        "last_source_statuses": st.last_statuses,
        "last_weight_source_statuses": st.last_weight_statuses,
        "recent_source_events": storage.recent_source_events(limit=60),
    }


# ---------------------------------------------------------------------------
# Oracle aggregator (direct view) — aggregated medians + quality + statuses
# ---------------------------------------------------------------------------

@app.get("/grm/oracle/rates")
@limiter.limit("10/minute")
async def fetch_oracle_rates(request: Request):
    """Aggregated USD-relative rates plus source-derived weights and quality
    metadata. Rates use a median; coherent weight values use the arithmetic
    mean, while conflicting values are frozen to the last accepted value (or a
    robust provisional median for a new asset). External data; not verified by
    System A."""
    agg = await oracles.collect()
    if not agg.medians:
        raise HTTPException(status_code=502, detail="All oracle sources failed")
    weight_aggregate = agg.weights
    return {
        "rates": agg.medians,
        "meta": agg.meta,
        "weights": weight_aggregate.weights if weight_aggregate else {},
        "weight_meta": weight_aggregate.meta if weight_aggregate else {},
        "weight_observations": weight_aggregate.observations if weight_aggregate else {},
        "sources_total": agg.sources_total,
        "sources_responded": agg.sources_responded,
        "weight_sources_total": weight_aggregate.sources_total if weight_aggregate else 0,
        "weight_sources_responded": weight_aggregate.sources_responded if weight_aggregate else 0,
        "sources": [
            {
                "source": s.source,
                "ok": s.ok,
                "latency_ms": s.latency_ms,
                "currencies": s.currencies,
                "error": s.error,
            }
            for s in agg.statuses
        ],
        "weight_sources": [
            {
                "source": s.source,
                "ok": s.ok,
                "latency_ms": s.latency_ms,
                "assets": s.assets,
                "error": s.error,
            }
            for s in (weight_aggregate.statuses if weight_aggregate else [])
        ],
    }


# ---------------------------------------------------------------------------
# Research GRM Calculator (PRESERVED) — manual, independent, not systemic
# ---------------------------------------------------------------------------

@app.post("/grm/compute")
@limiter.limit("60/minute")
async def compute(request: Request, payload: dict):
    """Manual GRM computation for the personal-cabinet research calculator.

    This endpoint is INTENTIONALLY independent from the systemic GRM: it lets a
    user experiment with arbitrary rates/weights. It does not read or affect the
    systemic snapshot in any way.
    """
    rates = payload.get("rates")
    weights = payload.get("weights")
    if not isinstance(rates, dict) or not isinstance(weights, dict):
        raise HTTPException(status_code=400, detail="rates and weights must be objects")
    try:
        result = compute_grm(rates, weights)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    audit("grm_compute", assets=list(rates.keys()))
    return result


# ---------------------------------------------------------------------------
# Ledger summary (unchanged) — aggregate read of the Core ledger
# ---------------------------------------------------------------------------

@app.get("/grm/ledger-summary")
async def ledger_summary():
    all_ops = []
    offset = 0
    limit = 1000
    async with httpx.AsyncClient() as client:
        while True:
            res = await client.get(
                f"{CORE_API_URL}/ledger",
                headers=ADMIN_HEADERS,
                params={"limit": limit, "offset": offset},
            )
            if res.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch ledger from core")
            batch = res.json()
            all_ops.extend(batch)
            if len(batch) < limit:
                break
            offset += limit

    total_credits = sum(int(op["amount"]) for op in all_ops if op["operation_type"] == "init_credit")
    total_transfers = sum(1 for op in all_ops if op["operation_type"] == "transfer")
    total_burned = sum(int(op["amount"]) for op in all_ops if op["operation_type"] in ("burn", "system_burn"))
    total_volume = sum(int(op["amount"]) for op in all_ops if op["operation_type"] == "transfer")

    audit("ledger_summary_fetched", ops=len(all_ops))
    return {
        "total_init_credited": total_credits,
        "total_burned": total_burned,
        "total_transfer_volume": total_volume,
        "total_transfer_count": total_transfers,
        "circulating": total_credits - total_burned,
        "operations_count": len(all_ops),
    }


# ---------------------------------------------------------------------------
# Startup: launch the automatic scheduler
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    storage.init_db()
    asyncio.create_task(scheduler.run_scheduler())

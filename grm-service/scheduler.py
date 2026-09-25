# grm-service/scheduler.py
#
# Automated systemic-GRM scheduler (Stage 1, requirement 1).
#
# A single background task recomputes the systemic GRM on a fixed interval:
#   collect rate + weight observations -> resolve the active asset universe
#   -> compute GRM -> persist snapshot + source journals -> cache the result.
#
# The Frontend performs NO computation; it only reads the cached/persisted
# result. All GRM math happens here, deterministically and reproducibly.

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import httpx

from config import config
from grm_math import compute_grm, build_relative_rates, FORMULA_VERSION
import baseline as baseline_store
import oracles
import storage

logger = logging.getLogger("grm.scheduler")

# A dynamic basket is selected by weight availability, not by a hard-coded list.
# The first valid asset set is then frozen by the persistent baseline so new
# symbols cannot silently rewrite the historical meaning of the index.
AUTO_WEIGHTED_BASKET_ID = "all_weighted"


def systemic_basket_key() -> str:
    """Return the persistent namespace for the source-weighted universe."""
    return f"{AUTO_WEIGHTED_BASKET_ID}:v{config.WEIGHT_UNIVERSE_VERSION}"


class GRMState:
    """In-memory cache of the latest systemic snapshot + next-run bookkeeping."""

    def __init__(self) -> None:
        self.latest: Optional[Dict[str, Any]] = None
        self.last_run: Optional[datetime] = None
        self.next_run: Optional[datetime] = None
        self.last_error: Optional[str] = None
        self.last_statuses: list = []
        self.last_weight_statuses: list = []
        # Explicit first-class GRM_UNAVAILABLE signal for the current cycle. When
        # set, there is NO trusted current GRM and consumers (Meridian) must NOT
        # be given a numeric result. `latest` is only ever a TRUSTED snapshot.
        self.unavailable_reason: Optional[str] = None


state = GRMState()

# Single-flight guard so concurrent on-demand computations (e.g. several callers
# hitting /grm/current right after startup) collapse into ONE oracle fetch
# instead of stampeding the external sources.
_compute_lock = asyncio.Lock()


def _reuse_last_known_weights(agg: oracles.AggregateResult) -> tuple[oracles.AggregateResult, Optional[str]]:
    """Keep the last accepted weights when weight sources are temporarily silent.

    A source outage must not erase a previously accepted weight. Current
    disagreement is handled separately by `_stabilize_weight_conflicts`, which
    freezes the affected asset instead of deleting it.
    """
    if agg.weights is None or agg.weights.weights:
        return agg, None
    if any(item.get("flagged") for item in agg.weights.meta.values()):
        return agg, None
    last = storage.latest_snapshot()
    if not last or last.get("formula_version") != FORMULA_VERSION:
        return agg, None
    old_weights = last.get("weights") or {}
    old_meta = last.get("weight_meta") or {}
    if not old_weights:
        return agg, None
    reused_meta = {symbol: dict(item) for symbol, item in old_meta.items()}
    for item in reused_meta.values():
        item["last_known"] = True
        item["last_known_snapshot_ts"] = last.get("ts")
    reused = oracles.WeightAggregateResult(
        weights=dict(old_weights),
        meta=reused_meta,
        observations=last.get("weight_observations") or {},
        statuses=agg.weights.statuses,
        sources_total=agg.weights.sources_total,
        sources_responded=agg.weights.sources_responded,
        reference_usd_value=(reused_meta.get("USD") or {}).get("value_usd"),
    )
    return oracles.AggregateResult(
        medians=agg.medians,
        meta=agg.meta,
        statuses=agg.statuses,
        sources_total=agg.sources_total,
        sources_responded=agg.sources_responded,
        weights=reused,
    ), last.get("ts")


def _weight_status_dict(status: oracles.WeightSourceStatus) -> dict:
    return {
        "source": status.source,
        "ok": status.ok,
        "latency_ms": status.latency_ms,
        "assets": status.assets,
        "error": status.error,
    }


def _stabilize_weight_conflicts(
    agg: oracles.AggregateResult,
) -> oracles.AggregateResult:
    """Freeze the last accepted absolute weight when sources conflict.

    A conflict never removes an asset. Existing assets keep their last accepted
    absolute value until the current observations are coherent again. A new
    asset without history uses the robust median supplied by the oracle layer.
    All effective values are normalized again so the GRM continues to have a
    complete source-derived weight vector.
    """
    if agg.weights is None or not agg.weights.meta:
        return agg
    previous = storage.latest_snapshot() or {}
    previous_meta = previous.get("weight_meta") or {}
    active = baseline_store.get_active_baseline(systemic_basket_key())
    if active is not None:
        # A partial source outage must not turn a baseline constituent's weight
        # into zero while other weights continue with the current cycle.
        for symbol in active.get("assets") or []:
            if symbol in agg.weights.meta:
                continue
            old = previous_meta.get(symbol) or {}
            old_value = float(old.get("value_usd") or 0.0)
            if old_value <= 0:
                continue
            item = dict(old)
            item["last_known"] = True
            item["last_known_snapshot_ts"] = previous.get("ts")
            item["stability_state"] = "frozen_missing"
            item["included"] = True
            item["flagged"] = False
            agg.weights.meta[symbol] = item
            if symbol in (previous.get("weight_observations") or {}):
                agg.weights.observations[symbol] = previous["weight_observations"][symbol]

    values: Dict[str, float] = {}
    for symbol, item in agg.weights.meta.items():
        current = float(item.get("value_usd") or 0.0)
        if current <= 0:
            continue
        if item.get("flagged"):
            old = previous_meta.get(symbol) or {}
            old_value = float(old.get("value_usd") or 0.0)
            if old_value > 0:
                current = old_value
                item["stability_state"] = "frozen_conflict"
                item["frozen_value_usd"] = old_value
                item["frozen_from_snapshot_ts"] = previous.get("ts")
            else:
                item["stability_state"] = "provisional_conflict"
        item["value_usd"] = current
        values[symbol] = current

    total = sum(values.values())
    if total <= 0:
        return agg
    weights = {symbol: value / total for symbol, value in values.items()}
    usd_value = values.get("USD")
    for symbol, item in agg.weights.meta.items():
        if symbol not in values:
            continue
        item["normalized_weight"] = weights[symbol]
        item["included"] = True
        if usd_value is not None:
            item["relative_to_usd"] = values[symbol] / usd_value
    agg.weights.weights = weights
    agg.weights.reference_usd_value = usd_value
    return agg


def _merged_weight_meta(agg: oracles.AggregateResult) -> Dict[str, dict]:
    """Return weight diagnostics for every rate/weight symbol.

    Symbols present only in rate feeds are kept with an explicit unavailable
    weight entry. They remain visible in the Frontend table but cannot enter the
    dynamic systemic basket without a weight observation.
    """
    weight_meta = agg.weights.meta if agg.weights is not None else {}
    symbols = set(agg.medians) | set(weight_meta)
    merged: Dict[str, dict] = {}
    for symbol in sorted(symbols):
        item = dict(weight_meta.get(symbol) or {})
        item.setdefault("sources", 0)
        item.setdefault("source_names", [])
        item.setdefault("min_usd", None)
        item.setdefault("max_usd", None)
        item.setdefault("value_usd", None)
        item.setdefault("spread", None)
        item.setdefault("flagged", False)
        item.setdefault("included", False)
        item.setdefault("asset_class", "currency")
        item.setdefault("methods", [])
        item.setdefault("normalized_weight", None)
        item.setdefault("relative_to_usd", None)
        item["in_grm"] = False
        item["grm_weight"] = None
        merged[symbol] = item
    return merged


def _asset_classes(meta: Dict[str, dict]) -> Dict[str, str]:
    return {symbol: str(item.get("asset_class") or "asset") for symbol, item in meta.items()}


def _current_weight_values(
    weight_aggregate: oracles.WeightAggregateResult,
    symbols: list[str],
) -> Dict[str, float]:
    """Select source-derived weights for the current baseline asset set.

    Disagreement is stabilized before this function runs, so every observed
    asset remains source-derived and participating. A missing value can still be
    zero here only when no accepted observation or last-known value exists; the
    current baseline then reports the incomplete source state rather than
    inventing a preset.
    """
    return {
        symbol: float(weight_aggregate.weights.get(symbol, 0.0))
        if float(weight_aggregate.weights.get(symbol, 0.0)) > 0
        else 0.0
        for symbol in symbols
    }


async def compute_once_singleflight(
    client: "httpx.AsyncClient | None" = None,
) -> Optional[Dict[str, Any]]:
    """Like compute_once, but only one runs at a time; others await its result."""
    async with _compute_lock:
        # A computation may have completed while we waited for the lock.
        if state.latest is not None:
            return state.latest
        return await compute_once(client)


async def compute_once(client: "httpx.AsyncClient | None" = None) -> Optional[Dict[str, Any]]:
    """Run one full systemic-GRM computation and persist it. Returns the snapshot."""
    ts = datetime.now(timezone.utc).isoformat()
    agg = await oracles.collect(client)
    agg, reused_weight_snapshot_ts = _reuse_last_known_weights(agg)
    agg = _stabilize_weight_conflicts(agg)

    # Persist the rate-oracle journal regardless of outcome (diagnostics).
    statuses = [
        {
            "source": s.source,
            "ok": s.ok,
            "latency_ms": s.latency_ms,
            "currencies": s.currencies,
            "error": s.error,
        }
        for s in agg.statuses
    ]
    weight_statuses = [_weight_status_dict(s) for s in (agg.weights.statuses if agg.weights else [])]
    storage.save_source_events(ts, statuses)
    state.last_statuses = statuses
    state.last_weight_statuses = weight_statuses
    # Update oracle-health gauges for monitoring/alerting (requirement 12).
    try:
        import grm_metrics

        grm_metrics.record_cycle(statuses, None)
        grm_metrics.set_snapshot_age(0.0)
    except Exception:
        # Metrics must never break the computation cycle.
        pass

    basket_key = systemic_basket_key()
    if config.SYSTEMIC_BASKET_ID != AUTO_WEIGHTED_BASKET_ID:
        return _unavailable("unsupported_systemic_weight_mode")
    if agg.weights is None:
        return _unavailable("no_weight_data")

    weight_meta = _merged_weight_meta(agg)
    active = baseline_store.get_active_baseline(basket_key)

    if active is not None:
        # Once a baseline exists, its asset set is authoritative. New assets are
        # diagnosed but cannot silently alter the index composition.
        required_symbols = [str(symbol) for symbol in (active.get("assets") or [])]
    else:
        # First valid snapshot: every rate-covered, quality-accepted asset with
        # a positive source-derived weight becomes a constituent.
        required_symbols = sorted(
            symbol for symbol in agg.medians
            if symbol in agg.weights.weights and agg.weights.weights[symbol] > 0
        )

    if not required_symbols:
        return _unavailable("no_eligible_weighted_assets")

    # 1) Resolve each selected asset to an ABSOLUTE USD-relative rate. The GRM
    #    requires the FULL baseline asset set: a missing rate makes the relative
    #    set incomplete, so we report UNAVAILABLE rather than a partial index.
    absolute_rates: Dict[str, float] = {}
    for symbol in required_symbols:
        rate = agg.medians.get(symbol)
        if rate is not None and config.RATE_MIN <= rate <= config.RATE_MAX:
            absolute_rates[symbol] = rate

    if not absolute_rates:
        return _unavailable("no_basket_rates")
    missing = [symbol for symbol in required_symbols if symbol not in absolute_rates]
    if missing:
        return _unavailable(f"incomplete_basket:{','.join(missing)}")
    if config.MIN_ASSETS_FOR_GRM > 0 and len(absolute_rates) < config.MIN_ASSETS_FOR_GRM:
        return _unavailable("insufficient_assets")

    # 2) Source-derived weights. Conflicts have already been frozen to the last
    #    accepted value (or to a robust provisional median for a new asset); no
    #    hard-coded preset or silent exclusion is used. compute_grm normalizes the
    #    complete source-derived vector for the registered basket.
    weights = _current_weight_values(agg.weights, required_symbols)
    if sum(weights.values()) <= 0:
        return _unavailable("no_accepted_weights")

    # 3) Persistent baseline p_i(t0). Created ONCE, atomically, from this first
    #    valid absolute set; reused forever after (restarts don't re-mint it).
    if active is None:
        bl_id = f"bl_{ts}"
        baseline_meta = {symbol: weight_meta[symbol] for symbol in required_symbols if symbol in weight_meta}
        active = baseline_store.create_baseline_atomic(
            baseline_id=bl_id,
            created_ts=ts,
            basket_id=basket_key,
            assets=required_symbols,
            rates=absolute_rates,     # p_i(t0) = first valid aggregated rates
            weights=weights,
            weight_meta=baseline_meta,
            weight_sources=weight_statuses,
        )
        if active is None or active.get("_corrupt"):
            return _unavailable("baseline_create_failed")
        logger.info("GRM baseline created: %s (%d assets)", active["baseline_id"], len(absolute_rates))

    # 4) A baseline that is corrupt / for another formula / another basket / a
    #    different asset set must NOT be silently rescaled — report unavailable.
    if not baseline_store.baseline_is_compatible(active, basket_key, required_symbols):
        return _unavailable("baseline_incompatible")

    # 5) Build RELATIVE rates p_i(t)/p_i(t0). Only these are fed to compute_grm.
    relative = build_relative_rates(absolute_rates, active["rates"])
    if relative is None:
        return _unavailable("relative_rates_incomplete")

    # 6) Compute. For the very first snapshot, current == baseline => every
    #    relative rate is 1 => L=0, I=1, A=1 (index starts at itself).
    result = compute_grm(relative, weights)
    for symbol, item in weight_meta.items():
        item["in_grm"] = symbol in required_symbols
        item["grm_weight"] = result["weights"].get(symbol)
        # Keep the source-universe normalization distinct from the weight that
        # actually entered this immutable baseline universe.
        if item.get("normalized_weight") is not None:
            item["source_normalized_weight"] = item["normalized_weight"]
        if symbol in result["weights"]:
            item["normalized_weight"] = result["weights"][symbol]

    classes = _asset_classes(weight_meta)
    storage.save_snapshot(
        ts=ts,
        basket_id=basket_key,
        weights=result["weights"],
        rates=agg.medians,            # full rate universe for diagnostics/table
        medians=agg.medians,
        sources=statuses,
        meta=agg.meta,
        L=result["L"],
        I=result["I"],
        A=result["A"],
        formula_version=FORMULA_VERSION,
        baseline_id=active["baseline_id"],
        relative_rates=relative,       # exactly what compute_grm consumed
        weight_meta=weight_meta,
        weight_sources=weight_statuses,
        weight_observations=agg.weights.observations,
        asset_classes=classes,
    )

    snapshot = {
        "ts": ts,
        "basket_id": basket_key,
        "L": result["L"],
        "I": result["I"],
        "A": result["A"],
        "rates": agg.medians,
        "relative_rates": relative,
        "weights": result["weights"],
        "weight_meta": weight_meta,
        "weight_observations": agg.weights.observations,
        "weight_source_statuses": weight_statuses,
        "weight_policy": {
            "max_spread": config.WEIGHT_MAX_SPREAD,
            "min_sources": config.MIN_WEIGHT_SOURCES,
            "spread_formula": "(max-min)/mean",
            "conflict_action": "freeze_previous_or_median_provisional",
            "persistence": "last accepted weight remains until a newer accepted oracle value replaces it",
        },
        "weight_values_snapshot_ts": reused_weight_snapshot_ts or ts,
        "asset_classes": classes,
        "meta": agg.meta,
        "sources_total": agg.sources_total,
        "sources_responded": agg.sources_responded,
        "weight_sources_total": agg.weights.sources_total,
        "weight_sources_responded": agg.weights.sources_responded,
        "weight_reference_usd_value": agg.weights.reference_usd_value,
        "formula_version": FORMULA_VERSION,
        "baseline_id": active["baseline_id"],
        "baseline_ts": active.get("created_ts"),
    }
    state.latest = snapshot
    state.last_error = None
    state.unavailable_reason = None
    logger.info("systemic GRM updated: I=%.6f A=%.6f (baseline %s, %d assets)",
                result["I"], result["A"], active["baseline_id"], len(result["weights"]))
    return snapshot


def _unavailable(reason: str) -> None:
    """Record a first-class GRM_UNAVAILABLE outcome for this cycle. Does NOT set
    state.latest (so a stale trusted value is never presented as current here)
    and NEVER creates a baseline from untrusted/incomplete data."""
    state.last_error = reason
    state.unavailable_reason = reason
    # Never serve the previous snapshot as if it were current after a failed
    # quality/baseline cycle. Consumers must receive GRM_UNAVAILABLE instead.
    state.latest = None
    logger.error("GRM unavailable: %s", reason)
    return None


async def run_scheduler() -> None:
    """Background loop: first run after a short delay, then every interval."""
    storage.init_db()
    # Seed the in-memory cache from the last persisted snapshot (fast restart).
    # ONLY seed a snapshot computed with the CURRENT formula version — a legacy
    # (pre-baseline, v1/v2) snapshot must never be presented as a trusted current
    # GRM. If the newest snapshot is legacy, we start "unavailable" until the
    # scheduler produces a fresh v3 snapshot against the persistent baseline.
    try:
        last = storage.latest_snapshot()
        if last and last.get("formula_version") == FORMULA_VERSION:
            state.latest = {
                "ts": last["ts"],
                "basket_id": last["basket_id"],
                "L": last["L"],
                "I": last["I"],
                "A": last["A"],
                "rates": last.get("rates"),
                "relative_rates": last.get("relative_rates"),
                "weights": last.get("weights"),
                "weight_meta": last.get("weight_meta"),
                "asset_classes": last.get("asset_classes"),
                "meta": last.get("meta"),
                "formula_version": last.get("formula_version"),
                "baseline_id": last.get("baseline_id"),
            }
        elif last:
            state.unavailable_reason = "only_legacy_snapshots"
    except Exception as e:
        logger.warning("could not seed from DB: %s", e)

    await asyncio.sleep(config.STARTUP_DELAY_S)

    # Reuse a single HTTP client across runs (connection reuse / performance).
    async with httpx.AsyncClient(follow_redirects=True) as client:
        while True:
            state.last_run = datetime.now(timezone.utc)
            state.next_run = state.last_run + timedelta(seconds=config.UPDATE_INTERVAL_S)
            try:
                await compute_once(client)
            except Exception as e:  # never let the loop die
                state.last_error = str(e)
                logger.error("scheduler run failed: %s", e)
            await asyncio.sleep(config.UPDATE_INTERVAL_S)

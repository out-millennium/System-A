# grm-service/test_baseline.py
#
# Tests for the persistent-baseline GRM fix (Doc 05 §6): the systemic index must
# be computed on RELATIVE rates p_i(t)/p_i(t0) against a fixed, persistent
# baseline — not on absolute USD-relative levels.
#
# These are hermetic: each test uses a fresh temp SQLite DB and a MOCKED oracle
# (no network). We drive the real scheduler.compute_once so the full pipeline
# (aggregate -> baseline -> relative -> compute_grm -> snapshot) is exercised.

import asyncio
import importlib
import os
import tempfile

import pytest


def _fresh_env():
    """Point the service at a brand-new temp DB and reload the modules that read
    config.DB_PATH at import time, returning the reloaded modules."""
    d = tempfile.mkdtemp()
    os.environ["GRM_DB_PATH"] = os.path.join(d, "grm.db")
    # These baseline tests exercise a named basket. The production default is
    # the dynamic all_weighted universe; this fixture supplies deterministic
    # deterministic source-derived weights for the dynamic source universe.
    os.environ["GRM_SYSTEMIC_BASKET"] = "all_weighted"
    import config as cfg
    importlib.reload(cfg)
    import grm_math
    importlib.reload(grm_math)
    import baskets
    importlib.reload(baskets)
    import storage
    importlib.reload(storage)
    import baseline
    importlib.reload(baseline)
    import oracles
    importlib.reload(oracles)
    import scheduler
    importlib.reload(scheduler)
    storage.init_db()
    return cfg, grm_math, storage, baseline, oracles, scheduler


def _agg(oracles, medians):
    """Build an AggregateResult with full, healthy meta for the given medians."""
    meta = {s: {"sources": 3, "min": r, "max": r, "spread": 0.0, "flagged": False}
            for s, r in medians.items()}
    statuses = [oracles.SourceStatus("mock", True, 5, len(medians), "")]
    fixed_weights = {"EUR": 0.30, "GBP": 0.20, "JPY": 0.20, "CNY": 0.15, "CHF": 0.15}
    weight_rows = [
        oracles.WeightObservation(symbol=symbol, value_usd=weight, source="mock", asset_class="currency")
        for symbol, weight in fixed_weights.items()
    ]
    weight_statuses = [oracles.WeightSourceStatus("mock-weight", True, 5, len(weight_rows), "")]
    weight_aggregate = oracles.aggregate_weights(
        weight_rows, statuses=weight_statuses, sources_total=1, sources_responded=1
    )
    return oracles.AggregateResult(
        medians=dict(medians), meta=meta, statuses=statuses,
        sources_total=1, sources_responded=1, weights=weight_aggregate,
    )


def _run(scheduler, oracles, medians):
    """Patch oracles.collect to return the given medians and run one cycle."""
    async def fake_collect(client=None):
        return _agg(oracles, medians)
    scheduler.oracles.collect = fake_collect  # type: ignore
    return asyncio.run(scheduler.compute_once())


# The deterministic fixture symbols (must all be present for a valid snapshot).
FULL = {"EUR": 0.90, "GBP": 0.80, "JPY": 150.0, "CNY": 7.0, "CHF": 0.88}


def test_first_valid_snapshot_creates_baseline_and_is_identity():
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    snap = _run(scheduler, oracles, FULL)
    assert snap is not None
    assert snap["L"] == pytest.approx(0.0)
    assert snap["I"] == pytest.approx(1.0)
    assert snap["A"] == pytest.approx(1.0)
    # A baseline now exists and equals the first absolute rates.
    bl = baseline.get_active_baseline(scheduler.systemic_basket_key())
    assert bl is not None and bl["rates"] == FULL
    assert snap["baseline_id"] == bl["baseline_id"]
    assert snap["formula_version"] == 3


def test_second_snapshot_unchanged_rates_is_identity():
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)
    snap2 = _run(scheduler, oracles, FULL)  # identical rates
    assert snap2["I"] == pytest.approx(1.0)
    assert snap2["A"] == pytest.approx(1.0)


def test_single_rate_change_moves_index():
    _, gm, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)
    changed = dict(FULL)
    changed["EUR"] = FULL["EUR"] * 1.10  # EUR/USD up 10%
    snap = _run(scheduler, oracles, changed)
    # Only EUR moved; with weight 0.30, L = 0.30 * ln(1.10) > 0.
    assert snap["L"] == pytest.approx(0.30 * gm.math.log(1.10), rel=1e-6)
    assert snap["I"] > 1.0 and snap["A"] < 1.0


def test_absolute_level_shift_alone_does_not_break_baseline_meaning():
    # The baseline is fixed at t0. If EVERY current rate is exactly the baseline
    # (no relative change), the index stays identity regardless of the absolute
    # level chosen for t0 — proving GRM reflects CHANGE, not absolute level.
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)
    snap = _run(scheduler, oracles, FULL)
    assert snap["I"] == pytest.approx(1.0) and snap["A"] == pytest.approx(1.0)
    # Contrast: a DIFFERENT baseline level with the same relative state (all 1)
    # would also give identity — the level itself never enters L.
    _, _, storage2, baseline2, oracles2, scheduler2 = _fresh_env()
    HIGH = {k: v * 3.0 for k, v in FULL.items()}  # very different absolute level
    _run(scheduler2, oracles2, HIGH)
    snap2 = _run(scheduler2, oracles2, HIGH)
    assert snap2["I"] == pytest.approx(1.0) and snap2["A"] == pytest.approx(1.0)


def test_baseline_persists_across_restart():
    cfg, _, storage, baseline, oracles, scheduler = _fresh_env()
    snap1 = _run(scheduler, oracles, FULL)
    bl_id = snap1["baseline_id"]
    # Simulate a restart: reload scheduler/storage/baseline WITHOUT changing the
    # DB path, then compute again. The baseline must be the SAME one.
    importlib.reload(storage)
    importlib.reload(baseline)
    importlib.reload(scheduler)
    storage.init_db()
    snap2 = _run(scheduler, oracles, FULL)
    assert snap2["baseline_id"] == bl_id
    assert baseline.get_active_baseline(scheduler.systemic_basket_key())["baseline_id"] == bl_id


def test_baseline_not_replaced_by_new_first_rate():
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)
    bl1 = baseline.get_active_baseline(scheduler.systemic_basket_key())
    # A later cycle with different rates must NOT replace the baseline.
    _run(scheduler, oracles, {k: v * 2 for k, v in FULL.items()})
    bl2 = baseline.get_active_baseline(scheduler.systemic_basket_key())
    assert bl2["baseline_id"] == bl1["baseline_id"]
    assert bl2["rates"] == bl1["rates"]  # p_i(t0) unchanged


def test_dynamic_universe_uses_only_rate_and_weight_covered_assets():
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    partial = {"EUR": 0.9, "GBP": 0.8}  # only these assets have current rates
    snap = _run(scheduler, oracles, partial)
    assert snap is not None
    assert set(snap["weights"]) == {"EUR", "GBP"}
    assert baseline.get_active_baseline(scheduler.systemic_basket_key()) is not None


def test_incompatible_baseline_is_unavailable_not_silently_rescaled():
    _, gm, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)  # establishes a v3 baseline
    # Corrupt the stored baseline's formula_version to simulate incompatibility.
    import sqlite3
    conn = sqlite3.connect(os.environ["GRM_DB_PATH"])
    conn.execute("UPDATE grm_baseline SET formula_version = 999;")
    conn.commit(); conn.close()
    snap = _run(scheduler, oracles, FULL)
    assert snap is None
    assert scheduler.state.unavailable_reason == "baseline_incompatible"


def test_snapshot_records_formula_and_baseline_version():
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)
    latest = storage.latest_snapshot()
    assert latest["formula_version"] == 3
    assert latest["baseline_id"] is not None
    assert latest["relative_rates"] is not None  # what compute_grm consumed


def test_weight_normalization_still_applies():
    # Change two assets so the weighted mean is exercised, and verify the
    # returned normalized weights sum to 1 (existing behaviour preserved).
    _, gm, storage, baseline, oracles, scheduler = _fresh_env()
    _run(scheduler, oracles, FULL)
    snap = _run(scheduler, oracles, {**FULL, "EUR": FULL["EUR"] * 1.05,
                                     "GBP": FULL["GBP"] * 0.95})
    assert sum(snap["weights"].values()) == pytest.approx(1.0)


def test_last_accepted_weights_persist_when_weight_sources_are_silent():
    cfg, _, storage, baseline, oracles, scheduler = _fresh_env()
    cfg.config.SYSTEMIC_BASKET_ID = "all_weighted"
    first = _run(scheduler, oracles, FULL)
    assert first is not None
    previous_weights = dict(first["weights"])

    async def silent_collect(client=None):
        meta = {
            symbol: {"sources": 1, "min": rate, "max": rate, "spread": 0.0, "flagged": False}
            for symbol, rate in FULL.items()
        }
        empty_weights = oracles.WeightAggregateResult(
            weights={}, meta={}, observations={},
            statuses=[oracles.WeightSourceStatus("weight-source", False, 5, 0, "timeout")],
            sources_total=1, sources_responded=0,
        )
        return oracles.AggregateResult(
            medians=dict(FULL), meta=meta,
            statuses=[oracles.SourceStatus("rate-source", True, 5, len(FULL), "")],
            sources_total=1, sources_responded=1, weights=empty_weights,
        )

    scheduler.oracles.collect = silent_collect  # type: ignore
    second = asyncio.run(scheduler.compute_once())
    assert second is not None
    assert second["weights"] == previous_weights
    assert all(item.get("last_known") for item in second["weight_meta"].values() if item.get("in_grm"))


def test_dynamic_basket_freezes_weighted_rate_universe_and_freezes_disputed_asset():
    cfg, _, storage, baseline, oracles, scheduler = _fresh_env()
    cfg.config.SYSTEMIC_BASKET_ID = "all_weighted"

    def dynamic_aggregate(medians, values):
        rate_meta = {
            symbol: {"sources": 1, "min": rate, "max": rate, "spread": 0.0, "flagged": False}
            for symbol, rate in medians.items()
        }
        weight_rows = [
            oracles.WeightObservation(symbol, value, source, "crypto")
            for symbol, source_values in values.items()
            for source, value in source_values
        ]
        weight_statuses = [
            oracles.WeightSourceStatus(source, True, 5, len(values), "")
            for source in sorted({source for rows in values.values() for source, _ in rows})
        ]
        weight_aggregate = oracles.aggregate_weights(
            weight_rows,
            statuses=weight_statuses,
            sources_total=len(weight_statuses),
            sources_responded=len(weight_statuses),
        )
        return oracles.AggregateResult(
            medians=medians, meta=rate_meta, statuses=[], sources_total=0,
            sources_responded=0, weights=weight_aggregate,
        )

    async def first_collect(client=None):
        return dynamic_aggregate(
            {"AAA": 1.0, "BBB": 2.0},
            {"AAA": [("one", 100.0), ("two", 105.0)],
             "BBB": [("one", 100.0), ("two", 100.0)]},
        )

    scheduler.oracles.collect = first_collect  # type: ignore
    first = asyncio.run(scheduler.compute_once())
    assert first is not None
    assert set(first["weights"]) == {"AAA", "BBB"}
    baseline_id = first["baseline_id"]

    async def second_collect(client=None):
        return dynamic_aggregate(
            {"AAA": 1.1, "BBB": 2.0, "CCC": 3.0},
            {"AAA": [("one", 100.0), ("two", 140.0)],  # >10% -> frozen
             "BBB": [("one", 100.0)],
             "CCC": [("one", 1000.0)]},
        )

    scheduler.oracles.collect = second_collect  # type: ignore
    second = asyncio.run(scheduler.compute_once())
    assert second is not None
    assert second["baseline_id"] == baseline_id
    # AAA remains in the index and keeps its previously accepted absolute value
    # instead of jumping to the conflicting current observations.
    assert second["weights"]["AAA"] > 0
    assert second["weights"]["BBB"] > 0
    assert second["weight_meta"]["AAA"]["included"] is True
    assert second["weight_meta"]["AAA"]["stability_state"] == "frozen_conflict"
    assert second["weight_meta"]["AAA"]["frozen_value_usd"] == pytest.approx(102.5)
    # CCC is visible in diagnostics but cannot silently enter the frozen GRM.
    assert second["weight_meta"]["CCC"]["in_grm"] is False

    async def third_collect(client=None):
        return dynamic_aggregate(
            {"AAA": 1.2, "BBB": 2.0},
            {"AAA": [("one", 150.0), ("two", 152.0)],  # coherent again
             "BBB": [("one", 100.0)]},
        )

    scheduler.oracles.collect = third_collect  # type: ignore
    third = asyncio.run(scheduler.compute_once())
    assert third is not None
    assert third["weight_meta"]["AAA"]["stability_state"] == "accepted"
    assert third["weight_meta"]["AAA"]["value_usd"] == pytest.approx(151.0)


def test_legacy_snapshot_not_seeded_as_trusted():
    # A pre-baseline (formula_version=1) snapshot must not be presented as a
    # trusted current GRM on restart-seed.
    _, _, storage, baseline, oracles, scheduler = _fresh_env()
    # Insert a legacy snapshot directly.
    storage.save_snapshot(
        ts="2020-01-01T00:00:00Z", basket_id="all_weighted:v1",
        weights={"EUR": 1.0}, rates={"EUR": 0.9}, medians={"EUR": 0.9},
        sources=[], meta={}, L=0.5, I=1.6, A=0.6,
        formula_version=1, baseline_id=None, relative_rates=None,
    )
    latest = storage.latest_snapshot()
    assert latest["formula_version"] == 1  # stays historical, not rewritten

# grm-service/test_stage1.py
#
# Unit tests for the Stage-1 automation modules: oracle aggregation quality,
# basket resolution, and SQLite storage. Pure/fast; no network.

import os
import tempfile

import pytest

import oracles
import baskets
from baskets import Asset, resolve_rate


# --- Oracle aggregation / quality control ---------------------------------

def test_reject_outliers_drops_far_value():
    # One wild value among tight cluster should be dropped (MAD-based).
    vals = [1.00, 1.01, 0.99, 1.02, 50.0]
    kept = oracles._reject_outliers(vals)
    assert 50.0 not in kept
    assert len(kept) == 4


def test_reject_outliers_keeps_when_too_few():
    assert oracles._reject_outliers([1.0, 2.0]) == [1.0, 2.0]


def test_aggregate_medians_and_meta():
    per = {"EUR": [0.90, 0.92, 0.91], "JPY": [150.0, 151.0]}
    medians, meta = oracles.aggregate(per)
    assert medians["EUR"] == pytest.approx(0.91)
    assert meta["EUR"]["sources"] == 3
    assert meta["EUR"]["min"] == 0.90 and meta["EUR"]["max"] == 0.92
    assert "flagged" in meta["EUR"]


def test_aggregate_flags_high_spread():
    # Big disagreement -> spread exceeds default threshold -> flagged True.
    per = {"XXX": [1.0, 2.0, 3.0]}
    _, meta = oracles.aggregate(per)
    assert meta["XXX"]["flagged"] is True


def test_weight_sources_are_averaged_within_ten_percent():
    rows = [
        oracles.WeightObservation("BTC", 100.0, "source-a", "crypto"),
        oracles.WeightObservation("BTC", 108.0, "source-b", "crypto"),
        oracles.WeightObservation("ETH", 50.0, "source-a", "crypto"),
        oracles.WeightObservation("ETH", 50.0, "source-b", "crypto"),
    ]
    result = oracles.aggregate_weights(rows)
    assert result.meta["BTC"]["spread"] == pytest.approx(8 / 104)
    assert result.meta["BTC"]["included"] is True
    assert result.meta["BTC"]["value_usd"] == pytest.approx(104.0)
    assert result.weights["BTC"] == pytest.approx(104 / 154)


def test_weight_threshold_is_inclusive_at_ten_percent():
    rows = [
        oracles.WeightObservation("BTC", 95.0, "source-a", "crypto"),
        oracles.WeightObservation("BTC", 105.0, "source-b", "crypto"),
    ]
    result = oracles.aggregate_weights(rows)
    assert result.meta["BTC"]["spread"] == pytest.approx(0.10)
    assert result.meta["BTC"]["included"] is True


def test_weight_asset_with_large_source_disagreement_is_frozen_not_excluded():
    rows = [
        oracles.WeightObservation("BTC", 100.0, "source-a", "crypto"),
        oracles.WeightObservation("BTC", 140.0, "source-b", "crypto"),
        oracles.WeightObservation("ETH", 50.0, "source-a", "crypto"),
    ]
    result = oracles.aggregate_weights(rows)
    assert result.meta["BTC"]["flagged"] is True
    assert result.meta["BTC"]["included"] is True
    assert result.meta["BTC"]["stability_state"] == "provisional_conflict"
    assert result.meta["BTC"]["value_usd"] == pytest.approx(120.0)
    assert result.weights["BTC"] == pytest.approx(120 / 170)


def test_imf_broad_money_parser_reads_latest_domestic_observation():
    data = """STRUCTURE[;],STRUCTURE_ID,ACTION,COUNTRY,INDICATOR,UNIT,FREQUENCY,TIME_PERIOD,OBS_VALUE,SCALE\ndataflow,IMF.STA:MFS_MA(10.0.1),R,RUS,BM_MAI,XDC,M,2025-M12,80000000000000,6\n"""
    parser = oracles._imf_broad_money_parser("RUB", "RUS", "XDC")
    rows = parser(data)
    assert rows[0]["symbol"] == "RUB"
    assert rows[0]["value_local"] == pytest.approx(80000000000000)
    assert rows[0]["method"] == "imf_ifs_59m_broad_money"


def test_ecb_m3_parser_converts_millions_to_euro():
    data = """KEY,TIME_PERIOD,OBS_VALUE,UNIT_MULT\nBSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E,2025-12,16000000,6\n"""
    rows = oracles._ecb_m3_parser(data)
    assert rows[0]["symbol"] == "EUR"
    assert rows[0]["value_local"] == pytest.approx(16000000000000)
    assert rows[0]["method"] == "ecb_m3"


def test_local_official_weight_is_converted_using_aggregated_fx_rate():
    observation = oracles.WeightObservation(
        "JPY", 1600000000000000, "imf", "currency",
        method="imf_ifs_59m_broad_money", value_local=1600000000000000,
        currency="JPY", series_unit="XDC",
    )
    converted = oracles._convert_local_weight_observations([observation], {"JPY": 160.0})
    assert converted[0].value_usd == pytest.approx(10000000000000)


def test_relative_weight_to_issued_usd_is_recorded_when_usd_is_present():
    result = oracles.aggregate_weights([
        oracles.WeightObservation("USD", 100.0, "supply-a", "currency"),
        oracles.WeightObservation("BTC", 25.0, "market-a", "crypto"),
    ])
    assert result.meta["BTC"]["relative_to_usd"] == pytest.approx(0.25)
    assert result.reference_usd_value == pytest.approx(100.0)


def test_crypto_weight_falls_back_to_supply_times_usd_price():
    rows = oracles._coingecko_weight_parser([
        {
            "symbol": "TST",
            "current_price": 2.5,
            "market_cap": None,
            "circulating_supply": 40.0,
        }
    ])
    assert rows[0]["value_usd"] == pytest.approx(100.0)
    assert rows[0]["method"] == "supply_times_usd_price"


def test_generic_weight_feed_accepts_supply_times_price_fallback():
    rows = oracles._generic_weight_parser({
        "weights": {"ASSET": {"supply": 12, "rate_usd": 3}}
    })
    assert rows[0]["value_usd"] == pytest.approx(36.0)
    assert rows[0]["method"] == "supply_times_usd_price"


# --- Baskets & resolvers ---------------------------------------------------

def test_no_hard_coded_weight_presets_are_registered():
    assert not hasattr(baskets, "list_baskets")
    assert not hasattr(baskets, "get_basket")


def test_currency_resolver_reads_medians():
    a = Asset(symbol="EUR", asset_class="currency")
    assert resolve_rate(a, {"EUR": 0.9}) == 0.9
    assert resolve_rate(a, {}) is None


def test_unknown_asset_class_returns_none():
    a = Asset(symbol="ZZZ", asset_class="does_not_exist")
    assert resolve_rate(a, {"ZZZ": 1.0}) is None


def test_extension_point_new_class_without_touching_code():
    # Registering a resolver for a brand-new class is all it takes to extend.
    baskets.register_resolver("testclass", lambda asset, m: 42.0)
    a = Asset(symbol="ANY", asset_class="testclass")
    assert resolve_rate(a, {}) == 42.0


# --- Storage (SQLite) ------------------------------------------------------

def test_storage_roundtrip(monkeypatch):
    import shutil
    import storage
    from config import config

    # Manual temp dir cleaned with ignore_errors: on Windows a lingering SQLite
    # WAL/-shm file can briefly hold a lock after the connection closes, which
    # would otherwise make automatic cleanup raise PermissionError AFTER all the
    # assertions already passed. The test's job is the round-trip, not teardown.
    d = tempfile.mkdtemp()
    try:
        monkeypatch.setattr(config, "DB_PATH", os.path.join(d, "t.db"))
        storage.init_db()
        storage.save_snapshot(
            ts="2026-01-01T00:00:00+00:00",
            basket_id="all_weighted:v1",
            weights={"EUR": 1.0},
            rates={"EUR": 0.9},
            medians={"EUR": 0.9},
            sources=[{"source": "s1", "ok": True, "latency_ms": 12, "currencies": 1, "error": ""}],
            meta={"EUR": {"sources": 1}},
            L=0.0, I=1.0, A=1.0,
            weight_meta={"EUR": {"value_usd": 100.0, "included": True}},
            weight_sources=[{"source": "w1", "ok": True}],
            weight_observations={"EUR": [{"source": "w1", "value_usd": 100.0}]},
            asset_classes={"EUR": "currency"},
        )
        storage.save_source_events(
            "2026-01-01T00:00:00+00:00",
            [{"source": "s1", "ok": True, "latency_ms": 12, "currencies": 1, "error": ""}],
        )
        hist = storage.history()
        assert len(hist) == 1 and hist[0]["I"] == 1.0
        snap = storage.latest_snapshot()
        assert snap["basket_id"] == "all_weighted:v1"
        assert snap["rates"] == {"EUR": 0.9}
        assert snap["weight_meta"]["EUR"]["value_usd"] == 100.0
        assert snap["asset_classes"]["EUR"] == "currency"
        events = storage.recent_source_events()
        assert events and events[0]["source"] == "s1"
    finally:
        shutil.rmtree(d, ignore_errors=True)

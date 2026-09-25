# grm-service/test_grm_math.py
#
# Unit tests for the GRM index math. Framework-free (imports grm_math only), so
# they run with a plain `pytest` — no FastAPI, no network, no DB.

import math

import pytest

from grm_math import compute_grm, median, parse_rates_key, parse_fawaz, is_number


def test_all_rates_one_gives_identity():
    """If every asset is unchanged (rate = 1), L = 0 and I = A = 1."""
    out = compute_grm({"a": 1.0, "b": 1.0}, {"a": 1.0, "b": 1.0})
    assert out["L"] == pytest.approx(0.0)
    assert out["I"] == pytest.approx(1.0)
    assert out["A"] == pytest.approx(1.0)


def test_weights_are_normalized():
    out = compute_grm({"a": 2.0, "b": 2.0}, {"a": 3.0, "b": 1.0})
    assert out["weights"]["a"] == pytest.approx(0.75)
    assert out["weights"]["b"] == pytest.approx(0.25)


def test_I_and_A_are_reciprocal():
    out = compute_grm({"a": 1.5, "b": 0.8}, {"a": 1.0, "b": 1.0})
    assert out["I"] * out["A"] == pytest.approx(1.0)


def test_known_value_single_asset():
    """Single asset, rate = e => L = 1, I = e, A = 1/e."""
    out = compute_grm({"a": math.e}, {"a": 1.0})
    assert out["L"] == pytest.approx(1.0)
    assert out["I"] == pytest.approx(math.e)
    assert out["A"] == pytest.approx(1.0 / math.e)


def test_empty_inputs_raise():
    with pytest.raises(ValueError):
        compute_grm({}, {})
    with pytest.raises(ValueError):
        compute_grm({"a": 1.0}, {})


def test_nonpositive_total_weight_raises():
    with pytest.raises(ValueError):
        compute_grm({"a": 1.0}, {"a": 0.0})


def test_nonpositive_rates_are_skipped():
    """A zero/negative rate must not blow up log(); it is simply skipped."""
    out = compute_grm({"a": math.e, "b": 0.0}, {"a": 1.0, "b": 1.0})
    # Only 'a' contributes: L = 0.5 * ln(e) = 0.5
    assert out["L"] == pytest.approx(0.5)


# ---- oracle helpers -------------------------------------------------------

def test_median_odd_and_even():
    assert median([3, 1, 2]) == 2                 # odd -> middle
    assert median([1, 2, 3, 4]) == pytest.approx(2.5)  # even -> avg of middle
    assert median([5]) == 5


def test_median_empty_raises():
    with pytest.raises(ValueError):
        median([])


def test_is_number():
    assert is_number("1.5") and is_number(2) and is_number(0)
    assert not is_number("x") and not is_number(None)


def test_parse_rates_key_uppercases_and_filters():
    out = parse_rates_key({"rates": {"eur": 0.9, "gbp": "0.8", "bad": None}})
    assert out == {"EUR": 0.9, "GBP": 0.8}


def test_parse_rates_key_handles_missing():
    assert parse_rates_key({}) == {}
    assert parse_rates_key({"rates": {}}) == {}


def test_parse_fawaz_shape():
    out = parse_fawaz({"usd": {"eur": 0.92, "jpy": 150}})
    assert out == {"EUR": 0.92, "JPY": 150.0}


def test_parsers_agree_on_currency_code_case():
    a = parse_rates_key({"rates": {"eur": 0.9}})
    b = parse_fawaz({"usd": {"eur": 0.9}})
    assert set(a) == set(b) == {"EUR"}

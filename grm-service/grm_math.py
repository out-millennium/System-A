# grm-service/grm_math.py
#
# Pure GRM index math + oracle helpers, framework-free so they can be unit-tested
# without FastAPI or a running service. Implements the formulas from spec
# document 05, §6, plus the median/parsers used by the multi-source oracle.

import math

# Version of the GRM computation as a whole (formula + how inputs are prepared).
# Bump this ONLY when the mathematical meaning changes. It is written into every
# snapshot so a stored result can always be tied to the exact formula that
# produced it. History from older versions is kept as-is (never recomputed).
#
#   v1  — LEGACY (pre-baseline): compute_grm received ABSOLUTE USD-relative
#         rates as if they were already relative. Snapshots created before the
#         baseline fix carry formula_version = 1 (marked historical).
#   v2  — inputs are relative rates p_i(t)/p_i(t0) built against a persistent
#         baseline; first valid snapshot yields L=0, I=1, A=1.
#   v3  — CURRENT: v2 relative-rate calculation plus source-derived dynamic
#         weights and the all-weighted asset universe. Every snapshot records the
#         accepted weights and their source diagnostics.
FORMULA_VERSION = 3
LEGACY_FORMULA_VERSION = 1


def build_relative_rates(
    current: dict[str, float], baseline: dict[str, float]
) -> "dict[str, float] | None":
    """Turn ABSOLUTE aggregated rates into RELATIVE ones p_i(t)/p_i(t0).

    `current` and `baseline` are {symbol: absolute_usd_relative_rate}. Returns
    {symbol: current/baseline} for every symbol present (and positive) in BOTH.
    Returns None if the two sets don't cover the same symbols (an incomplete or
    incompatible relative set must NOT silently produce a partial GRM) or if any
    baseline rate is non-positive.

    This is the ONE place the abstraction changes from absolute to relative;
    compute_grm() below only ever sees relative rates.
    """
    if not current or not baseline:
        return None
    # Every baseline asset must have a current rate (and vice-versa) to build a
    # complete, comparable relative set against the fixed t0.
    if set(current.keys()) != set(baseline.keys()):
        return None
    out: dict[str, float] = {}
    for sym, base in baseline.items():
        cur = current.get(sym)
        if base is None or cur is None:
            return None
        if base <= 0 or cur <= 0:
            return None
        out[sym] = cur / base
    return out


def is_number(v) -> bool:
    try:
        float(v)
        return True
    except (TypeError, ValueError):
        return False


def median(values: list[float]) -> float:
    """Median of a non-empty list. Even count -> average of the two middle."""
    s = sorted(values)
    n = len(s)
    if n == 0:
        raise ValueError("median of empty list")
    mid = n // 2
    if n % 2:
        return s[mid]
    return (s[mid - 1] + s[mid]) / 2


def parse_rates_key(data: dict) -> dict:
    """open.er-api.com / frankfurter: { "rates": { "EUR": 0.92, ... } }."""
    rates = (data or {}).get("rates") or {}
    return {str(k).upper(): float(v) for k, v in rates.items() if is_number(v)}


def parse_fawaz(data: dict) -> dict:
    """@fawazahmed0/currency-api: { "usd": { "eur": 0.92, ... } } (lowercase)."""
    usd = (data or {}).get("usd") or {}
    return {str(k).upper(): float(v) for k, v in usd.items() if is_number(v)}


def compute_grm(rates: dict[str, float], weights: dict[str, float]) -> dict:
    """
    rates:   {asset_id: relative_rate}  — observed p_i(t) / p_i(t0)
    weights: {asset_id: w_i}            — (un-normalized) weights
    Returns L(t), I(t) = exp(L), A(t) = exp(-L) and the normalized weights.
    """
    if not rates or not weights:
        raise ValueError("rates and weights must not be empty")

    asset_ids = list(rates.keys())

    total_w = sum(weights.get(i, 0) for i in asset_ids)
    if total_w <= 0:
        raise ValueError("sum of weights must be positive")

    norm_weights = {i: weights.get(i, 0) / total_w for i in asset_ids}

    # L(t) = Σ w_i * ln(p_i(t) / p_i(t0)) — only positive rates contribute.
    L = sum(norm_weights[i] * math.log(rates[i]) for i in asset_ids if rates[i] > 0)

    I = math.exp(L)
    A = math.exp(-L)

    return {
        "L": L,
        "I": I,
        "A": A,
        "weights": norm_weights,
    }

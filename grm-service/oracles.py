# grm-service/oracles.py
#
# Professional Oracle Aggregator (Stage 1, requirement 2).
#
# Design:
#   - Each data source is an independent ADAPTER (OracleSource) with its own URL,
#     response parser and timeout. Adding/removing a source is a one-line change.
#   - Sources are queried in PARALLEL (asyncio.gather); a failing source is
#     isolated and never blocks the others (auto availability detection).
#   - Per-asset values are cleaned: sanity bounds + MAD-based outlier rejection,
#     then aggregated by MEDIAN. Quality meta (spread, source count) is attached.
# #   - Weight sources are separate from rate sources. A rate oracle does not become
#     a weight oracle merely because it returns the same symbol. Weight sources
#     return comparable positive USD values (market value, monetary aggregate,
#     or another explicitly documented value). Disagreement is a freeze signal,
#     not an exclusion decision.
#   - Every source attempt yields a status record (ok/error/latency) suitable for
#     an error journal (persisted by storage.py).
#
# All of this is external to System A — it only produces external observations.

import asyncio
import csv
import io
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Tuple

import httpx

from config import config
from grm_math import median, parse_rates_key, parse_fawaz


# --- Source adapters -------------------------------------------------------

@dataclass(frozen=True)
class OracleSource:
    """One independent, free, no-API-key source of USD-relative FX rates."""
    name: str
    url: str
    parser: Callable[[dict], Dict[str, float]]
    timeout_s: float = config.ORACLE_TIMEOUT_S


@dataclass(frozen=True)
class WeightSource:
    """A source of comparable absolute asset values denominated in USD.

    The parser returns dictionaries with at least ``symbol`` and ``value_usd``.
    Custom HTTP sources use the generic parser and should publish an absolute
    USD value, not a pre-normalized fraction, unless they also document a common
    scale. Relative/normalized weights are calculated by this service; a large
    disagreement is recorded and stabilized by the scheduler rather than used
    to delete the asset.
    """
    name: str
    url: str
    parser: Callable[[Any], List[dict]]
    timeout_s: float = config.WEIGHT_TIMEOUT_S
    response_format: str = "json"


# The registry of active rate sources. Independent providers, each with its own
# JSON shape handled by a dedicated parser (see grm_math.parse_*).
SOURCES: List[OracleSource] = [
    OracleSource("open-erapi", "https://open.er-api.com/v6/latest/USD", parse_rates_key),
    OracleSource("frankfurter", "https://api.frankfurter.dev/v1/latest?from=USD", parse_rates_key),
    OracleSource(
        "fawaz-jsdelivr",
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
        parse_fawaz,
    ),
]


# --- Weight source parsers -------------------------------------------------

def _positive_number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if config.RATE_MIN < number < config.WEIGHT_MAX_VALUE:
        return number
    return None


def _coingecko_weight_parser(data: Any) -> List[dict]:
    """Parse CoinGecko ``/coins/markets`` rows.

    CoinGecko normally publishes market_cap. If it is absent, the value is
    calculated from circulating supply (or total supply) multiplied by the USD
    price, exactly as required for a crypto/asset fallback. Duplicate symbols
    are reduced to the largest observed value because symbols are not globally
    unique on crypto markets.
    """
    if not isinstance(data, list):
        return []
    by_symbol: Dict[str, dict] = {}
    for row in data:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        price = _positive_number(row.get("current_price"))
        market_cap = _positive_number(row.get("market_cap"))
        circulating = _positive_number(row.get("circulating_supply"))
        total = _positive_number(row.get("total_supply"))
        supply = circulating or total
        method = "reported_market_cap"
        value = market_cap
        supply_basis = "circulating_supply" if circulating else ("total_supply" if total else "")
        if value is None and supply is not None and price is not None:
            value = supply * price
            method = "supply_times_usd_price"
        if value is None:
            continue
        observation = {
            "symbol": symbol,
            "value_usd": value,
            "asset_class": "crypto",
            "method": method,
            "rate_usd": price,
            "supply": supply,
            "supply_basis": supply_basis,
            "source_asset_id": row.get("id"),
        }
        previous = by_symbol.get(symbol)
        if previous is None or value > float(previous["value_usd"]):
            by_symbol[symbol] = observation
    return list(by_symbol.values())


def _coincap_weight_parser(data: Any) -> List[dict]:
    """Parse CoinCap ``/v2/assets`` rows.

    CoinCap exposes marketCapUsd in normal operation. The supply-times-price
    calculation is deliberately retained as a transparent fallback for assets
    where that field is missing.
    """
    rows = data.get("data") if isinstance(data, dict) else None
    if not isinstance(rows, list):
        return []
    by_symbol: Dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        symbol = str(row.get("symbol", "")).strip().upper()
        if not symbol:
            continue
        price = _positive_number(row.get("priceUsd"))
        market_cap = _positive_number(row.get("marketCapUsd"))
        supply = _positive_number(row.get("supply"))
        method = "reported_market_cap"
        value = market_cap
        if value is None and supply is not None and price is not None:
            value = supply * price
            method = "supply_times_usd_price"
        if value is None:
            continue
        observation = {
            "symbol": symbol,
            "value_usd": value,
            "asset_class": "crypto",
            "method": method,
            "rate_usd": price,
            "supply": supply,
            "supply_basis": "reported_supply" if supply is not None else "",
            "source_asset_id": row.get("id"),
        }
        previous = by_symbol.get(symbol)
        if previous is None or value > float(previous["value_usd"]):
            by_symbol[symbol] = observation
    return list(by_symbol.values())


def _generic_weight_parser(data: Any) -> List[dict]:
    """Parse a documented custom weight feed.

    Supported shapes are intentionally small and explicit:

    ``{"weights": {"EUR": 123, "BTC": {"value_usd": 456}}}``
    or ``[{"symbol": "EUR", "weight_usd": 123, "asset_class": "currency"}]``.

    A row may instead provide ``supply`` and ``rate_usd``; then the same
    supply-times-price fallback is applied. This makes custom fiat/commodity
    feeds usable without pretending that an FX-rate-only source contains supply
    information.
    """
    rows: List[dict] = []
    if isinstance(data, dict) and isinstance(data.get("weights"), dict):
        for symbol, value in data["weights"].items():
            if isinstance(value, dict):
                row = {"symbol": symbol, **value}
            else:
                row = {"symbol": symbol, "value_usd": value}
            rows.append(row)
    elif isinstance(data, list):
        rows = [row for row in data if isinstance(row, dict)]
    elif isinstance(data, dict) and isinstance(data.get("data"), list):
        rows = [row for row in data["data"] if isinstance(row, dict)]

    by_symbol: Dict[str, dict] = {}
    for row in rows:
        symbol = str(row.get("symbol") or row.get("code") or row.get("asset") or "").strip().upper()
        if not symbol:
            continue
        value = _positive_number(
            row.get("value_usd", row.get("weight_usd", row.get("market_cap_usd", row.get("weight"))))
        )
        price = _positive_number(row.get("rate_usd", row.get("price_usd", row.get("price"))))
        supply = _positive_number(
            row.get("circulating_supply", row.get("total_supply", row.get("supply")))
        )
        method = "reported_weight"
        supply_basis = ""
        if value is None and supply is not None and price is not None:
            value = supply * price
            method = "supply_times_usd_price"
            supply_basis = "circulating_or_total_supply"
        if value is None:
            continue
        observation = {
            "symbol": symbol,
            "value_usd": value,
            "asset_class": str(row.get("asset_class") or "asset"),
            "method": method,
            "rate_usd": price,
            "supply": supply,
            "supply_basis": supply_basis,
            "source_asset_id": row.get("id"),
        }
        previous = by_symbol.get(symbol)
        if previous is None or value > float(previous["value_usd"]):
            by_symbol[symbol] = observation
    return list(by_symbol.values())


def _csv_rows(data: Any) -> List[dict]:
    """Read an official CSV response while tolerating an empty data result."""
    if isinstance(data, bytes):
        data = data.decode("utf-8", errors="replace")
    if not isinstance(data, str) or not data.strip():
        return []
    return [row for row in csv.DictReader(io.StringIO(data)) if isinstance(row, dict)]


def _imf_broad_money_parser(symbol: str, country: str, unit: str) -> Callable[[Any], List[dict]]:
    """Create a parser for the official IMF MFS_MA replacement of IFS 59m.

    The current IMF SDMX flow calls the legacy broad-money series ``BM_MAI``.
    The observation is reported in the issuer's domestic currency (XDC), except
    for the US series which is available in USD. Conversion to USD is performed
    after the rate oracles have been aggregated, never by a hard-coded preset.
    """
    def parse(data: Any) -> List[dict]:
        rows = _csv_rows(data)
        if not rows:
            return []
        candidates = []
        for row in rows:
            if str(row.get("COUNTRY", "")).strip().upper() != country:
                continue
            if str(row.get("INDICATOR", "")).strip().upper() != "BM_MAI":
                continue
            value = _positive_number(row.get("OBS_VALUE"))
            period = str(row.get("TIME_PERIOD", "")).strip()
            if value is not None and period:
                candidates.append((period, value))
        if not candidates:
            return []
        period, value = max(candidates, key=lambda item: item[0])
        row = {
            "symbol": symbol,
            "asset_class": "currency",
            "method": "imf_ifs_59m_broad_money",
            "source_asset_id": f"{country}.BM_MAI.{unit}.M",
            "observation_period": period,
            "series_unit": unit,
        }
        if unit == "USD":
            row["value_usd"] = value
        else:
            row["value_local"] = value
            row["currency"] = symbol
        return [row]
    return parse


def _ecb_m3_parser(data: Any) -> List[dict]:
    """Parse the ECB euro-area M3 stock series (millions of euro)."""
    rows = _csv_rows(data)
    candidates = []
    for row in rows:
        value = _positive_number(row.get("OBS_VALUE"))
        period = str(row.get("TIME_PERIOD", "")).strip()
        if value is None or not period:
            continue
        try:
            multiplier = int(float(row.get("UNIT_MULT") or 0))
        except (TypeError, ValueError):
            multiplier = 0
        candidates.append((period, value * (10 ** multiplier)))
    if not candidates:
        return []
    period, value = max(candidates, key=lambda item: item[0])
    return [{
        "symbol": "EUR",
        "value_local": value,
        "currency": "EUR",
        "asset_class": "currency",
        "method": "ecb_m3",
        "source_asset_id": "BSI.M.U2.Y.V.M30.X.1.U2.2300.Z01.E",
        "observation_period": period,
        "series_unit": "EUR",
    }]


def _imf_country_entries() -> List[tuple[str, str, str]]:
    """Parse ``currency:country:unit`` entries from configuration."""
    entries: List[tuple[str, str, str]] = []
    for raw in config.IMF_IFS_CURRENCY_MAP.split(","):
        parts = [part.strip().upper() for part in raw.split(":")]
        if len(parts) != 3 or not all(parts):
            continue
        entries.append((parts[0], parts[1], parts[2]))
    return entries


def _official_fiat_weight_sources() -> List[WeightSource]:
    """Build the official IMF Broad Money and ECB M3 adapters."""
    sources: List[WeightSource] = []
    if config.IMF_IFS_ENABLED:
        base = (
            "https://api.imf.org/external/sdmx/3.0/data/dataflow/IMF.STA/"
            f"{config.IMF_IFS_DATAFLOW}/{config.IMF_IFS_VERSION}/"
        )
        for symbol, country, unit in _imf_country_entries():
            url = (
                f"{base}{country}.BM_MAI.{unit}.M"
                f"?startPeriod={config.IMF_IFS_START_PERIOD}"
            )
            sources.append(
                WeightSource(
                    f"imf-ifs-59m-{symbol.lower()}",
                    url,
                    _imf_broad_money_parser(symbol, country, unit),
                    response_format="csv",
                )
            )
    if config.ECB_M3_ENABLED:
        sources.append(WeightSource("ecb-m3-eur", config.ECB_M3_URL, _ecb_m3_parser, response_format="csv"))
    return sources


def _custom_weight_sources() -> List[WeightSource]:
    """Build optional generic feeds from GRM_WEIGHT_SOURCE_URLS.

    The environment value is a comma-separated URL list. These sources are
    optional because fiat money-supply feeds differ in units and licensing; a
    deployment must explicitly choose and document them instead of silently
    mixing incompatible macroeconomic definitions.
    """
    raw = config.WEIGHT_SOURCE_URLS.strip()
    if not raw:
        return []
    urls = [part.strip() for part in raw.split(",") if part.strip()]
    return [
        WeightSource(f"custom-weight-{index}", url, _generic_weight_parser)
        for index, url in enumerate(urls, start=1)
    ]


def configured_weight_sources() -> List[WeightSource]:
    """Return the active weight feeds (crypto defaults plus configured feeds)."""
    sources: List[WeightSource] = []
    if config.COINGECKO_ENABLED:
        for page in range(1, max(1, config.COINGECKO_PAGES) + 1):
            sources.append(
                WeightSource(
                    f"coingecko-markets-{page}",
                    "https://api.coingecko.com/api/v3/coins/markets"
                    f"?vs_currency=usd&order=market_cap_desc&per_page={config.COINGECKO_PER_PAGE}"
                    f"&page={page}&sparkline=false",
                    _coingecko_weight_parser,
                )
            )
    if config.COINCAP_ENABLED:
        sources.append(
            WeightSource(
                "coincap-assets",
                f"https://api.coincap.io/v2/assets?limit={config.COINCAP_LIMIT}",
                _coincap_weight_parser,
            )
        )
    sources.extend(_official_fiat_weight_sources())
    sources.extend(_custom_weight_sources())
    return sources


@dataclass
class SourceStatus:
    """Outcome of a single rate-source fetch (for the error journal / diagnostics)."""
    source: str
    ok: bool
    latency_ms: int
    currencies: int = 0
    error: str = ""


@dataclass
class WeightSourceStatus:
    """Outcome of a single weight-source fetch."""
    source: str
    ok: bool
    latency_ms: int
    assets: int = 0
    error: str = ""


@dataclass(frozen=True)
class WeightObservation:
    """One source observation before cross-source quality control."""
    symbol: str
    value_usd: float
    source: str
    asset_class: str = "asset"
    method: str = "reported_weight"
    rate_usd: float | None = None
    supply: float | None = None
    supply_basis: str = ""
    source_asset_id: str | None = None
    value_local: float | None = None
    currency: str | None = None
    observation_period: str | None = None
    series_unit: str | None = None


@dataclass
class WeightAggregateResult:
    """Weight values after source disagreement checks."""
    weights: Dict[str, float]                 # included SYMBOL -> normalized weight
    meta: Dict[str, dict]                     # all observed SYMBOL -> diagnostics
    observations: Dict[str, List[dict]]       # raw observations for reproduction
    statuses: List[WeightSourceStatus]
    sources_total: int
    sources_responded: int
    reference_usd_value: float | None = None


@dataclass
class AggregateResult:
    """Aggregated oracle output."""
    medians: Dict[str, float]                 # SYMBOL -> median USD-relative rate
    meta: Dict[str, dict]                     # SYMBOL -> {sources,min,max,spread,flagged}
    statuses: List[SourceStatus]              # per-rate-source outcomes
    sources_total: int
    sources_responded: int
    weights: WeightAggregateResult | None = None


# --- Fetching --------------------------------------------------------------

async def _fetch_one(client: httpx.AsyncClient, src: OracleSource) -> Tuple[SourceStatus, Dict[str, float]]:
    """Fetch + parse a single rate source, isolating all errors."""
    start = time.monotonic()
    try:
        res = await client.get(src.url, timeout=src.timeout_s)
        latency = int((time.monotonic() - start) * 1000)
        if res.status_code != 200:
            return SourceStatus(src.name, False, latency, error=f"HTTP {res.status_code}"), {}
        parsed = src.parser(res.json())
        # Keep only sane, positive rates.
        clean = {
            k: float(v)
            for k, v in parsed.items()
            if isinstance(v, (int, float)) and config.RATE_MIN < float(v) < config.RATE_MAX
        }
        if not clean:
            return SourceStatus(src.name, False, latency, error="empty/unexpected shape"), {}
        return SourceStatus(src.name, True, latency, currencies=len(clean)), clean
    except Exception as e:  # network / JSON / parser — isolated per source
        latency = int((time.monotonic() - start) * 1000)
        return SourceStatus(src.name, False, latency, error=str(e)[:200]), {}


async def _fetch_weight_one(
    client: httpx.AsyncClient, src: WeightSource
) -> Tuple[WeightSourceStatus, List[WeightObservation]]:
    """Fetch + parse one weight source, isolating all errors."""
    start = time.monotonic()
    try:
        request_headers = {"Accept": "text/csv"} if src.response_format == "csv" else None
        res = await client.get(src.url, timeout=src.timeout_s, headers=request_headers)
        latency = int((time.monotonic() - start) * 1000)
        if res.status_code != 200:
            return WeightSourceStatus(src.name, False, latency, error=f"HTTP {res.status_code}"), []
        payload = res.text if src.response_format == "csv" else res.json()
        parsed = src.parser(payload)
        observations: List[WeightObservation] = []
        for row in parsed:
            symbol = str(row.get("symbol", "")).strip().upper()
            local_value = _positive_number(row.get("value_local"))
            value = _positive_number(row.get("value_usd")) or local_value
            if not symbol or value is None:
                continue
            observations.append(
                WeightObservation(
                    symbol=symbol,
                    value_usd=value,
                    source=src.name,
                    asset_class=str(row.get("asset_class") or "asset"),
                    method=str(row.get("method") or "reported_weight"),
                    rate_usd=_positive_number(row.get("rate_usd")),
                    supply=_positive_number(row.get("supply")),
                    supply_basis=str(row.get("supply_basis") or ""),
                    source_asset_id=str(row.get("source_asset_id")) if row.get("source_asset_id") else None,
                    value_local=local_value,
                    currency=str(row.get("currency") or "").strip().upper() or None,
                    observation_period=str(row.get("observation_period") or "") or None,
                    series_unit=str(row.get("series_unit") or "") or None,
                )
            )
        if not observations:
            return WeightSourceStatus(src.name, False, latency, error="empty/unexpected shape"), []
        return WeightSourceStatus(src.name, True, latency, assets=len(observations)), observations
    except Exception as e:  # network / JSON / parser — isolated per source
        latency = int((time.monotonic() - start) * 1000)
        return WeightSourceStatus(src.name, False, latency, error=str(e)[:200]), []


# --- Quality control -------------------------------------------------------

def _reject_outliers(values: List[float]) -> List[float]:
    """Drop values far from the median using MAD (median absolute deviation).

    Robust to a single bad source. Disabled when OUTLIER_MAD_K <= 0 or when
    there are too few points to judge.
    """
    k = config.OUTLIER_MAD_K
    if k <= 0 or len(values) < 3:
        return values
    med = median(values)
    devs = [abs(v - med) for v in values]
    mad = median(devs)
    if mad <= 0:
        return values
    return [v for v in values if abs(v - med) <= k * mad] or values


def aggregate(per_currency: Dict[str, List[float]]) -> Tuple[Dict[str, float], Dict[str, dict]]:
    """Turn raw per-currency rate values into cleaned medians + quality meta."""
    medians: Dict[str, float] = {}
    meta: Dict[str, dict] = {}
    for sym, raw in per_currency.items():
        vals = _reject_outliers([v for v in raw if v > 0])
        if not vals:
            continue
        m = median(vals)
        lo, hi = min(vals), max(vals)
        spread = (hi - lo) / m if m else 0.0
        medians[sym] = m
        meta[sym] = {
            "sources": len(vals),
            "min": lo,
            "max": hi,
            "spread": spread,
            # Flagged when disagreement exceeds the configured threshold or when
            # fewer than the minimum number of sources supplied the asset.
            "flagged": spread > config.QUALITY_MAX_SPREAD
            or len(vals) < config.MIN_SOURCES_PER_ASSET,
        }
    return medians, meta


def _observation_dict(observation: WeightObservation) -> dict:
    return {
        "source": observation.source,
        "value_usd": observation.value_usd,
        "asset_class": observation.asset_class,
        "method": observation.method,
        "rate_usd": observation.rate_usd,
        "supply": observation.supply,
        "supply_basis": observation.supply_basis,
        "source_asset_id": observation.source_asset_id,
        "value_local": observation.value_local,
        "currency": observation.currency,
        "observation_period": observation.observation_period,
        "series_unit": observation.series_unit,
    }


def _convert_local_weight_observations(
    observations: List[WeightObservation], rates: Dict[str, float]
) -> List[WeightObservation]:
    """Convert official local-currency aggregates into comparable USD values."""
    converted: List[WeightObservation] = []
    for observation in observations:
        if observation.value_local is None or not observation.currency or observation.currency == "USD":
            converted.append(observation)
            continue
        usd_per_currency = rates.get(observation.currency)
        if usd_per_currency is None or usd_per_currency <= 0:
            # The rate oracle is the only permitted FX conversion path; do not
            # invent a conversion when an official money-supply row lacks it.
            continue
        converted.append(
            WeightObservation(
                symbol=observation.symbol,
                value_usd=observation.value_local / usd_per_currency,
                source=observation.source,
                asset_class=observation.asset_class,
                method=observation.method,
                rate_usd=usd_per_currency,
                supply=observation.supply,
                supply_basis=observation.supply_basis,
                source_asset_id=observation.source_asset_id,
                value_local=observation.value_local,
                currency=observation.currency,
                observation_period=observation.observation_period,
                series_unit=observation.series_unit,
            )
        )
    return converted


def aggregate_weights(
    observations: List[WeightObservation],
    statuses: List[WeightSourceStatus] | None = None,
    sources_total: int | None = None,
    sources_responded: int | None = None,
) -> WeightAggregateResult:
    """Aggregate comparable values without removing disputed assets.

    The disagreement metric is the relative range ``(max - min) / mean``. The
    default is 10%; above it the asset is flagged for the scheduler's freeze
    policy, but it remains included. Without a previous accepted value the
    robust median is used as a provisional value, preventing one source from
    moving the systemic result abruptly while keeping the asset present.
    """
    by_symbol_source: Dict[str, Dict[str, WeightObservation]] = {}
    for observation in observations:
        if observation.value_usd <= 0:
            continue
        per_source = by_symbol_source.setdefault(observation.symbol, {})
        # A source may list the same ticker more than once. Keep the largest
        # row after parser-level de-duplication so one provider cannot vote twice.
        old = per_source.get(observation.source)
        if old is None or observation.value_usd > old.value_usd:
            per_source[observation.source] = observation

    weights: Dict[str, float] = {}
    meta: Dict[str, dict] = {}
    raw_observations: Dict[str, List[dict]] = {}
    accepted_values: Dict[str, float] = {}

    for symbol, source_map in sorted(by_symbol_source.items()):
        rows = list(source_map.values())
        values = [row.value_usd for row in rows]
        mean = sum(values) / len(values)
        lo, hi = min(values), max(values)
        spread = (hi - lo) / mean if mean else float("inf")
        flagged = spread > config.WEIGHT_MAX_SPREAD or len(values) < config.MIN_WEIGHT_SOURCES
        # A disagreement is a stability signal, not an exclusion decision. The
        # scheduler may replace this provisional median with the last accepted
        # absolute value from the previous snapshot.
        effective_value = median(values) if flagged else mean
        raw_observations[symbol] = [_observation_dict(row) for row in rows]
        meta[symbol] = {
            "sources": len(values),
            "source_names": [row.source for row in rows],
            "min_usd": lo,
            "max_usd": hi,
            "observed_value_usd": mean,
            "value_usd": effective_value,
            "spread": spread,
            "flagged": flagged,
            "included": True,
            "stability_state": "provisional_conflict" if flagged else "accepted",
            "asset_class": rows[0].asset_class,
            "methods": sorted({row.method for row in rows}),
            "normalized_weight": None,
            "relative_to_usd": None,
        }
        accepted_values[symbol] = effective_value

    total = sum(accepted_values.values())
    if total > 0:
        weights = {symbol: value / total for symbol, value in accepted_values.items()}
        for symbol, value in accepted_values.items():
            meta[symbol]["normalized_weight"] = weights[symbol]

    usd_value = accepted_values.get("USD")
    if usd_value is not None:
        for symbol, item in meta.items():
            if item["included"]:
                item["relative_to_usd"] = item["value_usd"] / usd_value

    return WeightAggregateResult(
        weights=weights,
        meta=meta,
        observations=raw_observations,
        statuses=statuses or [],
        sources_total=sources_total if sources_total is not None else len(statuses or []),
        sources_responded=sources_responded if sources_responded is not None else sum(
            1 for status in (statuses or []) if status.ok
        ),
        reference_usd_value=usd_value,
    )


async def collect(client: "httpx.AsyncClient | None" = None) -> AggregateResult:
    """Query every rate and weight source in parallel and aggregate the results."""
    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(follow_redirects=True)
    weight_sources = configured_weight_sources()
    try:
        rate_results, weight_results = await asyncio.gather(
            asyncio.gather(*[_fetch_one(client, s) for s in SOURCES]),
            asyncio.gather(*[_fetch_weight_one(client, s) for s in weight_sources]),
        )
    finally:
        if own_client:
            await client.aclose()

    per_currency: Dict[str, List[float]] = {}
    statuses: List[SourceStatus] = []
    for status, rates in rate_results:
        statuses.append(status)
        for sym, rate in rates.items():
            per_currency.setdefault(sym, []).append(rate)

    medians, meta = aggregate(per_currency)
    weight_statuses: List[WeightSourceStatus] = []
    observations: List[WeightObservation] = []
    for status, rows in weight_results:
        weight_statuses.append(status)
        observations.extend(rows)
    # IMF and ECB publish fiat aggregates in their reporting currency. Convert
    # them with the already aggregated USD FX rates before cross-source policy.
    observations = _convert_local_weight_observations(observations, medians)
    weight_aggregate = aggregate_weights(
        observations,
        statuses=weight_statuses,
        sources_total=len(weight_sources),
        sources_responded=sum(1 for status in weight_statuses if status.ok),
    )
    responded = sum(1 for s in statuses if s.ok)
    return AggregateResult(
        medians=medians,
        meta=meta,
        statuses=statuses,
        sources_total=len(SOURCES),
        sources_responded=responded,
        weights=weight_aggregate,
    )

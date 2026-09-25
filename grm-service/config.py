# grm-service/config.py
#
# Centralized configuration for the GRM Service (Stage 1, requirement 11).
#
# Every tunable parameter lives here: update frequency, oracle source list,
# source-weight policy, data-quality thresholds, timeouts and validation
# policies. Values have sensible defaults and can be overridden via environment
# variables so deployments never need code changes.
#
# Nothing here alters System A: the GRM is an external analytical model and its
# configuration is purely about how the external computation is performed.

import os


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, ""))
    except (TypeError, ValueError):
        return default


class Config:
    """Immutable-ish runtime configuration (read once at process start)."""

    # --- Scheduling --------------------------------------------------------
    # How often the systemic GRM snapshot is recomputed, in seconds.
    UPDATE_INTERVAL_S: int = _env_int("GRM_UPDATE_INTERVAL_S", 3600)
    # Delay before the FIRST snapshot after startup (let the network settle).
    STARTUP_DELAY_S: int = _env_int("GRM_STARTUP_DELAY_S", 5)

    # --- Oracle networking -------------------------------------------------
    ORACLE_TIMEOUT_S: float = _env_float("GRM_ORACLE_TIMEOUT_S", 10.0)
    # Max history rows kept in the DB (older rows are pruned). 0 = unlimited.
    HISTORY_MAX_ROWS: int = _env_int("GRM_HISTORY_MAX_ROWS", 20000)

    # --- Weight-source networking -----------------------------------------
    # Weight values are a separate feed from FX rates. Public crypto feeds and
    # the official IMF/ECB fiat adapters are enabled below; other commodity or
    # asset feeds must be explicitly listed in GRM_WEIGHT_SOURCE_URLS because
    # their units and definitions differ.
    WEIGHT_TIMEOUT_S: float = _env_float("GRM_WEIGHT_TIMEOUT_S", 15.0)
    WEIGHT_SOURCE_URLS: str = os.getenv("GRM_WEIGHT_SOURCE_URLS", "")
    COINGECKO_ENABLED: bool = os.getenv("GRM_COINGECKO_ENABLED", "1").lower() not in {"0", "false", "no"}
    # One page is the conservative default for the public unauthenticated API;
    # increase it when the deployment has a paid/API-key quota and wants more
    # than the top 250 market-cap assets.
    COINGECKO_PAGES: int = _env_int("GRM_COINGECKO_PAGES", 1)
    COINGECKO_PER_PAGE: int = max(1, min(_env_int("GRM_COINGECKO_PER_PAGE", 250), 250))
    COINCAP_ENABLED: bool = os.getenv("GRM_COINCAP_ENABLED", "1").lower() not in {"0", "false", "no"}
    COINCAP_LIMIT: int = max(1, min(_env_int("GRM_COINCAP_LIMIT", 2000), 2000))
    # IMF's current SDMX 3.0 MFS_MA flow is the published successor for the
    # legacy IFS 59m Broad Money series. Each configured country is queried in
    # its reporting currency and converted to USD using the rate oracle.
    IMF_IFS_ENABLED: bool = os.getenv("GRM_IMF_IFS_ENABLED", "1").lower() not in {"0", "false", "no"}
    IMF_IFS_DATAFLOW: str = os.getenv("GRM_IMF_IFS_DATAFLOW", "MFS_MA").strip() or "MFS_MA"
    IMF_IFS_VERSION: str = os.getenv("GRM_IMF_IFS_VERSION", "10.0.1").strip() or "10.0.1"
    IMF_IFS_START_PERIOD: str = os.getenv("GRM_IMF_IFS_START_PERIOD", "2015-01").strip() or "2015-01"
    # currency:IMF country code:unit. USD is reported in USD; other currencies
    # use XDC and are converted with the already aggregated USD FX rate.
    IMF_IFS_CURRENCY_MAP: str = os.getenv(
        "GRM_IMF_IFS_CURRENCY_MAP",
        "USD:USA:USD,RUB:RUS:XDC,JPY:JPN:XDC,CAD:CAN:XDC,AUD:AUS:XDC,BRL:BRA:XDC,"
        "KRW:KOR:XDC,SEK:SWE:XDC,NOK:NOR:XDC,ZAR:ZAF:XDC,MXN:MEX:XDC,TRY:TUR:XDC",
    ).strip()
    ECB_M3_ENABLED: bool = os.getenv("GRM_ECB_M3_ENABLED", "1").lower() not in {"0", "false", "no"}
    ECB_M3_URL: str = os.getenv(
        "GRM_ECB_M3_URL",
        "https://data-api.ecb.europa.eu/service/data/BSI/"
        "M.U2.Y.V.M30.X.1.U2.2300.Z01.E?startPeriod=2015-01",
    ).strip()

    # --- Data-quality policy ----------------------------------------------
    # A currency's per-source values disagreeing by more than this relative
    # spread are flagged (outliers beyond OUTLIER_MAD_K are dropped first).
    QUALITY_MAX_SPREAD: float = _env_float("GRM_QUALITY_MAX_SPREAD", 0.10)
    # Weight sources use the relative range (max-min)/mean. Ten percent is a
    # conservative stability threshold for independent market-cap/supply
    # observations. Above it the scheduler freezes the last accepted absolute
    # value (or uses a median provisional value for a new asset), never deletes
    # the asset. It is configurable per deployment.
    WEIGHT_MAX_SPREAD: float = _env_float("GRM_WEIGHT_MAX_SPREAD", 0.10)
    MIN_WEIGHT_SOURCES: int = _env_int("GRM_MIN_WEIGHT_SOURCES", 1)
    # Minimum number of independent sources that must supply an asset for its
    # median to be considered trustworthy for the systemic snapshot.
    MIN_SOURCES_PER_ASSET: int = _env_int("GRM_MIN_SOURCES_PER_ASSET", 1)
    # Outlier rejection: drop values whose deviation from the median exceeds
    # OUTLIER_MAD_K * MAD (median absolute deviation). 0 disables rejection.
    OUTLIER_MAD_K: float = _env_float("GRM_OUTLIER_MAD_K", 5.0)
    # Sanity bounds for a USD-relative FX rate (guards against garbage values).
    RATE_MIN: float = _env_float("GRM_RATE_MIN", 1e-9)
    RATE_MAX: float = _env_float("GRM_RATE_MAX", 1e9)
    # Absolute USD value sanity bound for market-cap / supply observations.
    WEIGHT_MAX_VALUE: float = _env_float("GRM_WEIGHT_MAX_VALUE", 1e18)

    # --- GRM availability (quorum / completeness) --------------------------
    # A trusted systemic GRM requires the FULL basket: every basket asset must
    # resolve to a rate from the oracle, otherwise the relative-rate set is
    # incomplete and the GRM is reported UNAVAILABLE rather than partial. Set to
    # a positive integer to also require at least this many assets; 0 = "require
    # the whole basket" (the default and safest).
    MIN_ASSETS_FOR_GRM: int = _env_int("GRM_MIN_ASSETS", 0)

    # --- Storage -----------------------------------------------------------
    DB_PATH: str = os.getenv("GRM_DB_PATH", "/app/data/grm.db")

    # --- Default systemic basket ------------------------------------------
    # "all_weighted" is the source-weighted universe: the first valid cycle
    # freezes the complete set of rate-covered, source-accepted assets. There
    # are no shipped fixed basket presets or equal-weight production modes.
    SYSTEMIC_BASKET_ID: str = "all_weighted"
    # Bump deliberately when the dynamic source-weight universe should establish
    # a new immutable baseline (for example after adding a fiat source).
    WEIGHT_UNIVERSE_VERSION: str = os.getenv("GRM_WEIGHT_UNIVERSE_VERSION", "1").strip() or "1"


config = Config()

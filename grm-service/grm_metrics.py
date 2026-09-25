"""Custom Prometheus gauges for GRM oracle health.

The default prometheus_fastapi_instrumentator exposes HTTP metrics only. These
extra gauges let monitoring alert on the *health of the oracle layer* itself —
how many independent sources responded on the last cycle and how stale the last
snapshot is — which is what requirement 12 (diagnostics/monitoring) is about.

prometheus_client is already a transitive dependency of the instrumentator, so
these register into the same default registry and appear on the existing
/metrics endpoint. Nothing here changes System A or the GRM math.
"""

from prometheus_client import Gauge

# Number of oracle sources that responded OK on the last aggregation cycle.
oracle_sources_healthy = Gauge(
    "grm_oracle_sources_healthy",
    "Oracle sources that responded OK on the last GRM aggregation cycle.",
)

# Total oracle sources configured (denominator for the healthy ratio).
oracle_sources_total = Gauge(
    "grm_oracle_sources_total",
    "Total oracle sources configured for the GRM aggregator.",
)

# Age (seconds) of the latest systemic-GRM snapshot; rises if the scheduler stalls.
last_snapshot_age_seconds = Gauge(
    "grm_last_snapshot_age_seconds",
    "Seconds since the latest systemic-GRM snapshot was computed.",
)


def record_cycle(statuses: list, snapshot_ts_epoch: "float | None") -> None:
    """Update the oracle-health gauges after an aggregation cycle.

    `statuses` is the per-source outcome list (each has an `ok` flag);
    `snapshot_ts_epoch` is the snapshot time as a Unix timestamp (or None).
    """
    total = len(statuses)
    healthy = sum(1 for s in statuses if s.get("ok"))
    oracle_sources_total.set(total)
    oracle_sources_healthy.set(healthy)


def set_snapshot_age(age_seconds: float) -> None:
    last_snapshot_age_seconds.set(max(0.0, age_seconds))

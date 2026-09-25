# grm-service/baskets.py
#
# Extensible asset resolver model for source-weighted Systemic GRM.
#
# Systemic GRM no longer ships hard-coded weight presets or a preset registry.
# Its production universe is built only from rate-covered assets with accepted
# values from configured weight sources. This module keeps the asset-class
# resolver extension point so new source-backed asset classes can be added
# without changing the oracle, storage or API layers.

from dataclasses import dataclass
from typing import Callable, Dict


@dataclass(frozen=True)
class Asset:
    """One asset that can be resolved from aggregated rate observations."""
    symbol: str
    asset_class: str
    label: str = ""


Resolver = Callable[[Asset, Dict[str, float]], "float | None"]
_RESOLVERS: Dict[str, Resolver] = {}


def register_resolver(asset_class: str, resolver: Resolver) -> None:
    """Register (or override) the resolver for an asset class."""
    _RESOLVERS[asset_class] = resolver


def resolve_rate(asset: Asset, medians: Dict[str, float]) -> "float | None":
    """Return a USD-relative rate for an asset, or None if unavailable."""
    resolver = _RESOLVERS.get(asset.asset_class)
    if resolver is None:
        return None
    return resolver(asset, medians)


def _currency_resolver(asset: Asset, medians: Dict[str, float]) -> "float | None":
    value = medians.get(asset.symbol)
    return value if isinstance(value, (int, float)) and value > 0 else None


# Asset-class extension points. The active source registry supplies the actual
# observations; these resolvers remain available for future source-backed assets.
for _asset_class in ("currency", "metal", "commodity", "index", "bond", "crypto"):
    register_resolver(_asset_class, _currency_resolver)

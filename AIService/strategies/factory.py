"""
ExplanationStrategyFactory
===========================
Central registry that maps explanation_strategy strings  strategy instances.

Usage:
  strategy = ExplanationStrategyFactory.get_strategy("trend")
  system_prompt = strategy.build_system_prompt(req)

Design:
  - Strategies are singletons (instantiated once at import time)
  - Unknown strategy  ValueError  main.py catches  DEGRADED response
  - list_strategies()  used by /health endpoint to report available strategies
"""

from .trend_strategy import TrendStrategy
from .other_strategies import (
    ComparisonStrategy,
    DistributionStrategy,
    CorrelationStrategy,
    RiskStrategy,
    BehavioralStrategy,
    RankingStrategy,
    RecommendationStrategy,
    ProgressStrategy,
)
from .base import BaseExplanationStrategy


class ExplanationStrategyFactory:
    """
    Static factory  no instantiation needed.
    All strategies are registered in _REGISTRY at module load time.
    """

    _REGISTRY: dict[str, BaseExplanationStrategy] = {
        "trend":        TrendStrategy(),
        "comparison":   ComparisonStrategy(),
        "distribution": DistributionStrategy(),
        "correlation":  CorrelationStrategy(),
        "risk":         RiskStrategy(),
        "behavioral":   BehavioralStrategy(),
        "ranking":      RankingStrategy(),
        "recommendation": RecommendationStrategy(),
        "progress":       ProgressStrategy(),
    }

    @classmethod
    def get_strategy(cls, strategy_name: str) -> BaseExplanationStrategy:
        """
        Returns the strategy instance for the given name.

        Raises:
          ValueError  if strategy_name is not in registry.
                       This propagates to main.py  DEGRADED response.
        """
        strategy = cls._REGISTRY.get(strategy_name)
        if strategy is None:
            raise ValueError(
                f"Unknown explanation_strategy: '{strategy_name}'. "
                f"Valid values: {list(cls._REGISTRY.keys())}"
            )
        return strategy

    @classmethod
    def list_strategies(cls) -> list[str]:
        """Returns list of registered strategy names  used by /health endpoint."""
        return list(cls._REGISTRY.keys())

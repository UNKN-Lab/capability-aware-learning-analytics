import os
import sys
import unittest
from pathlib import Path


AI_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(AI_ROOT))
os.environ.pop("OPENAI_API_KEY", None)

from safety import SafetyFilter  # noqa: E402
from strategies.factory import ExplanationStrategyFactory  # noqa: E402


class PublicServiceSmokeTests(unittest.TestCase):
    def test_strategy_registry_loads_without_api_credentials(self):
        strategies = set(ExplanationStrategyFactory.list_strategies())
        self.assertTrue(
            {
                "trend",
                "comparison",
                "distribution",
                "correlation",
                "risk",
                "behavioral",
                "ranking",
            }.issubset(strategies)
        )

    def test_unknown_strategy_is_rejected(self):
        with self.assertRaises(ValueError):
            ExplanationStrategyFactory.get_strategy("not-a-strategy")

    def test_safety_filter_flags_identifiable_contact_text(self):
        flags = SafetyFilter.apply(
            {"summary": "Contact the student at student@example.edu."}
        )
        self.assertIn("PII_LEAKAGE", flags)


if __name__ == "__main__":
    unittest.main()

"""Safety Filter  5 category screening for AI-generated explanations."""

import re
import logging

logger = logging.getLogger("ai_service.safety")

#  Safety rules 
# Each rule: (category_name, [list of regex patterns], severity)
# severity: "block"  strip section, "warn"  flag only

_RULES = [
    (
        "PII_LEAKAGE",
        # Student IDs, emails, phone numbers in explanation text
        [r"\b[A-Z]{3}_\d{3,}\b", r"\b[\w.]+@[\w.]+\.\w{2,}\b", r"\b\d{10,}\b"],
        "warn",
    ),
    (
        "DIAGNOSTIC_LABELING",
        # Diagnosing mental health or learning disabilities
        [r"\bdyslexia\b", r"\bADHD\b", r"\bdepressed\b", r"\banxiety disorder\b",
         r"\blearning disabilit\w*\b"],
        "warn",
    ),
    (
        "CAUSAL_OVERCLAIM",
        # LLM claiming causation instead of correlation
        [r"\bcauses\b.{0,30}\bperformance\b", r"\bdirectly (leads|results) to\b",
         r"\bproves that\b"],
        "warn",
    ),
    (
        "GRADE_PREDICTION",
        # LLM predicting final grade (out of scope)
        [r"\bwill (fail|pass|get)\b", r"\bpredicted grade\b", r"\bfinal score will be\b"],
        "warn",
    ),
    (
        "PERSONAL_ATTACK",
        # Harsh or demeaning language toward student
        [r"\blazy\b", r"\bstupi\w+\b", r"\bincapabl\w*\b", r"\bunfit\b"],
        "warn",
    ),
]

class SafetyFilter:
    """
    Lightweight rule-based safety screening.
    Flags (does NOT block) explanations that contain potentially problematic language.
    Returns list of triggered category names  stored in ExplainResponse.safety_flags[].

    Design decision: We flag but don't block  the researcher (thesis author) reviews
    flagged explanations. A real production system would need stricter handling.
    """

    @staticmethod
    def apply(explanation: dict) -> list[str]:
        """
        Scans all string fields in explanation dict for safety rule violations.
        Returns list of triggered category names (may be empty).
        """
        # Flatten all text from explanation into one string for scanning
        text = SafetyFilter._flatten_text(explanation)
        if not text:
            return []

        triggered = []
        for category, patterns, severity in _RULES:
            for pattern in patterns:
                if re.search(pattern, text, re.IGNORECASE):
                    triggered.append(category)
                    logger.warning(
                        f"[safety] FLAGGED: {category} (severity={severity}) "
                        f"pattern='{pattern}'"
                    )
                    break  # one match per category is enough

        return triggered

    @staticmethod
    def _flatten_text(obj, depth: int = 0) -> str:
        """Recursively extract all string values from nested dict/list."""
        if depth > 5:
            return ""
        if isinstance(obj, str):
            return obj + " "
        if isinstance(obj, dict):
            return " ".join(SafetyFilter._flatten_text(v, depth+1) for v in obj.values())
        if isinstance(obj, list):
            return " ".join(SafetyFilter._flatten_text(item, depth+1) for item in obj)
        return ""

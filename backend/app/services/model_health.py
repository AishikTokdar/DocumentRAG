"""
Model Health Tracker

Tracks consecutive failures for individual AI models. If a model fails consecutively
a certain number of times (e.g., 3), it is flagged as unhealthy.
"""

from typing import Dict

# Dictionary mapping model_id to consecutive failure count
_MODEL_FAILURES: Dict[str, int] = {}
MAX_CONSECUTIVE_FAILURES = 3

def record_success(model_id: str) -> None:
    """Record a successful generation for a model, resetting its failure count."""
    _MODEL_FAILURES[model_id] = 0

def record_failure(model_id: str) -> None:
    """Record a failure for a model, incrementing its failure count."""
    count = _MODEL_FAILURES.get(model_id, 0)
    _MODEL_FAILURES[model_id] = count + 1

def is_model_healthy(model_id: str) -> bool:
    """Check if a model is considered healthy (has fewer than MAX_CONSECUTIVE_FAILURES)."""
    count = _MODEL_FAILURES.get(model_id, 0)
    return count < MAX_CONSECUTIVE_FAILURES

def get_model_failure_count(model_id: str) -> int:
    """Get the current consecutive failure count for a model."""
    return _MODEL_FAILURES.get(model_id, 0)

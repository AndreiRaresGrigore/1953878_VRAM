"""
evaluator.py — evaluates incoming sensor events against persisted rules.

Supports two event shapes published by the ingestion service:

  Flat (original):
    { "sensor_id": "...", "metric": "temperature_c", "value": 23.5, ... }

  Nested (current normalizer):
    { "sensor_id": "...", "measurements": {"metric": "temperature_c", "value": 23.5}, ... }

An event matches a rule when:
  1. event["sensor_id"] == rule["sensor_id"]
  2. rule["metric"] is empty OR resolved metric == rule["metric"]
  3. evaluate(resolved value, rule["operator"], rule["threshold"]) is True
"""

import operator as op_module

_OPERATORS = {
    "<":  op_module.lt,
    "<=": op_module.le,
    "=":  op_module.eq,
    ">=": op_module.ge,
    ">":  op_module.gt,
}

def _apply(value: float, operator: str, threshold: float) -> bool:
    fn = _OPERATORS.get(operator)
    if fn is None:
        raise ValueError(f"Unknown operator: {operator}")
    return fn(value, threshold)

def _extract(event: dict) -> tuple[str, float | None]:
    """Return (metric, value) from either flat or nested event shape."""
    # Nested shape: measurements is a dict
    m = event.get("measurements")
    if isinstance(m, dict):
        return m.get("metric", ""), m.get("value")
    # Flat shape
    return event.get("metric", ""), event.get("value")

def evaluate_rules(event: dict, rules: list[dict]) -> list[dict]:
    """Return the list of rules whose conditions are satisfied by *event*."""
    triggered = []
    sensor_id = event.get("sensor_id", "")
    metric, value = _extract(event)

    if value is None:
        return triggered

    try:
        value = float(value)
    except (TypeError, ValueError):
        return triggered

    for rule in rules:
        if rule["sensor_id"] != sensor_id:
            continue
        if rule["metric"] and rule["metric"] != metric:
            continue
        try:
            if _apply(value, rule["operator"], float(rule["threshold"])):
                triggered.append(rule)
                print(
                    f"[RULE #{rule['id']}] {sensor_id}.{metric} {value} "
                    f"{rule['operator']} {rule['threshold']} → "
                    f"{rule['actuator_name']} = {rule['actuator_state']}"
                )
        except Exception as e:
            print(f"[EVALUATOR] Rule {rule['id']} error: {e}")

    return triggered
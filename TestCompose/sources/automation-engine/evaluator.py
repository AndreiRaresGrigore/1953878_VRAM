"""
evaluator.py — evaluates incoming sensor events against persisted rules.

An event matches a rule when:
  1. event["sensor_id"] == rule["sensor_id"]
  2. rule["metric"] is empty OR event["metric"] == rule["metric"]
  3. evaluate(event["value"], rule["operator"], rule["threshold"]) is True
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

def evaluate_rules(event: dict, rules: list[dict]) -> list[dict]:
    """
    Return the list of rules whose conditions are satisfied by *event*.
    """
    triggered = []
    sensor_id = event.get("sensor_id", "")
    metric    = event.get("metric", "")
    value     = event.get("value")

    if value is None:
        return triggered

    try:
        value = float(value)
    except (TypeError, ValueError):
        return triggered

    for rule in rules:
        # Sensor match
        if rule["sensor_id"] != sensor_id:
            continue
        # Metric match (empty means "any metric for this sensor")
        if rule["metric"] and rule["metric"] != metric:
            continue
        # Threshold evaluation
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

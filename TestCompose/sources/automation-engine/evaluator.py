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
    """Return (metric, value) from either flat or nested event shape.

    Supported shapes:
      Flat:       { "metric": "temperature_c", "value": 23.5, ... }
      Dict:       { "measurements": {"metric": "temperature_c", "value": 23.5}, ... }
      List (current normalizer):
                  { "measurements": [{"parameter": "temperature_c", "value": 23.5}, ...], ... }
    For the list shape the first measurement is used as the representative value;
    evaluate_rules() iterates over all measurements so each metric gets checked.
    """
    m = event.get("measurements")

    # List shape — return first entry's (parameter, value) as the default;
    # the caller iterates all entries separately via evaluate_rules().
    if isinstance(m, list):
        if not m:
            return "", None
        first = m[0]
        return first.get("parameter", ""), first.get("value")

    # Dict shape (legacy)
    if isinstance(m, dict):
        return m.get("metric", m.get("parameter", "")), m.get("value")

    # Flat shape
    return event.get("metric", ""), event.get("value")

def evaluate_rules(event: dict, rules: list[dict]) -> list[dict]:
    """Return the list of rules whose conditions are satisfied by *event*.

    Priority: rules are assumed to be sorted by position ASC (get_rules() guarantees
    this). When two triggered rules target the same actuator, only the one with the
    lower position value (higher priority) fires — the others are silently dropped.
    """
    triggered = []
    sensor_id = event.get("sensor_id", "")

    # Build a list of (metric, value) pairs to evaluate.
    # Handles flat, dict, and list measurements shapes.
    m = event.get("measurements")
    if isinstance(m, list):
        pairs = [(entry.get("parameter", ""), entry.get("value")) for entry in m]
    elif isinstance(m, dict):
        pairs = [(m.get("metric", m.get("parameter", "")), m.get("value"))]
    else:
        pairs = [(event.get("metric", ""), event.get("value"))]

    already_triggered = set()  # avoid duplicate rule IDs per event

    for metric, value in pairs:
        if value is None:
            continue
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue

        for rule in rules:
            if rule["id"] in already_triggered:
                continue
            if rule["sensor_id"] != sensor_id:
                continue
            if rule["metric"] and rule["metric"] != metric:
                continue
            try:
                if _apply(value, rule["operator"], float(rule["threshold"])):
                    triggered.append(rule)
                    already_triggered.add(rule["id"])
                    print(
                        f"[RULE #{rule['id']}] {sensor_id}.{metric} {value} "
                        f"{rule['operator']} {rule['threshold']} → "
                        f"{rule['actuator_name']} = {rule['actuator_state']}"
                    )
            except Exception as e:
                print(f"[EVALUATOR] Rule {rule['id']} error: {e}")

    # Priority filtering: for each actuator, keep only the highest-priority rule
    # (lowest position value). Since 'rules' is already sorted by position ASC,
    # the first encountered winner for each actuator is the correct one.
    winner_per_actuator: dict[str, dict] = {}
    for rule in triggered:
        actuator = rule["actuator_name"]
        if actuator not in winner_per_actuator:
            winner_per_actuator[actuator] = rule
        else:
            existing_pos = winner_per_actuator[actuator].get("position", 0)
            this_pos     = rule.get("position", 0)
            if this_pos < existing_pos:
                print(
                    f"[PRIORITY] Rule #{rule['id']} (pos={this_pos}) overrides "
                    f"Rule #{winner_per_actuator[actuator]['id']} (pos={existing_pos}) "
                    f"for actuator '{actuator}'"
                )
                winner_per_actuator[actuator] = rule
            else:
                print(
                    f"[PRIORITY] Rule #{rule['id']} (pos={this_pos}) suppressed by "
                    f"Rule #{winner_per_actuator[actuator]['id']} (pos={existing_pos}) "
                    f"for actuator '{actuator}'"
                )

    return list(winner_per_actuator.values())
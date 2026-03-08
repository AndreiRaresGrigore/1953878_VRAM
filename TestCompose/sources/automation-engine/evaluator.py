"""
evaluator.py — evaluates rules against the global sensor state cache.
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

def evaluate_rules(sensor_state: dict, rules: list[dict]) -> list[dict]:
    """
    Valuta TUTTE le regole basandosi sulla cache globale di tutti i sensori.

    Poiché `rules` è ordinato per position (priorità massima = 1), iteriamo dall'alto.
    La prima regola soddisfatta per un determinato attuatore se lo "aggiudica".
    Le regole successive per quello stesso attuatore vengono ignorate, garantendo la priority queue.
    """
    winner_per_actuator: dict[str, dict] = {}

    for rule in rules:
        if rule.get("is_active", 1) == 0:
            continue

        actuator = rule["actuator_name"]

        # 1. Se una regola con priorità più alta ha già reclamato questo attuatore,
        # saltiamo la valutazione delle regole meno importanti.
        if actuator in winner_per_actuator:
            continue

        sensor_id = rule["sensor_id"]
        event = sensor_state.get(sensor_id)
        if not event:
            continue  # Nessun dato ricevuto finora per questo sensore

        # 2. Estrazione dei valori aggiornati dalla cache
        m = event.get("measurements")
        if isinstance(m, list):
            pairs = [(entry.get("metric", ""), entry.get("value")) for entry in m]
        elif isinstance(m, dict):
            pairs = [(m.get("metric", m.get("parameter", "")), m.get("value"))]
        else:
            pairs = [(event.get("metric", ""), event.get("value"))]

        metric = rule["metric"]
        rule_triggered = False

        # 3. Valutazione della condizione
        for p_metric, p_value in pairs:
            if p_value is None:
                continue
            if metric and metric != p_metric:
                continue

            try:
                p_value = float(p_value)
                if _apply(p_value, rule["operator"], float(rule["threshold"])):
                    rule_triggered = True
                    print(
                        f"[PRIORITY EVAL] Rule #{rule['id']} (pos={rule.get('position')}) "
                        f"triggered: {sensor_id}.{p_metric} {p_value} "
                        f"{rule['operator']} {rule['threshold']} -> "
                        f"{actuator} = {rule['actuator_state']}"
                    )
                    break
            except (TypeError, ValueError):
                pass

        # 4. Assegnazione dell'attuatore al vincitore
        if rule_triggered:
            winner_per_actuator[actuator] = rule

    return list(winner_per_actuator.values())
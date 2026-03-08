"""
db.py — SQLite-backed rule persistence.
"""

import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "/data/rules.db")

def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    return sqlite3.connect(DB_PATH, check_same_thread=False)

def init_db():
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS rules (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                position       INTEGER NOT NULL DEFAULT 0,
                sensor_id      TEXT    NOT NULL,
                metric         TEXT    NOT NULL DEFAULT '',
                operator       TEXT    NOT NULL,
                threshold      REAL    NOT NULL,
                actuator_name  TEXT    NOT NULL,
                actuator_state TEXT    NOT NULL,
                description    TEXT    NOT NULL DEFAULT '',
                is_active      INTEGER NOT NULL DEFAULT 1
            )
        """)
        # Migrations per database esistenti
        try:
            con.execute("ALTER TABLE rules ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
        except sqlite3.OperationalError:
            pass

        try:
            con.execute("ALTER TABLE rules ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1")
        except sqlite3.OperationalError:
            pass

def _row_to_dict(row: tuple) -> dict:
    return {
        "id":             row[0],
        "position":       row[1],
        "sensor_id":      row[2],
        "metric":         row[3],
        "operator":       row[4],
        "threshold":      row[5],
        "actuator_name":  row[6],
        "actuator_state": row[7],
        "description":    row[8],
        "is_active":      row[9]
    }

def get_rules() -> list[dict]:
    with _conn() as con:
        cur = con.execute("""
            SELECT id, position, sensor_id, metric, operator, threshold,
                   actuator_name, actuator_state, description, is_active
            FROM rules ORDER BY position ASC
        """)
        return [_row_to_dict(row) for row in cur.fetchall()]

def get_rule_by_id(rule_id: int) -> dict | None:
    with _conn() as con:
        cur = con.execute("""
            SELECT id, position, sensor_id, metric, operator, threshold,
                   actuator_name, actuator_state, description, is_active
            FROM rules WHERE id = ?
        """, (rule_id,))
        row = cur.fetchone()
        return _row_to_dict(row) if row else None

def add_rule(sensor_id: str, metric: str, operator: str, threshold: float,
             actuator_name: str, actuator_state: str, description: str = "") -> dict:
    with _conn() as con:
        con.execute("UPDATE rules SET position = position + 1")
        position = 1
        cur = con.execute(
            "INSERT INTO rules (position, sensor_id, metric, operator, threshold, "
            "actuator_name, actuator_state, description, is_active) VALUES (?,?,?,?,?,?,?,?, 1)",
            (position, sensor_id, metric, operator, threshold, actuator_name, actuator_state, description)
        )
        con.commit()
        return get_rule_by_id(cur.lastrowid)

def delete_rule(rule_id: int) -> bool:
    with _conn() as con:
        cur = con.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
        con.commit()
        return cur.rowcount > 0

def update_rule(rule_id: int, operator: str, threshold: float, actuator_state: str) -> dict | None:
    with _conn() as con:
        con.execute(
            "UPDATE rules SET operator = ?, threshold = ?, actuator_state = ? WHERE id = ?",
            (operator, threshold, actuator_state, rule_id)
        )
        con.commit()
    return get_rule_by_id(rule_id)

def toggle_rule_active(rule_id: int) -> dict | None:
    """Inverte lo stato is_active della regola (1 -> 0, 0 -> 1)"""
    with _conn() as con:
        cur = con.execute("SELECT is_active FROM rules WHERE id = ?", (rule_id,))
        row = cur.fetchone()
        if not row: return None

        new_state = 0 if row[0] == 1 else 1
        con.execute("UPDATE rules SET is_active = ? WHERE id = ?", (new_state, rule_id))
        con.commit()
    return get_rule_by_id(rule_id)

def move_rule(rule_id: int, direction: str) -> tuple[bool, str]:
    if direction not in ("up", "down"): return False, "direction must be 'up' or 'down'"
    with _conn() as con:
        cur = con.execute("SELECT id, position FROM rules ORDER BY position ASC")
        rows = cur.fetchall()
    ids_in_order = [r[0] for r in rows]
    pos_map      = {r[0]: r[1] for r in rows}
    if rule_id not in ids_in_order: return False, "Rule not found"
    idx = ids_in_order.index(rule_id)
    if direction == "up":
        if idx == 0: return False, "Rule is already at the top"
        neighbor_id = ids_in_order[idx - 1]
    else:
        if idx == len(ids_in_order) - 1: return False, "Rule is already at the bottom"
        neighbor_id = ids_in_order[idx + 1]
    pos_a, pos_b = pos_map[rule_id], pos_map[neighbor_id]
    with _conn() as con:
        con.execute("UPDATE rules SET position = -1 WHERE id = ?", (rule_id,))
        con.execute("UPDATE rules SET position = ? WHERE id = ?", (pos_a, neighbor_id))
        con.execute("UPDATE rules SET position = ? WHERE id = ?", (pos_b, rule_id))
    return True, ""
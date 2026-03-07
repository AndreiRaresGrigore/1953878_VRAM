"""
db.py — SQLite-backed rule persistence.

Rule schema:
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  sensor_id     TEXT    — e.g. "greenhouse_temperature"
  metric        TEXT    — e.g. "temperature_c"  (optional filter; if empty, matches any metric for that sensor)
  operator      TEXT    — one of: <  <=  =  >=  >
  threshold     REAL    — numeric threshold
  actuator_name TEXT    — e.g. "cooling_fan"
  actuator_state TEXT   — "ON" or "OFF"
  description   TEXT    — human-readable label (optional)
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
                sensor_id      TEXT    NOT NULL,
                metric         TEXT    NOT NULL DEFAULT '',
                operator       TEXT    NOT NULL,
                threshold      REAL    NOT NULL,
                actuator_name  TEXT    NOT NULL,
                actuator_state TEXT    NOT NULL,
                description    TEXT    NOT NULL DEFAULT ''
            )
        """)
        con.commit()
    print(f"[DB] Initialized at {DB_PATH}")

def get_rules() -> list[dict]:
    with _conn() as con:
        cur = con.execute("SELECT id, sensor_id, metric, operator, threshold, actuator_name, actuator_state, description FROM rules")
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

def get_rule_by_id(rule_id: int) -> dict | None:
    with _conn() as con:
        cur = con.execute(
            "SELECT id, sensor_id, metric, operator, threshold, actuator_name, actuator_state, description FROM rules WHERE id = ?",
            (rule_id,)
        )
        cols = [c[0] for c in cur.description]
        row  = cur.fetchone()
        return dict(zip(cols, row)) if row else None

def add_rule(sensor_id: str, metric: str, operator: str, threshold: float,
             actuator_name: str, actuator_state: str, description: str = "") -> dict:
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO rules (sensor_id, metric, operator, threshold, actuator_name, actuator_state, description) VALUES (?,?,?,?,?,?,?)",
            (sensor_id, metric, operator, threshold, actuator_name, actuator_state, description)
        )
        con.commit()
        return get_rule_by_id(cur.lastrowid)

def delete_rule(rule_id: int) -> bool:
    with _conn() as con:
        cur = con.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
        con.commit()
        return cur.rowcount > 0

def update_rule(rule_id: int, **kwargs) -> dict | None:
    allowed = {"sensor_id", "metric", "operator", "threshold", "actuator_name", "actuator_state", "description"}
    fields  = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return get_rule_by_id(rule_id)
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values     = list(fields.values()) + [rule_id]
    with _conn() as con:
        con.execute(f"UPDATE rules SET {set_clause} WHERE id = ?", values)
        con.commit()
    return get_rule_by_id(rule_id)

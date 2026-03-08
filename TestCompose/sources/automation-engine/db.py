"""
db.py — SQLite-backed rule persistence.

Rule schema:
  id            INTEGER PRIMARY KEY AUTOINCREMENT
  position      INTEGER UNIQUE  — priority order (1 = highest priority)
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
                position       INTEGER NOT NULL DEFAULT 0,
                sensor_id      TEXT    NOT NULL,
                metric         TEXT    NOT NULL DEFAULT '',
                operator       TEXT    NOT NULL,
                threshold      REAL    NOT NULL,
                actuator_name  TEXT    NOT NULL,
                actuator_state TEXT    NOT NULL,
                description    TEXT    NOT NULL DEFAULT ''
            )
        """)
        # Migration: add position column if it doesn't exist (for existing DBs)
        try:
            con.execute("ALTER TABLE rules ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
            print("[DB] Added 'position' column to existing table")
        except sqlite3.OperationalError:
            pass  # Column already exists

        # Assign positions to any rules that have position = 0 (e.g. after migration)
        cur = con.execute("SELECT id FROM rules WHERE position = 0 ORDER BY id ASC")
        unpositioned = [row[0] for row in cur.fetchall()]
        if unpositioned:
            # Find the current max position (excluding the 0s we're about to fix)
            cur2 = con.execute("SELECT MAX(position) FROM rules WHERE position != 0")
            max_pos = cur2.fetchone()[0] or 0
            for rule_id in unpositioned:
                max_pos += 1
                con.execute("UPDATE rules SET position = ? WHERE id = ?", (max_pos, rule_id))
            print(f"[DB] Assigned positions to {len(unpositioned)} existing rule(s)")

        con.commit()
    print(f"[DB] Initialized at {DB_PATH}")

def get_rules() -> list[dict]:
    with _conn() as con:
        cur = con.execute(
            "SELECT id, position, sensor_id, metric, operator, threshold, "
            "actuator_name, actuator_state, description FROM rules ORDER BY position ASC"
        )
        cols = [c[0] for c in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]

def get_rule_by_id(rule_id: int) -> dict | None:
    with _conn() as con:
        cur = con.execute(
            "SELECT id, position, sensor_id, metric, operator, threshold, "
            "actuator_name, actuator_state, description FROM rules WHERE id = ?",
            (rule_id,)
        )
        cols = [c[0] for c in cur.description]
        row  = cur.fetchone()
        return dict(zip(cols, row)) if row else None

def add_rule(sensor_id: str, metric: str, operator: str, threshold: float,
             actuator_name: str, actuator_state: str, description: str = "") -> dict:
    with _conn() as con:
        con.execute("UPDATE rules SET position = position + 1")
        
        position = 1
        
        cur = con.execute(
            "INSERT INTO rules (position, sensor_id, metric, operator, threshold, "
            "actuator_name, actuator_state, description) VALUES (?,?,?,?,?,?,?,?)",
            (position, sensor_id, metric, operator, threshold, actuator_name, actuator_state, description)
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

def _swap_positions(con, rule_id_a: int, pos_a: int, rule_id_b: int, pos_b: int):
    """Atomically swap positions of two rules using a temporary sentinel."""
    TEMP = -1
    con.execute("UPDATE rules SET position = ? WHERE id = ?", (TEMP, rule_id_a))
    con.execute("UPDATE rules SET position = ? WHERE id = ?", (pos_a, rule_id_b))
    con.execute("UPDATE rules SET position = ? WHERE id = ?", (pos_b, rule_id_a))

def move_rule(rule_id: int, direction: str) -> tuple[bool, str]:
    """Move a rule up or down in priority order.

    'up'   → increases priority (lower position number)
    'down' → decreases priority (higher position number)

    Only adjacent rules (consecutive in ordered list) are swapped.
    Returns (success, error_message).
    """
    if direction not in ("up", "down"):
        return False, "direction must be 'up' or 'down'"

    with _conn() as con:
        cur = con.execute("SELECT id, position FROM rules ORDER BY position ASC")
        rows = cur.fetchall()  # list of (id, position)

    ids_in_order = [r[0] for r in rows]
    pos_map      = {r[0]: r[1] for r in rows}

    if rule_id not in ids_in_order:
        return False, "Rule not found"

    idx = ids_in_order.index(rule_id)

    if direction == "up":
        if idx == 0:
            return False, "Rule is already at the top"
        neighbor_id = ids_in_order[idx - 1]
    else:  # down
        if idx == len(ids_in_order) - 1:
            return False, "Rule is already at the bottom"
        neighbor_id = ids_in_order[idx + 1]

    with _conn() as con:
        _swap_positions(
            con,
            rule_id,      pos_map[rule_id],
            neighbor_id,  pos_map[neighbor_id],
        )
        con.commit()

    return True, ""

import os
import time
import threading
import psycopg2
from psycopg2 import sql

# ============================================================
# CONFIGURAZIONE
# ============================================================

DB_CONFIG = {
    "host":     os.environ.get("DB_HOST", "postgres"),
    "port":     int(os.environ.get("DB_PORT", 5432)),
    "dbname":   os.environ.get("DB_NAME", "mars_db"),
    "user":     os.environ.get("DB_USER", "mars"),
    "password": os.environ.get("DB_PASSWORD", "mars_password"),
}

# ============================================================
# CONNESSIONE
# ============================================================

_db_lock = threading.Lock()
_db_conn = None


def get_db_connection():
    """Restituisce la connessione globale, riconnettendosi se necessaria."""
    global _db_conn
    with _db_lock:
        try:
            if _db_conn is None or _db_conn.closed:
                raise psycopg2.OperationalError("connessione assente")
            _db_conn.isolation_level  # check connessione viva
        except Exception:
            while True:
                try:
                    _db_conn = psycopg2.connect(**DB_CONFIG)
                    _db_conn.autocommit = True
                    print(f"[DB] Connesso a {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")
                    break
                except Exception as e:
                    print(f"[DB] Connessione fallita ({e}), retry tra 5s...")
                    time.sleep(5)
        return _db_conn


def init_db():
    """Inizializza la connessione al boot del servizio."""
    get_db_connection()

# ============================================================
# GESTIONE TABELLE
# ============================================================

_tabelle_inizializzate: set[str] = set()


def _table_name(sensor_id: str) -> str:
    """
    Converte sensor_id in nome tabella PostgreSQL sicuro.
    Esempio: 'mars/telemetry/solar_array' -> 'sensor_mars_telemetry_solar_array'
    """
    safe = sensor_id.replace("/", "_").replace("-", "_").replace(".", "_").lower()
    return f"sensor_{safe}"


def _ensure_table(cursor, table: str, parameters: list[str]):
    """
    Crea la tabella se non esiste, poi aggiunge le colonne mancanti.
    Colonne fisse: id, sensor_id, sensor_type, captured_at, status.
    Colonne dinamiche: una DOUBLE PRECISION per ogni parameter.
    """
    if table in _tabelle_inizializzate:
        return

    cursor.execute(sql.SQL("""
        CREATE TABLE IF NOT EXISTS {tbl} (
            id          BIGSERIAL PRIMARY KEY,
            sensor_id   TEXT        NOT NULL,
            sensor_type TEXT        NOT NULL,
            captured_at TIMESTAMPTZ NOT NULL,
            status      TEXT
        )
    """).format(tbl=sql.Identifier(table)))

    for param in parameters:
        col = param.replace(".", "_").lower()
        cursor.execute(sql.SQL("""
            ALTER TABLE {tbl}
            ADD COLUMN IF NOT EXISTS {col} DOUBLE PRECISION
        """).format(
            tbl=sql.Identifier(table),
            col=sql.Identifier(col),
        ))

    _tabelle_inizializzate.add(table)

# ============================================================
# SCRITTURA
# ============================================================

def salva_evento(evento: dict):
    """
    Persiste un evento normalizzato su PostgreSQL.
    I measurements diventano colonne sulla riga inserita.
    """
    table  = _table_name(evento["sensor_id"])
    params = [m["parameter"] for m in evento.get("measurements", [])]

    conn = get_db_connection()
    with _db_lock:
        with conn.cursor() as cur:
            _ensure_table(cur, table, params)

            col_names  = ["sensor_id", "sensor_type", "captured_at", "status"]
            col_values = [
                evento["sensor_id"],
                evento["sensor_type"],
                evento["captured_at"],
                evento.get("status"),
            ]

            for m in evento.get("measurements", []):
                col_names.append(m["parameter"].replace(".", "_").lower())
                col_values.append(m["value"])

            query = sql.SQL("INSERT INTO {tbl} ({cols}) VALUES ({vals})").format(
                tbl  = sql.Identifier(table),
                cols = sql.SQL(", ").join(map(sql.Identifier, col_names)),
                vals = sql.SQL(", ").join(sql.Placeholder() * len(col_values)),
            )
            cur.execute(query, col_values)
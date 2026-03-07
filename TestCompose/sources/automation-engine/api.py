"""
api.py — Flask REST API exposed by the automation engine.

Rules CRUD:
  GET    /api/rules             → list all rules
  POST   /api/rules             → create a rule
  GET    /api/rules/<id>        → get one rule
  PUT    /api/rules/<id>        → update a rule
  DELETE /api/rules/<id>        → delete a rule

Sensor state cache:
  GET    /api/state             → all latest sensor values
  GET    /api/state/<sensor_id> → latest value for one sensor

Actuator proxy (delegates to simulator):
  GET    /api/actuators                → list all actuators + current state
  GET    /api/actuators/<name>         → one actuator state
  POST   /api/actuators/<name>         → set actuator state {"state": "ON"|"OFF"}

Health:
  GET    /health
"""

import threading
from flask import Flask, jsonify, request, abort
from flask_cors import CORS
from db import get_rules, get_rule_by_id, add_rule, delete_rule, update_rule

VALID_OPERATORS = {"<", "<=", "=", ">=", ">"}
VALID_ACTUATORS = {"cooling_fan", "entrance_humidifier", "hall_ventilation", "habitat_heater"}
VALID_STATES    = {"ON", "OFF"}


def create_app(sensor_state: dict, state_lock: threading.Lock,
               set_actuator_fn, get_actuators_fn) -> Flask:
    app = Flask(__name__)
    CORS(app)

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------

    @app.route("/health")
    def health():
        return jsonify({"status": "ok"})

    # ------------------------------------------------------------------
    # Rules
    # ------------------------------------------------------------------

    @app.route("/api/rules", methods=["GET"])
    def list_rules():
        return jsonify(get_rules())

    @app.route("/api/rules/<int:rule_id>", methods=["GET"])
    def get_rule(rule_id):
        rule = get_rule_by_id(rule_id)
        if not rule:
            abort(404, description="Rule not found")
        return jsonify(rule)

    @app.route("/api/rules", methods=["POST"])
    def create_rule():
        body = request.get_json(force=True, silent=True) or {}
        err  = _validate_rule_body(body)
        if err:
            abort(400, description=err)
        rule = add_rule(
            sensor_id      = body["sensor_id"],
            metric         = body.get("metric", ""),
            operator       = body["operator"],
            threshold      = float(body["threshold"]),
            actuator_name  = body["actuator_name"],
            actuator_state = body["actuator_state"].upper(),
            description    = body.get("description", ""),
        )
        return jsonify(rule), 201

    @app.route("/api/rules/<int:rule_id>", methods=["PUT"])
    def update_rule_endpoint(rule_id):
        if not get_rule_by_id(rule_id):
            abort(404, description="Rule not found")
        body = request.get_json(force=True, silent=True) or {}
        err  = _validate_rule_body(body, partial=True)
        if err:
            abort(400, description=err)
        if "actuator_state" in body:
            body["actuator_state"] = body["actuator_state"].upper()
        if "threshold" in body:
            body["threshold"] = float(body["threshold"])
        return jsonify(update_rule(rule_id, **body))

    @app.route("/api/rules/<int:rule_id>", methods=["DELETE"])
    def delete_rule_endpoint(rule_id):
        if not delete_rule(rule_id):
            abort(404, description="Rule not found")
        return "", 204

    # ------------------------------------------------------------------
    # Sensor state cache
    # ------------------------------------------------------------------

    @app.route("/api/state", methods=["GET"])
    def all_state():
        with state_lock:
            return jsonify(dict(sensor_state))

    @app.route("/api/state/<path:sensor_id>", methods=["GET"])
    def one_state(sensor_id):
        with state_lock:
            val = sensor_state.get(sensor_id)
        if val is None:
            abort(404, description=f"No data yet for sensor '{sensor_id}'")
        return jsonify(val)

    # ------------------------------------------------------------------
    # Actuator proxy
    # ------------------------------------------------------------------

    @app.route("/api/actuators", methods=["GET"])
    def all_actuators():
        try:
            return jsonify(get_actuators_fn())
        except Exception as e:
            abort(502, description=f"Could not reach simulator: {e}")

    @app.route("/api/actuators/<actuator_name>", methods=["GET"])
    def one_actuator(actuator_name):
        if actuator_name not in VALID_ACTUATORS:
            abort(400, description=f"Unknown actuator '{actuator_name}'")
        try:
            actuators = get_actuators_fn()
            match = next((a for a in actuators if a["id"] == actuator_name), None)
            if not match:
                abort(404, description=f"Actuator '{actuator_name}' not found")
            return jsonify(match)
        except Exception as e:
            abort(502, description=f"Could not reach simulator: {e}")

    @app.route("/api/actuators/<actuator_name>", methods=["POST"])
    def set_actuator(actuator_name):
        if actuator_name not in VALID_ACTUATORS:
            abort(400, description=f"Unknown actuator '{actuator_name}'")
        body  = request.get_json(force=True, silent=True) or {}
        state = body.get("state", "").upper()
        if state not in VALID_STATES:
            abort(400, description="'state' must be ON or OFF")
        ok = set_actuator_fn(actuator_name, state)
        if not ok:
            abort(502, description="Simulator did not accept the command")
        return jsonify({"id": actuator_name, "state": state})

    # ------------------------------------------------------------------
    # Error handlers
    # ------------------------------------------------------------------

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": str(e.description)}), 400

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": str(e.description)}), 404

    @app.errorhandler(502)
    def bad_gateway(e):
        return jsonify({"error": str(e.description)}), 502

    return app


def _validate_rule_body(body: dict, partial: bool = False) -> str | None:
    required = ["sensor_id", "operator", "threshold", "actuator_name", "actuator_state"]
    if not partial:
        for field in required:
            if field not in body:
                return f"Missing required field: '{field}'"
    if "operator" in body and body["operator"] not in VALID_OPERATORS:
        return f"Invalid operator '{body['operator']}'. Must be one of: {VALID_OPERATORS}"
    if "threshold" in body:
        try:
            float(body["threshold"])
        except (TypeError, ValueError):
            return "'threshold' must be a number"
    if "actuator_name" in body and body["actuator_name"] not in VALID_ACTUATORS:
        return f"Invalid actuator '{body['actuator_name']}'. Must be one of: {VALID_ACTUATORS}"
    if "actuator_state" in body and body["actuator_state"].upper() not in VALID_STATES:
        return f"Invalid actuator_state. Must be ON or OFF"
    return None
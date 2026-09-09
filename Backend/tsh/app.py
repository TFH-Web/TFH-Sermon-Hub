from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException, InternalServerError

from tsh.views import api


def create_app(config_path: str) -> Flask:
    app = Flask(__name__)
    CORS(app, origins=['http://localhost:5173'])
    app.config.from_pyfile(config_path)

    from tsh.database import db
    db.init_app(app)

    from tsh.auth import jwt
    jwt.init_app(app)

    @app.errorhandler(404)
    def handle_not_found(e):
        message = getattr(e, "description", "Not found") or "Not found"
        return jsonify({"error": message, "message": message}), 404

    @app.errorhandler(500)
    @app.errorhandler(InternalServerError)
    def handle_internal_server_error(e):
        return jsonify({"error": "Internal server error", "message": "Internal server error"}), 500

    @app.errorhandler(Exception)
    def handle_unexpected_error(e):
        if isinstance(e, HTTPException):
            return e
        return jsonify({"error": "Internal server error", "message": "Internal server error"}), 500

    app.register_blueprint(api)

    return app


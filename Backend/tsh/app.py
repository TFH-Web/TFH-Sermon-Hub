from flask_cors import CORS
from flask import Flask
from tsh.views import api


def create_app(config_path: str) -> Flask:
    app = Flask(__name__)
    CORS(app, origins=['http://localhost:5173'])
    app.config.from_pyfile(config_path)

    from tsh.database import db
    db.init_app(app)

    from tsh.auth import jwt
    jwt.init_app(app)

    app.register_blueprint(api)

    return app

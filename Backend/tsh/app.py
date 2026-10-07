from flask import Flask, app
from tsh.views import api


def create_app(config_path: str) -> Flask:
    app = Flask(__name__)
    app.config.from_pyfile(config_path)

    from tsh.database import db
    db.init_app(app)

    from tsh.auth import jwt
    jwt.init_app(app)

    # Put all API routes under /api to match the frontend.
    app.register_blueprint(api, url_prefix="/api")

    return app

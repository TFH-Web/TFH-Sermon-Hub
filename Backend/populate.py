#!/usr/bin/env -S poetry run python3
import sys

from tests.populate import populate
from tsh.app import create_app


def main(config_path: str = "testing.cfg", database_uri: str | None = None):
    settings = {"SQLALCHEMY_DATABASE_URI": database_uri} if database_uri else None
    app = create_app(config_path, settings)
    with app.app_context():
        populate(app)


if __name__ == "__main__":
    config_path = sys.argv[1] if len(sys.argv) >= 2 else "testing.cfg"
    database_uri = sys.argv[2] if len(sys.argv) >= 3 else None
    main(config_path, database_uri)
    print("Populated database.")

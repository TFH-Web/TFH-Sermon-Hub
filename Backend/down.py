#!/usr/bin/env -S poetry run python3
import sys
from pathlib import Path

from flask_migrate import downgrade
from sqlalchemy import inspect

from tsh.app import create_app
from tsh.database import db


def main(config_path: str = "testing.cfg", database_uri: str | None = None):
    from tsh.models import Series, Sermon, Speaker, Tag, sermon_tag_m2m  # noqa: F401

    settings = {"SQLALCHEMY_DATABASE_URI": database_uri} if database_uri else None
    app = create_app(config_path) if settings is None else create_app(config_path, settings)
    with app.app_context():
        if "alembic_version" in inspect(db.engine).get_table_names():
            downgrade(
                directory=str(Path(__file__).parent / "migrations"), revision="base"
            )
        else:
            # Keep the reset script usable for databases created before migrations.
            db.drop_all()


if __name__ == "__main__":
    config_path = sys.argv[1] if len(sys.argv) >= 2 else "testing.cfg"
    database_uri = sys.argv[2] if len(sys.argv) >= 3 else None
    main(config_path, database_uri)
    print("Dropped all tables.")

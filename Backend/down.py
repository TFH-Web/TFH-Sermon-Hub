#!/usr/bin/env -S poetry run python3
from pathlib import Path

from flask_migrate import downgrade
from sqlalchemy import inspect

from tsh.app import create_app
from tsh.database import db


def main():
    from tsh.models import Series, Sermon, Speaker, Tag, sermon_tag_m2m  # noqa: F401

    app = create_app("testing.cfg")
    with app.app_context():
        if "alembic_version" in inspect(db.engine).get_table_names():
            downgrade(
                directory=str(Path(__file__).parent / "migrations"), revision="base"
            )
        else:
            # Keep the reset script usable for databases created before migrations.
            db.drop_all()


if __name__ == "__main__":
    main()
    print("Dropped all tables.")

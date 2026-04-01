#!/usr/bin/env poetry run python3
from tsh.database import db
from tsh.app import create_app


def main():
    from tsh.models import Series, Speaker, Tag, Sermon, sermon_tag_m2m  # noqa: F401

    app = create_app('testing.cfg')
    with app.app_context():
        db.drop_all()


if __name__ == "__main__":
    main()
    print("Dropped all tables.")

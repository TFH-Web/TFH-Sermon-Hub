#!/usr/bin/env poetry run python3
from database import db
from app import app


def main():
    from models import Series, Speaker, Tag, Sermon, sermon_tag_m2m

    with app.app_context():
        db.create_all()


if __name__ == "__main__":
    main()
    print("Initialized database.")

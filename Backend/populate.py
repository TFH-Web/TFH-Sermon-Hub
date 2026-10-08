#!/usr/bin/env -S poetry run python3
from tests.populate import populate
from tsh.app import create_app


def main():
    app = create_app("testing.cfg")
    with app.app_context():
        populate(app)


if __name__ == "__main__":
    main()
    print("Populated database.")

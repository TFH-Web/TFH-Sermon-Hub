import os
from app import app
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase, MappedAsDataclass
from sqlalchemy.engine import Engine
from sqlalchemy import event

DB_URI_KEY = "SQLALCHEMY_DATABASE_URI"


class Base(DeclarativeBase, MappedAsDataclass):
    pass


db = SQLAlchemy(model_class=Base)

if DB_URI_KEY not in os.environ:
    raise KeyError(f"{DB_URI_KEY} should be set in the environment")
app.config[DB_URI_KEY] = os.environ[DB_URI_KEY]
db.init_app(app)


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    # the sqlite3 driver will not set PRAGMA foreign_keys
    # if autocommit=False; set to True temporarily
    ac = dbapi_connection.autocommit
    dbapi_connection.autocommit = True

    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

    # restore previous autocommit setting
    dbapi_connection.autocommit = ac

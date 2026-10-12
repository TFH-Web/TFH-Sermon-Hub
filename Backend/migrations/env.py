import logging
from logging.config import fileConfig

from alembic import context
from flask import current_app
from sqlalchemy.schema import SchemaItem

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
fileConfig(config.config_file_name)
logger = logging.getLogger("alembic.env")

IGNORE_NAMES = ["env"]


# sqlite-vec owns the vec0 virtual table and creates its shadow tables itself,
# so autogenerate must not try to create, alter, or drop any of them.
VEC_TABLE = "sermon_chunk_embedding"


def include_object(
    object: SchemaItem,
    name: str | None,
    type_: str,
    reflected: bool,
    _compare_to: SchemaItem | None,
) -> bool:
    """Return False for the sqlite-vec table and its shadow tables, True otherwise."""
    if type_ != "table" or name is None:
        return True
    return name != VEC_TABLE and not name.startswith(VEC_TABLE + "_")


def get_engine():
    return current_app.extensions["migrate"].db.engine


def get_engine_url():
    try:
        return get_engine().url.render_as_string(hide_password=False).replace("%", "%%")
    except AttributeError:
        return str(get_engine().url).replace("%", "%%")


# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
config.set_main_option("sqlalchemy.url", get_engine_url())
target_db = current_app.extensions["migrate"].db

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def get_metadata():
    if hasattr(target_db, "metadatas"):
        return target_db.metadatas[None]
    return target_db.metadata


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    target_metadata = get_metadata()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    # this callback is used to prevent an auto-migration from being generated
    # when there are no changes to the schema
    # reference: http://alembic.zzzcomputing.com/en/latest/cookbook.html
    def process_revision_directives(context, revision, directives):
        if getattr(config.cmd_opts, "autogenerate", False):
            script = directives[0]
            if script.upgrade_ops.is_empty():
                directives[:] = []
                logger.info("No changes in schema detected.")

    conf_args = dict(current_app.extensions["migrate"].configure_args)
    if conf_args.get("process_revision_directives") is None:
        conf_args["process_revision_directives"] = process_revision_directives

    connectable = get_engine()
    target_metadata = get_metadata()

    with connectable.connect() as connection:
        if connection.dialect.name == "sqlite":
            # Batch operations replace tables. Leaving FK enforcement enabled
            # would cascade DELETE into Sermon_Tag when sermon is replaced.
            foreign_keys = connection.exec_driver_sql("PRAGMA foreign_keys").scalar()
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            connection.commit()
            try:
                # Explicit BEGIN also makes SQLite DDL transactional when the
                # sqlite3 driver uses legacy transaction control.
                connection.exec_driver_sql("BEGIN")
                context.configure(
                    connection=connection,
                    target_metadata=target_metadata,
                    include_object=include_object,
                    **conf_args,
                )
                with context.begin_transaction():
                    context.run_migrations()
                if connection.exec_driver_sql("PRAGMA foreign_key_check").first():
                    raise RuntimeError("Migration left invalid foreign key references")
                connection.commit()
            except BaseException:
                connection.rollback()
                raise
            finally:
                connection.exec_driver_sql(f"PRAGMA foreign_keys={int(foreign_keys)}")
                connection.commit()
        else:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                include_object=include_object,
                **conf_args,
            )

            with context.begin_transaction():
                context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

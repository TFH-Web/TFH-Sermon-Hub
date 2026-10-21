from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.exc import SQLAlchemyError

from tsh.database import db
from tsh.models import CaptionQuota


RESET_TIMEZONE = ZoneInfo("America/Los_Angeles")
ROW_ID = 1


def utcnow() -> datetime:
    """Return the current UTC time."""
    return datetime.now(UTC)

def next_reset(now: datetime) -> datetime:
    local = now.astimezone(RESET_TIMEZONE)
    midnight = datetime.combine(local.date() + timedelta(days=1), time.min, tzinfo=RESET_TIMEZONE)
    return midnight.astimezone(UTC)

def open_breaker() -> datetime:
    now = utcnow()
    resume = next_reset(now)
    values = {
        "blocked_until": resume.replace(tzinfo=None),
        "opened_at": now.replace(tzinfo=None),
    }
    try: 
        db.session.execute(insert(CaptionQuota).values(id=ROW_ID, **values).on_conflict_do_update(
            index_elements=[CaptionQuota.id], set_=values)
        )
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.exception("Could not save the YouTube caption quota block")
    return resume

def blocked_until() -> datetime | None:
    stored = db.session.scalar(db.select(CaptionQuota.blocked_until).where(CaptionQuota.id == ROW_ID))
    if stored is None:
        return None
    resume = stored.replace(tzinfo=UTC)
    return resume if resume > utcnow() else None

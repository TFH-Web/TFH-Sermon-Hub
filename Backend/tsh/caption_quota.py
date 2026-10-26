# Remembers when YouTube's daily caption quota ran out, so caption downloads stay off until it resets.
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.exc import SQLAlchemyError

from tsh.database import db
from tsh.models import CaptionQuota

# YouTube resets its daily quota at midnight Pacific time.
RESET_TIMEZONE = ZoneInfo("America/Los_Angeles")
# There is only ever one CaptionQuota row, so it always has this id.
ROW_ID = 1


def utcnow() -> datetime:
    """Return the current UTC time."""
    return datetime.now(UTC)


def next_reset(now: datetime) -> datetime:
    """Return the next midnight Pacific time after `now`, as a UTC datetime.

    Works on the Pacific calendar date, so it stays correct across daylight saving changes.
    """
    local = now.astimezone(RESET_TIMEZONE)
    midnight = datetime.combine(
        local.date() + timedelta(days=1), time.min, tzinfo=RESET_TIMEZONE
    )
    return midnight.astimezone(UTC)


def open_breaker() -> datetime:
    """Block caption downloads until the next quota reset and return when they resume.

    The block is saved in its own transaction, so it never commits changes that are
    pending in the caller's session. This never raises: if the save fails, the database
    error is logged and rolled back, and the resume time is still returned so the
    current run can stop.
    """
    now = utcnow()
    resume = next_reset(now)
    values = {
        "blocked_until": resume.replace(tzinfo=None),
        "opened_at": now.replace(tzinfo=None),
    }
    try:
        with db.engine.begin() as conn:
            conn.execute(
                insert(CaptionQuota)
                .values(id=ROW_ID, **values)
                .on_conflict_do_update(index_elements=[CaptionQuota.id], set_=values)
            )
    except SQLAlchemyError:
        current_app.logger.exception("Could not save the YouTube caption quota block")
    return resume


def blocked_until() -> datetime | None:
    """Return the stored resume time if it is still in the future, otherwise None."""
    stored = db.session.scalar(
        db.select(CaptionQuota.blocked_until).where(CaptionQuota.id == ROW_ID)
    )
    if stored is None:
        return None
    resume = stored.replace(tzinfo=UTC)
    return resume if resume > utcnow() else None

import json
import re

from tsh import llm
from tsh.database import db
from tsh.models import Sermon, Tag, TagSource
from sqlalchemy.exc import IntegrityError

MAX_TAGS = 6
MAX_NEW_TAGS = 2
TAG_MAX_LEN = 32

SYSTEM = "You tag church sermons by topic. Respond with JSON only, no commentary."


def get_existing_tag_names() -> list[str]:
    return list(db.session.scalars(db.select(Tag.name).order_by(Tag.name)))


def parse_tag_response(raw: str) -> list[str]:
    """Pull a list of tag strings out of a model reply, tolerating code fences and chatter"""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    tags = data.get("tags") if isinstance(data, dict) else None
    if not isinstance(tags, list):
        return []
    return [t.strip() for t in tags if isinstance(t, str) and t.strip()]


def suggest_tags(summary: str, existing: list[str] | None = None) -> list[str]:
    """Return up to MAX_TAGS tag names for a summary, preferring existing tags if available."""
    if existing is None:
        existing = get_existing_tag_names()

    if existing:
        guidance = (
            f"Allowed tags: {json.dumps(existing)}\n"
            f"Pick 3 to {MAX_TAGS} tags that fit this sermon, choosing from allowed tags. "
            f"Only invent a new tag (at most {MAX_NEW_TAGS}) if nothing on the list fits."
        )
    else:
        guidance = f"Pick 3 to {MAX_TAGS} short topic tags (one or two words each). "

    prompt = f'{guidance}\nReturn JSON like {{"tags": ["faith", "hope"]}}.\n\nSermon summary:\n{summary}'
    suggested = parse_tag_response(llm.generate(prompt, system=SYSTEM, json_mode=True))

    canonical = {n.lower(): n for n in existing}
    result: list[str] = []
    seen: set[str] = set()
    new_count = 0
    for name in suggested:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        if key in canonical:
            result.append(canonical[key])
        elif len(name) <= TAG_MAX_LEN and new_count < (MAX_NEW_TAGS if existing else MAX_TAGS):
            # Seeds the tags in lowercase
            result.append(name.lower())
            new_count += 1
        if len(result) >= MAX_TAGS:
            break
    return result



def save_ai_tags(sermon: Sermon, names: list[str]) -> list[Tag]:
    by_lower = {t.name.lower(): t for t in db.session.scalars(db.select(Tag))}
    attached = {t.name.lower() for t in sermon.tags}
    added: list[Tag] = []

    for name in names:
        key = name.lower()
        tag = by_lower.get(key)
        if tag is None:
            try:
                with db.session.begin_nested():
                    tag = Tag(name=name, source=TagSource.AI, sermons=[])
                    db.session.add(tag)
                    db.session.flush()
            except IntegrityError:
                tag = db.session.scalars(db.select(Tag).where(Tag.name == name)).first()
            by_lower[key] = tag
        if key not in attached:
            sermon.tags.append(tag)
            attached.add(key)
            added.append(tag)

    db.session.flush()
    return added
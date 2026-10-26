# Read-only check of the video links already saved on sermons. TFH-620
import click
from flask.cli import with_appcontext

from tsh.database import db
from tsh.models import Sermon
from tsh.youtube_links import is_video_id, parse_video_id


def link_problem(video_link: str, youtube_video_id: str | None) -> str | None:
    """Say what is wrong with a saved link and id, or return None when they are fine."""
    link_id = parse_video_id(video_link)
    if link_id is None:
        return "the link is not a valid YouTube video link"
    if youtube_video_id is None:
        return None
    if not is_video_id(youtube_video_id):
        return "the saved video id is not a valid 11 character id"
    if youtube_video_id != link_id:
        return "the link and the saved video id point at different videos"
    return None


@click.command("check-video-links")
@with_appcontext
def check_video_links_command() -> None:
    """List sermons whose saved video link is not a safe YouTube link. Changes nothing."""
    rows = db.session.execute(
        db.select(Sermon.id, Sermon.title, Sermon.video_link, Sermon.youtube_video_id).order_by(Sermon.id)
    ).all()
    bad = 0
    without_id = 0
    for sermon_id, title, link, video_id in rows:
        problem = link_problem(link, video_id)
        if problem:
            bad += 1
            click.echo(f"#{sermon_id} {title}: {problem} ({link!r})")
        elif video_id is None:
            without_id += 1
    click.echo(f"{len(rows)} sermons checked, {bad} need a corrected link.")
    if without_id:
        click.echo(f"{without_id} more have a good link but no saved video id. That is harmless, the id is read from the link.")
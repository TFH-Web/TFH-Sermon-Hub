from flask import Flask

def populate(app: Flask):
    from tsh.models import Series, Speaker, Tag, TagSource, Sermon, UploadStatus
    from tsh.database import db
    from datetime import date

    series_live_your_best_life = Series(id=None, title="Live Your Best Life")
    series_hope_rising = Series(id=None, title="Hope Rising")
    series_fearless = Series(id=None, title="Fearless")
    series_together = Series(id=None, title="Together")
    db.session.add_all(
        [
            series_live_your_best_life,
            series_hope_rising,
            series_fearless,
            series_together,
        ]
    )

    speaker_dave_patterson = Speaker(
        id=None, first_name="Dave", last_name="Patterson"
    )
    db.session.add(speaker_dave_patterson)

    tag_faith = Tag(name="faith", source=TagSource.AI)
    tag_hope = Tag(name="hope", source=TagSource.AI)
    tag_healing = Tag(name="healing", source=TagSource.AI)
    tag_grace = Tag(name="grace", source=TagSource.AI)
    tag_anxiety = Tag(name="anxiety", source=TagSource.MANUAL)
    db.session.add_all([tag_faith, tag_hope, tag_healing, tag_grace, tag_anxiety])

    video_link = "https://youtu.be/asdfasdf"
    sermon_under_grace = Sermon(
        id=None,
        title="Under Grace",
        video_link=video_link,
        duration=2538,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=series_live_your_best_life,
        date=date(2026, 2, 23),
        description="Exploring the transformative power of grace and how it shapes our everyday decisions, relationships, and connection to God's purpose for our lives.",
        transcript="Good morning everyone. I'm so glad you're here today. We're continuing our series \"Live Your Best Life\" and today we're talking about something that is at the foundation of everything — grace. A lot of people misunderstand what grace really means. It's not just a theological concept. Grace is the operating system of the Kingdom of God. Let me read from Ephesians 2:8-9. \"For it is by grace you have been saved, through faith — and this is not from yourselves, it is the gift of God.\" Three things about living under grace: grace is not earned, grace changes your identity, and grace empowers your purpose...",
        summary="Pastor Dave Patterson explores grace as the foundation of Christian living. The sermon covers three main points: grace cannot be earned, grace transforms identity, and grace empowers believers to fulfill their purpose. Drawing from Ephesians 2:8-9, Patterson emphasizes that understanding grace should change how we relate to God and each other.",
        status=UploadStatus.PUBLISHED,
        tags=[tag_grace, tag_faith],
    )
    sermon_walking_in_freedom = Sermon(
        id=None,
        title="Walking in Freedom",
        video_link=video_link,
        duration=2304,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=series_live_your_best_life,
        date=date(2026, 2, 16),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[tag_healing, tag_faith],
    )
    sermon_anchored_in_hope = Sermon(
        id=None,
        title="Anchored in Hope",
        video_link=video_link,
        duration=2650,
        speaker=speaker_dave_patterson,
        speaker_id=None,
        series_id=None,
        series=None,
        date=date(2026, 2, 9),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PROCESSING,
        tags=[tag_hope, tag_healing],
    )
    sermon_power_of_community = Sermon(
        id=None,
        title="Power of Community",
        video_link=video_link,
        duration=2152,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=series_together,
        date=date(2026, 2, 2),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.DRAFT,
        tags=[tag_faith],
    )
    sermon_worship_as_a_lifestyle = Sermon(
        id=None,
        title="Worship as a Lifestyle",
        video_link=video_link,
        duration=2493,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=series_fearless,
        date=date(2026, 1, 26),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.DRAFT,
        tags=[tag_hope, tag_grace],
    )
    sermon_bold_faith = Sermon(
        id=None,
        title="Bold Faith",
        video_link=video_link,
        duration=2561,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=series_hope_rising,
        date=date(2026, 1, 19),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.FAILED,
        tags=[tag_faith, tag_anxiety, tag_grace],
    )

    db.session.add_all(
        [
            sermon_under_grace,
            sermon_walking_in_freedom,
            sermon_anchored_in_hope,
            sermon_power_of_community,
            sermon_worship_as_a_lifestyle,
            sermon_bold_faith,
        ]
    )
    db.session.commit()

from flask import Flask


def populate(app: Flask):
    from datetime import date

    from tsh.database import db
    from tsh.models import Series, Sermon, Speaker, Tag, TagSource, UploadStatus

    series_live_your_best_life = Series(id=None, title="Live Your Best Life")
    series_hope_rising = Series(id=None, title="Hope Rising")
    series_fearless = Series(id=None, title="Fearless")
    series_together = Series(id=None, title="Together")
    series_new_ground = Series(
        id=None, title="New Ground"
    )  # No sermons point at this one, so the empty-series case gets tested
    db.session.add_all(
        [
            series_live_your_best_life,
            series_hope_rising,
            series_fearless,
            series_together,
            series_new_ground,
        ]
    )

    series_1 = Series(id=None, title="Series 1")
    series_2 = Series(id=None, title="Series 2")
    series_3 = Series(id=None, title="Series 3")
    series_4 = Series(id=None, title="Series 4")
    series_5 = Series(id=None, title="Series 5")
    series_6 = Series(id=None, title="Series 6")
    series_7 = Series(id=None, title="Series 7")
    series_8 = Series(id=None, title="Series 8")
    series_9 = Series(id=None, title="Series 9")
    db.session.add_all(
        [
            series_1,
            series_2,
            series_3,
            series_4,
            series_5,
            series_6,
            series_7,
            series_8,
            series_9,
        ]
    )

    speaker_dave_patterson = Speaker(
        id=None, first_name="Dave", last_name="Patterson", role="Lead Speaker"
    )
    speaker_jon_laurenzo = Speaker(
        id=None, first_name="Jon", last_name="Laurenzo", role="Guest Speaker"
    )
    speaker_hilary_harris = Speaker(
        id=None, first_name="Hilary", last_name="Harris", role="Guest Speaker"
    )
    speaker_tosha_zwanziger = Speaker(
        id=None, first_name="Tosha", last_name="Zwanziger", role="Guest Speaker"
    )
    speaker_rich_harris = Speaker(
        id=None, first_name="Rich", last_name="Harris", role="Guest Speaker"
    )
    db.session.add_all(
        [
            speaker_dave_patterson,
            speaker_jon_laurenzo,
            speaker_hilary_harris,
            speaker_tosha_zwanziger,
            speaker_rich_harris,
        ]
    )

    speaker_victoria_austin = Speaker(
        id=None, first_name="Victoria", last_name="Austin", role="Guest Speaker"
    )
    speaker_george_knight = Speaker(
        id=None, first_name="George", last_name="Knight", role="Guest Speaker"
    )
    speaker_breanna_floyd = Speaker(
        id=None, first_name="Breanna", last_name="Floyd", role="Guest Speaker"
    )
    speaker_jerry_barker = Speaker(
        id=None, first_name="Jerry", last_name="Barker", role="Guest Speaker"
    )
    speaker_melissa_barron = Speaker(
        id=None, first_name="Melissa", last_name="Barron", role="Guest Speaker"
    )
    speaker_vincent_lowe = Speaker(
        id=None, first_name="Vincent", last_name="Lowe", role="Guest Speaker"
    )
    speaker_john_mclean = Speaker(
        id=None, first_name="John", last_name="Mclean", role="Guest Speaker"
    )
    speaker_billy_alvarado = Speaker(
        id=None, first_name="Billy", last_name="Alvarado", role="Guest Speaker"
    )
    speaker_angela_moore = Speaker(
        id=None, first_name="Angela", last_name="Moore", role="Guest Speaker"
    )
    speaker_thomas_watkins = Speaker(
        id=None, first_name="Thomas", last_name="Watkins", role="Guest Speaker"
    )
    speaker_raymond_henderson = Speaker(
        id=None, first_name="Raymond", last_name="Henderson", role="Guest Speaker"
    )
    speaker_kirk_campbell = Speaker(
        id=None, first_name="Kirk", last_name="Campbell", role="Guest Speaker"
    )
    speaker_joel_thomas = Speaker(
        id=None, first_name="Joel", last_name="Thomas", role="Guest Speaker"
    )
    speaker_steven_galvan = Speaker(
        id=None, first_name="Steven", last_name="Galvan", role="Guest Speaker"
    )
    speaker_roger_petersen = Speaker(
        id=None, first_name="Roger", last_name="Petersen", role="Guest Speaker"
    )
    speaker_monica_reed = Speaker(
        id=None, first_name="Monica", last_name="Reed", role="Guest Speaker"
    )
    speaker_tiffany_arroyo = Speaker(
        id=None, first_name="Tiffany", last_name="Arroyo", role="Guest Speaker"
    )
    speaker_rodney_hill = Speaker(
        id=None, first_name="Rodney", last_name="Hill", role="Guest Speaker"
    )
    speaker_lauren_parker = Speaker(
        id=None, first_name="Lauren", last_name="Parker", role="Guest Speaker"
    )
    speaker_brian_carter = Speaker(
        id=None, first_name="Brian", last_name="Carter", role="Guest Speaker"
    )

    db.session.add_all(
        [
            speaker_victoria_austin,
            speaker_george_knight,
            speaker_breanna_floyd,
            speaker_jerry_barker,
            speaker_melissa_barron,
            speaker_vincent_lowe,
            speaker_john_mclean,
            speaker_billy_alvarado,
            speaker_angela_moore,
            speaker_thomas_watkins,
            speaker_raymond_henderson,
            speaker_kirk_campbell,
            speaker_joel_thomas,
            speaker_steven_galvan,
            speaker_roger_petersen,
            speaker_monica_reed,
            speaker_tiffany_arroyo,
            speaker_rodney_hill,
            speaker_lauren_parker,
            speaker_brian_carter,
        ]
    )

    tag_faith = Tag(name="faith", source=TagSource.AI, sermons=[])
    tag_hope = Tag(name="hope", source=TagSource.AI, sermons=[])
    tag_healing = Tag(name="healing", source=TagSource.AI, sermons=[])
    tag_grace = Tag(name="grace", source=TagSource.AI, sermons=[])
    tag_anxiety = Tag(name="anxiety", source=TagSource.MANUAL, sermons=[])
    tag_fear = Tag(name="fear", source=TagSource.MANUAL, sermons=[])
    tag_life = Tag(name="life", source=TagSource.MANUAL, sermons=[])
    db.session.add_all(
        [tag_faith, tag_hope, tag_healing, tag_grace, tag_anxiety, tag_fear, tag_life]
    )

    video_link = "https://youtu.be/JQSUGFQO5FU"
    video_link2 = "https://youtu.be/BROKENLINKTEST"
    video_link3 = "https://www.youtube.com/watch?v=PxTdE09QjH0"
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
        video_link=video_link2,
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
        video_link=video_link3,
        duration=2650,
        speaker=speaker_jon_laurenzo,
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
        speaker=speaker_tosha_zwanziger,
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
        speaker=speaker_hilary_harris,
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
        speaker=speaker_rich_harris,
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

    sermon_1 = Sermon(
        id=None,
        title="Sermon 1",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 1),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )
    sermon_2 = Sermon(
        id=None,
        title="Sermon 2",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 2),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )
    sermon_3 = Sermon(
        id=None,
        title="Sermon 3",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 3),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )
    sermon_4 = Sermon(
        id=None,
        title="Sermon 4",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 4),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )
    sermon_5 = Sermon(
        id=None,
        title="Sermon 5",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 5),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )
    sermon_6 = Sermon(
        id=None,
        title="Sermon 6",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 6),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )
    sermon_7 = Sermon(
        id=None,
        title="Sermon 7",
        video_link=video_link,
        duration=6767,
        speaker_id=None,
        series_id=None,
        speaker=speaker_dave_patterson,
        series=None,
        date=date(2027, 1, 7),
        description="Lorem ipsum dolor sit amet",
        transcript=None,
        summary=None,
        status=UploadStatus.PUBLISHED,
        tags=[],
    )

    db.session.add_all([
        sermon_1,
        sermon_2,
        sermon_3,
        sermon_4,
        sermon_5,
        sermon_6,
        sermon_7,
    ]);

    db.session.commit()

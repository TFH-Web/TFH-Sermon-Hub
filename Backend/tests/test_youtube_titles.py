# Tests for parsing YouTube titles into a sermon title and speaker. Titles are real ones from the TFH channel.
import pytest

from tsh.youtube_titles import ParsedTitle, parse_title, series_named_in

ALIASES = {"joesph zwanziger": "Joseph Zwanziger", "dr. nina baratiak": "Nina Baratiak"}


@pytest.mark.parametrize(
    ("title", "playlists", "expected"),
    [
        # Current format, series stripped
        ("The Guide: Holy Spirit - Dave Patterson", ["Holy Spirit"], ParsedTitle("The Guide", "Dave", "Patterson")),
        # Series match ignores case
        ("Jesus, Our Soon Coming King: Who is Jesus? - Dave Patterson", ["Who Is Jesus?"],
         ParsedTitle("Jesus, Our Soon Coming King", "Dave", "Patterson")),
        # No series in the title
        ("When the Battle Moves In - Joel Milgate", [], ParsedTitle("When the Battle Moves In", "Joel", "Milgate")),
        # A colon that is not a playlist stays
        ("Psalms of Summer - Songs from the Cave: Psalm 57 - Rich Harris - 7/2/17", ["Psalms of Summer"],
         ParsedTitle("Songs from the Cave: Psalm 57", "Rich", "Harris")),
        # Older format with a series: just the quoted title
        ('Gospel of Mark PT7 - "Jesus in the Storm" - Jude Fouquier - 5.26.24', ["Gospel of Mark"],
         ParsedTitle("Jesus in the Storm", "Jude", "Fouquier")),
        ('After God\'s Heart PT7 - "How Did I Get Here?" - Jared Lemke - 8.1.21', ["After God's Heart | A Study in the Life of David"],
         ParsedTitle("How Did I Get Here?", "Jared", "Lemke")),
        ('True Community Part 2 - "Leave no Man Behind" - Dave Patterson - 8/19/18 11AM', ["True Community"],
         ParsedTitle("Leave no Man Behind", "Dave", "Patterson")),
        # Date stuck to the speaker, extra spaces around the dashes
        ("Tent Pegs - The More of God - Dave Patterson 11/11/17 6PM", ["Tent Pegs"], ParsedTitle("The More of God", "Dave", "Patterson")),
        ("90 Days Part 2  - Living in the Overflow  -  Dave Patterson 2/18/18 11AM", ["90 Days"],
         ParsedTitle("Living in the Overflow", "Dave", "Patterson")),
        # Speaker aliases and honorifics
        ("Grace Wins - Joesph Zwanziger", [], ParsedTitle("Grace Wins", "Joseph", "Zwanziger")),
        ("The Journey: Psalms of Summer - Dr. Nina Baratiak", ["Psalms of Summer"], ParsedTitle("The Journey", "Nina", "Baratiak")),
        ("Fulfilled - Rabbi Jason Sobel - 12.11.22", [], ParsedTitle("Fulfilled", "Jason", "Sobel")),
        # Sr. stays with the last name, so he is not the same speaker as Jude Fouquier
        ('"A Prayer Pattern into the Soul of God" - Jude Fouquier Sr. - 10.22.23', [],
         ParsedTitle("A Prayer Pattern into the Soul of God", "Jude", "Fouquier Sr.")),
        # Several speakers: the first is the speaker, and a lone first name takes the shared last name
        ("Jesus, The Servant of All: Who Is Jesus? - Joseph Zwanziger & James Cooper", ["Who Is Jesus?"],
         ParsedTitle("Jesus, The Servant of All", "Joseph", "Zwanziger", "Joseph Zwanziger & James Cooper")),
        ('I Can Relate PT4 - "Marriage" - Joseph & Tosha Zwanziger - 5.21.23', ["I Can Relate"],
         ParsedTitle("Marriage", "Joseph", "Zwanziger", "Joseph & Tosha Zwanziger")),
    ],
)
def test_parse_title(title: str, playlists: list[str], expected: ParsedTitle):
    """Each title format gives the cleaned title and the right speaker."""
    assert parse_title(title, playlists, has_series=bool(playlists), speaker_aliases=ALIASES) == expected


def test_older_title_without_series_keeps_context():
    """With no series, an older title keeps the series and part number in front."""
    parsed = parse_title('Gospel of Mark PT7 - "Jesus in the Storm" - Jude Fouquier - 5.26.24', [], False, {})
    assert parsed.title == "Gospel of Mark, Part 7: Jesus in the Storm"


@pytest.mark.parametrize(
    "title",
    [
        "Day 17 - Don't Faint",
        "Get Louder - Message Highlight",
        "The Father's House - Pursuit Live (Thursday 6PM)",
        'Supernatural PT4 - "Weakness and Power" - 9.17.23',
        "God of Restoration - Seth's Story",
        "Week 2 —  Gaining Spiritual Altitude — Pursuit Group Study",
        "You Will Receive Power: Joseph Zwanziger",
        "Salt + Light - Stu Garrard Interview / The Beatitudes Project   11/05/17 11AM",
    ],
)
def test_no_speaker(title: str):
    """Titles that do not end in a name keep their title and get no speaker."""
    assert parse_title(title, ["TFH+"], True, ALIASES) == ParsedTitle(title)


@pytest.mark.parametrize(
    ("title", "series"),
    [
        ("The Guide: Holy Spirit - Dave Patterson", "Holy Spirit"),
        ('Gospel of Mark PT7 - "Jesus in the Storm" - Jude Fouquier - 5.26.24', "Gospel of Mark"),
        ("Tent Pegs - The More of God - Dave Patterson 11/11/17 6PM", "Tent Pegs"),
        ("When the Battle Moves In - Joel Milgate", None),
        ("Day 17 - Don't Faint", None),
    ],
)
def test_series_named_in(title: str, series: str | None):
    """series_named_in finds the series in both title formats, and None when there is none."""
    assert series_named_in(title) == series

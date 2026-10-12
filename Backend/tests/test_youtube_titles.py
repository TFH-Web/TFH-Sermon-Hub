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
        # No space before the dash
        ("Where's Your Worship: A Different Kingdom- Jude Fouquier", [],
         ParsedTitle("Where's Your Worship: A Different Kingdom", "Jude", "Fouquier")),
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


KNOWN = {"joseph zwanziger", "dave patterson", "tosha zwanziger", "rich harris"}


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("You Will Receive Power: Joseph Zwanziger", ParsedTitle("You Will Receive Power", "Joseph", "Zwanziger")),
        ("You Will Receive Power \u2013 Joseph Zwanziger", ParsedTitle("You Will Receive Power", "Joseph", "Zwanziger")),
        ("You Will Receive Power \u2014 Joseph Zwanziger", ParsedTitle("You Will Receive Power", "Joseph", "Zwanziger")),
        ("You Will Receive Power | Joseph Zwanziger", ParsedTitle("You Will Receive Power", "Joseph", "Zwanziger")),
        # Aliases apply before the known-speaker check
        ("Grace Wins: Joesph Zwanziger", ParsedTitle("Grace Wins", "Joseph", "Zwanziger")),
        # Only the last colon splits off the speaker
        ("The Guide: Holy Spirit: Dave Patterson", ParsedTitle("The Guide", "Dave", "Patterson")),
        ("Marriage: Joseph & Tosha Zwanziger", ParsedTitle("Marriage", "Joseph", "Zwanziger", "Joseph & Tosha Zwanziger")),
    ],
)
def test_known_speaker_after_other_separators(title: str, expected: ParsedTitle):
    """With no " - ", a known speaker after a colon, en dash, em dash or "|" is still found."""
    assert parse_title(title, ["Holy Spirit"], True, ALIASES, KNOWN) == expected


@pytest.mark.parametrize(
    "title",
    [
        # Series after a colon, not a speaker
        "The Guide: Holy Spirit",
        # Looks like a name, but nobody by that name has spoken
        "Faith: Stranger Person",
        "Week 2 \u2014  Gaining Spiritual Altitude \u2014 Pursuit Group Study",
    ],
)
def test_unknown_name_after_other_separators(title: str):
    """Colons, en dashes, em dashes and "|" only split off a speaker who is already known."""
    assert parse_title(title, [], False, ALIASES, KNOWN) == ParsedTitle(title)


@pytest.mark.parametrize(
    ("title", "playlists", "expected"),
    [
        ("Pursuit Part 3   Beauty of Your Holiness   Rich Harris 3/18/18 11AM", ["Pursuit"],
         ParsedTitle("Beauty of Your Holiness", "Rich", "Harris")),
        ("Tent Pegs   Connect the Dots   Dave Patterson 11/26/17 9AM", ["Tent Pegs"],
         ParsedTitle("Connect the Dots", "Dave", "Patterson")),
        # Without a series the part number lead-in stays in front
        ("Pursuit Part 3   Beauty of Your Holiness   Rich Harris 3/18/18 11AM", [],
         ParsedTitle("Pursuit, Part 3: Beauty of Your Holiness", "Rich", "Harris")),
    ],
)
def test_known_speaker_after_spaces(title: str, playlists: list[str], expected: ParsedTitle):
    """Older titles that lost their dashes are split on runs of spaces and cleaned like dashed ones."""
    assert parse_title(title, playlists, bool(playlists), ALIASES, KNOWN) == expected


@pytest.mark.parametrize(
    "title",
    [
        "Tent Pegs   Connect the Dots   Stranger Person 11/26/17 9AM",
        "Salt + Light - Stu Garrard Interview / The Beatitudes Project   11/05/17 11AM",
    ],
)
def test_unknown_name_after_spaces(title: str):
    """A run of spaces only splits off a known speaker, and an interview title stays as it is."""
    assert parse_title(title, ["Tent Pegs"], True, ALIASES, KNOWN) == ParsedTitle(title)


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

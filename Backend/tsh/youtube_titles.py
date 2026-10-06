# Parses a YouTube video title into a clean sermon title and the speaker's name.
import re
from dataclasses import dataclass

# Segments are split on a dash with a space after it. Older titles sometimes have extra spaces, or none before
# the dash ("A Different Kingdom- Jude Fouquier").
SEPARATOR = re.compile(r"\s*-\s+")
# Other separators some titles use between segments: en dash, em dash, "|", or a run of spaces where the dashes
# were lost ("Tent Pegs   Connect the Dots   Dave Patterson 11/26/17 9AM").
OTHER_SEPARATOR = re.compile(r"\s+[\u2013\u2014|]\s+|\s{2,}")
# Study and event titles use these too ("Week 2 — Gaining Spiritual Altitude — Pursuit Group Study"),
# so they, and a colon, only split off a known speaker.
KNOWN_SPEAKER_SEPARATOR = re.compile(rf"{OTHER_SEPARATOR.pattern}|:\s*")
_DATE = r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}(?:\s+\d{1,2}(?::\d{2})?\s*(?:AM|PM))?"
# Older titles end in the service date, e.g. "- 10.11.20" or "- 10/21/18 9AM".
DATE_SEGMENT = re.compile(rf"^-?{_DATE}-?$", re.IGNORECASE)
# Some put the date right after the speaker, e.g. "Dave Patterson 1/14/18 11AM".
TRAILING_DATE = re.compile(rf"\s+-?{_DATE}-?$", re.IGNORECASE)
# "Heart and Soul PT 2", "True Community Part 2", "After God's Heart PT1"
PART_LEAD_IN = re.compile(r"^(?P<series>.+?)\s+(?:PT|Part)\.?\s*(?P<part>\d+)$", re.IGNORECASE)
DEVOTIONAL = re.compile(r"^Day \d+$", re.IGNORECASE)
HONORIFICS = {"dr", "dr.", "rabbi", "pastor", "rev", "rev.", "bishop", "apostle"}
SUFFIXES = {"jr", "jr.", "sr", "sr.", "ii", "iii"}
# Last segments that look like a name but are not one.
NOT_NAMES = {"message highlight"}
QUOTES = "\"“”"


@dataclass
class ParsedTitle:
    """A parsed title. first_name and last_name are None when no speaker could be found."""

    title: str
    first_name: str | None = None
    last_name: str | None = None
    # The full "A & B" text when more than one speaker is named, else None.
    all_speakers: str | None = None


def parse_title(
    title: str,
    playlist_titles: list[str],
    has_series: bool,
    speaker_aliases: dict[str, str],
    known_speakers: set[str] | None = None,
) -> ParsedTitle:
    """Split a video title into the sermon title and the speaker.

    Handles "<Title>[: <Series>] - <Speaker>" and the older "<Series> PT N - "<Title>" - <Speaker> - <date>".
    playlist_titles are the playlists (and series) the video is in, used to strip the series from the title.
    has_series says whether the sermon gets a series; without one the older lead-in is kept as "<Series>, Part N: ".
    speaker_aliases maps lowercase misspelled names to the right one.
    known_speakers are lowercase "first last" names of speakers already known. A title with no " - ", like
    "You Will Receive Power: Joseph Zwanziger" or "... – Joseph Zwanziger", only takes the part after its last
    colon, en dash, em dash, "|" or run of spaces as the speaker when it is one of them, since
    "The Guide: Holy Spirit" has the same shape.
    Returns the title unchanged and no speaker when the title does not end in a name.
    """
    parts = [p.strip() for p in SEPARATOR.split(title.strip())]
    if len(parts) > 1 and DATE_SEGMENT.match(parts[-1]):
        parts.pop()
    if parts and DEVOTIONAL.match(parts[0]):
        return ParsedTitle(title=title)
    if len(parts) < 2:
        return _parse_known_speaker_title(title, playlist_titles, has_series, speaker_aliases, known_speakers or set())

    speakers = TRAILING_DATE.sub("", parts[-1]).strip()
    name = _lead_speaker(speakers, speaker_aliases)
    if name is None:
        return ParsedTitle(title=title)

    first_name, last_name = name
    return ParsedTitle(
        title=_clean_title(parts[:-1], playlist_titles, has_series) or title,
        first_name=first_name,
        last_name=last_name,
        all_speakers=speakers if "&" in speakers else None,
    )


def _parse_known_speaker_title(
    title: str, playlist_titles: list[str], has_series: bool, aliases: dict[str, str], known_speakers: set[str]
) -> ParsedTitle:
    """Parse "<Title>: <Speaker>" (or with an en dash, em dash, "|" or run of spaces), taking the speaker only when it is already known."""
    stripped = title.strip()
    matches = list(KNOWN_SPEAKER_SEPARATOR.finditer(stripped))
    if not matches:
        return ParsedTitle(title=title)
    last = matches[-1]
    head, tail = stripped[:last.start()].strip(), stripped[last.end():].strip()
    speakers = TRAILING_DATE.sub("", tail).strip()
    name = _lead_speaker(speakers, aliases)
    if not head or name is None or " ".join(name).lower() not in known_speakers:
        return ParsedTitle(title=title)
    first_name, last_name = name
    # Colons stay in the head: _clean_title reads "<Title>: <Series>" itself.
    parts = [p.strip() for p in OTHER_SEPARATOR.split(head)]
    return ParsedTitle(
        title=_clean_title(parts, playlist_titles, has_series) or title,
        first_name=first_name,
        last_name=last_name,
        all_speakers=speakers if "&" in speakers else None,
    )


def series_named_in(title: str) -> str | None:
    """Return the series a title names, or None.

    "The Guide: Holy Spirit - Dave Patterson" names "Holy Spirit".
    "Gospel of Mark PT7 - "Jesus in the Storm" - Jude Fouquier" names "Gospel of Mark".
    Used for a single video, which comes with no playlists; the caller checks the name against existing series.
    """
    parts = [p.strip() for p in SEPARATOR.split(title.strip())]
    if len(parts) > 1 and DATE_SEGMENT.match(parts[-1]):
        parts.pop()
    if len(parts) < 2:
        return None
    rest = parts[:-1]
    match = PART_LEAD_IN.match(rest[0])
    if len(rest) > 1:
        return match["series"] if match else rest[0]
    if ":" in rest[0]:
        return rest[0].rsplit(":", 1)[1].strip() or None
    return None


def _lead_speaker(speakers: str, aliases: dict[str, str]) -> tuple[str, str] | None:
    """Return (first, last) for the first speaker named, or None if it does not look like a name."""
    if speakers.lower() in NOT_NAMES:
        return None
    names = [n.strip() for n in speakers.split("&")]
    lead = names[0]
    # "Joseph & Tosha Zwanziger": a lone first name shares the last name of the next speaker.
    if len(lead.split()) == 1 and len(names) > 1 and len(names[1].split()) > 1:
        lead = f"{lead} {names[1].split()[-1]}"
    lead = aliases.get(lead.lower(), lead)

    words = lead.split()
    while words and words[0].lower() in HONORIFICS:
        words = words[1:]
    # Titles, dates and testimonies ("Seth's Story") end up here when there is no speaker.
    if not 2 <= len(words) <= 4 or re.search(r"[\d()/\"“”]", lead) or any(w.lower().endswith("'s") for w in words):
        return None
    # Sr. and Jr. stay with the last name, so "Jude Fouquier Sr." and "Jude Fouquier" stay different people.
    if words[-1].lower() in SUFFIXES and len(words) > 2:
        return " ".join(words[:-2]), " ".join(words[-2:])
    return " ".join(words[:-1]), words[-1]


def _clean_title(parts: list[str], playlist_titles: list[str], has_series: bool) -> str:
    """Join what is left of the title, without the series name, the part number lead-in or wrapping quotes."""
    playlists = {p.lower() for p in playlist_titles}
    lead_in = None
    if len(parts) > 1:
        match = PART_LEAD_IN.match(parts[0])
        if match:
            lead_in = f"{match['series']}, Part {int(match['part'])}"
            parts = parts[1:]
        elif parts[0].lower() in playlists:
            lead_in = parts[0]
            parts = parts[1:]

    title = " - ".join(p.strip(QUOTES + " ") for p in parts)
    # "The Guide: Holy Spirit", where Holy Spirit is the playlist.
    if ":" in title:
        head, tail = title.rsplit(":", 1)
        if tail.strip().lower() in playlists:
            title = head.strip()
    # The series page already shows which series it is; on its own the sermon needs the context.
    if lead_in and not has_series:
        title = f"{lead_in}: {title}"
    return title

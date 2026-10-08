# Tests for caption cleanup, rolling display repeats and source timestamps.
import pytest

from tsh.transcripts import parse_vtt, transcript_text

ROLLING_VTT = """WEBVTT
Kind: captions
Language: en

00:00:00.240 --> 00:00:03.429 align:start position:0%
Good<00:00:00.480><c> morning.</c><00:00:00.960><c> Good</c><00:00:01.199><c> morning.</c>

00:00:03.429 --> 00:00:03.439
Good morning. Good morning.

00:00:03.439 --> 00:00:05.190
Good morning. Good morning.
Can<00:00:03.600><c> we</c><00:00:03.760><c> say</c><00:00:03.840><c> hi?</c>

00:00:05.190 --> 00:00:05.200
Can we say hi?

00:00:05.200 --> 00:00:07.269
Can we say hi?
Welcome<00:00:05.359><c> to</c><00:00:05.920><c> church.</c>
"""


def test_rolling_captions_keep_new_words_and_source_times():
    """ASR hold cues and carried lines disappear while deliberate repeated words remain."""
    segments = parse_vtt(ROLLING_VTT, rolling=True)
    assert segments == [
        {"start": 0.24, "end": 3.429, "text": "Good morning. Good morning."},
        {"start": 3.439, "end": 5.19, "text": "Can we say hi?"},
        {"start": 5.2, "end": 7.269, "text": "Welcome to church."},
    ]
    assert transcript_text(segments) == "Good morning. Good morning. Can we say hi? Welcome to church."


def test_manual_captions_keep_overlapping_repetitions():
    """Manual cues retain repeated lines even when their display intervals overlap."""
    document = "WEBVTT\n\n00:01.000 --> 00:03.000\nAmen.\n\n00:02.000 --> 00:04.000\nAmen.\n"
    assert transcript_text(parse_vtt(document)) == "Amen. Amen."


def test_youtube_space_only_lines_are_not_cue_separators():
    """YouTube's blank-looking display lines stay inside a cue instead of breaking its timing."""
    document = (
        "WEBVTT\n\n00:00:00.240 --> 00:00:03.429 align:start position:0%\n \n"
        "Good<00:00:00.480><c> morning.</c>\n\n"
        "00:00:03.429 --> 00:00:03.439\nGood morning.\n \n\n"
        "00:00:03.439 --> 00:00:05.190\nGood morning.\nWelcome<00:00:04.000><c> back.</c>\n"
    )
    assert parse_vtt(document, rolling=True) == [
        {"start": 0.24, "end": 3.429, "text": "Good morning."},
        {"start": 3.439, "end": 5.19, "text": "Welcome back."},
    ]


def test_asr_keeps_a_new_timed_repetition():
    """A repeated ASR line with fresh word timestamps is a second utterance."""
    document = (
        "WEBVTT\n\n00:01.000 --> 00:03.000\nSay<00:01.500><c> amen.</c>\n\n"
        "00:03.000 --> 00:05.000\nSay<00:03.500><c> amen.</c>\n"
    )
    assert transcript_text(parse_vtt(document, rolling=True)) == "Say amen. Say amen."


def test_asr_keeps_a_repetition_after_a_pause():
    """An identical line after a gap is speech rather than a rolling display repeat."""
    document = "WEBVTT\n\n00:01.000 --> 00:03.000\nAmen.\n\n00:05.000 --> 00:07.000\nAmen.\n"
    assert transcript_text(parse_vtt(document, rolling=True)) == "Amen. Amen."


def test_tags_entities_cue_ids_metadata_and_line_endings():
    """Cue settings and metadata are ignored; markup and entities become readable text."""
    document = """WEBVTT Example

NOTE caption metadata
This is not speech.

STYLE
::cue { color: lime }

REGION
id:bottom

cue-1
01:02:03.040 --> 01:02:05.060 line:90%
<v Pastor><b>Faith &amp; hope</b></v>
&lt;3 &nbsp; &#39;yes&#39;

"""
    document = "\ufeff" + document.replace("\n", "\r\n")
    assert parse_vtt(document) == [{"start": 3723.04, "end": 3725.06, "text": "Faith & hope <3 'yes'"}]


@pytest.mark.parametrize("document", [
    "",
    "<html>not captions</html>",
    "WEBVTT\n\nno timing here\n",
    "WEBVTT\n\n00:01.000 --> 00:01.000\nzero\n",
    "WEBVTT\n\n00:03.000 --> 00:01.000\nbackward\n",
    "WEBVTT\n\n00:99.000 --> 01:00.000\ninvalid\n",
    "WEBVTT\n\n00:03.000 --> 00:04.000\none\n\n00:01.000 --> 00:02.000\ntwo\n",
    "WEBVTT\n\n00:01.000 --> 00:03.000\n<c> </c>\n",
])
def test_invalid_caption_files_fail(document):
    """Bad files and unusable cues fail instead of saving an empty or partial transcript."""
    with pytest.raises(ValueError):
        parse_vtt(document)

# Parse WebVTT into clean transcript text with source cue times.
import html
import re
from typing import TypedDict


class TranscriptSegment(TypedDict):
    """One caption segment, with start and end in seconds from the video start."""

    start: float
    end: float
    text: str


STAMP = r"(?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3}"
TIMING = re.compile(rf"^(?P<start>{STAMP})\s+-->\s+(?P<end>{STAMP})(?:[ \t].*)?$")
INLINE_TIME = re.compile(rf"<{STAMP}>")
TAG = re.compile(r"<[^>]*>")


def parse_vtt(document: str, *, rolling: bool = False) -> list[TranscriptSegment]:
    """Return clean, timed cues; remove ASR display repeats when rolling is true.

    Raises ValueError for invalid WebVTT, invalid cue times, or no caption text.
    Repeated words inside a cue and repetitions after a pause are kept.
    """
    document = document.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    if not re.match(r"^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)", document):
        raise ValueError("Expected a WEBVTT caption file")

    segments: list[TranscriptSegment] = []
    previous_lines: list[str] = []
    previous_end = -1.0
    previous_start = -1.0
    # A space-only line is cue text in YouTube's VTT, not an empty cue separator.
    for block in re.split(r"\n\n+", document):
        lines = block.splitlines()
        if not lines or re.match(r"^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)", lines[0]):
            continue
        timing_index = 0 if "-->" in lines[0] else 1
        if timing_index >= len(lines) or not (match := TIMING.fullmatch(lines[timing_index])):
            raise ValueError("Invalid WebVTT cue timing")
        start, end = _seconds(match["start"]), _seconds(match["end"])
        if end <= start or start < previous_start:
            raise ValueError("Invalid WebVTT cue order or duration")
        previous_start = start

        raw_lines = [line for line in lines[timing_index + 1:] if line.strip()]
        clean_lines = [_clean(line) for line in raw_lines]
        pairs = [(raw, clean) for raw, clean in zip(raw_lines, clean_lines) if clean]
        clean_lines = [clean for _, clean in pairs]
        repeated = 0
        # YouTube carries the old line into the next cue and inserts a short hold cue between lines.
        if rolling and start <= previous_end + 0.05:
            for count in range(min(len(previous_lines), len(clean_lines)), 0, -1):
                if previous_lines[-count:] == clean_lines[:count]:
                    # A new line with its own word times is speech, even if its words repeat.
                    if not any(INLINE_TIME.search(raw) for raw, _ in pairs[:count]):
                        repeated = count
                        break
        text = " ".join(clean_lines[repeated:])
        if text:
            segments.append({"start": start, "end": end, "text": text})
        previous_lines = clean_lines
        previous_end = end

    if not segments:
        raise ValueError("Caption file contains no usable text")
    return segments


def transcript_text(segments: list[TranscriptSegment]) -> str:
    """Join clean segment text in caption order for Sermon.transcript."""
    return " ".join(segment["text"] for segment in segments)


def _seconds(stamp: str) -> float:
    parts = stamp.split(":")
    if len(parts) == 2:
        parts.insert(0, "0")
    return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])


def _clean(text: str) -> str:
    return " ".join(html.unescape(TAG.sub("", text)).split())

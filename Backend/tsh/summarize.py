import re

from tsh import llm

CHUNK_CHARS = 4000
MAX_REDUCE_ROUNDS = 5
SYSTEM = (
    "You summarize church sermon transcripts accurately and concisely."
    "Only use what is in the text. Do not invent scripture references or quotes."
)


def chunk_text(text: str, size: int = CHUNK_CHARS) -> list[str]:
    """Split text into chunks of at most 'size' characters, breaking on sentences."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for s in sentences:
        if not s:
            continue
        while len(s) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(s[:size])
            s = s[size:]
        if current and len(current) + len(s) + 1 > size:
            chunks.append(current)
            current = s
        else:
            current = f"{current} {s}".strip()
    if current:
        chunks.append(current)
    return chunks


def summarize_transcript(text: str) -> str:
    if not text or not text.strip():
        raise ValueError("Cannot summarize an empty transcript")

    chunks = chunk_text(text)

    partials = [
        llm.generate(f"Summarize this part of a sermon in 3-4 sentences:\n\n{c}", system=SYSTEM)
        for c in chunks
    ]
    if len(partials) == 1:
        return partials[0]

    combined = "\n\n".join(partials)
    for _ in range(MAX_REDUCE_ROUNDS):
        if len(combined) <= CHUNK_CHARS:
            break
        partials = [
            llm.generate(f"Condense these sermon notes:\n\n{g}", system=SYSTEM)
            for g in chunk_text(combined)
        ]

        combined = "\n\n".join(partials)

    return llm.generate("Write one cohesive summary (a single paragraph of 4-6 sentences) of this "
                        f"sermon, based on these notes from each section:\n\n{combined}", system=SYSTEM,)

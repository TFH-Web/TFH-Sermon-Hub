"""Deterministic ranking shared by sermon search and grounded chat retrieval."""

import math
import re

VECTOR_WEIGHT = 0.7
KEYWORD_WEIGHT = 0.3
MAX_DISTANCE = 0.6

STOP_WORDS = frozenset(
    "a about above after again against all am an and any are as at be because been "
    "before being below between both but by can could did do does doing down during "
    "each few for from further had has have having he her here hers herself him "
    "himself his how i if in into is it its itself just me more most my myself no "
    "nor not now of off on once only or other our ours ourselves out over own same "
    "she should so some such than that the their theirs them themselves then there "
    "these they this those through to too under until up very was we were what when "
    "where which while who whom why will with would you your yours yourself yourselves".split()
)
WORDS = re.compile(r"\w+", re.UNICODE)


def normalize_text(text: str) -> str:
    """Casefold Unicode and collapse whitespace without changing literal punctuation."""
    return " ".join(text.casefold().split())


class KeywordQuery:
    """Match literal whole phrases, or at least half the distinct meaningful words."""

    def __init__(self, query: str):
        normalized = normalize_text(query)
        # Treat a paired wrapper as phrase notation, not literal sermon punctuation.
        # This does not add a query language or require phrase-only admission.
        quote_pairs = {'"': '"', "'": "'", "\u201c": "\u201d", "\u2018": "\u2019"}
        if len(normalized) >= 2 and quote_pairs.get(normalized[0]) == normalized[-1]:
            normalized = normalize_text(normalized[1:-1])
        self.terms = frozenset(WORDS.findall(normalized)) - STOP_WORDS
        self._phrase = re.compile(r"(?<!\w)" + re.escape(normalized) + r"(?!\w)")

    def score(self, text: str) -> float:
        if not self.terms:
            return 0.0
        normalized = normalize_text(text)
        if self._phrase.search(normalized):
            return 1.0
        coverage = len(self.terms.intersection(WORDS.findall(normalized))) / len(
            self.terms
        )
        return 0.65 * coverage if coverage >= 0.5 else 0.0


def blend_score(distance: float | None, lexical: float) -> float:
    """Combine cosine similarity and keyword evidence without boosting absent vectors."""
    vector_score = 0.0
    if distance is not None and math.isfinite(distance):
        vector_score = max(0.0, min(1.0, 1.0 - distance))
    lexical_score = max(0.0, min(1.0, lexical)) if math.isfinite(lexical) else 0.0
    return max(
        0.0, min(1.0, VECTOR_WEIGHT * vector_score + KEYWORD_WEIGHT * lexical_score)
    )

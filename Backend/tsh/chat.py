# AI chat over published sermons: request validation, retrieval, grounded answers and citations.
from __future__ import annotations

from marshmallow import Schema, ValidationError, fields, validate, validates_schema

# Request limits. They keep one request's prompt, and so its cost and latency, bounded.
MAX_REQUEST_BYTES = 32 * 1024
MAX_MESSAGE_CHARS = 1000
MAX_HISTORY_TURNS = 6
MAX_HISTORY_CHARS = 1000
HISTORY_ROLES = ("user", "assistant")


class _HistoryTurnSchema(Schema):
    role = fields.String(required=True, validate=validate.OneOf(HISTORY_ROLES))
    content = fields.String(
        required=True, validate=validate.Length(min=1, max=MAX_HISTORY_CHARS)
    )

    @validates_schema
    def content_not_blank(self, data, **kwargs):
        if not data["content"].strip():
            raise ValidationError("Must not be blank.", "content")


class ChatRequestSchema(Schema):
    """POST /api/chat body: {"message": str, "sermonId": int | null, "history": [{"role", "content"}]}.

    Unknown keys are rejected, so a typo such as "sermonID" fails instead of silently
    searching every sermon.
    """

    message = fields.String(
        required=True, validate=validate.Length(min=1, max=MAX_MESSAGE_CHARS)
    )
    sermon_id = fields.Integer(
        data_key="sermonId", strict=True, allow_none=True, load_default=None,
        validate=validate.Range(min=1),
    )
    history = fields.List(
        fields.Nested(_HistoryTurnSchema),
        load_default=list,
        validate=validate.Length(max=MAX_HISTORY_TURNS),
    )

    @validates_schema
    def message_not_blank(self, data, **kwargs):
        if not data["message"].strip():
            raise ValidationError("Must not be blank.", "message")


chat_request_schema = ChatRequestSchema()


def parse_chat_request(body: object) -> dict:
    """Return the validated request as {"message", "sermon_id", "history"} with text stripped.

    Raises marshmallow.ValidationError with per-field messages if the body is not a JSON
    object, a field has the wrong type, a role is not "user" or "assistant", or a length
    or count limit is exceeded.
    """
    if not isinstance(body, dict):
        raise ValidationError({"_schema": ["Request body must be a JSON object."]})
    data = chat_request_schema.load(body)
    data["message"] = data["message"].strip()
    data["history"] = [
        {"role": turn["role"], "content": turn["content"].strip()}
        for turn in data["history"]
    ]
    return data


# Sent when no published sermon evidence supports an answer. Fixed text, never model output,
# so a declined question can never carry an invented claim or citation.
UNSUPPORTED_ANSWER = (
    "I couldn't find anything in the published TFH sermons that answers that question."
)


def unsupported_response() -> dict:
    """Return the chat response for a question the sermon evidence does not answer."""
    return {
        "answer": UNSUPPORTED_ANSWER,
        "ai_generated": True,
        "supported": False,
        "sources": [],
    }


def answer_question(message: str, sermon_id: int | None, history: list[dict]) -> dict:
    """Return the chat response for a validated request.

    No evidence is retrieved yet, so every question gets the unsupported response and no
    model is called.
    """
    return unsupported_response()

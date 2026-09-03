from __future__ import annotations

from marshmallow import Schema, fields

from tsh.models import Series, TagSource, UploadStatus


def id_field():
    return fields.Integer(dump_only=True)


class SeriesSchema(Schema):
    id = id_field()
    title = fields.String(required=True)


series_schema = SeriesSchema()
seriess_schema = SeriesSchema(many=True)


class SpeakerSchema(Schema):
    id = id_field()
    first_name = fields.String(required=True)
    last_name = fields.String(required=True)
    full_name = fields.Method("format_name", dump_only=True)

    def format_name(self, author):
        return f"{author.first_name}, {author.last_name}"


speaker_schema = SpeakerSchema()
speakers_schema = SpeakerSchema(many=True)


class TagSchema(Schema):
    name = fields.String(required=True)
    source = fields.Enum(TagSource, required=True, by_value=True)
    count = fields.Integer(dump_only=True)


tag_schema = TagSchema()
tags_schema = TagSchema(many=True)


class SermonSchema(Schema):
    id = id_field()
    title = fields.String(required=True)
    video_link = fields.String(required=True)
    duration = fields.Integer(required=True)
    date = fields.Date(required=True)
    description = fields.String(required=True)
    tags = fields.Nested(TagSchema(many=True))
    transcript = fields.String()
    summary = fields.String()
    speaker = fields.Nested(SpeakerSchema, required=True)
    series = fields.Nested(SeriesSchema)
    status = fields.Enum(UploadStatus, required=True, by_value=True)


sermon_schema = SermonSchema()
sermons_schema = SermonSchema(many=True)

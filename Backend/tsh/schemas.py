from __future__ import annotations

from marshmallow import Schema, fields, post_load

from tsh.models import Series, Speaker, Tag, TagSource, UploadStatus, Sermon


def camelcase(s):
    parts = iter(s.split("_"))
    return next(parts) + "".join(part.title() for part in parts)


class CamelCaseSchema(Schema):
    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)


def id_field():
    return fields.Integer()


class SeriesSchema(CamelCaseSchema):
    id = id_field()
    title = fields.String(required=True)

    @post_load
    def make_series(self, data, **kwargs) -> Series:
        return Series(**data)


series_schema = SeriesSchema()
seriess_schema = SeriesSchema(many=True)


class SpeakerSchema(CamelCaseSchema):
    id = id_field()
    first_name = fields.String(required=True)
    last_name = fields.String(required=True)
    role = fields.String(required=True)

    @post_load
    def make_speaker(self, data, **kwargs) -> Speaker:
        return Speaker(**data)


speaker_schema = SpeakerSchema()
speakers_schema = SpeakerSchema(many=True)


class TagSchema(CamelCaseSchema):
    name = fields.String(required=True)
    source = fields.Enum(TagSource, required=True, by_value=True)

    @post_load
    def make_tag(self, data, **kwargs) -> Tag:
        data['sermons'] = []
        return Tag(**data)


tag_schema = TagSchema()
tags_schema = TagSchema(many=True)


class CountedTagSchema(CamelCaseSchema):
    name = fields.String(required=True)
    source = fields.Enum(TagSource, required=True, by_value=True)
    count = fields.Integer()

    @post_load
    def make_tag(self, data, **kwargs) -> Tag:
        data['sermons'] = []
        return Tag(**{k: v for k, v in data.items() if k != "count"})


counted_tag_schema = CountedTagSchema()
counted_tags_schema = CountedTagSchema(many=True)


class SermonSchema(CamelCaseSchema):
    id = id_field()
    title = fields.String(required=True)
    video_link = fields.String(required=True)
    duration = fields.Integer(required=True)
    date = fields.Date(required=True)
    description = fields.String(required=True)
    tags = fields.Nested(TagSchema(many=True))
    transcript = fields.String(allow_none=True)
    summary = fields.String(allow_none=True)
    speaker = fields.Nested(SpeakerSchema, required=True)
    series = fields.Nested(SeriesSchema, allow_none=True)
    status = fields.Enum(UploadStatus, required=True, by_value=True)

    @post_load
    def make_sermon(self, data, **kwargs) -> Sermon:
        data['speaker_id'] = data['speaker'].id
        data['series_id'] = data['series'] and data['series'].id or None
        return Sermon(**data)


sermon_schema = SermonSchema()
sermons_schema = SermonSchema(many=True)

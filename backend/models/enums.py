import enum

from sqlalchemy import Enum as SAEnum


class SourceType(enum.StrEnum):
    ITUNES = "itunes"
    YOUTUBE = "youtube"


def source_enum() -> SAEnum:
    return SAEnum(
        SourceType,
        name="source_type",
        native_enum=True,
        create_constraint=False,
        values_callable=lambda e: [m.value for m in e],
    )

"""외부 소스 어댑터 공용 헬퍼.

iTunes 의 releaseDate 와 YouTube 의 publishedAt 이 같은 ISO 8601 형식이라
날짜 파서를 여기 하나만 둔다.
"""

from datetime import date, datetime


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return None

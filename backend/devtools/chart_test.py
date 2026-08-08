"""
itunes.top_tracks / top_albums 와 "최신순" 정렬 점검. Dev-only — `backend/devtools/`
와 함께 지워진다.

DB 도 pgserver 도 안 쓴다. httpx.MockTransport 로 RSS 피드와 /lookup 응답만
흉내내서, 차트가 깨지는 실제 경로를 막는다.

  1. /lookup 응답 순서는 보장이 없다 - 순위는 피드 순서를 따라야 한다
  2. 피드에 있는데 lookup 이 못 찾는 곡은 조용히 빠져야 한다 (빈 껍데기 금지)
  3. 피드가 비면 /lookup 을 아예 치지 않는다
  4. 앨범 차트는 songs 가 아니라 albums 피드를 치고 collectionId 로 맞춘다
  5. 발매일 없는 항목이 "최신" 자리를 뺏지 않는다

실행:

    python backend/devtools/chart_test.py

모든 단언이 통과하면 exit code 0.
"""

import asyncio
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.services.search import _newest_first  # noqa: E402
from backend.sources import itunes  # noqa: E402

FEED_IDS = ["100", "200", "300"]


def _track(track_id: str, name: str) -> dict:
    return {"wrapperType": "track", "trackId": int(track_id), "trackName": name}


def _album(collection_id: str, name: str) -> dict:
    return {
        "wrapperType": "collection",
        "collectionId": int(collection_id),
        "collectionName": name,
    }


def _handler(feed_ids: list[str], lookup_results: list[dict], calls: list[str]):
    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if request.url.host.startswith("rss."):
            results = [{"id": i, "name": f"song-{i}"} for i in feed_ids]
            return httpx.Response(200, json={"feed": {"results": results}})
        return httpx.Response(200, json={"results": lookup_results})

    return handle


async def run(chart, feed_ids: list[str], lookup_results: list[dict]) -> tuple[list, list]:
    calls: list[str] = []
    transport = httpx.MockTransport(_handler(feed_ids, lookup_results, calls))
    async with httpx.AsyncClient(transport=transport) as client:
        itunes.set_client(client)
        try:
            return await chart(limit=len(feed_ids) or 20), calls
        finally:
            itunes.set_client(None)


async def main() -> int:
    failures = []

    def check(name: str, cond: bool, extra: str = "") -> None:
        print(f"{'PASS' if cond else 'FAIL'}  {name}{'  ' + extra if extra else ''}")
        if not cond:
            failures.append(name)

    # 1. lookup 이 순서를 뒤집어 줘도 피드 순위를 지킨다
    shuffled = [_track("300", "c"), _track("100", "a"), _track("200", "b")]
    tracks, calls = await run(itunes.top_tracks, FEED_IDS, shuffled)
    ids = [str(t["trackId"]) for t in tracks]
    check("피드 순위 유지", ids == FEED_IDS, f"got={ids}")

    # lookup 은 곡 수와 무관하게 1회, id 는 쉼표로 묶여 나간다
    lookup = [c for c in calls if "/lookup" in c]
    sent = parse_qs(urlparse(lookup[0]).query).get("id", [""])[0] if lookup else ""
    check("lookup 1회 batch", len(lookup) == 1 and sent == "100,200,300", f"id={sent}")

    # 2. lookup 이 못 찾은 곡은 빠진다
    partial = [_track("100", "a"), _track("300", "c")]
    tracks, _ = await run(itunes.top_tracks, FEED_IDS, partial)
    ids = [str(t["trackId"]) for t in tracks]
    check("미매칭 곡 제외", ids == ["100", "300"], f"got={ids}")

    # 3. 피드가 비면 lookup 을 안 친다
    tracks, calls = await run(itunes.top_tracks, [], [])
    check(
        "빈 피드는 lookup 생략",
        tracks == [] and not [c for c in calls if "/lookup" in c],
        f"calls={len(calls)}",
    )

    # 4. 앨범 차트는 albums 피드 + entity=album + collectionId 로 맞춘다.
    #    곡 차트를 복사해 오면서 songs.json 이 남으면 인기 앨범이 곡 목록이 된다.
    albums, calls = await run(
        itunes.top_albums,
        FEED_IDS,
        [_album("200", "b"), _album("100", "a"), _album("300", "c")],
    )
    ids = [str(a["collectionId"]) for a in albums]
    check("앨범 피드 순위 유지", ids == FEED_IDS, f"got={ids}")
    feed_call = next((c for c in calls if "rss." in c), "")
    lookup_call = next((c for c in calls if "/lookup" in c), "")
    check(
        "앨범 피드/엔티티",
        feed_call.endswith("/albums.json") and "entity=album" in lookup_call,
        f"feed={feed_call.rsplit('/', 2)[-2:]}",
    )

    # 5. 발매일이 없는 항목이 최신 자리를 뺏으면 안 된다
    rows = [
        SimpleNamespace(name="없음", artist="A", release_date=None),
        SimpleNamespace(name="작년", artist="A", release_date=date(2025, 1, 1)),
        SimpleNamespace(name="어제", artist="A", release_date=date(2026, 8, 7)),
    ]
    order = [r.name for r in _newest_first(rows, 3)]
    check("최신순 정렬", order == ["어제", "작년", "없음"], f"got={order}")

    # 6. 싱글판/수록판이 같은 제목으로 두 줄 뜨면 안 된다. 새 쪽만 남긴다.
    dupes = [
        SimpleNamespace(title="FARMING", artist="Stray Kids", release_date=date(2026, 8, 7)),
        SimpleNamespace(title="farming", artist="stray kids", release_date=date(2025, 1, 1)),
        SimpleNamespace(title="다른 곡", artist="Stray Kids", release_date=date(2026, 1, 1)),
    ]
    picked = _newest_first(dupes, 5)
    check(
        "같은 곡 중복 제거",
        [(r.title, str(r.release_date)) for r in picked]
        == [("FARMING", "2026-08-07"), ("다른 곡", "2026-01-01")],
        f"got={[r.title for r in picked]}",
    )

    print("\n" + ("모두 통과" if not failures else f"실패: {failures}"))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

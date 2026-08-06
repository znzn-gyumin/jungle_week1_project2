# 06 · Open questions

Ordered roughly by how soon someone will hit them.

## ~~Two logins coexist~~ — closed 2026-08-06

The merge deleted Spotify OAuth. `uid` is the only session. The advice at the
time was "do not build a bridge between them, any mapping table written now gets
thrown away" — that turned out right.

## ~~Nothing writes to `tracks` / `albums` in product code~~ — closed 2026-08-06

`backend_dev`'s `/api/search` upserts both tables through
`services/search.py` + `db/repository.py`, and `backend/devtools/itunes.py` was
deleted rather than promoted.

One thing did not survive the move: the **24-hour `search_cache` TTL**.
`backend_dev` had already dropped those tables (`3d805a6`) and calls iTunes on
every search. iTunes rate-limits at roughly 20 requests/minute per IP, so a
busy page can hit 429. Reintroducing a cache is an open question again — but as
an in-process or Redis cache, not a table. Reasoning under "검색 캐시는 DB 에
두지 않는다" in `backend/README.md`.

## Two response layers

`api/` returns Pydantic models, `routers/` returns hand-built dicts. Adding a
field to `Track` means editing `schemas.py` **and** `serializers.py`. Decide
which one wins before the next model change. See
[02-api-design.md](02-api-design.md).

## Sessions vanish on restart

In-memory, by choice. Swap `backend/sessions.py` for Redis or a DB table when it
starts costing more than it saves. The interface is already the seam.

## 403 versus 404 on other people's private resources

Currently 403, which confirms the resource exists. Correct for an internal tool,
wrong for a public service. Decide before this is exposed to real users. See
[02-api-design.md](02-api-design.md).

## Track-level likes

Excluded at the schema level. If product wants them, three files change together
— model, migration, `schema.sql` — and the CHECK widens to three arguments.
Ask whether "like a song" and "like an album" really belong in the same table
first; a separate `track_likes` table may be cleaner than a three-way nullable
CHECK.

## `view_count` under load

Every non-owner detail view issues `UPDATE ... SET view_count = view_count + 1`,
which takes a row lock. Fine now, contended later. `backend/README.md` already
suggests a Redis counter with periodic flush. Nothing has been built.

## The same song exists once per platform

Inherited from the schema, not decided here. iTunes' "Bohemian Rhapsody" and
YouTube's are separate `tracks` rows because `source` differs, so search shows
duplicates and playlists store them separately.

Linking them needs an identity table above `tracks` (something like `songs`) with
per-platform rows hanging off it. This is worth more than it looks: iTunes gives
30 seconds and YouTube gives the full track, so **joining the two is arguably the
product**. `backend/README.md` has the longer version.

## The integration test lives inside the code that gets deleted

It is at `backend/devtools/integration_test.py`, which means removing the
dev-only directory also removes the only check on `backend/schema.sql`. It sits
there because `pgserver` must not end up in `requirements.txt`. Decide where it
goes — a `tests/` package with a dev-only requirements file is the obvious
answer — before deleting `backend/devtools/`.
See [05-verification.md](05-verification.md).

## Whether the inspection page survives

It is built to be deleted ([04-dev-only-code.md](04-dev-only-code.md)). But the
endpoint tables, response key dictionary and error catalogue inside
`client/src/devlab/meta.js` are hand-written documentation that would be worth
keeping — as a static docs page, or folded into this folder — before the
directory is removed.

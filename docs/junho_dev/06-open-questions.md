# 06 · Open questions

Ordered roughly by how soon someone will hit them.

## Two logins coexist

Spotify OAuth (`sid`) and the local account (`uid`) do not know about each other.
Logging in with Spotify does not let you create a playlist; logging in with a
local account does not let you play anything.

This resolves itself when playback moves to iTunes and the `sid` side is deleted
in full. Until then, do not build a bridge between them — any mapping table
written now gets thrown away. Reasoning in
[01-auth-and-accounts.md](01-auth-and-accounts.md).

## Nothing writes to `tracks` / `albums` in product code

`/api/search` (Spotify) returns responses verbatim and never touches the
database. The only thing that populates those tables today is
`/api/catalog/search` in `backend/devtools/`, which is scheduled for deletion.

When real search is built, move the upsert and cache logic out of
`backend/devtools/itunes.py` into product code. The logic itself is exercised and
working — the `ON CONFLICT (source, source_id) DO UPDATE` pattern, the album
dedupe, and the 24-hour `search_cache` TTL. Do not rewrite it from scratch.

**Do not delete `backend/devtools/` before that move happens**, or the knowledge
goes with it.

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

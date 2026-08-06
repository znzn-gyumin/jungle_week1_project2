# 02 · API design

## Why routers are separate files

`backend/main.py` was already 361 lines. Putting users, playlists and likes in it
would have pushed it past 700. They live in `backend/routers/` instead.

The existing layout is flat (`spotify.py`, `sessions.py`, `config.py`), so this
may look inconsistent — but the split follows a different axis. **Everything left
in `main.py` is Spotify-specific.** When the iTunes migration lands, `main.py`
shrinks hard and `routers/` survives untouched. The file boundary *is* the
deletion boundary.

The old constraint still holds: the `StaticFiles` mount must stay at the very
bottom of `main.py`. All `include_router` calls sit above it.

## The camelCase serialization layer

`backend/serializers.py` turns models into dictionaries: `total_tracks` →
`totalTracks`, `play_url` → `playUrl`.

These are hand-written functions rather than Pydantic response models.

- The **full list of response keys lives in one file**. Nobody has to read
  through the models to find them. The "response key dictionary" in
  `client/src/devlab/meta.js` mirrors this file directly.
- What is exposed is chosen explicitly. There is no path by which
  `password_hash` leaks.
- Shape can vary by context: `playlist_out(playlist, items=True)` adds tracks
  only for the detail endpoint. List responses omit `items` — shipping every
  track with every list entry means 20 playlists dragging 500 tracks along.

The cost is that model changes require edits here too. If schema churn picks up,
move to Pydantic models.

## Error shape

Every failure is `{"error": "<한국어 문장>"}`, identical regardless of status. The
`HTTPException` and `RequestValidationError` handlers in `main.py` enforce it.

FastAPI's default is `{"detail": ...}`, but the pre-existing frontend `api.js`
already read the `error` key, so the backend matched the frontend. Validation
failures (422) get flattened into one line such as
`"email: String should match pattern ..."` instead of FastAPI's default array.

From the frontend's side: **only the status code needs branching; body parsing is
always the same.**

## How status codes were chosen

| Code | When | Note |
|---|---|---|
| 401 | No cookie / dead session | Also what you get when `credentials` is omitted |
| 403 | Resource exists but is not yours | Existence is not hidden |
| 404 | Unknown id | |
| 409 | Duplicate nickname or email | |
| 422 | Format violation | Produced by Pydantic |

**403 and 404 are kept distinct** because this is an internal tool. A public
service should return 404 for someone else's private resource to hide that it
exists. Here, letting the frontend see the real cause is worth more than the
concealment. Revisit this before going public.

## Why liking is an idempotent `PUT`

```sql
INSERT INTO likes (user_id, album_id) VALUES (?, ?)
ON CONFLICT (user_id, album_id) DO NOTHING
```

The application never runs a `SELECT` first to check whether the like exists.
**The UNIQUE constraint is the check.** Check-then-insert breaks when two
requests interleave (TOCTOU), and it costs an extra round trip.

The response is `{"liked": true, "created": false}`. A `created` of false is not
an error. The frontend has no reason to treat "user clicked the heart twice" as
an exception. `DELETE` mirrors this with `{"liked": false, "removed": false}` at
status 200.

**The two UNIQUE constraints on `likes` do not collide** because PostgreSQL
treats NULLs as distinct. Album-like rows all have `playlist_id IS NULL` yet none
of them violate `uq_likes_user_id_playlist_id`. It looks wrong at a glance, which
is why `backend/README.md` marks it "지우지 말 것".

## Why there is no track-level like

`likes` carries `CHECK (num_nonnulls(album_id, playlist_id) = 1)` — an album or a
playlist, exactly one. Track-level likes were excluded at the schema level
(`track_id` was dropped in commit `a51d48f`).

Adding them means changing three places together: `backend/models/like.py`, a
new migration under `backend/migrations/versions/`, and `backend/schema.sql`.
Widen the CHECK to three arguments and add a `(user_id, track_id)` UNIQUE.

## Playlists that go private after being liked

If the owner flips `is_public` to false after someone liked it, **the like row
stays**. It is not deleted, and flipping back to public restores it as-is.

Creating a *new* like on a private playlist is still blocked with 403. The likes
list response carries `playlist.isPublic: false` through unchanged, so the
frontend can label it as "the owner made this private".

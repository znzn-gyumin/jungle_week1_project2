# 05 · Verification

## What was actually run

An integration test drives the real FastAPI app over ASGI against a real
PostgreSQL instance built from `backend/schema.sql`. 60 assertions, all passing
as of 2026-08-06.

It covers: signup and its four failure modes, login, logout, `PATCH /me`,
account deletion with cascade, playlist create / list / detail / patch / delete,
add and remove tracks, reorder, `total_tracks` and `position` after every
mutation, ownership 403s, `view_count` increments, public listing, idempotent
likes, unlike, and the "playlist went private but the like survives" case.

## Why against real PostgreSQL

`Base.metadata.create_all()` on SQLite was considered and is not viable. The
schema uses `num_nonnulls()`, a native enum type, a `DEFERRABLE` unique
constraint, and a partial index — none of which SQLite has.

More importantly, `backend/schema.sql` is the artifact **nothing else validates**.
`alembic check` catches drift between the models and the migrations, but
`schema.sql` is maintained by hand (`backend/README.md` says so explicitly). A
test that builds its database from `schema.sql` is the only thing keeping that
file honest.

## How, on a machine with no Docker

Neither `docker` nor `psql` is installed on this workstation. The `pgserver`
package on PyPI ships real PostgreSQL binaries inside the wheel, which solves it
without a daemon or an install.

One wrinkle: the project `.venv` is Python 3.14 and `pgserver` publishes no
`cp314` wheels. A throwaway 3.12 environment was created with
`uv venv --python 3.12` just to host the test.

Two other details worth knowing before re-running it:

- `schema.sql` contains `BEGIN` / `COMMIT`, so it cannot be fed through
  `engine.begin()` — that opens a transaction of its own and the nested `BEGIN`
  fails. Execute it on the raw asyncpg connection instead.
- The app's DB session is swapped with `app.dependency_overrides[get_db]`, so
  `backend/config.py` and the real connection string are untouched.

For the browser walkthrough a TCP-listening PostgreSQL was started on port 5432
with the same bundled binaries (`initdb` + `pg_ctl`, trust auth, the credentials
from `.env.example`), because `backend/config.py` builds a TCP DSN and pgserver's
default is a Unix socket.

## Bugs the test caught

Both were real, both were only reachable through a full request cycle, and
neither would have been found by reading the code.

**`MissingGreenlet` on playlist detail.** Incrementing `view_count` through the
ORM and committing expired `updated_at` (it has a SQL-expression `onupdate`), and
the next attribute read tried to lazy-load synchronously inside async code.
Details and the fix in [03-playlist-invariants.md](03-playlist-invariants.md).

**Shadowed `update`.** The route handler named `update` shadowed SQLAlchemy's
`update()` in the module namespace:
`TypeError: update() missing 1 required positional argument: 'body'`. The import
is now `sql_update`.

## The iTunes mapping was checked against the live API

One real call to `itunes.apple.com/search` confirmed that every field the
importer reads is present and shaped as expected: `trackId`, `trackName`,
`artistName`, `collectionId`, `collectionName`, `trackTimeMillis`,
`artworkUrl100`, `previewUrl`, `releaseDate`, `trackCount`.

The test itself does not hit the network. Earlier revisions stubbed the HTTP
client with `httpx.MockTransport`; the current version seeds `tracks` and
`albums` with SQL, which is simpler and keeps the test independent of the
temporary catalog code.

## Where it lives

`backend/devtools/integration_test.py`, and it goes away with the rest of that
directory. It sits there rather than in a top-level `tests/` because `pgserver`
is a dev-only dependency — adding it to `requirements.txt` would put PostgreSQL
binaries into every install.

That is a real cost: **delete `backend/devtools/` and the only check on
`backend/schema.sql` disappears with it.** Before removing the directory, move
this file somewhere permanent and give `pgserver` a home (a dev extra in
`requirements-dev.txt`, or a `tests/` package with its own environment).

Run it with its own interpreter — the project `.venv` is Python 3.14 and
`pgserver` has no wheel for it:

```bash
uv venv --python 3.12 .venv-test
VIRTUAL_ENV=.venv-test uv pip install pgserver -r requirements.txt
.venv-test/bin/python backend/devtools/integration_test.py
```

## Unrelated environment note

During this work the Vite dev server started answering 404 on `/` while its
`/api` proxy kept working. The build output served by uvicorn at `:8000` was used
instead. Restarting Vite is the fix; nothing in the codebase causes it.

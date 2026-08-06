# 03 · Playlist invariants

Two values in the schema are not self-maintaining. If you write to
`playlist_tracks` outside the API, both silently drift.

## `playlists.total_tracks`

A denormalized copy of `COUNT(*)` over `playlist_tracks`. It exists so a list
screen does not run one `COUNT(*)` per playlist.

**The application owns it.** Exactly two endpoints touch it:

- `POST /api/playlists/:id/tracks` → `+1`
- `DELETE /api/playlists/:id/tracks/:itemId` → `−1`, floored at 0

Nothing else. No trigger, no computed column.

A trigger was considered and skipped. It would keep the value correct under any
write path, but it hides a write behind an insert, and this project already has
one non-obvious DB behaviour (`DEFERRABLE`, below). Two hidden mechanisms in a
one-week codebase is one too many. If direct SQL writes become common, revisit.

The detail response deliberately exposes **both** `totalTracks` and
`items.length`. The dev lab prints them side by side so drift is visible instead
of silent.

## `playlist_tracks.position`

Contiguous from 0, no gaps.

The schema only enforces `UNIQUE (playlist_id, position)` and `position >= 0`.
Contiguity is an application convention, not a constraint. It is maintained so
the frontend can render order with an array index and reorder by array position.

- **Append** takes `MAX(position) + 1`, computed in SQL, not from `total_tracks`.
  Using the counter would corrupt order the moment the counter drifted.
- **Remove** deletes the row, flushes, then renumbers the survivors 0..n-1 in the
  same transaction.

## Reordering, and why the whole array is required

`PUT /api/playlists/:id/tracks/order` takes `{itemIds: [...]}` and rejects
anything that is not a permutation of the current items — 400 otherwise.

A "move item X to position N" API would be a smaller payload but needs the server
to shift everything between the old and new index, and two concurrent moves
interleave into a broken order. Sending the full array makes the request
**declarative**: the client states the final order and the server writes it.

This is only cheap because of the schema:

```sql
UNIQUE (playlist_id, position) DEFERRABLE INITIALLY DEFERRED
```

Deferred means uniqueness is checked at `COMMIT`, not per statement. So the
positions can be rewritten one row at a time inside one transaction and pass
through intermediate states where two rows briefly share a position. Without
`DEFERRABLE`, reordering would need a temporary offset pass (`position += 1000`,
then write the real values) or a single bulk `UPDATE ... FROM (VALUES ...)`.

**Do not drop `DEFERRABLE` from the schema.** It looks like decoration and is not.

## Ownership checks

Every mutating playlist route runs `_owned()` first: 404 if the playlist does not
exist, 403 if it belongs to someone else. `GET /api/playlists/:id` is the
exception — public playlists are readable by anyone, and that read is what
increments `view_count`.

## `view_count` and a bug it caused

Only non-owners increment it. Owners refreshing their own page do not inflate
the number.

The first implementation mutated the ORM object and committed:

```python
playlist.view_count += 1
await db.commit()
```

That crashed with `sqlalchemy.exc.MissingGreenlet` on the next attribute read.
Cause: `updated_at` has a SQL-expression `onupdate`, so after an UPDATE SQLAlchemy
cannot know its new value and expires the attribute — regardless of
`expire_on_commit=False`. Reading it then triggers a lazy refresh, which is
synchronous I/O inside async code.

The fix reorders the work: read only the columns needed for the permission check,
issue a Core `UPDATE`, commit, and *then* load the playlist with `selectinload`.
The ORM object is never in a stale state because it does not exist yet.

The general rule for this codebase: **after committing a write, do not read
attributes backed by server-side defaults or `onupdate`.** Re-query instead.

There is also a naming trap here. The route handler was named `update`, which
shadowed SQLAlchemy's `update()` in the module namespace and produced
`TypeError: update() missing 1 required positional argument: 'body'`. The import
is now aliased to `sql_update`.

# 01 · Auth and accounts

## Why a local account system

The `users` table already had `nickname`, `email` and `password_hash`, but the
code only had Spotify OAuth sessions. So nothing could answer "whose playlist is
this?". Three options were on the table.

| Option | Approach | Outcome |
|---|---|---|
| A | Local accounts (signup / login) | **chosen** |
| B | Passwordless dev users (nickname only) | rejected |
| C | Auto-create a `users` row on Spotify login | rejected |

**Rejecting C is the important part.** As `backend/README.md` states, playback is
being migrated to iTunes, and Spotify OAuth disappears entirely when that lands.
Choosing C would tie the account system to code that is scheduled for deletion.
On top of that, a Spotify app in Development Mode only lets accounts registered
in the dashboard log in, so every new teammate needs their email added by hand.

B is faster today but the work gets redone the moment real login is needed. The
`users` schema requires `password_hash NOT NULL` anyway, so B would have meant
writing dummy values into a column that exists for a reason.

The price of A is **two separate logins**. That is accepted debt — see
[04-dev-only-code.md](04-dev-only-code.md) and
[06-open-questions.md](06-open-questions.md).

## Password hashing — `hashlib.scrypt`

`backend/security.py`, standard library only.

```
scrypt$16384$8$1$<salt hex>$<hash hex>
```

**bcrypt and argon2 were deliberately not added.** Two reasons.

1. Changing `requirements.txt` forces every teammate to reinstall. The `.venv`
   path is already hardcoded in `package.json`, and `dev:api` is already broken
   on Windows (see the Windows note in `backend/README.md`). Adding install steps
   makes that worse.
2. `scrypt` is a memory-hard KDF. It is not a weak choice. The parameters
   `N=2^14, r=8, p=1` use roughly 16 MB.

Parameters are stored **inside** the hash string so the cost can be raised later
without invalidating existing hashes. Verification reads the parameters from the
stored value, so changing the constants does not lock old accounts out. The
encoded string is 113 characters and fits in `VARCHAR(255)`.

Comparison uses `hmac.compare_digest` so timing differences cannot leak the hash.

## Why there are two cookies

| Cookie | Owner | Payload |
|---|---|---|
| `sid` | Spotify | access / refresh tokens |
| `uid` | Local account | `{"userId": n}` |

They were not merged. Merging means touching local-account sessions when Spotify
is removed. Today both live in the same in-memory store in
`backend/sessions.py`, but **the cookie names differ and the value shapes
differ**. If a token expires and `sid` is destroyed, `uid` survives.

`backend/accounts.py` owns the `uid` → `User` conversion. Routers only ever use
`current_user` (401 when absent) or `optional_user` (`None` when absent).

## Why sessions are in memory

Restarting the server logs everyone out. With `--reload` that happens on every
file save. **This was left in knowingly.** Redis or DB-backed sessions are not
warranted at this size, and doing the account work and the session-store swap in
one step would have multiplied the failure modes.

For production the change is confined to `backend/sessions.py`. Keep the
interface (`create_session` / `get_session` / `set_session` / `destroy_session`)
and swap the implementation.

## Why `/api/users/me` returns 200 instead of 401

When logged out it returns `{"loggedIn": false}` with status 200, while every
other protected route returns 401.

**The asymmetry is intentional.** The first screen has to ask "am I logged in?".
If that question is answered with 401, the frontend runs its error handler during
a completely normal flow. Beginners see the console error and read it as a bug.
`/api/auth/me` (the Spotify one) already behaved this way, so the two are
consistent.

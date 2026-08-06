# 04 · Dev-only code

The API inspection page is **not product code**. It must be removable at deploy
time.

## What is temporary

| Location | Contents |
|---|---|
| `client/` | The whole inspection page — `index.html`, `main.jsx`, `api.js`, `styles.css`, `devlab/` |
| `backend/devtools/` | `integration_test.py`. Nothing the running app imports |
| root | `package.json`, `package-lock.json`, `vite.config.js` |

Everything else is product code.

## The removal contract

The design constraint was stated plainly: this has to be easy to delete at deploy
time, so the number of lines product code spends on it was the metric optimized.

**After the merge that number is zero.** Deleting `client/`, `backend/devtools/`
and the three root files leaves the backend untouched — no import to remove, no
call site, no config field. Verified: `from backend.main import app` still yields
20 routes with `client/` and `backend/devtools/` renamed away.

The pre-merge version cost five lines and had a softer `DEV_TOOLS=false` switch
that dropped `/api/catalog/*` without touching code. Both are gone, and the
reason is worth recording:

> `backend/devtools/` used to hold an iTunes client and `/api/catalog/*` — search,
> track listing, album listing — because product code had no way to put rows in
> `tracks` / `albums`. `backend_dev` shipped exactly that as `/api/search`,
> `/api/tracks`, `/api/albums`, so the dev-only copies were deleted and
> `devlab/catalogApi.js` was repointed at the real routes. With no dev-only
> routes left there is nothing for a toggle to toggle, so `install_devtools`,
> `DEV_TOOLS` and `Settings.dev_tools` went with them.

The page is now strictly a client of the public API. That is a better property
than the toggle was: it cannot drift from what the frontend team actually calls,
because it calls the same thing.

`backend/devtools/itunes.py` also depended on the `search_cache` /
`search_cache_items` tables, which `backend_dev` had already dropped
(`3d805a6`). Its 24-hour TTL cache is **not** carried over — `services/search.py`
hits iTunes on every search. See "검색 캐시는 DB 에 두지 않는다" in
`backend/README.md` for why that was a deliberate call and not an oversight.

## Dependency direction

`devlab` imports product code. Product code never imports it. That is what makes
deletion safe: nothing breaks because nothing depends on it.

## Why the request log patches `window.fetch`

The log needs the request body, the response body, the status and the duration
of every `/api/*` call.

The obvious implementation adds an event emitter to `api.js`, and that is what
the first version did. It was replaced because it puts test-only instrumentation
into product code, which then has to be surgically removed later — exactly the
thing the constraint forbids.

`devlab` now wraps `window.fetch` on mount:

- captures both bodies via `res.clone()`, so the real caller still gets an
  unconsumed response
- ignores anything outside `/api/`
- catches calls made outside `api.js` too, since they go through the same
  `fetch` — `catalogApi.js` has its own `request()` and is logged anyway
- disappears completely when the folder is deleted

Monkey-patching a global is normally a bad idea. It is acceptable here precisely
*because* the code is temporary and self-contained, and the alternative was
permanent coupling.

## Why the inspection page exists at all when Swagger does

FastAPI already serves Swagger at `/docs`, and it can call every endpoint with
the session cookie attached. So the page deliberately does not compete on "let
me call this endpoint".

What it adds, aimed at frontend developers who are still learning:

- The **actual `fetch` code** for each call, generated from the real log entry —
  including `credentials: 'same-origin'`, whose omission is the single most
  common cause of a mystery 401.
- Response bodies with a copy button, next to a **key dictionary** giving each
  key's type and meaning (for example, that `totalTracks` is a denormalized copy).
- A panel that **triggers failures on purpose** — 409, 422, 404, 400 — so the
  error shape is something you can see rather than read about.
- A realistic flow (sign up → search → add track → reorder → like) rather than a
  flat endpoint list.

## Dummy accounts

Anything involving another user — 403, `viewCount` incrementing only for
non-owners, liking someone else's public playlist — needs a second account.
Asking a frontend developer to invent and remember credentials for that is
friction, so the page creates them: one click makes `테스터N` /
`testerN@devlab.test`, and the password is the constant `devlab-pw-0000`.

The password is fixed rather than random on purpose. It has to be typeable into
curl or Swagger, and a random one would have to be read off the screen every
time. These accounts only exist in a developer's local database.

The roster lives in `localStorage`, not in a backend table. No product code
changes, nothing to clean up on the server beyond the rows themselves, and it
disappears with the folder. `PATCH /api/users/me` writes back into the roster so
changing an email or password does not orphan the stored credentials.

Deleting a dummy logs in as it and calls `DELETE /api/users/me`, which is also
the cheapest way to exercise the cascade.

Storing the roster client-side has one sharp edge worth knowing: `localStorage`
is keyed by origin **including the port**, while cookies ignore the port. Open
the app on `:5173` and then on `:8000` and you stay logged in but the roster
looks empty. Two mitigations: a logged-in account whose email ends in
`@devlab.test` re-registers itself automatically, and the sequence number is
derived from the roster as well as its own counter, so a collision just returns
409 and the next number is tried.

## Two accounts, one browser

Cookies are per-browser, so two sessions cannot be live in one tab. Switching is
a logout followed by a login, which makes the cross-account cases reachable
**sequentially** rather than side by side.

Viewing both at once still requires a second browser profile or an incognito
window. This is a real limitation, not an oversight; a header-based session
override was rejected because it would mean adding an auth bypass to product
code.

## `client/index.html`

Nothing special is left in it. The merge deleted both the Spotify SDK `<script>`
tag and the stub that went with it:

> ```html
> <script>window.onSpotifyWebPlaybackSDKReady = () => {}</script>
> ```
>
> The Spotify SDK script calls that global when it loads. On the API tab
> `usePlayer` never mounts, so the callback would be undefined and the SDK throws
> an uncaught exception into the console. The empty stub silences it.

The view switch between "Spotify 플레이어" and "API 확인" went too — with one
view left, `Root.jsx` was deleted and `main.jsx` renders `<ApiLab />` directly.

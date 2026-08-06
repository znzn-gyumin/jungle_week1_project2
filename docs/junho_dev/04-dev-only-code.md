# 04 · Dev-only code

The API inspection page and the iTunes search it depends on are **not product
code**. They ship on this branch and must be removable before merge.

## What is temporary

| Location | Contents |
|---|---|
| `backend/devtools/` | iTunes search + `/api/catalog/*` |
| `client/src/devlab/` | The whole inspection page, including the view switch and its CSS |

Everything else is product code.

## The removal contract

The design constraint was stated plainly: this has to be easy to delete at deploy
time. So the number of lines product code spends on it is the metric that was
optimized, and it is five.

| File | Lines |
|---|---|
| `backend/main.py` | `from .devtools import install_devtools`, `install_devtools(app)` |
| `client/src/main.jsx` | `import DevLabRoot ...`, `<DevLabRoot app={<App />} />` |
| `backend/config.py` | `dev_tools: bool = True` |

`client/src/App.jsx`, `client/src/api.js` and `client/src/styles.css` are
**untouched**. Earlier iterations did modify all three; they were reverted once
the constraint was known.

Removal was rehearsed on a copy of the repo: delete the two directories, remove
those five lines, restore `main.jsx` to render `<App />`. Result — backend
imports with 25 product routes and 0 catalog routes, `npm run build` passes, and
grepping for `devlab|devtools|ApiLab` returns nothing.

There is a second, softer switch: `DEV_TOOLS=false` in `.env` drops
`/api/catalog/*` without touching code. Useful for a staging deploy that should
not expose the temporary endpoints while the branch is still in flight.

## Dependency direction

`devtools` and `devlab` import product code. Product code never imports them
(other than the five lines above). That is what makes deletion safe: nothing
breaks because nothing depends on them.

`backend/devtools/catalog.py` reuses `backend.serializers` and
`backend.accounts`. That is fine — it is the allowed direction.

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
- works for the Spotify screens too, since they go through the same `fetch`
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

## Two accounts, one browser

Cookies are per-browser, so two sessions cannot be live in one tab. Switching is
a logout followed by a login, which makes the cross-account cases reachable
**sequentially** rather than side by side.

Viewing both at once still requires a second browser profile or an incognito
window. This is a real limitation, not an oversight; a header-based session
override was rejected because it would mean adding an auth bypass to product
code.

## `client/index.html`

One line belongs to this feature:

```html
<script>window.onSpotifyWebPlaybackSDKReady = () => {}</script>
```

The Spotify SDK script calls that global when it loads. On the API tab
`usePlayer` never mounts, so the callback would be undefined and the SDK throws
an uncaught exception into the console. The empty stub silences it. `usePlayer`
overwrites the global later and its `window.Spotify` check makes the overwrite
safe either way.

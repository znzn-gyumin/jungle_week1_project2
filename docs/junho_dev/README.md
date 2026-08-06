# Design rationale — junho_dev

`backend/README.md` documents **what exists and how it behaves**.
This folder documents **why it was built that way**. The two should not overlap.

Audience: whoever picks up this branch, and any AI reading the repo for the first
time. The goal is to stop people from re-proposing options that were already
considered and rejected.

Written 2026-08-06 · branch `junho_dev`

## Merged into `backend_dev` — 2026-08-06

These documents were written before the merge, when Spotify OAuth and a stub
`/api/search` still existed. The merge resolved several things they describe as
open:

| Then | Now |
|---|---|
| Spotify OAuth (`sid` cookie) alongside local accounts | Spotify removed entirely. `uid` is the only session |
| Nothing in product code wrote to `tracks` / `albums` | `/api/search` upserts both, via `services/search.py` |
| `/api/catalog/*` in `backend/devtools/` | deleted; the product routes replaced it |
| `DEV_TOOLS` toggle, `install_devtools` | deleted — no dev-only routes remain to toggle |
| `client/src/App.jsx` (Spotify player) | deleted; `client/` is the API Lab only |

Paragraphs affected below were rewritten in place, with the superseded reasoning
kept. Everything in [03-playlist-invariants.md](03-playlist-invariants.md) and
[05-verification.md](05-verification.md) still stands unchanged.

## Documents

| File | Contents |
|---|---|
| [01-auth-and-accounts.md](01-auth-and-accounts.md) | Why a local account system, password hashing, two cookies |
| [02-api-design.md](02-api-design.md) | Router split, camelCase layer, error shape, idempotent PUT |
| [03-playlist-invariants.md](03-playlist-invariants.md) | Who owns `total_tracks` and `position` |
| [04-dev-only-code.md](04-dev-only-code.md) | `devtools` / `devlab` isolation and its reasoning |
| [05-verification.md](05-verification.md) | How the integration tests ran and what they caught |
| [06-open-questions.md](06-open-questions.md) | What is still undecided and what to weigh |

## Editing these documents

- When a decision **changes**, rewrite the paragraph and note what changed.
  Do not delete the old reasoning.
- Do not write anything the code already tells you. Function lists and
  signatures do not belong here.
- Always record what was considered and rejected. That is the point of this folder.

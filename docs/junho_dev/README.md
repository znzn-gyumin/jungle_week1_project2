# Design rationale — junho_dev

`backend/README.md` documents **what exists and how it behaves**.
This folder documents **why it was built that way**. The two should not overlap.

Audience: whoever picks up this branch, and any AI reading the repo for the first
time. The goal is to stop people from re-proposing options that were already
considered and rejected.

Written 2026-08-06 · branch `junho_dev`

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

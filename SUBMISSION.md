# Ajaia Docs — AI-Native Full Stack Developer Assessment

## Overview

A lightweight collaborative document editor inspired by Google Docs: create, rename, edit, save and reopen rich-text documents; import `.txt`/`.md` files as editable documents; share with other users as editor or viewer; everything persists across refresh. Built with React 19 + Vite, Tiptap v3, one Qoder Sites Edge Function and managed Postgres.

## Live demo

> **Deployment status: blocked by hosting plan.** The app is complete, tested and packaged; the Qoder Sites draft is prepared. The current Qoder plan only supports static website deployments, and this app requires database + functions, so publication is paused until the plan is upgraded. The live URL and video link will be filled in here once published.

- **Live URL:** _pending publication_
- **Demo accounts** (password for all: `ajaia-demo`): `alice` (Alice Johnson), `bob` (Bob Smith), `carol` (Carol Lee). One-click sign-in buttons on the login page.
- **Walkthrough video:** _pending recording_ (script: [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md))

Seeded so reviewers immediately see both sides of sharing: Alice owns *Welcome to Ajaia Docs* (Bob = editor, Carol = viewer); Bob owns a private *Engineering notes*; Carol owns *Team reading list* (Alice = viewer).

## Core tasks — what's working

| Requirement | Status |
| --- | --- |
| Create / rename / edit / save / reopen documents | Working — autosave (1.5 s) + Ctrl/Cmd+S, verified across refresh |
| Rich text: bold, italic, underline, headings, lists | Working — plus strikethrough, code, quote, code block, undo/redo |
| File upload → editable document | Working — `.txt` and `.md` up to 256 KB; Markdown formatting preserved; types stated in UI + README |
| Sharing: owner, grant access, owned vs shared | Working — editor/viewer roles, role changes, revoke; separate workspace tabs with role + owner; server-enforced |
| Persistence across refresh with formatting | Working — Tiptap JSON in Postgres jsonb; verified by reload test |
| Setup/run instructions | [README.md](README.md) |
| Working deployment | **Blocked** — see deployment status above |
| Validation / error handling | Working — server allowlists + bounded bodies; client error/empty/retry states; uniform error codes |
| ≥1 meaningful automated test | Working — **9 tests, all passing** (`npm test`) |
| Architecture note | [ARCHITECTURE.md](ARCHITECTURE.md) |
| AI-native workflow note | [AI_WORKFLOW.md](AI_WORKFLOW.md) |

## Intentional scope cuts

- **Import, not attachment storage.** Files are converted to editable content client-side; no binary files are stored. This covers the upload requirement with fewer moving parts. `.docx` is not supported (`.txt`/`.md` are).
- **Demo auth, not signup.** Three seeded users (explicitly allowed by the assignment); no registration/reset/email. Passwords use PBKDF2 (600k iterations); sessions are opaque tokens stored as SHA-256 digests in a `__Host-` cookie.
- **Async sharing, not real-time co-editing.** Concurrent edits are handled with version-conditional saves: a stale save returns 409 and the UI shows a conflict banner with "Load latest version" — no silent overwrites.
- **100-document list cap.** No search or pagination.

## If I had 2–4 more hours

1. `.docx` import (same client-side pipeline via a converter).
2. Full-text search + pagination on the workspace.
3. Share-by-link with role presets.
4. Real-time presence/co-editing (or at least "someone else is editing" indicators).

## Engineering quality

- **Tests:** `test/check.mjs` — 9 `node:test` cases running the *real* Function routes against an in-memory adapter: login failures, session revocation, create→save→reopen round-trip, stale-version 409, owned/shared isolation, grant→viewer 403→upgrade→revoke, owner-only share/delete, self-share rejection, input validation, import metadata. Run: `npm test`.
- **Browser validation:** every core flow exercised end-to-end, including a live conflict-injection test (external version bump → 409 → banner → recovery) and reload persistence.
- **Build:** `npm run build` = `tsc --noEmit` + Vite production build, clean.
- **Error handling:** bounded JSON bodies (byte-counted), content node/mark allowlists, 5000-node budget, uniform `{error: code}` responses; client maps codes to human messages with loading/empty/error-retry states.

## Deliverables map

| Deliverable | Location |
| --- | --- |
| Source code | this folder (`src/`, `functions/`, `schema.sql`, `test/`, `dev/`) |
| Setup/run instructions | [README.md](README.md) |
| Architecture note | [ARCHITECTURE.md](ARCHITECTURE.md) |
| AI workflow note | [AI_WORKFLOW.md](AI_WORKFLOW.md) |
| This submission | [SUBMISSION.md](SUBMISSION.md) |
| Screenshots | [docs/screenshots/](docs/screenshots/) |
| Video script / shot list | [docs/VIDEO_SCRIPT.md](docs/VIDEO_SCRIPT.md) |
| Live URL / video link | filled in above after publication / recording |

When assembling the submission folder, exclude `node_modules/`, `dist/` and `.qoder.site` internals; everything else is source or docs.
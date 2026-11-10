# Architecture note

## Overview

Ajaia Docs is a static React SPA plus one Vercel serverless function backed by Neon Postgres. Reviewers need nothing but a browser and the demo credentials — no paid services.

```
Browser (React SPA, dist/)
  │  same-origin fetch /functions/v1/app/api/*
  ▼
Vercel rewrite ──► api/index.mjs (Web fetch bridge)
                    │  routes.mjs — all business logic + authorization
                    │  neon.mjs — query-builder adapter over @neondatabase/serverless
                    ▼
                 Neon Postgres (app schema: users, sessions, documents, shares)
```

- **Frontend:** React 19 + Vite 8, react-router (SPA fallback enabled), Tiptap v3 for rich text, `marked` for Markdown import, sonner for toasts. Content is stored as Tiptap JSON, so formatting round-trips exactly.
- **Backend:** one Vercel serverless entry at `api/index.mjs` adapts Vercel Web `Request`/`Response` objects to the application route contract. `functions/routes.mjs` holds every route and receives an injected `db` client; `functions/neon.mjs` implements that query contract over Neon in production, while `dev/local.mjs` provides the in-memory adapter for local dev/tests.
- **Local dev:** `node dev/local.mjs` starts the real routes over an in-memory fixture database plus Vite with a same-origin proxy. Nothing in `dev/` is deployed.

## Data model (`schema.sql`)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `app.users` | Seeded demo accounts | `username` unique, `password_salt/hash/iterations` |
| `app.sessions` | Server-side sessions | `token_digest` PK (SHA-256), `user_id`, `expires_at`, `revoked_at` |
| `app.documents` | Documents | `owner_id`, `title`, `content` jsonb, `excerpt`, `imported_from`, `version` |
| `app.shares` | Grants | `document_id` + `user_id` unique, `role` ∈ editor/viewer, cascade on document delete |

## Authentication (app-owned)

Chosen over platform identity so reviewers sign in with seeded demo users — the assignment explicitly allows mocked users.

- Passwords: PBKDF2-HMAC-SHA256, 600k iterations (WebCrypto). Only salt/hash/iterations are stored. Unknown usernames run a dummy derivation so response timing doesn't reveal account existence; comparisons are timing-safe.
- Sessions: opaque 32-byte random token in a `__Host-ajaia_docs.session` cookie (`HttpOnly; Secure; SameSite=Lax; Path=/`). The DB stores only the SHA-256 digest, with a 12-hour expiry and explicit revocation on logout. Every request re-validates cookie → digest → not revoked/expired.
- Vercel keeps the app's own Cookie header same-origin through the rewrite; platform identity is never used.

## Authorization

All checks live in the Function (`function_backend` model — the database is not directly exposed to browsers):

- Read/write a document: owner or an explicit share row; everyone else gets 404 (no existence leak).
- Viewer → write attempts get 403; the client also renders a read-only editor.
- Manage shares and delete document: owner only. Sharing with yourself is rejected.
- The document list is assembled server-side from owned rows + the caller's share rows, so users never see others' private documents.

## Saving & concurrency

- `PATCH /api/documents/:id` requires the client's `version`; the update is conditional on `id AND version`, then bumps it. A stale version matches zero rows → **409 write_conflict**.
- The client autosaves 1.5 s after edits (and on Ctrl/Cmd+S). On 409 it stops autosaving, keeps the user's unsaved text, and shows a banner with "Load latest version" — no silent overwrites, no data loss without a choice.
- A `beforeunload` guard warns when unsaved changes exist.

## Import pipeline

`.txt`/`.md` (≤256 KB) is read **client-side**: plain text becomes paragraphs/hard breaks; Markdown goes through `marked` → HTML → a temporary Tiptap editor → JSON. The resulting document JSON is POSTed like any new document, with `imported_from` set to the filename. No file bytes are stored — this avoids a Storage capability entirely (intentional scope cut). `.docx` was cut to keep the timebox; the same pipeline could accept it via a converter later.

## Validation & error handling

- Server: JSON body bounded by bytes actually read (8 KB default, 512 KB for documents), content-type checked, UTF-8 strictly decoded. Document JSON is walked against a node/mark allowlist with a 5000-node budget; titles are trimmed and length-capped. Errors are uniform `{ error: code }` JSON with proper status (400/401/403/404/409/413/503).
- Client: typed API client maps error codes to human messages; loading/empty/error-with-retry states on every page; import validates type/size before reading.
- CSRF: `SameSite=Lax` cookies plus the gateway's same-origin write enforcement. No separate CSRF token or `APP_ORIGIN` secret — a deliberate simplicity tradeoff for this demo (noted as future hardening).

## Tests

`test/check.mjs` — 9 `node:test` cases run the **real** `routes.mjs` against the in-memory adapter: health, login failures, session lifecycle/revocation, create→save→reopen round-trip + stale-version 409, owned/shared list isolation, share grant→viewer 403→upgrade→revoke, owner-only share/delete + self-share rejection, input validation, import metadata. Browser validation additionally covered the full UI flows including a live conflict-injection test.

## Tradeoffs & next steps

- Single serverless function + jsonb content keeps the moving parts few; the Neon adapter avoids an ORM or migration framework.
- No real-time collaboration (see conflict handling instead), no search/pagination (100-doc cap), no binary attachments, demo auth only.
- With 2–4 more hours: `.docx` import, full-text search + pagination, share-by-link, and a CSRF token if the app ever leaves the same-origin gateway.

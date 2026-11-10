# Ajaia Docs

A lightweight collaborative document editor — create, format, import, share and reopen rich-text documents. Built for the Ajaia AI-Native Full Stack Developer assessment.

**Deployment:** ready for Vercel + Neon. After deployment, no account or payment is needed for reviewers — sign in with a demo user below.

## Demo accounts

| Username | Password | Name |
| --- | --- | --- |
| `alice` | `ajaia-demo` | Alice Johnson |
| `bob` | `ajaia-demo` | Bob Smith |
| `carol` | `ajaia-demo` | Carol Lee |

The login page has one-click buttons for each. Seeded data: Alice owns *Welcome to Ajaia Docs* (shared with Bob as editor, Carol as viewer), Bob owns a private *Engineering notes*, Carol owns *Team reading list* (shared with Alice as viewer). Sign in as different users to see both sides of sharing.

## Features

- **Documents** — create, rename, edit, delete, reopen. Autosave (1.5 s debounce) plus Ctrl/Cmd+S; content and formatting persist across refresh.
- **Rich text** — bold, italic, underline, strikethrough, inline code, H1–H3, bulleted/numbered lists, blockquote, code block, horizontal rule, undo/redo (Tiptap).
- **Import** — turn a file into a new editable document. Supported: **`.txt` and `.md`, up to 256 KB**. Markdown formatting (headings, lists, bold, italic…) is preserved. The source filename is shown on the document.
- **Sharing** — the owner grants any demo user *Can edit* or *View only* access, changes roles, or revokes. The workspace separates **My documents** from **Shared with me** (with role and owner). Viewers get a read-only editor; the server enforces the same boundary.
- **Conflict safety** — saves are version-conditional. If the document changed elsewhere, autosave stops and a banner offers to load the latest version instead of overwriting.

## Run locally

Requires Node `^22.13.0 || >=24.0.0` (checked automatically).

```sh
npm ci
npm run dev
```

Open the loopback URL Vite prints (default `http://127.0.0.1:5173`). Local dev runs the **real** business routes against an in-memory database with the same seed data — no cloud services needed. Data resets when the process restarts.

```sh
npm test        # 9 backend tests (node:test) against the real routes
npm run build   # type-check + production build to dist/
```

## Project structure

```
api/              Vercel serverless entry bridging Node requests to the routes
functions/        Platform-independent routes, Neon adapter, sessions and passwords
src/              React app: pages (Login, Workspace, EditorPage),
                  components (ShareDialog, ImportDialog), lib (editor, import), api client
schema.sql        Postgres schema + seed data (run in the Neon SQL Editor)
test/check.mjs    Backend test suite
dev/              Local-only fixture runtime + Vite proxy (never deployed)
docs/             Screenshots, video script
```

## Deployment

The app is set up for Vercel + Neon:

1. Push the repository to GitHub.
2. Create a Neon project, open the SQL Editor, and run `schema.sql`.
3. Import the repository into Vercel and set `DATABASE_URL` to the Neon connection string.
4. Deploy and open the generated URL.

Vercel builds the Vite SPA from `dist/` and routes `/functions/v1/app/*` to `api/index.mjs`. The Neon adapter uses the same query contract as the local fixture adapter, so `routes.mjs` stays unchanged. See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and [SUBMISSION.md](SUBMISSION.md) for scope notes.

## Scope cuts (intentional)

- **Import instead of attachment storage** — files are converted to editable content client-side; no binary attachments are stored. `.docx` is not supported (`.txt`/`.md` cover the import requirement).
- **Demo auth, not signup** — three seeded users; no registration, password reset or email.
- **No real-time co-editing** — sharing is async; concurrent edits are handled with optimistic-concurrency conflicts, not live cursors.
- **List cap** — the workspace loads the 100 most recently updated documents; no search/pagination.

More detail in [SUBMISSION.md](SUBMISSION.md). Template origins: [PROVENANCE.md](PROVENANCE.md).
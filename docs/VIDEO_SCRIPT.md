# Walkthrough video script (3–5 min)

Record your screen at desktop width. Demo account passwords are all `ajaia-demo`. suggested total: ~4:00.

## 0:00–0:30 — Intro + live URL

- Show the live site URL on screen; say what this is: "A lightweight collaborative document editor — create, format, import and share rich-text documents. React SPA, one Edge Function, managed Postgres, deployed on Qoder Sites."
- "Reviewers need nothing but a browser — three seeded demo users, no signup, no paid services."

## 0:30–1:00 — Sign in + workspace

- Open the live URL → login page. Click **Alice Johnson** (one-click demo sign-in).
- Point out the two tabs: **My documents** vs **Shared with me** (role + owner shown).
- Note: "Bob's private document is not visible to Alice — the server only returns owned and explicitly shared documents."

## 1:00–2:00 — Create, format, save, reopen

- Click **New document**, give it a title.
- Type a line; apply **bold**, *italic*, underline; add an H1/H2 and a bulleted list using the toolbar.
- Point at the save status: "Autosave saves 1.5 seconds after I stop typing; Ctrl+S also works."
- **Reload the page** — show the content and formatting persist. "Content is stored as Tiptap JSON in Postgres, so formatting round-trips exactly."

## 2:00–2:40 — Sharing + roles

- Open **Welcome to Ajaia Docs** → **Share**. Show Bob = Can edit, Carol = View only.
- Change a role or remove/re-add a person to show it's live.
- Sign out, sign in as **Carol** → open Welcome: "Viewers get a read-only editor — and the server enforces it too, a viewer write attempt returns 403."
- Show Carol's own document is fully editable.

## 2:40–3:10 — Import

- Back as Alice (or Carol), click **Import file**, choose a `.md` file.
- Show the new document with headings/lists/bold preserved and the "Imported from …" note.
- "Supported types are .txt and .md up to 256 KB, stated in the UI and README. Files are converted client-side into editable content — no binary storage needed."

## 3:10–3:40 — Engineering quality

- Show `npm test` running: **9/9 passing** — "tests run the real route code against an in-memory adapter: auth, session revocation, sharing boundaries, version conflicts, validation."
- Briefly show `ARCHITECTURE.md`: app-owned demo auth (PBKDF2 + hashed session tokens), version-conditional saves → 409 conflict banner instead of silent overwrites.
- Optional: show the conflict banner live (edit the same doc in two windows).

## 3:40–4:00 — Scope cuts + wrap

- "Intentional cuts: import instead of attachment storage, demo auth instead of signup, async sharing with conflict detection instead of real-time co-editing. With 2–4 more hours I'd add .docx import, search/pagination, and share-by-link."
- "Source, README, architecture and AI-workflow notes are in the submission folder. Thanks!"

## Shot checklist

- [ ] Login page + one-click sign-in
- [ ] Workspace: both tabs, role/owner badges
- [ ] Editor: toolbar formatting, save status
- [ ] Page reload → persistence
- [ ] Share dialog: roles, remove/re-add
- [ ] Carol's view-only banner
- [ ] Import dialog → formatted result
- [ ] Terminal: `npm test` 9/9
- [ ] Live URL visible at start and end
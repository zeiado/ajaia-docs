# AI-native workflow note

## Tools used

- **Qoder Desktop agent** as the primary pair-programmer: planning, scaffolding, and implementing the full stack (schema, Edge Function routes, auth, React pages, Tiptap editor, import pipeline, CSS), plus the test suite and these docs.
- **Qoder Sites plugin** for project scaffolding, design registration, database migrations and publication — keeping deployment inside one toolchain with no external accounts.
- **Browser automation (browser-use MCP)** for end-to-end validation: the agent drove a real browser through every core flow against the local dev server.
- **node:test** for the automated backend suite; **tsc + Vite build** as a second correctness gate.

## Where AI sped things up

- **Full-stack scaffolding in one pass:** schema + seed data, the Function routes, session/password modules, and the React pages were generated together and kept consistent (shared types, error codes, route paths), which is the slowest part to hand-write.
- **Test suite:** the 9-case backend suite was generated alongside the routes, covering the security-relevant paths (viewer 403, owner-only shares, stale-version 409, session revocation) rather than just happy paths.
- **Local fixture runtime:** an in-memory adapter implementing the same query interface as the platform client, so the *real* route code runs locally and in tests with no cloud dependency.
- **Browser validation:** the agent executed and evidenced the flows (login, edit, autosave, refresh persistence, share grant/revoke, import, viewer read-only, conflict recovery) instead of me clicking through manually.

## What I changed or rejected

- **Rejected platform identity** for login. The default would have required reviewers to have a Qoder account; the assignment allows seeded users, so I had the agent build app-owned demo auth (PBKDF2 + digest sessions) instead.
- **Rejected binary file storage.** Instead of enabling a Storage capability for attachments, I scoped "upload" to client-side `.txt`/`.md` import that converts files into editable documents — fewer moving parts, and the imported result is actually editable. `.docx` was cut explicitly.
- **Rejected the link mark** in the editor config so the client can never produce content the server's mark allowlist rejects.
- **Rejected a CSRF-token/`APP_ORIGIN` setup** in favor of `SameSite=Lax` + the gateway's same-origin write checks, and documented the tradeoff rather than hiding it.
- **Fixed agent mistakes I caught:** a missing `ReactNode` type import, a `server.close` callback invoked immediately instead of passed, and a stale version label in the editor footer. I also had the agent remove the starter's leftover Chinese notes-app code rather than leaving dead files around.

## How correctness was verified

1. **Automated:** `npm test` — 9/9 passing against the real routes; `npm run build` — type-check + production build clean.
2. **End-to-end in a real browser:** unauthenticated redirect, demo + manual login (including wrong-password error), owned/shared list isolation, rich-text rendering, editing + autosave, **reload persistence**, share revoke/re-grant, `.md` import with formatting preserved, viewer read-only enforcement, and owner-only controls.
3. **Conflict injection:** simulated a second editor bumping the document version via the API, then typed in the open editor — autosave correctly hit 409, showed the conflict banner, and "Load latest version" recovered without overwriting.
4. **Post-deploy:** re-ran the core flows on the live URL, specifically checking that the session cookie survives the platform gateway (the main deployment risk).
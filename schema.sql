CREATE SCHEMA IF NOT EXISTS app;

-- Ajaia Docs schema (function_backend: all access enforced in the Function)
CREATE TABLE app.users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_salt text NOT NULL,
  password_hash text NOT NULL,
  password_iterations integer NOT NULL DEFAULT 600000,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.sessions (
  token_digest text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE app.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES app.users (id),
  title text NOT NULL,
  content jsonb NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  excerpt text NOT NULL DEFAULT '',
  imported_from text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_owner_updated_idx ON app.documents (owner_id, updated_at);

CREATE TABLE app.shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES app.documents (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app.users (id),
  role text NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, user_id)
);
CREATE INDEX shares_user_idx ON app.shares (user_id);

-- Seeded demo accounts. All three share the public demo password "ajaia-demo"
-- (PBKDF2-SHA256, 600000 iterations). These are intentionally public fixtures.
INSERT INTO app.users (id, username, display_name, password_salt, password_hash, password_iterations) VALUES
  ('11111111-1111-4111-8111-111111111111', 'alice', 'Alice Johnson', '3CfizoanuTUVTDArZ2YZug==', 'iDj4wAetb38KR3JP9BGhgf1e/K0m8ltjiqdZM+wM73Q=', 600000),
  ('22222222-2222-4222-8222-222222222222', 'bob', 'Bob Smith', '3CfizoanuTUVTDArZ2YZug==', 'iDj4wAetb38KR3JP9BGhgf1e/K0m8ltjiqdZM+wM73Q=', 600000),
  ('33333333-3333-4333-8333-333333333333', 'carol', 'Carol Lee', '3CfizoanuTUVTDArZ2YZug==', 'iDj4wAetb38KR3JP9BGhgf1e/K0m8ltjiqdZM+wM73Q=', 600000);

-- Seeded documents so reviewers immediately see owned vs shared behavior.
INSERT INTO app.documents (id, owner_id, title, content, excerpt, version) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Welcome to Ajaia Docs',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Welcome to Ajaia Docs"}]},{"type":"paragraph","content":[{"type":"text","text":"A "},{"type":"text","marks":[{"type":"bold"}],"text":"lightweight collaborative editor"},{"type":"text","text":" for teams that move fast. Use the toolbar for "},{"type":"text","marks":[{"type":"italic"}],"text":"italic"},{"type":"text","text":", "},{"type":"text","marks":[{"type":"underline"}],"text":"underline"},{"type":"text","text":", headings and lists."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Things to try"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Edit this document and save â€” changes persist across refresh."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Share it with Bob or Carol using the Share button."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Import a .txt or .md file from the workspace."}]}]}]},{"type":"paragraph","content":[{"type":"text","text":"Sign in as another demo user to see the shared side of the workflow."}]}]}]'::jsonb,
   'A lightweight collaborative editor for teams that move fast. Use the toolbar for italic, underline, headings and lists.', 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'Engineering notes â€” sprint 12',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Engineering notes â€” sprint 12"}]},{"type":"paragraph","content":[{"type":"text","text":"Private notes owned by Bob. Other users cannot see this document unless Bob shares it."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"This sprint"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Ship the editor slice"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Review sharing access checks"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Write the architecture note"}]}]}]}]}'::jsonb,
   'Private notes owned by Bob. Other users cannot see this document unless Bob shares it.', 1),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'Team reading list',
   '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Team reading list"}]},{"type":"paragraph","content":[{"type":"text","text":"Owned by Carol, shared with Alice as view-only. Viewers can read but not edit."}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Designing Data-Intensive Applications"},{"type":"text","text":" â€” Martin Kleppmann"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"The Pragmatic Programmer"},{"type":"text","text":" â€” Hunt & Thomas"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"A Philosophy of Software Design"},{"type":"text","text":" â€” John Ousterhout"}]}]}]}]}'::jsonb,
   'Owned by Carol, shared with Alice as view-only. Viewers can read but not edit.', 1);

INSERT INTO app.shares (id, document_id, user_id, role) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'editor'),
  ('a2222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'viewer'),
  ('a3333333-3333-4333-8333-333333333333', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer');

// Local fixtures only. This directory stays outside both upload roots.
// Runs the real application routes against an in-memory database seeded with
// the same demo accounts/documents as schema.sql. No cloud credentials.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export class LocalError extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }

export const DEMO_USERS = [
  { id: '11111111-1111-4111-8111-111111111111', username: 'alice', display_name: 'Alice Johnson', password_salt: '3CfizoanuTUVTDArZ2YZug==', password_hash: 'iDj4wAetb38KR3JP9BGhgf1e/K0m8ltjiqdZM+wM73Q=', password_iterations: 600000 },
  { id: '22222222-2222-4222-8222-222222222222', username: 'bob', display_name: 'Bob Smith', password_salt: '3CfizoanuTUVTDArZ2YZug==', password_hash: 'iDj4wAetb38KR3JP9BGhgf1e/K0m8ltjiqdZM+wM73Q=', password_iterations: 600000 },
  { id: '33333333-3333-4333-8333-333333333333', username: 'carol', display_name: 'Carol Lee', password_salt: '3CfizoanuTUVTDArZ2YZug==', password_hash: 'iDj4wAetb38KR3JP9BGhgf1e/K0m8ltjiqdZM+wM73Q=', password_iterations: 600000 },
];

const WELCOME_CONTENT = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Welcome to Ajaia Docs' }] },
  { type: 'paragraph', content: [
    { type: 'text', text: 'A ' }, { type: 'text', marks: [{ type: 'bold' }], text: 'lightweight collaborative editor' },
    { type: 'text', text: ' for teams that move fast. Use the toolbar for ' }, { type: 'text', marks: [{ type: 'italic' }], text: 'italic' },
    { type: 'text', text: ', ' }, { type: 'text', marks: [{ type: 'underline' }], text: 'underline' }, { type: 'text', text: ', headings and lists.' },
  ] },
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Things to try' }] },
  { type: 'bulletList', content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edit this document and save — changes persist across refresh.' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Share it with Bob or Carol using the Share button.' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Import a .txt or .md file from the workspace.' }] }] },
  ] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Sign in as another demo user to see the shared side of the workflow.' }] },
] };

const ENGINEERING_CONTENT = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Engineering notes — sprint 12' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Private notes owned by Bob. Other users cannot see this document unless Bob shares it.' }] },
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'This sprint' }] },
  { type: 'orderedList', content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship the editor slice' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Review sharing access checks' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Write the architecture note' }] }] },
  ] },
] };

const READING_CONTENT = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Team reading list' }] },
  { type: 'paragraph', content: [{ type: 'text', text: 'Owned by Carol, shared with Alice as view-only. Viewers can read but not edit.' }] },
  { type: 'bulletList', content: [
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Designing Data-Intensive Applications' }, { type: 'text', text: ' — Martin Kleppmann' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'The Pragmatic Programmer' }, { type: 'text', text: ' — Hunt & Thomas' }] }] },
    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'A Philosophy of Software Design' }, { type: 'text', text: ' — John Ousterhout' }] }] },
  ] },
] };

function seedDocuments() {
  const now = Date.now();
  const doc = (id, ownerId, title, content, excerpt, ageMs) => ({
    id, owner_id: ownerId, title, content, excerpt, imported_from: null, version: 1,
    created_at: new Date(now - ageMs).toISOString(), updated_at: new Date(now - ageMs).toISOString(),
  });
  return [
    doc('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', DEMO_USERS[0].id, 'Welcome to Ajaia Docs', WELCOME_CONTENT, 'A lightweight collaborative editor for teams that move fast. Use the toolbar for italic, underline, headings and lists.', 3 * 86400000),
    doc('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', DEMO_USERS[1].id, 'Engineering notes — sprint 12', ENGINEERING_CONTENT, 'Private notes owned by Bob. Other users cannot see this document unless Bob shares it.', 86400000),
    doc('cccccccc-cccc-4ccc-8ccc-cccccccccccc', DEMO_USERS[2].id, 'Team reading list', READING_CONTENT, 'Owned by Carol, shared with Alice as view-only. Viewers can read but not edit.', 2 * 86400000),
  ];
}

function seedShares() {
  const created_at = new Date().toISOString();
  return [
    { id: 'a1111111-1111-4111-8111-111111111111', document_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: DEMO_USERS[1].id, role: 'editor', created_at },
    { id: 'a2222222-2222-4222-8222-222222222222', document_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: DEMO_USERS[2].id, role: 'viewer', created_at },
    { id: 'a3333333-3333-4333-8333-333333333333', document_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', user_id: DEMO_USERS[0].id, role: 'viewer', created_at },
  ];
}

export function createMemoryRuntime() {
  const tables = { users: [], sessions: [], documents: [], shares: [] };
  function reset() {
    tables.users = DEMO_USERS.map(u => ({ ...u, created_at: new Date().toISOString() }));
    tables.sessions = [];
    tables.documents = seedDocuments();
    tables.shares = seedShares();
  }
  reset();

  const db = { from(table) {
    if (!(table in tables)) throw new LocalError('invalid_table', 400);
    const filters = [], order = [];
    let mode = 'read', values, conflict, columns, count = 1000;
    const query = {
      select(value) { columns = value; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, list) { filters.push(row => list.includes(row[key])); return query; },
      order(key, options = {}) { order.push([key, options.ascending !== false]); return query; },
      limit(value) { count = value; return query; },
      insert(value) { mode = 'insert'; values = value; return query; },
      insertIfAbsent(value, options) { mode = 'insert'; values = value; conflict = options.onConflict.split(','); return query; },
      update(value) { mode = 'update'; values = value; return query; },
      delete() { mode = 'delete'; return query; },
      then(fulfilled, rejected) {
        return Promise.resolve().then(() => {
          let result;
          if (mode === 'insert') {
            if (conflict && tables[table].some(row => conflict.every(key => row[key] === values[key]))) result = [];
            else {
              const row = { id: randomUUID(), created_at: new Date().toISOString(), ...values };
              tables[table].push(row);
              result = [row];
            }
          } else {
            result = tables[table].filter(row => filters.every(match => match(row)));
            if (mode === 'update') result.forEach(row => Object.assign(row, values));
            if (mode === 'delete') tables[table] = tables[table].filter(row => !result.includes(row));
          }
          for (const [key, asc] of [...order].reverse()) result = [...result].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (asc ? 1 : -1));
          result = result.slice(0, count).map(row => columns && columns !== '*'
            ? Object.fromEntries(columns.split(',').map(key => [key.trim(), row[key.trim()]]))
            : { ...row });
          return { data: result, error: null };
        }).then(fulfilled, rejected);
      },
    };
    return query;
  } };

  return { db, tables, reset };
}

const controls = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local fixtures</title><style>body{font:16px/1.7 system-ui;max-width:640px;margin:50px auto;padding:20px;color:#1c1917}button{font:inherit;padding:10px 16px;margin:6px;border:1px solid #d6d3d1;background:#faf9f7;border-radius:8px;cursor:pointer}p{color:#78716c}</style><h1>Local fixture mode</h1><p>In-memory data seeded with the demo accounts (alice / bob / carol, password <code>ajaia-demo</code>). Nothing here connects to the cloud. Data resets when the dev server restarts.</p><p><a href="/">← Back to the app</a></p><button id="reset">Reset demo data</button><p id="status" role="status"></p><script>document.querySelector('#reset').onclick=async()=>{const r=await fetch('/__local/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'reset'})});document.querySelector('#status').textContent=r.ok?'Demo data reset.':'Reset failed.';}</script></html>`;

export async function startLocalBackend(application, { port = 0 } = {}) {
  const runtime = createMemoryRuntime(), handle = application(runtime);
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new LocalError('invalid_host', 403);
      let size = 0; const chunks = [];
      for await (const chunk of incoming) { size += chunk.length; if (size > 1024 * 1024) throw new LocalError('payload_too_large', 413); chunks.push(chunk); }
      const request = new Request(url, { method: incoming.method, headers: incoming.headers, ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }) });
      let response;
      if (url.pathname === '/__local/' && incoming.method === 'GET') response = new Response(controls, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      else if (url.pathname === '/__local/control' && incoming.method === 'POST') {
        const { action } = await request.json();
        if (action !== 'reset') throw new LocalError('invalid_control', 400);
        runtime.reset();
        response = Response.json({ ok: true });
      } else {
        response = await handle({ request });
      }
      outgoing.writeHead(response.status, { ...Object.fromEntries(response.headers), 'cache-control': 'no-store' });
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      outgoing.writeHead(error instanceof LocalError ? error.status : 500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      outgoing.end(JSON.stringify({ error: error instanceof LocalError ? error.code : 'local_failure' }));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { runtime, server, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { application } = await import(/* @vite-ignore */ new URL('../functions/routes.mjs', import.meta.url).href);
  const backend = await startLocalBackend(application);
  process.env.RECORDS_LOCAL_API = backend.origin;
  const vite = await import('vite');
  let frontend;
  try { frontend = await vite.createServer(); await frontend.listen(); frontend.printUrls(); }
  catch (error) { await backend.close(); throw error; }
  console.log('Local fixture mode. Data resets on restart. Open /__local/ to reset demo data.');
  const stop = async () => { await frontend.close(); await backend.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
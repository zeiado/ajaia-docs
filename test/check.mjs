// Automated checks against the REAL application routes (functions/routes.mjs)
// with the credential-free in-memory database from dev/local.mjs.
// Run: node --test test/check.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { application } from '../functions/routes.mjs';
import { createMemoryRuntime, DEMO_USERS } from '../dev/local.mjs';

const ALICE = DEMO_USERS[0], BOB = DEMO_USERS[1], CAROL = DEMO_USERS[2];
const WELCOME_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ENGINEERING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DEMO_PASSWORD = 'ajaia-demo';

function setup() {
  const runtime = createMemoryRuntime();
  const handle = application({ db: runtime.db });
  async function call(method, path, { body, cookie } = {}) {
    const request = new Request(`http://127.0.0.1:8000/functions/v1/app${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const response = await handle({ request });
    let data = null;
    try { data = await response.json(); } catch { /* non-JSON */ }
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null };
  }
  async function login(username = 'alice', password = DEMO_PASSWORD) {
    const result = await call('POST', '/api/auth/login', { body: { username, password } });
    assert.equal(result.status, 200, `login failed: ${JSON.stringify(result.data)}`);
    assert.ok(result.cookie, 'login must set a session cookie');
    return result.cookie;
  }
  return { runtime, call, login };
}

test('health endpoint is anonymous', async () => {
  const { call } = setup();
  const result = await call('GET', '/api/health');
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { ok: true });
});

test('login rejects wrong password and unknown user with 401', async () => {
  const { call } = setup();
  const wrong = await call('POST', '/api/auth/login', { body: { username: 'alice', password: 'wrong-password' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, 'invalid_credentials');
  const unknown = await call('POST', '/api/auth/login', { body: { username: 'nobody', password: DEMO_PASSWORD } });
  assert.equal(unknown.status, 401);
});

test('session lifecycle: me requires login, logout revokes', async () => {
  const { call, login } = setup();
  assert.equal((await call('GET', '/api/me')).status, 401);
  const cookie = await login();
  const me = await call('GET', '/api/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, 'alice');
  const logout = await call('POST', '/api/auth/logout', { cookie });
  assert.equal(logout.status, 200);
  assert.equal((await call('GET', '/api/me', { cookie })).status, 401);
});

test('document round-trip: create, save, reopen preserves content and bumps version', async () => {
  const { call, login } = setup();
  const cookie = await login();
  const content = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Round trip' }] },
    { type: 'paragraph', content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Bold text' }, { type: 'text', text: ' survives.' }] },
  ] };
  const created = await call('POST', '/api/documents', { cookie, body: { title: 'Test doc', content } });
  assert.equal(created.status, 201);
  const id = created.data.id;

  const opened = await call('GET', `/api/documents/${id}`, { cookie });
  assert.equal(opened.status, 200);
  assert.deepEqual(opened.data.content, content);
  assert.equal(opened.data.version, 1);
  assert.equal(opened.data.role, 'owner');

  const edited = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited.' }] }] };
  const saved = await call('PATCH', `/api/documents/${id}`, { cookie, body: { content: edited, version: 1 } });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.version, 2);

  const reopened = await call('GET', `/api/documents/${id}`, { cookie });
  assert.deepEqual(reopened.data.content, edited);
  assert.equal(reopened.data.version, 2);

  const stale = await call('PATCH', `/api/documents/${id}`, { cookie, body: { title: 'Stale', version: 1 } });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.error, 'write_conflict');
});

test('list distinguishes owned and shared documents', async () => {
  const { call, login } = setup();
  const alice = await login('alice');
  const list = await call('GET', '/api/documents', { cookie: alice });
  assert.equal(list.status, 200);
  const byId = new Map(list.data.documents.map(d => [d.id, d]));
  assert.equal(byId.get(WELCOME_ID).role, 'owner');
  assert.equal(byId.get('cccccccc-cccc-4ccc-8ccc-cccccccccccc').role, 'viewer');
  assert.ok(!byId.has(ENGINEERING_ID), "alice must not see bob's private document");
});

test('sharing: grant editor and viewer, enforce write boundary, revoke', async () => {
  const { call, login } = setup();
  const alice = await login('alice');
  const bob = await login('bob');
  const carol = await login('carol');

  // Bob owns a private doc; carol cannot see it.
  assert.equal((await call('GET', `/api/documents/${ENGINEERING_ID}`, { cookie: carol })).status, 404);

  // Owner grants carol viewer access.
  const grant = await call('POST', `/api/documents/${ENGINEERING_ID}/shares`, { cookie: bob, body: { user_id: CAROL.id, role: 'viewer' } });
  assert.equal(grant.status, 201);
  const viewed = await call('GET', `/api/documents/${ENGINEERING_ID}`, { cookie: carol });
  assert.equal(viewed.status, 200);
  assert.equal(viewed.data.role, 'viewer');
  assert.equal(viewed.data.shares, undefined, 'viewer must not see the share list');

  // Viewer cannot write.
  const viewerWrite = await call('PATCH', `/api/documents/${ENGINEERING_ID}`, { cookie: carol, body: { title: 'Nope', version: 1 } });
  assert.equal(viewerWrite.status, 403);

  // Upgrade to editor: now the write succeeds.
  await call('POST', `/api/documents/${ENGINEERING_ID}/shares`, { cookie: bob, body: { user_id: CAROL.id, role: 'editor' } });
  const editorWrite = await call('PATCH', `/api/documents/${ENGINEERING_ID}`, { cookie: carol, body: { title: 'Edited by carol', version: 1 } });
  assert.equal(editorWrite.status, 200);

  // Revoke: access disappears.
  const revoke = await call('DELETE', `/api/documents/${ENGINEERING_ID}/shares/${CAROL.id}`, { cookie: bob });
  assert.equal(revoke.status, 200);
  assert.equal((await call('GET', `/api/documents/${ENGINEERING_ID}`, { cookie: carol })).status, 404);

  // Seeded editor share still works for bob on alice's welcome doc.
  const bobDoc = await call('GET', `/api/documents/${WELCOME_ID}`, { cookie: bob });
  assert.equal(bobDoc.status, 200);
  assert.equal(bobDoc.data.role, 'editor');
});

test('only the owner manages shares and deletes', async () => {
  const { call, login } = setup();
  const alice = await login('alice');
  const bob = await login('bob'); // seeded editor on welcome doc

  const grantByEditor = await call('POST', `/api/documents/${WELCOME_ID}/shares`, { cookie: bob, body: { user_id: CAROL.id, role: 'editor' } });
  assert.equal(grantByEditor.status, 404);
  const deleteByEditor = await call('DELETE', `/api/documents/${WELCOME_ID}`, { cookie: bob });
  assert.equal(deleteByEditor.status, 404);
  const selfShare = await call('POST', `/api/documents/${WELCOME_ID}/shares`, { cookie: alice, body: { user_id: ALICE.id, role: 'editor' } });
  assert.equal(selfShare.status, 400);

  const deleted = await call('DELETE', `/api/documents/${WELCOME_ID}`, { cookie: alice });
  assert.equal(deleted.status, 200);
  assert.equal((await call('GET', `/api/documents/${WELCOME_ID}`, { cookie: alice })).status, 404);
  assert.equal((await call('GET', `/api/documents/${WELCOME_ID}`, { cookie: bob })).status, 404);
});

test('input validation: bad content, empty title, unknown routes', async () => {
  const { call, login } = setup();
  const cookie = await login();
  const badContent = await call('POST', '/api/documents', { cookie, body: { title: 'Bad', content: { type: 'evil', content: [] } } });
  assert.equal(badContent.status, 400);
  const badMark = await call('POST', '/api/documents', { cookie, body: { title: 'Bad', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }] }] } } });
  assert.equal(badMark.status, 400);
  const emptyTitle = await call('POST', '/api/documents', { cookie, body: { title: '   ' } });
  assert.equal(emptyTitle.status, 400);
  const unknown = await call('GET', '/api/definitely-not-a-route', { cookie });
  assert.equal(unknown.status, 404);
  const anonList = await call('GET', '/api/documents');
  assert.equal(anonList.status, 401);
});

test('import metadata is stored and returned', async () => {
  const { call, login } = setup();
  const cookie = await login();
  const created = await call('POST', '/api/documents', { cookie, body: {
    title: 'Imported notes', imported_from: 'notes.md',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'From a file.' }] }] },
  } });
  assert.equal(created.status, 201);
  const opened = await call('GET', `/api/documents/${created.data.id}`, { cookie });
  assert.equal(opened.data.imported_from, 'notes.md');
});
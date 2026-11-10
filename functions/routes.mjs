// Ajaia Docs business routes. Application identity comes exclusively from this
// app's own session cookie; platform identity is never used or fallen back to.
// Dependency injection ({ db }) exists only for local tests; index.ts keeps Deno.serve.
import { verifyPassword, verifyPasswordAgainstDummy } from './passwords.mjs';
import { SESSION_TTL_MS, createSession, validateSession, revokeSession, sessionCookie, clearSessionCookie, SessionError } from './sessions.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DOC_BODY_LIMIT = 512 * 1024;
const NODE_TYPES = new Set(['doc', 'paragraph', 'text', 'heading', 'bulletList', 'orderedList', 'listItem', 'hardBreak', 'blockquote', 'codeBlock', 'horizontalRule']);
const MARK_TYPES = new Set(['bold', 'italic', 'underline', 'strike', 'code']);
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

export class AppError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

const NO_STORE = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };
const json = (value, status = 200, extra = {}) => Response.json(value, { status, headers: { ...NO_STORE, ...extra } });
const errorJson = (code, status) => json({ error: code }, status);
const fail = (code, status) => { throw new AppError(code, status); };

function rows(result) {
  if (result?.error || !Array.isArray(result?.data)) fail('database_unavailable', 503);
  return result.data;
}

function applicationPath(request) {
  const match = new URL(request.url).pathname.match(/^\/(?:functions\/v1\/)?(?:app|app-d[0-9a-f]{32})(\/.*)?$/);
  if (!match) fail('not_found', 404);
  return match[1] || '/';
}

// Bound by bytes actually read, never Content-Length.
async function readJson(request, maxBytes = 8192) {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') fail('invalid_input', 400);
  const reader = request.body?.getReader();
  if (!reader) fail('invalid_input', 400);
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); fail('payload_too_large', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('invalid_input', 400); }
}

function validateTitle(value) {
  if (typeof value !== 'string') fail('invalid_input', 400);
  const title = value.trim();
  if (!title || title.length > 300) fail('invalid_input', 400);
  return title;
}

function validateContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'doc') fail('invalid_input', 400);
  let budget = 5000;
  const walk = node => {
    budget -= 1;
    if (budget < 0) fail('invalid_input', 400);
    if (!node || typeof node !== 'object' || Array.isArray(node)) fail('invalid_input', 400);
    if (typeof node.type !== 'string' || !NODE_TYPES.has(node.type)) fail('invalid_input', 400);
    if (node.type === 'text' && typeof node.text !== 'string') fail('invalid_input', 400);
    if (node.type === 'heading' && (!node.attrs || ![1, 2, 3].includes(node.attrs.level))) fail('invalid_input', 400);
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) fail('invalid_input', 400);
      for (const mark of node.marks) if (!mark || !MARK_TYPES.has(mark.type)) fail('invalid_input', 400);
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) fail('invalid_input', 400);
      node.content.forEach(walk);
    }
  };
  walk(value);
  return value;
}

function extractExcerpt(content) {
  let out = '';
  let budget = 2000;
  const walk = node => {
    if (out.length >= 240 || budget <= 0) return;
    budget -= 1;
    if (node?.type === 'text' && typeof node.text === 'string') out += `${node.text} `;
    if (Array.isArray(node?.content)) node.content.forEach(walk);
  };
  walk(content);
  return out.replace(/\s+/g, ' ').trim().slice(0, 200);
}

const publicUser = row => ({ id: row.id, username: row.username, display_name: row.display_name });

export function application({ db }) {
  async function sessionUser(request) {
    const { state, session } = await validateSession(db, rows, request);
    if (state === 'missing') fail('login_required', 401);
    if (state !== 'valid') fail('invalid_credentials', 401);
    const found = rows(await db.from('users').select('id,username,display_name').eq('id', session.userId).limit(1));
    if (!found.length) fail('invalid_credentials', 401);
    return { user: found[0], session };
  }

  async function allUsers() {
    return rows(await db.from('users').select('id,username,display_name').order('username', { ascending: true }).limit(100));
  }

  // Returns { doc, role } or throws. role: owner | editor | viewer.
  async function accessibleDocument(id, userId) {
    const found = rows(await db.from('documents').select('*').eq('id', id).limit(1));
    if (!found.length) fail('not_found', 404);
    const doc = found[0];
    if (doc.owner_id === userId) return { doc, role: 'owner' };
    const share = rows(await db.from('shares').select('role').eq('document_id', id).eq('user_id', userId).limit(1));
    if (!share.length) fail('not_found', 404);
    return { doc, role: share[0].role };
  }

  async function ownedDocument(id, userId) {
    const found = rows(await db.from('documents').select('id,owner_id').eq('id', id).eq('owner_id', userId).limit(1));
    if (!found.length) fail('not_found', 404);
    return found[0];
  }

  async function route(ctx) {
    const request = ctx.request;
    const path = applicationPath(request);
    const method = request.method;

    if (path === '/api/health' && method === 'GET') return json({ ok: true });

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJson(request);
      const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      if (!username || username.length > 64 || !password || password.length > 256) fail('invalid_input', 400);
      const found = rows(await db.from('users').select('id,username,display_name,password_salt,password_hash,password_iterations').eq('username', username).limit(1));
      if (!found.length) {
        await verifyPasswordAgainstDummy(password);
        fail('invalid_credentials', 401);
      }
      const record = found[0];
      const ok = await verifyPassword(password, { salt: record.password_salt, hash: record.password_hash, iterations: record.password_iterations });
      if (!ok) fail('invalid_credentials', 401);
      const { token } = await createSession(db, rows, record.id);
      return json({ user: publicUser(record) }, 200, { 'set-cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)) });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const { state, session } = await validateSession(db, rows, request);
      if (state === 'valid') await revokeSession(db, rows, session.digest);
      return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
    }

    if (path === '/api/me' && method === 'GET') {
      const { user } = await sessionUser(request);
      return json({ user: publicUser(user) });
    }

    if (path === '/api/users' && method === 'GET') {
      await sessionUser(request);
      return json({ users: (await allUsers()).map(publicUser) });
    }

    if (path === '/api/documents' && method === 'GET') {
      const { user } = await sessionUser(request);
      const users = await allUsers();
      const names = new Map(users.map(u => [u.id, u.display_name]));
      const owned = rows(await db.from('documents').select('id,title,excerpt,version,owner_id,imported_from,created_at,updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false }).limit(100));
      const myShares = rows(await db.from('shares').select('document_id,role').eq('user_id', user.id).limit(100));
      const roleByDoc = new Map(myShares.map(s => [s.document_id, s.role]));
      const sharedIds = myShares.map(s => s.document_id);
      const shared = sharedIds.length
        ? rows(await db.from('documents').select('id,title,excerpt,version,owner_id,imported_from,created_at,updated_at').in('id', sharedIds).limit(100))
        : [];
      const items = [
        ...owned.map(d => ({ ...d, role: 'owner', owner_name: names.get(d.owner_id) ?? '' })),
        ...shared.map(d => ({ ...d, role: roleByDoc.get(d.id), owner_name: names.get(d.owner_id) ?? '' })),
      ].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0)).slice(0, 100);
      return json({ documents: items });
    }

    if (path === '/api/documents' && method === 'POST') {
      const { user } = await sessionUser(request);
      const body = await readJson(request, DOC_BODY_LIMIT);
      const title = validateTitle(body?.title);
      const content = body?.content === undefined ? EMPTY_DOC : validateContent(body.content);
      let importedFrom = null;
      if (body?.imported_from !== undefined && body.imported_from !== null) {
        if (typeof body.imported_from !== 'string' || body.imported_from.length > 300) fail('invalid_input', 400);
        importedFrom = body.imported_from;
      }
      const now = new Date().toISOString();
      const inserted = rows(await db.from('documents').insert({
        id: crypto.randomUUID(), owner_id: user.id, title, content,
        excerpt: extractExcerpt(content), imported_from: importedFrom, version: 1, created_at: now, updated_at: now,
      }).select('id,title,version,created_at,updated_at'));
      if (!inserted.length) fail('database_unavailable', 503);
      return json(inserted[0], 201);
    }

    const docMatch = path.match(/^\/api\/documents\/([0-9a-f-]{36})$/);
    if (docMatch && UUID_RE.test(docMatch[1])) {
      const id = docMatch[1];

      if (method === 'GET') {
        const { user } = await sessionUser(request);
        const { doc, role } = await accessibleDocument(id, user.id);
        const users = await allUsers();
        const names = new Map(users.map(u => [u.id, u.display_name]));
        const result = {
          id: doc.id, title: doc.title, content: doc.content, excerpt: doc.excerpt, version: doc.version,
          owner_id: doc.owner_id, owner_name: names.get(doc.owner_id) ?? '', imported_from: doc.imported_from,
          created_at: doc.created_at, updated_at: doc.updated_at, role,
        };
        if (role === 'owner') {
          const shares = rows(await db.from('shares').select('user_id,role,created_at').eq('document_id', id).limit(100));
          result.shares = shares.map(s => ({ ...s, username: users.find(u => u.id === s.user_id)?.username ?? '', display_name: names.get(s.user_id) ?? '' }));
        }
        return json(result);
      }

      if (method === 'PATCH') {
        const { user } = await sessionUser(request);
        const { doc, role } = await accessibleDocument(id, user.id);
        if (role === 'viewer') fail('forbidden', 403);
        const body = await readJson(request, DOC_BODY_LIMIT);
        if (!Number.isInteger(body?.version) || body.version < 1 || body.version >= 2147483647) fail('invalid_input', 400);
        const changes = {};
        if (body.title !== undefined) changes.title = validateTitle(body.title);
        if (body.content !== undefined) {
          changes.content = validateContent(body.content);
          changes.excerpt = extractExcerpt(changes.content);
        }
        if (!Object.keys(changes).length) fail('invalid_input', 400);
        // Ownership/access was checked above; version is a predicate of the write itself.
        const updated = rows(await db.from('documents')
          .update({ ...changes, version: body.version + 1, updated_at: new Date().toISOString() })
          .eq('id', id).eq('version', body.version)
          .select('id,title,excerpt,version,updated_at'));
        if (!updated.length) fail('write_conflict', 409);
        return json(updated[0]);
      }

      if (method === 'DELETE') {
        const { user } = await sessionUser(request);
        await ownedDocument(id, user.id);
        const deleted = rows(await db.from('documents').delete().eq('id', id).eq('owner_id', user.id).select('id'));
        if (!deleted.length) fail('not_found', 404);
        return json({ ok: true });
      }
    }

    const sharesMatch = path.match(/^\/api\/documents\/([0-9a-f-]{36})\/shares$/);
    if (sharesMatch && UUID_RE.test(sharesMatch[1]) && method === 'POST') {
      const id = sharesMatch[1];
      const { user } = await sessionUser(request);
      await ownedDocument(id, user.id);
      const body = await readJson(request);
      const targetId = typeof body?.user_id === 'string' ? body.user_id : '';
      const role = body?.role;
      if (!UUID_RE.test(targetId) || !['editor', 'viewer'].includes(role)) fail('invalid_input', 400);
      if (targetId === user.id) fail('cannot_share_with_owner', 400);
      const users = await allUsers();
      if (!users.some(u => u.id === targetId)) fail('user_not_found', 404);
      const inserted = rows(await db.from('shares').insertIfAbsent({
        id: crypto.randomUUID(), document_id: id, user_id: targetId, role, created_at: new Date().toISOString(),
      }, { onConflict: 'document_id,user_id' }).select('id'));
      if (!inserted.length) {
        rows(await db.from('shares').update({ role }).eq('document_id', id).eq('user_id', targetId).select('id'));
      }
      return json({ user_id: targetId, role }, 201);
    }

    const shareMatch = path.match(/^\/api\/documents\/([0-9a-f-]{36})\/shares\/([0-9a-f-]{36})$/);
    if (shareMatch && UUID_RE.test(shareMatch[1]) && UUID_RE.test(shareMatch[2]) && method === 'DELETE') {
      const { user } = await sessionUser(request);
      await ownedDocument(shareMatch[1], user.id);
      rows(await db.from('shares').delete().eq('document_id', shareMatch[1]).eq('user_id', shareMatch[2]).select('id'));
      return json({ ok: true });
    }

    fail('not_found', 404);
  }

  return async ctx => {
    try { return await route(ctx); }
    catch (error) {
      if (error instanceof AppError || error instanceof SessionError) return errorJson(error.code, error.status);
      throw error;
    }
  };
}
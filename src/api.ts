import type { JSONContent } from '@tiptap/react';

export type User = { id: string; username: string; display_name: string };
export type Role = 'owner' | 'editor' | 'viewer';
export type DocumentSummary = {
  id: string; title: string; excerpt: string; version: number;
  owner_id: string; owner_name: string; imported_from: string | null;
  created_at: string; updated_at: string; role: Role;
};
export type Share = { user_id: string; role: 'editor' | 'viewer'; created_at: string; username: string; display_name: string };
export type DocumentFull = Omit<DocumentSummary, 'excerpt'> & { excerpt: string; content: JSONContent; shares?: Share[] };
export type SaveResult = { id: string; title: string; excerpt: string; version: number; updated_at: string };

export class RequestError extends Error {
  constructor(public code: string, public status = 0, public uncertain = false) { super(code); }
}

export async function requestBackend(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/functions/v1/app${path}`, {
      ...init,
      credentials: 'same-origin',
      signal: init?.signal ?? AbortSignal.timeout(20_000),
    });
  } catch { throw new RequestError('network_error', 0, true); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new RequestError('invalid_response', response.status, true); }
  if (!response.ok) {
    const code = typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : 'request_failed';
    throw new RequestError(code, response.status, response.status >= 500 || response.status === 408);
  }
  return body;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function isUser(value: unknown): value is User {
  const u = value as User;
  return !!u && typeof u.id === 'string' && typeof u.username === 'string' && typeof u.display_name === 'string';
}

export const api = {
  async me(): Promise<User> {
    const result = await requestBackend('/api/me') as { user?: unknown };
    if (!isUser(result?.user)) throw new RequestError('invalid_response');
    return result.user;
  },
  async login(username: string, password: string): Promise<User> {
    const result = await requestBackend('/api/auth/login', post({ username, password })) as { user?: unknown };
    if (!isUser(result?.user)) throw new RequestError('invalid_response');
    return result.user;
  },
  async logout(): Promise<void> { await requestBackend('/api/auth/logout', { method: 'POST' }); },
  async users(): Promise<User[]> {
    const result = await requestBackend('/api/users') as { users?: unknown };
    if (!Array.isArray(result?.users) || !result.users.every(isUser)) throw new RequestError('invalid_response');
    return result.users;
  },
  async documents(): Promise<DocumentSummary[]> {
    const result = await requestBackend('/api/documents') as { documents?: unknown };
    if (!Array.isArray(result?.documents)) throw new RequestError('invalid_response');
    return result.documents as DocumentSummary[];
  },
  async createDocument(input: { title: string; content?: JSONContent; imported_from?: string }): Promise<{ id: string }> {
    const result = await requestBackend('/api/documents', post(input)) as { id?: unknown };
    if (typeof result?.id !== 'string') throw new RequestError('invalid_response', 0, true);
    return { id: result.id };
  },
  async document(id: string): Promise<DocumentFull> {
    const result = await requestBackend(`/api/documents/${id}`) as DocumentFull;
    if (!result || typeof result.id !== 'string' || typeof result.title !== 'string' || !result.content || !Number.isInteger(result.version)) {
      throw new RequestError('invalid_response');
    }
    return result;
  },
  async saveDocument(id: string, input: { title?: string; content?: JSONContent; version: number }): Promise<SaveResult> {
    const result = await requestBackend(`/api/documents/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }) as SaveResult;
    if (!result || !Number.isInteger(result.version)) throw new RequestError('invalid_response', 0, true);
    return result;
  },
  async deleteDocument(id: string): Promise<void> {
    await requestBackend(`/api/documents/${id}`, { method: 'DELETE' });
  },
  async grantShare(id: string, userId: string, role: 'editor' | 'viewer'): Promise<void> {
    await requestBackend(`/api/documents/${id}/shares`, post({ user_id: userId, role }));
  },
  async revokeShare(id: string, userId: string): Promise<void> {
    await requestBackend(`/api/documents/${id}/shares/${userId}`, { method: 'DELETE' });
  },
};

export function message(error: unknown): string {
  const code = error instanceof RequestError ? error.code : '';
  return ({
    login_required: 'Please sign in to continue.',
    invalid_credentials: 'Incorrect username or password.',
    not_found: 'This document does not exist, or you no longer have access to it.',
    forbidden: 'You have view-only access to this document.',
    invalid_input: 'Please check your input and try again.',
    cannot_share_with_owner: 'The owner already has full access.',
    user_not_found: 'That user no longer exists.',
    write_conflict: 'This document was changed elsewhere. Load the latest version before saving again.',
    payload_too_large: 'This file is too large. The limit is 256 KB of text.',
    network_error: 'Connection lost. Your changes are kept in the editor — retry when you are back online.',
    invalid_response: 'The service returned an unexpected result. Please retry.',
    database_unavailable: 'The data service is temporarily unavailable. Please retry.',
  } as Record<string, string>)[code] ?? 'Something went wrong. Please try again.';
}
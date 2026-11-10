import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { api, message, type DocumentFull, type User } from '../api';

export function ShareDialog({ doc, onClose, onChanged }: {
  doc: DocumentFull; onClose: () => void; onChanged: () => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [targetId, setTargetId] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.users().then(list => {
      setUsers(list.filter(u => u.id !== doc.owner_id));
    }).catch(err => toast.error(message(err)));
  }, [doc.owner_id]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const shares = doc.shares ?? [];
  const available = users.filter(u => !shares.some(s => s.user_id === u.id));

  async function grant(userId: string, newRole: 'editor' | 'viewer') {
    setBusy(true);
    try {
      await api.grantShare(doc.id, userId, newRole);
      onChanged();
    } catch (err) { toast.error(message(err)); }
    finally { setBusy(false); }
  }

  async function revoke(userId: string) {
    setBusy(true);
    try {
      await api.revokeShare(doc.id, userId);
      toast.success('Access removed');
      onChanged();
    } catch (err) { toast.error(message(err)); }
    finally { setBusy(false); }
  }

  async function add() {
    if (!targetId) return;
    await grant(targetId, role);
    setTargetId('');
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Share ${doc.title}`}>
        <div className="modal-head">
          <h2>Share “{doc.title}”</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="share-add">
          <select value={targetId} onChange={e => setTargetId(e.target.value)} aria-label="Person to share with" disabled={busy || available.length === 0}>
            <option value="">{available.length ? 'Choose a person…' : 'Everyone already has access'}</option>
            {available.map(u => <option key={u.id} value={u.id}>{u.display_name} (@{u.username})</option>)}
          </select>
          <select value={role} onChange={e => setRole(e.target.value as 'editor' | 'viewer')} aria-label="Access level" disabled={busy}>
            <option value="editor">Can edit</option>
            <option value="viewer">View only</option>
          </select>
          <button type="button" className="btn btn-primary" onClick={() => void add()} disabled={busy || !targetId}>Add</button>
        </div>

        <h3 className="share-list-title">People with access</h3>
        <ul className="share-list">
          <li className="share-row">
            <span className="share-person"><span className="avatar avatar-sm" aria-hidden="true">{doc.owner_name[0]}</span>{doc.owner_name} <span className="muted">(owner)</span></span>
            <span className="badge badge-owner">Owner</span>
          </li>
          {shares.map(share => (
            <li key={share.user_id} className="share-row">
              <span className="share-person"><span className="avatar avatar-sm" aria-hidden="true">{share.display_name[0]}</span>{share.display_name} <span className="muted">@{share.username}</span></span>
              <span className="share-controls">
                <select value={share.role} aria-label={`Access level for ${share.display_name}`} disabled={busy}
                  onChange={e => void grant(share.user_id, e.target.value as 'editor' | 'viewer')}>
                  <option value="editor">Can edit</option>
                  <option value="viewer">View only</option>
                </select>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void revoke(share.user_id)}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {shares.length === 0 && <p className="muted">Only you have access. Add a person above to share this document.</p>}
        <p className="share-note muted">Editors can change content and title. Viewers can only read. You can remove access at any time.</p>
      </div>
    </div>
  );
}
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { FileText, FileUp, LogOut, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../auth';
import { api, message, type DocumentSummary } from '../api';
import { ImportDialog } from '../components/ImportDialog';

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', editor: 'Can edit', viewer: 'View only' };

export function Workspace() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'owned' | 'shared'>('owned');
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setDocs(await api.documents()); }
    catch (err) { setError(message(err)); setDocs(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createDocument() {
    setCreating(true);
    try {
      const { id } = await api.createDocument({ title: 'Untitled document' });
      navigate(`/doc/${id}`);
    } catch (err) {
      toast.error(message(err));
      setCreating(false);
    }
  }

  async function deleteDocument(doc: DocumentSummary) {
    if (!window.confirm(`Delete “${doc.title}”? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      toast.success('Document deleted');
      await load();
    } catch (err) { toast.error(message(err)); }
  }

  const owned = docs?.filter(d => d.role === 'owner') ?? [];
  const shared = docs?.filter(d => d.role !== 'owner') ?? [];
  const visible = tab === 'owned' ? owned : shared;

  return (
    <div className="workspace">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true"><FileText size={20} /></span>
          <span className="brand-name">Ajaia Docs</span>
        </Link>
        <div className="topbar-right">
          <span className="user-chip"><span className="avatar avatar-sm" aria-hidden="true">{user?.display_name[0]}</span>{user?.display_name}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()} title="Sign out"><LogOut size={16} aria-hidden="true" /> Sign out</button>
        </div>
      </header>

      <main className="workspace-main">
        <div className="workspace-heading">
          <div>
            <h1>Your documents</h1>
            <p className="muted">Create, import and share documents with your team.</p>
          </div>
          <div className="workspace-actions">
            <button type="button" className="btn" onClick={() => setImportOpen(true)}><FileUp size={16} aria-hidden="true" /> Import file</button>
            <button type="button" className="btn btn-primary" onClick={() => void createDocument()} disabled={creating}><Plus size={16} aria-hidden="true" /> {creating ? 'Creating…' : 'New document'}</button>
          </div>
        </div>

        <div className="tabs" role="tablist" aria-label="Document lists">
          <button role="tab" aria-selected={tab === 'owned'} className={tab === 'owned' ? 'tab active' : 'tab'} onClick={() => setTab('owned')}>
            <FileText size={15} aria-hidden="true" /> My documents <span className="count">{owned.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'shared'} className={tab === 'shared' ? 'tab active' : 'tab'} onClick={() => setTab('shared')}>
            <Users size={15} aria-hidden="true" /> Shared with me <span className="count">{shared.length}</span>
          </button>
        </div>

        {error && (
          <div className="notice error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn" onClick={() => void load()}>Retry</button>
          </div>
        )}
        {!error && docs === null && <p className="muted loading-line" role="status">Loading documents…</p>}
        {!error && docs !== null && visible.length === 0 && (
          <div className="empty-state">
            {tab === 'owned'
              ? <><p>No documents yet.</p><p className="muted">Create your first document or import a .txt / .md file.</p></>
              : <><p>Nothing shared with you yet.</p><p className="muted">Documents other users share with you will appear here.</p></>}
          </div>
        )}

        <ul className="doc-list">
          {visible.map(doc => (
            <li key={doc.id} className="doc-row">
              <Link to={`/doc/${doc.id}`} className="doc-link">
                <span className="doc-icon" aria-hidden="true"><FileText size={18} /></span>
                <span className="doc-text">
                  <span className="doc-title">{doc.title}</span>
                  <span className="doc-excerpt">{doc.excerpt || 'Empty document'}</span>
                </span>
                <span className="doc-meta">
                  <span className={`badge badge-${doc.role}`}>{ROLE_LABEL[doc.role]}</span>
                  {doc.role !== 'owner' && <span className="muted">from {doc.owner_name}</span>}
                  {doc.imported_from && <span className="muted">imported</span>}
                  <span className="muted">{formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}</span>
                </span>
              </Link>
              {doc.role === 'owner' && (
                <button type="button" className="icon-btn" title={`Delete ${doc.title}`} onClick={() => void deleteDocument(doc)}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </main>

      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={id => { setImportOpen(false); navigate(`/doc/${id}`); }} />}
    </div>
  );
}
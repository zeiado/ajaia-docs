import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { ArrowLeft, Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Pilcrow, Redo2, Share2, TextQuote, Underline, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, message, RequestError, type DocumentFull } from '../api';
import { editorExtensions } from '../lib/editorExtensions';
import { ShareDialog } from '../components/ShareDialog';

type SaveState = 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [error, setError] = useState('');
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!id) return;
    try { setDoc(await api.document(id)); setError(''); }
    catch (err) { setError(message(err)); setDoc(null); }
  }, [id]);

  useEffect(() => { setDoc(null); setError(''); void load(); }, [load]);

  if (error) {
    return (
      <div className="page-center">
        <div className="notice error" role="alert">
          <p>{error}</p>
          <Link className="btn" to="/"><ArrowLeft size={16} aria-hidden="true" /> Back to documents</Link>
        </div>
      </div>
    );
  }
  if (!doc) return <div className="splash" role="status">Opening document…</div>;

  return (
    <EditorSurface
      key={`${doc.id}:${nonce}`}
      doc={doc}
      onLoadLatest={() => { setDoc(null); setNonce(n => n + 1); void load(); }}
      onSharesChanged={() => void load()}
    />
  );
}

function ToolbarButton({ label, active, disabled, onClick, children }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button type="button" className={active ? 'tool-btn active' : 'tool-btn'} title={label} aria-label={label}
      aria-pressed={active} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

function EditorSurface({ doc, onLoadLatest, onSharesChanged }: {
  doc: DocumentFull; onLoadLatest: () => void; onSharesChanged: () => void;
}) {
  const canWrite = doc.role !== 'viewer';
  const [title, setTitle] = useState(doc.title);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [shareOpen, setShareOpen] = useState(false);
  const versionRef = useRef(doc.version);
  const titleRef = useRef(doc.title);
  const savingRef = useRef(false);
  const resaveRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    if (!canWrite || conflictRef.current) return;
    if (savingRef.current) { resaveRef.current = true; return; }
    savingRef.current = true;
    setSaveState('saving');
    try {
      const result = await api.saveDocument(doc.id, {
        title: titleRef.current.trim() || 'Untitled document',
        content: editorRef.current?.getJSON(),
        version: versionRef.current,
      });
      versionRef.current = result.version;
      setSaveState(resaveRef.current ? 'dirty' : 'saved');
    } catch (err) {
      if (err instanceof RequestError && err.code === 'write_conflict') {
        conflictRef.current = true;
        setSaveState('conflict');
      } else {
        setSaveState('error');
        toast.error(message(err));
      }
    } finally {
      savingRef.current = false;
      if (resaveRef.current && !conflictRef.current) { resaveRef.current = false; void save(); }
    }
  }, [canWrite, doc.id]);

  const markDirty = useCallback(() => {
    if (conflictRef.current) return;
    setSaveState('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), 1500);
  }, [save]);

  const editor = useEditor({
    extensions: editorExtensions(),
    content: doc.content,
    editable: canWrite,
    onUpdate: () => markDirty(),
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (saveState === 'dirty' || saveState === 'saving' || saveState === 'error') event.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveState]);

  const statusText: Record<SaveState, string> = {
    saved: 'Saved', dirty: 'Unsaved changes', saving: 'Saving…', conflict: 'Changed elsewhere', error: 'Save failed',
  };

  return (
    <div className="editor-page">
      <header className="topbar editor-topbar">
        <div className="editor-topbar-left">
          <Link to="/" className="btn btn-ghost"><ArrowLeft size={16} aria-hidden="true" /> Documents</Link>
          <input
            className="title-input"
            value={title}
            placeholder="Untitled document"
            aria-label="Document title"
            readOnly={!canWrite}
            onChange={e => { setTitle(e.target.value); titleRef.current = e.target.value; markDirty(); }}
          />
        </div>
        <div className="editor-topbar-right">
          <span className={`save-status state-${saveState}`} role="status">{statusText[saveState]}</span>
          {saveState === 'error' && <button type="button" className="btn" onClick={() => void save()}>Retry</button>}
          {canWrite && <button type="button" className="btn" onClick={() => void save()} disabled={saveState === 'saved' || saveState === 'saving'}>Save</button>}
          {doc.role === 'owner' && <button type="button" className="btn btn-primary" onClick={() => setShareOpen(true)}><Share2 size={16} aria-hidden="true" /> Share</button>}
        </div>
      </header>

      {!canWrite && (
        <div className="banner" role="note">View only — shared by {doc.owner_name}. Ask the owner for edit access.</div>
      )}
      {saveState === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          <span>This document was changed elsewhere. Loading the latest version discards your unsaved changes.</span>
          <button type="button" className="btn" onClick={onLoadLatest}>Load latest version</button>
        </div>
      )}

      {canWrite && editor && (
        <div className="toolbar" role="toolbar" aria-label="Formatting">
          <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16} /></ToolbarButton>
          <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16} /></ToolbarButton>
          <span className="toolbar-sep" aria-hidden="true" />
          <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></ToolbarButton>
          <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></ToolbarButton>
          <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={16} /></ToolbarButton>
          <span className="toolbar-sep" aria-hidden="true" />
          <ToolbarButton label="Paragraph" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow size={16} /></ToolbarButton>
          <ToolbarButton label="Heading 1" active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16} /></ToolbarButton>
          <ToolbarButton label="Heading 2" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16} /></ToolbarButton>
          <ToolbarButton label="Heading 3" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={16} /></ToolbarButton>
          <span className="toolbar-sep" aria-hidden="true" />
          <ToolbarButton label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={16} /></ToolbarButton>
          <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16} /></ToolbarButton>
          <ToolbarButton label="Quote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><TextQuote size={16} /></ToolbarButton>
        </div>
      )}

      <main className="editor-canvas">
        <div className="sheet">
          {doc.imported_from && <p className="imported-note muted">Imported from {doc.imported_from}</p>}
          <EditorContent editor={editor} className="editor-content" />
        </div>
        <p className="editor-footer muted">
          {doc.role === 'owner' ? 'You own this document' : `Shared by ${doc.owner_name} · ${doc.role === 'editor' ? 'Can edit' : 'View only'}`}
        </p>
      </main>

      {shareOpen && doc.shares && (
        <ShareDialog doc={doc} onClose={() => setShareOpen(false)} onChanged={onSharesChanged} />
      )}
    </div>
  );
}
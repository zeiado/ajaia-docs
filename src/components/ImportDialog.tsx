import { useEffect, useRef, useState } from 'react';
import { FileUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, message } from '../api';
import { fileToDocument, IMPORT_LIMIT_BYTES } from '../lib/importFile';

export function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (id: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function pick(selected: File | null) {
    setError('');
    if (!selected) { setFile(null); return; }
    const lower = selected.name.toLowerCase();
    if (!lower.endsWith('.txt') && !lower.endsWith('.md')) {
      setFile(null);
      setError('Only .txt and .md files are supported.');
      return;
    }
    if (selected.size > IMPORT_LIMIT_BYTES) {
      setFile(null);
      setError(`“${selected.name}” is larger than the 256 KB limit.`);
      return;
    }
    setFile(selected);
  }

  async function importFile() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { title, content } = await fileToDocument(file);
      const { id } = await api.createDocument({ title, content, imported_from: file.name });
      toast.success(`Imported ${file.name}`);
      onImported(id);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(code === 'unsupported_type' ? 'Only .txt and .md files are supported.'
        : code === 'too_large' ? 'This file is larger than the 256 KB limit.'
        : message(err));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import a file">
        <div className="modal-head">
          <h2>Import a file</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="muted">Turn a plain-text or Markdown file into a new editable document. Formatting in .md files (headings, lists, bold…) is preserved.</p>
        <button type="button" className="dropzone" onClick={() => inputRef.current?.click()}>
          <FileUp size={22} aria-hidden="true" />
          <span>{file ? file.name : 'Choose a .txt or .md file'}</span>
          <small className="muted">Supported: .txt, .md · up to 256 KB</small>
        </button>
        <input ref={inputRef} type="file" accept=".txt,.md,text/plain,text/markdown" hidden
          onChange={e => pick(e.target.files?.[0] ?? null)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={() => void importFile()}>
            {busy ? 'Importing…' : 'Import as new document'}
          </button>
        </div>
      </div>
    </div>
  );
}
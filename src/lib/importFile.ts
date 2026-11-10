import { Editor, type JSONContent } from '@tiptap/react';
import { marked } from 'marked';
import { editorExtensions } from './editorExtensions';

export const IMPORT_LIMIT_BYTES = 256 * 1024;
export const SUPPORTED_EXTENSIONS = ['.txt', '.md'];

export function supportedFile(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function textToDoc(text: string): JSONContent {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const content: JSONContent[] = [];
  let paragraph: JSONContent[] = [];
  const flush = () => {
    if (paragraph.length) { content.push({ type: 'paragraph', content: paragraph }); paragraph = []; }
  };
  for (const line of lines) {
    if (!line.trim()) { flush(); continue; }
    if (paragraph.length) paragraph.push({ type: 'hardBreak' });
    paragraph.push({ type: 'text', text: line });
  }
  flush();
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

function markdownToDoc(text: string): JSONContent {
  const html = marked.parse(text, { async: false });
  const editor = new Editor({ extensions: editorExtensions(), content: html });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

export async function fileToDocument(file: File): Promise<{ title: string; content: JSONContent }> {
  if (!supportedFile(file.name)) throw new Error('unsupported_type');
  if (file.size > IMPORT_LIMIT_BYTES) throw new Error('too_large');
  const text = await file.text();
  const content = file.name.toLowerCase().endsWith('.md') ? markdownToDoc(text) : textToDoc(text);
  const title = file.name.replace(/\.(txt|md)$/i, '').trim() || 'Imported document';
  return { title: title.slice(0, 300), content };
}
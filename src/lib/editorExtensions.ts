import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';

export function editorExtensions(placeholder = 'Start writing…') {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
    }),
    Placeholder.configure({ placeholder }),
  ];
}
import { useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mathematics } from '@tiptap/extension-mathematics';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import 'katex/dist/katex.min.css';

/**
 * Normalises any `content` value into a valid TipTap doc object:
 *  - null / undefined  → empty paragraph
 *  - already a doc obj → returned as-is
 *  - stringified JSON  → parsed, then returned if it looks like a doc
 *  - plain string      → wrapped in a paragraph node
 */
function resolveContent(content) {
  if (!content) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  // Already a parsed TipTap doc object
  if (typeof content === 'object' && content.type === 'doc') {
    return content;
  }

  if (typeof content === 'string') {
    // Try to parse as JSON first
    try {
      const parsed = JSON.parse(content);
      if (parsed?.type === 'doc') return parsed;
    } catch {
      // Not JSON — fall through to plain-text wrapping
    }

    // Legacy plain-text question — wrap it so TipTap renders it cleanly
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: content }],
        },
      ],
    };
  }

  // Fallback — return empty doc
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/**
 * QuestionRenderer
 *
 * Renders a TipTap question body in read-only mode.
 *
 * Props:
 *   content   — TipTap JSON object, stringified TipTap JSON, or a plain string.
 *   className — Optional CSS class applied to the wrapper div.
 */
export default function QuestionRenderer({ content, className = '' }) {
  const initialContent = useMemo(() => resolveContent(content), [content]);

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit,
      Table.configure({
        resizable: false,
        HTMLAttributes: { class: 'qr-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics.configure({
        katexOptions: { throwOnError: false },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'qr-output',
      },
    },
  });

  return (
    <div className={`qr-wrapper ${className}`.trim()}>
      <EditorContent editor={editor} />
    </div>
  );
}

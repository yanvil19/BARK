import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { useEffect, useRef, useState } from 'react';
import '../styles/components/RichTextEditor.css';

/**
 * Restricted rich-text editor — only Bold, Italic, and Underline.
 *
 * Props:
 *   value       – HTML string (initial / controlled content)
 *   onChange    – called with the HTML string whenever content changes
 *   placeholder – ghost text when the editor is empty
 *   disabled    – makes the editor non-editable (read-only mode)
 *   className   – extra CSS class on the wrapper
 *   minRows     – minimum visible rows (maps to min-height via CSS variable)
 *   singleLine  – if true, prevents Enter / newlines (for answer inputs)
 *   ariaLabel   – forwarded to the editable element
 */
export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = '',
  disabled = false,
  className = '',
  minRows = 3,
  singleLine = false,
  ariaLabel = '',
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track whether value was updated externally so we don't loop
  const suppressRef = useRef(false);

  // Force component re-render on editor transactions so active marks highlight immediately
  const [, setTick] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable everything except bold + italic (provided by StarterKit)
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        // Keep paragraph + hard break + history (undo/redo)
      }),
      Underline,
    ],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'rte-editable',
        'aria-label': ariaLabel,
        'data-placeholder': placeholder,
      },
      // In single-line mode, block Enter key
      handleKeyDown: singleLine
        ? (view, event) => {
            if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
              event.preventDefault();
              return true;
            }
            return false;
          }
        : undefined,
      // Clean pasted content: strip everything except bold/italic/underline
      // TipTap's StarterKit already drops most block-level nodes we disabled,
      // but this catches stray spans with inline styles from Word / Docs.
      transformPastedHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Walk all elements and strip class / style, but keep <b>, <i>, <u>,
        // <strong>, <em> tags (TipTap maps them to marks automatically).
        doc.body.querySelectorAll('*').forEach((el) => {
          el.removeAttribute('class');
          el.removeAttribute('style');
          el.removeAttribute('id');
        });
        // In single-line mode collapse block elements to spaces
        if (singleLine) {
          return doc.body.textContent.replace(/\s+/g, ' ').trim();
        }
        return doc.body.innerHTML;
      },
    },
    onTransaction() {
      // Re-render whenever cursor moves, selection changes, or marks are toggled
      setTick((t) => t + 1);
    },
    onUpdate({ editor: ed }) {
      suppressRef.current = true;
      const html = ed.getHTML();
      // When the editor is empty TipTap produces '<p></p>', normalize to ''
      const isEmpty = html === '<p></p>' || html === '<p><br></p>';
      onChangeRef.current?.(isEmpty ? '' : html);
    },
  });

  // Sync incoming value when it changes externally (e.g. reset / load)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    const current = editor.getHTML();
    const normalizedCurrent = current === '<p></p>' ? '' : current;
    if (normalizedCurrent !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [value, editor]);

  // Toggle editable when disabled prop changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return null;

  const lineHeight = 1.5;
  const paddingPx = 16; // top + bottom padding inside the editable
  const minHeightPx = minRows * 16 * lineHeight + paddingPx;

  return (
    <div
      className={`rte-wrapper ${disabled ? 'rte-wrapper--disabled' : ''} ${className}`}
      style={{ '--rte-min-height': `${minHeightPx}px` }}
    >
      {!disabled && (
        <div className="rte-toolbar" role="toolbar" aria-label="Text formatting">
          <button
            type="button"
            className={`rte-btn ${editor.isActive('bold') ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault(); // Don't steal editor focus
              editor.chain().focus().toggleBold().run();
            }}
            title="Bold (Ctrl+B)"
            aria-pressed={editor.isActive('bold')}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('italic') ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault(); // Don't steal editor focus
              editor.chain().focus().toggleItalic().run();
            }}
            title="Italic (Ctrl+I)"
            aria-pressed={editor.isActive('italic')}
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`rte-btn ${editor.isActive('underline') ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault(); // Don't steal editor focus
              editor.chain().focus().toggleUnderline().run();
            }}
            title="Underline (Ctrl+U)"
            aria-pressed={editor.isActive('underline')}
          >
            <u>U</u>
          </button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

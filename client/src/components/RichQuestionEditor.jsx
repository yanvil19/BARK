import { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Mathematics } from '@tiptap/extension-mathematics';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const EMPTY_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const SYMBOLS = [
  { label: 'Fraction', latex: '\\frac{}{}' },
  { label: 'Square root', latex: '\\sqrt{}' },
  { label: 'Sum', latex: '\\sum' },
  { label: 'Pi', latex: '\\pi' },
  { label: 'Greater equal', latex: '\\geq' },
  { label: 'Less equal', latex: '\\leq' },
];

function getEditorContent(value) {
  if (!value) return EMPTY_DOC;

  try {
    const parsed = JSON.parse(value);
    if (parsed?.type === 'doc') return parsed;
  } catch {
    // Plain imported or legacy questions are converted to editor text.
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: value }],
      },
    ],
  };
}

export default function RichQuestionEditor({
  value,
  onChange,
  disabled = false,
  placeholder = 'Write the full question here...',
}) {
  const [showEquation, setShowEquation] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);
  const [tableSize, setTableSize] = useState({ rows: 2, cols: 2 });
  const [latex, setLatex] = useState('');

  const initialContent = useMemo(() => getEditorContent(value), []);

  const editor = useEditor({
    editable: !disabled,
    extensions: [
      StarterKit,
      Underline,
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'qf-rich-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
        },
      }),
    ],
    content: initialContent,
    onUpdate: ({ editor: activeEditor }) => {
      onChange?.(JSON.stringify(activeEditor.getJSON()));
    },
    editorProps: {
      attributes: {
        class: 'qf-rich-editor-content',
        'data-placeholder': placeholder,
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const renderedEquation = useMemo(() => {
    if (!latex.trim()) return '';

    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      return '';
    }
  }, [latex]);

  function insertTable() {
    if (!editor || disabled) return;

    const rows = Math.min(Math.max(Number(tableSize.rows) || 1, 1), 12);
    const cols = Math.min(Math.max(Number(tableSize.cols) || 1, 1), 8);

    editor.chain().focus().insertTable({
      rows,
      cols,
      withHeaderRow: false,
    }).run();
    setShowTableMenu(false);
  }

  function insertSymbol(symbol) {
    setLatex((current) => `${current}${current ? ' ' : ''}${symbol}`);
  }

  function confirmEquation() {
    const cleanLatex = latex.trim();
    if (!editor || !cleanLatex || disabled) return;

    editor.chain().focus().insertInlineMath({ latex: cleanLatex }).run();
    setLatex('');
    setShowEquation(false);
  }

  return (
    <div className={`qf-rich-editor ${disabled ? 'is-disabled' : ''}`}>
      <div className="qf-rich-toolbar" aria-label="Question formatting toolbar">
        <button
          type="button"
          className={editor?.isActive('bold') ? 'is-active' : ''}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          className={editor?.isActive('italic') ? 'is-active' : ''}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          className={editor?.isActive('underline') ? 'is-active' : ''}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={disabled}
          title="Underline"
        >
          U
        </button>

        <span className="qf-rich-divider" />

        <div className="qf-rich-popover-wrap">
          <button
            type="button"
            className={showTableMenu ? 'is-active' : ''}
            onClick={() => {
              setShowTableMenu((open) => !open);
              setShowEquation(false);
            }}
            disabled={disabled}
            title="Insert table"
          >
            Table
          </button>

          {showTableMenu && !disabled ? (
            <div className="qf-rich-popover qf-table-popover">
              <label>
                Rows
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={tableSize.rows}
                  onChange={(event) => setTableSize((size) => ({ ...size, rows: event.target.value }))}
                />
              </label>
              <label>
                Columns
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={tableSize.cols}
                  onChange={(event) => setTableSize((size) => ({ ...size, cols: event.target.value }))}
                />
              </label>
              <div className="qf-rich-popover-actions">
                <button type="button" className="qf-popover-cancel" onClick={() => setShowTableMenu(false)}>
                  Cancel
                </button>
                <button type="button" className="qf-popover-confirm" onClick={insertTable}>
                  Insert
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="qf-equation-wrap">
          <button
            type="button"
            className={showEquation ? 'is-active' : ''}
            onClick={() => {
              setShowEquation((open) => !open);
              setShowTableMenu(false);
            }}
            disabled={disabled}
            title="Insert equation"
          >
            ∑
          </button>

          {showEquation && !disabled ? (
            <div className="qf-rich-popover qf-equation-popover">
              <input
                type="text"
                value={latex}
                onChange={(event) => setLatex(event.target.value)}
                placeholder="e.g. x^2 + y^2 = z^2"
                autoFocus
              />

              <div className="qf-equation-preview">
                {renderedEquation ? (
                  <span dangerouslySetInnerHTML={{ __html: renderedEquation }} />
                ) : (
                  <span className="qf-equation-preview-empty">Preview</span>
                )}
              </div>

              <div className="qf-equation-symbols" aria-label="LaTeX shortcuts">
                {SYMBOLS.map((item) => (
                  <button key={item.latex} type="button" onClick={() => insertSymbol(item.latex)} title={item.label}>
                    {item.latex}
                  </button>
                ))}
              </div>

              <div className="qf-equation-actions">
                <button type="button" className="qf-popover-cancel" onClick={() => setShowEquation(false)}>
                  Cancel
                </button>
                <button type="button" className="qf-popover-confirm" onClick={confirmEquation} disabled={!latex.trim()}>
                  Insert
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

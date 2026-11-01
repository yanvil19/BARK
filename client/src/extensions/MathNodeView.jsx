import React, { useEffect, useRef } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import 'mathlive';
import 'mathlive/static.css';

export default function MathNodeView({ node, updateAttributes, selected, editor }) {
  const mfRef = useRef(null);
  const isUpdatingRef = useRef(false);

  const isEditable = editor.isEditable;

  useEffect(() => {
    const mf = mfRef.current;
    if (!mf) return;

    // Set initial value
    if (mf.value !== (node.attrs.latex || '')) {
      mf.value = node.attrs.latex || '';
    }

    // Configure mathfield options
    mf.readOnly = !isEditable;
    // Don't automatically pop up the virtual keyboard on click/focus
    // (users can still type with their hardware keyboard or trigger it via the toggle button if desired)
    mf.mathVirtualKeyboardPolicy = 'manual';

    const handleInput = (e) => {
      isUpdatingRef.current = true;
      const currentVal = mf.value;
      updateAttributes({ latex: currentVal });
      isUpdatingRef.current = false;
    };

    // Custom paste listener to strip delimiters ($$, $, \( \), \[ \]) and insert into MathField
    const handlePaste = (e) => {
      if (!isEditable) return;
      const clipboardData = e.clipboardData || window.clipboardData;
      if (!clipboardData) return;

      const pastedText = clipboardData.getData('text/plain');
      if (!pastedText) return;

      // Clean wrapping delimiters if present: e.g. $$...$$, $...$, \[...\], \(...\)
      let cleanLatex = pastedText.trim();
      if (cleanLatex.startsWith('$$') && cleanLatex.endsWith('$$')) {
        cleanLatex = cleanLatex.slice(2, -2).trim();
      } else if (cleanLatex.startsWith('\\[') && cleanLatex.endsWith('\\]')) {
        cleanLatex = cleanLatex.slice(2, -2).trim();
      } else if (cleanLatex.startsWith('\\(') && cleanLatex.endsWith('\\)')) {
        cleanLatex = cleanLatex.slice(2, -2).trim();
      } else if (cleanLatex.startsWith('$') && cleanLatex.endsWith('$') && cleanLatex.length >= 2) {
        cleanLatex = cleanLatex.slice(1, -1).trim();
      }

      // If text looks like LaTeX or contains math syntax, insert it directly
      if (cleanLatex !== pastedText.trim() || cleanLatex.includes('\\') || cleanLatex.includes('^') || cleanLatex.includes('_')) {
        e.preventDefault();
        e.stopPropagation();

        if (typeof mf.executeCommand === 'function') {
          mf.executeCommand(['insert', cleanLatex, { format: 'latex' }]);
        } else if (typeof mf.insert === 'function') {
          mf.insert(cleanLatex, { format: 'latex' });
        } else {
          mf.value = cleanLatex;
        }

        isUpdatingRef.current = true;
        updateAttributes({ latex: mf.value });
        isUpdatingRef.current = false;
      }
    };

    // Also stop ProseMirror from capturing keyboard shortcuts like Ctrl+V, Backspace, Arrow keys inside math-field
    const handleKeyDown = (e) => {
      e.stopPropagation();
    };

    // When clicking or pointing down on the mathfield, prevent TipTap / ProseMirror from selecting the entire atom block and removing the cursor
    const handlePointerDown = (e) => {
      e.stopPropagation();
    };

    const handleClick = (e) => {
      e.stopPropagation();
      if (isEditable && mf) {
        mf.focus();
      }
    };

    mf.addEventListener('input', handleInput);
    mf.addEventListener('paste', handlePaste);
    mf.addEventListener('keydown', handleKeyDown);
    mf.addEventListener('pointerdown', handlePointerDown);
    mf.addEventListener('mousedown', handlePointerDown);
    mf.addEventListener('click', handleClick);

    return () => {
      mf.removeEventListener('input', handleInput);
      mf.removeEventListener('paste', handlePaste);
      mf.removeEventListener('keydown', handleKeyDown);
      mf.removeEventListener('pointerdown', handlePointerDown);
      mf.removeEventListener('mousedown', handlePointerDown);
      mf.removeEventListener('click', handleClick);
    };
  }, [isEditable, updateAttributes]);

  // Keep mathfield in sync if attributes change externally
  useEffect(() => {
    const mf = mfRef.current;
    if (!mf || isUpdatingRef.current) return;
    if (mf.value !== (node.attrs.latex || '')) {
      mf.value = node.attrs.latex || '';
    }
  }, [node.attrs.latex]);

  return (
    <NodeViewWrapper className={`math-node-wrapper ${selected ? 'is-selected' : ''}`} data-type="math-node">
      <math-field
        ref={mfRef}
        style={{
          display: 'block',
          margin: '0.5rem 0',
          padding: '8px 12px',
          borderRadius: '6px',
          border: selected ? '1.5px solid #35408e' : '1px solid #d5daf0',
          background: isEditable ? '#f8faff' : 'transparent',
          fontSize: '1.15rem',
          outline: 'none',
          cursor: isEditable ? 'text' : 'default',
        }}
        data-latex={node.attrs.latex || ''}
      >
        {node.attrs.latex || ''}
      </math-field>
    </NodeViewWrapper>
  );
}


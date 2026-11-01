import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import MathNodeView from './MathNodeView.jsx';

export const MathNode = Node.create({
  name: 'mathNode',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => {
          return element.getAttribute('data-latex') || element.getAttribute('value') || element.textContent || '';
        },
        renderHTML: (attributes) => {
          return {
            'data-latex': attributes.latex || '',
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'math-field',
        getAttrs: (element) => ({
          latex: element.getAttribute('data-latex') || element.getAttribute('value') || element.textContent || '',
        }),
      },
      {
        tag: 'div[data-type="math-node"]',
        getAttrs: (element) => ({
          latex: element.getAttribute('data-latex') || '',
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'math-field',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'math-node',
        'data-latex': node.attrs.latex || '',
      }),
      node.attrs.latex || '',
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathNodeView);
  },

  addCommands() {
    return {
      setMathNode:
        (options = {}) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              latex: options.latex || '',
            },
          });
        },
    };
  },
});

export default MathNode;


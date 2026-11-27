import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indentParagraph: () => ReturnType;
      outdentParagraph: () => ReturnType;
    };
  }
}

const MAX_INDENT_LEVEL = 8;
const INDENT_STEP_PT = 24;

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const rawAttr = element.getAttribute('data-indent');
              if (rawAttr) return Math.max(0, Math.min(MAX_INDENT_LEVEL, parseInt(rawAttr, 10) || 0));
              const ml = element.style.marginLeft;
              if (ml) {
                const num = parseFloat(ml);
                if (Number.isFinite(num) && num > 0) {
                  return Math.max(0, Math.min(MAX_INDENT_LEVEL, Math.round(num / INDENT_STEP_PT)));
                }
              }
              return 0;
            },
            renderHTML: (attributes) => {
              const lvl = Number(attributes.indent || 0);
              if (lvl <= 0) return {};
              return {
                'data-indent': String(lvl),
                style: `margin-left: ${lvl * INDENT_STEP_PT}pt`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      indentParagraph:
        () =>
        ({ state, dispatch }) => {
          const { selection, tr } = state;
          let changed = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              const current = Number(node.attrs.indent || 0);
              if (current < MAX_INDENT_LEVEL) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current + 1 });
                changed = true;
              }
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
      outdentParagraph:
        () =>
        ({ state, dispatch }) => {
          const { selection, tr } = state;
          let changed = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              const current = Number(node.attrs.indent || 0);
              if (current > 0) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current - 1 });
                changed = true;
              }
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Tab: () => {
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList') || this.editor.isActive('taskList') || this.editor.isActive('table')) {
          return false;
        }
        return this.editor.commands.indentParagraph();
      },
      'Shift-Tab': () => {
        if (this.editor.isActive('bulletList') || this.editor.isActive('orderedList') || this.editor.isActive('taskList') || this.editor.isActive('table')) {
          return false;
        }
        return this.editor.commands.outdentParagraph();
      },
    };
  },
});


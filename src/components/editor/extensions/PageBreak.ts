import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="page-break"]' },
      { tag: 'div.docium-page-break' },
      { tag: 'hr.docium-page-break' },
      { tag: 'div', style: 'page-break-after: always' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page-break',
        class:
          'docium-page-break my-8 relative flex items-center justify-center border-b-2 border-dashed border-[var(--border)] py-2 text-[11px] font-mono font-medium text-[var(--text-muted)] select-none print:hidden',
      }),
      [
        'span',
        {
          class:
            'bg-[var(--surface)] px-3 py-0.5 rounded border border-[var(--border)] shadow-2xs text-[10px] uppercase tracking-wider',
        },
        'Page Break',
      ],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({ type: this.name })
            .run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.setPageBreak(),
    };
  },
});

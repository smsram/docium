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
        class: 'docium-page-break select-none my-2 print:hidden',
      }),
      [
        'div',
        {
          class:
            'docium-page-break-footer flex items-center justify-between text-[10px] text-[var(--text-muted)] py-2 border-t border-[var(--border-subtle)] select-none cursor-pointer',
          title: 'Double-click to edit footer',
        },
        ['span', { class: 'docium-page-break-footer-text truncate max-w-[65%]' }, ''],
        ['span', { class: 'docium-page-break-page-num font-mono text-[10px] ml-auto' }, 'Page Break'],
      ],
      [
        'div',
        {
          class:
            'docium-page-break-desk-gap h-8 bg-[var(--background)] -mx-6 sm:-mx-10 md:-mx-12 border-y border-[var(--border)] shadow-xs flex items-center justify-center my-1 select-none',
        },
        [
          'span',
          { class: 'text-[9px] font-mono uppercase tracking-widest text-[var(--text-muted)] opacity-40' },
          'Page Boundary',
        ],
      ],
      [
        'div',
        {
          class:
            'docium-page-break-header flex items-center justify-between text-[10px] text-[var(--text-muted)] py-2 border-b border-[var(--border-subtle)] select-none cursor-pointer',
          title: 'Double-click to edit header',
        },
        ['span', { class: 'docium-page-break-header-text truncate max-w-[65%]' }, ''],
        ['span', { class: 'font-mono text-[9px] text-[var(--text-muted)] opacity-40 ml-auto' }, 'DOCIUM'],
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

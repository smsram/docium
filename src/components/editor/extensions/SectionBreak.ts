import { Node, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionBreak: {
      setSectionBreak: () => ReturnType;
    };
  }
}

export const SectionBreak = Node.create({
  name: 'sectionBreak',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  parseHTML() {
    return [
      { tag: 'div[data-type="section-break"]' },
      { tag: 'div.docium-section-break' },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'section-break',
        class:
          'docium-section-break docium-page-break my-6 relative flex items-center justify-center border-b-2 border-dashed border-[var(--primary)]/60 py-2 text-[11px] font-mono font-medium text-[var(--text-muted)] select-none print:hidden',
      }),
      [
        'span',
        {
          class:
            'bg-[var(--surface)] text-[var(--primary)] px-3 py-0.5 rounded border border-[var(--primary)]/40 shadow-2xs text-[10px] uppercase font-semibold tracking-wider',
        },
        'Section Break (Next Page)',
      ],
    ];
  },

  addCommands() {
    return {
      setSectionBreak:
        () =>
        ({ chain }) => {
          return chain().insertContent({ type: this.name }).run();
        },
    };
  },
});


import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    superscript: {
      setSuperscript: () => ReturnType;
      toggleSuperscript: () => ReturnType;
      unsetSuperscript: () => ReturnType;
    };
  }
}

export const Superscript = Mark.create({
  name: 'superscript',

  parseHTML() {
    return [{ tag: 'sup' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setSuperscript:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleSubscript:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetSuperscript:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});


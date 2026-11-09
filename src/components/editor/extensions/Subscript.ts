import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    subscript: {
      setSubscript: () => ReturnType;
      toggleSubscript: () => ReturnType;
      unsetSubscript: () => ReturnType;
    };
  }
}

export const Subscript = Mark.create({
  name: 'subscript',

  parseHTML() {
    return [{ tag: 'sub' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setSubscript:
        () =>
        ({ commands }) => {
          return commands.setMark(this.name);
        },
      toggleSubscript:
        () =>
        ({ commands }) => {
          return commands.toggleMark(this.name);
        },
      unsetSubscript:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});


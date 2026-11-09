import { Mark, mergeAttributes } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (font: string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
  }
}

export const FontFamily = Mark.create({
  name: 'fontFamily',

  addAttributes() {
    return {
      font: {
        default: null,
        parseHTML: (element) => element.style.fontFamily?.replace(/['"]+/g, ''),
        renderHTML: (attributes) => {
          if (!attributes.font) return {};
          return {
            style: `font-family: ${attributes.font}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        style: 'font-family',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontFamily:
        (font: string) =>
        ({ commands }) => {
          return commands.setMark(this.name, { font });
        },
      unsetFontFamily:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});


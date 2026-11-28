import { Mark, mergeAttributes } from '@tiptap/core';
import { normalizeFontSizeToPt } from '@/lib/editor/fontCatalog';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

export const FontSize = Mark.create({
  name: 'fontSize',

  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: (element) => {
          const raw = element.style.fontSize?.replace(/['"]+/g, '');
          return raw ? normalizeFontSizeToPt(raw) : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.size) return {};
          return {
            style: `font-size: ${attributes.size}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        style: 'font-size',
        getAttrs: (value) => {
          if (typeof value !== 'string' || !value.trim()) return false;
          const raw = value.replace(/['"]+/g, '').trim();
          if (!raw) return false;
          return { size: normalizeFontSizeToPt(raw) };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ commands }) => {
          const normalized = normalizeFontSizeToPt(size);
          return commands.setMark(this.name, { size: normalized });
        },
      unsetFontSize:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

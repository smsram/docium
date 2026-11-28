import { Mark, mergeAttributes } from '@tiptap/core';
import { ensureGoogleFontLoaded, resolveFontFamilyValue } from '@/lib/editor/fontCatalog';

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
        parseHTML: (element) => {
          const raw = element.style.fontFamily;
          if (!raw) return null;
          ensureGoogleFontLoaded(raw);
          return resolveFontFamilyValue(raw);
        },
        renderHTML: (attributes) => {
          if (!attributes.font) return {};
          ensureGoogleFontLoaded(attributes.font);
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
        getAttrs: (value) => {
          if (typeof value !== 'string' || !value.trim()) return false;
          const resolved = resolveFontFamilyValue(value);
          ensureGoogleFontLoaded(resolved);
          return { font: resolved };
        },
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
          const resolved = resolveFontFamilyValue(font);
          ensureGoogleFontLoaded(resolved);
          return commands.setMark(this.name, { font: resolved });
        },
      unsetFontFamily:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});

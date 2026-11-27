import { Extension } from '@tiptap/core';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (lineHeight: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
      setParagraphSpacing: (attrs: { marginTop?: string | null; marginBottom?: string | null }) => ReturnType;
    };
  }
}

export const LineHeight = Extension.create({
  name: 'lineHeight',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-line-spacing') || element.style.lineHeight || null,
            renderHTML: (attributes) => {
              if (!attributes.lineHeight) return {};
              const lhNum = parseFloat(String(attributes.lineHeight));
              // Map Word multiple line-spacing (1.0 = 1.18 CSS em, 1.15 = 1.38 CSS em, 1.5 = 1.65 CSS em, 2.0 = 2.15 CSS em)
              let cssLh = String(attributes.lineHeight);
              if (Number.isFinite(lhNum)) {
                if (Math.abs(lhNum - 1.0) < 0.03) cssLh = '1.18';
                else if (Math.abs(lhNum - 1.15) < 0.03) cssLh = '1.38';
                else if (Math.abs(lhNum - 1.5) < 0.03) cssLh = '1.65';
                else if (Math.abs(lhNum - 2.0) < 0.03) cssLh = '2.15';
                else cssLh = String(Math.round(lhNum * 1.15 * 100) / 100);
              }
              const styles: string[] = [`line-height: ${cssLh}`];
              if (!attributes.marginBottom && Number.isFinite(lhNum)) {
                if (lhNum <= 1.0) {
                  styles.push('margin-bottom: 2pt');
                } else if (lhNum <= 1.15) {
                  styles.push('margin-bottom: 6pt');
                }
              }
              return {
                'data-line-spacing': String(attributes.lineHeight),
                style: styles.join('; '),
              };
            },
          },
          marginTop: {
            default: null,
            // Only parse explicit user paragraph spacing via data-space-before attribute
            // so ProseMirror's DOMObserver never mistakes dynamic pagination margin-top for a document attribute
            parseHTML: (element) => element.getAttribute('data-space-before') || null,
            renderHTML: (attributes) => {
              if (!attributes.marginTop) return {};
              return {
                'data-space-before': attributes.marginTop,
                style: `margin-top: ${attributes.marginTop}`,
              };
            },
          },
          marginBottom: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-space-after') || null,
            renderHTML: (attributes) => {
              if (!attributes.marginBottom) return {};
              return {
                'data-space-after': attributes.marginBottom,
                style: `margin-bottom: ${attributes.marginBottom}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (lineHeight: string) =>
        ({ commands }) => {
          const p = commands.updateAttributes('paragraph', { lineHeight });
          const h = commands.updateAttributes('heading', { lineHeight });
          return p || h;
        },
      unsetLineHeight:
        () =>
        ({ commands }) => {
          const p = commands.resetAttributes('paragraph', ['lineHeight', 'marginTop', 'marginBottom']);
          const h = commands.resetAttributes('heading', ['lineHeight', 'marginTop', 'marginBottom']);
          return p || h;
        },
      setParagraphSpacing:
        (attrs: { marginTop?: string | null; marginBottom?: string | null }) =>
        ({ commands }) => {
          const updatePayload: Record<string, string | null> = {};
          if (attrs.marginTop !== undefined) updatePayload.marginTop = attrs.marginTop;
          if (attrs.marginBottom !== undefined) updatePayload.marginBottom = attrs.marginBottom;
          const p = commands.updateAttributes('paragraph', updatePayload);
          const h = commands.updateAttributes('heading', updatePayload);
          return p || h;
        },
    };
  },
});

import { Node, mergeAttributes } from '@tiptap/core';

export type CalloutType = 'info' | 'tip' | 'warning' | 'danger' | 'note';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: { type: CalloutType }) => ReturnType;
      toggleCallout: (attributes?: { type: CalloutType }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'info',
        parseHTML: (element) => element.getAttribute('data-callout-type') || 'info',
        renderHTML: (attributes) => ({
          'data-callout-type': attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const type = (HTMLAttributes['data-callout-type'] || 'info') as CalloutType;
    const typeStyles: Record<CalloutType, { bg: string; border: string; color: string }> = {
      info: { bg: '#ECFDF5', border: '#10B981', color: '#064E3B' },
      tip: { bg: '#EFF6FF', border: '#3B82F6', color: '#1E3A8A' },
      warning: { bg: '#FFFBEB', border: '#F59E0B', color: '#78350F' },
      danger: { bg: '#FFF1F2', border: '#F43F5E', color: '#881337' },
      note: { bg: '#F5F5F4', border: '#78716C', color: '#1C1917' },
    };
    const pal = typeStyles[type] || typeStyles.info;

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        'data-callout-type': type,
        class: 'callout-box my-3 rounded-md p-3.5 transition-colors',
        style: `background-color: ${pal.bg}; border-left: 4px solid ${pal.border}; color: ${pal.color}; margin: 8pt 0; padding: 8pt 12pt; border-radius: 4px;`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attributes);
        },
      toggleCallout:
        (attributes) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attributes);
        },
      unsetCallout:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
    };
  },
});


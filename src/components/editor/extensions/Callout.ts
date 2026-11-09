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
    const typeStyles: Record<CalloutType, string> = {
      info: 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500 text-emerald-950 dark:text-emerald-100',
      tip: 'bg-blue-50/70 dark:bg-blue-950/20 border-blue-500 text-blue-950 dark:text-blue-100',
      warning: 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-500 text-amber-950 dark:text-amber-100',
      danger: 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-500 text-rose-950 dark:text-rose-100',
      note: 'bg-stone-50 dark:bg-stone-900/40 border-stone-400 text-stone-900 dark:text-stone-100',
    };

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        class: `callout-box my-4 rounded-lg p-4 border-l-4 transition-colors ${typeStyles[type] || typeStyles.info}`,
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


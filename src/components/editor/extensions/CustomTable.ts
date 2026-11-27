import { Node, mergeAttributes } from '@tiptap/core';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

export const CustomBlockquote = Node.create({
  name: 'blockquote',
  content: 'block+',
  group: 'block',
  defining: true,
  addAttributes() {
    return {
      borderColor: {
        default: null,
        parseHTML: (el) => el.style.borderLeftColor || el.getAttribute('data-border-color') || null,
        renderHTML: (attrs) =>
          attrs.borderColor
            ? {
                'data-border-color': attrs.borderColor,
                style: `border-left-color: ${attrs.borderColor};`,
              }
            : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: 'blockquote' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(HTMLAttributes), 0];
  },
  addCommands() {
    return {
      setBlockquote:
        () =>
        ({ commands }) =>
          commands.wrapIn(this.name),
      toggleBlockquote:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
      unsetBlockquote:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customTableAttrs: {
      setCellBackground: (color: string | null) => ReturnType;
      setCellVerticalAlign: (align: 'top' | 'middle' | 'bottom') => ReturnType;
      setCellBorderStyle: (borderStyle: 'solid' | 'dashed' | 'none', borderColor?: string) => ReturnType;
      applyTableStylePreset: (preset: 'grid' | 'forest' | 'striped' | 'minimal' | 'executive') => ReturnType;
    };
  }
}

const sharedCellAttributes = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-bg-color') || element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.backgroundColor) return {};
      return {
        'data-bg-color': attributes.backgroundColor,
        style: `background-color: ${attributes.backgroundColor}`,
      };
    },
  },
  verticalAlign: {
    default: 'top',
    parseHTML: (element: HTMLElement) =>
      element.getAttribute('data-v-align') || element.style.verticalAlign || 'top',
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.verticalAlign || attributes.verticalAlign === 'top') return {};
      return {
        'data-v-align': attributes.verticalAlign,
        style: `vertical-align: ${attributes.verticalAlign}`,
      };
    },
  },
  borderColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-border-color') || null,
    renderHTML: (attributes: Record<string, any>) => {
      if (!attributes.borderColor && !attributes.borderStyle) return {};
      const bStyle = attributes.borderStyle || 'solid';
      const bColor = attributes.borderColor || '#cbd5e1';
      if (bStyle === 'none') {
        return {
          'data-border-style': 'none',
          style: 'border: 1px dashed rgba(203,213,225,0.4)',
        };
      }
      return {
        'data-border-color': bColor,
        'data-border-style': bStyle,
        style: `border: 1px ${bStyle} ${bColor}`,
      };
    },
  },
  borderStyle: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-border-style') || null,
    renderHTML: () => ({}),
  },
};

export const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      isContinuation: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-split-continuation') === 'true',
        renderHTML: (attrs) =>
          attrs.isContinuation ? { 'data-split-continuation': 'true' } : {},
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCellBackground:
        (color: string | null) =>
        ({ commands }) => {
          return commands.setCellAttribute('backgroundColor', color);
        },
      setCellVerticalAlign:
        (align: 'top' | 'middle' | 'bottom') =>
        ({ commands }) => {
          return commands.setCellAttribute('verticalAlign', align);
        },
      setCellBorderStyle:
        (borderStyle: 'solid' | 'dashed' | 'none', borderColor?: string) =>
        ({ state, dispatch }) => {
          const { selection, tr } = state;
          let updated = false;
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                borderStyle,
                borderColor: borderColor ?? node.attrs.borderColor ?? '#cbd5e1',
              });
              updated = true;
            }
          });
          if (updated && dispatch) dispatch(tr);
          return updated;
        },
      applyTableStylePreset:
        (preset) =>
        ({ state, dispatch }) => {
          const { $from } = state.selection;
          let tablePos = -1;
          let tableNode: any = null;
          for (let d = $from.depth; d > 0; d--) {
            const n = $from.node(d);
            if (n.type.name === 'table') {
              tableNode = n;
              tablePos = $from.before(d);
              break;
            }
          }
          if (!tableNode || tablePos < 0) return false;

          const tr = state.tr;
          let rowIdx = 0;
          tableNode.forEach((row: any, rowOffset: number) => {
            const isFirstRow = rowIdx === 0;
            row.forEach((cell: any, cellOffset: number) => {
              const cellPos = tablePos + 1 + rowOffset + 1 + cellOffset;
              let bg: string | null = null;
              let bStyle: string = 'solid';
              let bColor: string = '#cbd5e1';

              if (preset === 'forest') {
                bg = isFirstRow ? '#245C45' : rowIdx % 2 === 0 ? '#F4F8F6' : '#FFFFFF';
                bColor = '#B7D1C5';
              } else if (preset === 'striped') {
                bg = isFirstRow ? '#E2E8F0' : rowIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
                bColor = '#CBD5E1';
              } else if (preset === 'minimal') {
                bg = isFirstRow ? '#F8FAFC' : null;
                bStyle = 'none';
                bColor = '#E2E8F0';
              } else if (preset === 'executive') {
                bg = isFirstRow ? '#1E293B' : rowIdx % 2 === 0 ? '#F8FAFC' : '#FFFFFF';
                bColor = '#CBD5E1';
              } else {
                bg = isFirstRow ? '#F1F5F3' : null;
                bColor = '#CBD5E1';
              }

              tr.setNodeMarkup(cellPos, undefined, {
                ...cell.attrs,
                backgroundColor: bg,
                borderStyle: bStyle,
                borderColor: bColor,
              });
            });
            rowIdx++;
          });

          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sharedCellAttributes,
    };
  },
});

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...sharedCellAttributes,
    };
  },
});


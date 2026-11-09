import { Node, mergeAttributes } from '@tiptap/core';

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'double-arrow'
  | 'connector'
  | 'callout'
  | 'star'
  | 'process'
  | 'decision'
  | 'document'
  | 'data';

export interface ShapeAttributes {
  shapeType: ShapeType;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  rotation: number;
  alignment: 'left' | 'center' | 'right';
  text?: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shape: {
      insertShape: (attributes: Partial<ShapeAttributes>) => ReturnType;
      updateShape: (attributes: Partial<ShapeAttributes>) => ReturnType;
    };
  }
}

export function generateShapeSvg(attrs: ShapeAttributes): string {
  const { shapeType, width, height, fill, stroke, strokeWidth, rotation, text } = attrs;
  const pad = strokeWidth;
  const w = Math.max(20, width);
  const h = Math.max(20, height);
  const cx = w / 2;
  const cy = h / 2;

  let pathData = '';

  switch (shapeType) {
    case 'rectangle':
    case 'process':
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'rounded-rectangle':
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" rx="12" ry="12" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'ellipse':
      pathData = `<ellipse cx="${cx}" cy="${cy}" rx="${cx - pad}" ry="${cy - pad}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'triangle':
      pathData = `<polygon points="${cx},${pad} ${w - pad},${h - pad} ${pad},${h - pad}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'diamond':
    case 'decision':
      pathData = `<polygon points="${cx},${pad} ${w - pad},${cy} ${cx},${h - pad} ${pad},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'line':
      pathData = `<line x1="${pad}" y1="${cy}" x2="${w - pad}" y2="${cy}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'arrow':
      pathData = `
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
        </defs>
        <line x1="${pad}" y1="${cy}" x2="${w - 10}" y2="${cy}" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#arrowhead)" />
      `;
      break;

    case 'double-arrow':
      pathData = `
        <defs>
          <marker id="arrowhead-start" markerWidth="8" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
          <marker id="arrowhead-end" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
        </defs>
        <line x1="${10}" y1="${cy}" x2="${w - 10}" y2="${cy}" stroke="${stroke}" stroke-width="${strokeWidth}" marker-start="url(#arrowhead-start)" marker-end="url(#arrowhead-end)" />
      `;
      break;

    case 'connector':
      pathData = `<path d="M ${pad} ${pad} L ${cx} ${pad} L ${cx} ${h - pad} L ${w - pad} ${h - pad}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'callout':
      pathData = `<path d="M ${pad + 8} ${pad} L ${w - pad - 8} ${pad} Q ${w - pad} ${pad} ${w - pad} ${pad + 8} L ${w - pad} ${h - 24} Q ${w - pad} ${h - 16} ${w - pad - 8} ${h - 16} L 40 ${h - 16} L 20 ${h - pad} L 24 ${h - 16} L ${pad + 8} ${h - 16} Q ${pad} ${h - 16} ${pad} ${h - 24} L ${pad} ${pad + 8} Q ${pad} ${pad} ${pad + 8} ${pad} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'star': {
      const points: string[] = [];
      const outerR = Math.min(cx, cy) - pad;
      const innerR = outerR * 0.45;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      pathData = `<polygon points="${points.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;
    }

    case 'document':
      pathData = `<path d="M ${pad} ${pad} L ${w - pad} ${pad} L ${w - pad} ${h - 20} Q ${w * 0.75} ${h} ${cx} ${h - 10} Q ${w * 0.25} ${h - 20} ${pad} ${h} Z" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    case 'data':
      pathData = `<polygon points="${pad + 20},${pad} ${w - pad},${pad} ${w - pad - 20},${h - pad} ${pad},${h - pad}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
      break;

    default:
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }

  const textElem = text
    ? `<text x="${cx}" y="${cy + 4}" font-family="sans-serif" font-size="12" font-weight="500" fill="${stroke}" text-anchor="middle" dominant-baseline="middle">${text}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="transform: rotate(${rotation}deg); transform-origin: center; display: block; overflow: visible;">${pathData}${textElem}</svg>`;
}

export const ShapeNode = Node.create({
  name: 'shape',
  group: 'block',
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      shapeType: { default: 'rectangle' },
      width: { default: 160 },
      height: { default: 100 },
      fill: { default: '#E7EAE4' },
      stroke: { default: '#245C45' },
      strokeWidth: { default: 2 },
      rotation: { default: 0 },
      alignment: { default: 'center' },
      text: { default: '' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="docium-shape"]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            shapeType: el.getAttribute('data-shape-type') || 'rectangle',
            width: parseInt(el.getAttribute('data-width') || '160', 10),
            height: parseInt(el.getAttribute('data-height') || '100', 10),
            fill: el.getAttribute('data-fill') || '#E7EAE4',
            stroke: el.getAttribute('data-stroke') || '#245C45',
            strokeWidth: parseInt(el.getAttribute('data-stroke-width') || '2', 10),
            rotation: parseInt(el.getAttribute('data-rotation') || '0', 10),
            alignment: el.getAttribute('data-alignment') || 'center',
            text: el.getAttribute('data-text') || '',
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs: ShapeAttributes = {
      shapeType: HTMLAttributes.shapeType || 'rectangle',
      width: HTMLAttributes.width || 160,
      height: HTMLAttributes.height || 100,
      fill: HTMLAttributes.fill || '#E7EAE4',
      stroke: HTMLAttributes.stroke || '#245C45',
      strokeWidth: HTMLAttributes.strokeWidth || 2,
      rotation: HTMLAttributes.rotation || 0,
      alignment: HTMLAttributes.alignment || 'center',
      text: HTMLAttributes.text || '',
    };

    const alignClass =
      attrs.alignment === 'left'
        ? 'justify-start'
        : attrs.alignment === 'right'
        ? 'justify-end'
        : 'justify-center';

    const svgContent = generateShapeSvg(attrs);

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'docium-shape',
        'data-shape-type': attrs.shapeType,
        'data-width': attrs.width,
        'data-height': attrs.height,
        'data-fill': attrs.fill,
        'data-stroke': attrs.stroke,
        'data-stroke-width': attrs.strokeWidth,
        'data-rotation': attrs.rotation,
        'data-alignment': attrs.alignment,
        'data-text': attrs.text,
        class: `docium-shape-wrapper my-4 flex ${alignClass} cursor-pointer group select-none`,
      }),
      ['div', { class: 'inline-block relative p-1 rounded hover:ring-2 hover:ring-[var(--primary)] transition-all' }, ['span', { dangerouslySetInnerHTML: { __html: svgContent } }]],
    ];
  },

  addCommands() {
    return {
      insertShape:
        (attributes) =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                shapeType: attributes.shapeType || 'rectangle',
                width: attributes.width || 160,
                height: attributes.height || 100,
                fill: attributes.fill || '#F0F4F1',
                stroke: attributes.stroke || '#245C45',
                strokeWidth: attributes.strokeWidth || 2,
                rotation: attributes.rotation || 0,
                alignment: attributes.alignment || 'center',
                text: attributes.text || '',
              },
            })
            .run();
        },
      updateShape:
        (attributes) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, attributes);
        },
    };
  },
});


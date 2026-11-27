'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  RotateCw,
  CopyPlus,
  Trash2,
  Type,
  WrapText,
  Palette,
  Pipette,
} from 'lucide-react';

export type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'triangle'
  | 'right-triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'cross'
  | 'heart'
  | 'cloud'
  | 'star'
  | 'star-4'
  | 'banner'
  | 'callout'
  | 'oval-callout'
  | 'line'
  | 'arrow'
  | 'left-arrow'
  | 'double-arrow'
  | 'block-arrow-right'
  | 'block-arrow-left'
  | 'block-arrow-up'
  | 'block-arrow-down'
  | 'connector'
  | 'process'
  | 'decision'
  | 'terminator'
  | 'document'
  | 'data'
  | 'database';

export type ShapeAlignMode = 'left' | 'center' | 'right' | 'float-left' | 'float-right';

export interface ShapeAttributes {
  shapeType: ShapeType;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle?: 'solid' | 'dashed' | 'dotted';
  rotation: number;
  alignment: ShapeAlignMode;
  text?: string;
  textColor?: string;
  fontSize?: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    shape: {
      insertShape: (attributes: Partial<ShapeAttributes>) => ReturnType;
      updateShape: (attributes: Partial<ShapeAttributes>) => ReturnType;
    };
  }
}

export function generateShapeSvg(attrs: ShapeAttributes, includeText = true): string {
  const {
    shapeType,
    width,
    height,
    fill,
    stroke,
    strokeWidth,
    strokeStyle = 'solid',
    rotation,
    text,
    textColor,
    fontSize = 12,
  } = attrs;
  const pad = Math.max(2, strokeWidth);
  const w = Math.max(24, width);
  const h = Math.max(24, height);
  const cx = w / 2;
  const cy = h / 2;
  const fillVal = fill === 'transparent' || fill === 'none' ? 'none' : fill;
  const dashAttr =
    strokeStyle === 'dashed'
      ? ' stroke-dasharray="8 5"'
      : strokeStyle === 'dotted'
      ? ' stroke-dasharray="2.5 3.5"'
      : '';
  const commonAttrs = `fill="${fillVal}" stroke="${stroke}" stroke-width="${strokeWidth}"${dashAttr}`;
  const uid = `${shapeType}-${w}-${h}-${stroke.replace('#', '')}`;

  let pathData = '';

  switch (shapeType) {
    case 'rectangle':
    case 'process':
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" ${commonAttrs} />`;
      break;

    case 'rounded-rectangle':
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" rx="14" ry="14" ${commonAttrs} />`;
      break;

    case 'terminator':
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" rx="${Math.min(w, h) / 2 - pad}" ry="${Math.min(w, h) / 2 - pad}" ${commonAttrs} />`;
      break;

    case 'ellipse':
      pathData = `<ellipse cx="${cx}" cy="${cy}" rx="${cx - pad}" ry="${cy - pad}" ${commonAttrs} />`;
      break;

    case 'triangle':
      pathData = `<polygon points="${cx},${pad} ${w - pad},${h - pad} ${pad},${h - pad}" ${commonAttrs} />`;
      break;

    case 'right-triangle':
      pathData = `<polygon points="${pad},${pad} ${w - pad},${h - pad} ${pad},${h - pad}" ${commonAttrs} />`;
      break;

    case 'diamond':
    case 'decision':
      pathData = `<polygon points="${cx},${pad} ${w - pad},${cy} ${cx},${h - pad} ${pad},${cy}" ${commonAttrs} />`;
      break;

    case 'pentagon': {
      const pts: string[] = [];
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        pts.push(`${cx + (cx - pad) * Math.cos(a)},${cy + (cy - pad) * Math.sin(a)}`);
      }
      pathData = `<polygon points="${pts.join(' ')}" ${commonAttrs} />`;
      break;
    }

    case 'hexagon': {
      const dx = Math.min(w * 0.22, 36);
      pathData = `<polygon points="${pad + dx},${pad} ${w - pad - dx},${pad} ${w - pad},${cy} ${w - pad - dx},${h - pad} ${pad + dx},${h - pad} ${pad},${cy}" ${commonAttrs} />`;
      break;
    }

    case 'octagon': {
      const ox = (w - 2 * pad) * 0.29;
      const oy = (h - 2 * pad) * 0.29;
      pathData = `<polygon points="${pad + ox},${pad} ${w - pad - ox},${pad} ${w - pad},${pad + oy} ${w - pad},${h - pad - oy} ${w - pad - ox},${h - pad} ${pad + ox},${h - pad} ${pad},${h - pad - oy} ${pad},${pad + oy}" ${commonAttrs} />`;
      break;
    }

    case 'cross': {
      const armX = (w - 2 * pad) * 0.32;
      const armY = (h - 2 * pad) * 0.32;
      pathData = `<polygon points="${cx - armX / 2},${pad} ${cx + armX / 2},${pad} ${cx + armX / 2},${cy - armY / 2} ${w - pad},${cy - armY / 2} ${w - pad},${cy + armY / 2} ${cx + armX / 2},${cy + armY / 2} ${cx + armX / 2},${h - pad} ${cx - armX / 2},${h - pad} ${cx - armX / 2},${cy + armY / 2} ${pad},${cy + armY / 2} ${pad},${cy - armY / 2} ${cx - armX / 2},${cy - armY / 2}" ${commonAttrs} />`;
      break;
    }

    case 'heart':
      pathData = `<path d="M ${cx} ${h - pad - 2} C ${cx * 0.2} ${h * 0.65}, ${pad} ${h * 0.28}, ${cx * 0.52} ${pad + 4} C ${cx * 0.8} ${pad + 4}, ${cx} ${h * 0.26}, ${cx} ${h * 0.32} C ${cx} ${h * 0.26}, ${w - cx * 0.8} ${pad + 4}, ${w - cx * 0.52} ${pad + 4} C ${w - pad} ${h * 0.28}, ${w - cx * 0.2} ${h * 0.65}, ${cx} ${h - pad - 2} Z" ${commonAttrs} />`;
      break;

    case 'cloud':
      pathData = `<path d="M ${w * 0.25} ${h * 0.78} H ${w * 0.78} C ${w * 0.9} ${h * 0.78} ${w - pad} ${h * 0.66} ${w - pad} ${h * 0.54} C ${w - pad} ${h * 0.42} ${w * 0.88} ${h * 0.34} ${w * 0.77} ${h * 0.34} C ${w * 0.73} ${h * 0.18} ${w * 0.57} ${pad + 2} ${w * 0.42} ${h * 0.18} C ${w * 0.3} ${h * 0.14} ${w * 0.18} ${h * 0.24} ${w * 0.18} ${h * 0.38} C ${pad + 2} ${h * 0.4} ${pad} ${h * 0.52} ${pad + 2} ${h * 0.63} C ${pad + 4} ${h * 0.73} ${w * 0.14} ${h * 0.78} ${w * 0.25} ${h * 0.78} Z" ${commonAttrs} />`;
      break;

    case 'banner':
      pathData = `<polygon points="${pad},${pad} ${w - pad},${pad} ${w - pad - 16},${cy} ${w - pad},${h - pad} ${pad},${h - pad} ${pad + 16},${cy}" ${commonAttrs} />`;
      break;

    case 'line':
      pathData = `<line x1="${pad}" y1="${cy}" x2="${w - pad}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}"${dashAttr} />`;
      break;

    case 'arrow':
      pathData = `
        <defs>
          <marker id="arr-end-${uid}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
        </defs>
        <line x1="${pad}" y1="${cy}" x2="${w - 10}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}"${dashAttr} marker-end="url(#arr-end-${uid})" />
      `;
      break;

    case 'left-arrow':
      pathData = `
        <defs>
          <marker id="arr-l-${uid}" markerWidth="8" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
        </defs>
        <line x1="${10}" y1="${cy}" x2="${w - pad}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}"${dashAttr} marker-start="url(#arr-l-${uid})" />
      `;
      break;

    case 'double-arrow':
      pathData = `
        <defs>
          <marker id="arr-ds-${uid}" markerWidth="8" markerHeight="6" refX="1" refY="3" orient="auto-start-reverse">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
          <marker id="arr-de-${uid}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="${stroke}" />
          </marker>
        </defs>
        <line x1="${10}" y1="${cy}" x2="${w - 10}" y2="${cy}" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}"${dashAttr} marker-start="url(#arr-ds-${uid})" marker-end="url(#arr-de-${uid})" />
      `;
      break;

    case 'block-arrow-right': {
      const headW = Math.min(w * 0.35, h * 0.7);
      const shaftY = h * 0.28;
      pathData = `<polygon points="${pad},${shaftY} ${w - pad - headW},${shaftY} ${w - pad - headW},${pad} ${w - pad},${cy} ${w - pad - headW},${h - pad} ${w - pad - headW},${h - shaftY} ${pad},${h - shaftY}" ${commonAttrs} />`;
      break;
    }

    case 'block-arrow-left': {
      const headW = Math.min(w * 0.35, h * 0.7);
      const shaftY = h * 0.28;
      pathData = `<polygon points="${w - pad},${shaftY} ${pad + headW},${shaftY} ${pad + headW},${pad} ${pad},${cy} ${pad + headW},${h - pad} ${pad + headW},${h - shaftY} ${w - pad},${h - shaftY}" ${commonAttrs} />`;
      break;
    }

    case 'block-arrow-up': {
      const headH = Math.min(h * 0.36, w * 0.7);
      const shaftX = w * 0.28;
      pathData = `<polygon points="${cx},${pad} ${w - pad},${pad + headH} ${w - shaftX},${pad + headH} ${w - shaftX},${h - pad} ${shaftX},${h - pad} ${shaftX},${pad + headH} ${pad},${pad + headH}" ${commonAttrs} />`;
      break;
    }

    case 'block-arrow-down': {
      const headH = Math.min(h * 0.36, w * 0.7);
      const shaftX = w * 0.28;
      pathData = `<polygon points="${shaftX},${pad} ${w - shaftX},${pad} ${w - shaftX},${h - pad - headH} ${w - pad},${h - pad - headH} ${cx},${h - pad} ${pad},${h - pad - headH} ${shaftX},${h - pad - headH}" ${commonAttrs} />`;
      break;
    }

    case 'connector':
      pathData = `<path d="M ${pad} ${pad} L ${cx} ${pad} L ${cx} ${h - pad} L ${w - pad} ${h - pad}" fill="none" stroke="${stroke}" stroke-width="${Math.max(2, strokeWidth)}"${dashAttr} />`;
      break;

    case 'callout':
      pathData = `<path d="M ${pad + 8} ${pad} L ${w - pad - 8} ${pad} Q ${w - pad} ${pad} ${w - pad} ${pad + 8} L ${w - pad} ${h - 22} Q ${w - pad} ${h - 14} ${w - pad - 8} ${h - 14} L ${Math.min(w * 0.42, 48)} ${h - 14} L ${Math.min(w * 0.22, 22)} ${h - pad} L ${Math.min(w * 0.28, 28)} ${h - 14} L ${pad + 8} ${h - 14} Q ${pad} ${h - 14} ${pad} ${h - 22} L ${pad} ${pad + 8} Q ${pad} ${pad} ${pad + 8} ${pad} Z" ${commonAttrs} />`;
      break;

    case 'oval-callout':
      pathData = `<path d="M ${cx} ${pad} C ${w - pad * 2} ${pad}, ${w - pad} ${cy * 0.55}, ${w - pad} ${cy * 0.88} C ${w - pad} ${h * 0.72}, ${w * 0.72} ${h - 16}, ${cx} ${h - 16} C ${w * 0.42} ${h - 16}, ${w * 0.36} ${h - 16}, ${w * 0.32} ${h - 17} L ${w * 0.18} ${h - pad} L ${w * 0.24} ${h - 20} C ${pad + 6} ${h * 0.68}, ${pad} ${cy * 1.1}, ${pad} ${cy * 0.88} C ${pad} ${cy * 0.55}, ${pad * 2} ${pad}, ${cx} ${pad} Z" ${commonAttrs} />`;
      break;

    case 'star': {
      const points: string[] = [];
      const outerR = Math.min(cx, cy) - pad;
      const innerR = outerR * 0.42;
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      pathData = `<polygon points="${points.join(' ')}" ${commonAttrs} />`;
      break;
    }

    case 'star-4': {
      const points: string[] = [];
      const outerR = Math.min(cx, cy) - pad;
      const innerR = outerR * 0.35;
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
      }
      pathData = `<polygon points="${points.join(' ')}" ${commonAttrs} />`;
      break;
    }

    case 'document':
      pathData = `<path d="M ${pad} ${pad} L ${w - pad} ${pad} L ${w - pad} ${h - 18} Q ${w * 0.75} ${h + 2} ${cx} ${h - 10} Q ${w * 0.25} ${h - 22} ${pad} ${h - 4} Z" ${commonAttrs} />`;
      break;

    case 'data':
      pathData = `<polygon points="${pad + 18},${pad} ${w - pad},${pad} ${w - pad - 18},${h - pad} ${pad},${h - pad}" ${commonAttrs} />`;
      break;

    case 'database': {
      const ry = Math.min(14, h * 0.16);
      pathData = `
        <path d="M ${pad} ${pad + ry} L ${pad} ${h - pad - ry} A ${cx - pad} ${ry} 0 0 0 ${w - pad} ${h - pad - ry} L ${w - pad} ${pad + ry} Z" ${commonAttrs} />
        <ellipse cx="${cx}" cy="${pad + ry}" rx="${cx - pad}" ry="${ry}" ${commonAttrs} />
      `;
      break;
    }

    default:
      pathData = `<rect x="${pad}" y="${pad}" width="${w - 2 * pad}" height="${h - 2 * pad}" ${commonAttrs} />`;
  }

  const escapedText = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const resolvedTextColor = textColor || stroke || '#171c19';
  const textElem =
    includeText && escapedText
      ? `<text x="${cx}" y="${cy}" font-family="Calibri, Arial, sans-serif" font-size="${fontSize}" font-weight="600" fill="${resolvedTextColor}" text-anchor="middle" dominant-baseline="central">${escapedText}</text>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="transform: rotate(${rotation}deg); transform-origin: center; display: block; overflow: visible;">${pathData}${textElem}</svg>`;
}

const SHAPE_FILL_PRESETS = [
  '#EAF2ED',
  '#245C45',
  '#DBEAFE',
  '#FEF3C7',
  '#FFE4E6',
  '#F3E8FF',
  '#FFFFFF',
  'transparent',
];

const SHAPE_STROKE_PRESETS = [
  '#245C45',
  '#1E3A8A',
  '#B45309',
  '#BE123C',
  '#6B21A8',
  '#171C19',
  '#64748B',
];

function ShapeNodeView({ node, updateAttributes, deleteNode, selected, editor }: NodeViewProps) {
  const attrs: ShapeAttributes = {
    shapeType: (node.attrs.shapeType || 'rectangle') as ShapeType,
    width: Number(node.attrs.width || 180),
    height: Number(node.attrs.height || 110),
    fill: String(node.attrs.fill || '#EAF2ED'),
    stroke: String(node.attrs.stroke || '#245C45'),
    strokeWidth: Number(node.attrs.strokeWidth ?? 2),
    strokeStyle: (node.attrs.strokeStyle || 'solid') as 'solid' | 'dashed' | 'dotted',
    rotation: Number(node.attrs.rotation || 0),
    alignment: (node.attrs.alignment || 'center') as ShapeAlignMode,
    text: String(node.attrs.text || ''),
    textColor: String(node.attrs.textColor || node.attrs.stroke || '#171C19'),
    fontSize: Number(node.attrs.fontSize || 12),
  };

  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState(attrs.text || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraftText(attrs.text || '');
  }, [attrs.text]);

  const startResize = (dir: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = attrs.width;
    const origH = attrs.height;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let nextW = origW;
      let nextH = origH;

      if (dir.includes('e')) nextW = Math.max(40, Math.round(origW + dx));
      if (dir.includes('w')) nextW = Math.max(40, Math.round(origW - dx));
      if (dir.includes('s')) nextH = Math.max(28, Math.round(origH + dy));
      if (dir.includes('n')) nextH = Math.max(28, Math.round(origH - dy));

      updateAttributes({ width: nextW, height: nextH });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const commitShapeText = () => {
    updateAttributes({ text: draftText });
    setIsEditingText(false);
  };

  const isLineType =
    attrs.shapeType === 'line' ||
    attrs.shapeType === 'arrow' ||
    attrs.shapeType === 'left-arrow' ||
    attrs.shapeType === 'double-arrow' ||
    attrs.shapeType === 'connector';

  const wrapperStyle: React.CSSProperties =
    attrs.alignment === 'float-left'
      ? { float: 'left', marginRight: '14px', marginBottom: '8px', marginTop: '4px' }
      : attrs.alignment === 'float-right'
      ? { float: 'right', marginLeft: '14px', marginBottom: '8px', marginTop: '4px' }
      : {
          display: 'flex',
          justifyContent:
            attrs.alignment === 'left'
              ? 'flex-start'
              : attrs.alignment === 'right'
              ? 'flex-end'
              : 'center',
          margin: '8pt 0',
        };

  const svgMarkup = generateShapeSvg(attrs, false);

  return (
    <NodeViewWrapper
      data-type="docium-shape"
      data-shape-type={attrs.shapeType}
      data-width={attrs.width}
      data-height={attrs.height}
      data-fill={attrs.fill}
      data-stroke={attrs.stroke}
      data-stroke-width={attrs.strokeWidth}
      data-rotation={attrs.rotation}
      data-alignment={attrs.alignment}
      data-text={attrs.text || ''}
      style={{
        ...wrapperStyle,
        zIndex: selected ? 40 : undefined,
      }}
      className="docium-shape-wrapper select-none relative"
    >
      <div
        onDoubleClick={(e) => {
          if (isLineType) return;
          e.stopPropagation();
          setIsEditingText(true);
          setTimeout(() => textareaRef.current?.focus(), 20);
        }}
        style={{ width: `${attrs.width}px`, height: `${attrs.height}px` }}
        className={`relative inline-flex items-center justify-center transition-shadow ${
          selected ? 'ring-2 ring-[#245c45] ring-offset-2 rounded-xs z-30' : 'hover:ring-1 hover:ring-[#245c45]/50'
        }`}
      >
        {/* Contextual Shape Format Toolbar */}
        {selected && !isEditingText && (
          <div
            data-docium-ui-only="true"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute -top-11 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-xl text-[11px] text-gray-800 whitespace-nowrap print:hidden"
          >
            {/* Fill Swatches */}
            {!isLineType && (
              <div className="flex items-center gap-0.5 pr-1.5 border-r border-gray-200" title="Shape Fill">
                {SHAPE_FILL_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => updateAttributes({ fill: c })}
                    style={{
                      backgroundColor: c === 'transparent' ? '#ffffff' : c,
                      backgroundImage:
                        c === 'transparent'
                          ? 'linear-gradient(45deg, #ef4444 45%, transparent 45%, transparent 55%, #ef4444 55%)'
                          : undefined,
                    }}
                    className={`w-3.5 h-3.5 rounded-full border cursor-pointer ${
                      attrs.fill === c ? 'ring-2 ring-[#245c45] border-white' : 'border-gray-300'
                    }`}
                    title={c === 'transparent' ? 'No Fill' : `Fill ${c}`}
                  />
                ))}
                <label
                  className="inline-flex items-center justify-center w-5 h-5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer ml-0.5"
                  title="Custom Fill Color"
                >
                  <Palette className="w-3 h-3 text-gray-700" />
                  <input
                    type="color"
                    value={attrs.fill.startsWith('#') ? attrs.fill : '#EAF2ED'}
                    onChange={(e) => updateAttributes({ fill: e.target.value })}
                    className="sr-only"
                  />
                </label>
                {typeof window !== 'undefined' && 'EyeDropper' in window && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const ED = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
                        if (!ED) return;
                        const res = await new ED().open();
                        if (res?.sRGBHex) updateAttributes({ fill: res.sRGBHex });
                      } catch {
                        // Cancelled
                      }
                    }}
                    className="inline-flex items-center justify-center w-5 h-5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer"
                    title="Pick Fill Color from Page"
                  >
                    <Pipette className="w-3 h-3 text-gray-700" />
                  </button>
                )}
              </div>
            )}

            {/* Stroke Color & Style */}
            <div className="flex items-center gap-0.5 pr-1.5 border-r border-gray-200" title="Outline Color">
              {SHAPE_STROKE_PRESETS.slice(0, 4).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => updateAttributes({ stroke: c })}
                  style={{ backgroundColor: c }}
                  className={`w-3.5 h-3.5 rounded-xs border cursor-pointer ${
                    attrs.stroke === c ? 'ring-2 ring-[#245c45]' : 'border-gray-300'
                  }`}
                  title={`Outline ${c}`}
                />
              ))}
              <select
                value={attrs.strokeStyle}
                onChange={(e) => updateAttributes({ strokeStyle: e.target.value })}
                className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-gray-50 outline-none cursor-pointer"
                title="Outline Dash Style"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>

            {/* Edit Text Button */}
            {!isLineType && (
              <button
                type="button"
                onClick={() => {
                  setIsEditingText(true);
                  setTimeout(() => textareaRef.current?.focus(), 20);
                }}
                className="p-1 rounded hover:bg-gray-100 text-gray-700 cursor-pointer"
                title="Add / Edit Text inside Shape (or Double-Click)"
              >
                <Type className="h-3.5 w-3.5" />
              </button>
            )}

            {/* Alignment & Wrap */}
            <button
              type="button"
              onClick={() => updateAttributes({ alignment: 'left' })}
              className={`p-1 rounded cursor-pointer ${attrs.alignment === 'left' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Align Left"
            >
              <AlignLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ alignment: 'center' })}
              className={`p-1 rounded cursor-pointer ${attrs.alignment === 'center' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Align Center"
            >
              <AlignCenter className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAttributes({ alignment: 'right' })}
              className={`p-1 rounded cursor-pointer ${attrs.alignment === 'right' ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'}`}
              title="Align Right"
            >
              <AlignRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                updateAttributes({
                  alignment: attrs.alignment === 'float-right' ? 'center' : attrs.alignment === 'float-left' ? 'float-right' : 'float-left',
                })
              }
              className={`p-1 rounded cursor-pointer ${
                attrs.alignment.startsWith('float-') ? 'bg-[#eaf2ed] text-[#245c45]' : 'hover:bg-gray-100'
              }`}
              title="Toggle Text Wrapping (Float Left / Float Right / In Line)"
            >
              <WrapText className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => updateAttributes({ rotation: (attrs.rotation + 45) % 360 })}
              className="p-1 rounded hover:bg-gray-100 cursor-pointer"
              title="Rotate 45°"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => editor.chain().focus().insertShape({ ...attrs }).run()}
              className="p-1 rounded hover:bg-gray-100 cursor-pointer"
              title="Duplicate Shape"
            >
              <CopyPlus className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => deleteNode()}
              className="p-1 rounded hover:bg-rose-50 text-rose-600 cursor-pointer"
              title="Delete Shape"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Crisp Vector SVG */}
        <div
          className="w-full h-full pointer-events-none"
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
        />

        {/* Centered Shape Text or Inline Editor */}
        {!isLineType &&
          (isEditingText ? (
            <textarea
              ref={textareaRef}
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onBlur={commitShapeText}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault();
                  commitShapeText();
                }
              }}
              placeholder="Shape text..."
              style={{
                color: attrs.textColor || attrs.stroke || '#171c19',
                fontSize: `${attrs.fontSize || 12}px`,
              }}
              className="absolute inset-3 bg-transparent text-center font-semibold outline-none resize-none flex items-center justify-center leading-tight"
            />
          ) : attrs.text ? (
            <div
              style={{
                color: attrs.textColor || attrs.stroke || '#171c19',
                fontSize: `${attrs.fontSize || 12}px`,
                transform: `rotate(${attrs.rotation}deg)`,
              }}
              className="absolute inset-3 flex items-center justify-center text-center font-semibold leading-snug pointer-events-none break-words overflow-hidden px-2"
            >
              {attrs.text}
            </div>
          ) : null)}

        {/* 8 Interactive Resize Handles (Word / Google Docs style) */}
        {selected && (
          <>
            <div onMouseDown={startResize('nw')} className="absolute -top-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nwse-resize z-30 print:hidden" />
            <div onMouseDown={startResize('n')} className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-ns-resize z-30 print:hidden" />
            <div onMouseDown={startResize('ne')} className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nesw-resize z-30 print:hidden" />
            <div onMouseDown={startResize('e')} className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-ew-resize z-30 print:hidden" />
            <div onMouseDown={startResize('se')} className="absolute -bottom-1.5 -right-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nwse-resize z-30 print:hidden" />
            <div onMouseDown={startResize('s')} className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-ns-resize z-30 print:hidden" />
            <div onMouseDown={startResize('sw')} className="absolute -bottom-1.5 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-nesw-resize z-30 print:hidden" />
            <div onMouseDown={startResize('w')} className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2.5 h-2.5 bg-white border-2 border-[#245c45] rounded-xs cursor-ew-resize z-30 print:hidden" />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
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
      width: { default: 180 },
      height: { default: 110 },
      fill: { default: '#EAF2ED' },
      stroke: { default: '#245C45' },
      strokeWidth: { default: 2 },
      strokeStyle: { default: 'solid' },
      rotation: { default: 0 },
      alignment: { default: 'center' },
      text: { default: '' },
      textColor: { default: '#171C19' },
      fontSize: { default: 12 },
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
            width: parseInt(el.getAttribute('data-width') || '180', 10),
            height: parseInt(el.getAttribute('data-height') || '110', 10),
            fill: el.getAttribute('data-fill') || '#EAF2ED',
            stroke: el.getAttribute('data-stroke') || '#245C45',
            strokeWidth: parseInt(el.getAttribute('data-stroke-width') || '2', 10),
            strokeStyle: el.getAttribute('data-stroke-style') || 'solid',
            rotation: parseInt(el.getAttribute('data-rotation') || '0', 10),
            alignment: el.getAttribute('data-alignment') || 'center',
            text: el.getAttribute('data-text') || el.textContent?.trim() || '',
            textColor: el.getAttribute('data-text-color') || '#171C19',
            fontSize: parseInt(el.getAttribute('data-font-size') || '12', 10),
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const shapeType = HTMLAttributes.shapeType || 'rectangle';
    const width = HTMLAttributes.width || 180;
    const height = HTMLAttributes.height || 110;
    const fill = HTMLAttributes.fill || '#EAF2ED';
    const stroke = HTMLAttributes.stroke || '#245C45';
    const strokeWidth = HTMLAttributes.strokeWidth ?? 2;
    const strokeStyle = HTMLAttributes.strokeStyle || 'solid';
    const rotation = HTMLAttributes.rotation || 0;
    const alignment = HTMLAttributes.alignment || 'center';
    const text = HTMLAttributes.text || '';
    const textColor = HTMLAttributes.textColor || stroke;
    const fontSize = HTMLAttributes.fontSize || 12;

    const svgDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(
      generateShapeSvg({
        shapeType,
        width,
        height,
        fill,
        stroke,
        strokeWidth,
        strokeStyle,
        rotation,
        alignment,
        text,
        textColor,
        fontSize,
      })
    )}`;

    return [
      'div',
      mergeAttributes({
        'data-type': 'docium-shape',
        'data-shape-type': shapeType,
        'data-width': width,
        'data-height': height,
        'data-fill': fill,
        'data-stroke': stroke,
        'data-stroke-width': strokeWidth,
        'data-stroke-style': strokeStyle,
        'data-rotation': rotation,
        'data-alignment': alignment,
        'data-text': text,
        'data-text-color': textColor,
        'data-font-size': fontSize,
        style: `text-align: ${alignment === 'left' || alignment === 'float-left' ? 'left' : alignment === 'right' || alignment === 'float-right' ? 'right' : 'center'}; margin: 8pt 0;`,
      }),
      ['img', { src: svgDataUri, width: String(width), height: String(height), alt: text || shapeType }],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ShapeNodeView);
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
                width: attributes.width || 180,
                height: attributes.height || 110,
                fill: attributes.fill || '#EAF2ED',
                stroke: attributes.stroke || '#245C45',
                strokeWidth: attributes.strokeWidth ?? 2,
                strokeStyle: attributes.strokeStyle || 'solid',
                rotation: attributes.rotation || 0,
                alignment: attributes.alignment || 'center',
                text: attributes.text || '',
                textColor: attributes.textColor || attributes.stroke || '#171C19',
                fontSize: attributes.fontSize || 12,
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


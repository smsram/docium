'use client';

import React from 'react';
import { ShapeType, generateShapeSvg } from '../extensions/ShapeNode';
import { Shapes } from 'lucide-react';

interface ShapesPickerProps {
  onSelectShape: (type: ShapeType) => void;
  onClose: () => void;
}

interface ShapeItem {
  type: ShapeType;
  label: string;
}

const SHAPE_CATEGORIES: { category: string; shapes: ShapeItem[] }[] = [
  {
    category: 'Basic Shapes',
    shapes: [
      { type: 'rectangle', label: 'Rectangle' },
      { type: 'rounded-rectangle', label: 'Rounded Rect' },
      { type: 'ellipse', label: 'Circle / Oval' },
      { type: 'triangle', label: 'Triangle' },
      { type: 'right-triangle', label: 'Right Triangle' },
      { type: 'diamond', label: 'Diamond' },
      { type: 'pentagon', label: 'Pentagon' },
      { type: 'hexagon', label: 'Hexagon' },
      { type: 'octagon', label: 'Octagon' },
      { type: 'cross', label: 'Cross / Plus' },
      { type: 'heart', label: 'Heart' },
      { type: 'cloud', label: 'Cloud' },
    ],
  },
  {
    category: 'Lines & Connectors',
    shapes: [
      { type: 'line', label: 'Straight Line' },
      { type: 'arrow', label: 'Right Arrow' },
      { type: 'left-arrow', label: 'Left Arrow' },
      { type: 'double-arrow', label: 'Double Arrow' },
      { type: 'connector', label: 'Elbow Line' },
    ],
  },
  {
    category: 'Block Arrows',
    shapes: [
      { type: 'block-arrow-right', label: 'Block Right' },
      { type: 'block-arrow-left', label: 'Block Left' },
      { type: 'block-arrow-up', label: 'Block Up' },
      { type: 'block-arrow-down', label: 'Block Down' },
    ],
  },
  {
    category: 'Flowchart',
    shapes: [
      { type: 'process', label: 'Process' },
      { type: 'decision', label: 'Decision' },
      { type: 'terminator', label: 'Terminator' },
      { type: 'document', label: 'Document' },
      { type: 'data', label: 'Data / I/O' },
      { type: 'database', label: 'Database' },
    ],
  },
  {
    category: 'Stars, Banners & Callouts',
    shapes: [
      { type: 'star', label: '5-Point Star' },
      { type: 'star-4', label: '4-Point Star' },
      { type: 'banner', label: 'Ribbon Banner' },
      { type: 'callout', label: 'Speech Callout' },
      { type: 'oval-callout', label: 'Oval Callout' },
    ],
  },
];

export function ShapesPicker({ onSelectShape, onClose }: ShapesPickerProps) {
  return (
    <div className="w-80 max-h-[420px] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl z-[110] text-xs select-none animate-in fade-in zoom-in-95 duration-100">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
          <Shapes className="h-4 w-4 text-[var(--primary)]" />
          <span>Insert Vector Shape</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
        >
          Close
        </button>
      </div>

      <p className="text-[10px] text-[var(--text-muted)] mb-2.5">
        Click a shape to insert. Click on the page to resize, wrap text, or double-click inside to add text.
      </p>

      <div className="space-y-3">
        {SHAPE_CATEGORIES.map((cat) => (
          <div key={cat.category}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">
              {cat.category}
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {cat.shapes.map((s) => {
                const previewSvg = generateShapeSvg(
                  {
                    shapeType: s.type,
                    width: 38,
                    height: 28,
                    fill: '#EAF2ED',
                    stroke: '#245C45',
                    strokeWidth: 1.5,
                    rotation: 0,
                    alignment: 'center',
                  },
                  false
                );

                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => {
                      onSelectShape(s.type);
                      onClose();
                    }}
                    title={s.label}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] hover:border-[var(--primary)] transition-all group cursor-pointer"
                  >
                    <div
                      className="w-10 h-7 flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: previewSvg }}
                    />
                    <span className="text-[9px] text-[var(--text-muted)] group-hover:text-[var(--text)] truncate max-w-full mt-1">
                      {s.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

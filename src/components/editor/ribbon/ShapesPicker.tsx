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
      { type: 'diamond', label: 'Diamond' },
      { type: 'star', label: '5-Point Star' },
      { type: 'callout', label: 'Speech Callout' },
    ],
  },
  {
    category: 'Lines & Arrows',
    shapes: [
      { type: 'line', label: 'Straight Line' },
      { type: 'arrow', label: 'Right Arrow' },
      { type: 'double-arrow', label: 'Double Arrow' },
      { type: 'connector', label: 'Elbow Connector' },
    ],
  },
  {
    category: 'Flowchart',
    shapes: [
      { type: 'process', label: 'Process' },
      { type: 'decision', label: 'Decision' },
      { type: 'document', label: 'Document' },
      { type: 'data', label: 'Data / I/O' },
    ],
  },
];

export function ShapesPicker({ onSelectShape, onClose }: ShapesPickerProps) {
  return (
    <div className="w-72 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl z-[110] text-xs select-none animate-in fade-in zoom-in-95 duration-100">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
          <Shapes className="h-4 w-4 text-[var(--primary)]" />
          <span>Insert Shape</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          Close
        </button>
      </div>

      <div className="space-y-3">
        {SHAPE_CATEGORIES.map((cat) => (
          <div key={cat.category}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] block mb-1.5">
              {cat.category}
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {cat.shapes.map((s) => {
                const previewSvg = generateShapeSvg({
                  shapeType: s.type,
                  width: 36,
                  height: 28,
                  fill: '#E7EAE4',
                  stroke: '#245C45',
                  strokeWidth: 1.5,
                  rotation: 0,
                  alignment: 'center',
                });

                return (
                  <button
                    key={s.type}
                    type="button"
                    onClick={() => {
                      onSelectShape(s.type);
                      onClose();
                    }}
                    title={s.label}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] hover:border-[var(--primary)] transition-all group"
                  >
                    <div
                      className="w-9 h-7 flex items-center justify-center"
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


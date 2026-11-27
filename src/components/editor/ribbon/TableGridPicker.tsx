'use client';

import React, { useState } from 'react';
import { Table as TableIcon } from 'lucide-react';
import { InputDialog } from '@/components/ui/InputDialog';

interface TableGridPickerProps {
  onSelectDimensions: (rows: number, cols: number) => void;
  onClose: () => void;
}

export function TableGridPicker({ onSelectDimensions, onClose }: TableGridPickerProps) {
  const [hoveredRow, setHoveredRow] = useState(0);
  const [hoveredCol, setHoveredCol] = useState(0);
  const [customOpen, setCustomOpen] = useState(false);

  const maxRows = 10;
  const maxCols = 10;

  return (
    <div className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 text-xs">
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border)]">
        <div className="flex items-center gap-1.5 text-[var(--text)] font-semibold text-[11px]">
          <TableIcon className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Insert Table</span>
        </div>
        <span className="font-mono text-[11px] text-[var(--primary)] font-bold">
          {hoveredCol > 0 && hoveredRow > 0 ? `${hoveredCol} × ${hoveredRow}` : 'Select Grid'}
        </span>
      </div>

      <div
        className="grid grid-cols-10 gap-1 select-none"
        onMouseLeave={() => {
          setHoveredRow(0);
          setHoveredCol(0);
        }}
      >
        {Array.from({ length: maxRows }).map((_, r) =>
          Array.from({ length: maxCols }).map((__, c) => {
            const rowIndex = r + 1;
            const colIndex = c + 1;
            const isHighlighted = rowIndex <= hoveredRow && colIndex <= hoveredCol;

            return (
              <div
                key={`${r}-${c}`}
                onMouseEnter={() => {
                  setHoveredRow(rowIndex);
                  setHoveredCol(colIndex);
                }}
                onClick={() => {
                  onSelectDimensions(rowIndex, colIndex);
                  onClose();
                }}
                className={`w-4 h-4 rounded-xs border cursor-pointer transition-colors ${
                  isHighlighted
                    ? 'border-[var(--primary)] bg-[var(--primary-light)]'
                    : 'border-[var(--border)] bg-[var(--surface-elevated)] hover:border-stone-400'
                }`}
              />
            );
          })
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-[var(--border)] flex justify-between items-center text-[10px] text-[var(--text-muted)]">
        <span>Click to insert table</span>
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="text-[var(--primary)] font-medium hover:underline cursor-pointer"
        >
          Custom size...
        </button>
      </div>

      <InputDialog
        isOpen={customOpen}
        title="Insert Custom Table"
        fields={[
          { id: 'rows', label: 'Number of Rows', type: 'number', defaultValue: '4' },
          { id: 'cols', label: 'Number of Columns', type: 'number', defaultValue: '4' },
        ]}
        confirmLabel="Insert Table"
        onConfirm={(vals) => {
          const rows = parseInt(vals.rows || '4', 10);
          const cols = parseInt(vals.cols || '4', 10);
          if (rows > 0 && cols > 0) {
            onSelectDimensions(Math.min(50, rows), Math.min(20, cols));
            setCustomOpen(false);
            onClose();
          }
        }}
        onCancel={() => setCustomOpen(false)}
      />
    </div>
  );
}


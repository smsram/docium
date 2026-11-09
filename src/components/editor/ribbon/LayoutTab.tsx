'use client';

import React from 'react';
import {
  DocumentPageSize,
  DocumentOrientation,
  MarginPreset,
  DocumentMargins,
} from '@/lib/types';
import {
  Columns as ColumnsIcon,
  Sliders,
} from 'lucide-react';
import { PAPER_SIZES_MM } from '../utils/pageMetrics';
import { Select, SelectOption } from '@/components/ui/Select';
import { CompactMarginPicker } from './CompactMarginPicker';

interface LayoutTabProps {
  pageSize: DocumentPageSize;
  orientation: DocumentOrientation;
  marginPreset: MarginPreset;
  margins: DocumentMargins;
  columns: 1 | 2 | 3;
  onChangePageSize: (size: DocumentPageSize) => void;
  onChangeOrientation: (orientation: DocumentOrientation) => void;
  onChangeMarginPreset: (preset: MarginPreset) => void;
  onChangeMargins: (margins: DocumentMargins) => void;
  onChangeColumns: (cols: 1 | 2 | 3) => void;
  onOpenPageSetupModal: () => void;
}

export function LayoutTab({
  pageSize,
  orientation,
  marginPreset,
  margins,
  columns,
  onChangePageSize,
  onChangeOrientation,
  onChangeMarginPreset,
  onChangeMargins,
  onChangeColumns,
  onOpenPageSetupModal,
}: LayoutTabProps) {
  const sizeOptions: SelectOption[] = Object.entries(PAPER_SIZES_MM).map(([key, val]) => ({
    value: key,
    label: key,
    sublabel: `${val.width} × ${val.height} mm`,
  }));

  const columnOptions: SelectOption[] = [
    { value: '1', label: '1 Column' },
    { value: '2', label: '2 Columns' },
    { value: '3', label: '3 Columns' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Compact Margins Selector with Visual Page Preview */}
      <div className="pr-2 border-r border-[var(--border)]">
        <CompactMarginPicker
          marginPreset={marginPreset}
          margins={margins}
          onChangeMarginPreset={onChangeMarginPreset}
          onChangeMargins={onChangeMargins}
          orientation={orientation}
          pageSize={pageSize}
        />
      </div>

      {/* 2. Orientation Toggle */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={() => onChangeOrientation('portrait')}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors cursor-pointer ${
            orientation === 'portrait'
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Portrait Orientation"
        >
          <div className="w-2.5 h-3.5 border border-current rounded-2xs" />
          <span>Portrait</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeOrientation('landscape')}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors cursor-pointer ${
            orientation === 'landscape'
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Landscape Orientation"
        >
          <div className="w-3.5 h-2.5 border border-current rounded-2xs" />
          <span>Landscape</span>
        </button>
      </div>

      {/* 3. Paper Size Select */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <span className="text-[11px] text-[var(--text-muted)] font-medium">Size:</span>
        <div className="w-32">
          <Select
            size="xs"
            value={pageSize}
            onChange={(val) => onChangePageSize(val as DocumentPageSize)}
            options={sizeOptions}
            menuWidth="w-48"
          />
        </div>
      </div>

      {/* 4. Multi-Columns Select */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <ColumnsIcon className="h-3.5 w-3.5 text-[var(--text-muted)]" />
        <div className="w-28">
          <Select
            size="xs"
            value={columns.toString()}
            onChange={(val) => onChangeColumns(parseInt(val, 10) as 1 | 2 | 3)}
            options={columnOptions}
            menuWidth="w-36"
          />
        </div>
      </div>

      {/* 5. Full Page Setup Modal Action */}
      <div className="pl-1">
        <button
          type="button"
          onClick={onOpenPageSetupModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title="Detailed Page Setup (Headers, Footers, Orientation, Margins)"
        >
          <Sliders className="h-3.5 w-3.5 text-[var(--secondary)]" />
          <span>Page Setup...</span>
        </button>
      </div>
    </div>
  );
}

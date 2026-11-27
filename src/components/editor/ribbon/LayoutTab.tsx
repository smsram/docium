'use client';

import React, { useState } from 'react';
import {
  DocumentPageSize,
  DocumentOrientation,
  MarginPreset,
  DocumentMargins,
} from '@/lib/types';
import {
  Columns as ColumnsIcon,
  Sliders,
  Stamp,
  Palette,
  Frame,
  ChevronDown,
} from 'lucide-react';
import { PAPER_SIZES_MM } from '../utils/pageMetrics';
import { Select, SelectOption } from '@/components/ui/Select';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { Popover } from '@/components/ui/Popover';
import { InputDialog } from '@/components/ui/InputDialog';
import { CompactMarginPicker } from './CompactMarginPicker';
import { ColorPickerPopover } from './ColorPickerPopover';

const PAGE_COLOR_PALETTE = [
  '#FFFFFF', '#FDFCF7', '#FAF5E8', '#F4F8F5',
  '#F4F8FD', '#F8FAFC', '#FEF9C3', '#FCE7F3',
  '#EDE9FE', '#E0F2FE', '#DCFCE7', '#F3F4F6',
  '#1F2937', '#111827', '#0F172A', '#1E293B',
];

const BORDER_COLOR_PRESETS = [
  '#1e293b', '#374151', '#0f172a', '#245c45', '#1e40af', '#7c3aed', '#991b1b', '#b45309',
];

interface LayoutTabProps {
  pageSize: DocumentPageSize;
  orientation: DocumentOrientation;
  marginPreset: MarginPreset;
  margins: DocumentMargins;
  columns: 1 | 2 | 3;
  watermarkText?: string;
  pageColor?: string;
  pageBorder?: 'none' | 'box' | 'shadow' | 'double' | 'accent';
  pageBorderColor?: string;
  pageBorderWidth?: number;
  pageBorderOffset?: 'edge' | 'margin' | 'wide';
  onChangePageSize: (size: DocumentPageSize) => void;
  onChangeOrientation: (orientation: DocumentOrientation) => void;
  onChangeMarginPreset: (preset: MarginPreset) => void;
  onChangeMargins: (margins: DocumentMargins) => void;
  onChangeColumns: (cols: 1 | 2 | 3) => void;
  onChangeWatermark?: (text: string) => void;
  onChangePageColor?: (color: string) => void;
  onChangePageBorder?: (border: 'none' | 'box' | 'shadow' | 'double' | 'accent') => void;
  onChangePageBorderColor?: (color: string) => void;
  onChangePageBorderWidth?: (width: number) => void;
  onChangePageBorderOffset?: (offset: 'edge' | 'margin' | 'wide') => void;
  onOpenPageSetupModal: () => void;
}

export function LayoutTab({
  pageSize,
  orientation,
  marginPreset,
  margins,
  columns,
  watermarkText = '',
  pageColor = '#FFFFFF',
  pageBorder = 'none',
  pageBorderColor = '#1e293b',
  pageBorderWidth = 1,
  pageBorderOffset = 'edge',
  onChangePageSize,
  onChangeOrientation,
  onChangeMarginPreset,
  onChangeMargins,
  onChangeColumns,
  onChangeWatermark,
  onChangePageColor,
  onChangePageBorder,
  onChangePageBorderColor,
  onChangePageBorderWidth,
  onChangePageBorderOffset,
  onOpenPageSetupModal,
}: LayoutTabProps) {
  const [showPageColor, setShowPageColor] = useState(false);
  const [showPageBorder, setShowPageBorder] = useState(false);
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);

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

  const watermarkItems: DropdownItem[] = [
    { id: 'wm-none', label: 'No Watermark', checked: !watermarkText, onClick: () => onChangeWatermark?.('') },
    { id: 'wm-conf', label: 'CONFIDENTIAL', checked: watermarkText === 'CONFIDENTIAL', onClick: () => onChangeWatermark?.('CONFIDENTIAL') },
    { id: 'wm-draft', label: 'DRAFT', checked: watermarkText === 'DRAFT', onClick: () => onChangeWatermark?.('DRAFT') },
    { id: 'wm-dnc', label: 'DO NOT COPY', checked: watermarkText === 'DO NOT COPY', onClick: () => onChangeWatermark?.('DO NOT COPY') },
    { id: 'wm-sample', label: 'SAMPLE', checked: watermarkText === 'SAMPLE', onClick: () => onChangeWatermark?.('SAMPLE') },
    {
      id: 'wm-custom',
      label: 'Custom Watermark...',
      separator: true,
      onClick: () => setShowWatermarkDialog(true),
    },
  ];

  const borderStyles: Array<{ id: 'none' | 'box' | 'shadow' | 'double' | 'accent'; label: string }> = [
    { id: 'none', label: 'None' },
    { id: 'box', label: 'Classic Box' },
    { id: 'shadow', label: 'Shadow Frame' },
    { id: 'double', label: 'Formal Double' },
    { id: 'accent', label: 'Accent Frame' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Compact Margins Selector */}
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
        <div className="w-28">
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

      {/* 5. Page Background & Design (Watermark, Custom Page Color, Adjustable Word-style Page Borders) */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <Dropdown
          trigger={
            <div className="flex h-7 items-center gap-1 rounded px-2 hover:bg-[var(--accent)] cursor-pointer">
              <Stamp className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span>Watermark</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
          items={watermarkItems}
          menuWidth="w-48"
        />

        <Popover
          isOpen={showPageColor}
          onClose={() => setShowPageColor(false)}
          trigger={
            <button
              type="button"
              onClick={() => {
                setShowPageColor(!showPageColor);
                setShowPageBorder(false);
              }}
              className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
              title="Page Background Color (Presets, Custom Color & Eyedropper)"
            >
              <Palette className="h-3.5 w-3.5 text-[var(--secondary)]" />
              <span>Page Color</span>
              <span
                className="w-3 h-3 rounded-xs border border-[var(--border)]"
                style={{ backgroundColor: pageColor || '#FFFFFF' }}
              />
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          }
        >
          <ColorPickerPopover
            title="Page Background Color"
            customPalette={PAGE_COLOR_PALETTE}
            currentColor={pageColor}
            onSelectColor={(color) => {
              onChangePageColor?.(color);
              setShowPageColor(false);
            }}
            onClear={() => {
              onChangePageColor?.('#FFFFFF');
              setShowPageColor(false);
            }}
          />
        </Popover>

        <Popover
          isOpen={showPageBorder}
          onClose={() => setShowPageBorder(false)}
          trigger={
            <button
              type="button"
              onClick={() => {
                setShowPageBorder(!showPageBorder);
                setShowPageColor(false);
              }}
              className="flex h-7 items-center gap-1 rounded px-2 hover:bg-[var(--accent)] cursor-pointer"
              title="Page Borders (Style, Thickness, Distance, Color)"
            >
              <Frame className="h-3.5 w-3.5 opacity-75" />
              <span>Page Borders</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          }
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 text-xs w-64 space-y-3"
          >
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
              <span className="font-semibold text-[11px]">Page Borders</span>
              <button
                type="button"
                onClick={() => {
                  onChangePageBorder?.('none');
                  setShowPageBorder(false);
                }}
                className="text-[10px] text-[var(--text-muted)] hover:text-rose-600 cursor-pointer"
              >
                Clear
              </button>
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-medium text-[var(--text-muted)]">Border Style</span>
              <div className="grid grid-cols-2 gap-1">
                {borderStyles.map((bs) => (
                  <button
                    key={bs.id}
                    type="button"
                    onClick={() => onChangePageBorder?.(bs.id)}
                    className={`px-2 py-1 rounded text-left text-[11px] border cursor-pointer transition-colors ${
                      pageBorder === bs.id
                        ? 'bg-[var(--primary)] text-white border-[var(--primary)] font-medium'
                        : 'bg-[var(--surface-elevated)] border-[var(--border)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    {bs.label}
                  </button>
                ))}
              </div>
            </div>

            {pageBorder !== 'none' && (
              <>
                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-[var(--text-muted)]">Distance / Placement</span>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: 'edge' as const, label: 'Page Edge' },
                      { id: 'margin' as const, label: 'Margins' },
                      { id: 'wide' as const, label: 'Outer Edge' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangePageBorderOffset?.(opt.id)}
                        className={`px-1.5 py-1 rounded text-[10px] border cursor-pointer ${
                          pageBorderOffset === opt.id
                            ? 'bg-[var(--accent)] border-[var(--primary)] text-[var(--primary)] font-semibold'
                            : 'bg-[var(--surface-elevated)] border-[var(--border)] hover:bg-[var(--accent)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-[var(--text-muted)]">Thickness ({pageBorderWidth}px)</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => onChangePageBorderWidth?.(w)}
                        className={`flex-1 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                          pageBorderWidth === w
                            ? 'bg-[var(--accent)] border-[var(--primary)] text-[var(--primary)] font-bold'
                            : 'bg-[var(--surface-elevated)] border-[var(--border)] hover:bg-[var(--accent)]'
                        }`}
                      >
                        {w}px
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-medium text-[var(--text-muted)]">Border Color</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {BORDER_COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => onChangePageBorderColor?.(c)}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded border cursor-pointer ${
                          pageBorderColor?.toLowerCase() === c.toLowerCase()
                            ? 'ring-2 ring-[var(--primary)] border-white'
                            : 'border-black/20'
                        }`}
                        title={c}
                      />
                    ))}
                    <label
                      className="inline-flex items-center justify-center w-5 h-5 rounded border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] cursor-pointer"
                      title="Custom Border Color"
                    >
                      <Palette className="w-3 h-3 text-[var(--text)]" />
                      <input
                        type="color"
                        value={pageBorderColor || '#1e293b'}
                        onChange={(e) => onChangePageBorderColor?.(e.target.value)}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
        </Popover>
      </div>

      {/* 6. Full Page Setup Modal Action */}
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

      <InputDialog
        isOpen={showWatermarkDialog}
        title="Custom Page Watermark"
        description="Enter diagonal watermark text shown behind each page (leave empty to clear)."
        fields={[
          {
            id: 'watermark',
            label: 'Watermark Text',
            defaultValue: watermarkText || 'INTERNAL USE ONLY',
            placeholder: 'e.g. CONFIDENTIAL',
          },
        ]}
        confirmLabel="Apply Watermark"
        onConfirm={(vals) => {
          onChangeWatermark?.((vals.watermark || '').trim());
          setShowWatermarkDialog(false);
        }}
        onCancel={() => setShowWatermarkDialog(false)}
      />
    </div>
  );
}

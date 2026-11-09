'use client';

import React, { useState } from 'react';
import {
  DocumentPageSize,
  DocumentOrientation,
  DocumentMargins,
  MarginPreset,
} from '@/lib/types';
import { PAPER_SIZES_MM, MARGIN_PRESETS } from '../utils/pageMetrics';
import { X, Sliders, Check } from 'lucide-react';
import { Select } from '@/components/ui/Select';

interface PageSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  pageSize: DocumentPageSize;
  orientation: DocumentOrientation;
  margins: DocumentMargins;
  marginPreset: MarginPreset;
  columns?: 1 | 2 | 3;
  headerText?: string;
  footerText?: string;
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  showPageNumbers?: boolean;
  differentFirstPage?: boolean;
  onSave: (settings: {
    pageSize: DocumentPageSize;
    orientation: DocumentOrientation;
    margins: DocumentMargins;
    marginPreset: MarginPreset;
    columns: 1 | 2 | 3;
    headerText?: string;
    footerText?: string;
    firstPageHeaderText?: string;
    firstPageFooterText?: string;
    showPageNumbers?: boolean;
    differentFirstPage?: boolean;
    customDimensions?: { widthMm: number; heightMm: number };
  }) => void;
}

export function PageSetupModal({
  isOpen,
  onClose,
  pageSize: initialPageSize,
  orientation: initialOrientation,
  margins: initialMargins,
  marginPreset: initialPreset,
  columns: initialColumns = 1,
  headerText: initialHeaderText = '',
  footerText: initialFooterText = '',
  firstPageHeaderText: initialFirstPageHeaderText = '',
  firstPageFooterText: initialFirstPageFooterText = '',
  showPageNumbers: initialShowPageNumbers = true,
  differentFirstPage: initialDifferentFirstPage = false,
  onSave,
}: PageSetupModalProps) {
  const [pageSize, setPageSize] = useState<DocumentPageSize>(initialPageSize || 'A4');
  const [orientation, setOrientation] = useState<DocumentOrientation>(initialOrientation || 'portrait');
  const [marginPreset, setMarginPreset] = useState<MarginPreset>(initialPreset || 'normal');
  const [margins, setMargins] = useState<DocumentMargins>({
    top: initialMargins?.top || 25.4,
    bottom: initialMargins?.bottom || 25.4,
    left: initialMargins?.left || 25.4,
    right: initialMargins?.right || 25.4,
  });
  const [columns, setColumns] = useState<1 | 2 | 3>(initialColumns);
  const [headerText, setHeaderText] = useState(initialHeaderText);
  const [footerText, setFooterText] = useState(initialFooterText);
  const [firstPageHeaderText, setFirstPageHeaderText] = useState(initialFirstPageHeaderText);
  const [firstPageFooterText, setFirstPageFooterText] = useState(initialFirstPageFooterText);
  const [showPageNumbers, setShowPageNumbers] = useState(initialShowPageNumbers);
  const [differentFirstPage, setDifferentFirstPage] = useState(initialDifferentFirstPage);
  const [customWidthMm, setCustomWidthMm] = useState(210);
  const [customHeightMm, setCustomHeightMm] = useState(297);

  if (!isOpen) return null;

  const handlePresetChange = (preset: MarginPreset) => {
    setMarginPreset(preset);
    if (preset !== 'custom' && MARGIN_PRESETS[preset]) {
      const def = MARGIN_PRESETS[preset];
      setMargins({
        top: def.top,
        bottom: def.bottom,
        left: def.left,
        right: def.right,
      });
    }
  };

  const handleCustomMarginChange = (field: keyof DocumentMargins, val: number) => {
    setMarginPreset('custom');
    setMargins((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  const handleSave = () => {
    onSave({
      pageSize,
      orientation,
      margins,
      marginPreset,
      columns,
      headerText,
      footerText,
      firstPageHeaderText,
      firstPageFooterText,
      showPageNumbers,
      differentFirstPage,
      customDimensions: pageSize === 'custom' ? { widthMm: customWidthMm, heightMm: customHeightMm } : undefined,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-5 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">Page Setup</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto text-xs text-[var(--text)]">
          {/* Orientation */}
          <div>
            <label className="font-semibold block mb-2 text-[var(--text)]">Orientation</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`flex items-center justify-center gap-2.5 rounded-lg border p-3 font-medium transition-all ${
                  orientation === 'portrait'
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] shadow-2xs font-semibold'
                    : 'border-[var(--border)] hover:bg-[var(--accent)] text-[var(--text-muted)]'
                }`}
              >
                <div className="w-4 h-6 border-2 border-current rounded-xs" />
                <span>Portrait</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`flex items-center justify-center gap-2.5 rounded-lg border p-3 font-medium transition-all ${
                  orientation === 'landscape'
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] shadow-2xs font-semibold'
                    : 'border-[var(--border)] hover:bg-[var(--accent)] text-[var(--text-muted)]'
                }`}
              >
                <div className="w-6 h-4 border-2 border-current rounded-xs" />
                <span>Landscape</span>
              </button>
            </div>
          </div>

          {/* Paper Size */}
          <div>
            <label className="font-semibold block mb-2 text-[var(--text)]">Paper Size</label>
            <Select
              value={pageSize}
              onChange={(val) => setPageSize(val as DocumentPageSize)}
              options={[
                ...Object.entries(PAPER_SIZES_MM).map(([key, val]) => ({
                  value: key,
                  label: val.name,
                })),
                { value: 'custom', label: 'Custom Size...' },
              ]}
              placeholder="Select Paper Size"
            />

            {pageSize === 'custom' && (
              <div className="grid grid-cols-2 gap-3 mt-2.5">
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-1">Width (mm)</label>
                  <input
                    type="number"
                    value={customWidthMm}
                    onChange={(e) => setCustomWidthMm(Number(e.target.value))}
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-[var(--text-muted)] block mb-1">Height (mm)</label>
                  <input
                    type="number"
                    value={customHeightMm}
                    onChange={(e) => setCustomHeightMm(Number(e.target.value))}
                    className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Margins */}
          <div>
            <label className="font-semibold block mb-2 text-[var(--text)]">Margins</label>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {(['normal', 'narrow', 'moderate', 'wide'] as MarginPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetChange(p)}
                  className={`rounded-md border py-1.5 px-2 text-[11px] font-medium capitalize transition-all ${
                    marginPreset === p
                      ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                      : 'border-[var(--border)] hover:bg-[var(--accent)] text-[var(--text-muted)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">Top (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={margins.top}
                  onChange={(e) => handleCustomMarginChange('top', Number(e.target.value))}
                  className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">Bottom (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={margins.bottom}
                  onChange={(e) => handleCustomMarginChange('bottom', Number(e.target.value))}
                  className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">Left (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={margins.left}
                  onChange={(e) => handleCustomMarginChange('left', Number(e.target.value))}
                  className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 font-mono text-[11px]"
                />
              </div>
              <div>
                <label className="text-[10px] text-[var(--text-muted)] block mb-1">Right (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={margins.right}
                  onChange={(e) => handleCustomMarginChange('right', Number(e.target.value))}
                  className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 font-mono text-[11px]"
                />
              </div>
            </div>
          </div>

          {/* Columns */}
          <div>
            <label className="font-semibold block mb-2 text-[var(--text)]">Columns</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setColumns(col as 1 | 2 | 3)}
                  className={`rounded-lg border py-2 px-3 font-medium transition-all ${
                    columns === col
                      ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                      : 'border-[var(--border)] hover:bg-[var(--accent)] text-[var(--text-muted)]'
                  }`}
                >
                  {col === 1 ? '1 Column' : `${col} Columns`}
                </button>
              ))}
            </div>
          </div>

          {/* Header & Footer Text */}
          <div className="space-y-3 pt-2 border-t border-[var(--border)]">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--text)] cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showPageNumbers}
                  onChange={(e) => setShowPageNumbers(e.target.checked)}
                  className="rounded accent-[var(--primary)]"
                />
                Show page numbers (Page X of Y)
              </label>
              <label className="text-xs text-[var(--text)] cursor-pointer flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={differentFirstPage}
                  onChange={(e) => setDifferentFirstPage(e.target.checked)}
                  className="rounded accent-[var(--primary)]"
                />
                Different first page
              </label>
            </div>

            {differentFirstPage ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="font-semibold block mb-1 text-[var(--text)] text-xs">First Page Header</label>
                  <input
                    type="text"
                    value={firstPageHeaderText}
                    onChange={(e) => setFirstPageHeaderText(e.target.value)}
                    placeholder="First page header (or leave blank)"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-[var(--text)] text-xs">Pages 2+ Header</label>
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="e.g. Confidential — Company Internal"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-[var(--text)] text-xs">First Page Footer</label>
                  <input
                    type="text"
                    value={firstPageFooterText}
                    onChange={(e) => setFirstPageFooterText(e.target.value)}
                    placeholder="First page footer (or leave blank)"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-[var(--text)] text-xs">Pages 2+ Footer</label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="e.g. Docium Workspace Document"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="font-semibold block mb-1 text-[var(--text)]">Header Text</label>
                  <input
                    type="text"
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder="e.g. Confidential — Company Internal"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="font-semibold block mb-1 text-[var(--text)]">Footer Text</label>
                  <input
                    type="text"
                    value={footerText}
                    onChange={(e) => setFooterText(e.target.value)}
                    placeholder="e.g. Docium Workspace Document"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border)] px-5 py-3 bg-[var(--surface-elevated)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--accent)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] shadow-xs transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
}


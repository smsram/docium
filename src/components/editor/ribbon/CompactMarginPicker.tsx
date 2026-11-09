'use client';

import React, { useState } from 'react';
import { Sliders, ChevronDown, X } from 'lucide-react';
import {
  MarginPreset,
  DocumentMargins,
  DocumentOrientation,
  DocumentPageSize,
} from '@/lib/types';
import { getResolvedMargins } from '../utils/pageMetrics';
import { Popover } from '@/components/ui/Popover';

interface CompactMarginPickerProps {
  marginPreset: MarginPreset;
  margins: DocumentMargins;
  onChangeMarginPreset: (preset: MarginPreset) => void;
  onChangeMargins: (margins: DocumentMargins) => void;
  orientation?: DocumentOrientation;
  pageSize?: DocumentPageSize;
}

export function CompactMarginPicker({
  marginPreset,
  margins,
  onChangeMarginPreset,
  onChangeMargins,
  orientation = 'portrait',
  pageSize = 'A4',
}: CompactMarginPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Convert mm to inches for readable display
  const mmToInch = (mm: number) => (mm / 25.4).toFixed(2);
  const inchToMm = (inch: number) => Math.round(inch * 25.4 * 10) / 10;

  const handleSelectPreset = (p: MarginPreset) => {
    onChangeMarginPreset(p);
    const resolved = getResolvedMargins(p);
    onChangeMargins(resolved);
  };

  const handleMarginChange = (side: keyof DocumentMargins, inchValue: number) => {
    const mmValue = inchToMm(Math.max(0.1, inchValue));
    const newMargins = { ...margins, [side]: mmValue };
    onChangeMarginPreset('custom');
    onChangeMargins(newMargins);
  };

  // Proportional offsets for the SVG preview (normalized to max ~100px)
  const isLandscape = orientation === 'landscape';
  const previewWidth = isLandscape ? 110 : 80;
  const previewHeight = isLandscape ? 80 : 110;

  // Max margin representation cap for preview
  const topPct = Math.min(35, Math.max(8, (margins.top / 25.4) * 15));
  const bottomPct = Math.min(35, Math.max(8, (margins.bottom / 25.4) * 15));
  const leftPct = Math.min(35, Math.max(8, (margins.left / 25.4) * 15));
  const rightPct = Math.min(35, Math.max(8, (margins.right / 25.4) * 15));

  const PRESET_OPTIONS: { id: MarginPreset; label: string; sub: string }[] = [
    { id: 'normal', label: 'Normal', sub: '1 in (25.4 mm)' },
    { id: 'narrow', label: 'Narrow', sub: '0.5 in (12.7 mm)' },
    { id: 'moderate', label: 'Moderate', sub: '0.75 in sides' },
    { id: 'wide', label: 'Wide', sub: '2 in sides' },
    { id: 'custom', label: 'Custom', sub: 'Manual inputs' },
  ];

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      align="left"
      offset={6}
      trigger={
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors cursor-pointer text-xs ${
            isOpen
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Configure Page Margins"
        >
          <Sliders className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span className="capitalize">{marginPreset} Margins</span>
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      }
    >
      <div className="w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl text-xs select-none animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border)]">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <Sliders className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Page Margins</span>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text)] p-0.5 rounded cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Presets Tabs */}
        <div className="grid grid-cols-5 gap-1 bg-[var(--surface-elevated)] p-1 rounded-lg border border-[var(--border)]">
          {PRESET_OPTIONS.map((opt) => {
            const isSelected = marginPreset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectPreset(opt.id)}
                className={`px-1 py-1 rounded text-[11px] font-medium transition-colors text-center truncate cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--primary)] text-white shadow-2xs font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
                }`}
                title={`${opt.label}: ${opt.sub}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Visual Page Preview & Numeric Inputs */}
        <div className="flex items-center gap-3 bg-[var(--background)] p-3 rounded-lg border border-[var(--border-subtle)]">
          {/* Visual Rectangular Page Preview */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <div
              style={{
                width: `${previewWidth}px`,
                height: `${previewHeight}px`,
              }}
              className="bg-white dark:bg-zinc-900 border-2 border-[var(--border)] rounded shadow-sm relative overflow-hidden flex items-center justify-center transition-all"
            >
              {/* Inner Printable Area */}
              <div
                style={{
                  top: `${topPct}%`,
                  bottom: `${bottomPct}%`,
                  left: `${leftPct}%`,
                  right: `${rightPct}%`,
                }}
                className="absolute border border-dashed border-[var(--primary)] bg-[var(--primary-light)]/20 rounded-2xs flex items-center justify-center"
              >
                <span className="text-[8px] font-mono font-medium text-[var(--primary)] opacity-70 scale-90">
                  {orientation === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT'}
                </span>
              </div>
            </div>
            <span className="text-[9px] font-mono text-[var(--text-muted)] mt-1.5 uppercase tracking-wider">
              {pageSize} Preview
            </span>
          </div>

          {/* 4 Margin Inputs (Inches) */}
          <div className="flex-1 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <label className="text-[10px] text-[var(--text-muted)] font-medium block mb-0.5">
                Top (in)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="3.0"
                value={mmToInch(margins.top)}
                onChange={(e) => handleMarginChange('top', parseFloat(e.target.value) || 0.5)}
                className="w-full h-7 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] font-medium block mb-0.5">
                Bottom (in)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="3.0"
                value={mmToInch(margins.bottom)}
                onChange={(e) => handleMarginChange('bottom', parseFloat(e.target.value) || 0.5)}
                className="w-full h-7 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] font-medium block mb-0.5">
                Left (in)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="3.0"
                value={mmToInch(margins.left)}
                onChange={(e) => handleMarginChange('left', parseFloat(e.target.value) || 0.5)}
                className="w-full h-7 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--text-muted)] font-medium block mb-0.5">
                Right (in)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="3.0"
                value={mmToInch(margins.right)}
                onChange={(e) => handleMarginChange('right', parseFloat(e.target.value) || 0.5)}
                className="w-full h-7 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
          <span>1 inch = 25.4 mm</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-[var(--primary)] font-semibold hover:underline cursor-pointer"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </Popover>
  );
}


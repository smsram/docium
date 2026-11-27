'use client';

import React, { useState } from 'react';
import { Check, Pipette, Palette } from 'lucide-react';

interface ColorPickerPopoverProps {
  currentColor?: string;
  onSelectColor: (color: string) => void;
  onClear: () => void;
  isHighlight?: boolean;
  title?: string;
  customPalette?: string[];
}

const TEXT_COLORS = [
  '#000000', '#171C19', '#4B5563', '#6B7280', '#9CA3AF',
  '#245C45', '#166534', '#059669', '#10B981', '#34D399',
  '#1E40AF', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD',
  '#6B21A8', '#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD',
  '#991B1B', '#DC2626', '#EF4444', '#F87171', '#FCA5A5',
  '#92400E', '#D97706', '#F59E0B', '#FBBF24', '#FCD34D',
];

const HIGHLIGHT_COLORS = [
  '#FEF08A', '#FDE047', '#BBF7D0', '#86EFAC',
  '#BAE6FD', '#7DD3FC', '#DDD6FE', '#C4B5FD',
  '#FECDD3', '#FDA4AF', '#FED7AA', '#FDBA74',
];

export function ColorPickerPopover({
  currentColor,
  onSelectColor,
  onClear,
  isHighlight = false,
  title,
  customPalette,
}: ColorPickerPopoverProps) {
  const [customHex, setCustomHex] = useState(currentColor || '#245C45');
  const [eyedropperSupported] = useState(
    () => typeof window !== 'undefined' && 'EyeDropper' in window
  );
  const palette = customPalette || (isHighlight ? HIGHLIGHT_COLORS : TEXT_COLORS);
  const headingLabel = title || (isHighlight ? 'Highlight Color' : 'Text Color');

  const handlePickFromPage = async () => {
    try {
      const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      if (!EyeDropperCtor) return;
      const eyeDropper = new EyeDropperCtor();
      const result = await eyeDropper.open();
      if (result?.sRGBHex) {
        setCustomHex(result.sRGBHex);
        onSelectColor(result.sRGBHex);
      }
    } catch {
      // User cancelled eyedropper
    }
  };

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="p-3 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 text-xs w-60"
    >
      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-[var(--border)]">
        <span className="font-semibold text-[11px] text-[var(--text)]">
          {headingLabel}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-[10px] text-[var(--text-muted)] hover:text-rose-600 font-medium cursor-pointer"
        >
          Reset / None
        </button>
      </div>

      <div className={`grid ${isHighlight ? 'grid-cols-4' : 'grid-cols-5'} gap-1.5 mb-3`}>
        {palette.map((color) => {
          const isSelected = currentColor?.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              onClick={() => onSelectColor(color)}
              style={{ backgroundColor: color }}
              className="w-7 h-7 rounded-md border border-black/15 flex items-center justify-center transition-transform hover:scale-110 shadow-2xs relative cursor-pointer"
              title={color}
            >
              {isSelected && (
                <Check
                  className={`h-3.5 w-3.5 ${
                    color === '#000000' || color === '#171C19' || color === '#245C45' || color === '#1E40AF'
                      ? 'text-white'
                      : 'text-black'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Custom Color Wheel + Pick from Page Eyedropper */}
      <div className="pt-2 border-t border-[var(--border)] space-y-2">
        <div className="flex items-center gap-1.5">
          <label
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer transition-colors"
            title="Choose custom color"
          >
            <Palette className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Custom...</span>
            <input
              type="color"
              value={/^#([0-9A-F]{6})$/i.test(customHex) ? customHex : '#245C45'}
              onChange={(e) => {
                setCustomHex(e.target.value);
                onSelectColor(e.target.value);
              }}
              className="sr-only"
            />
          </label>

          {eyedropperSupported && (
            <button
              type="button"
              onClick={handlePickFromPage}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[11px] font-medium text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer transition-colors"
              title="Pick color from page (Eyedropper)"
            >
              <Pipette className="h-3.5 w-3.5 text-[var(--secondary)]" />
              <span>Pick</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 rounded-md border border-[var(--border)] px-2 py-1 bg-[var(--surface-elevated)]">
            <span
              className="w-3 h-3 rounded-xs border border-black/20 shrink-0"
              style={{ backgroundColor: /^#([0-9A-F]{3}){1,2}$/i.test(customHex) ? customHex : '#245C45' }}
            />
            <input
              type="text"
              value={customHex}
              onChange={(e) => setCustomHex(e.target.value)}
              placeholder="#HEX"
              className="w-full bg-transparent font-mono text-[10px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (/^#([0-9A-F]{3}){1,2}$/i.test(customHex)) {
                onSelectColor(customHex);
              }
            }}
            className="rounded-md bg-[var(--primary)] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs cursor-pointer"
          >
            Set
          </button>
        </div>
      </div>
    </div>
  );
}

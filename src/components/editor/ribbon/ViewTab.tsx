'use client';

import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  AlignLeft,
  Pilcrow,
  Scroll,
  Layers,
  Ruler,
} from 'lucide-react';
import { Select, SelectOption } from '@/components/ui/Select';

interface ViewTabProps {
  zoomLevel: number;
  onSetZoom: (zoom: number) => void;
  isPaginatedView: boolean;
  onTogglePaginatedView: () => void;
  showRuler: boolean;
  onToggleRuler: () => void;
  showOutline: boolean;
  onToggleOutline: () => void;
  showFormattingMarks: boolean;
  onToggleFormattingMarks: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
}

const ZOOM_OPTIONS: SelectOption[] = [
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '90', label: '90%' },
  { value: '100', label: '100%', badge: 'Default' },
  { value: '125', label: '125%' },
  { value: '150', label: '150%' },
  { value: '175', label: '175%' },
  { value: '200', label: '200%' },
];

export function ViewTab({
  zoomLevel,
  onSetZoom,
  isPaginatedView,
  onTogglePaginatedView,
  showRuler,
  onToggleRuler,
  showOutline,
  onToggleOutline,
  showFormattingMarks,
  onToggleFormattingMarks,
  isFocusMode,
  onToggleFocusMode,
}: ViewTabProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Zoom Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={() => onSetZoom(Math.max(50, zoomLevel - 10))}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text)]"
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>

        <div className="w-24">
          <Select
            size="xs"
            value={zoomLevel.toString()}
            onChange={(val) => onSetZoom(parseInt(val, 10))}
            options={ZOOM_OPTIONS}
            placeholder={`${zoomLevel}%`}
            menuWidth="w-32"
          />
        </div>

        <button
          type="button"
          onClick={() => onSetZoom(Math.min(250, zoomLevel + 10))}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text)]"
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 2. Document Views */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={() => {
            if (!isPaginatedView) onTogglePaginatedView();
          }}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            isPaginatedView
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Paginated View (Physical Paper Sheets)"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Paginated View</span>
        </button>

        <button
          type="button"
          onClick={() => {
            if (isPaginatedView) onTogglePaginatedView();
          }}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            !isPaginatedView
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Continuous Web View"
        >
          <Scroll className="h-3.5 w-3.5" />
          <span>Continuous View</span>
        </button>
      </div>

      {/* 3. Show / Hide Elements */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={onToggleRuler}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            showRuler
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'hover:bg-[var(--accent)] text-[var(--text-muted)]'
          }`}
          title="Toggle Horizontal Ruler"
        >
          <Ruler className="h-3.5 w-3.5" />
          <span>Ruler</span>
        </button>

        <button
          type="button"
          onClick={onToggleOutline}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            showOutline
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'hover:bg-[var(--accent)] text-[var(--text-muted)]'
          }`}
          title="Toggle Navigation Outline"
        >
          <AlignLeft className="h-3.5 w-3.5" />
          <span>Outline</span>
        </button>

        <button
          type="button"
          onClick={onToggleFormattingMarks}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            showFormattingMarks
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'hover:bg-[var(--accent)] text-[var(--text-muted)]'
          }`}
          title="Show / Hide non-printing characters (¶)"
        >
          <Pilcrow className="h-3.5 w-3.5" />
          <span>Formatting Marks</span>
        </button>
      </div>

      {/* 4. Focus Mode */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleFocusMode}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            isFocusMode
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Focus Mode (Distraction-free editing)"
        >
          {isFocusMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          <span>{isFocusMode ? 'Exit Focus' : 'Focus Mode'}</span>
        </button>
      </div>
    </div>
  );
}

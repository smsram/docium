'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { UploadCloud, Link2, X, Plus } from 'lucide-react';

interface AttachMenuProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onTriggerFilePicker: () => void;
  onAddUrlSource: (url: string) => Promise<void> | void;
}

interface PopoverCoords {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

const MENU_WIDTH = 256; // w-64 (16rem)
const VIEWPORT_PADDING = 8;
const GAP = 6;

const emptySubscribe = () => () => {};

export function AttachMenu({
  isOpen,
  onClose,
  anchorRef,
  onTriggerFilePicker,
  onAddUrlSource,
}: AttachMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setShowUrlInput(false);
    setUrlValue('');
    setUrlError(null);
    onClose();
  }, [onClose]);

  // Viewport-aware positioning
  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    const roomAbove = rect.top;
    const roomBelow = window.innerHeight - rect.bottom;

    const placeAbove = roomBelow < 180 && roomAbove > roomBelow;

    let left = rect.left;
    if (left + MENU_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, window.innerWidth - MENU_WIDTH - VIEWPORT_PADDING);
    }
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    if (placeAbove) {
      const maxHeight = Math.max(120, Math.min(280, roomAbove - VIEWPORT_PADDING - GAP));
      const bottom = window.innerHeight - rect.top + GAP;
      setCoords({
        bottom,
        left,
        maxHeight,
        placement: 'top',
      });
    } else {
      const maxHeight = Math.max(120, Math.min(280, roomBelow - VIEWPORT_PADDING - GAP));
      const top = rect.bottom + GAP;
      setCoords({
        top,
        left,
        maxHeight,
        placement: 'bottom',
      });
    }
  }, [anchorRef]);

  // Position recalculation on open before paint
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Handle position tracking, outside click, and Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (
        menu &&
        !menu.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        handleClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleClose, anchorRef, updatePosition]);

  if (!isOpen || !mounted || !coords) return null;

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlValue.trim();
    if (!trimmed) return;

    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      setUrlError('URL must start with http:// or https://');
      return;
    }

    setUrlError(null);
    await onAddUrlSource(trimmed);
    handleClose();
  };

  const content = (
    <div
      ref={menuRef}
      role="dialog"
      aria-label="Attach Sources"
      style={{
        position: 'fixed',
        left: coords?.left ?? VIEWPORT_PADDING,
        top: coords?.top !== undefined ? coords.top : undefined,
        bottom: coords?.bottom !== undefined ? coords.bottom : undefined,
        maxHeight: coords?.maxHeight ?? 280,
        width: MENU_WIDTH,
      }}
      className="z-[9999] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl select-none text-xs animate-in fade-in duration-100"
    >
      {!showUrlInput ? (
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onTriggerFilePicker();
              handleClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[var(--text)] hover:bg-[var(--accent)] font-medium transition-colors cursor-pointer"
          >
            <UploadCloud className="h-4 w-4 text-[var(--primary)]" />
            <div className="text-left">
              <span className="block font-medium">Upload files</span>
              <span className="block text-[10px] text-[var(--text-muted)]">PDF, DOCX, CSV, TXT, Images</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setShowUrlInput(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[var(--text)] hover:bg-[var(--accent)] font-medium transition-colors cursor-pointer"
          >
            <Link2 className="h-4 w-4 text-[var(--primary)]" />
            <div className="text-left">
              <span className="block font-medium">Add link</span>
              <span className="block text-[10px] text-[var(--text-muted)]">Attach public web page or doc</span>
            </div>
          </button>
        </div>
      ) : (
        <form onSubmit={handleUrlSubmit} className="p-2 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-[var(--border-subtle)]">
            <span className="font-semibold text-[11px] text-[var(--text)]">Add Web Link</span>
            <button
              type="button"
              onClick={() => setShowUrlInput(false)}
              className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <input
            type="url"
            required
            autoFocus
            value={urlValue}
            onChange={(e) => {
              setUrlValue(e.target.value);
              setUrlError(null);
            }}
            placeholder="https://example.com/article"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />

          {urlError && <p className="text-[10px] text-rose-500">{urlError}</p>}

          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setShowUrlInput(false)}
              className="rounded-lg px-2 py-1 text-[11px] text-[var(--text-muted)] hover:bg-[var(--accent)] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg bg-[var(--primary)] text-white px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--primary-hover)] cursor-pointer"
            >
              <Plus className="h-3 w-3" />
              <span>Attach</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

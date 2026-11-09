'use client';

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Image as ImageIcon, BarChart3, Info } from 'lucide-react';
import { Toggle } from '@/components/ui/Toggle';

interface ToolsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  enabledTools: {
    internetSearch: boolean;
    imageGeneration: boolean;
    chartsAndData: boolean;
  };
  onToggleTool: (toolKey: 'internetSearch' | 'imageGeneration' | 'chartsAndData', value: boolean) => void;
}

interface ToolItemConfig {
  key: 'internetSearch' | 'imageGeneration' | 'chartsAndData';
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface PopoverCoords {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

const TOOLS_CONFIG: ToolItemConfig[] = [
  {
    key: 'internetSearch',
    name: 'Web Search',
    icon: Globe,
    description: 'Enables live internet browsing to retrieve up-to-date information, documentation, and citations.',
  },
  {
    key: 'imageGeneration',
    name: 'Image Generation',
    icon: ImageIcon,
    description: 'Enables autonomous creation of visuals, mock-ups, diagrams, and illustrations.',
  },
  {
    key: 'chartsAndData',
    name: 'Charts & Visualization',
    icon: BarChart3,
    description: 'Enables the AI to generate structured interactive bar, line, pie, and comparison charts.',
  },
];

const POPOVER_WIDTH = 288; // w-72 (18rem)
const VIEWPORT_PADDING = 8;
const GAP = 6;

const emptySubscribe = () => () => {};

export function ToolsPopover({
  isOpen,
  onClose,
  anchorRef,
  enabledTools,
  onToggleTool,
}: ToolsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);

  // Viewport-aware positioning to avoid clipping or overflow
  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    const roomAbove = rect.top;
    const roomBelow = window.innerHeight - rect.bottom;

    // Prefer placing above if space below is limited
    const placeAbove = roomBelow < 220 && roomAbove > roomBelow;

    let left = rect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
    }
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    if (placeAbove) {
      const maxHeight = Math.max(120, Math.min(320, roomAbove - VIEWPORT_PADDING - GAP));
      const bottom = window.innerHeight - rect.top + GAP;
      setCoords({
        bottom,
        left,
        maxHeight,
        placement: 'top',
      });
    } else {
      const maxHeight = Math.max(120, Math.min(320, roomBelow - VIEWPORT_PADDING - GAP));
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
      const popover = popoverRef.current;
      if (
        popover &&
        !popover.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose, anchorRef, updatePosition]);

  if (!isOpen || !mounted || !coords) return null;

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Autonomous Tools"
      style={{
        position: 'fixed',
        left: coords?.left ?? VIEWPORT_PADDING,
        top: coords?.top !== undefined ? coords.top : undefined,
        bottom: coords?.bottom !== undefined ? coords.bottom : undefined,
        maxHeight: coords?.maxHeight ?? 320,
        width: POPOVER_WIDTH,
      }}
      className="z-[9999] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl select-none text-xs animate-in fade-in duration-100"
    >
      <div className="flex items-center justify-between pb-1 mb-1 border-b border-[var(--border-subtle)] px-2 pt-0.5">
        <span className="font-semibold text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          Autonomous Tools
        </span>
      </div>

      <div className="space-y-0.5">
        {TOOLS_CONFIG.map((tool) => {
          const Icon = tool.icon;
          const isChecked = Boolean(enabledTools[tool.key]);
          const isTooltipActive = hoveredTooltip === tool.key;

          return (
            <div
              key={tool.key}
              className="flex items-center justify-between px-2.5 py-1.5 min-h-[32px] rounded-lg hover:bg-[var(--accent)] transition-colors relative"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isChecked ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                <span className="text-xs font-medium text-[var(--text)] truncate">
                  {tool.name}
                </span>

                {/* Info Icon with Concise Tooltip */}
                <div className="relative flex items-center">
                  <button
                    type="button"
                    onMouseEnter={() => setHoveredTooltip(tool.key)}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    onFocus={() => setHoveredTooltip(tool.key)}
                    onBlur={() => setHoveredTooltip(null)}
                    className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-help rounded-full"
                    aria-label={`About ${tool.name}`}
                  >
                    <Info className="h-3 w-3" />
                  </button>

                  {isTooltipActive && (
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-60 w-52 rounded-lg border border-[var(--border)] bg-[#101412] text-zinc-100 p-2 text-[10px] leading-relaxed shadow-xl pointer-events-none animate-in fade-in duration-100">
                      {tool.description}
                    </div>
                  )}
                </div>
              </div>

              {/* Toggle Switch */}
              <Toggle
                size="sm"
                checked={isChecked}
                onChange={(val) => onToggleTool(tool.key, val)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

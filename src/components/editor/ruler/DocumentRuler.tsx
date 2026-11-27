'use client';

import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { PageDimensions } from '../utils/pageMetrics';
import { DocumentMargins } from '@/lib/types';

interface DocumentRulerProps {
  pageDimensions: PageDimensions;
  zoomLevel: number;
  onUpdateMargins: (margins: DocumentMargins) => void;
}

export function DocumentRuler({ pageDimensions, zoomLevel, onUpdateMargins }: DocumentRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'left' | 'right' | null>(null);

  const { widthPx, marginsPx } = pageDimensions;
  const scale = zoomLevel / 100;

  const [pageLayout, setPageLayout] = useState<{ offsetLeft: number; width: number }>({
    offsetLeft: 0,
    width: widthPx * scale,
  });

  // 1 cm ≈ 37.8px
  const tickSpacingPx = 37.8;
  const totalCm = Math.floor(widthPx / tickSpacingPx);

  const updateRulerGeometry = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const pageEl = document.getElementById('docium-page-1') || document.querySelector('.page-sheet');
    if (!pageEl) {
      const containerWidth = container.offsetWidth || 800;
      const expectedWidth = widthPx * scale;
      setPageLayout({
        offsetLeft: Math.max(0, (containerWidth - expectedWidth) / 2),
        width: expectedWidth,
      });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    setPageLayout({
      offsetLeft: pageRect.left - containerRect.left,
      width: pageRect.width,
    });
  }, [widthPx, scale]);

  useLayoutEffect(() => {
    updateRulerGeometry();
  }, [updateRulerGeometry, zoomLevel, pageDimensions]);

  useEffect(() => {
    updateRulerGeometry();
    const handleWindowResize = () => updateRulerGeometry();
    window.addEventListener('resize', handleWindowResize);

    const pageEl = document.getElementById('docium-page-1') || document.querySelector('.page-sheet');
    const scrollParent = pageEl ? pageEl.closest('.overflow-x-auto, .overflow-y-auto') : null;
    const handleScroll = () => updateRulerGeometry();

    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    }

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => updateRulerGeometry());
      if (containerRef.current) observer.observe(containerRef.current);
      if (pageEl) observer.observe(pageEl);
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (scrollParent) scrollParent.removeEventListener('scroll', handleScroll);
      if (observer) observer.disconnect();
    };
  }, [updateRulerGeometry]);

  const handleMouseDown = (type: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(type);
  };

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const relativeX = (e.clientX - rect.left) / scale;

      if (dragging === 'left') {
        const newLeftPx = Math.max(20, Math.min(relativeX, widthPx - marginsPx.right - 100));
        const newLeftMm = Math.round((newLeftPx / 3.7795) * 10) / 10;
        onUpdateMargins({
          top: Math.round(pageDimensions.marginsPx.top / 3.7795),
          bottom: Math.round(pageDimensions.marginsPx.bottom / 3.7795),
          right: Math.round(pageDimensions.marginsPx.right / 3.7795),
          left: newLeftMm,
        });
      } else if (dragging === 'right') {
        const newRightPx = Math.max(20, Math.min(widthPx - relativeX, widthPx - marginsPx.left - 100));
        const newRightMm = Math.round((newRightPx / 3.7795) * 10) / 10;
        onUpdateMargins({
          top: Math.round(pageDimensions.marginsPx.top / 3.7795),
          bottom: Math.round(pageDimensions.marginsPx.bottom / 3.7795),
          left: Math.round(pageDimensions.marginsPx.left / 3.7795),
          right: newRightMm,
        });
      }
    };

    const handleMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, scale, widthPx, marginsPx, onUpdateMargins, pageDimensions.marginsPx]);

  const leftMarginPx = marginsPx.left;
  const rightMarginPx = widthPx - marginsPx.right;

  return (
    <div
      ref={containerRef}
      data-docium-ui-only="true"
      className="w-full relative h-[28px] overflow-hidden py-1 border-b border-[var(--border)] bg-[var(--surface-elevated)] select-none shrink-0 docium-ruler z-20 print:hidden"
    >
      {/* Margin Track uses light theme-safe accent tint (fixed: no OS dark override) */}
      <div
        ref={rulerRef}
        style={{
          position: 'absolute',
          left: `${pageLayout.offsetLeft}px`,
          width: `${pageLayout.width}px`,
          height: '20px',
          top: '4px',
        }}
        className="bg-[var(--accent)] rounded-xs border border-[var(--border)] overflow-hidden transition-none"
      >
        {/* Printable Area Highlight */}
        <div
          style={{
            left: `${leftMarginPx * scale}px`,
            width: `${(rightMarginPx - leftMarginPx) * scale}px`,
          }}
          className="absolute top-0 bottom-0 bg-[var(--surface)]"
        />

        {/* Ticks and Numbers */}
        <div className="absolute inset-0 pointer-events-none flex">
          {Array.from({ length: totalCm + 1 }).map((_, i) => {
            const xPx = i * tickSpacingPx;
            return (
              <div
                key={i}
                style={{ left: `${xPx * scale}px` }}
                className="absolute top-0 h-full flex flex-col justify-between"
              >
                <div className="w-[1px] h-2 bg-[var(--text-muted)] opacity-55" />
                {i > 0 && i < totalCm && (
                  <span className="text-[9px] font-mono leading-none text-[var(--text-muted)] -translate-x-1/2 mb-0.5">
                    {i}
                  </span>
                )}
                <div
                  style={{ left: `${(tickSpacingPx / 2) * scale}px` }}
                  className="absolute top-0 w-[1px] h-1 bg-[var(--text-muted)] opacity-35"
                />
              </div>
            );
          })}
        </div>

        {/* Left Margin Marker */}
        <div
          style={{ left: `${leftMarginPx * scale}px` }}
          onMouseDown={handleMouseDown('left')}
          className="absolute top-0 bottom-0 -translate-x-1/2 w-4 cursor-ew-resize flex flex-col items-center group z-10"
          title={`Left Margin: ${(leftMarginPx / 3.7795).toFixed(1)} mm`}
        >
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-[var(--primary)]" />
          <div className="w-[1px] flex-1 bg-[var(--primary)] group-hover:bg-[var(--primary-hover)] opacity-70" />
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[5px] border-b-[var(--primary)]" />
        </div>

        {/* Right Margin Marker */}
        <div
          style={{ left: `${rightMarginPx * scale}px` }}
          onMouseDown={handleMouseDown('right')}
          className="absolute top-0 bottom-0 -translate-x-1/2 w-4 cursor-ew-resize flex flex-col items-center group z-10"
          title={`Right Margin: ${(marginsPx.right / 3.7795).toFixed(1)} mm`}
        >
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] border-t-[var(--primary)]" />
          <div className="w-[1px] flex-1 bg-[var(--primary)] group-hover:bg-[var(--primary-hover)] opacity-70" />
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[5px] border-b-[var(--primary)]" />
        </div>
      </div>
    </div>
  );
}

/**
 * Vertical Ruler Bar aligned vertically with the active page sheet's top & bottom margins.
 */
export function VerticalRuler({ pageDimensions, zoomLevel, onUpdateMargins }: DocumentRulerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'top' | 'bottom' | null>(null);
  const { heightPx, marginsPx } = pageDimensions;
  const scale = zoomLevel / 100;

  const [pageLayout, setPageLayout] = useState<{ offsetTop: number; height: number }>({
    offsetTop: 24,
    height: heightPx * scale,
  });

  const tickSpacingPx = 37.8;
  const totalCm = Math.floor(heightPx / tickSpacingPx);

  const updateGeometry = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const pageEl = document.getElementById('docium-page-1') || document.querySelector('.page-sheet');
    if (!pageEl) return;
    const containerRect = container.getBoundingClientRect();
    const pageRect = pageEl.getBoundingClientRect();
    setPageLayout({
      offsetTop: pageRect.top - containerRect.top,
      height: pageRect.height,
    });
  }, []);

  useLayoutEffect(() => {
    updateGeometry();
  }, [updateGeometry, zoomLevel, pageDimensions]);

  useEffect(() => {
    updateGeometry();
    const pageEl = document.getElementById('docium-page-1') || document.querySelector('.page-sheet');
    const scrollParent = pageEl ? pageEl.closest('.overflow-x-auto, .overflow-y-auto') : null;
    const onSync = () => updateGeometry();
    window.addEventListener('resize', onSync);
    if (scrollParent) scrollParent.addEventListener('scroll', onSync, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && pageEl) {
      observer = new ResizeObserver(onSync);
      observer.observe(pageEl);
    }
    return () => {
      window.removeEventListener('resize', onSync);
      if (scrollParent) scrollParent.removeEventListener('scroll', onSync);
      if (observer) observer.disconnect();
    };
  }, [updateGeometry]);

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!rulerRef.current) return;
      const rect = rulerRef.current.getBoundingClientRect();
      const relativeY = (e.clientY - rect.top) / scale;
      if (dragging === 'top') {
        const newTopPx = Math.max(24, Math.min(relativeY, heightPx - marginsPx.bottom - 120));
        onUpdateMargins({
          left: Math.round(marginsPx.left / 3.7795),
          right: Math.round(marginsPx.right / 3.7795),
          bottom: Math.round(marginsPx.bottom / 3.7795),
          top: Math.round((newTopPx / 3.7795) * 10) / 10,
        });
      } else {
        const newBottomPx = Math.max(24, Math.min(heightPx - relativeY, heightPx - marginsPx.top - 120));
        onUpdateMargins({
          left: Math.round(marginsPx.left / 3.7795),
          right: Math.round(marginsPx.right / 3.7795),
          top: Math.round(marginsPx.top / 3.7795),
          bottom: Math.round((newBottomPx / 3.7795) * 10) / 10,
        });
      }
    };
    const handleMouseUp = () => setDragging(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, scale, heightPx, marginsPx, onUpdateMargins]);

  const topMarginPx = marginsPx.top;
  const bottomMarginPx = heightPx - marginsPx.bottom;

  return (
    <div
      ref={containerRef}
      data-docium-ui-only="true"
      className="w-[24px] h-full relative overflow-hidden border-r border-[var(--border)] bg-[var(--surface-elevated)] select-none shrink-0 docium-ruler z-20 print:hidden"
    >
      <div
        ref={rulerRef}
        style={{
          position: 'absolute',
          top: `${pageLayout.offsetTop}px`,
          height: `${pageLayout.height}px`,
          width: '18px',
          left: '3px',
        }}
        className="bg-[var(--accent)] rounded-xs border border-[var(--border)] overflow-hidden"
      >
        {/* Printable Vertical Area */}
        <div
          style={{
            top: `${topMarginPx * scale}px`,
            height: `${(bottomMarginPx - topMarginPx) * scale}px`,
          }}
          className="absolute left-0 right-0 bg-[var(--surface)]"
        />

        {/* Vertical cm Ticks */}
        <div className="absolute inset-0 pointer-events-none">
          {Array.from({ length: totalCm + 1 }).map((_, i) => {
            const yPx = i * tickSpacingPx;
            return (
              <div
                key={i}
                style={{ top: `${yPx * scale}px` }}
                className="absolute left-0 w-full flex items-center"
              >
                <div className="h-[1px] w-1.5 bg-[var(--text-muted)] opacity-55" />
                {i > 0 && i < totalCm && (
                  <span className="text-[8px] font-mono leading-none text-[var(--text-muted)] ml-0.5 -translate-y-1/2">
                    {i}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Top Margin Marker */}
        <div
          style={{ top: `${topMarginPx * scale}px` }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging('top');
          }}
          className="absolute left-0 right-0 -translate-y-1/2 h-3 cursor-ns-resize flex items-center justify-center group z-10"
          title={`Top Margin: ${(topMarginPx / 3.7795).toFixed(1)} mm`}
        >
          <div className="h-[1.5px] w-full bg-[var(--primary)] opacity-75" />
        </div>

        {/* Bottom Margin Marker */}
        <div
          style={{ top: `${bottomMarginPx * scale}px` }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging('bottom');
          }}
          className="absolute left-0 right-0 -translate-y-1/2 h-3 cursor-ns-resize flex items-center justify-center group z-10"
          title={`Bottom Margin: ${(marginsPx.bottom / 3.7795).toFixed(1)} mm`}
        >
          <div className="h-[1.5px] w-full bg-[var(--primary)] opacity-75" />
        </div>
      </div>
    </div>
  );
}

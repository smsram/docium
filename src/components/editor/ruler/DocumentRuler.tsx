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

  // Track the actual rendered page sheet's horizontal position & width
  const [pageLayout, setPageLayout] = useState<{ offsetLeft: number; width: number }>({
    offsetLeft: 0,
    width: widthPx * scale,
  });

  // 1 cm ≈ 37.8px
  const tickSpacingPx = 37.8;
  const totalCm = Math.floor(widthPx / tickSpacingPx);

  // Synchronize ruler track position with the actual rendered document page sheet
  const updateRulerGeometry = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // Find the first document page sheet in the DOM
    const pageEl = document.getElementById('docium-page-1') || document.querySelector('.page-sheet');
    if (!pageEl) {
      // Fallback: center in container
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

    // Exact relative horizontal offset of the page sheet within the ruler container
    const relativeLeft = pageRect.left - containerRect.left;
    const pageWidth = pageRect.width;

    setPageLayout({
      offsetLeft: relativeLeft,
      width: pageWidth,
    });
  }, [widthPx, scale]);

  // Update geometry before paint whenever zoom or dimensions change
  useLayoutEffect(() => {
    updateRulerGeometry();
  }, [updateRulerGeometry, zoomLevel, pageDimensions]);

  // Set up observers and event listeners for scroll, resize, and sidebar toggling
  useEffect(() => {
    updateRulerGeometry();

    const handleWindowResize = () => {
      updateRulerGeometry();
    };

    window.addEventListener('resize', handleWindowResize);

    // Watch for scroll events on scrollable ancestor containers of the page sheet
    const pageEl = document.getElementById('docium-page-1') || document.querySelector('.page-sheet');
    const scrollParent = pageEl ? pageEl.closest('.overflow-x-auto, .overflow-y-auto') : null;
    const handleScroll = () => {
      updateRulerGeometry();
    };

    if (scrollParent) {
      scrollParent.addEventListener('scroll', handleScroll, { passive: true });
    }

    // ResizeObserver on the container and page sheet
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        updateRulerGeometry();
      });
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      if (pageEl) {
        observer.observe(pageEl);
      }
    }

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (scrollParent) {
        scrollParent.removeEventListener('scroll', handleScroll);
      }
      if (observer) {
        observer.disconnect();
      }
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
          ...pageDimensions.marginsPx,
          top: Math.round(pageDimensions.marginsPx.top / 3.7795),
          bottom: Math.round(pageDimensions.marginsPx.bottom / 3.7795),
          right: Math.round(pageDimensions.marginsPx.right / 3.7795),
          left: newLeftMm,
        });
      } else if (dragging === 'right') {
        const newRightPx = Math.max(20, Math.min(widthPx - relativeX, widthPx - marginsPx.left - 100));
        const newRightMm = Math.round((newRightPx / 3.7795) * 10) / 10;
        onUpdateMargins({
          ...pageDimensions.marginsPx,
          top: Math.round(pageDimensions.marginsPx.top / 3.7795),
          bottom: Math.round(pageDimensions.marginsPx.bottom / 3.7795),
          left: Math.round(pageDimensions.marginsPx.left / 3.7795),
          right: newRightMm,
        });
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
    };

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
      className="w-full relative h-[30px] overflow-hidden py-1 border-b border-[var(--border)] bg-[var(--surface-elevated)] select-none shrink-0 docium-ruler z-20"
    >
      <div
        ref={rulerRef}
        style={{
          position: 'absolute',
          left: `${pageLayout.offsetLeft}px`,
          width: `${pageLayout.width}px`,
          height: '22px',
          top: '4px',
        }}
        className="bg-[#E7EAE4] dark:bg-stone-800 rounded-xs border border-[var(--border)] shadow-2xs overflow-hidden transition-none"
      >
        {/* Printable Area Highlight */}
        <div
          style={{
            left: `${leftMarginPx * scale}px`,
            width: `${(rightMarginPx - leftMarginPx) * scale}px`,
          }}
          className="absolute top-0 bottom-0 bg-[var(--surface)] shadow-inner"
        />

        {/* Ticks and Numbers */}
        <div className="absolute inset-0 pointer-events-none flex">
          {Array.from({ length: totalCm + 1 }).map((_, i) => {
            const xPx = i * tickSpacingPx;
            return (
              <div
                key={i}
                style={{
                  left: `${xPx * scale}px`,
                }}
                className="absolute top-0 h-full flex flex-col justify-between"
              >
                <div className="w-[1px] h-2 bg-stone-400 dark:bg-stone-600" />
                {i > 0 && i < totalCm && (
                  <span className="text-[9px] font-mono leading-none text-[var(--text-muted)] -translate-x-1/2 mb-0.5">
                    {i}
                  </span>
                )}
                {/* Half cm tick */}
                <div
                  style={{ left: `${(tickSpacingPx / 2) * scale}px` }}
                  className="absolute top-0 w-[1px] h-1 bg-stone-300 dark:bg-stone-700"
                />
              </div>
            );
          })}
        </div>

        {/* Left Margin Marker */}
        <div
          style={{
            left: `${leftMarginPx * scale}px`,
          }}
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
          style={{
            left: `${rightMarginPx * scale}px`,
          }}
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

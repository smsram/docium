'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, ReactNode, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

export interface PopoverProps {
  isOpen: boolean;
  onClose: () => void;
  trigger?: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
  offset?: number;
}

const emptySubscribe = () => () => {};

export function Popover({
  isOpen,
  onClose,
  trigger,
  children,
  align = 'left',
  className = '',
  anchorRef,
  offset = 4,
}: PopoverProps) {
  const localTriggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'bottom' | 'top' }>({
    top: -9999,
    left: -9999,
    placement: 'bottom',
  });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef ? anchorRef.current : localTriggerRef.current;
    if (!anchor) return;
    const anchorRect = anchor.getBoundingClientRect();
    const padding = 8;
    const estHeight = popoverRef.current?.offsetHeight || 240;
    const estWidth = popoverRef.current?.offsetWidth || 280;

    const roomBelow = window.innerHeight - anchorRect.bottom;
    const roomAbove = anchorRect.top;
    const placeTop = roomBelow < estHeight + padding && roomAbove > roomBelow;

    const top = placeTop
      ? Math.max(padding, anchorRect.top - estHeight - offset)
      : Math.min(window.innerHeight - estHeight - padding, anchorRect.bottom + offset);

    let left = anchorRect.left;
    if (align === 'right') {
      left = anchorRect.right - estWidth;
    } else if (align === 'center') {
      left = anchorRect.left + anchorRect.width / 2 - estWidth / 2;
    }

    if (left + estWidth > window.innerWidth - padding) {
      left = window.innerWidth - estWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setPosition({ top, left, placement: placeTop ? 'top' : 'bottom' });
    setIsPositioned(true);
  }, [align, offset, anchorRef]);

  // Synchronously compute position before browser paints
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleWindowEvents = () => updatePosition();
    window.addEventListener('resize', handleWindowEvents);
    window.addEventListener('scroll', handleWindowEvents, true);

    return () => {
      window.removeEventListener('resize', handleWindowEvents);
      window.removeEventListener('scroll', handleWindowEvents, true);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const anchor = anchorRef ? anchorRef.current : localTriggerRef.current;
      if (
        anchor &&
        !anchor.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        onClose();
        setIsPositioned(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        setIsPositioned(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef]);

  const popoverContent = isOpen && (
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        visibility: isPositioned ? 'visible' : 'hidden',
      }}
      className={`z-50 select-none animate-in fade-in zoom-in-95 duration-100 ${className}`}
    >
      {children}
    </div>
  );

  return (
    <>
      {trigger && (
        <div ref={localTriggerRef} className="inline-block">
          {trigger}
        </div>
      )}
      {mounted && typeof document !== 'undefined' && isOpen && createPortal(popoverContent, document.body)}
    </>
  );
}

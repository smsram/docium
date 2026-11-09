'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, ReactNode, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

export interface DropdownItem {
  id: string;
  label: string;
  sublabel?: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
  onClick: () => void;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
  menuWidth?: string;
  selectedId?: string;
}

const emptySubscribe = () => () => {};

export function Dropdown({
  trigger,
  items,
  align = 'left',
  className = '',
  menuWidth = 'w-56',
  selectedId,
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'bottom' | 'top' }>({
    top: -9999,
    left: -9999,
    placement: 'bottom',
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Calculate position with viewport boundary collision prevention
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const padding = 8;
    const estHeight = menuRef.current?.offsetHeight || 220;
    const estWidth = menuRef.current?.offsetWidth || 224;

    const roomBelow = window.innerHeight - triggerRect.bottom;
    const roomAbove = triggerRect.top;
    const placeTop = roomBelow < estHeight + padding && roomAbove > roomBelow;

    const top = placeTop
      ? Math.max(padding, triggerRect.top - estHeight - 4)
      : Math.min(window.innerHeight - estHeight - padding, triggerRect.bottom + 4);

    let left = align === 'right' ? triggerRect.right - estWidth : triggerRect.left;
    if (left + estWidth > window.innerWidth - padding) {
      left = window.innerWidth - estWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setPosition({ top, left, placement: placeTop ? 'top' : 'bottom' });
    setIsPositioned(true);
  }, [align]);

  // Synchronously position before paint
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Update position on window resize or scroll
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

  // Open with synchronous position pre-computation to avoid any (0,0) flash
  const openMenu = () => {
    if (!isOpen && triggerRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const padding = 8;
      const estHeight = 220;
      const estWidth = 224;
      const roomBelow = window.innerHeight - triggerRect.bottom;
      const roomAbove = triggerRect.top;
      const placeTop = roomBelow < estHeight + padding && roomAbove > roomBelow;
      const top = placeTop
        ? Math.max(padding, triggerRect.top - estHeight - 4)
        : Math.min(window.innerHeight - estHeight - padding, triggerRect.bottom + 4);
      let left = align === 'right' ? triggerRect.right - estWidth : triggerRect.left;
      if (left + estWidth > window.innerWidth - padding) left = window.innerWidth - estWidth - padding;
      if (left < padding) left = padding;

      setPosition({ top, left, placement: placeTop ? 'top' : 'bottom' });
      setIsPositioned(true);
    }
    setIsOpen(!isOpen);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
        setIsPositioned(false);
        setFocusedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
        setFocusedIndex(0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      setIsPositioned(false);
      setFocusedIndex(-1);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < items.length) {
      e.preventDefault();
      const item = items[focusedIndex];
      if (!item.disabled) {
        item.onClick();
        setIsOpen(false);
        setIsPositioned(false);
        setFocusedIndex(-1);
      }
    }
  };

  const menuContent = isOpen && (
    <div
      ref={menuRef}
      role="menu"
      tabIndex={-1}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        visibility: isPositioned ? 'visible' : 'hidden',
      }}
      className={`z-50 ${menuWidth} max-h-80 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100 select-none text-xs flex flex-col`}
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const isFocused = index === focusedIndex;
        const isSelected = item.checked || (selectedId && item.id === selectedId);

        return (
          <React.Fragment key={item.id}>
            {item.separator && <div className="my-1 border-t border-[var(--border)]" />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  setIsOpen(false);
                  setIsPositioned(false);
                  setFocusedIndex(-1);
                }
              }}
              className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors cursor-pointer ${
                item.disabled
                  ? 'opacity-40 cursor-not-allowed'
                  : isSelected
                  ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                  : isFocused
                  ? 'bg-[var(--accent)] text-[var(--text)]'
                  : item.danger
                  ? 'text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20'
                  : 'text-[var(--text)] hover:bg-[var(--accent)]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {Icon && (
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${
                      item.danger
                        ? 'text-rose-500'
                        : isSelected
                        ? 'text-[var(--primary)]'
                        : 'text-[var(--text-muted)]'
                    }`}
                  />
                )}
                <div className="min-w-0">
                  <p className="font-medium truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-[10px] text-[var(--text-muted)] truncate">
                      {item.sublabel}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {item.badge && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--accent)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                    {item.badge}
                  </span>
                )}
                {isSelected && <Check className="h-3.5 w-3.5 text-[var(--primary)] stroke-[2.5]" />}
              </div>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onKeyDown={handleKeyDown}
    >
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={openMenu}
        className="cursor-pointer inline-flex items-center"
      >
        {trigger}
      </div>

      {mounted && typeof document !== 'undefined' && isOpen && createPortal(menuContent, document.body)}
    </div>
  );
}

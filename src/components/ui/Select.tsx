'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, ReactNode, useCallback, useSyncExternalStore, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

const emptySubscribe = () => () => {};

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuWidth?: string;
  align?: 'left' | 'right';
  size?: 'xs' | 'sm' | 'md';
  id?: string;
  'aria-label'?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  optionStyle?: (option: SelectOption) => React.CSSProperties | undefined;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  triggerClassName = '',
  menuWidth = '',
  align = 'left',
  size = 'md',
  id,
  'aria-label': ariaLabel,
  searchable = false,
  searchPlaceholder = 'Search...',
  optionStyle,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [searchQuery, setSearchQuery] = useState('');
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    placement: 'bottom' | 'top';
  }>({
    top: -9999,
    left: -9999,
    width: 0,
    placement: 'bottom',
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionsListRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return options;
    const q = searchQuery.trim().toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.value.toLowerCase().includes(q) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(q))
    );
  }, [options, searchable, searchQuery]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // Viewport-aware position calculator
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const padding = 8;
    const estHeight = listboxRef.current?.offsetHeight || 260;
    const computedWidth = menuWidth
      ? (listboxRef.current?.offsetWidth || Math.max(triggerRect.width, 180))
      : Math.max(triggerRect.width, 140);

    const roomBelow = window.innerHeight - triggerRect.bottom;
    const roomAbove = triggerRect.top;
    const placeTop = roomBelow < estHeight + padding && roomAbove > roomBelow;

    const top = placeTop
      ? Math.max(padding, triggerRect.top - estHeight - 4)
      : Math.min(window.innerHeight - estHeight - padding, triggerRect.bottom + 4);

    let left = align === 'right' ? triggerRect.right - computedWidth : triggerRect.left;
    if (left + computedWidth > window.innerWidth - padding) {
      left = window.innerWidth - computedWidth - padding;
    }
    if (left < padding) {
      left = padding;
    }

    setPosition({
      top,
      left,
      width: menuWidth ? computedWidth : triggerRect.width,
      placement: placeTop ? 'top' : 'bottom',
    });
    setIsPositioned(true);
  }, [align, menuWidth]);

  // Synchronously position before paint
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Reposition on scroll or resize
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

  // Open with synchronous position calculation
  const openSelect = () => {
    if (disabled) return;
    if (!isOpen) {
      setSearchQuery('');
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      setHighlightedIndex(idx);
      if (triggerRef.current) {
        const triggerRect = triggerRef.current.getBoundingClientRect();
        const padding = 8;
        const estHeight = 260;
        const computedWidth = menuWidth ? Math.max(triggerRect.width, 180) : Math.max(triggerRect.width, 140);
        const roomBelow = window.innerHeight - triggerRect.bottom;
        const roomAbove = triggerRect.top;
        const placeTop = roomBelow < estHeight + padding && roomAbove > roomBelow;
        const top = placeTop
          ? Math.max(padding, triggerRect.top - estHeight - 4)
          : Math.min(window.innerHeight - estHeight - padding, triggerRect.bottom + 4);
        let left = align === 'right' ? triggerRect.right - computedWidth : triggerRect.left;
        if (left + computedWidth > window.innerWidth - padding) left = window.innerWidth - computedWidth - padding;
        if (left < padding) left = padding;

        setPosition({
          top,
          left,
          width: menuWidth ? computedWidth : triggerRect.width,
          placement: placeTop ? 'top' : 'bottom',
        });
        setIsPositioned(true);
      }
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setIsPositioned(false);
    }
  };

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        listboxRef.current &&
        !listboxRef.current.contains(target)
      ) {
        setIsOpen(false);
        setIsPositioned(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Scroll active option into view
  useEffect(() => {
    const container = optionsListRef.current || listboxRef.current;
    if (isOpen && container && highlightedIndex >= 0) {
      const activeElement = container.children[highlightedIndex] as HTMLElement;
      if (activeElement && activeElement.scrollIntoView) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  const selectOption = useCallback(
    (opt: SelectOption) => {
      if (opt.disabled) return;
      onChange(opt.value);
      setIsOpen(false);
      setIsPositioned(false);
      setSearchQuery('');
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openSelect();
      }
      return;
    }

    if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
      setIsPositioned(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev + 1;
        while (next < filteredOptions.length && filteredOptions[next].disabled) {
          next++;
        }
        return next < filteredOptions.length ? next : prev;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev - 1;
        while (next >= 0 && filteredOptions[next].disabled) {
          next--;
        }
        return next >= 0 ? next : prev;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      const firstValid = filteredOptions.findIndex((o) => !o.disabled);
      if (firstValid >= 0) setHighlightedIndex(firstValid);
    } else if (e.key === 'End') {
      e.preventDefault();
      for (let i = filteredOptions.length - 1; i >= 0; i--) {
        if (!filteredOptions[i].disabled) {
          setHighlightedIndex(i);
          break;
        }
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        selectOption(filteredOptions[highlightedIndex]);
      }
    }
  };

  const sizeClasses = {
    xs: 'h-7 px-2 py-0.5 text-[11px]',
    sm: 'h-8 px-2.5 py-1 text-xs',
    md: 'h-9 px-3 py-1.5 text-xs',
  }[size];

  const listboxContent = isOpen && (
    <div
      ref={listboxRef}
      role="listbox"
      tabIndex={-1}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        width: menuWidth ? undefined : `${position.width}px`,
        minWidth: `${Math.max(position.width, 140)}px`,
        visibility: isPositioned ? 'visible' : 'hidden',
      }}
      className={`z-50 ${menuWidth || ''} max-h-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl animate-in fade-in-50 zoom-in-95 duration-100 select-none text-xs flex flex-col`}
    >
      {searchable && (
        <div className="sticky top-0 z-10 bg-[var(--surface)] px-1.5 pt-1 pb-1.5 border-b border-[var(--border-subtle)] mb-1">
          <div className="relative flex items-center">
            <Search className="h-3 w-3 text-[var(--text-muted)] absolute left-2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] pl-6 pr-2 py-1 text-[11px] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>
      )}

      <div ref={optionsListRef} className="overflow-y-auto max-h-56 flex flex-col">
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-2 text-xs text-[var(--text-muted)] text-center">
            No matching options
          </div>
        ) : (
          filteredOptions.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;
            const customStyle = optionStyle ? optionStyle(opt) : undefined;

            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                disabled={opt.disabled}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => !opt.disabled && setHighlightedIndex(idx)}
                onClick={() => selectOption(opt)}
                style={customStyle}
                className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left transition-colors ${
                  opt.disabled
                    ? 'opacity-40 cursor-not-allowed'
                    : isSelected
                    ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold cursor-pointer'
                    : isHighlighted
                    ? 'bg-[var(--accent)] text-[var(--text)] cursor-pointer'
                    : 'text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {opt.icon}
                  <div className="min-w-0">
                    <p className="truncate">{opt.label}</p>
                    {opt.sublabel && (
                      <p className="text-[10px] text-[var(--text-muted)] font-normal truncate">
                        {opt.sublabel}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {opt.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--accent)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                      {opt.badge}
                    </span>
                  )}
                  {isSelected && <Check className="h-3.5 w-3.5 text-[var(--primary)] stroke-[2.5]" />}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || (selectedOption ? selectedOption.label : placeholder)}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={openSelect}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center justify-between gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] font-medium text-[var(--text)] transition-colors outline-none focus-visible:border-[var(--primary)] focus-visible:ring-1 focus-visible:ring-[var(--primary)] ${sizeClasses} ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-[var(--accent)]/30'
            : 'cursor-pointer hover:bg-[var(--accent)]'
        } ${isOpen ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]/30' : ''} ${triggerClassName}`}
      >
        <div className="flex items-center gap-1.5 truncate min-w-0">
          {selectedOption?.icon}
          <span className={`truncate ${!selectedOption ? 'text-[var(--text-muted)]' : ''}`}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[var(--accent)] text-[var(--text-muted)] border border-[var(--border)]">
              {selectedOption.badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-3 w-3 text-[var(--text-muted)] shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-[var(--primary)]' : ''
          }`}
        />
      </button>

      {mounted && typeof document !== 'undefined' && isOpen && createPortal(listboxContent, document.body)}
    </div>
  );
}

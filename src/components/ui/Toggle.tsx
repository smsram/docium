'use client';

import React, { ReactNode } from 'react';

export interface ToggleProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function Toggle({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
  size = 'md',
}: ToggleProps) {
  const reactId = React.useId();
  const generatedId = id || reactId;

  // Precise track and knob geometry:
  // sm: track 32px x 18px, knob 14px x 14px, 2px padding, translate 14px
  // md: track 44px x 24px, knob 20px x 20px, 2px padding, translate 20px
  const isSm = size === 'sm';
  const trackClass = isSm ? 'w-8 h-[18px]' : 'w-11 h-6';
  const knobClass = isSm ? 'h-3.5 w-3.5 top-[2px] left-[2px]' : 'h-5 w-5 top-[2px] left-[2px]';
  const translateClass = checked
    ? isSm
      ? 'translate-x-3.5'
      : 'translate-x-5'
    : 'translate-x-0';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div
      className={`inline-flex items-start gap-2.5 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <div className="relative flex items-center justify-center pt-0.5 shrink-0">
        <input
          id={generatedId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          onKeyDown={handleKeyDown}
          className="peer sr-only"
        />
        <label
          htmlFor={generatedId}
          className={`${trackClass} rounded-full transition-colors duration-200 ease-in-out cursor-pointer block relative motion-reduce:transition-none ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            checked
              ? 'bg-[var(--primary)]'
              : 'bg-zinc-300 dark:bg-zinc-700 hover:bg-zinc-400/80 dark:hover:bg-zinc-600'
          } peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--primary)]/40 peer-focus-visible:outline-none`}
        >
          <span
            className={`absolute ${knobClass} bg-white rounded-full transition-transform duration-200 ease-in-out shadow-sm pointer-events-none motion-reduce:transition-none ${translateClass}`}
          />
        </label>
      </div>

      {(label || description) && (
        <label
          htmlFor={generatedId}
          className={`select-none text-xs ${
            disabled ? 'cursor-not-allowed text-[var(--text-muted)]' : 'cursor-pointer'
          }`}
        >
          {label && <span className="font-medium text-[var(--text)] block">{label}</span>}
          {description && (
            <span className="text-[11px] text-[var(--text-muted)] leading-tight block mt-0.5">
              {description}
            </span>
          )}
        </label>
      )}
    </div>
  );
}

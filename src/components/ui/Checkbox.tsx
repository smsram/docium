'use client';

import React, { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}: CheckboxProps) {
  const generatedId = id || `chk-${Math.random().toString(36).substring(2, 7)}`;

  return (
    <div
      className={`inline-flex items-start gap-2.5 ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
    >
      <div className="relative flex items-center justify-center pt-0.5">
        <input
          id={generatedId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          className="peer sr-only"
        />
        <label
          htmlFor={generatedId}
          className={`h-4 w-4 rounded border transition-all duration-150 flex items-center justify-center ${
            disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          } ${
            checked
              ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-2xs'
              : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--primary)]'
          } peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--primary)]/30 peer-focus-visible:border-[var(--primary)]`}
        >
          {checked && <Check className="h-3 w-3 stroke-[3]" />}
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

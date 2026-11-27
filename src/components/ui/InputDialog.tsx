'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';

export interface InputDialogField {
  id: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'url';
}

interface InputDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  fields: InputDialogField[];
  confirmLabel?: string;
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function InputDialog({
  isOpen,
  title,
  description,
  fields,
  confirmLabel = 'Apply',
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      for (const f of fields) {
        initial[f.id] = f.defaultValue ?? '';
      }
      setValues(initial);
    }
  }, [isOpen, fields]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(values);
  };

  return createPortal(
    <div
      data-docium-ui-only="true"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4 print:hidden"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl text-[var(--text)] space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {description && (
          <p className="text-xs text-[var(--text-muted)]">{description}</p>
        )}

        <div className="space-y-2.5">
          {fields.map((field, idx) => (
            <div key={field.id} className="space-y-1">
              <label className="block text-[11px] font-medium text-[var(--text-muted)]">
                {field.label}
              </label>
              <input
                type={field.type || 'text'}
                autoFocus={idx === 0}
                value={values[field.id] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                }
                placeholder={field.placeholder}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancel();
                  }
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--accent)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] cursor-pointer shadow-2xs"
          >
            <Check className="h-3.5 w-3.5" />
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}


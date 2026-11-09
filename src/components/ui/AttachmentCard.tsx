'use client';

import React from 'react';
import Image from 'next/image';
import { Paperclip, FileText, Table, Presentation, FileCheck, X } from 'lucide-react';

interface AttachmentCardProps {
  name: string;
  size?: string;
  type?: string;
  previewUrl?: string;
  onRemove?: () => void;
  className?: string;
}

export function AttachmentCard({
  name,
  size,
  type = 'document',
  previewUrl,
  onRemove,
  className = '',
}: AttachmentCardProps) {
  const getIcon = () => {
    const lower = (type + ' ' + name).toLowerCase();
    if (lower.includes('sheet') || lower.includes('xls') || lower.includes('csv')) {
      return <Table className="h-3.5 w-3.5 text-[var(--secondary)]" />;
    }
    if (lower.includes('slide') || lower.includes('ppt')) {
      return <Presentation className="h-3.5 w-3.5 text-amber-600" />;
    }
    if (lower.includes('pdf')) {
      return <FileCheck className="h-3.5 w-3.5 text-red-600" />;
    }
    return <FileText className="h-3.5 w-3.5 text-[var(--primary)]" />;
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1.5 pr-2 text-xs shadow-2xs group ${className}`}
    >
      {previewUrl ? (
        <div className="relative h-6 w-6 rounded overflow-hidden shrink-0 border border-[var(--border)] bg-[var(--accent)]">
          <Image src={previewUrl} alt={name} fill className="object-cover" />
        </div>
      ) : (
        <div className="flex h-6 w-6 items-center justify-center rounded bg-[var(--accent)] shrink-0">
          {getIcon()}
        </div>
      )}

      <div className="min-w-0 max-w-[150px]">
        <p className="font-medium text-[var(--text)] truncate text-[11px] leading-tight">
          {name}
        </p>
        {size && (
          <p className="text-[10px] text-[var(--text-muted)] font-mono leading-none">
            {size}
          </p>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-[var(--text-muted)] hover:text-rose-500 rounded p-0.5 transition-colors cursor-pointer"
          title="Remove attachment"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}


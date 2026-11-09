'use client';

import React from 'react';
import { X, BarChart3, Clock, FileText, AlignLeft, Hash } from 'lucide-react';

interface DocumentStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  wordCount: number;
  characterCount: number;
  characterCountNoSpaces: number;
  paragraphCount: number;
  pageCount: number;
}

export function DocumentStatsModal({
  isOpen,
  onClose,
  title,
  wordCount,
  characterCount,
  characterCountNoSpaces,
  paragraphCount,
  pageCount,
}: DocumentStatsModalProps) {
  if (!isOpen) return null;

  const readingTimeMin = Math.max(1, Math.ceil(wordCount / 200));
  const speakingTimeMin = Math.max(1, Math.ceil(wordCount / 130));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-5 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">Document Statistics</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="border-b border-[var(--border)] pb-3">
            <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider block">Document</span>
            <span className="font-semibold text-sm text-[var(--text)] truncate block mt-0.5">{title}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <FileText className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="font-medium text-[11px]">Pages</span>
              </div>
              <span className="text-xl font-bold font-mono text-[var(--text)]">{pageCount}</span>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <Hash className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="font-medium text-[11px]">Words</span>
              </div>
              <span className="text-xl font-bold font-mono text-[var(--text)]">{wordCount.toLocaleString()}</span>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <AlignLeft className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="font-medium text-[11px]">Characters</span>
              </div>
              <span className="text-xl font-bold font-mono text-[var(--text)]">{characterCount.toLocaleString()}</span>
              <span className="text-[10px] text-[var(--text-muted)] block mt-0.5">
                ({characterCountNoSpaces.toLocaleString()} without spaces)
              </span>
            </div>

            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-3">
              <div className="flex items-center gap-1.5 text-[var(--text-muted)] mb-1">
                <AlignLeft className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span className="font-medium text-[11px]">Paragraphs</span>
              </div>
              <span className="text-xl font-bold font-mono text-[var(--text)]">{paragraphCount.toLocaleString()}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--accent)] p-2.5">
              <Clock className="h-4 w-4 text-[var(--primary)] shrink-0" />
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block">Reading Time</span>
                <span className="font-semibold text-xs text-[var(--text)]">~{readingTimeMin} min</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-lg bg-[var(--accent)] p-2.5">
              <Clock className="h-4 w-4 text-[var(--secondary)] shrink-0" />
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block">Speaking Time</span>
                <span className="font-semibold text-xs text-[var(--text)]">~{speakingTimeMin} min</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--border)] px-5 py-3 bg-[var(--surface-elevated)]">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}


'use client';

import React, { useState } from 'react';
import { X, Link2, ExternalLink } from 'lucide-react';

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  initialText?: string;
  onSave: (url: string, text?: string) => void;
  onRemove?: () => void;
}

export function LinkModal({
  isOpen,
  onClose,
  initialUrl = '',
  initialText = '',
  onSave,
  onRemove,
}: LinkModalProps) {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [prevProps, setPrevProps] = useState({ initialUrl, initialText, isOpen });

  if (
    isOpen !== prevProps.isOpen ||
    initialUrl !== prevProps.initialUrl ||
    initialText !== prevProps.initialText
  ) {
    setPrevProps({ initialUrl, initialText, isOpen });
    setUrl(initialUrl);
    setText(initialText);
  }

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      let finalUrl = url.trim();
      if (!/^https?:\/\//i.test(finalUrl) && !/^mailto:/i.test(finalUrl) && !finalUrl.startsWith('#')) {
        finalUrl = `https://${finalUrl}`;
      }
      onSave(finalUrl, text.trim() || undefined);
    } else if (onRemove) {
      onRemove();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-[var(--primary)]" />
            <h3 className="text-xs font-semibold text-[var(--text)]">{initialUrl ? 'Edit Link' : 'Insert Link'}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          <div>
            <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Display Text</label>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Docium Documentation"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-[var(--text-muted)] block mb-1">Destination URL</label>
            <div className="relative flex items-center">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                required
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)] font-mono text-[11px]"
              />
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 p-1 text-[var(--text-muted)] hover:text-[var(--primary)]"
                  title="Open URL in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {initialUrl && onRemove ? (
              <button
                type="button"
                onClick={() => {
                  onRemove();
                  onClose();
                }}
                className="text-rose-600 hover:text-rose-700 font-medium text-[11px]"
              >
                Remove link
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--accent)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[var(--primary)] px-3.5 py-1 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


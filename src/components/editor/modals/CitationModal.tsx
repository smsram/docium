'use client';

import React, { useState } from 'react';
import { X, BookOpen, Plus } from 'lucide-react';
import { DocumentCitation } from '@/lib/types';

interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddCitation: (citation: DocumentCitation) => void;
}

export function CitationModal({ isOpen, onClose, onAddCitation }: CitationModalProps) {
  const [author, setAuthor] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [publisher, setPublisher] = useState('');
  const [url, setUrl] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!author.trim() || !title.trim()) return;

    const lastName = author.split(',')[0].trim().split(' ').pop() || 'Ref';
    const key = `${lastName}${year}`;

    onAddCitation({
      id: `cit-${Date.now()}`,
      key,
      author: author.trim(),
      title: title.trim(),
      year: year.trim() || undefined,
      publisher: publisher.trim() || undefined,
      url: url.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-5 bg-[var(--surface-elevated)]">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text)]">Add Citation / Reference</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div>
            <label className="font-semibold block mb-1 text-[var(--text)]">Author(s) *</label>
            <input
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. Chen, Sarah & Rivera, Alex"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div>
            <label className="font-semibold block mb-1 text-[var(--text)]">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Cognitive Ergonomics in Collaborative Document Editors"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold block mb-1 text-[var(--text)]">Year</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2026"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="font-semibold block mb-1 text-[var(--text)]">Publisher / Journal</label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="ACM / IEEE / MIT Press"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold block mb-1 text-[var(--text)]">URL or DOI (optional)</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://doi.org/10.1145/..."
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 outline-none focus:border-[var(--primary)] font-mono text-[11px]"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--accent)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Insert Citation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


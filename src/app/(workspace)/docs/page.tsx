'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import { normalizeWorkspaceItems, matchesSearchQuery } from '@/lib/itemNormalization';
import {
  FileText,
  Plus,
  Star,
  Trash2,
  Search,
  Sparkles,
  ArrowRight,
  Clock,
} from 'lucide-react';

export default function DocsPage() {
  const router = useRouter();
  const { documents, createDocument, toggleStar, deleteDocument } = useWorkspaceStore();
  const [search, setSearch] = useState('');
  const [onlyStarred, setOnlyStarred] = useState(false);

  const activeDocs = normalizeWorkspaceItems(documents, 'doc').filter((d) => {
    if (d.trashed) return false;
    if (onlyStarred && !d.starred) return false;
    if (search && !matchesSearchQuery(d, search)) return false;
    return true;
  });

  const templates = [
    { title: 'Blank Document', desc: 'Clean A4 canvas', prompt: '' },
    { title: 'Product Requirements (PRD)', desc: 'Stripe & Linear engineering spec', prompt: 'PRD' },
    { title: 'Architecture RFC', desc: 'System design & data models', prompt: 'RFC' },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Document Library</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Word and Google Docs inspired A4 document workspace with rich typography and export fidelity.
          </p>
        </div>

        <button
          onClick={() => {
            const id = createDocument('doc');
            router.push(`/workspace/${id}`);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Document</span>
        </button>
      </div>

      {/* Quick Start Templates */}
      <div>
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Quick Start Templates
        </span>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {templates.map((tpl, i) => (
            <div
              key={i}
              onClick={() => {
                const id = createDocument('doc', tpl.title);
                router.push(`/workspace/${id}`);
              }}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:border-[var(--primary)] hover:bg-[var(--accent)] cursor-pointer transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-light)] text-[var(--primary)]">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)]">
                    {tpl.title}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">{tpl.desc}</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--primary)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
        </div>

        <button
          onClick={() => setOnlyStarred(!onlyStarred)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            onlyStarred
              ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${onlyStarred ? 'fill-current' : ''}`} />
          <span>Starred Only</span>
        </button>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {activeDocs.map((doc) => (
          <div
            key={doc.id}
            className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xs hover:border-[var(--primary)] transition-all"
          >
            <Link href={`/workspace/${doc.id}`} className="block">
              <div className="flex items-start justify-between">
                <FileText className="h-5 w-5 text-[var(--primary)]" />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleStar(doc.id);
                  }}
                  className="p-1 text-[var(--text-muted)] hover:text-amber-500"
                >
                  <Star className={`h-4 w-4 ${doc.starred ? 'fill-amber-500 text-amber-500' : ''}`} />
                </button>
              </div>

              <h3 className="mt-3 text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors line-clamp-1">
                {doc.title}
              </h3>
              <p className="mt-1 text-[11px] text-[var(--text-muted)] line-clamp-2">
                {doc.content.replace(/<[^>]+>/g, '').slice(0, 110)}...
              </p>
            </Link>

            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(doc.updatedAt).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-2">
                <span>{doc.wordCount || 0} words</span>
                <button
                  onClick={() => deleteDocument(doc.id)}
                  className="p-1 hover:text-red-500"
                  title="Move to trash"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

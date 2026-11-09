'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import { SAMPLE_TEMPLATES } from '@/lib/sampleData';
import {
  Sparkles,
  FileText,
  Table,
  Presentation,
  Check,
  ArrowRight,
  Search,
  Briefcase,
  Layers,
  Palette,
  BookOpen,
} from 'lucide-react';

export default function TemplatesPage() {
  const router = useRouter();
  const { createDocument } = useWorkspaceStore();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  const categories = ['All', 'Engineering', 'Business', 'Design', 'Personal'];

  const filtered = SAMPLE_TEMPLATES.filter((t) => {
    const matchCat = selectedCategory === 'All' || t.category === selectedCategory;
    const matchSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleUseTemplate = (tpl: (typeof SAMPLE_TEMPLATES)[0]) => {
    const id = createDocument(tpl.type, tpl.title, tpl.content);
    router.push(`/workspace/${id}`);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Template Gallery</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Engineered templates for rapid document drafting, financial models, and executive briefings.
          </p>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[var(--primary)] text-white shadow-2xs'
                  : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 py-2 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
        />
      </div>

      {/* Template Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {filtered.map((tpl) => (
          <div
            key={tpl.id}
            className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xs hover:border-[var(--primary)] transition-all"
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary-light)] text-[var(--primary)] mb-3">
                  {tpl.type === 'doc' ? (
                    <FileText className="h-5 w-5" />
                  ) : tpl.type === 'sheet' ? (
                    <Table className="h-5 w-5" />
                  ) : (
                    <Presentation className="h-5 w-5" />
                  )}
                </div>

                {tpl.badge && (
                  <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary)]">
                    {tpl.badge}
                  </span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                {tpl.title}
              </h3>
              <p className="mt-1.5 text-xs text-[var(--text-muted)] leading-relaxed">
                {tpl.description}
              </p>

              <div className="mt-3 rounded-lg bg-[var(--accent)] p-2.5 text-[11px] font-mono text-[var(--text-muted)] line-clamp-2 border border-[var(--border)]">
                {tpl.previewSnippet}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
              <span className="text-[10px] uppercase font-mono text-[var(--text-muted)]">
                {tpl.category} • {tpl.type}
              </span>

              <button
                onClick={() => handleUseTemplate(tpl)}
                className="flex items-center gap-1 rounded bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)] transition-colors"
              >
                <span>Use Template</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

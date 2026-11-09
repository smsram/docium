'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import { normalizeWorkspaceItems, matchesSearchQuery } from '@/lib/itemNormalization';
import {
  Table,
  Plus,
  Star,
  Trash2,
  Search,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
} from 'lucide-react';

export default function SheetsPage() {
  const router = useRouter();
  const { sheets, createDocument, toggleStar, deleteDocument } = useWorkspaceStore();
  const [search, setSearch] = useState('');

  const activeSheets = normalizeWorkspaceItems(sheets, 'sheet').filter((s) => {
    if (s.trashed) return false;
    if (search && !matchesSearchQuery(s, search)) return false;
    return true;
  });

  const templates = [
    { title: 'SaaS ARR & Financial Model', desc: 'Pre-configured revenue & margin matrix' },
    { title: 'Engineering Sprint Tracker', desc: 'Velocity, bug burndown & estimates' },
    { title: 'Operational Budget Forecast', desc: 'Departmental payroll and OpEx allocation' },
  ];

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Spreadsheet Workspace</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Dynamic cell calculations, auto-evaluating formulas, and multi-sheet tabs.
          </p>
        </div>

        <button
          onClick={() => {
            const id = createDocument('sheet');
            router.push(`/workspace/${id}`);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>New Spreadsheet</span>
        </button>
      </div>

      {/* Quick Templates */}
      <div>
        <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
          Turnkey Financial &amp; Planning Templates
        </span>
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {templates.map((tpl, idx) => (
            <div
              key={idx}
              onClick={() => {
                const id = createDocument('sheet', tpl.title);
                router.push(`/workspace/${id}`);
              }}
              className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 hover:border-[var(--secondary)] hover:bg-[var(--accent)] cursor-pointer transition-all shadow-2xs group"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-light)] text-[var(--secondary)]">
                  <Table className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--secondary)]">
                    {tpl.title}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">{tpl.desc}</p>
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-[var(--text-muted)] group-hover:text-[var(--secondary)] opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          ))}
        </div>
      </div>

      {/* Sheets List */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
        {activeSheets.map((sheet) => (
          <div
            key={sheet.id}
            className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xs hover:border-[var(--secondary)] transition-all"
          >
            <Link href={`/workspace/${sheet.id}`} className="block">
              <div className="flex items-start justify-between">
                <Table className="h-5 w-5 text-[var(--secondary)]" />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    toggleStar(sheet.id);
                  }}
                  className="p-1 text-[var(--text-muted)] hover:text-amber-500"
                >
                  <Star className={`h-4 w-4 ${sheet.starred ? 'fill-amber-500 text-amber-500' : ''}`} />
                </button>
              </div>

              <h3 className="mt-3 text-xs font-semibold text-[var(--text)] group-hover:text-[var(--secondary)] transition-colors line-clamp-1">
                {sheet.title}
              </h3>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                {sheet.sheets.length} Sheet tab(s) • Formula Engine Ready
              </p>
            </Link>

            <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-3 w-3" />
                {new Date(sheet.updatedAt).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-2">
                <span>{sheet.size || '48 KB'}</span>
                <button
                  onClick={() => deleteDocument(sheet.id)}
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

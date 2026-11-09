'use client';

import React from 'react';
import { useWorkspaceStore } from '@/lib/store';
import {
  Trash2,
  RotateCcw,
  AlertTriangle,
  FileText,
  Table,
  Presentation,
  FileCheck,
} from 'lucide-react';

export default function TrashPage() {
  const {
    documents,
    sheets,
    slides,
    pdfs,
    restoreDocument,
    deleteDocument,
  } = useWorkspaceStore();

  const trashedItems = [
    ...documents.filter((d) => d.trashed),
    ...sheets.filter((s) => s.trashed),
    ...slides.filter((sl) => sl.trashed),
    ...pdfs.filter((p) => p.trashed),
  ];

  const handleEmptyTrash = () => {
    if (confirm('Permanently delete all items in trash? This cannot be undone.')) {
      trashedItems.forEach((item) => deleteDocument(item.id, true));
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'doc':
        return <FileText className="h-4 w-4 text-[var(--primary)]" />;
      case 'sheet':
        return <Table className="h-4 w-4 text-[var(--secondary)]" />;
      case 'slide':
        return <Presentation className="h-4 w-4 text-amber-600" />;
      case 'pdf':
        return <FileCheck className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-[var(--primary)]" />;
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">Trash &amp; Archive</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Items in trash will be permanently purged after 30 days. You can restore or wipe them at any time.
          </p>
        </div>

        {trashedItems.length > 0 && (
          <button
            onClick={handleEmptyTrash}
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-400 transition-colors shrink-0"
          >
            <Trash2 className="h-4 w-4" />
            <span>Empty Trash</span>
          </button>
        )}
      </div>

      {trashedItems.length === 0 ? (
        <div className="py-20 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border)] rounded-xl">
          <Trash2 className="h-8 w-8 mx-auto text-[var(--text-muted)] opacity-40 mb-2" />
          <p className="font-medium">Trash is empty</p>
          <p className="text-[11px] mt-0.5">Deleted documents, spreadsheets, and slide decks will appear here.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--accent)] text-[var(--text-muted)]">
                <th className="py-2.5 px-4 font-semibold">Item Title</th>
                <th className="py-2.5 px-4 font-semibold">Type</th>
                <th className="py-2.5 px-4 font-semibold">Date Deleted</th>
                <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {trashedItems.map((item) => (
                <tr key={item.id} className="hover:bg-[var(--accent)] transition-colors">
                  <td className="py-3 px-4 font-medium text-[var(--text)]">
                    <div className="flex items-center gap-2.5">
                      {getIcon(item.type)}
                      <span className="truncate max-w-sm">{item.title}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-[var(--text-muted)] uppercase text-[10px] font-mono">
                    {item.type}
                  </td>
                  <td className="py-3 px-4 text-[var(--text-muted)] font-mono text-[11px]">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => restoreDocument(item.id)}
                        className="flex items-center gap-1 rounded bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--accent)]"
                        title="Restore item"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Restore</span>
                      </button>
                      <button
                        onClick={() => deleteDocument(item.id, true)}
                        className="flex items-center gap-1 rounded bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900/40 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
                        title="Delete permanently"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

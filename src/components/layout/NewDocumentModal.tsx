'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import {
  FileText,
  Table,
  Presentation,
  FileCheck,
  FolderKanban,
  X,
  Sparkles,
  Plus,
} from 'lucide-react';

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewDocumentModal({ isOpen, onClose }: NewDocumentModalProps) {
  const router = useRouter();
  const createDocument = useWorkspaceStore((state) => state.createDocument);
  const [selectedType, setSelectedType] = useState<'doc' | 'sheet' | 'slide' | 'pdf' | 'project'>('doc');
  const [title, setTitle] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  const handleCreate = () => {
    let initialContent = '';
    if (aiPrompt.trim()) {
      setIsGenerating(true);
      setTimeout(() => {
        initialContent = `
          <h1>${title || 'AI Generated Document'}</h1>
          <p><em>Generated from prompt: "${aiPrompt}"</em></p>
          <h2>1. Overview & Context</h2>
          <p>This document was synthetically outlined using Docium's integrated AI engine to fast-track your ideation.</p>
          <h2>2. Strategic Breakdown</h2>
          <ul>
            <li>Detailed objective alignment</li>
            <li>Operational milestones and deliverables</li>
            <li>Resource requirements and risk mitigation</li>
          </ul>
        `;
        const id = createDocument(selectedType, title || undefined, initialContent);
        setIsGenerating(false);
        onClose();
        navigateToType(selectedType, id);
      }, 600);
      return;
    }

    const id = createDocument(selectedType, title || undefined);
    onClose();
    navigateToType(selectedType, id);
  };

  const navigateToType = (_type: string, id: string) => {
    router.push(`/workspace/${id}`);
  };

  const types = [
    { id: 'doc' as const, label: 'Document', icon: FileText, desc: 'Rich A4 pages, formatting, prose & tables' },
    { id: 'sheet' as const, label: 'Spreadsheet', icon: Table, desc: 'Formulas, grid calculations & models' },
    { id: 'slide' as const, label: 'Presentation', icon: Presentation, desc: 'High-conviction slide decks' },
    { id: 'pdf' as const, label: 'PDF Workspace', icon: FileCheck, desc: 'Annotate, sign & inspect contracts' },
    { id: 'project' as const, label: 'Project Hub', icon: FolderKanban, desc: 'Task boards & document milestones' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text)]">Create New Item</h2>
            <p className="text-xs text-[var(--text-muted)]">Select an artifact format or generate with AI</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {types.map((t) => {
            const Icon = t.icon;
            const isSelected = selectedType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedType(t.id)}
                className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                  isSelected
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] shadow-xs'
                    : 'border-[var(--border)] hover:border-[var(--text-muted)] hover:bg-[var(--accent)] text-[var(--text)]'
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
                <span className="text-xs font-semibold">{t.label}</span>
                <span className="text-[10px] text-[var(--text-muted)] line-clamp-2 mt-0.5">{t.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-[var(--text-muted)]">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q4 Executive Strategy Spec"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]"
            />
          </div>

          <div>
            <label className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[var(--secondary)]" />
                Seed with AI prompt (optional)
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">Instant synthesis</span>
            </label>
            <textarea
              rows={2}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. Draft an enterprise API pricing proposal with tiers and enterprise SLA..."
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[var(--border)]">
          <button
            onClick={onClose}
            className="rounded-md px-3.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isGenerating}
            className="flex items-center gap-1.5 rounded-md bg-[var(--primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--primary-hover)] transition-colors shadow-xs disabled:opacity-50"
          >
            {isGenerating ? (
              <>
                <Sparkles className="h-3.5 w-3.5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" />
                Create {selectedType.toUpperCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

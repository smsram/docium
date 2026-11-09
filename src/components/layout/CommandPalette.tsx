'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import {
  Search,
  FileText,
  Table,
  Presentation,
  FileCheck,
  FolderKanban,
  Sparkles,
  Settings,
  Moon,
  Sun,
  Plus,
  ArrowRight,
  X,
} from 'lucide-react';

export function CommandPalette() {
  const router = useRouter();
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    documents,
    sheets,
    slides,
    pdfs,
    projects,
    theme,
    setTheme,
    createDocument,
  } = useWorkspaceStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  // Combine items
  const allItems = useMemo(() => {
    const list: {
      id: string;
      title: string;
      subtitle: string;
      category: 'Recent Files' | 'Actions' | 'Navigation';
      icon: any;
      action: () => void;
    }[] = [];

    // Quick Actions
    list.push(
      {
        id: 'act-new-ai',
        title: 'New AI Creation',
        subtitle: 'Synthesize documents, spreadsheets or slides with AI',
        category: 'Actions',
        icon: Sparkles,
        action: () => router.push('/'),
      },
      {
        id: 'act-new-doc',
        title: 'New Document',
        subtitle: 'Create a rich A4 document',
        category: 'Actions',
        icon: Plus,
        action: () => {
          const id = createDocument('doc');
          router.push(`/workspace/${id}`);
        },
      },
      {
        id: 'act-new-sheet',
        title: 'New Spreadsheet',
        subtitle: 'Create a financial or data sheet',
        category: 'Actions',
        icon: Table,
        action: () => {
          const id = createDocument('sheet');
          router.push(`/workspace/${id}`);
        },
      },
      {
        id: 'act-new-slide',
        title: 'New Presentation',
        subtitle: 'Create a slide deck',
        category: 'Actions',
        icon: Presentation,
        action: () => {
          const id = createDocument('slide');
          router.push(`/workspace/${id}`);
        },
      },
      {
        id: 'act-toggle-theme',
        title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        subtitle: 'Toggle workspace theme appearance',
        category: 'Actions',
        icon: theme === 'dark' ? Sun : Moon,
        action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      }
    );

    // Recent Files
    documents.filter((d) => !d.trashed).slice(0, 5).forEach((d) => {
      list.push({
        id: `doc-${d.id}`,
        title: d.title,
        subtitle: `Document • Updated ${new Date(d.updatedAt).toLocaleDateString()}`,
        category: 'Recent Files',
        icon: FileText,
        action: () => router.push(`/workspace/${d.id}`),
      });
    });

    sheets.filter((s) => !s.trashed).slice(0, 3).forEach((s) => {
      list.push({
        id: `sheet-${s.id}`,
        title: s.title,
        subtitle: 'Spreadsheet',
        category: 'Recent Files',
        icon: Table,
        action: () => router.push(`/workspace/${s.id}`),
      });
    });

    slides.filter((sl) => !sl.trashed).slice(0, 3).forEach((sl) => {
      list.push({
        id: `slide-${sl.id}`,
        title: sl.title,
        subtitle: 'Presentation',
        category: 'Recent Files',
        icon: Presentation,
        action: () => router.push(`/workspace/${sl.id}`),
      });
    });

    // Navigation
    list.push(
      {
        id: 'nav-home',
        title: 'New Item (Home)',
        subtitle: 'AI prompt creation interface',
        category: 'Navigation',
        icon: Sparkles,
        action: () => router.push('/'),
      },
      {
        id: 'nav-files',
        title: 'Library',
        subtitle: 'Browse all documents, spreadsheets and presentations',
        category: 'Navigation',
        icon: FileText,
        action: () => router.push('/files'),
      },
      {
        id: 'nav-chat',
        title: 'AI Chat',
        subtitle: 'Workspace conversational intelligence',
        category: 'Navigation',
        icon: Sparkles,
        action: () => router.push('/chat'),
      },
      {
        id: 'nav-templates',
        title: 'Template Gallery',
        subtitle: 'Ready-to-use documents and spreadsheets',
        category: 'Navigation',
        icon: Sparkles,
        action: () => router.push('/templates'),
      },
      {
        id: 'nav-settings',
        title: 'Settings',
        subtitle: 'AI provider keys and application preferences',
        category: 'Navigation',
        icon: Settings,
        action: () => router.push('/settings/ai'),
      }
    );

    return list;
  }, [documents, sheets, slides, pdfs, projects, theme, createDocument, router, setTheme]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter(
      (item) => (item.title || '').toLowerCase().includes(q) || (item.subtitle || '').toLowerCase().includes(q)
    );
  }, [allItems, query]);

  const handleSelect = (item: (typeof allItems)[0]) => {
    item.action();
    setCommandPaletteOpen(false);
    setQuery('');
  };

  if (!commandPaletteOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs pt-[14vh] p-4">
      <div className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        <div className="flex items-center px-4 py-3 border-b border-[var(--border)]">
          <Search className="h-4 w-4 text-[var(--text-muted)] mr-2 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search documents, commands, or jump to..."
            className="w-full bg-transparent text-sm text-[var(--text)] placeholder-[var(--text-muted)] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] border border-[var(--border)]">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-[var(--text-muted)]">
              No matching files or commands found.
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                    isSelected ? 'bg-[var(--accent)] text-[var(--text)]' : 'text-[var(--text)] hover:bg-[var(--accent)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--primary)]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate text-[var(--text)]">{item.title}</div>
                      <div className="text-[10px] text-[var(--text-muted)] truncate">{item.subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[var(--text-muted)]">
                    <span>{item.category}</span>
                    <ArrowRight className="h-3 w-3 opacity-60" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-3 py-2 bg-[var(--accent)] border-t border-[var(--border)] text-[10px] text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
          </div>
          <span>Docium Fast Search</span>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { type Editor } from '@tiptap/react';
import { AlignLeft, Hash, X, Search } from 'lucide-react';

interface DocumentOutlineProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

interface OutlineHeading {
  id: string;
  text: string;
  level: number;
  pos: number;
}

export function DocumentOutline({ editor, isOpen, onClose }: DocumentOutlineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activePos, setActivePos] = useState<number | null>(null);

  // Extract headings whenever editor content changes
  const headings: OutlineHeading[] = useMemo(() => {
    if (!editor) return [];
    const list: OutlineHeading[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') {
        const text = node.textContent.trim();
        if (text) {
          list.push({
            id: `h-${pos}`,
            text,
            level: node.attrs.level || 1,
            pos,
          });
        }
      }
    });
    return list;
  }, [editor, editor?.state.doc]);

  // Track cursor position to highlight active heading
  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      const from = editor.state.selection.from;
      // Find the heading that immediately precedes or contains current selection
      let currentHeading: OutlineHeading | null = null;
      for (const h of headings) {
        if (h.pos <= from) {
          currentHeading = h;
        } else {
          break;
        }
      }
      if (currentHeading) {
        setActivePos(currentHeading.pos);
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, headings]);

  if (!isOpen) return null;

  const filteredHeadings = headings.filter((h) =>
    h.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const scrollToHeading = (pos: number) => {
    if (!editor) return;
    editor.commands.setTextSelection(pos);
    setActivePos(pos);
    const domNode = editor.view.nodeDOM(pos) as HTMLElement;
    if (domNode && domNode.scrollIntoView) {
      domNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-xs z-30 md:hidden animate-in fade-in duration-150"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="fixed inset-y-0 left-0 z-40 md:static md:z-10 w-64 border-r border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 text-xs shadow-xl md:shadow-xs select-none animate-in slide-in-from-left duration-150">
        {/* Title & Close */}
        <div className="flex h-11 items-center justify-between px-3 border-b border-[var(--border)] bg-[var(--surface-elevated)] shrink-0">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--text)]">
            <AlignLeft className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Outline</span>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors cursor-pointer"
            title="Close Outline"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search in outline */}
        <div className="p-2 border-b border-[var(--border-subtle)] bg-[var(--surface)] shrink-0">
          <div className="flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs">
            <Search className="h-3 w-3 text-[var(--text-muted)] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search outline..."
              className="w-full bg-transparent text-[11px] outline-none text-[var(--text)] placeholder:text-[var(--text-muted)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Headings list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredHeadings.length === 0 ? (
            <div className="py-8 text-center text-[var(--text-muted)] text-[11px] px-3 leading-relaxed">
              {searchQuery
                ? 'No matching sections found.'
                : 'No headings yet. Apply Heading 1, 2, or 3 in the document to generate an outline.'}
            </div>
          ) : (
            filteredHeadings.map((h) => {
              const isActive = activePos === h.pos;
              const indentClass = {
                1: 'pl-2 font-semibold text-[var(--text)]',
                2: 'pl-4 text-[var(--text)] font-medium',
                3: 'pl-6 text-[var(--text-muted)]',
                4: 'pl-8 text-[var(--text-muted)]',
              }[h.level] || 'pl-2';

              return (
                <button
                  key={h.id}
                  onClick={() => scrollToHeading(h.pos)}
                  className={`w-full flex items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs transition-colors cursor-pointer ${indentClass} ${
                    isActive
                      ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                      : 'hover:bg-[var(--accent)] hover:text-[var(--text)]'
                  }`}
                >
                  <Hash className="h-3 w-3 shrink-0 opacity-40" />
                  <span className="truncate">{h.text}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-2 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[10px] text-[var(--text-muted)] text-center shrink-0">
          {headings.length} {headings.length === 1 ? 'heading' : 'headings'} detected
        </div>
      </aside>
    </>
  );
}

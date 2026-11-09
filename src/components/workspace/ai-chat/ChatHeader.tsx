'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { AiAvatar } from './AiAvatar';
import {
  ChevronDown,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  FileText,
  Minus,
  Paperclip,
} from 'lucide-react';
import { WorkspaceConversation } from '@/lib/types';

interface ChatHeaderProps {
  currentConversation: WorkspaceConversation;
  workspaceConversations: WorkspaceConversation[];
  onSelectConversation: (conversationId: string) => void;
  onCreateNewConversation: () => void;
  onRenameConversation: (conversationId: string, newTitle: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  attachedSourcesCount: number;
  sourcesOpen: boolean;
  onToggleSources: () => void;
  onMinimize: () => void;
}

export function ChatHeader({
  currentConversation,
  workspaceConversations,
  onSelectConversation,
  onCreateNewConversation,
  onRenameConversation,
  onDeleteConversation,
  attachedSourcesCount,
  sourcesOpen,
  onToggleSources,
  onMinimize,
}: ChatHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setEditingId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  const handleStartRename = (conv: WorkspaceConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const handleCommitRename = (convId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingTitle.trim()) {
      onRenameConversation(convId, editingTitle.trim());
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-12 items-center justify-between border-b border-[var(--border)] px-3.5 bg-[var(--surface)] shrink-0 select-none">
      {/* Left: Brand & Conversation Selector */}
      <div className="relative flex items-center gap-2 min-w-0" ref={dropdownRef}>
        <AiAvatar size="sm" />

        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--accent)] transition-colors max-w-[200px] sm:max-w-[260px] truncate cursor-pointer"
          title="Switch conversation"
        >
          <span className="truncate">{currentConversation?.title || 'Docium AI'}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-[var(--text-muted)] shrink-0 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu (Strictly scoped to current workspace) */}
        {dropdownOpen && (
          <div className="absolute top-full left-0 mt-1.5 z-50 w-72 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 text-xs">
            {/* New Chat Action */}
            <button
              type="button"
              onClick={() => {
                onCreateNewConversation();
                setDropdownOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-medium text-[var(--primary)] hover:bg-[var(--primary-light)]/40 transition-colors cursor-pointer mb-1 border-b border-[var(--border-subtle)] pb-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>

            {/* Conversation List */}
            <div className="max-h-56 overflow-y-auto space-y-0.5">
              {workspaceConversations.map((conv) => {
                const isActive = conv.id === currentConversation?.id;
                const isEditing = editingId === conv.id;

                if (isEditing) {
                  return (
                    <form
                      key={conv.id}
                      onSubmit={(e) => handleCommitRename(conv.id, e)}
                      className="flex items-center gap-1 px-2 py-1 bg-[var(--surface-elevated)] rounded-lg"
                    >
                      <input
                        type="text"
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="w-full bg-transparent text-xs text-[var(--text)] outline-none"
                      />
                      <button
                        type="submit"
                        className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10"
                        title="Save"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="p-1 rounded text-[var(--text-muted)] hover:bg-[var(--accent)]"
                        title="Cancel"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </form>
                  );
                }

                return (
                  <div
                    key={conv.id}
                    onClick={() => {
                      onSelectConversation(conv.id);
                      setDropdownOpen(false);
                    }}
                    className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                        : 'text-[var(--text)] hover:bg-[var(--accent)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{conv.title}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(conv, e)}
                        className="p-1 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                        title="Rename"
                      >
                        <Edit2 className="h-2.5 w-2.5" />
                      </button>
                      {workspaceConversations.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete conversation "${conv.title}"?`)) {
                              onDeleteConversation(conv.id);
                            }
                          }}
                          className="p-1 rounded hover:bg-[var(--surface)] text-rose-500 hover:text-rose-600"
                          title="Delete"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right: Sources button immediately beside Minimize */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleSources}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
            sourcesOpen
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
          title="View conversation sources"
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>Sources</span>
          {attachedSourcesCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                sourcesOpen ? 'bg-white text-[var(--primary)] font-bold' : 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              }`}
            >
              {attachedSourcesCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onMinimize}
          className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
          title="Minimize AI panel"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}


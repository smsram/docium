'use client';

import React from 'react';
import { type Editor } from '@tiptap/react';
import {
  MessageSquarePlus,
  MessageSquare,
  BarChart3,
  SpellCheck,
  Edit3,
  GitPullRequest,
  CheckCheck,
  XCircle,
} from 'lucide-react';

interface ReviewTabProps {
  editor: Editor | null;
  commentsCount: number;
  unresolvedCount: number;
  commentsSidebarOpen: boolean;
  onToggleCommentsSidebar: () => void;
  onAddCommentFromSelection: () => void;
  onOpenStatsModal: () => void;
  suggestingMode: boolean;
  onToggleSuggestingMode: () => void;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: () => void;
}

export function ReviewTab({
  editor,
  commentsCount: _commentsCount,
  unresolvedCount,
  commentsSidebarOpen,
  onToggleCommentsSidebar,
  onAddCommentFromSelection,
  onOpenStatsModal,
  suggestingMode,
  onToggleSuggestingMode,
  spellCheckEnabled,
  onToggleSpellCheck,
}: ReviewTabProps) {
  if (!editor) return null;

  const handleAcceptAll = () => {
    // Clean up suggestion highlights to permanent content
    editor.chain().focus().unsetHighlight().run();
    alert('All suggestions accepted into document.');
  };

  const handleRejectAll = () => {
    // If text was selected, remove it; otherwise notify user
    const { from, to } = editor.state.selection;
    if (from !== to) {
      editor.chain().focus().deleteSelection().run();
    } else {
      alert('Select suggestion text to reject.');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-1.5 text-xs text-[var(--text)] select-none">
      {/* 1. Comments Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={onAddCommentFromSelection}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium text-[var(--primary)]"
          title="Add Comment on active selection"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span>New Comment</span>
        </button>

        <button
          type="button"
          onClick={onToggleCommentsSidebar}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            commentsSidebarOpen
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title="Toggle Comments Panel"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Comments</span>
          {unresolvedCount > 0 && (
            <span
              className={`rounded-full px-1.5 py-0.2 font-mono text-[10px] ${
                commentsSidebarOpen ? 'bg-white text-[var(--primary)]' : 'bg-amber-500 text-white'
              }`}
            >
              {unresolvedCount}
            </span>
          )}
        </button>
      </div>

      {/* 2. Tracking / Mode Group */}
      <div className="flex items-center gap-1 pr-2 border-r border-[var(--border)]">
        <button
          type="button"
          onClick={onToggleSuggestingMode}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            suggestingMode
              ? 'bg-amber-500 text-white shadow-2xs'
              : 'hover:bg-[var(--accent)] text-[var(--text)]'
          }`}
          title={suggestingMode ? 'Suggesting Mode is Active' : 'Switch to Suggesting Mode'}
        >
          {suggestingMode ? <GitPullRequest className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
          <span>{suggestingMode ? 'Suggesting' : 'Editing Mode'}</span>
        </button>

        {suggestingMode && (
          <div className="flex items-center gap-0.5 animate-in fade-in">
            <button
              type="button"
              onClick={handleAcceptAll}
              className="flex h-7 items-center gap-1 rounded px-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 font-medium"
              title="Accept Changes"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Accept</span>
            </button>
            <button
              type="button"
              onClick={handleRejectAll}
              className="flex h-7 items-center gap-1 rounded px-2 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 font-medium"
              title="Reject Changes"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>Reject</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Proofing & Statistics */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenStatsModal}
          className="flex h-7 items-center gap-1.5 rounded px-2 hover:bg-[var(--accent)] font-medium"
          title="View Word Count and Document Statistics"
        >
          <BarChart3 className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Word Count & Stats</span>
        </button>

        <button
          type="button"
          onClick={onToggleSpellCheck}
          className={`flex h-7 items-center gap-1.5 rounded px-2 font-medium transition-colors ${
            spellCheckEnabled
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'hover:bg-[var(--accent)] text-[var(--text-muted)]'
          }`}
          title="Toggle browser spellcheck"
        >
          <SpellCheck className="h-3.5 w-3.5" />
          <span>Spell Check {spellCheckEnabled ? 'On' : 'Off'}</span>
        </button>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import {
  MessageSquare,
  X,
  CheckCircle2,
  Trash2,
  CornerDownRight,
  Send,
} from 'lucide-react';
import { DocumentComment } from '@/lib/types';

interface CommentsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  comments: DocumentComment[];
  currentSelectionText?: string;
  onAddComment: (text: string, selectionText?: string) => void;
  onResolveComment: (commentId: string) => void;
  onDeleteComment: (commentId: string) => void;
  onAddReply: (commentId: string, replyText: string) => void;
  onFocusSelection?: (comment: DocumentComment) => void;
}

export function CommentsSidebar({
  isOpen,
  onClose,
  comments,
  currentSelectionText,
  onAddComment,
  onResolveComment,
  onDeleteComment,
  onAddReply,
  onFocusSelection,
}: CommentsSidebarProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');
  const [newCommentText, setNewCommentText] = useState('');
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const filteredComments = comments.filter((c) => {
    if (filter === 'open') return !c.resolved;
    if (filter === 'resolved') return c.resolved;
    return true;
  });

  const handleCreateComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    onAddComment(newCommentText.trim(), currentSelectionText || undefined);
    setNewCommentText('');
  };

  const handleSendReply = (commentId: string) => {
    const text = replyInputs[commentId];
    if (!text || !text.trim()) return;
    onAddReply(commentId, text.trim());
    setReplyInputs((prev) => ({ ...prev, [commentId]: '' }));
  };

  return (
    <aside className="w-80 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col shrink-0 text-xs shadow-lg z-20">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--surface-elevated)] shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="font-semibold text-xs text-[var(--text)]">Comments ({comments.length})</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-[10px]">
            <button
              type="button"
              onClick={() => setFilter('open')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filter === 'open'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setFilter('resolved')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filter === 'resolved'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Resolved
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-[var(--primary)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              All
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] ml-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* New comment composer box */}
      <div className="p-3 border-b border-[var(--border)] bg-[var(--surface-elevated)] shrink-0">
        <form onSubmit={handleCreateComment} className="space-y-2">
          {currentSelectionText && (
            <div className="p-2 rounded border-l-2 border-[var(--primary)] bg-[var(--primary-light)]/50 text-[11px] text-[var(--text)] italic line-clamp-2">
              &ldquo;{currentSelectionText}&rdquo;
            </div>
          )}
          <div className="relative">
            <textarea
              rows={2}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder={
                currentSelectionText
                  ? 'Comment on selected text...'
                  : 'Add a document comment...'
              }
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)] resize-none"
            />
            <button
              type="submit"
              disabled={!newCommentText.trim()}
              className="absolute right-2 bottom-2.5 rounded-md bg-[var(--primary)] p-1 text-white disabled:opacity-30 hover:bg-[var(--primary-hover)] transition-colors"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </form>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredComments.length === 0 ? (
          <div className="py-12 text-center text-[var(--text-muted)] text-[11px] px-4 leading-relaxed">
            {filter === 'open'
              ? 'No open comments. Select any text in the editor to leave a comment!'
              : 'No comments found in this view.'}
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div
              key={comment.id}
              onClick={() => onFocusSelection && onFocusSelection(comment)}
              className={`rounded-xl border p-3 text-xs transition-all ${
                comment.resolved
                  ? 'border-[var(--border)] bg-[var(--surface-elevated)] opacity-60'
                  : 'border-[var(--border)] bg-[var(--surface)] shadow-2xs hover:border-[var(--primary)]'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-[var(--primary)] text-white font-bold flex items-center justify-center text-[10px]">
                    {comment.author ? comment.author.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <span className="font-semibold text-[11px] text-[var(--text)]">{comment.author}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResolveComment(comment.id);
                    }}
                    className={`rounded p-1 transition-colors ${
                      comment.resolved
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-[var(--text-muted)] hover:text-emerald-600 hover:bg-emerald-50'
                    }`}
                    title={comment.resolved ? 'Reopen comment' : 'Mark as resolved'}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteComment(comment.id);
                    }}
                    className="rounded p-1 text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    title="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Quoted selection if available */}
              {comment.selectionText && (
                <div className="border-l-2 border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 px-2 py-1 my-1.5 text-[10px] text-[var(--text-muted)] italic rounded-r truncate">
                  &ldquo;{comment.selectionText}&rdquo;
                </div>
              )}

              {/* Comment text */}
              <p className="text-[var(--text)] my-1 leading-relaxed whitespace-pre-wrap">{comment.text}</p>
              <span className="text-[9px] text-[var(--text-muted)] block mb-2">
                {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="mt-2 pl-3 border-l border-[var(--border)] space-y-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="text-[11px] bg-[var(--surface-elevated)] p-2 rounded-lg">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-medium text-[var(--text)]">{reply.author}</span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[var(--text)]">{reply.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {!comment.resolved && (
                <div className="mt-2.5 flex items-center gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  <input
                    type="text"
                    value={replyInputs[comment.id] || ''}
                    onChange={(e) =>
                      setReplyInputs((prev) => ({ ...prev, [comment.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendReply(comment.id);
                      }
                    }}
                    placeholder="Reply..."
                    className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[11px] outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => handleSendReply(comment.id)}
                    className="rounded-md bg-[var(--surface-elevated)] hover:bg-[var(--accent)] border border-[var(--border)] p-1 text-[var(--text)]"
                  >
                    <CornerDownRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}


'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { AiChatMessage } from '@/lib/types';
import {
  Sparkles,
  Send,
  X,
  Paperclip,
  Plus,
  Trash2,
  RefreshCw,
} from 'lucide-react';

interface WorkspaceAiSidecarProps {
  itemId: string;
  itemType: 'doc' | 'sheet' | 'slide' | 'pdf';
  isOpen: boolean;
  onClose: () => void;
  onApplyAction?: (actionType: string, payload: string) => void;
}

export function WorkspaceAiSidecar({
  itemId,
  itemType,
  isOpen,
  onClose,
  onApplyAction,
}: WorkspaceAiSidecarProps) {
  const {
    getItemMessages,
    addItemMessage,
    clearItemMessages,
    getItemSources,
    addItemSource,
    removeItemSource,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showSourceInput, setShowSourceInput] = useState(false);
  const [newSourceTitle, setNewSourceTitle] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = getItemMessages(itemId);
  const sources = getItemSources(itemId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages.length, isOpen]);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;

    const userText = input.trim();
    setInput('');

    // Add user message to this item's conversation
    addItemMessage(itemId, {
      role: 'user',
      content: userText,
    });

    setIsTyping(true);

    // Simulate intelligent contextual response
    setTimeout(() => {
      let assistantReply = '';
      let suggestedAction: AiChatMessage['suggestedAction'] = undefined;

      const lower = userText.toLowerCase();

      if (itemType === 'doc') {
        if (lower.includes('benchmark') || lower.includes('performance') || lower.includes('table')) {
          assistantReply = `I've analyzed your document and synthesized a high-throughput performance benchmark table comparing Docium against legacy architectures.`;
          suggestedAction = {
            label: 'Insert Performance Benchmark Table',
            type: 'insert_doc',
            payload: `<h3>Performance Benchmarks</h3><table><thead><tr><th>Metric</th><th>Target</th><th>Actual</th></tr></thead><tbody><tr><td>P99 Keystroke Latency</td><td>&lt; 10ms</td><td>4.2ms</td></tr><tr><td>Cold Startup Time</td><td>&lt; 500ms</td><td>280ms</td></tr><tr><td>Memory Footprint</td><td>&lt; 80MB</td><td>46MB</td></tr></tbody></table>`,
          };
        } else if (lower.includes('risk') || lower.includes('security')) {
          assistantReply = `I've prepared a comprehensive risk mitigation and access control specification section for this document.`;
          suggestedAction = {
            label: 'Insert Security & Risk Section',
            type: 'insert_doc',
            payload: `<h2>Security &amp; Compliance Protocols</h2><p>Data stored in this workspace uses client-side encryption with zero third-party telemetry. All outbound AI inferences communicate directly over TLS 1.3 with validated endpoint certificates.</p>`,
          };
        } else {
          assistantReply = `I've reviewed your request: "${userText}". Based on the document context and attached sources, I've drafted an expansion with actionable points.`;
          suggestedAction = {
            label: 'Insert Generated Content',
            type: 'insert_doc',
            payload: `<h3>Key Insights on "${userText.slice(0, 30)}..."</h3><p>Integrating these considerations ensures alignment across engineering and operational roadmaps with verifiable milestones.</p>`,
          };
        }
      } else if (itemType === 'sheet') {
        assistantReply = `I've formulated the required calculations for your spreadsheet model. You can apply the formula changes directly to active rows.`;
        suggestedAction = {
          label: 'Apply Formula Calculation',
          type: 'create_table',
          payload: 'calculate_growth',
        };
      } else {
        assistantReply = `I've synthesized a new presentation slide covering these points with structured bullets and emphasis points.`;
        suggestedAction = {
          label: 'Add Slide to Deck',
          type: 'create_chart',
          payload: userText,
        };
      }

      addItemMessage(itemId, {
        role: 'assistant',
        content: assistantReply,
        suggestedAction,
      });

      setIsTyping(false);
    }, 850);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAddSource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourceTitle.trim()) return;

    addItemSource(itemId, {
      title: newSourceTitle.trim(),
      type: newSourceTitle.startsWith('http') ? 'url' : 'note',
      snippet: 'Source context attached to this workspace.',
      status: 'indexed',
      tags: ['Workspace'],
    });

    setNewSourceTitle('');
    setShowSourceInput(false);
  };

  if (!isOpen) return null;

  return (
    <aside className="w-80 sm:w-96 border-l border-[var(--border)] bg-[var(--surface)] flex flex-col h-full shrink-0 z-20 shadow-lg animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex h-12 items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--primary-light)] text-[var(--primary)]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[var(--text)]">AI Assistant</h3>
            <span className="text-[10px] text-[var(--text-muted)] font-mono leading-none">
              Project Context
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => clearItemMessages(itemId)}
            className="p-1 text-[var(--text-muted)] hover:text-rose-500 rounded hover:bg-[var(--accent)] transition-colors"
            title="Clear this project's chat history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] rounded hover:bg-[var(--accent)] transition-colors"
            title="Close Assistant Panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Sources Bar */}
      <div className="px-3.5 py-2 border-b border-[var(--border)] bg-[var(--background)]">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="font-semibold text-[var(--text-muted)] uppercase tracking-wider text-[10px]">
            Attached Sources ({sources.length})
          </span>
          <button
            onClick={() => setShowSourceInput(!showSourceInput)}
            className="text-[var(--primary)] hover:underline inline-flex items-center gap-1 font-medium"
          >
            <Plus className="h-3 w-3" />
            <span>Add source</span>
          </button>
        </div>

        {showSourceInput && (
          <form onSubmit={handleAddSource} className="flex items-center gap-1.5 mb-2">
            <input
              type="text"
              value={newSourceTitle}
              onChange={(e) => setNewSourceTitle(e.target.value)}
              placeholder="URL or document title..."
              className="flex-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
              autoFocus
            />
            <button
              type="submit"
              className="rounded bg-[var(--primary)] text-white px-2 py-1 text-xs font-medium hover:bg-[var(--primary-hover)]"
            >
              Add
            </button>
          </form>
        )}

        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
          {sources.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text)]"
            >
              <Paperclip className="h-2.5 w-2.5 text-[var(--text-muted)]" />
              <span className="truncate max-w-[120px]">{s.title}</span>
              <button
                type="button"
                onClick={() => removeItemSource(itemId, s.id)}
                className="text-[var(--text-muted)] hover:text-rose-500"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {sources.length === 0 && (
            <span className="text-[10px] text-[var(--text-muted)] italic">
              No sources attached. Add a file or URL to ground the AI.
            </span>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
            >
              <div
                className={`rounded-xl px-3.5 py-2.5 text-xs max-w-[92%] leading-relaxed ${
                  isUser
                    ? 'bg-[var(--primary)] text-white font-medium rounded-br-xs'
                    : 'bg-[var(--background)] text-[var(--text)] border border-[var(--border)] rounded-bl-xs'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>

                {/* Suggested Action Pill */}
                {msg.suggestedAction && onApplyAction && (
                  <div className="mt-2.5 pt-2 border-t border-[var(--border)]">
                    <button
                      onClick={() => onApplyAction(msg.suggestedAction!.type, msg.suggestedAction!.payload)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary-light)] text-[var(--primary)] px-2.5 py-1 text-[11px] font-semibold hover:bg-[var(--accent)] transition-colors shadow-2xs"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{msg.suggestedAction.label}</span>
                    </button>
                  </div>
                )}
              </div>

              <span className="text-[10px] text-[var(--text-muted)] font-mono px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] p-2">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
            <span>AI is synthesizing response...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer Input */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--surface)] space-y-2">
        <div className="relative rounded-xl border border-[var(--border)] bg-[var(--input-bg)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/20 transition-all p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask AI about this ${itemType}... (Enter to send)`}
            rows={2}
            className="w-full resize-none bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none leading-relaxed"
          />

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-[var(--text-muted)]">
              Shift + Enter for new line
            </span>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="Send message"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}


/**
 * DOCIUM Chat Message List
 * High-performance, isolated message list supporting live Markdown streaming,
 * activity timelines, inline charts/images, citations, and smooth follow-scrolling.
 * 
 * Performance Architecture:
 * 1. Historical messages are isolated in a memoized `<HistoricalMessageList>` that
 *    NEVER re-renders as new tokens stream into the active assistant message.
 * 2. Active streaming message is isolated in `<ActiveStreamingMessageItem>` which
 *    subscribes directly to `useStreamingSession(conversationId)`.
 * 3. Passive IntersectionObserver scroll tracking eliminates layout reflows (getClientRects/scrollHeight).
 * 4. User scroll position is strictly preserved when reading previous messages.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Globe,
  FileText,
  Link2,
  Image as ImageIcon,
  AlertCircle,
  ArrowDown,
  Pencil,
  ChevronDown,
  ChevronUp,
  ListChecks,
  X,
} from 'lucide-react';
import { AiChatMessage, AgentActivityEvent, StructuredContentBlock } from '@/lib/types';
import { ActivityTimeline } from './ActivityTimeline';
import { InlineChart } from './InlineChart';
import { InlineGeneratedImage } from './InlineGeneratedImage';
import { StreamingMarkdown } from './StreamingMarkdown';
import { AiAvatar } from './AiAvatar';
import { useStreamingSession } from '@/lib/ai/streamingSession';
import { chatDiagnostics } from '@/lib/ai/diagnostics';

const USER_MSG_CHAR_LIMIT = 220;
const USER_MSG_LINE_LIMIT = 4;

function formatMessageTimestamp(timestamp?: string, fallbackUnixMs?: number, nowMs: number = Date.now()): string {
  let date: Date | null = null;
  if (timestamp && timestamp !== 'Just now') {
    const parsed = Date.parse(timestamp);
    if (!Number.isNaN(parsed)) {
      date = new Date(parsed);
    }
  }
  if (!date && fallbackUnixMs && fallbackUnixMs > 0) {
    date = new Date(fallbackUnixMs);
  }
  if (!date) {
    return timestamp && timestamp !== 'Just now' ? timestamp : 'Earlier';
  }

  const diffMs = Math.max(0, nowMs - date.getTime());
  if (diffMs < 60_000) {
    return 'Just now';
  }

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const timeStr = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);

  if (startOfMsgDay === startOfToday) {
    return timeStr;
  }
  if (startOfToday - startOfMsgDay === 86_400_000) {
    return `Yesterday, ${timeStr}`;
  }
  const dateStr = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date);
  return `${dateStr}, ${timeStr}`;
}

function formatMessageWithWorkingSteps(msg: AiChatMessage): string {
  const parts: string[] = [];
  if (msg.activityEvents && msg.activityEvents.length > 0) {
    parts.push('## Working Steps');
    for (const evt of msg.activityEvents) {
      parts.push(`- **${evt.label}**`);
      if (evt.updates && evt.updates.length > 0) {
        for (const u of evt.updates) {
          if (u.content?.trim()) {
            parts.push(`  - ${u.content.trim()}`);
          }
        }
      } else if (evt.safeSummary?.trim()) {
        parts.push(`  - ${evt.safeSummary.trim()}`);
      }
    }
    parts.push('');
    parts.push('---');
    parts.push('');
  }
  if (msg.content) {
    parts.push(msg.content);
  }
  return parts.join('\n').trim();
}

export interface ChatMessageListProps {
  messages: AiChatMessage[];
  conversationId?: string;
  isGenerating?: boolean;
  streamingMessageId?: string | null;
  streamingContent?: string;
  streamingActivity?: AgentActivityEvent[];
  streamingBlocks?: StructuredContentBlock[];
  streamingCitations?: Array<{ sourceId: string; sourceTitle: string; page?: number; snippet: string; url?: string }>;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetry?: () => void;
  messagesEndRef?: React.RefObject<HTMLDivElement | null>;
}

interface ChatMessageItemProps {
  msg: AiChatMessage;
  isLast?: boolean;
  isGenerating: boolean;
  isFinalResponseStarted?: boolean;
  isAnyGenerating?: boolean;
  nowMs?: number;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetry?: () => void;
}

/**
 * Isolated, Memoized Message Item for Completed Messages
 */
const ChatMessageItem = memo(
  function ChatMessageItem({
    msg,
    isGenerating,
    isFinalResponseStarted = false,
    isAnyGenerating = false,
    nowMs = Date.now(),
    copiedId,
    onCopy,
    onRegenerate,
    onEditMessage,
    onRetry,
  }: ChatMessageItemProps) {
    chatDiagnostics.recordRender('ChatMessageItem');
    const isUser = msg.role === 'user';
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [draftText, setDraftText] = useState(msg.content);

    const isCollapsible = useMemo(() => {
      if (!isUser || !msg.content) return false;
      const lines = msg.content.split('\n');
      return lines.length > USER_MSG_LINE_LIMIT || msg.content.length > USER_MSG_CHAR_LIMIT;
    }, [isUser, msg.content]);

    const displayedUserContent = useMemo(() => {
      if (!isCollapsible || isExpanded) return msg.content;
      const lines = msg.content.split('\n');
      let clipped = lines.slice(0, USER_MSG_LINE_LIMIT).join('\n');
      if (clipped.length > USER_MSG_CHAR_LIMIT) {
        clipped = clipped.slice(0, USER_MSG_CHAR_LIMIT).trimEnd();
      }
      return `${clipped}…`;
    }, [isCollapsible, isExpanded, msg.content]);

    const handleSaveEdit = () => {
      const trimmed = draftText.trim();
      if (!trimmed || !onEditMessage) {
        setIsEditing(false);
        setDraftText(msg.content);
        return;
      }
      setIsEditing(false);
      onEditMessage(msg.id, trimmed);
    };

    if (isUser) {
      return (
        <div className="flex flex-col items-end w-full">
          <div className="group/user relative max-w-[85%] rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border)] px-3.5 py-2 text-xs text-[var(--text)] shadow-xs select-text">
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-[var(--border-subtle)]">
                {msg.attachments.map((att, aIdx) => (
                  <div
                    key={aIdx}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] font-medium"
                  >
                    {att.type.startsWith('image/') ? (
                      <ImageIcon className="h-3 w-3 text-purple-500" />
                    ) : att.type === 'url' ? (
                      <Link2 className="h-3 w-3 text-[var(--primary)]" />
                    ) : (
                      <FileText
                        className={`h-3 w-3 ${
                          att.type === 'application/pdf' || att.type === 'pdf' || att.name.toLowerCase().endsWith('.pdf')
                            ? 'text-rose-500'
                            : 'text-[var(--primary)]'
                        }`}
                      />
                    )}
                    {(att.type === 'application/pdf' || att.type === 'pdf' || att.name.toLowerCase().endsWith('.pdf')) && (
                      <span className="rounded bg-rose-500/15 px-1 text-[8px] font-bold text-rose-600">PDF</span>
                    )}
                    <span className="truncate max-w-[150px]">{att.name}</span>
                  </div>
                ))}
              </div>
            )}

            {isEditing ? (
              <div className="flex flex-col gap-2 min-w-[240px]">
                <textarea
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsEditing(false);
                      setDraftText(msg.content);
                    }
                  }}
                  autoFocus
                  rows={Math.min(8, Math.max(2, draftText.split('\n').length))}
                  className="w-full rounded-lg border border-[var(--primary)]/50 bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none resize-y"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setDraftText(msg.content);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                    <span>Cancel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!draftText.trim() || isAnyGenerating}
                    className="inline-flex items-center gap-1 rounded-md bg-[var(--primary)] px-2.5 py-1 text-[10px] font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40 cursor-pointer"
                  >
                    <Check className="h-3 w-3" />
                    <span>Save &amp; Send</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="whitespace-pre-wrap leading-relaxed select-text flex-1 min-w-0">
                  {displayedUserContent}
                </div>

                {/* Inline hover controls (Copy + Pencil Edit positioned left of Collapse chevron inside bubble) */}
                <div
                  className={`shrink-0 flex items-center gap-0.5 self-start transition-opacity ${
                    isCollapsible
                      ? ''
                      : 'opacity-0 pointer-events-none group-hover/user:opacity-100 group-hover/user:pointer-events-auto'
                  }`}
                >
                  <div className="flex items-center gap-0.5 opacity-0 pointer-events-none group-hover/user:opacity-100 group-hover/user:pointer-events-auto transition-opacity">
                    <button
                      type="button"
                      onClick={() => onCopy(msg.id, msg.content)}
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                      title="Copy message"
                    >
                      {copiedId === msg.id ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>

                    {onEditMessage && !isAnyGenerating && (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftText(msg.content);
                          setIsEditing(true);
                        }}
                        className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                        title="Edit and rerun from this message"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {isCollapsible && (
                    <button
                      type="button"
                      onClick={() => setIsExpanded((v) => !v)}
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                      title={isExpanded ? 'Collapse message' : 'Expand full message'}
                    >
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    const formattedTimestamp = formatMessageTimestamp(
      msg.timestamp,
      msg.generationEndTime || msg.generationStartTime,
      nowMs
    );

    // Assistant Message
    return (
      <div className="group/assistant relative flex items-start gap-2.5 w-full max-w-full select-text">
        <div className="shrink-0 pt-[3px] select-none">
          <AiAvatar size="xs" isGenerating={isGenerating} />
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-start">
          {/* Real-time Dynamic Activity Timeline */}
          {msg.activityEvents && msg.activityEvents.length > 0 && (
            <ActivityTimeline
              events={msg.activityEvents}
              isGenerating={isGenerating}
              isFinalResponseStarted={isFinalResponseStarted || msg.runStatus === 'completed' || Boolean(msg.content && msg.runStatus !== 'generating' && msg.runStatus !== 'executing_tool')}
              error={msg.error}
              startTime={msg.generationStartTime}
            />
          )}

          {/* Structured Content Blocks (Charts, Images, Tables) */}
          {msg.contentBlocks && msg.contentBlocks.length > 0 && (
            <div className="w-full space-y-2 mb-2">
              {msg.contentBlocks.map((block, bIdx) => {
                if (block.type === 'chart') {
                  return <InlineChart key={bIdx} specification={block.chart} />;
                }
                if (block.type === 'image') {
                  return <InlineGeneratedImage key={bIdx} image={block.image} />;
                }
                return null;
              })}
            </div>
          )}

          {/* Text Body: Incremental, beautiful StreamingMarkdown */}
          {msg.content ? (
            <div className="w-full text-xs text-[var(--text)] leading-relaxed">
              <StreamingMarkdown
                content={msg.content}
                isStreaming={isGenerating}
                copiedId={copiedId}
                onCopy={onCopy}
              />
            </div>
          ) : msg.error ? (
            <div className="w-full p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400">
              {msg.error}
            </div>
          ) : null}

          {/* Citations & Source References (deduplicated per unique document/URL) */}
          {msg.citations && msg.citations.length > 0 && (() => {
            const dedupedMap = new Map<string, { sourceTitle: string; pages: number[]; snippet: string; url?: string }>();
            for (const cite of msg.citations) {
              const key = cite.url
                ? `url:${cite.url}`
                : `src:${(cite.sourceId || cite.sourceTitle || '').toLowerCase()}`;
              const existing = dedupedMap.get(key);
              if (!existing) {
                dedupedMap.set(key, {
                  sourceTitle: cite.sourceTitle,
                  pages: cite.page ? [cite.page] : [],
                  snippet: cite.snippet,
                  url: cite.url,
                });
              } else if (cite.page && !existing.pages.includes(cite.page)) {
                existing.pages.push(cite.page);
              }
            }
            const uniqueCitations = Array.from(dedupedMap.values());
            return (
            <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] w-full">
              <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-[var(--text-muted)] block mb-1.5">
                Sources & Citations
              </span>
              <div className="flex flex-wrap gap-1.5">
                {uniqueCitations.map((cite, cIdx) => {
                  const pageLabel =
                    cite.pages.length > 0 ? `p.${[...cite.pages].sort((a, b) => a - b).join(', ')}` : '';
                  const inner = (
                    <>
                      {cite.url ? (
                        <Globe className="h-3 w-3 text-[var(--primary)] shrink-0" />
                      ) : (
                        <FileText className="h-3 w-3 text-[var(--primary)] shrink-0" />
                      )}
                      <span className="font-medium truncate max-w-[160px]">{cite.sourceTitle}</span>
                      {pageLabel && (
                        <span className="font-mono text-[9px] text-[var(--text-muted)]">{pageLabel}</span>
                      )}
                      {cite.url && (
                        <ExternalLink className="h-2.5 w-2.5 text-[var(--text-muted)] shrink-0 opacity-70" />
                      )}
                    </>
                  );

                  return cite.url ? (
                    <a
                      key={cIdx}
                      href={cite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors cursor-pointer shadow-2xs"
                      title={`${cite.snippet}\n\nURL: ${cite.url}`}
                    >
                      {inner}
                    </a>
                  ) : (
                    <div
                      key={cIdx}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] text-[var(--text)]"
                      title={cite.snippet}
                    >
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

          {/* Error Indicator & Retry */}
          {msg.error && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs w-full">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{msg.error}</span>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="ml-auto underline font-medium hover:text-rose-700 cursor-pointer"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {/* Post-Response Meta & Actions Row */}
          <div className="mt-1.5 flex items-center justify-between gap-2 select-none w-full">
            <span className="text-[10px] text-[var(--text-muted)] opacity-60">
              {formattedTimestamp}
            </span>

            {msg.content && !isGenerating && (
              <div className="flex items-center gap-0.5 opacity-0 pointer-events-none group-hover/assistant:opacity-100 group-hover/assistant:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto transition-opacity">
                <button
                  type="button"
                  onClick={() => onCopy(msg.id, msg.content)}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                  title="Copy response"
                >
                  {copiedId === msg.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                {msg.activityEvents && msg.activityEvents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onCopy(`${msg.id}:steps`, formatMessageWithWorkingSteps(msg))}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                    title="Copy response with working steps"
                  >
                    {copiedId === `${msg.id}:steps` ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-500" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <ListChecks className="h-3 w-3" />
                        <span>With Steps</span>
                      </>
                    )}
                  </button>
                )}

                {onRegenerate && !isAnyGenerating && (
                  <button
                    type="button"
                    onClick={() => onRegenerate(msg.id)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                    title="Regenerate response in-place"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Regenerate</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    if (prev.isGenerating !== next.isGenerating) return false;
    if (prev.isFinalResponseStarted !== next.isFinalResponseStarted) return false;
    if (prev.isAnyGenerating !== next.isAnyGenerating) return false;
    if (prev.nowMs !== next.nowMs) return false;
    if (
      prev.copiedId !== next.copiedId &&
      (prev.copiedId === prev.msg.id ||
        next.copiedId === next.msg.id ||
        prev.copiedId === `${prev.msg.id}:steps` ||
        next.copiedId === `${next.msg.id}:steps`)
    )
      return false;
    if (prev.msg.content !== next.msg.content) return false;
    if (prev.msg.timestamp !== next.msg.timestamp) return false;
    if (prev.msg.error !== next.msg.error) return false;
    if (prev.msg.runStatus !== next.msg.runStatus) return false;
    if (prev.msg.activityEvents !== next.msg.activityEvents) return false;
    if (prev.msg.contentBlocks !== next.msg.contentBlocks) return false;
    if (prev.msg.citations !== next.msg.citations) return false;
    return true;
  }
);

/**
 * Historical Messages Container
 * Memoized against historical array identity: does NOT re-render during streaming!
 */
interface HistoricalMessagesListProps {
  messages: AiChatMessage[];
  isAnyGenerating: boolean;
  nowMs: number;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerate?: (messageId: string) => void;
  onEditMessage?: (messageId: string, newContent: string) => void;
  onRetry?: () => void;
}

const HistoricalMessagesList = memo(
  function HistoricalMessagesList({
    messages,
    isAnyGenerating,
    nowMs,
    copiedId,
    onCopy,
    onRegenerate,
    onEditMessage,
    onRetry,
  }: HistoricalMessagesListProps) {
    chatDiagnostics.recordRender('HistoricalMessagesList');

    return (
      <>
        {messages.map((msg) => (
          <ChatMessageItem
            key={msg.id}
            msg={msg}
            isGenerating={false}
            isFinalResponseStarted={true}
            isAnyGenerating={isAnyGenerating}
            nowMs={nowMs}
            copiedId={copiedId}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onEditMessage={onEditMessage}
            onRetry={onRetry}
          />
        ))}
      </>
    );
  },
  (prev, next) => {
    return (
      prev.messages === next.messages &&
      prev.isAnyGenerating === next.isAnyGenerating &&
      prev.nowMs === next.nowMs &&
      prev.copiedId === next.copiedId &&
      prev.onCopy === next.onCopy &&
      prev.onRegenerate === next.onRegenerate &&
      prev.onEditMessage === next.onEditMessage &&
      prev.onRetry === next.onRetry
    );
  }
);

/**
 * Isolated Active Streaming Message Component
 * Subscribes to token deltas from the isolated streaming session store.
 * Only THIS component re-renders as tokens arrive!
 */
interface ActiveStreamingMessageItemProps {
  conversationId: string;
  streamingMessageId: string;
  baseMessage?: AiChatMessage;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onScrollToBottom: () => void;
}

const ActiveStreamingMessageItem = memo(function ActiveStreamingMessageItem({
  conversationId,
  streamingMessageId,
  baseMessage,
  copiedId,
  onCopy,
  onScrollToBottom,
}: ActiveStreamingMessageItemProps) {
  chatDiagnostics.recordRender('ActiveStreamingMessageItem');

  // Subscribes cleanly to isolated streaming store for this conversation
  const session = useStreamingSession(conversationId);

  const content = session.content || baseMessage?.content || '';
  const activityEvents =
    session.activityEvents && session.activityEvents.length > 0
      ? session.activityEvents
      : baseMessage?.activityEvents;
  const blocks =
    session.blocks && session.blocks.length > 0 ? session.blocks : baseMessage?.contentBlocks;
  const citations =
    session.citations && session.citations.length > 0
      ? session.citations
      : baseMessage?.citations;
  const isFinalResponseStarted = Boolean(session.isFinalResponseStarted || (session.status === 'completed' && content.trim().length > 0));
  const error = session.error || baseMessage?.error;
  const sessionStartTime = session.startTime || 0;

  // Signal parent scroll follower on content change
  useEffect(() => {
    onScrollToBottom();
  }, [content, activityEvents?.length, onScrollToBottom]);

  return (
    <div className="group relative flex items-start gap-2.5 w-full max-w-full">
      <div className="shrink-0 pt-[3px] select-none">
        <AiAvatar
          size="xs"
          isGenerating={session.status !== 'completed' && session.status !== 'cancelled' && session.status !== 'failed'}
        />
      </div>

      <div className="flex-1 min-w-0 flex flex-col items-start">
        {/* Real-time Dynamic Activity Timeline */}
        {(activityEvents && activityEvents.length > 0) || (!isFinalResponseStarted && !content) ? (
          <ActivityTimeline
            events={activityEvents}
            isGenerating={true}
            isFinalResponseStarted={isFinalResponseStarted}
            error={error}
            startTime={sessionStartTime}
          />
        ) : null}

        {/* Structured Content Blocks (Charts, Images, Tables) */}
        {blocks && blocks.length > 0 && (
          <div className="w-full space-y-2 mb-2">
            {blocks.map((block, bIdx) => {
              if (block.type === 'chart') {
                return <InlineChart key={bIdx} specification={block.chart} />;
              }
              if (block.type === 'image') {
                return <InlineGeneratedImage key={bIdx} image={block.image} />;
              }
              return null;
            })}
          </div>
        )}

        {/* Incremental Live Streaming Markdown */}
        {content ? (
          <div className="w-full text-xs text-[var(--text)] leading-relaxed">
            <StreamingMarkdown
              content={content}
              isStreaming={true}
              copiedId={copiedId}
              onCopy={onCopy}
            />
          </div>
        ) : !error && (!blocks || blocks.length === 0) ? (
          <div className="flex items-center gap-1.5 py-1 text-xs text-[var(--text-muted)]">
            <span className="inline-block h-3.5 w-1.5 bg-[var(--primary)] animate-pulse" />
          </div>
        ) : null}

        {/* Citations & Source References (deduplicated per unique document/URL) */}
        {citations && citations.length > 0 && (() => {
          const dedupedMap = new Map<string, { sourceTitle: string; pages: number[]; snippet: string; url?: string }>();
          for (const cite of citations) {
            const key = cite.url
              ? `url:${cite.url}`
              : `src:${(cite.sourceId || cite.sourceTitle || '').toLowerCase()}`;
            const existing = dedupedMap.get(key);
            if (!existing) {
              dedupedMap.set(key, {
                sourceTitle: cite.sourceTitle,
                pages: cite.page ? [cite.page] : [],
                snippet: cite.snippet,
                url: cite.url,
              });
            } else if (cite.page && !existing.pages.includes(cite.page)) {
              existing.pages.push(cite.page);
            }
          }
          const uniqueCitations = Array.from(dedupedMap.values());
          return (
          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] w-full">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-[var(--text-muted)] block mb-1.5">
              Sources & Citations
            </span>
            <div className="flex flex-wrap gap-1.5">
              {uniqueCitations.map((cite, cIdx) => {
                const pageLabel =
                  cite.pages.length > 0 ? `p.${[...cite.pages].sort((a, b) => a - b).join(', ')}` : '';
                return (
                <div
                  key={cIdx}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] text-[var(--text)]"
                  title={cite.snippet}
                >
                  {cite.url ? (
                    <Globe className="h-3 w-3 text-[var(--primary)] shrink-0" />
                  ) : (
                    <FileText className="h-3 w-3 text-[var(--primary)] shrink-0" />
                  )}
                  <span className="font-medium truncate max-w-[160px]">{cite.sourceTitle}</span>
                  {pageLabel && (
                    <span className="font-mono text-[9px] text-[var(--text-muted)]">{pageLabel}</span>
                  )}
                </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* Error Indicator */}
        {error && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs w-full">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-1.5 flex items-center select-none w-full">
          <span className="text-[10px] text-[var(--text-muted)] opacity-60">
            {formatMessageTimestamp(baseMessage?.timestamp, sessionStartTime)}
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * Main ChatMessageList Component
 */
export function ChatMessageList({
  messages,
  conversationId,
  isGenerating: propIsGenerating,
  streamingMessageId: propStreamingMessageId,
  onRegenerate,
  onEditMessage,
  onRetry,
  messagesEndRef,
}: ChatMessageListProps) {
  chatDiagnostics.recordRender('ChatMessageList');

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const hasRecent = messages.some((m) => {
      const ts = m.timestamp && m.timestamp !== 'Just now' ? Date.parse(m.timestamp) : NaN;
      return !Number.isNaN(ts) && Date.now() - ts < 120_000;
    });
    if (!hasRecent) return;
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [messages]);

  // Derive active streaming message identifier with automatic fallback to active placeholder
  const isGenerating = Boolean(propIsGenerating);
  const activeStreamId = useMemo(() => {
    if (propStreamingMessageId) return propStreamingMessageId;
    if (!isGenerating) return null;
    const lastActive = [...messages]
      .reverse()
      .find(
        (m) =>
          m.role === 'assistant' &&
          (m.runStatus === 'preparing' ||
            m.runStatus === 'generating' ||
            m.runStatus === 'executing_tool')
      );
    return lastActive?.id || null;
  }, [propStreamingMessageId, isGenerating, messages]);

  // Partition messages: historical messages stay 100% referentially stable
  const { historicalMessages, streamingBaseMessage } = useMemo(() => {
    if (!isGenerating || !activeStreamId) {
      return { historicalMessages: messages, streamingBaseMessage: undefined };
    }
    const historical = messages.filter((m) => m.id !== activeStreamId);
    const active = messages.find((m) => m.id === activeStreamId);
    return { historicalMessages: historical, streamingBaseMessage: active };
  }, [messages, isGenerating, activeStreamId]);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Authoritative scroll state & controller
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const isAutoFollowRef = useRef<boolean>(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const lastScrollTimeRef = useRef<number>(0);
  const scrollRafRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  // Synchronous scroll detection: checks distance to bottom on every scroll frame
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;

    // When within 80px of bottom, re-engage auto-follow and hide button
    if (distanceToBottom <= 80) {
      if (!isAutoFollowRef.current) {
        isAutoFollowRef.current = true;
        setShowScrollBottomBtn(false);
      }
    } else {
      // User is scrolled away from bottom
      if (isAutoFollowRef.current) {
        isAutoFollowRef.current = false;
        setShowScrollBottomBtn(true);
      }
    }
  }, []);

  // Instant gesture detection: wheel up immediately disables auto-follow before stream tick
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < 0) {
      isAutoFollowRef.current = false;
      setShowScrollBottomBtn(true);
    }
  }, []);

  // Touch gesture detection for mobile / trackpad touch
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0]?.clientY ?? 0;
    const deltaY = currentY - touchStartYRef.current;
    if (deltaY > 5) {
      // Swiping down on screen moves content down (scrolling up)
      isAutoFollowRef.current = false;
      setShowScrollBottomBtn(true);
    }
  }, []);

  // Reset auto-follow when a new message or active stream begins
  useEffect(() => {
    isAutoFollowRef.current = true;
    setShowScrollBottomBtn(false);
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [activeStreamId, messages.length]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (!containerRef.current) return;
    isAutoFollowRef.current = true;
    setShowScrollBottomBtn(false);
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior,
    });
  }, []);

  // Throttled follow-scroll: scrolls ONLY when user is actively following the bottom
  const handleScrollToBottom = useCallback(() => {
    if (!isAutoFollowRef.current || !containerRef.current) return;

    const now = performance.now();
    // Throttle scroll adjustments to avoid layout thrashing
    if (now - lastScrollTimeRef.current < 80) return;
    lastScrollTimeRef.current = now;

    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (containerRef.current && isAutoFollowRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  // Global Ctrl+A / Cmd+A within conversation container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        if (container.contains(target) || document.activeElement === container) {
          e.preventDefault();
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            const range = document.createRange();
            range.selectNodeContents(container);
            selection.addRange(range);
          }
        }
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-5 relative select-text outline-none focus-visible:ring-0"
    >
      {/* 1. Historical Messages: Referentially stable, never re-renders during streaming */}
      <HistoricalMessagesList
        messages={historicalMessages}
        isAnyGenerating={isGenerating}
        nowMs={nowMs}
        copiedId={copiedId}
        onCopy={handleCopy}
        onRegenerate={onRegenerate}
        onEditMessage={onEditMessage}
        onRetry={onRetry}
      />

      {/* 2. Active Streaming Message: Only this updates on token arrivals */}
      {isGenerating && conversationId && activeStreamId && (
        <ActiveStreamingMessageItem
          conversationId={conversationId}
          streamingMessageId={activeStreamId}
          baseMessage={streamingBaseMessage}
          copiedId={copiedId}
          onCopy={handleCopy}
          onScrollToBottom={handleScrollToBottom}
        />
      )}

      {/* Passive bottom anchor for IntersectionObserver */}
      <div ref={bottomAnchorRef} className="h-px w-full" aria-hidden="true" />
      <div ref={messagesEndRef} />

      {/* Floating Scroll to Bottom / Return to Latest Message Button */}
      {showScrollBottomBtn && (
        <div className="sticky bottom-2 left-0 right-0 flex justify-center pointer-events-none z-20">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-elevated)] border border-[var(--border)] text-xs font-medium text-[var(--text)] shadow-lg hover:bg-[var(--accent)] hover:border-[var(--primary)] transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
          >
            <ArrowDown className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Latest message</span>
            {isGenerating && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary)]" />
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

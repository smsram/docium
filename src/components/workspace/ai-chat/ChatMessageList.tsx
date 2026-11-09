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
} from 'lucide-react';
import { AiChatMessage, AgentActivityEvent, StructuredContentBlock } from '@/lib/types';
import { ActivityTimeline } from './ActivityTimeline';
import { InlineChart } from './InlineChart';
import { InlineGeneratedImage } from './InlineGeneratedImage';
import { StreamingMarkdown } from './StreamingMarkdown';
import { AiAvatar } from './AiAvatar';
import { useStreamingSession } from '@/lib/ai/streamingSession';
import { chatDiagnostics } from '@/lib/ai/diagnostics';

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
  onRetry?: () => void;
  messagesEndRef?: React.RefObject<HTMLDivElement | null>;
}

interface ChatMessageItemProps {
  msg: AiChatMessage;
  isLast?: boolean;
  isGenerating: boolean;
  isFinalResponseStarted?: boolean;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerate?: (messageId: string) => void;
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
    copiedId,
    onCopy,
    onRegenerate,
    onRetry,
  }: ChatMessageItemProps) {
    chatDiagnostics.recordRender('ChatMessageItem');
    const isUser = msg.role === 'user';

    if (isUser) {
      return (
        <div className="flex flex-col items-end">
          <div className="max-w-[85%] rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border)] px-4 py-2.5 text-xs text-[var(--text)] shadow-xs">
            {msg.attachments && msg.attachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2 pb-2 border-b border-[var(--border-subtle)]">
                {msg.attachments.map((att, aIdx) => (
                  <div
                    key={aIdx}
                    className="flex items-center gap-1.5 rounded-md bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] font-medium"
                  >
                    {att.type.startsWith('image/') ? (
                      <ImageIcon className="h-3 w-3 text-[var(--primary)]" />
                    ) : att.type === 'url' ? (
                      <Link2 className="h-3 w-3 text-[var(--primary)]" />
                    ) : (
                      <FileText className="h-3 w-3 text-[var(--primary)]" />
                    )}
                    <span className="truncate max-w-[130px]">{att.name}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
          </div>
        </div>
      );
    }

    // Assistant Message
    return (
      <div className="group relative flex flex-col items-start w-full max-w-full">
        {/* Assistant Identity Avatar Header */}
        <div className="flex items-center gap-2 mb-2 select-none">
          <AiAvatar size="xs" isGenerating={isGenerating && !isFinalResponseStarted} />
          <span className="text-[11px] font-semibold text-[var(--text)] tracking-tight">
            Docium AI
          </span>
          {msg.timestamp && (
            <span className="text-[10px] text-[var(--text-muted)] opacity-60">
              {msg.timestamp}
            </span>
          )}
        </div>

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
        ) : !isGenerating && !msg.error && (!msg.contentBlocks || msg.contentBlocks.length === 0) ? (
          <p className="text-xs text-[var(--text-muted)] italic">
            Response completed without additional text.
          </p>
        ) : null}

        {/* Citations & Source References */}
        {msg.citations && msg.citations.length > 0 && (
          <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] w-full">
            <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-[var(--text-muted)] block mb-1.5">
              Sources & Citations
            </span>
            <div className="flex flex-wrap gap-1.5">
              {msg.citations.map((cite, cIdx) => {
                const inner = (
                  <>
                    {cite.url ? (
                      <Globe className="h-3 w-3 text-[var(--primary)] shrink-0" />
                    ) : (
                      <FileText className="h-3 w-3 text-[var(--primary)] shrink-0" />
                    )}
                    <span className="font-medium truncate max-w-[160px]">{cite.sourceTitle}</span>
                    {cite.page && (
                      <span className="font-mono text-[9px] text-[var(--text-muted)]">p.{cite.page}</span>
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
        )}

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

        {/* Hover Actions for Assistant */}
        {msg.content && !isGenerating && (
          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onCopy(msg.id, msg.content)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
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

            {onRegenerate && (
              <button
                type="button"
                onClick={() => onRegenerate(msg.id)}
                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                title="Regenerate response"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Regenerate</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (prev.isGenerating !== next.isGenerating) return false;
    if (prev.isFinalResponseStarted !== next.isFinalResponseStarted) return false;
    if (prev.copiedId !== next.copiedId && (prev.copiedId === prev.msg.id || next.copiedId === next.msg.id))
      return false;
    if (prev.msg.content !== next.msg.content) return false;
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
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onRegenerate?: (messageId: string) => void;
  onRetry?: () => void;
}

const HistoricalMessagesList = memo(
  function HistoricalMessagesList({
    messages,
    copiedId,
    onCopy,
    onRegenerate,
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
            copiedId={copiedId}
            onCopy={onCopy}
            onRegenerate={onRegenerate}
            onRetry={onRetry}
          />
        ))}
      </>
    );
  },
  (prev, next) => {
    return (
      prev.messages === next.messages &&
      prev.copiedId === next.copiedId &&
      prev.onCopy === next.onCopy &&
      prev.onRegenerate === next.onRegenerate &&
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
    <div className="group relative flex flex-col items-start w-full max-w-full">
      {/* Assistant Identity Avatar Header */}
      <div className="flex items-center gap-2 mb-2 select-none">
        <AiAvatar size="xs" isGenerating={!isFinalResponseStarted} />
        <span className="text-[11px] font-semibold text-[var(--text)] tracking-tight">
          Docium AI
        </span>
        <span className="text-[10px] text-[var(--text-muted)] opacity-60">
          Just now
        </span>
      </div>

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

      {/* Citations & Source References */}
      {citations && citations.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] w-full">
          <span className="text-[10px] uppercase font-mono font-bold tracking-wider text-[var(--text-muted)] block mb-1.5">
            Sources & Citations
          </span>
          <div className="flex flex-wrap gap-1.5">
            {citations.map((cite, cIdx) => (
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Indicator */}
      {error && (
        <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs w-full">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
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
  onRetry,
  messagesEndRef,
}: ChatMessageListProps) {
  chatDiagnostics.recordRender('ChatMessageList');

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

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-5 relative"
    >
      {/* 1. Historical Messages: Referentially stable, never re-renders during streaming */}
      <HistoricalMessagesList
        messages={historicalMessages}
        copiedId={copiedId}
        onCopy={handleCopy}
        onRegenerate={onRegenerate}
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

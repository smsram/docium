/**
 * DOCIUM Streaming Session Manager & Isolated Reactive Store
 * 
 * Provides:
 * 1. Request-scoped, conversation-isolated streaming sessions.
 * 2. Guaranteed safe conversation switching without token leakage or cross-contamination.
 * 3. Immediate, clean cancellation via AbortController and stream reader releases.
 * 4. RAF-throttled reactive subscriptions (useSyncExternalStore) to isolate token updates
 *    so previous messages, headers, and editor panels do not re-render.
 * 5. Bounded memory buffers preventing Out-Of-Memory (OOM) accumulation.
 */

import { useSyncExternalStore, useCallback } from 'react';
import {
  AgentActivityEvent,
  StructuredContentBlock,
  AgentRunStatus,
} from '@/lib/types';
import { AgentSSEEvent } from '@/lib/ai/agent/orchestrator';
import { chatDiagnostics } from '@/lib/ai/diagnostics';

export type StreamReaderLifecycleState =
  | 'initializing'
  | 'reading'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'released';

export interface StreamConsumerCallbacks {
  onDelta?: (text: string) => void;
  onReplaceContent?: (text: string) => void;
  onActivity?: (event: AgentActivityEvent) => void;
  onFinalResponseStarted?: () => void;
  onStepExplanation?: (stepId: string, explanation: string) => void;
  onBlock?: (block: StructuredContentBlock) => void;
  onCitation?: (citation: { sourceId: string; sourceTitle: string; page?: number; snippet: string; url?: string }) => void;
  onStatus?: (status: AgentRunStatus) => void;
  onScratchpad?: (notes: string) => void;
  onFileOp?: (op: any) => void;
  onEditorAction?: (actionEvent: any) => Promise<void> | void;
  onDone?: (finalContent: string) => Promise<void> | void;
  onError?: (errorMsg: string) => Promise<void> | void;
}

/**
 * SingleOwnerStreamLifecycle
 * Encapsulates the complete, exclusive lifecycle of a ReadableStreamDefaultReader.
 * Guarantees:
 * 1. Exactly ONE owner possesses and reads from the stream reader.
 * 2. Explicit lifecycle transitions: initializing -> reading -> completed | cancelled | failed -> released.
 * 3. Never calls read() after reader release or stream completion.
 * 4. Never calls releaseLock() while a read operation is active.
 * 5. Safe, idempotent cancellation and resource release.
 */
export class SingleOwnerStreamLifecycle {
  public state: StreamReaderLifecycleState = 'initializing';
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abortController: AbortController;
  private isReadPending = false;
  private releasePromise: Promise<void> | null = null;
  public readonly id: string;
  public readonly conversationId: string;

  constructor(params: {
    id: string;
    conversationId: string;
    abortController: AbortController;
  }) {
    this.id = params.id;
    this.conversationId = params.conversationId;
    this.abortController = params.abortController;
  }

  /**
   * Attaches a fresh response stream to this lifecycle.
   * Enforces single-ownership: rejects if stream is locked or already attached.
   */
  public attach(response: Response): void {
    if (this.state !== 'initializing') {
      throw new Error(`[SingleOwnerStreamLifecycle] Cannot attach stream in lifecycle state "${this.state}"`);
    }
    if (!response.body) {
      this.state = 'failed';
      throw new Error('[SingleOwnerStreamLifecycle] Response body stream is missing');
    }
    if (response.body.locked) {
      this.state = 'failed';
      throw new Error('[SingleOwnerStreamLifecycle] Response body stream is already locked by another reader');
    }

    this.reader = response.body.getReader();
    this.state = 'reading';
  }

  /**
   * Manually attaches a pre-acquired reader (bridge method for testing).
   */
  public attachReader(reader: ReadableStreamDefaultReader<Uint8Array>): void {
    if (this.state !== 'initializing' && this.state !== 'reading') {
      throw new Error(`[SingleOwnerStreamLifecycle] Cannot attach reader in state "${this.state}"`);
    }
    this.reader = reader;
    this.state = 'reading';
  }

  /**
   * Safely reads the next chunk.
   * Guarantees reader.read() is never invoked after cancellation or release.
   */
  public async readChunk(): Promise<{ done: boolean; value?: Uint8Array }> {
    if (this.state !== 'reading' || !this.reader) {
      return { done: true, value: undefined };
    }

    if (this.abortController.signal.aborted) {
      this.state = 'cancelled';
      return { done: true, value: undefined };
    }

    if (this.isReadPending) {
      throw new Error('[SingleOwnerStreamLifecycle] Concurrent read operations on a single-owner reader are prohibited');
    }

    this.isReadPending = true;
    try {
      const result = await this.reader.read();
      if (result.done) {
        if (this.state === 'reading') {
          this.state = 'completed';
        }
      }
      return result;
    } catch (err: unknown) {
      if (this.abortController.signal.aborted) {
        this.state = 'cancelled';
        return { done: true, value: undefined };
      }
      this.state = 'failed';
      throw err;
    } finally {
      this.isReadPending = false;
    }
  }

  /**
   * Idempotent cancellation:
   * Aborts request controller and signals the stream to stop pending reads.
   */
  public async cancel(reason?: string): Promise<void> {
    if (this.state === 'cancelled' || this.state === 'released') return;
    this.state = 'cancelled';

    try {
      this.abortController.abort(reason);
    } catch {
      // Ignore
    }

    if (this.reader && !this.isReadPending) {
      try {
        await this.reader.cancel(reason).catch(() => {});
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Idempotent cleanup and release:
   * Waits for pending read to settle before releasing lock.
   * Guarantees reader is released exactly once and cannot be re-used.
   */
  public async release(): Promise<void> {
    if (this.releasePromise) return this.releasePromise;
    this.releasePromise = this.performRelease();
    return this.releasePromise;
  }

  private async performRelease(): Promise<void> {
    if (this.state === 'released') return;

    // If a read is currently active, wait for it to settle after aborting
    if (this.isReadPending) {
      try {
        this.abortController.abort();
      } catch {}
      let waits = 0;
      while (this.isReadPending && waits < 10) {
        await new Promise((r) => setTimeout(r, 10));
        waits++;
      }
    }

    if (this.reader) {
      try {
        if (this.state === 'cancelled' || this.state === 'failed') {
          await this.reader.cancel().catch(() => {});
        }
        this.reader.releaseLock();
      } catch {
        // Reader was already released or closed
      }
      this.reader = null;
    }

    this.state = 'released';
  }
}

export interface ActiveStreamSession {
  requestId: string;
  workspaceId: string;
  conversationId: string;
  assistantMessageId: string;
  abortController: AbortController;
  lifecycle: SingleOwnerStreamLifecycle;
  reader?: ReadableStreamDefaultReader<Uint8Array> | null;
  status: AgentRunStatus;
  content: string;
  activityEvents: AgentActivityEvent[];
  blocks: StructuredContentBlock[];
  citations: Array<{
    sourceId: string;
    sourceTitle: string;
    page?: number;
    snippet: string;
    url?: string;
  }>;
  isFinalResponseStarted: boolean;
  startTime: number;
  lastUpdateTime: number;
  error?: string;
  lastProcessedSeq: number;
  processedSeqs: Set<number>;
}

export type StreamSessionSnapshot = Readonly<{
  isGenerating: boolean;
  requestId: string | null;
  assistantMessageId: string | null;
  status: AgentRunStatus;
  content: string;
  activityEvents: AgentActivityEvent[];
  blocks: StructuredContentBlock[];
  citations: Array<{
    sourceId: string;
    sourceTitle: string;
    page?: number;
    snippet: string;
    url?: string;
  }>;
  isFinalResponseStarted: boolean;
  error?: string;
  /** Unix timestamp (ms) when this generation session started — used for elapsed-time display */
  startTime: number;
}>;

export type StreamStatusSnapshot = Readonly<{
  isGenerating: boolean;
  status: AgentRunStatus;
}>;

const EMPTY_SNAPSHOT: StreamSessionSnapshot = Object.freeze({
  isGenerating: false,
  requestId: null,
  assistantMessageId: null,
  status: 'idle',
  content: '',
  activityEvents: [],
  blocks: [],
  citations: [],
  isFinalResponseStarted: false,
  startTime: 0,
});

const EMPTY_STATUS_SNAPSHOT: StreamStatusSnapshot = Object.freeze({
  isGenerating: false,
  status: 'idle',
});

export class StreamingSessionManager {
  private sessions = new Map<string, ActiveStreamSession>();
  private snapshots = new Map<string, StreamSessionSnapshot>();
  private statusSnapshots = new Map<string, StreamStatusSnapshot>();
  private listeners = new Map<string, Set<() => void>>();
  private pendingDeltas = new Map<string, string>();
  private rafHandles = new Map<string, number>();

  /**
   * Start a new, isolated streaming session for a conversation.
   * Cancels any preexisting session for the same conversation.
   */
  public startSession(params: {
    workspaceId: string;
    conversationId: string;
    assistantMessageId: string;
    abortController: AbortController;
    initialEvents?: AgentActivityEvent[];
  }): { requestId: string; session: ActiveStreamSession } {
    const { workspaceId, conversationId, assistantMessageId, abortController, initialEvents } = params;

    // Clean up any existing session for this conversation
    this.stopSession(conversationId);

    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lifecycle = new SingleOwnerStreamLifecycle({
      id: requestId,
      conversationId,
      abortController,
    });

    const session: ActiveStreamSession = {
      requestId,
      workspaceId,
      conversationId,
      assistantMessageId,
      abortController,
      lifecycle,
      reader: null,
      status: 'preparing',
      content: '',
      activityEvents: initialEvents ? [...initialEvents] : [],
      blocks: [],
      citations: [],
      isFinalResponseStarted: false,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      lastProcessedSeq: 0,
      processedSeqs: new Set<number>(),
    };

    this.sessions.set(conversationId, session);
    chatDiagnostics.setActiveStreamCount(this.sessions.size);
    this.updateSnapshot(conversationId);
    return { requestId, session };
  }

  public setReader(conversationId: string, requestId: string, reader: ReadableStreamDefaultReader<Uint8Array>): void {
    const session = this.sessions.get(conversationId);
    if (session && session.requestId === requestId) {
      session.reader = reader;
      try {
        session.lifecycle.attachReader(reader);
      } catch {
        // Safe
      }
    }
  }

  public getSession(conversationId: string): ActiveStreamSession | undefined {
    return this.sessions.get(conversationId);
  }

  public isGenerating(conversationId: string): boolean {
    const session = this.sessions.get(conversationId);
    if (!session) return false;
    return (
      session.status === 'preparing' ||
      session.status === 'executing_tool' ||
      session.status === 'generating'
    );
  }

  /**
   * Appends a token delta using throttled requestAnimationFrame batching
   * to protect the React render pipeline from token-by-token churn.
   */
  public appendDelta(conversationId: string, requestId: string, delta: string): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    chatDiagnostics.recordAppliedDelta(delta.length);
    chatDiagnostics.recordStreamingUpdate(delta.length);

    session.isFinalResponseStarted = true;
    session.status = 'generating';

    const currentPending = this.pendingDeltas.get(conversationId) || '';
    this.pendingDeltas.set(conversationId, currentPending + delta);

    if (!this.rafHandles.has(conversationId)) {
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        const handle = window.requestAnimationFrame(() => {
          this.rafHandles.delete(conversationId);
          this.flushPendingDeltas(conversationId);
        });
        this.rafHandles.set(conversationId, handle);
      } else {
        // Fallback for non-browser / test environments
        this.flushPendingDeltas(conversationId);
      }
    }
  }

  private flushPendingDeltas(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    const pending = this.pendingDeltas.get(conversationId);
    this.pendingDeltas.delete(conversationId);

    if (session && pending) {
      session.content += pending;
      session.lastUpdateTime = Date.now();
      this.updateSnapshot(conversationId);
    }
  }

  public replaceContent(conversationId: string, requestId: string, text: string): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    // Clear pending deltas
    this.pendingDeltas.delete(conversationId);
    session.content = text;
    session.lastUpdateTime = Date.now();
    this.updateSnapshot(conversationId);
  }

  public setStatus(conversationId: string, requestId: string, status: AgentRunStatus): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    session.status = status;
    session.lastUpdateTime = Date.now();
    this.updateSnapshot(conversationId);
  }

  /**
   * Upserts an activity event with stable deduplication and bounds protection.
   * Deduplicates strictly by unique event ID or stepId.
   */
  public upsertActivityEvent(conversationId: string, requestId: string, event: AgentActivityEvent): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    const nextEvents = [...session.activityEvents];
    // Deduplicate strictly by stable event ID or stepId
    const existingIdx = nextEvents.findIndex(
      (e) => (event.id && e.id === event.id) || (event.stepId && e.stepId === event.stepId)
    );

    if (existingIdx !== -1) {
      // In-place update preserving identity and rich properties
      const prev = nextEvents[existingIdx];
      nextEvents[existingIdx] = {
        ...prev,
        ...event,
        safeSummary: event.safeSummary !== undefined ? event.safeSummary : prev.safeSummary,
        description: event.description !== undefined ? event.description : prev.description,
      };
    } else {
      // Bounded array: prevent memory leaks if agent produces hundreds of iterations
      if (nextEvents.length >= 60) {
        nextEvents.splice(1, 1); // Drop oldest non-root step
      }
      nextEvents.push(event);
    }

    session.activityEvents = nextEvents;
    session.lastUpdateTime = Date.now();
    this.updateSnapshot(conversationId);
  }

  public setFinalResponseStarted(conversationId: string, requestId: string): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;
    if (session.isFinalResponseStarted) return;

    session.isFinalResponseStarted = true;
    session.activityEvents = session.activityEvents.map((e) =>
      e.status === 'running' ? { ...e, status: 'completed' as const, safeSummary: e.safeSummary || 'Completed' } : e
    );
    session.lastUpdateTime = Date.now();
    this.updateSnapshot(conversationId);
  }

  public addBlock(conversationId: string, requestId: string, block: StructuredContentBlock): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    session.blocks = [...session.blocks, block];
    session.lastUpdateTime = Date.now();
    this.updateSnapshot(conversationId);
  }

  public addCitation(
    conversationId: string,
    requestId: string,
    citation: { sourceId: string; sourceTitle: string; page?: number; snippet: string; url?: string }
  ): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    session.citations = [...session.citations, citation];
    session.lastUpdateTime = Date.now();
    this.updateSnapshot(conversationId);
  }

  /**
   * Consumes an incoming HTTP Response stream with strict single-owner lifecycle guarantees.
   * Guarantees:
   * 1. No other component reads or releases the underlying ReadableStreamDefaultReader.
   * 2. SSE line parsing, deltas, activities, tool actions, and completions are safely dispatched.
   * 3. Upon completion, cancellation, or error, the reader lock is released cleanly and idempotently exactly once.
   */
  public async consumeResponseStream(params: {
    conversationId: string;
    requestId: string;
    response: Response;
    callbacks: StreamConsumerCallbacks;
  }): Promise<void> {
    const { conversationId, requestId, response, callbacks } = params;
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) {
      try {
        await response.body?.cancel();
      } catch {}
      return;
    }

    const lifecycle = session.lifecycle;
    lifecycle.attach(response);

    const decoder = new TextDecoder('utf-8');
    let streamBuffer = '';

    try {
      while (lifecycle.state === 'reading') {
        if (session.abortController.signal.aborted) {
          await lifecycle.cancel();
          break;
        }

        const { done, value } = await lifecycle.readChunk();
        if (done || !value) {
          break;
        }

        streamBuffer += decoder.decode(value, { stream: true });
        const lines = streamBuffer.split('\n');
        streamBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          let event: AgentSSEEvent | null = null;
          try {
            event = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          if (!event) continue;

          // Request-scoped & conversation-scoped isolation
          if (event.conversationId && event.conversationId !== conversationId) {
            continue;
          }
          if (event.requestId && event.requestId !== requestId) {
            continue;
          }

          // Sequence-based deduplication: ensures exactly-once event processing
          // without discarding genuine repeated text words or characters
          if (typeof event.seq === 'number') {
            if (session.processedSeqs.has(event.seq)) {
              chatDiagnostics.recordDuplicateEvent();
              continue;
            }
            session.processedSeqs.add(event.seq);
            session.lastProcessedSeq = Math.max(session.lastProcessedSeq, event.seq);
            if (session.processedSeqs.size > 2000) {
              const minToKeep = session.lastProcessedSeq - 500;
              for (const s of session.processedSeqs) {
                if (s < minToKeep) session.processedSeqs.delete(s);
              }
            }
          }

          if (event.type === 'delta') {
            chatDiagnostics.recordReceivedDelta(event.text.length);
            this.appendDelta(conversationId, requestId, event.text);
            callbacks.onDelta?.(event.text);
          } else if (event.type === 'final_response_started') {
            this.setFinalResponseStarted(conversationId, requestId);
            callbacks.onFinalResponseStarted?.();
          } else if (event.type === 'step_explanation') {
            const currentSession = this.sessions.get(conversationId);
            if (currentSession && currentSession.requestId === requestId) {
              const step = currentSession.activityEvents.find((e) => e.id === event.stepId || e.stepId === event.stepId);
              if (step) {
                this.upsertActivityEvent(conversationId, requestId, {
                  ...step,
                  safeSummary: event.explanation,
                  description: event.explanation,
                });
              }
            }
            callbacks.onStepExplanation?.(event.stepId, event.explanation);
          } else if (event.type === 'replace_content') {
            this.replaceContent(conversationId, requestId, event.text);
            callbacks.onReplaceContent?.(event.text);
          } else if (event.type === 'activity') {
            this.upsertActivityEvent(conversationId, requestId, event.event);
            callbacks.onActivity?.(event.event);
          } else if (event.type === 'block') {
            this.addBlock(conversationId, requestId, event.block);
            callbacks.onBlock?.(event.block);
          } else if (event.type === 'citation') {
            this.addCitation(conversationId, requestId, event.citation);
            callbacks.onCitation?.(event.citation);
          } else if (event.type === 'status') {
            this.setStatus(conversationId, requestId, event.status);
            callbacks.onStatus?.(event.status);
          } else if (event.type === 'scratchpad') {
            callbacks.onScratchpad?.(event.notes);
          } else if (event.type === 'file_op') {
            callbacks.onFileOp?.(event);
          } else if (event.type === 'editor_action') {
            await callbacks.onEditorAction?.(event);
          } else if (event.type === 'done') {
            lifecycle.state = 'completed';
            this.flushPendingDeltas(conversationId);
            const authoritativeContent = this.getSession(conversationId)?.content || '';
            await callbacks.onDone?.(authoritativeContent);
            break;
          } else if (event.type === 'error') {
            lifecycle.state = 'failed';
            await callbacks.onError?.(event.message || 'AI generation failed');
            break;
          }
        }

        if (lifecycle.state !== 'reading') {
          break;
        }
      }

      if (lifecycle.state === 'reading') {
        lifecycle.state = 'completed';
        this.flushPendingDeltas(conversationId);
        const authoritativeContent = this.getSession(conversationId)?.content || '';
        await callbacks.onDone?.(authoritativeContent);
      }
    } catch (err: unknown) {
      const isAbort = session.abortController.signal.aborted || (err instanceof Error && err.name === 'AbortError');
      if (isAbort) {
        lifecycle.state = 'cancelled';
      } else {
        lifecycle.state = 'failed';
        const msg = err instanceof Error ? err.message : 'Stream reading error';
        await callbacks.onError?.(msg);
      }
    } finally {
      // Safe, single-owner release of reader lock
      await lifecycle.release();
      const finalStatus =
        lifecycle.state === 'cancelled'
          ? 'cancelled'
          : lifecycle.state === 'failed'
          ? 'failed'
          : 'completed';
      this.finishSession(conversationId, requestId, finalStatus);
    }
  }

  /**
   * Immediately stops and cancels a generation safely.
   * Flushes any in-flight deltas and returns the accumulated content
   * so callers can commit partial output immediately without data loss.
   */
  public stopSession(conversationId: string): {
    content: string;
    activityEvents: AgentActivityEvent[];
    status: AgentRunStatus;
  } | null {
    // Cancel pending animation frame
    const rafHandle = this.rafHandles.get(conversationId);
    if (rafHandle !== undefined) {
      if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(rafHandle);
      }
      this.rafHandles.delete(conversationId);
    }

    const session = this.sessions.get(conversationId);
    if (!session) return null;

    // Flush any pending text deltas into session.content before stopping
    const pending = this.pendingDeltas.get(conversationId);
    if (pending) {
      session.content += pending;
      this.pendingDeltas.delete(conversationId);
    }

    // Safely signal lifecycle cancellation and stream drain without premature releaseLock
    session.lifecycle.cancel('User clicked stop');

    session.status = 'cancelled';
    const result = {
      content: session.content,
      activityEvents: session.activityEvents,
      status: 'cancelled' as const,
    };

    this.sessions.delete(conversationId);
    chatDiagnostics.setActiveStreamCount(this.sessions.size);
    this.updateSnapshot(conversationId);
    return result;
  }

  /**
   * Finalizes a completed or failed session.
   */
  public finishSession(conversationId: string, requestId: string, finalStatus: AgentRunStatus = 'completed', error?: string): void {
    const session = this.sessions.get(conversationId);
    if (!session || session.requestId !== requestId) return;

    // Flush any remaining deltas
    this.flushPendingDeltas(conversationId);

    const rafHandle = this.rafHandles.get(conversationId);
    if (rafHandle !== undefined) {
      if (typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(rafHandle);
      }
      this.rafHandles.delete(conversationId);
    }

    session.lifecycle.release().catch(() => {});

    session.status = finalStatus;
    if (error) session.error = error;

    this.sessions.delete(conversationId);
    chatDiagnostics.setActiveStreamCount(this.sessions.size);
    this.updateSnapshot(conversationId);
  }

  /**
   * Returns a memoized immutable snapshot for React subscriptions.
   */
  public getSnapshot(conversationId: string): StreamSessionSnapshot {
    return this.snapshots.get(conversationId) || EMPTY_SNAPSHOT;
  }

  /**
   * Returns a memoized status snapshot for parent containers that only
   * need isGenerating/status and should not re-render on token deltas.
   */
  public getStatusSnapshot(conversationId: string): StreamStatusSnapshot {
    return this.statusSnapshots.get(conversationId) || EMPTY_STATUS_SNAPSHOT;
  }

  private updateSnapshot(conversationId: string): void {
    const session = this.sessions.get(conversationId);
    if (!session) {
      this.snapshots.delete(conversationId);
      this.statusSnapshots.delete(conversationId);
    } else {
      const isGenerating =
        session.status === 'preparing' ||
        session.status === 'executing_tool' ||
        session.status === 'generating';

      this.snapshots.set(
        conversationId,
        Object.freeze({
          isGenerating,
          requestId: session.requestId,
          assistantMessageId: session.assistantMessageId,
          status: session.status,
          content: session.content,
          activityEvents: session.activityEvents,
          blocks: session.blocks,
          citations: session.citations,
          isFinalResponseStarted: session.isFinalResponseStarted,
          error: session.error,
          startTime: session.startTime,
        })
      );

      // Only re-create status snapshot object if status or isGenerating actually changed
      const prevStatus = this.statusSnapshots.get(conversationId);
      if (!prevStatus || prevStatus.isGenerating !== isGenerating || prevStatus.status !== session.status) {
        this.statusSnapshots.set(
          conversationId,
          Object.freeze({
            isGenerating,
            status: session.status,
          })
        );
      }
    }

    // Notify listeners for this conversation
    const cListeners = this.listeners.get(conversationId);
    if (cListeners) {
      cListeners.forEach((cb) => cb());
    }
  }

  public subscribe(conversationId: string, listener: () => void): () => void {
    let set = this.listeners.get(conversationId);
    if (!set) {
      set = new Set();
      this.listeners.set(conversationId, set);
    }
    set.add(listener);

    return () => {
      const s = this.listeners.get(conversationId);
      if (s) {
        s.delete(listener);
        if (s.size === 0) {
          this.listeners.delete(conversationId);
        }
      }
    };
  }

  /**
   * Cleanup all sessions and listeners (e.g. on full workspace unmount).
   */
  public destroy(): void {
    for (const convId of Array.from(this.sessions.keys())) {
      this.stopSession(convId);
    }
    this.sessions.clear();
    this.snapshots.clear();
    this.statusSnapshots.clear();
    this.listeners.clear();
    this.pendingDeltas.clear();
    this.rafHandles.clear();
  }
}

export const streamingSessionManager = new StreamingSessionManager();

/**
 * React Hook to subscribe cleanly to a conversation's isolated streaming session.
 */
export function useStreamingSession(conversationId?: string): StreamSessionSnapshot {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!conversationId) return () => {};
      return streamingSessionManager.subscribe(conversationId, callback);
    },
    [conversationId]
  );

  const getSnapshot = useCallback(() => {
    if (!conversationId) return EMPTY_SNAPSHOT;
    return streamingSessionManager.getSnapshot(conversationId);
  }, [conversationId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
}

/**
 * React Hook for parent components (like WorkspaceAI) that only need to track
 * whether generation is active, without triggering renders on text deltas or activities.
 */
export function useStreamingStatus(conversationId?: string): StreamStatusSnapshot {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (!conversationId) return () => {};
      return streamingSessionManager.subscribe(conversationId, callback);
    },
    [conversationId]
  );

  const getSnapshot = useCallback(() => {
    if (!conversationId) return EMPTY_STATUS_SNAPSHOT;
    return streamingSessionManager.getStatusSnapshot(conversationId);
  }, [conversationId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATUS_SNAPSHOT);
}

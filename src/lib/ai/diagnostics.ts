/**
 * DOCIUM Lightweight AI Chat & Streaming Diagnostics
 * 
 * Provides:
 * 1. Render count tracking during streaming.
 * 2. Streaming update frequency (Hz) calculations.
 * 3. Message length and activity event count tracking.
 * 4. Active requests and subscriber metrics.
 * 5. Markdown rendering duration profiling.
 * 6. Memory usage metrics (performance.memory in Chromium when available).
 * 
 * Zero overhead in production: only active in development mode
 * or when window.__DOCIUM_DIAGNOSTICS__ is explicitly enabled.
 */

export interface ChatDiagnosticMetrics {
  renderCount: number;
  tokensReceived: number;
  streamingUpdatesCount: number;
  updatesPerSecond: number;
  messageLengthChars: number;
  activityEventCount: number;
  activeRequests: number;
  markdownParseDurationMs: number;
  heapUsedMb?: number;
  heapTotalMb?: number;

  // Authoritative delta & stream tracking
  receivedDeltaCount: number;
  appliedDeltaCount: number;
  duplicateEventCount: number;
  accumulatedResponseLength: number;
  renderedResponseLength: number;
  activeStreamCount: number;
}

class ChatDiagnostics {
  private renderCounts = new Map<string, number>();
  private updateTimestamps: number[] = [];
  private tokenCount = 0;
  private lastMarkdownDuration = 0;

  // Authoritative counters
  private receivedDeltaCount = 0;
  private appliedDeltaCount = 0;
  private duplicateEventCount = 0;
  private accumulatedResponseLength = 0;
  private renderedResponseLength = 0;
  private activeStreamCount = 0;

  public isEnabled(): boolean {
    if (typeof window !== 'undefined') {
      return (
        process.env.NODE_ENV !== 'production' ||
        Boolean((window as unknown as { __DOCIUM_DIAGNOSTICS__?: boolean }).__DOCIUM_DIAGNOSTICS__)
      );
    }
    return process.env.NODE_ENV !== 'production' || Boolean(process.env.DOCIUM_DIAGNOSTICS);
  }

  public recordRender(componentName: string): number {
    if (!this.isEnabled()) return 0;
    const count = (this.renderCounts.get(componentName) || 0) + 1;
    this.renderCounts.set(componentName, count);
    return count;
  }

  public recordStreamingUpdate(deltaLength: number): void {
    if (!this.isEnabled()) return;
    const now = performance.now();
    this.updateTimestamps.push(now);
    this.tokenCount++;

    // Keep only timestamps within last 1000ms for accurate Hz calculation
    const cutoff = now - 1000;
    while (this.updateTimestamps.length > 0 && this.updateTimestamps[0] < cutoff) {
      this.updateTimestamps.shift();
    }
  }

  public recordReceivedDelta(len: number): void {
    if (!this.isEnabled()) return;
    this.receivedDeltaCount++;
  }

  public recordAppliedDelta(len: number): void {
    if (!this.isEnabled()) return;
    this.appliedDeltaCount++;
    this.accumulatedResponseLength += len;
  }

  public recordDuplicateEvent(): void {
    if (!this.isEnabled()) return;
    this.duplicateEventCount++;
  }

  public recordRenderedResponseLength(len: number): void {
    if (!this.isEnabled()) return;
    this.renderedResponseLength = len;
  }

  public setActiveStreamCount(count: number): void {
    if (!this.isEnabled()) return;
    this.activeStreamCount = count;
  }

  public recordMarkdownDuration(durationMs: number): void {
    if (!this.isEnabled()) return;
    this.lastMarkdownDuration = durationMs;
  }

  public getMetrics(params?: {
    messageLength?: number;
    activityEventCount?: number;
    activeRequests?: number;
  }): ChatDiagnosticMetrics {
    const memory = (typeof performance !== 'undefined' && 'memory' in performance)
      ? (performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory
      : undefined;

    return {
      renderCount: Array.from(this.renderCounts.values()).reduce((a, b) => a + b, 0),
      tokensReceived: this.tokenCount,
      streamingUpdatesCount: this.updateTimestamps.length,
      updatesPerSecond: this.updateTimestamps.length,
      messageLengthChars: params?.messageLength || 0,
      activityEventCount: params?.activityEventCount || 0,
      activeRequests: params?.activeRequests || 0,
      markdownParseDurationMs: Math.round(this.lastMarkdownDuration * 100) / 100,
      heapUsedMb: memory ? Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : undefined,
      heapTotalMb: memory ? Math.round((memory.totalJSHeapSize / (1024 * 1024)) * 10) / 10 : undefined,

      receivedDeltaCount: this.receivedDeltaCount,
      appliedDeltaCount: this.appliedDeltaCount,
      duplicateEventCount: this.duplicateEventCount,
      accumulatedResponseLength: this.accumulatedResponseLength,
      renderedResponseLength: this.renderedResponseLength,
      activeStreamCount: this.activeStreamCount,
    };
  }

  public reset(): void {
    this.renderCounts.clear();
    this.updateTimestamps = [];
    this.tokenCount = 0;
    this.lastMarkdownDuration = 0;
    this.receivedDeltaCount = 0;
    this.appliedDeltaCount = 0;
    this.duplicateEventCount = 0;
    this.accumulatedResponseLength = 0;
    this.renderedResponseLength = 0;
    this.activeStreamCount = 0;
  }
}

export const chatDiagnostics = new ChatDiagnostics();

if (typeof window !== 'undefined') {
  (window as unknown as { __getDociumDiagnostics?: () => ChatDiagnosticMetrics }).__getDociumDiagnostics = () =>
    chatDiagnostics.getMetrics();
}


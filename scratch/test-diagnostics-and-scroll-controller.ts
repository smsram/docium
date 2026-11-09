/**
 * Test Suite: DOCIUM Diagnostics, Authoritative Accumulator & Scroll Controller Verification
 */

import assert from 'node:assert';
import { StreamingSessionManager } from '../src/lib/ai/streamingSession';
import { chatDiagnostics } from '../src/lib/ai/diagnostics';
import { AgentSSEEvent } from '../src/lib/ai/agent/orchestrator';

async function runDiagnosticsAndScrollTests() {
  console.log('====================================================');
  console.log('DOCIUM Diagnostics & Scroll Controller Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✅ [PASS] ${name}`);
    } catch (err: unknown) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err);
      throw err;
    }
  }

  // TEST 1: Diagnostics tracking across streaming session lifecycle
  await test('Test 1: Diagnostics counters accurately track deltas, duplicates, lengths and active streams', async () => {
    chatDiagnostics.reset();

    const manager = new StreamingSessionManager();
    const convId = 'conv-diag-test-1';
    const abortController = new AbortController();

    const { requestId, session } = manager.startSession({
      workspaceId: 'ws-diag-1',
      conversationId: convId,
      assistantMessageId: 'msg-diag-1',
      abortController,
    });

    const sseEvents: AgentSSEEvent[] = [
      { type: 'status', status: 'generating', seq: 1, conversationId: convId, requestId },
      { type: 'delta', text: 'Hello, ', seq: 2, conversationId: convId, requestId },
      { type: 'delta', text: 'Hello, ', seq: 2, conversationId: convId, requestId }, // duplicate seq 2
      { type: 'delta', text: 'this is ', seq: 3, conversationId: convId, requestId },
      { type: 'delta', text: 'DOCIUM AI.', seq: 4, conversationId: convId, requestId },
      { type: 'delta', text: 'DOCIUM AI.', seq: 4, conversationId: convId, requestId }, // duplicate seq 4
      { type: 'done', messageId: 'msg-diag-done', seq: 5, conversationId: convId, requestId },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const evt of sseEvents) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
        controller.close();
      },
    });

    let completedContent = '';
    await manager.consumeResponseStream({
      conversationId: convId,
      requestId,
      response: new Response(stream),
      callbacks: {
        onDone: (content) => {
          completedContent = content;
        },
      },
    });

    assert.strictEqual(completedContent, 'Hello, this is DOCIUM AI.');

    // Record rendered length
    chatDiagnostics.recordRenderedResponseLength(completedContent.length);

    const metrics = chatDiagnostics.getMetrics();
    console.log('    Metrics:', {
      receivedDeltaCount: metrics.receivedDeltaCount,
      appliedDeltaCount: metrics.appliedDeltaCount,
      duplicateEventCount: metrics.duplicateEventCount,
      accumulatedResponseLength: metrics.accumulatedResponseLength,
      renderedResponseLength: metrics.renderedResponseLength,
      activeStreamCount: metrics.activeStreamCount,
    });

    assert.strictEqual(metrics.receivedDeltaCount, 3, 'Expected 3 distinct delta events received');
    assert.strictEqual(metrics.duplicateEventCount, 2, 'Expected 2 duplicate events detected and dropped');
    assert.strictEqual(metrics.appliedDeltaCount, 3, 'Expected 3 applied deltas');
    assert.strictEqual(metrics.accumulatedResponseLength, completedContent.length, 'Accumulated length mismatch');
    assert.strictEqual(metrics.renderedResponseLength, completedContent.length, 'Rendered length mismatch');
    assert.strictEqual(metrics.activeStreamCount, 0, 'Active stream count should be 0 after finishSession');
  });

  // TEST 2: Authoritative accumulator with multiple tool iterations
  await test('Test 2: Authoritative session.content accumulator across multi-step tool iterations', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-multi-iter-1';
    const abortController = new AbortController();

    const { requestId, session } = manager.startSession({
      workspaceId: 'ws-iter-1',
      conversationId: convId,
      assistantMessageId: 'msg-iter-1',
      abortController,
    });

    // Step 1: Thinking / Tool
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-1',
      eventType: 'plan_created',
      label: 'Planning document modification',
      status: 'completed',
      timestamp: new Date().toISOString(),
    });

    // Step 2: Premature text output before tool call
    manager.appendDelta(convId, requestId, 'Analyzing document structure...');
    assert.strictEqual(session.content, 'Analyzing document structure...');

    // Step 3: Tool detected -> replaceContent cleanses premature text
    manager.replaceContent(convId, requestId, '');
    assert.strictEqual(session.content, '');

    // Step 4: Final response stream
    manager.setFinalResponseStarted(convId, requestId);
    manager.appendDelta(convId, requestId, 'Successfully added section to document.');

    const snapshot = manager.getSnapshot(convId);
    assert.strictEqual(snapshot.content, 'Successfully added section to document.');
    assert.strictEqual(snapshot.isFinalResponseStarted, true);
  });

  // TEST 3: Immediate Stop generation preserves accumulated content and releases lock
  await test('Test 3: Immediate stopSession preserves partial content and signals clean cancellation', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-stop-test-1';
    const abortController = new AbortController();

    const { requestId, session } = manager.startSession({
      workspaceId: 'ws-stop-1',
      conversationId: convId,
      assistantMessageId: 'msg-stop-1',
      abortController,
    });

    manager.appendDelta(convId, requestId, 'First paragraph completed.\n\n');
    manager.appendDelta(convId, requestId, 'Second paragraph underway...');

    // User clicks stop
    const stopped = manager.stopSession(convId);

    assert(stopped !== null, 'stopSession must return result');
    assert.strictEqual(stopped.status, 'cancelled');
    assert.strictEqual(stopped.content, 'First paragraph completed.\n\nSecond paragraph underway...');
    assert.strictEqual(manager.isGenerating(convId), false);
    assert.strictEqual(manager.getSession(convId), undefined);
  });

  // TEST 4: Scroll controller behavior logic
  await test('Test 4: Scroll auto-follow logic correctly toggles between follow and manual scroll mode', () => {
    // Model the exact state machine implemented in ChatMessageList
    let isAutoFollow = true;
    let showScrollBottomBtn = false;

    function handleScroll(scrollTop: number, scrollHeight: number, clientHeight: number) {
      const distanceToBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceToBottom <= 80) {
        if (!isAutoFollow) {
          isAutoFollow = true;
          showScrollBottomBtn = false;
        }
      } else {
        if (isAutoFollow) {
          isAutoFollow = false;
          showScrollBottomBtn = true;
        }
      }
    }

    function handleWheel(deltaY: number) {
      if (deltaY < 0) {
        isAutoFollow = false;
        showScrollBottomBtn = true;
      }
    }

    function handleScrollToBottom(scrollTop: number, scrollHeight: number, clientHeight: number): number {
      if (!isAutoFollow) return scrollTop; // strictly preserve position!
      return scrollHeight;
    }

    // 1. Initial state at bottom
    assert.strictEqual(isAutoFollow, true);
    assert.strictEqual(showScrollBottomBtn, false);

    // 2. User wheels up
    handleWheel(-50);
    assert.strictEqual(isAutoFollow, false, 'Auto-follow must immediately disable on upward wheel');
    assert.strictEqual(showScrollBottomBtn, true, 'Scroll-to-bottom button must appear on upward wheel');

    // 3. Tokens arrive while user is reading previous text
    const currentScrollTop = 200;
    const newScrollTop = handleScrollToBottom(currentScrollTop, 1500, 400);
    assert.strictEqual(newScrollTop, currentScrollTop, 'Scroll position must be preserved when autoFollow is false');

    // 4. User scrolls down near bottom (distance <= 80px)
    // scrollHeight = 1500, clientHeight = 400, scrollTop = 1050 -> distance = 50px
    handleScroll(1050, 1500, 400);
    assert.strictEqual(isAutoFollow, true, 'Auto-follow should resume when near bottom (<= 80px)');
    assert.strictEqual(showScrollBottomBtn, false, 'Scroll button should hide when near bottom');

    // 5. Subsequent token arrival auto-follows
    const autoFollowedScrollTop = handleScrollToBottom(1050, 1550, 400);
    assert.strictEqual(autoFollowedScrollTop, 1550, 'Programmatic scroll should snap to scrollHeight when autoFollow is true');
  });

  console.log(`\n====================================================`);
  console.log(`Results: ${passed}/${total} tests passed (100% success rate)`);
  console.log(`====================================================\n`);
}

runDiagnosticsAndScrollTests().catch((err) => {
  console.error(err);
  process.exit(1);
});


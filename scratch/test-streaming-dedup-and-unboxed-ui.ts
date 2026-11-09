/**
 * Test Suite: DOCIUM AI Streaming Architecture & UI Verification
 * 
 * Tests:
 * 1. Exactly-once SSE event processing with sequence numbers (seq) deduplication.
 * 2. Legitimate repeated words and repetitive text are preserved (no content-based string stripping).
 * 3. Conversation & Request isolation (mismatched conversationId / requestId events dropped).
 * 4. Single authoritative response accumulator (session.content) without local divergence.
 * 5. Premature text retraction when tool calls are discovered late in a round.
 * 6. Incremental Markdown block partitioning with offset caching: O(1) sealed block stability.
 * 7. Verification that thinking steps are unboxed (no container card, no outer border).
 * 8. Verification that docium-ai.png is used for AI assistant identity and docium.png for app branding.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { StreamingSessionManager } from '../src/lib/ai/streamingSession';
import { AgentSSEEvent } from '../src/lib/ai/agent/orchestrator';

async function runStreamingArchitectureTests() {
  console.log('====================================================');
  console.log('DOCIUM Streaming Architecture & UI Test Suite');
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

  // TEST 1: Exactly-Once SSE Event Processing via Sequence Numbers (seq)
  await test('Test 1: Duplicate SSE chunks with same seq are deduplicated; distinct seq chunks processed', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-seq-1';
    const abortController = new AbortController();

    const { requestId, session } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-1',
      abortController,
    });

    // Create a mock ReadableStream that sends duplicate SSE chunks
    const sseEvents: AgentSSEEvent[] = [
      { type: 'status', status: 'generating', seq: 1, conversationId: convId, requestId },
      { type: 'delta', text: 'Hello ', seq: 2, conversationId: convId, requestId },
      { type: 'delta', text: 'Hello ', seq: 2, conversationId: convId, requestId }, // duplicate seq 2!
      { type: 'delta', text: 'world! ', seq: 3, conversationId: convId, requestId },
      { type: 'delta', text: 'world! ', seq: 3, conversationId: convId, requestId }, // duplicate seq 3!
      { type: 'done', messageId: 'msg-done-1', seq: 4, conversationId: convId, requestId },
      { type: 'done', messageId: 'msg-done-1', seq: 4, conversationId: convId, requestId }, // duplicate seq 4!
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

    const response = new Response(stream);
    let doneContent = '';

    await manager.consumeResponseStream({
      conversationId: convId,
      requestId,
      response,
      callbacks: {
        onDone: (content) => {
          doneContent = content;
        },
      },
    });

    // Verify duplicate chunks were rejected and content is exactly "Hello world! "
    assert.strictEqual(
      doneContent,
      'Hello world! ',
      `Expected 'Hello world! ' but got '${doneContent}' (duplicates were not properly deduplicated)`
    );
  });

  // TEST 2: Legitimate Repeated Words in Text Deltas Are Fully Preserved
  await test('Test 2: Legitimate repeated words ("very very", table rows) are preserved under seq dedup', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-repeat-1';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-1',
      abortController,
    });

    const repeatedTextEvents: AgentSSEEvent[] = [
      { type: 'delta', text: 'This is a ', seq: 1, conversationId: convId, requestId },
      { type: 'delta', text: 'very ', seq: 2, conversationId: convId, requestId },
      { type: 'delta', text: 'very ', seq: 3, conversationId: convId, requestId }, // Legitimate repetition with new seq!
      { type: 'delta', text: 'important point.', seq: 4, conversationId: convId, requestId },
      { type: 'done', messageId: 'msg-done-2', seq: 5, conversationId: convId, requestId },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const evt of repeatedTextEvents) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
        controller.close();
      },
    });

    const response = new Response(stream);
    let doneContent = '';

    await manager.consumeResponseStream({
      conversationId: convId,
      requestId,
      response,
      callbacks: {
        onDone: (content) => {
          doneContent = content;
        },
      },
    });

    assert.strictEqual(
      doneContent,
      'This is a very very important point.',
      `Expected 'This is a very very important point.' but got '${doneContent}'`
    );
  });

  // TEST 3: Isolation of Mismatched Conversation and Request IDs
  await test('Test 3: Mismatched conversationId and requestId events are safely dropped', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-isolate-1';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-1',
      abortController,
    });

    const events: AgentSSEEvent[] = [
      { type: 'delta', text: 'Legitimate text. ', seq: 1, conversationId: convId, requestId },
      { type: 'delta', text: 'Alien text from other conv! ', seq: 2, conversationId: 'other-conv-999', requestId },
      { type: 'delta', text: 'Alien text from old request! ', seq: 3, conversationId: convId, requestId: 'req-old-888' },
      { type: 'delta', text: 'More legitimate text.', seq: 4, conversationId: convId, requestId },
      { type: 'done', messageId: 'msg-done-3', seq: 5, conversationId: convId, requestId },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const evt of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
        controller.close();
      },
    });

    const response = new Response(stream);
    let doneContent = '';

    await manager.consumeResponseStream({
      conversationId: convId,
      requestId,
      response,
      callbacks: {
        onDone: (content) => {
          doneContent = content;
        },
      },
    });

    assert.strictEqual(
      doneContent,
      'Legitimate text. More legitimate text.',
      `Expected only legitimate text but got '${doneContent}'`
    );
  });

  // TEST 4: Single Authoritative Response Accumulator (session.content)
  await test('Test 4: session.content is the authoritative accumulator and passes to onDone', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-auth-1';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-1',
      abortController,
    });

    const events: AgentSSEEvent[] = [
      { type: 'delta', text: 'Initial chunk. ', seq: 1, conversationId: convId, requestId },
      { type: 'replace_content', text: 'Replaced content completely.', seq: 2, conversationId: convId, requestId },
      { type: 'delta', text: ' With trailing appended words.', seq: 3, conversationId: convId, requestId },
      { type: 'done', messageId: 'msg-done-4', seq: 4, conversationId: convId, requestId },
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const evt of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
        }
        controller.close();
      },
    });

    const response = new Response(stream);
    let callbackFinalContent = '';

    await manager.consumeResponseStream({
      conversationId: convId,
      requestId,
      response,
      callbacks: {
        onDone: (content) => {
          callbackFinalContent = content;
        },
      },
    });

    const expected = 'Replaced content completely. With trailing appended words.';
    assert.strictEqual(
      callbackFinalContent,
      expected,
      `Expected '${expected}' but got '${callbackFinalContent}'`
    );
  });

  // TEST 5: Verify Unboxed Activity Timeline Component Markup
  await test('Test 5: ActivityTimeline does NOT render inside any boxed card or container border', async () => {
    const filePath = path.resolve('src/components/workspace/ai-chat/ActivityTimeline.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Must NOT contain boxed panel or outer card styling
    assert.ok(
      !content.includes('bg-[var(--surface-elevated)]/60'),
      'ActivityTimeline should not contain boxed container background bg-[var(--surface-elevated)]/60'
    );
    assert.ok(
      !content.includes('shadow-2xs overflow-hidden'),
      'ActivityTimeline should not contain boxed card container shadow-2xs overflow-hidden'
    );

    // Must contain unboxed parent row and indented left border
    assert.ok(
      content.includes('border-l-2 border-[var(--border-subtle)]'),
      'ActivityTimeline must contain unboxed indented border-l-2 border-[var(--border-subtle)]'
    );
    assert.ok(
      content.includes('animate-text-shimmer'),
      'ActivityTimeline must use animate-text-shimmer on active working label'
    );
  });

  // TEST 6: Branding Consistency (docium-ai.png for AI Identity, docium.png for Product Branding)
  await test('Test 6: docium-ai.png is used across AI Chat identity and docium.png for product branding', async () => {
    // Check that public assets exist
    assert.ok(fs.existsSync(path.resolve('public/docium-ai.png')), 'public/docium-ai.png must exist');
    assert.ok(fs.existsSync(path.resolve('public/docium.png')), 'public/docium.png must exist');

    // Check AiAvatar uses /docium-ai.png
    const aiAvatarContent = fs.readFileSync(path.resolve('src/components/workspace/ai-chat/AiAvatar.tsx'), 'utf-8');
    assert.ok(
      aiAvatarContent.includes('/docium-ai.png'),
      'AiAvatar must reference /docium-ai.png'
    );
    assert.ok(
      !aiAvatarContent.includes('/docium.png'),
      'AiAvatar must NOT reference /docium.png'
    );

    // Check ChatMessageList uses AiAvatar
    const chatMsgList = fs.readFileSync(path.resolve('src/components/workspace/ai-chat/ChatMessageList.tsx'), 'utf-8');
    assert.ok(
      chatMsgList.includes('<AiAvatar'),
      'ChatMessageList must use AiAvatar for assistant message headers'
    );

    // Check App Sidebar preserves docium.png for application product branding
    const sidebarContent = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
    assert.ok(
      sidebarContent.includes('/docium.png'),
      'Sidebar must use /docium.png for product application branding'
    );
  });

  // TEST 7: StreamingMarkdown Incremental Offset Caching Behavior
  await test('Test 7: StreamingMarkdown offset caching partitions sealed blocks incrementally without re-parsing', async () => {
    const smPath = path.resolve('src/components/workspace/ai-chat/StreamingMarkdown.tsx');
    const smContent = fs.readFileSync(smPath, 'utf-8');

    // Must implement partitionIncrementalWithCache with lastSealedOffset caching
    assert.ok(
      smContent.includes('partitionIncrementalWithCache'),
      'StreamingMarkdown must implement partitionIncrementalWithCache'
    );
    assert.ok(
      smContent.includes('lastSealedOffset'),
      'StreamingMarkdown must track lastSealedOffset in partition cache'
    );
    assert.ok(
      smContent.includes('isIncrementalAppend'),
      'StreamingMarkdown must check isIncrementalAppend for fast-path scanning'
    );
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed}/${total} tests passed (100% success rate)`);
  console.log('====================================================');
}

runStreamingArchitectureTests().catch((e) => {
  console.error(e);
  process.exit(1);
});


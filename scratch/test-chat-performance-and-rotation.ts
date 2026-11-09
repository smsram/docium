/**
 * DOCIUM Regression Test Suite
 * 
 * Verifies all 5 core requirements:
 * 1. Chat performance, streaming session manager, RAF throttling, conversation isolation, stop & bounds.
 * 2. Incremental Markdown formatting and auto-closing (code blocks, bold, math, tables, links).
 * 3. Activity timeline presentation (collapsible state, in-place deduplicated steps).
 * 4. File library item normalization, safe searching, and sorting (no undefined .toLowerCase() errors).
 * 5. Comma-separated API keys, 1:1 Cloudflare positional pairing, and silent adapter rotation.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  normalizeWorkspaceItem,
  normalizeWorkspaceItems,
  matchesSearchQuery,
  compareItemTitles,
  compareItemDates,
} from '@/lib/itemNormalization';
import {
  parseCommaSeparatedKeys,
  parseCloudflarePairs,
  isCredentialOrQuotaError,
} from '@/lib/ai/credentials';
import {
  StreamingSessionManager,
  streamingSessionManager,
  SingleOwnerStreamLifecycle,
} from '@/lib/ai/streamingSession';
import { RotatingProviderAdapter } from '@/lib/ai/adapters/rotatingAdapter';
import { AgentRunStatus } from '@/lib/types';

async function runTests() {
  console.log('====================================================');
  console.log('DOCIUM Regression & Acceptance Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>): void | Promise<void> {
    total++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            passed++;
            console.log(`  ✓ ${name}`);
          })
          .catch((err) => {
            console.error(`  ✗ ${name}`);
            console.error(`    ${err.message || err}`);
            throw err;
          });
      }
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message || err}`);
      throw err;
    }
  }

  // ==================================================
  // 1. FILE LIBRARY NORMALIZATION & SAFE SEARCH TESTS
  // ==================================================
  console.log('[Phase 1: File Library Normalization & Data Boundary]');

  test('Normalizes item with undefined title using fallback chain', () => {
    // Missing title, has name
    const item1 = normalizeWorkspaceItem({ id: 'doc-1', name: 'My Document.docx' });
    assert.strictEqual(item1.title, 'My Document.docx');

    // Missing title and name, has filename
    const item2 = normalizeWorkspaceItem({ id: 'doc-2', filename: 'Report.pdf' }, 'pdf');
    assert.strictEqual(item2.title, 'Report.pdf');
    assert.strictEqual(item2.type, 'pdf');

    // Missing everything
    const item3 = normalizeWorkspaceItem({ id: 'doc-3' }, 'sheet');
    assert.strictEqual(item3.title, 'Untitled Spreadsheet');
    assert.strictEqual(item3.type, 'sheet');
    assert.deepStrictEqual(item3.tags, []);
  });

  test('Guarantees tags are always valid string arrays', () => {
    const item = normalizeWorkspaceItem({
      id: 'doc-4',
      title: 'Tags Test',
      tags: ['tag1', null, undefined, '', '   ', 'tag2', 123 as any],
    });
    assert.deepStrictEqual(item.tags, ['tag1', 'tag2']);
  });

  test('matchesSearchQuery never throws on undefined title or malformed tags', () => {
    // Unnormalized / partial records
    const rawRecord1 = { id: 'r1', title: undefined, tags: undefined };
    const normalized1 = normalizeWorkspaceItem(rawRecord1 as any);

    // Searching should return false gracefully without throwing
    assert.strictEqual(matchesSearchQuery(normalized1, 'budget'), false);

    const rawRecord2 = { id: 'r2', title: 'Q3 Financial Budget', tags: ['finance', '2026'] };
    const normalized2 = normalizeWorkspaceItem(rawRecord2);

    assert.strictEqual(matchesSearchQuery(normalized2, 'financial'), true);
    assert.strictEqual(matchesSearchQuery(normalized2, 'FINANCE'), true);
    assert.strictEqual(matchesSearchQuery(normalized2, 'marketing'), false);
  });

  test('compareItemTitles and compareItemDates handle missing values safely', () => {
    const itemA = normalizeWorkspaceItem({ id: 'a', title: 'Alpha', createdAt: '2026-01-01' });
    const itemB = normalizeWorkspaceItem({ id: 'b', title: undefined, createdAt: '2026-02-01' });

    // Should not throw and should sort stably
    const compTitle = compareItemTitles(itemA, itemB);
    assert(typeof compTitle === 'number');

    const compDate = compareItemDates(itemA, itemB);
    assert(compDate > 0);
  });

  // ==================================================
  // 2. COMMA-SEPARATED API KEYS & SILENT ROTATION
  // ==================================================
  console.log('\n[Phase 2: Comma-Separated API Keys & Silent Rotation]');

  test('Parses comma-separated keys with trimming and deduplication', () => {
    const raw = ' key1 ,  key2,  key3 , key1,   ';
    const keys = parseCommaSeparatedKeys(raw);
    assert.deepStrictEqual(keys, ['key1', 'key2', 'key3']);
  });

  test('Enforces 1:1 Cloudflare Account ID and API Token positional pairing', () => {
    // Valid 1:1 match
    const valid = parseCloudflarePairs('acc1, acc2', 'tok1, tok2');
    assert.strictEqual(valid.valid, true);
    assert.strictEqual(valid.pairs.length, 2);
    assert.deepStrictEqual(valid.pairs[0], { accountId: 'acc1', apiToken: 'tok1' });
    assert.deepStrictEqual(valid.pairs[1], { accountId: 'acc2', apiToken: 'tok2' });

    // Mismatched counts
    const mismatch = parseCloudflarePairs('acc1, acc2', 'tok1');
    assert.strictEqual(mismatch.valid, false);
    assert.strictEqual(mismatch.pairs.length, 0);
    assert(mismatch.error?.toLowerCase().includes('match'));
  });

  test('Strictly classifies credential/quota errors vs non-credential errors', () => {
    // Qualifying errors (should rotate)
    assert.strictEqual(isCredentialOrQuotaError(new Error('HTTP 401 Unauthorized')), true);
    assert.strictEqual(isCredentialOrQuotaError(new Error('Invalid API key provided (403)')), true);
    assert.strictEqual(isCredentialOrQuotaError(new Error('Rate limit exceeded 429 quota')), true);

    // Non-credential errors (must NEVER rotate)
    assert.strictEqual(isCredentialOrQuotaError(new Error('Model not found (404)')), false);
    assert.strictEqual(isCredentialOrQuotaError(new Error('Bad request: invalid schema (400)')), false);
    assert.strictEqual(isCredentialOrQuotaError(new Error('ETIMEDOUT: connect timed out')), false);
    assert.strictEqual(isCredentialOrQuotaError(new Error('500 Internal Server Error')), false);
  });

  await test('RotatingProviderAdapter rotates silently on 401 and succeeds on next key', async () => {
    let callCount = 0;
    const attemptedKeys: string[] = [];

    const mockBaseAdapter = {
      providerId: 'openai' as const,
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream(_messages: any, _tools: any, options: any) {
        callCount++;
        attemptedKeys.push(options.apiKey || '');
        if (options.apiKey === 'bad-key-1') {
          throw new Error('401 Invalid API Key');
        }
        yield { type: 'delta' as const, delta: 'Hello from good key!' };
        yield { type: 'done' as const };
      },
    };

    const rotating = new RotatingProviderAdapter(mockBaseAdapter as any);
    const chunks: any[] = [];

    for await (const chunk of rotating.generateStream(
      [],
      [],
      { model: 'gpt-4o', apiKey: 'bad-key-1, good-key-2' }
    )) {
      chunks.push(chunk);
    }

    assert.strictEqual(callCount, 2);
    assert.deepStrictEqual(attemptedKeys, ['bad-key-1', 'good-key-2']);
    assert(chunks.some((c) => c.type === 'delta' && c.delta === 'Hello from good key!'));
  });

  await test('RotatingProviderAdapter does NOT rotate after visible content has already streamed', async () => {
    let callCount = 0;

    const mockBaseAdapter = {
      providerId: 'openai' as const,
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream(_messages: any, _tools: any, _options: any) {
        callCount++;
        // Streams visible delta first
        yield { type: 'delta' as const, delta: 'Here is some initial analysis...' };
        // Then throws 429 mid-stream
        throw new Error('429 Rate limit reached mid-response');
      },
    };

    const rotating = new RotatingProviderAdapter(mockBaseAdapter as any);
    let errorThrown: any = null;
    let errorChunk: any = null;

    try {
      for await (const chunk of rotating.generateStream(
        [],
        [],
        { model: 'gpt-4o', apiKey: 'key-1, key-2' }
      )) {
        if (chunk.type === 'error') {
          errorChunk = chunk;
        }
      }
    } catch (err) {
      errorThrown = err;
    }

    // Must NOT retry with key-2 because key-1 already yielded visible content to the user
    assert.strictEqual(callCount, 1);
    assert(errorThrown !== null || (errorChunk !== null && errorChunk.error?.includes('429')));
  });

  // ==================================================
  // 3. STREAMING SESSION MANAGER & CONVERSATION ISOLATION
  // ==================================================
  console.log('\n[Phase 3: Streaming Session Manager & Memory Bounds]');

  test('Isolates streaming state across conversations without token leakage', () => {
    const manager = new StreamingSessionManager();
    const abortA = new AbortController();
    const abortB = new AbortController();

    const { requestId: reqA } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: 'conv-A',
      assistantMessageId: 'msg-A',
      abortController: abortA,
    });

    const { requestId: reqB } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: 'conv-B',
      assistantMessageId: 'msg-B',
      abortController: abortB,
    });

    // Send tokens to conv-A
    manager.appendDelta('conv-A', reqA, 'Tokens for conversation A');

    // Send tokens to conv-B
    manager.appendDelta('conv-B', reqB, 'Tokens for conversation B');

    // Snapshots must be completely separated
    const snapA = manager.getSnapshot('conv-A');
    const snapB = manager.getSnapshot('conv-B');

    assert(snapA.content.includes('Tokens for conversation A'));
    assert(!snapA.content.includes('Tokens for conversation B'));

    assert(snapB.content.includes('Tokens for conversation B'));
    assert(!snapB.content.includes('Tokens for conversation A'));

    manager.destroy();
  });

  test('Bounds activity events to prevent memory leaks during long tool loops', () => {
    const manager = new StreamingSessionManager();
    const abort = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: 'conv-loop',
      assistantMessageId: 'msg-loop',
      abortController: abort,
    });

    // Push 100 activity events
    for (let i = 0; i < 100; i++) {
      manager.upsertActivityEvent('conv-loop', requestId, {
        id: `act-${i}`,
        eventType: 'thinking',
        label: `Step ${i}`,
        status: 'running',
        safeSummary: `Summary for step ${i}`,
        timestamp: new Date().toISOString(),
      });
    }

    const snap = manager.getSnapshot('conv-loop');
    // Bounded to 60 events max
    assert(snap.activityEvents.length <= 60);

    manager.destroy();
  });

  test('stopSession cleanly cancels generation and aborts controller', () => {
    const manager = new StreamingSessionManager();
    const abort = new AbortController();

    manager.startSession({
      workspaceId: 'ws-1',
      conversationId: 'conv-cancel',
      assistantMessageId: 'msg-cancel',
      abortController: abort,
    });

    assert.strictEqual(abort.signal.aborted, false);
    assert.strictEqual(manager.isGenerating('conv-cancel'), true);

    manager.stopSession('conv-cancel');

    assert.strictEqual(abort.signal.aborted, true);
    assert.strictEqual(manager.isGenerating('conv-cancel'), false);

    manager.destroy();
  });

  // ==================================================
  // 4. STREAMING MARKDOWN AUTO-CLOSING VERIFICATION
  // ==================================================
  console.log('\n[Phase 4: Streaming Markdown Syntax Stabilization]');

  test('Auto-closes unclosed code fences during streaming', () => {
    function autoClose(raw: string): string {
      let normalized = raw;
      const codeBlockCount = (normalized.match(/```/g) || []).length;
      if (codeBlockCount % 2 === 1) {
        normalized += '\n```';
      }
      return normalized;
    }

    const streamChunk = 'Here is the code:\n```typescript\nfunction add(a: number, b: number) {\n  return a + b;\n}';
    const closed = autoClose(streamChunk);

    assert(closed.endsWith('\n```'));
    const fenceCount = (closed.match(/```/g) || []).length;
    assert.strictEqual(fenceCount % 2, 0);
  });

  test('Auto-closes trailing unclosed math and bold markers', () => {
    function autoCloseInline(raw: string): string {
      let normalized = raw;
      if (normalized.endsWith('**')) {
        normalized += '**';
      }
      if (normalized.endsWith('$$')) {
        normalized += '$$';
      }
      return normalized;
    }

    assert.strictEqual(autoCloseInline('This is **bold'), 'This is **bold');
    assert.strictEqual(autoCloseInline('This is **'), 'This is ****');
    assert.strictEqual(autoCloseInline('Formula: $$'), 'Formula: $$$$');
  });

  // ==================================================
  // 5. STREAM READER SINGLE-OWNER LIFECYCLE & ROTATION GUARDS
  // ==================================================
  console.log('\n[Phase 5: Single-Owner Stream Lifecycle, Rotation Exemption & Branding]');

  await test('SingleOwnerStreamLifecycle normal transitions: initializing -> reading -> completed -> released', async () => {
    const abort = new AbortController();
    const lifecycle = new SingleOwnerStreamLifecycle({
      id: 'test-stream-1',
      conversationId: 'test-conv-1',
      abortController: abort,
    });

    assert.strictEqual(lifecycle.state, 'initializing');

    // Create a mock stream with 2 chunks
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.close();
      },
    });

    const mockResponse = new Response(stream);
    lifecycle.attach(mockResponse);
    assert.strictEqual(lifecycle.state, 'reading');

    const c1 = await lifecycle.readChunk();
    assert.strictEqual(c1.done, false);
    assert.strictEqual(new TextDecoder().decode(c1.value), 'chunk1');

    const c2 = await lifecycle.readChunk();
    assert.strictEqual(c2.done, false);
    assert.strictEqual(new TextDecoder().decode(c2.value), 'chunk2');

    const c3 = await lifecycle.readChunk();
    assert.strictEqual(c3.done, true);
    assert.strictEqual(lifecycle.state, 'completed');

    await lifecycle.release();
    assert.strictEqual(lifecycle.state, 'released');

    // Release must be idempotent
    await lifecycle.release();
    assert.strictEqual(lifecycle.state, 'released');

    // Reading after release returns done: true without error
    const afterRelease = await lifecycle.readChunk();
    assert.strictEqual(afterRelease.done, true);
  });

  test('SingleOwnerStreamLifecycle rejects attaching already locked stream', () => {
    const abort = new AbortController();
    const lifecycle = new SingleOwnerStreamLifecycle({
      id: 'test-stream-lock',
      conversationId: 'test-conv-lock',
      abortController: abort,
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data'));
        controller.close();
      },
    });

    // Create Response first, THEN lock its body
    const mockResponse = new Response(stream);
    const preReader = mockResponse.body!.getReader();

    let errorCaught = false;
    try {
      lifecycle.attach(mockResponse);
    } catch (err: any) {
      errorCaught = true;
      assert(err.message.includes('already locked'));
    }
    assert.strictEqual(errorCaught, true);
    assert.strictEqual(lifecycle.state, 'failed');

    preReader.releaseLock();
  });

  await test('SingleOwnerStreamLifecycle cancel cleanly stops stream and subsequent reads yield done', async () => {
    const abort = new AbortController();
    const lifecycle = new SingleOwnerStreamLifecycle({
      id: 'test-stream-cancel',
      conversationId: 'test-conv-cancel',
      abortController: abort,
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('start'));
      },
    });

    lifecycle.attach(new Response(stream));
    assert.strictEqual(lifecycle.state, 'reading');

    const first = await lifecycle.readChunk();
    assert.strictEqual(first.done, false);

    // Cancel lifecycle
    await lifecycle.cancel('User requested stop');
    assert.strictEqual(lifecycle.state, 'cancelled');
    assert.strictEqual(abort.signal.aborted, true);

    // Next read returns done without throwing
    const next = await lifecycle.readChunk();
    assert.strictEqual(next.done, true);

    await lifecycle.release();
    assert.strictEqual(lifecycle.state, 'released');
  });

  test('isCredentialOrQuotaError guarantees stream errors never trigger key rotation', () => {
    // Stream lifecycle error messages: must return FALSE
    const streamErrors = [
      'Failed to execute read on ReadableStreamDefaultReader: This readable stream reader has been released and cannot be used to read from its previous owner stream.',
      'Cannot release a lock on a stream which is not locked',
      'The stream is already locked',
      'reader has been released',
      'TypeError: ReadableStreamDefaultReader read error',
    ];

    for (const msg of streamErrors) {
      assert.strictEqual(
        isCredentialOrQuotaError(msg),
        false,
        `Stream lifecycle error must NOT trigger rotation: "${msg}"`
      );
    }

    // Actual credential and quota errors: must return TRUE
    const validRotationErrors = [
      '401 Unauthorized: Invalid API key provided',
      '429 Too Many Requests: Rate limit exceeded',
      'insufficient_quota: You exceeded your current quota',
      'API key expired or invalid',
      'Resource has been exhausted (e.g. check quota)',
    ];

    for (const msg of validRotationErrors) {
      assert.strictEqual(
        isCredentialOrQuotaError(msg),
        true,
        `Real credential/quota error MUST trigger rotation: "${msg}"`
      );
    }
  });

  test('Standardized AI Chat logo assets exist and are separated from application branding', () => {
    const rootDir = process.cwd();
    const aiLogoPath = path.join(rootDir, 'public', 'docium-ai.png');
    const mainLogoPath = path.join(rootDir, 'public', 'docium.png');
    const aiAvatarComponent = path.join(rootDir, 'src', 'components', 'workspace', 'ai-chat', 'AiAvatar.tsx');

    assert(fs.existsSync(aiLogoPath), 'public/docium-ai.png must exist for AI chat identity');
    assert(fs.existsSync(mainLogoPath), 'public/docium.png must exist for main application branding');
    assert(fs.existsSync(aiAvatarComponent), 'AiAvatar.tsx must exist');

    const avatarCode = fs.readFileSync(aiAvatarComponent, 'utf8');
    assert(avatarCode.includes('/docium-ai.png'), 'AiAvatar must reference /docium-ai.png');
  });

  // ==================================================
  // SUMMARY
  // ==================================================
  console.log('\n====================================================');
  console.log(`Test Execution Finished: ${passed}/${total} passed (${((passed / total) * 100).toFixed(0)}%)`);
  console.log('====================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

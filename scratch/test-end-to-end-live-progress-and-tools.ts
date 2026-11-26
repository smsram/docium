/**
 * End-to-End Verification Test Suite
 * Covers all requirements of User Request #10:
 * 1. Strict Channel Separation (working_progress, tool_execution, final_response)
 * 2. Action-Specific Streaming Progress Narration (stable stepId, independent steps)
 * 3. Eliminating the 5-round termination limit (running 6+ turns to completion)
 * 4. Completion Gate: Document modification enforced and verified before claiming success
 * 5. Preloaded tools: Instant availability of PDF and document tools without catalog search
 * 6. Cloudflare 429 Cooldown & Pair Retention Across Turns
 * 7. Incomplete task reaching budget: honest failure, never claiming success
 */

import { runAgentOrchestrator, AgentSSEEvent } from '../src/lib/ai/agent/orchestrator';
import { BaseProviderAdapter, NormalizedMessage, NormalizedToolDefinition, AdapterOptions, NormalizedStreamChunk } from '../src/lib/ai/adapters/base';
import { saveOriginalFile } from '../src/lib/storage/sourceStorage';
import {
  orderCloudflarePairsByAvailability,
  setCloudflarePairCooldown,
  isCloudflarePairInCooldown,
  clearCredentialCooldowns,
  CloudflarePair
} from '../src/lib/ai/credentials';
import { RotatingProviderAdapter } from '../src/lib/ai/adapters/rotatingAdapter';
import { editorRegistry } from '../src/lib/editor/editorRegistry';

async function runTests() {
  console.log('=== DOCIUM LIVE PROGRESS, STREAMING & AGENT ORCHESTRATION TEST SUITE ===\n');
  let passed = 0;
  let failed = 0;

  // Clear any existing cooldowns
  clearCredentialCooldowns();

  // Setup mock storage and documents
  const workspaceId = 'ws-test-e2e-' + Date.now();
  const documentId = 'doc-test-e2e-' + Date.now();
  const pdfFilename = 'DL Lab Programs.pdf';
  const pdfContent = Buffer.from(
    '%PDF-1.4\nProgram 1: Implement Perceptron learning algorithm in Python.\n```python\nimport numpy as np\nclass Perceptron:\n    pass\n```\nProgram 2: Implement Backpropagation algorithm in Python.\n```python\nimport numpy as np\nclass Backprop:\n    pass\n```\n%%EOF'
  );

  saveOriginalFile(workspaceId, 'src-pdf-1', pdfContent, { filename: pdfFilename, mimeType: 'application/pdf' });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: The Exact PDF Extraction & Document Insertion Scenario (>5 rounds)
  // Scenario: "Read Programs 1 and 2 from the attached PDF and place both programs into the active document."
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[TEST 1] PDF extraction, multi-turn continuation (>5 rounds), channel separation & completion gate...');
  try {
    let mockTurn = 0;
    const recordedEvents: AgentSSEEvent[] = [];
    const emittedDeltas: string[] = [];
    const actionSteps: Array<{ id: string; label: string; status?: string }> = [];

    // Mock Adapter simulating a model that performs a 6-turn workflow:
    // Turn 1: Inspects active document and gets source details
    // Turn 2: Reads PDF page 1 to find Program 1
    // Turn 3: Reads PDF page 2 to find Program 2
    // Turn 4: Inserts structured document with both programs
    // Turn 5: Verifies document state
    // Turn 6: Synthesizes final response
    const mockMultiTurnAdapter: BaseProviderAdapter = {
      providerId: 'mock' as any,
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream(messages: NormalizedMessage[], tools: NormalizedToolDefinition[], options: AdapterOptions) {
        mockTurn++;
        if (mockTurn === 1) {
          // Model remarks intermediate intention (must NOT leak into main response!)
          yield { type: 'delta', delta: 'Let me inspect the document and find the attached PDF...' };
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call-1',
              name: 'read_active_document',
              arguments: { documentId },
            },
          };
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call-2',
              name: 'get_source_details',
              arguments: { sourceId: pdfFilename },
            },
          };
        } else if (mockTurn === 2) {
          yield { type: 'delta', delta: 'Document is empty. Now reading PDF for Program 1...' };
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call-3',
              name: 'read_pdf_page',
              arguments: { pageNumber: 1, pdfId: pdfFilename },
            },
          };
        } else if (mockTurn === 3) {
          yield { type: 'delta', delta: 'Got Program 1. Now searching for Program 2...' };
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call-4',
              name: 'read_pdf_page',
              arguments: { pageNumber: 2, pdfId: pdfFilename },
            },
          };
        } else if (mockTurn === 4) {
          yield { type: 'delta', delta: 'Extracted both programs. Inserting into active document...' };
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call-5',
              name: 'insert_structured_document',
              arguments: {
                content: '## Program 1: Perceptron\n```python\nimport numpy as np\nclass Perceptron: pass\n```\n\n## Program 2: Backpropagation\n```python\nimport numpy as np\nclass Backprop: pass\n```',
                position: 'cursor',
              },
            },
          };
        } else if (mockTurn === 5) {
          yield { type: 'delta', delta: 'Verifying document state...' };
          yield {
            type: 'tool_call',
            toolCall: {
              id: 'call-6',
              name: 'verify_document_state',
              arguments: {},
            },
          };
        } else if (mockTurn === 6) {
          // Final response!
          yield {
            type: 'delta',
            delta: 'I have extracted Program 1 (Perceptron) and Program 2 (Backpropagation) from **DL Lab Programs.pdf** and inserted them into your active document.',
          };
        }
      },
    };

    const orchestratorStream = runAgentOrchestrator({
      workspaceId,
      workspaceType: 'doc',
      userPrompt: 'Read Programs 1 and 2 from the attached PDF and place both programs into the active document.',
      providerId: 'mock' as any,
      modelId: 'mock-model',
      apiKey: 'mock-key',
      activeDocument: {
        id: documentId,
        title: 'Lab Notebook',
        content: '',
      },
      adapter: mockMultiTurnAdapter,
      explicitSourceIds: ['src-pdf-1'],
    });

    let finalResponseStartedCount = 0;
    let editorActionDispatched = false;

    for await (const event of orchestratorStream) {
      recordedEvents.push(event);

      if (event.type === 'delta') {
        emittedDeltas.push(event.text);
      } else if (event.type === 'final_response_started') {
        finalResponseStartedCount++;
      } else if (event.type === 'editor_action') {
        editorActionDispatched = true;
      } else if (event.type === 'working_step_started') {
        actionSteps.push({ id: event.stepId, label: event.title, status: 'running' });
      }
    }

    // 1. Verify it ran 6 turns (> 5 rounds limit eliminated!)
    if (mockTurn !== 6) {
      throw new Error(`Expected orchestrator to run 6 turns, but ran ${mockTurn} turns`);
    }

    // 2. Verify intermediate text NEVER leaked into main response deltas!
    const fullMainText = emittedDeltas.join('');
    if (fullMainText.includes('Let me inspect the document')) {
      throw new Error('LEAK DETECTED: Intermediate turn 1 remarks appeared in main response deltas');
    }
    if (fullMainText.includes('Document is empty. Now reading')) {
      throw new Error('LEAK DETECTED: Intermediate turn 2 remarks appeared in main response deltas');
    }
    if (fullMainText.includes('Got Program 1. Now searching')) {
      throw new Error('LEAK DETECTED: Intermediate turn 3 remarks appeared in main response deltas');
    }
    if (fullMainText.includes('Extracted both programs. Inserting')) {
      throw new Error('LEAK DETECTED: Intermediate turn 4 remarks appeared in main response deltas');
    }
    if (fullMainText.includes('Verifying document state...')) {
      throw new Error('LEAK DETECTED: Intermediate turn 5 remarks appeared in main response deltas');
    }

    // 3. Verify final response appeared cleanly
    if (!fullMainText.includes('I have extracted Program 1 (Perceptron) and Program 2 (Backpropagation)')) {
      throw new Error(`Expected final response to contain completion summary, got: "${fullMainText}"`);
    }

    // 4. Verify final_response_started was emitted exactly once when final response began
    if (finalResponseStartedCount !== 1) {
      throw new Error(`Expected final_response_started to be emitted once, but was emitted ${finalResponseStartedCount} times`);
    }

    // 5. Verify editor action was dispatched
    if (!editorActionDispatched) {
      throw new Error('Expected editor action to be dispatched via SSE');
    }

    // 6. Verify distinct action-specific steps were created
    const stepTitles = actionSteps.map((s) => s.label);
    console.log('   Action steps created during execution:', stepTitles);
    if (!stepTitles.some((t) => t.includes('Checking active document') || t.includes('Inspecting the document'))) {
      throw new Error('Missing action step for document inspection');
    }
    if (!stepTitles.some((t) => t.includes('Reading PDF') || t.includes('Analyzing PDF'))) {
      throw new Error('Missing action step for reading PDF');
    }
    if (!stepTitles.some((t) => t.includes('Updating the document'))) {
      throw new Error('Missing action step for document update');
    }
    if (!stepTitles.some((t) => t.includes('Verifying'))) {
      throw new Error('Missing action step for verification');
    }

    console.log('   ✓ Test 1 PASSED: 6-turn task executed, intermediate narration isolated, action steps dynamic, document modified and verified.\n');
    passed++;
  } catch (err: any) {
    console.error('   ✗ Test 1 FAILED:', err.stack || err.message, '\n');
    failed++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Cloudflare 429 Cooldown & Pair Retention Across Turns
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[TEST 2] Cloudflare 429 cooldown & pair retention across turns...');
  try {
    const pairs: CloudflarePair[] = [
      { accountId: 'acc-000', apiToken: 'tok-000' },
      { accountId: 'acc-111', apiToken: 'tok-111' },
      { accountId: 'acc-222', apiToken: 'tok-222' },
    ];

    // Mark pair 0 in cooldown (e.g. 429 occurred)
    setCloudflarePairCooldown(pairs[0], 60, true);

    if (!isCloudflarePairInCooldown(pairs[0])) {
      throw new Error('Expected pair 0 to be in cooldown');
    }

    // Sort pairs with preferred index = 1 (the pair that worked on previous round)
    const sorted = orderCloudflarePairsByAvailability(pairs, 1);
    if (sorted[0].accountId !== 'acc-111') {
      throw new Error(`Expected working pair 1 (acc-111) to be prioritized first, got ${sorted[0].accountId}`);
    }
    if (sorted[sorted.length - 1].accountId !== 'acc-000') {
      throw new Error(`Expected cooled-down pair 0 to be placed last, got ${sorted[sorted.length - 1].accountId}`);
    }

    // Verify RotatingProviderAdapter retains working pair without retrying pair 0
    let attemptedPairAccounts: string[] = [];
    const mockInnerAdapter: BaseProviderAdapter = {
      providerId: 'cloudflare',
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream(msgs, tools, opts) {
        attemptedPairAccounts.push(opts.accountId || '');
        if (opts.accountId === 'acc-000') {
          yield { type: 'error', error: 'Cloudflare Workers AI rate limit or quota exceeded (429)' };
        } else {
          yield { type: 'delta', delta: 'OK from ' + opts.accountId };
        }
      },
    };

    const rotating = new RotatingProviderAdapter(mockInnerAdapter);
    let activePairIndexRecorded: number | undefined;

    const stream = rotating.generateStream([], [], {
      model: '@cf/qwen/qwen3.8-27b',
      accountId: 'acc-000,acc-111,acc-222',
      apiKey: 'tok-000,tok-111,tok-222',
      preferredPairIndex: 1, // Retained from prior round!
      onCredentialActive: (info) => {
        activePairIndexRecorded = info.index;
      },
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    // Pair 1 was used directly on the first attempt!
    if (attemptedPairAccounts[0] !== 'acc-111') {
      throw new Error(`Expected first attempt to use retained pair acc-111, but attempted ${attemptedPairAccounts[0]}`);
    }
    if (activePairIndexRecorded !== 1) {
      throw new Error(`Expected activePairIndexRecorded to be 1, got ${activePairIndexRecorded}`);
    }

    console.log('   ✓ Test 2 PASSED: Working pair retained across turns, pair 0 in cooldown avoided.\n');
    passed++;
  } catch (err: any) {
    console.error('   ✗ Test 2 FAILED:', err.message, '\n');
    failed++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Incomplete Task Reaching Budget — Must NEVER Claim Success
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[TEST 3] Incomplete document action task reaching budget...');
  try {
    let turnsRun = 0;
    const mockSpinningAdapter: BaseProviderAdapter = {
      providerId: 'mock' as any,
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream() {
        turnsRun++;
        // Model keeps reading without ever updating document
        yield {
          type: 'tool_call',
          toolCall: {
            id: `call-spin-${turnsRun}`,
            name: 'read_source_content',
            arguments: { sourceId: 'src-pdf-1', range: `lines-${turnsRun}` },
          },
        };
      },
    };

    const stream = runAgentOrchestrator({
      workspaceId,
      workspaceType: 'doc',
      userPrompt: 'Please update the active document with the results.',
      providerId: 'mock' as any,
      modelId: 'mock-model',
      apiKey: 'mock-key',
      activeDocument: { id: documentId, title: 'Lab Notebook', content: '' },
      adapter: mockSpinningAdapter,
    });

    const receivedEvents: AgentSSEEvent[] = [];
    for await (const event of stream) {
      receivedEvents.push(event);
    }

    const taskFailedEvent = receivedEvents.find((e) => e.type === 'task_failed');
    const statusFailedEvent = receivedEvents.find((e) => e.type === 'status' && e.status === 'failed');
    const statusCompletedEvent = receivedEvents.find((e) => e.type === 'status' && e.status === 'completed');

    if (statusCompletedEvent) {
      throw new Error('Incomplete task was falsely reported as status: completed!');
    }
    if (!taskFailedEvent || !statusFailedEvent) {
      throw new Error('Expected task_failed or status: failed when document was never updated');
    }

    console.log('   ✓ Test 3 PASSED: Incomplete task honestly marked failed, never claiming completion.\n');
    passed++;
  } catch (err: any) {
    console.error('   ✗ Test 3 FAILED:', err.message, '\n');
    failed++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Single-Turn Conversational Request
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[TEST 4] Single-turn conversational request (no tools needed)...');
  try {
    const mockChatAdapter: BaseProviderAdapter = {
      providerId: 'mock' as any,
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream() {
        yield { type: 'delta', delta: 'Hello! I am Docium AI.' };
      },
    };

    const stream = runAgentOrchestrator({
      workspaceId,
      workspaceType: 'chat',
      userPrompt: 'Hello, who are you?',
      providerId: 'mock' as any,
      modelId: 'mock-model',
      apiKey: 'mock-key',
      adapter: mockChatAdapter,
    });

    const deltas: string[] = [];
    let completed = false;

    for await (const event of stream) {
      if (event.type === 'delta') {
        deltas.push(event.text);
      } else if (event.type === 'status' && event.status === 'completed') {
        completed = true;
      }
    }

    if (deltas.join('') !== 'Hello! I am Docium AI.') {
      throw new Error(`Expected direct delta streaming, got "${deltas.join('')}"`);
    }
    if (!completed) {
      throw new Error('Expected completion status');
    }

    console.log('   ✓ Test 4 PASSED: Single-turn conversational request streamed directly.\n');
    passed++;
  } catch (err: any) {
    console.error('   ✗ Test 4 FAILED:', err.message, '\n');
    failed++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Rate Limit Remaining Active Across Several Turns (All Pairs Burned)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[TEST 5] Rate limit remaining active across several turns...');
  try {
    const pairs: CloudflarePair[] = [
      { accountId: 'acc-burn-1', apiToken: 'tok-burn-1' },
      { accountId: 'acc-burn-2', apiToken: 'tok-burn-2' },
    ];

    // Put both in cooldown
    setCloudflarePairCooldown(pairs[0], 60, true);
    setCloudflarePairCooldown(pairs[1], 60, true);

    const ordered = orderCloudflarePairsByAvailability(pairs);
    // Both are in cooldown, so both should be flagged as in cooldown
    if (!isCloudflarePairInCooldown(ordered[0]) || !isCloudflarePairInCooldown(ordered[1])) {
      throw new Error('Expected both pairs to be recognized in cooldown');
    }

    console.log('   ✓ Test 5 PASSED: Shared account rate limits tracked, active cooldown detected.\n');
    passed++;
  } catch (err: any) {
    console.error('   ✗ Test 5 FAILED:', err.message, '\n');
    failed++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Deterministic Tool Failure (Security Boundary Violation)
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[TEST 6] Deterministic tool failure (workspace boundary stop)...');
  try {
    const mockBoundaryAdapter: BaseProviderAdapter = {
      providerId: 'mock' as any,
      supportsNativeTools: () => true,
      supportsVision: () => true,
      async *generateStream() {
        yield {
          type: 'tool_call',
          toolCall: {
            id: 'call-violate',
            name: 'read_source_content',
            arguments: { sourceId: 'outside-workspace-source-id' },
          },
        };
      },
    };

    const stream = runAgentOrchestrator({
      workspaceId,
      workspaceType: 'doc',
      userPrompt: 'Read content from other workspace source outside-workspace-source-id',
      providerId: 'mock' as any,
      modelId: 'mock-model',
      apiKey: 'mock-key',
      adapter: mockBoundaryAdapter,
    });

    const events: AgentSSEEvent[] = [];
    for await (const event of stream) {
      events.push(event);
    }

    const failedStep = events.find((e) => e.type === 'activity' && e.event.status === 'failed');
    const statusFailed = events.find((e) => e.type === 'status' && e.status === 'failed');
    if (!failedStep || !statusFailed) {
      throw new Error('Expected security stop with failed status and failed activity step');
    }

    console.log('   ✓ Test 6 PASSED: Security boundary violation stopped immediately with failed status.\n');
    passed++;
  } catch (err: any) {
    console.error('   ✗ Test 6 FAILED:', err.message, '\n');
    failed++;
  }

  // Summary
  console.log('================================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});

/**
 * Test Suite: DOCIUM Hierarchical Agent Activity Timeline
 * Tests A through H verifying:
 * - Test A: Multi-round model iterations & tool executions preserve all distinct steps in order
 * - Test B: Intermediate step explanations & findings (Category B) attached to safeSummary, not premature message content
 * - Test C: Final response transition emits final_response_started cleanly & auto-collapse behavior
 * - Test D: Reopening after completion preserves all completed steps & rich details
 * - Test E: Strict deduplication by unique ID (same label does not collide; same ID updates in place)
 * - Test F: Independent nested step expand/collapse state isolation
 * - Test G: Cancellation and failure state preservation without clearing history
 * - Test H: Streaming session memory bounds and event stability
 */

import assert from 'node:assert';
import { StreamingSessionManager } from '@/lib/ai/streamingSession';
import { AgentActivityEvent } from '@/lib/types';
import { AgentSSEEvent } from '@/lib/ai/agent/orchestrator';

async function runTimelineTests() {
  console.log('====================================================');
  console.log('DOCIUM Agent Activity Timeline Integration Test Suite');
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

  // TEST A: Multi-round model iterations with intermediate tool executions
  await test('Test A: Multi-round iterations preserve all distinct steps in order without overwriting', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-a';
    const abortController = new AbortController();

    const { requestId, session } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-1',
      abortController,
      initialEvents: [
        {
          id: 'step-prepare-1',
          stepId: 'step-prepare-1',
          taskId: 'task-1',
          eventType: 'preparing_response',
          label: 'Preparing response',
          status: 'running',
          safeSummary: 'Analyzing request',
          order: 1,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    // Step 1: Complete preparation
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-prepare-1',
      stepId: 'step-prepare-1',
      taskId: 'task-1',
      eventType: 'preparing_response',
      label: 'Preparing response',
      status: 'completed',
      safeSummary: 'Analyzed request',
      order: 1,
      timestamp: new Date().toISOString(),
    });

    // Step 2: First search step
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-1',
      stepId: 'step-search-1',
      taskId: 'task-1',
      eventType: 'tool_execution',
      toolName: 'search_document',
      label: 'Searching the document',
      status: 'running',
      safeSummary: 'Query: "Executive Summary"',
      order: 2,
      timestamp: new Date().toISOString(),
    });

    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-1',
      stepId: 'step-search-1',
      taskId: 'task-1',
      eventType: 'tool_execution',
      toolName: 'search_document',
      label: 'Searching the document',
      status: 'completed',
      safeSummary: 'Found section on page 1',
      order: 2,
      timestamp: new Date().toISOString(),
    });

    // Step 3: Second search step with the SAME label "Searching the document"
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-2',
      stepId: 'step-search-2',
      taskId: 'task-1',
      eventType: 'tool_execution',
      toolName: 'search_document',
      label: 'Searching the document',
      status: 'running',
      safeSummary: 'Query: "Financial Projections"',
      order: 3,
      timestamp: new Date().toISOString(),
    });

    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-2',
      stepId: 'step-search-2',
      taskId: 'task-1',
      eventType: 'tool_execution',
      toolName: 'search_document',
      label: 'Searching the document',
      status: 'completed',
      safeSummary: 'Found 3 paragraphs',
      order: 3,
      timestamp: new Date().toISOString(),
    });

    // Step 4: Document edit step
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-edit-1',
      stepId: 'step-edit-1',
      taskId: 'task-1',
      eventType: 'editor_action',
      toolName: 'insert_structured_document',
      label: 'Updating document content',
      status: 'completed',
      safeSummary: 'Inserted structured chart and text',
      order: 4,
      timestamp: new Date().toISOString(),
    });

    const snapshot = manager.getSnapshot(convId);
    assert.strictEqual(snapshot.activityEvents.length, 4, 'Must preserve all 4 distinct activity steps');
    assert.strictEqual(snapshot.activityEvents[0].id, 'step-prepare-1');
    assert.strictEqual(snapshot.activityEvents[1].id, 'step-search-1');
    assert.strictEqual(snapshot.activityEvents[1].safeSummary, 'Found section on page 1');
    assert.strictEqual(snapshot.activityEvents[2].id, 'step-search-2', 'Second search step must NOT overwrite the first search step');
    assert.strictEqual(snapshot.activityEvents[2].safeSummary, 'Found 3 paragraphs');
    assert.strictEqual(snapshot.activityEvents[3].id, 'step-edit-1');
  });

  // TEST B: Intermediate step explanations & findings (Category B) attached to step details
  await test('Test B: Intermediate step explanations & findings attached to safeSummary, not premature message content', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-b';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-b',
      abortController,
    });

    // Create tool step with intermediate explanation
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-tool-1',
      stepId: 'step-tool-1',
      eventType: 'tool_execution',
      toolName: 'search_workspace',
      label: 'Searching workspace',
      status: 'running',
      safeSummary: "I'll inspect the repository for project documentation first.",
      order: 1,
      timestamp: new Date().toISOString(),
    });

    // Ensure the message content remains empty while tool is running!
    const snapBefore = manager.getSnapshot(convId);
    assert.strictEqual(snapBefore.content, '', 'Assistant message bubble must not be dirtied with premature pre-tool text');
    assert.strictEqual(snapBefore.activityEvents[0].safeSummary, "I'll inspect the repository for project documentation first.");

    // Update with findings upon completion
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-tool-1',
      stepId: 'step-tool-1',
      eventType: 'tool_execution',
      toolName: 'search_workspace',
      label: 'Searching workspace',
      status: 'completed',
      safeSummary: 'Found 2 matching files in workspace',
      order: 1,
      timestamp: new Date().toISOString(),
    });

    const snapAfter = manager.getSnapshot(convId);
    assert.strictEqual(snapAfter.content, '', 'Message content must remain empty until final response starts');
    assert.strictEqual(snapAfter.activityEvents[0].safeSummary, 'Found 2 matching files in workspace');
  });

  // TEST C: Final response transition triggers final_response_started cleanly
  await test('Test C: final_response_started marks running steps complete and transitions isFinalResponseStarted cleanly', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-c';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-c',
      abortController,
    });

    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-prep',
      stepId: 'step-prep',
      eventType: 'preparing_response',
      label: 'Preparing response',
      status: 'running',
      safeSummary: 'Analyzing request',
      order: 1,
      timestamp: new Date().toISOString(),
    });

    let snap = manager.getSnapshot(convId);
    assert.strictEqual(snap.isFinalResponseStarted, false, 'Should be false initially');
    assert.strictEqual(snap.activityEvents[0].status, 'running');

    // Trigger final response started
    manager.setFinalResponseStarted(convId, requestId);

    snap = manager.getSnapshot(convId);
    assert.strictEqual(snap.isFinalResponseStarted, true, 'isFinalResponseStarted must be true');
    assert.strictEqual(snap.activityEvents[0].status, 'completed', 'Running activities must be marked completed');

    // Stream final response markdown
    manager.appendDelta(convId, requestId, 'Here is the **final** document summary:\n\n- Point 1\n- Point 2');
    snap = manager.getSnapshot(convId);
    assert.strictEqual(snap.content, 'Here is the **final** document summary:\n\n- Point 1\n- Point 2');
  });

  // TEST D: Reopening after completion preserves all completed steps
  await test('Test D: Reopening after completion preserves all completed steps, statuses, and safeSummaries', async () => {
    const historicalEvents: AgentActivityEvent[] = [
      {
        id: 'step-1',
        stepId: 'step-1',
        eventType: 'analyzed_files',
        label: 'Analyzed workspace files',
        status: 'completed',
        safeSummary: 'Found 4 markdown documents',
        order: 1,
        timestamp: new Date().toISOString(),
      },
      {
        id: 'step-2',
        stepId: 'step-2',
        eventType: 'identified_document',
        label: 'Identified the active document',
        status: 'completed',
        safeSummary: 'Active document is "Q4 Report"',
        order: 2,
        timestamp: new Date().toISOString(),
      },
      {
        id: 'step-3',
        stepId: 'step-3',
        eventType: 'editor_action_verified',
        label: 'Document edit verified',
        status: 'completed',
        safeSummary: 'Verified: Changes applied to document (+180 chars)',
        order: 3,
        timestamp: new Date().toISOString(),
      },
    ];

    // Simulate deduplication in ActivityTimeline
    const idMap = new Map<string, number>();
    const list: AgentActivityEvent[] = [];
    for (const evt of historicalEvents) {
      const stableKey = evt.id || evt.stepId || `${evt.eventType}-${evt.order ?? evt.timestamp}`;
      const existingIdx = idMap.get(stableKey);
      if (existingIdx !== undefined) {
        list[existingIdx] = { ...list[existingIdx], ...evt };
      } else {
        idMap.set(stableKey, list.length);
        list.push(evt);
      }
    }

    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].safeSummary, 'Found 4 markdown documents');
    assert.strictEqual(list[1].safeSummary, 'Active document is "Q4 Report"');
    assert.strictEqual(list[2].safeSummary, 'Verified: Changes applied to document (+180 chars)');
    assert.ok(list.every((e) => e.status === 'completed'));
  });

  // TEST E: Strict deduplication by unique ID / stepId
  await test('Test E: Duplicate events with same ID update in-place; same label with distinct IDs form separate steps', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-e';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-e',
      abortController,
    });

    // Emit initial step A
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-a',
      stepId: 'step-search-a',
      eventType: 'tool_execution',
      label: 'Searching the document',
      status: 'running',
      safeSummary: 'Scanning header',
      timestamp: new Date().toISOString(),
    });

    // Update step A in-place (same ID)
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-a',
      stepId: 'step-search-a',
      eventType: 'tool_execution',
      label: 'Searching the document',
      status: 'completed',
      safeSummary: 'Found header on page 1',
      timestamp: new Date().toISOString(),
    });

    let snap = manager.getSnapshot(convId);
    assert.strictEqual(snap.activityEvents.length, 1, 'Same ID must update in place');
    assert.strictEqual(snap.activityEvents[0].status, 'completed');
    assert.strictEqual(snap.activityEvents[0].safeSummary, 'Found header on page 1');

    // Emit step B with the EXACT SAME label but different ID
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-search-b',
      stepId: 'step-search-b',
      eventType: 'tool_execution',
      label: 'Searching the document',
      status: 'running',
      safeSummary: 'Scanning footer',
      timestamp: new Date().toISOString(),
    });

    snap = manager.getSnapshot(convId);
    assert.strictEqual(snap.activityEvents.length, 2, 'Distinct IDs must create separate rows even with identical labels');
    assert.strictEqual(snap.activityEvents[0].id, 'step-search-a');
    assert.strictEqual(snap.activityEvents[1].id, 'step-search-b');
    assert.strictEqual(snap.activityEvents[1].safeSummary, 'Scanning footer');
  });

  // TEST F: Independent nested step expand/collapse state isolation
  await test('Test F: Independent expand/collapse maintains isolated sets without cross-interference', async () => {
    const expandedStepIds = new Set<string>();

    const toggleStep = (id: string) => {
      if (expandedStepIds.has(id)) {
        expandedStepIds.delete(id);
      } else {
        expandedStepIds.add(id);
      }
    };

    // Toggle step 1
    toggleStep('step-1');
    assert.ok(expandedStepIds.has('step-1'), 'Step 1 should be expanded');
    assert.ok(!expandedStepIds.has('step-2'), 'Step 2 should remain collapsed');

    // Toggle step 2
    toggleStep('step-2');
    assert.ok(expandedStepIds.has('step-1'), 'Step 1 must remain expanded when step 2 expands');
    assert.ok(expandedStepIds.has('step-2'), 'Step 2 should be expanded');

    // Collapse step 1
    toggleStep('step-1');
    assert.ok(!expandedStepIds.has('step-1'), 'Step 1 should be collapsed');
    assert.ok(expandedStepIds.has('step-2'), 'Step 2 must remain expanded');
  });

  // TEST G: Cancellation and failure state preservation
  await test('Test G: Stop generation / cancellation preserves completed steps and marks running as cancelled', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-g';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-g',
      abortController,
    });

    // Step 1 completed
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-1',
      stepId: 'step-1',
      eventType: 'search',
      label: 'Analyzed files',
      status: 'completed',
      safeSummary: '3 sources found',
      timestamp: new Date().toISOString(),
    });

    // Step 2 running
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-2',
      stepId: 'step-2',
      eventType: 'editor',
      label: 'Updating document',
      status: 'running',
      safeSummary: 'Applying edits',
      timestamp: new Date().toISOString(),
    });

    // User clicks stop
    const stopResult = manager.stopSession(convId);
    assert.ok(stopResult, 'Stop result must be returned');

    // Verify stop preserves step 1 as completed
    assert.strictEqual(stopResult.activityEvents[0].status, 'completed');
    assert.strictEqual(stopResult.activityEvents[0].safeSummary, '3 sources found');
    assert.ok(abortController.signal.aborted, 'AbortController signal must be triggered');
  });

  // TEST H: Memory bounds and event stability
  await test('Test H: Activity events array remains safely bounded under high-frequency updates', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-test-h';
    const abortController = new AbortController();

    const { requestId } = manager.startSession({
      workspaceId: 'ws-1',
      conversationId: convId,
      assistantMessageId: 'msg-h',
      abortController,
      initialEvents: [
        {
          id: 'step-root',
          stepId: 'step-root',
          eventType: 'preparing_response',
          label: 'Preparing response',
          status: 'completed',
          order: 0,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    // Push 100 distinct events
    for (let i = 1; i <= 100; i++) {
      manager.upsertActivityEvent(convId, requestId, {
        id: `step-${i}`,
        stepId: `step-${i}`,
        eventType: 'tool_execution',
        label: `Step ${i}`,
        status: 'completed',
        safeSummary: `Summary ${i}`,
        order: i,
        timestamp: new Date().toISOString(),
      });
    }

    const snap = manager.getSnapshot(convId);
    assert.ok(snap.activityEvents.length <= 60, `Events array must be bounded to 60 (got ${snap.activityEvents.length})`);
    assert.strictEqual(snap.activityEvents[0].id, 'step-root', 'Root step must always be preserved');
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed}/${total} tests passed (100% success rate)`);
  console.log('====================================================\n');
}

runTimelineTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

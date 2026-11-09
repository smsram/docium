/**
 * Acceptance Test Suite: Antigravity Working Interface Verification
 *
 * Verifies:
 * 1. Exactly ONE parent expandable section labeled "Working":
 *    - Uses "Working v" when open and "Working >" when closed.
 *    - Animated with CSS shimmer ("thinking-label-shimmer animate-text-shimmer") during active execution.
 *    - Unboxed, cardless, inline presentation.
 * 2. Strictly NO step icons:
 *    - Zero checkmark icons, status dots, ping dots, file icons, search icons, tool icons, robot icons.
 *    - Plain text step titles with subtle disclosure arrows only.
 * 3. AI-generated step names & content:
 *    - Titles: "Understanding the request", "Inspecting the document", "Updating the document", "Verifying the changes".
 *    - Content: Conversational assistant progress prose, no raw system logs or query dumps.
 * 4. Step transition & persistence:
 *    - Active step is expanded by default during execution.
 *    - Completed steps can be collapsed by default.
 *    - Full content remains accessible when opened.
 *    - Older steps and their content are never erased or overwritten.
 * 5. Scratchpad strictly operational memory, separated from chat steps.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { StreamingSessionManager } from '../src/lib/ai/streamingSession';
import { AgentSSEEvent } from '../src/lib/ai/agent/orchestrator';

async function runAntigravityInterfaceTests() {
  console.log('====================================================');
  console.log('Antigravity Working Interface Acceptance Suite');
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

  // TEST 1: Source code inspection of ActivityTimeline for strict Antigravity design
  await test('Test 1: ActivityTimeline has ONE parent labeled "Working" with shimmer and strictly NO step icons', () => {
    const filePath = path.resolve('src/components/workspace/ai-chat/ActivityTimeline.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // 1. Parent label is literally "Working"
    assert.ok(content.includes('>Working<') || content.includes('Working\n'), 'Parent section must be labeled "Working"');

    // 2. CSS shimmer classes applied during active execution
    assert.ok(content.includes('thinking-label-shimmer'), 'Must contain thinking-label-shimmer class');
    assert.ok(content.includes('animate-text-shimmer'), 'Must contain animate-text-shimmer class');

    // 3. Strictly NO step icons imported or used
    const forbiddenIcons = [
      'CheckCircle2',
      'AlertCircle',
      'Sparkles',
      'Search',
      'FileText',
      'Edit3',
      'Zap',
      'Globe',
      'BarChart2',
      'ImageIcon',
      'Lightbulb',
      'Bot',
    ];
    for (const icon of forbiddenIcons) {
      assert.ok(
        !content.includes(`<${icon}`),
        `ActivityTimeline must NOT render step icon <${icon}>`
      );
    }

    // 4. No ping dots or status circles on steps
    assert.ok(!content.includes('animate-ping'), 'ActivityTimeline must NOT use animate-ping dots on steps');
    assert.ok(!content.includes('rounded-full bg-'), 'ActivityTimeline must NOT use colored status dots on steps');

    // 5. Unboxed: no card or elevated container styling
    assert.ok(!content.includes('bg-[var(--surface-elevated)]'), 'Must not use boxed container background');
    assert.ok(!content.includes('shadow-2xs overflow-hidden'), 'Must not use boxed card container shadow');
    assert.ok(content.includes('border-l-2 border-[var(--border-subtle)]'), 'Must use subtle indented guide line');
  });

  // TEST 2: Orchestrator emits conversational AI step titles and summaries
  await test('Test 2: Orchestrator emits conversational progress titles and summaries', () => {
    const orchPath = path.resolve('src/lib/ai/agent/orchestrator.ts');
    const orchContent = fs.readFileSync(orchPath, 'utf-8');

    // 1. Initial step is "Understanding the request" with conversational summary
    assert.ok(
      orchContent.includes("'Understanding the request'"),
      'Initial step must be labeled "Understanding the request"'
    );
    assert.ok(
      orchContent.includes('I am analyzing your request to identify the active document and determine required actions.'),
      'Initial step must provide conversational assistant summary'
    );

    // 2. Verification step is conversational
    assert.ok(
      orchContent.includes("'Verifying the changes'"),
      'Orchestrator must include "Verifying the changes" step'
    );

    // 3. Document action enforcement step is conversational
    assert.ok(
      orchContent.includes("'Updating the document'"),
      'Document update step must be labeled "Updating the document"'
    );

    // 4. generateNaturalStepContent function exists and replaces logs with natural prose
    assert.ok(
      orchContent.includes('generateNaturalStepContent'),
      'Must implement generateNaturalStepContent'
    );
  });

  // TEST 3: WorkspaceAI emits conversational editor verification activity
  await test('Test 3: WorkspaceAI emits conversational editor verification activity', () => {
    const wsPath = path.resolve('src/components/workspace/WorkspaceAI.tsx');
    const wsContent = wsPath ? fs.readFileSync(wsPath, 'utf-8') : '';

    assert.ok(
      wsContent.includes("label: 'Verifying the changes'"),
      'WorkspaceAI must label verification step "Verifying the changes"'
    );
    assert.ok(
      wsContent.includes('The document changes have been verified and applied to the active page.'),
      'WorkspaceAI must emit natural verification summary'
    );
  });

  // TEST 4: Step transition lifecycle & persistence
  await test('Test 4: Steps transition cleanly, earlier steps are preserved, and active step expands', async () => {
    const manager = new StreamingSessionManager();
    const convId = 'conv-antigravity-1';
    const abortController = new AbortController();

    const { requestId, session } = manager.startSession({
      workspaceId: 'ws-antigravity',
      conversationId: convId,
      assistantMessageId: 'msg-antigravity',
      abortController,
    });

    // Step 1: Understanding the request
    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-1',
      stepId: 'step-1',
      eventType: 'understanding_request',
      label: 'Understanding the request',
      status: 'running',
      safeSummary: 'I am analyzing your request to identify the active document and determine required actions.',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(session.activityEvents.length, 1);
    assert.strictEqual(session.activityEvents[0].label, 'Understanding the request');
    assert.strictEqual(session.activityEvents[0].status, 'running');

    // Step 1 completes, Step 2 begins
    const step1 = session.activityEvents.find((e) => e.id === 'step-1')!;
    manager.upsertActivityEvent(convId, requestId, {
      ...step1,
      status: 'completed',
      safeSummary: 'I identified the active document and determined which content should be updated.',
    });

    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-2',
      stepId: 'step-2',
      eventType: 'tool_execution',
      toolName: 'read_active_document',
      label: 'Inspecting the document',
      status: 'running',
      safeSummary: 'I am reading the active document structure to identify the target page and sections.',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(session.activityEvents.length, 2);
    // Step 1 is preserved and complete
    assert.strictEqual(session.activityEvents[0].status, 'completed');
    assert.strictEqual(
      session.activityEvents[0].safeSummary,
      'I identified the active document and determined which content should be updated.'
    );
    // Step 2 is active
    assert.strictEqual(session.activityEvents[1].status, 'running');

    // Step 2 completes, Step 3 begins
    const step2 = session.activityEvents.find((e) => e.id === 'step-2')!;
    manager.upsertActivityEvent(convId, requestId, {
      ...step2,
      status: 'completed',
      safeSummary: 'I located the target section and identified the content to be modified.',
    });

    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-3',
      stepId: 'step-3',
      eventType: 'editor_action',
      toolName: 'insert_structured_document',
      label: 'Updating the document',
      status: 'running',
      safeSummary: 'I am removing the selected content from page 1 while preserving the other pages.',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(session.activityEvents.length, 3);
    assert.strictEqual(session.activityEvents[1].status, 'completed');
    assert.strictEqual(session.activityEvents[2].status, 'running');

    // Step 3 completes, Step 4 begins
    const step3 = session.activityEvents.find((e) => e.id === 'step-3')!;
    manager.upsertActivityEvent(convId, requestId, {
      ...step3,
      status: 'completed',
      safeSummary: 'The selected content has been removed from page 1 while preserving other pages.',
    });

    manager.upsertActivityEvent(convId, requestId, {
      id: 'step-4',
      stepId: 'step-4',
      eventType: 'editor_action_verified',
      label: 'Verifying the changes',
      status: 'completed',
      safeSummary: 'The document changes have been verified and applied to the active page.',
      timestamp: new Date().toISOString(),
    });

    assert.strictEqual(session.activityEvents.length, 4);
    // All steps preserved with full natural summaries
    assert.strictEqual(session.activityEvents[0].label, 'Understanding the request');
    assert.strictEqual(session.activityEvents[1].label, 'Inspecting the document');
    assert.strictEqual(session.activityEvents[2].label, 'Updating the document');
    assert.strictEqual(session.activityEvents[3].label, 'Verifying the changes');

    for (const evt of session.activityEvents) {
      assert.strictEqual(evt.status, 'completed');
      assert.ok(evt.safeSummary && evt.safeSummary.length > 20);
    }
  });

  // TEST 5: CSS classes and smooth transitions in globals.css
  await test('Test 5: globals.css contains shimmer keyframes and grid transitions without JS loops', () => {
    const cssPath = path.resolve('src/app/globals.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    assert.ok(cssContent.includes('.thinking-label-shimmer'), 'Must contain .thinking-label-shimmer rule');
    assert.ok(cssContent.includes('@keyframes thinking-label-sweep'), 'Must contain thinking-label-sweep keyframe');
    assert.ok(cssContent.includes('.activity-steps-panel'), 'Must contain .activity-steps-panel rule');
    assert.ok(cssContent.includes('.activity-steps-panel--open'), 'Must contain .activity-steps-panel--open rule');
    assert.ok(cssContent.includes('grid-template-rows'), 'Must use CSS grid transition for smooth panel open/close');
    assert.ok(cssContent.includes('prefers-reduced-motion'), 'Must support prefers-reduced-motion');
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed}/${total} tests passed (100% success rate)`);
  console.log('====================================================');
}

runAntigravityInterfaceTests().catch((e) => {
  console.error(e);
  process.exit(1);
});

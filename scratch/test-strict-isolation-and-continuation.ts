/**
 * Verification Test Suite: Strict Workspace Isolation, Tool Continuation,
 * Live Progress Streaming, and AI Logo Assets.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Import Workspace Boundary Security
import {
  assertWorkspaceBoundary,
  recordSecurityEvent,
  getSecurityAuditLog,
  clearSecurityAuditLog,
  WorkspaceSecurityViolationError,
} from '../src/lib/ai/security/workspaceBoundary';

// Import Tools & Registry
import {
  searchToolCatalogTool,
  loadToolDefinitionsTool,
  listSourcesTool,
  getSourceDetailsTool,
  searchSourcesTool,
  readSourceContentTool,
  inspectSourceImageTool,
  getTaskScratchpadTool,
  updateTaskScratchpadTool,
} from '../src/lib/ai/tools/catalog';
import { executeTool } from '../src/lib/ai/tools/registry';
import { ToolExecutionContext } from '../src/lib/ai/tools/types';

// Import Orchestrator Helper Functions
import {
  synthesizeToolCompletionConfirmation,
  stripInternalReasoningTokens,
  updateLiveStepProgress,
} from '../src/lib/ai/agent/orchestrator';

// Import OpenAI & Cloudflare Adapters
import { OpenAICompatibleAdapter } from '../src/lib/ai/adapters/openai';
import { CloudflareAdapter } from '../src/lib/ai/adapters/cloudflare';
import { NormalizedMessage } from '../src/lib/ai/adapters/base';

// Store
import { useWorkspaceStore } from '../src/lib/store';

async function runTestSuite() {
  console.log('===============================================================');
  console.log('DOCIUM VERIFICATION TEST SUITE: ISOLATION, CONTINUATION & ASSETS');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function runTest(name: string, fn: () => void | Promise<void>) {
    totalTests++;
    try {
      const res = fn();
      if (res instanceof Promise) {
        return res
          .then(() => {
            console.log(`✅ [PASS] ${name}`);
            passedTests++;
          })
          .catch((err) => {
            console.error(`❌ [FAIL] ${name}`);
            console.error(err);
            process.exitCode = 1;
          });
      } else {
        console.log(`✅ [PASS] ${name}`);
        passedTests++;
      }
    } catch (err) {
      console.error(`❌ [FAIL] ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // Setup mock store state for foreign workspace checking
  useWorkspaceStore.setState({
    documents: [
      { id: 'doc-active-100', title: 'Active Research Plan', content: '<p>Active</p>', createdAt: '2026-01-01', updatedAt: '2026-01-01' } as any,
      { id: 'doc-foreign-200', title: 'Confidential Financials 2026', content: '<p>Secret</p>', createdAt: '2026-01-01', updatedAt: '2026-01-01' } as any,
    ],
    sheets: [
      { id: 'sheet-foreign-300', title: 'Payroll Data', data: [], createdAt: '2026-01-01', updatedAt: '2026-01-01' } as any,
    ],
  });

  const activeContext: ToolExecutionContext = {
    workspaceId: 'doc-active-100',
    workspaceType: 'document',
    conversationId: 'conv-test-1',
    conversationHistory: [],
    activeDocument: {
      id: 'doc-active-100',
      title: 'Active Research Plan',
      content: '<p>Active content</p>',
    },
    attachedSources: [
      {
        id: 'source-1',
        title: 'Project Roadmap.md',
        type: 'md',
        extractedText: '# Roadmap\n1. Launch\n2. Scale',
        snippet: 'Launch and Scale',
        addedAt: '2026-01-01',
        status: 'ready',
        tags: [],
      },
    ],
    workspaceFiles: [
      {
        id: 'doc-active-100',
        title: 'Active Research Plan',
        type: 'doc',
        updatedAt: '2026-01-01',
      },
    ],
    attachments: [
      {
        name: 'architecture-diagram.png',
        size: '1024',
        type: 'image/png',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
    ],
    scratchpad: '',
  };

  // --------------------------------------------------------------------------
  // TEST 1: Strict Workspace Isolation - Permitted active workspace operations succeed
  // --------------------------------------------------------------------------
  await runTest('TEST 1: Active workspace resources pass boundary check cleanly', async () => {
    // Assert active workspace ID, active document ID, and attached source
    assert.doesNotThrow(() => {
      assertWorkspaceBoundary('doc-active-100', activeContext, 'read');
      assertWorkspaceBoundary('Active Research Plan', activeContext, 'read');
      assertWorkspaceBoundary('source-1', activeContext, 'read');
      assertWorkspaceBoundary('Project Roadmap.md', activeContext, 'read');
      assertWorkspaceBoundary('architecture-diagram.png', activeContext, 'inspect');
    });

    // Execute list_sources tool
    const listRes = await executeTool('list_sources', {}, activeContext);
    assert.strictEqual(listRes.success, true);
    const listData = listRes.data as any;
    assert.ok(Array.isArray(listData?.sources));
    assert.strictEqual(listData?.sources.length, 2);
    assert.ok(listData?.sources.some((s: any) => s.id === 'source-1'));
    assert.ok(listData?.sources.some((s: any) => s.id === 'doc-active-100'));

    // Execute read_source_content tool
    const readRes = await executeTool('read_source_content', { sourceId: 'source-1' }, activeContext);
    assert.strictEqual(readRes.success, true);
    const readData = readRes.data as any;
    assert.ok(readData.text.includes('Launch'));
  });

  // --------------------------------------------------------------------------
  // TEST 2: Cross-Workspace Access - Path traversal is blocked immediately with exact error
  // --------------------------------------------------------------------------
  await runTest('TEST 2: Path traversal syntax triggers WorkspaceSecurityViolationError and sanitized audit event', async () => {
    clearSecurityAuditLog();

    const traversalTargets = [
      '../foreign-doc',
      '..\\another-workspace',
      'workspace:foreign-workspace',
      '/workspaces/doc-foreign-200',
    ];

    for (const target of traversalTargets) {
      assert.throws(
        () => {
          assertWorkspaceBoundary(target, activeContext, 'read_file');
        },
        (err: any) => {
          assert.strictEqual(err instanceof WorkspaceSecurityViolationError, true);
          assert.strictEqual(err.isSecurityViolation, true);
          assert.strictEqual(err.statusCode, 'WORKSPACE_BOUNDARY_VIOLATION');
          assert.strictEqual(
            err.message,
            'The task was stopped because the requested operation exceeded the active workspace boundary.'
          );
          return true;
        }
      );
    }

    const logs = getSecurityAuditLog();
    assert.strictEqual(logs.length, traversalTargets.length);
    for (const log of logs) {
      assert.strictEqual(log.status, 'blocked');
      assert.strictEqual(log.activeWorkspaceId, 'doc-active-100');
      // Must not leak restricted file contents or paths
      assert.ok(!log.reason.includes('Confidential Financials'));
    }
  });

  // --------------------------------------------------------------------------
  // TEST 3: Cross-Workspace Access - Foreign workspace ID or title triggers immediate abort
  // --------------------------------------------------------------------------
  await runTest('TEST 3: Foreign workspace ID and title rejected at registry level before execution', async () => {
    clearSecurityAuditLog();

    // Attempt to access doc-foreign-200 via read_source_content
    const foreignIdRes = await executeTool(
      'read_source_content',
      { sourceId: 'doc-foreign-200' },
      activeContext
    );

    assert.strictEqual(foreignIdRes.success, false);
    assert.strictEqual(foreignIdRes.isSecurityViolation, true);
    assert.strictEqual(foreignIdRes.statusCode, 'WORKSPACE_BOUNDARY_VIOLATION');
    assert.strictEqual(
      foreignIdRes.error,
      'The task was stopped because the requested operation exceeded the active workspace boundary.'
    );

    // Attempt to access foreign document by title
    const foreignTitleRes = await executeTool(
      'get_source_details',
      { sourceId: 'Confidential Financials 2026' },
      activeContext
    );

    assert.strictEqual(foreignTitleRes.success, false);
    assert.strictEqual(foreignTitleRes.isSecurityViolation, true);
    assert.strictEqual(foreignTitleRes.statusCode, 'WORKSPACE_BOUNDARY_VIOLATION');

    // Attempt foreign sheet access via search_sources
    const foreignSheetRes = await executeTool(
      'search_sources',
      { query: 'Payroll Data', sourceId: 'sheet-foreign-300' },
      activeContext
    );

    assert.strictEqual(foreignSheetRes.success, false);
    assert.strictEqual(foreignSheetRes.isSecurityViolation, true);
  });

  // --------------------------------------------------------------------------
  // TEST 4: inspect_source_image - Resolves attached image data and returns structured inspection
  // --------------------------------------------------------------------------
  await runTest('TEST 4: inspect_source_image inspects attached image with structured data', async () => {
    const res = await executeTool(
      'inspect_source_image',
      {
        sourceId: 'architecture-diagram.png',
        analysisPrompt: 'Inspect the system architecture diagram and extract any visible text',
      },
      activeContext
    );

    assert.strictEqual(res.success, true);
    const data = res.data as any;
    assert.ok(data);
    assert.strictEqual(data.accessibleToVisionModel, true);
    assert.ok(typeof data.extractedText === 'string');
    assert.ok(typeof data.visualDescription === 'string');
    assert.ok(Array.isArray(data.observations));
    assert.strictEqual(data.observations.length > 0, true);
  });

  // --------------------------------------------------------------------------
  // TEST 5: inspect_source_image - Missing image returns explicit error, never simulated success
  // --------------------------------------------------------------------------
  await runTest('TEST 5: inspect_source_image fails explicitly for nonexistent image', async () => {
    const res = await executeTool(
      'inspect_source_image',
      {
        sourceId: 'nonexistent-flowchart.png',
      },
      activeContext
    );

    assert.strictEqual(res.success, false);
    assert.ok(res.error);
    assert.ok(
      res.error.includes('could not be found') && res.error.includes('in the active workspace')
    );
  });

  // --------------------------------------------------------------------------
  // TEST 6: Tool Continuation - Message formatting uses content: null for assistant tool calls
  // --------------------------------------------------------------------------
  await runTest('TEST 6: OpenAI and Cloudflare adapters format tool calls with content: null (never empty string)', () => {
    const openaiAdapter = new OpenAICompatibleAdapter('openai', 'https://api.openai.com/v1');
    const cloudflareAdapter = new CloudflareAdapter();

    const sampleMessagesWithTools: NormalizedMessage[] = [
      { role: 'user', content: 'Inspect the architecture diagram.' },
      {
        role: 'assistant',
        content: '', // Empty content during tool call round
        toolCalls: [
          {
            id: 'call_inspect_1',
            name: 'inspect_source_image',
            arguments: { sourceId: 'architecture-diagram.png' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call_inspect_1',
        name: 'inspect_source_image',
        content: JSON.stringify({ success: true, text: 'System Diagram' }),
      },
    ];

    // OpenAI formatMessages
    const formattedOpenAI = openaiAdapter.formatMessages(sampleMessagesWithTools);
    const assistantMsgOpenAI: any = formattedOpenAI.find((m: any) => m.role === 'assistant');
    assert.ok(assistantMsgOpenAI);
    assert.strictEqual(
      assistantMsgOpenAI.content,
      null,
      'OpenAI assistant message with tool_calls must have content: null, not empty string'
    );
    assert.strictEqual(assistantMsgOpenAI.tool_calls.length, 1);
    assert.strictEqual(assistantMsgOpenAI.tool_calls[0].id, 'call_inspect_1');

    // Cloudflare formatMessages
    const formattedCloudflare = cloudflareAdapter.formatMessages(sampleMessagesWithTools);
    const assistantMsgCloudflare: any = formattedCloudflare.find((m: any) => m.role === 'assistant');
    assert.ok(assistantMsgCloudflare);
    assert.strictEqual(
      assistantMsgCloudflare.content,
      null,
      'Cloudflare assistant message with tool_calls must have content: null, not empty string'
    );
    assert.strictEqual(assistantMsgCloudflare.tool_calls.length, 1);
    assert.strictEqual(assistantMsgCloudflare.tool_calls[0].id, 'call_inspect_1');
  });

  // --------------------------------------------------------------------------
  // TEST 7: Tool Continuation - Orchestrator synthesizes tool completion confirmation
  // --------------------------------------------------------------------------
  await runTest('TEST 7: Orchestrator synthesizes confirmation when follow-up model response is empty', () => {
    // 1. For document tools
    const docConfirmation = synthesizeToolCompletionConfirmation(
      [
        {
          name: 'insert_text',
          id: 'call_1',
          arguments: { text: 'New content' },
          success: true,
          summary: 'Inserted 11 characters into active document',
          isEditorAction: true,
          isFileOp: false,
        },
      ],
      { activeDocTitle: 'Q4 Strategy Document' }
    );
    assert.ok(docConfirmation.includes('Q4 Strategy Document'));
    assert.ok(!docConfirmation.includes('Response completed without additional text'));

    // 2. For image inspection tools
    const imageConfirmation = synthesizeToolCompletionConfirmation(
      [
        {
          name: 'inspect_source_image',
          id: 'call_2',
          arguments: { sourceId: 'architecture-diagram.png' },
          success: true,
          summary: 'Analyzed visual content in architecture-diagram.png',
          isEditorAction: false,
          isFileOp: false,
        },
      ],
      {}
    );
    assert.ok(imageConfirmation.includes('Analyzing visual content'));
    assert.ok(!imageConfirmation.includes('Response completed without additional text'));
  });

  // --------------------------------------------------------------------------
  // TEST 8: Live Progress Streaming - In-place delta update without duplicate rows
  // --------------------------------------------------------------------------
  await runTest('TEST 8: Live progress streaming updates active step in-place', () => {
    const step: any = {
      id: 'step_live_1',
      label: 'Analyzing visual content',
      status: 'running',
      updates: [],
    };

    const deltas = ['Examining the ', 'system architecture components...', ' Found 3 microservices.'];
    let accumulated = '';
    for (const delta of deltas) {
      accumulated += delta;
      updateLiveStepProgress(step, accumulated);
    }

    assert.strictEqual(step.updates.length, 1);
    assert.strictEqual(
      step.updates[0].content,
      'Examining the system architecture components... Found 3 microservices.'
    );

    // Verify internal reasoning tags stripping
    const textWithThinkTag = '<think>Let me see what is here...</think>Finished reviewing.';
    const stripped = stripInternalReasoningTokens(textWithThinkTag);
    assert.strictEqual(stripped, 'Finished reviewing.');
  });

  // --------------------------------------------------------------------------
  // TEST 9: AI Logo Asset Verification
  // --------------------------------------------------------------------------
  await runTest('TEST 9: AI logo (/docium-ai.png) and product logo (/docium.png) asset integrity', () => {
    const projectRoot = path.resolve(__dirname, '..');
    const aiLogoPath = path.join(projectRoot, 'public', 'docium-ai.png');
    const productLogoPath = path.join(projectRoot, 'public', 'docium.png');

    assert.ok(fs.existsSync(aiLogoPath), 'public/docium-ai.png must exist');
    assert.ok(fs.existsSync(productLogoPath), 'public/docium.png must exist');

    const aiAvatarContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'workspace', 'ai-chat', 'AiAvatar.tsx'),
      'utf-8'
    );
    assert.ok(aiAvatarContent.includes('/docium-ai.png'), 'AiAvatar must reference /docium-ai.png');
    // Ensure no green status dots, badges, or rings
    assert.ok(!aiAvatarContent.includes('bg-emerald'), 'AiAvatar must not contain status badge dots');
    assert.ok(!aiAvatarContent.includes('bg-green'), 'AiAvatar must not contain status badge dots');
    assert.ok(!aiAvatarContent.includes('ring-2 ring-emerald'), 'AiAvatar must not contain green rings');

    const sidecarContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'workspace', 'WorkspaceAiSidecar.tsx'),
      'utf-8'
    );
    assert.ok(sidecarContent.includes('<AiAvatar'), 'WorkspaceAiSidecar must use <AiAvatar>');

    const sidebarContent = fs.readFileSync(
      path.join(projectRoot, 'src', 'components', 'layout', 'Sidebar.tsx'),
      'utf-8'
    );
    assert.ok(sidebarContent.includes('/docium.png'), 'Sidebar branding must strictly use /docium.png');
  });

  console.log('\n===============================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('===============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});


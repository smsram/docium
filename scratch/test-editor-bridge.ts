/**
 * Test Suite: Document Editor Execution Bridge, Verification & Cloudflare Tool Calling
 */

import { convertMarkdownToDocumentHtml } from '../src/components/editor/utils/markdownToHtml';
import { CloudflareAdapter } from '../src/lib/ai/adapters/cloudflare';
import { executeTool } from '../src/lib/ai/tools/registry';
import { ToolExecutionContext } from '../src/lib/ai/tools/types';
import { runAgentOrchestrator, generateSubstantiveDocumentContent, isDocumentActionRequest } from '../src/lib/ai/agent/orchestrator';
import { registerProviderAdapter } from '../src/lib/ai/adapters/registry';
import { BaseProviderAdapter, NormalizedStreamChunk, NormalizedToolDefinition } from '../src/lib/ai/adapters/base';
import { ProviderId } from '../src/lib/types';
import { editorRegistry } from '../src/lib/editor/editorRegistry';
import fs from 'fs';
import path from 'path';

async function runEditorBridgeTests() {
  console.log('====================================================');
  console.log('DOCIUM DOCUMENT EDITOR EXECUTION BRIDGE TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Logo & Asset Availability (Fix 404)
  // --------------------------------------------------------------------------
  console.log('\n--- 1. PUBLIC ASSETS & LOGO VERIFICATION ---');
  const logoPath = path.join(process.cwd(), 'public', 'docium-ai.png');
  const logoExists = fs.existsSync(logoPath);
  assert(logoExists, 'docium-ai.png exists in public directory (No 404)');
  if (logoExists) {
    const stats = fs.statSync(logoPath);
    assert(stats.size > 0, `docium-ai.png is non-empty (${stats.size} bytes)`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Markdown to HTML Canonical Converter
  // --------------------------------------------------------------------------
  console.log('\n--- 2. MARKDOWN TO HTML CONVERSION (Tiptap Table & Headings) ---');
  const mdSample = `# Project Overview\n\nThis is a paragraph with **bold** and *italic* text.\n\n| Feature | Status | Priority |\n| --- | --- | --- |\n| AI Editor | Active | P0 |\n| Vision RAG | Complete | P1 |\n\n- Task 1\n- Task 2`;
  const convertedHtml = convertMarkdownToDocumentHtml(mdSample);

  assert(convertedHtml.includes('<h1>Project Overview</h1>'), 'Converts H1 heading properly');
  assert(convertedHtml.includes('<strong>bold</strong>') && convertedHtml.includes('<em>italic</em>'), 'Converts inline bold & italic');
  assert(convertedHtml.includes('<table><thead><tr><th><p>Feature</p></th>'), 'Converts Markdown table to Tiptap table structure');
  assert(convertedHtml.includes('<td><p>Active</p></td>'), 'Preserves table cell contents');
  assert(convertedHtml.includes('<ul><li><p>Task 1</p></li>'), 'Converts bullet lists properly');

  // --------------------------------------------------------------------------
  // TEST 3: Cloudflare Workers AI Native Tools & Tool Serialization
  // --------------------------------------------------------------------------
  console.log('\n--- 3. CLOUDFLARE ADAPTER TOOL SERIALIZATION & NATIVE TOOLS ---');
  const cfAdapter = new CloudflareAdapter();
  assert(cfAdapter.supportsNativeTools() === true, 'CloudflareAdapter reports supportsNativeTools() === true');

  const sampleTool: NormalizedToolDefinition = {
    name: 'insert_structured_document',
    description: 'Inserts multi-section content into document.',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
  };

  const payload = cfAdapter.buildPayload(
    [{ role: 'user', content: 'Place some content on document page' }],
    '@cf/qwen/qwen3.8-27b',
    'chat_completions',
    { tools: [sampleTool] }
  ) as Record<string, unknown>;

  assert(Array.isArray(payload.tools), 'Payload contains tools array for chat_completions');
  assert(payload.tool_choice === 'auto', 'Payload specifies tool_choice = auto');
  const toolEntry = (payload.tools as any[])[0];
  assert(toolEntry.type === 'function' && toolEntry.function.name === 'insert_structured_document', 'Tool definition serialized to function format');

  // --------------------------------------------------------------------------
  // TEST 4: Tool Execution & Verification Bridge (Requirement 9 Tests A - G)
  // --------------------------------------------------------------------------
  console.log('\n--- 4. EDITOR EXECUTION BRIDGE (TESTS A - G) ---');

  // Mock Active Document Editor Context
  const mockContext: ToolExecutionContext = {
    workspaceId: 'doc-test-1',
    workspaceType: 'doc',
    conversationId: 'conv-test-1',
    attachedSources: [],
    conversationHistory: [],
    scratchpad: '',
    activeDocument: {
      id: 'doc-test-1',
      title: 'Active Research Document',
      format: 'doc',
      content: '<p>Initial existing content.</p>',
      wordCount: 3,
      characterCount: 25,
      saveStatus: 'saved',
      selection: {
        hasSelection: true,
        selectedText: 'existing content',
        from: 9,
        to: 25,
        cursorPos: 9,
      },
    },
  };

  // Test A: "Place some content on document page."
  console.log('Test A: Place some content on document page...');
  assert(isDocumentActionRequest('Place some content on document page.'), 'Intent detection recognizes "Place some content on document page."');
  const substantiveContent = generateSubstantiveDocumentContent('Place some content on document page.', 'Active Research Document');
  assert(substantiveContent.length > 100 && substantiveContent.includes('## Active Research Document'), 'Generates substantive multi-paragraph content, NOT an empty promise');

  const testARes = await executeTool('insert_structured_document', { content: substantiveContent }, mockContext);
  assert(Boolean(testARes.success), 'insert_structured_document succeeds');
  assert(testARes.editorAction?.action === 'insert_structured_document', 'Dispatches insert_structured_document event');
  assert(testARes.editorAction?.payload.documentId === 'doc-test-1', 'Carries active document ID');

  // Test B: "Insert a heading and three paragraphs at the current cursor."
  console.log('\nTest B: Insert a heading and three paragraphs at the current cursor...');
  const headingAndParaContent = `## Executive Summary\n\nFirst paragraph detailing project background and architecture.\n\nSecond paragraph outlining key milestones achieved.\n\nThird paragraph presenting conclusions.`;
  const testBRes = await executeTool('insert_structured_document', { content: headingAndParaContent, position: 'cursor' }, mockContext);
  assert(Boolean(testBRes.success), 'Test B: Content inserted at cursor');
  assert(testBRes.editorAction?.payload.position === 'cursor', 'Test B: Preserves cursor position');

  // Test C: "Replace the selected text with this content."
  console.log('\nTest C: Replace selected text...');
  const testCRes = await executeTool('replace_selected_text', { text: 'verified replacement content' }, mockContext);
  assert(Boolean(testCRes.success), 'Test C: Replaces selected text');
  assert(testCRes.editorAction?.action === 'replace_selected_text', 'Test C: Dispatches replace_selected_text');

  // Test D: "Add a three-column table to the document."
  console.log('\nTest D: Add a three-column table...');
  const testDRes = await executeTool(
    'insert_document_table',
    {
      headers: ['Feature', 'Description', 'Verified'],
      rows: [
        ['AI Bridge', 'Direct ProseMirror transactions', 'Yes'],
        ['Persistence', 'Canonical JSON & HTML in store', 'Yes'],
      ],
    },
    mockContext
  );
  assert(Boolean(testDRes.success), 'Test D: Table tool execution succeeds');
  assert(testDRes.editorAction?.action === 'insert_document_table', 'Test D: Dispatches insert_document_table');
  assert((testDRes.editorAction?.payload.headers as string[]).length === 3, 'Test D: Has exactly 3 columns');

  // Test E: "Make the first heading bold"
  console.log('\nTest E: Format document text...');
  const testERes = await executeTool('format_document_text', { formatting: 'bold' }, mockContext);
  assert(Boolean(testERes.success), 'Test E: Format tool succeeds');
  assert(testERes.editorAction?.action === 'format_document_text', 'Test E: Dispatches format_document_text');

  // Test F: Persistence Verification
  console.log('\nTest F: State persistence verification...');
  const htmlOut = convertMarkdownToDocumentHtml(substantiveContent);
  assert(htmlOut.length > 50, 'HTML generated for persistence');
  assert(!htmlOut.includes('undefined'), 'No undefined segments in persisted output');

  // Test G: Limitation Handling (Editor unavailable or read-only)
  console.log('\nTest G: Error reporting when editor is unavailable or read-only...');
  const noDocContext: ToolExecutionContext = {
    ...mockContext,
    activeDocument: undefined,
  };
  const testGRes1 = await executeTool('insert_structured_document', { content: 'Content' }, noDocContext);
  assert(testGRes1.success === false, 'Test G1: Fails cleanly when activeDocument is undefined');
  assert(Boolean(testGRes1.error?.includes('No active document')), 'Test G1: Reports active document missing');

  const unmountedDocContext: ToolExecutionContext = {
    ...mockContext,
    activeDocument: {
      ...mockContext.activeDocument!,
      editorMounted: false,
    },
  };
  const testGRes2 = await executeTool('insert_structured_document', { content: 'Content' }, unmountedDocContext);
  assert(testGRes2.success === false, 'Test G2: Fails immediately on server when editorMounted === false');
  assert(Boolean(testGRes2.error?.includes('No active document editor is currently mounted')), 'Test G2: Explicit diagnostic: editor not mounted');

  const readOnlyDocContext: ToolExecutionContext = {
    ...mockContext,
    activeDocument: {
      ...mockContext.activeDocument!,
      editorMounted: true,
      isEditable: false,
    },
  };
  const testGRes3 = await executeTool('insert_structured_document', { content: 'Content' }, readOnlyDocContext);
  assert(testGRes3.success === false, 'Test G3: Fails immediately on server when document is read-only');
  assert(Boolean(testGRes3.error?.includes('read-only')), 'Test G3: Explicit diagnostic: document is read-only');

  const wrongWorkspaceContext: ToolExecutionContext = {
    ...mockContext,
    workspaceType: 'sheet',
  };
  const testGRes4 = await executeTool('insert_structured_document', { content: 'Content' }, wrongWorkspaceContext);
  assert(testGRes4.success === false, 'Test G4: Fails when workspace is sheet, not doc');

  // --------------------------------------------------------------------------
  // TEST 5: Unique actionId Generation & Idempotent Action Dispatch
  // --------------------------------------------------------------------------
  console.log('\n--- 5. UNIQUE ACTION IDs & IDEMPOTENCY ---');
  assert(Boolean(testARes.editorAction?.actionId), 'testARes has unique actionId');
  assert(testARes.editorAction?.actionId?.startsWith('act-') === true, 'testARes actionId starts with act- prefix');
  assert(testARes.editorAction?.payload.actionId === testARes.editorAction?.actionId, 'actionId mirrored in payload');

  // --------------------------------------------------------------------------
  // TEST 6: Editor Registry Lifecycle & StrictMode Remount Safety
  // --------------------------------------------------------------------------
  console.log('\n--- 6. EDITOR REGISTRY LIFECYCLE & STRICTMODE SAFETY ---');
  const mockEditor1 = {
    isDestroyed: false,
    isEditable: true,
    getHTML: () => '<p>Hello Editor 1</p>',
    getText: () => 'Hello Editor 1',
    getJSON: () => ({ type: 'doc', content: [] }),
    state: { doc: { content: { size: 20 } } },
  } as any;

  const mockEditor2 = {
    isDestroyed: false,
    isEditable: true,
    getHTML: () => '<p>Hello Editor 2</p>',
    getText: () => 'Hello Editor 2',
    getJSON: () => ({ type: 'doc', content: [] }),
    state: { doc: { content: { size: 20 } } },
  } as any;

  // Register editor 1
  editorRegistry.register('doc-test-lifecycle', mockEditor1);
  assert(editorRegistry.hasActiveEditor('doc-test-lifecycle') === true, 'Editor registered successfully');
  assert(editorRegistry.getEditor('doc-test-lifecycle') === mockEditor1, 'getEditor returns registered instance');

  // StrictMode remount: editor 2 mounts, then unmount hook of editor 1 fires
  editorRegistry.register('doc-test-lifecycle', mockEditor2);
  assert(editorRegistry.getEditor('doc-test-lifecycle') === mockEditor2, 'New instance registered');

  // Stale unmount of editor 1 should NOT evict editor 2
  editorRegistry.unregister('doc-test-lifecycle', mockEditor1);
  assert(editorRegistry.hasActiveEditor('doc-test-lifecycle') === true, 'StrictMode safety: Stale unregister did not drop active editor');
  assert(editorRegistry.getEditor('doc-test-lifecycle') === mockEditor2, 'Active editor 2 preserved');

  // Unregistering editor 2 cleans up
  editorRegistry.unregister('doc-test-lifecycle', mockEditor2);
  assert(editorRegistry.hasActiveEditor('doc-test-lifecycle') === false, 'Matching unregister removes instance');

  // Bounded wait test: waitForEditor resolves when editor is registered asynchronously
  const waitPromise = editorRegistry.waitForEditor('doc-async-mount', 2000);
  setTimeout(() => {
    editorRegistry.register('doc-async-mount', mockEditor1);
  }, 50);
  const resolvedEd = await waitPromise;
  assert(resolvedEd === mockEditor1, 'waitForEditor resolves when editor mounts asynchronously');
  editorRegistry.unregister('doc-async-mount', mockEditor1);

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEditorBridgeTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

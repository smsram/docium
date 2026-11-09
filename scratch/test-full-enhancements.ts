/**
 * Comprehensive Test Suite for DOCIUM Universal AI Agent & Document Workspace Enhancements
 */

import {
  computeImageContentHash,
  computePerceptualHash,
  calculateHammingDistance,
  processImagesBatch,
  searchIndexedImages,
  getIndexedImageById,
  getAllIndexedImages,
} from '../src/lib/ai/images/imageUnderstanding';

import {
  getAvailableTools,
  getToolByName,
  executeTool,
  ALL_TOOLS,
} from '../src/lib/ai/tools/registry';

import { documentEditorTools } from '../src/lib/ai/tools/documentEditorTools';
import { ToolExecutionContext } from '../src/lib/ai/tools/types';

async function runTests() {
  console.log('====================================================');
  console.log('DOCIUM AI ENHANCEMENTS — VERIFICATION TEST SUITE');
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
  // TEST SUITE 1: Image Hashing, Duplicate Detection, and Perceptual Matching
  // --------------------------------------------------------------------------
  console.log('\n--- 1. IMAGE HASHING & DEDUPLICATION ---');
  const dummySvg1 = '<svg width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';
  const dummySvg2 = '<svg width="100" height="100"><rect width="100" height="100" fill="red"/></svg>'; // Exact duplicate
  const dummySvg3 = '<svg width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>';

  const hash1 = computeImageContentHash(dummySvg1);
  const hash2 = computeImageContentHash(dummySvg2);
  const hash3 = computeImageContentHash(dummySvg3);

  assert(hash1 === hash2, 'Exact duplicate produces identical content hash');
  assert(hash1 !== hash3, 'Different image content produces different content hash');

  const pHash1 = computePerceptualHash(dummySvg1);
  const pHash2 = computePerceptualHash(dummySvg2);
  const distanceExact = calculateHammingDistance(pHash1, pHash2);
  assert(distanceExact === 0, 'Perceptual hash distance is 0 for identical images');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Batch Image Processing & Caching
  // --------------------------------------------------------------------------
  console.log('\n--- 2. BATCH IMAGE UNDERSTANDING & CACHING ---');
  const mockImages = [
    {
      id: 'img-test-1',
      sourceId: 'src-1',
      workspaceId: 'ws-test',
      filename: 'architecture_diagram.png',
      url: 'data:image/svg+xml;utf8,' + encodeURIComponent(dummySvg1),
      page: 1,
    },
    {
      id: 'img-test-2',
      sourceId: 'src-1',
      workspaceId: 'ws-test',
      filename: 'financial_chart.png',
      url: 'data:image/svg+xml;utf8,' + encodeURIComponent(dummySvg3),
      page: 2,
    },
  ];

  // First batch: processes both images
  const batch1 = await processImagesBatch(mockImages, 'ws-test');
  assert(batch1.processed.length === 2, 'Batch processes both images');
  assert(batch1.newCount === 2, 'Batch reports 2 newly analyzed images');
  assert(batch1.cachedCount === 0, 'Initial batch has 0 cached images');

  // Second batch with duplicate image
  const batch2 = await processImagesBatch([mockImages[0]], 'ws-test');
  assert(batch2.cachedCount === 1, 'Duplicate image successfully reuses cached analysis without re-analyzing');
  assert(batch2.newCount === 0, 'Duplicate image does not trigger new model call');

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Semantic Image Search & Visual Metadata
  // --------------------------------------------------------------------------
  console.log('\n--- 3. SEMANTIC IMAGE SEARCH ---');
  const allImages = getAllIndexedImages('ws-test');
  assert(allImages.length >= 2, `Indexed images stored with metadata (${allImages.length} images)`);

  const foundImg = getIndexedImageById('img-test-1');
  assert(Boolean(foundImg && foundImg.filename === 'architecture_diagram.png'), 'Indexed image retrievable by ID with preserved filename & page');
  assert(foundImg?.page === 1, 'Preserves page/slide location metadata');

  const searchResults = searchIndexedImages('architecture', 'ws-test');
  assert(searchResults.length > 0, 'Natural language search finds matching indexed image');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Tool Registration and Workspace Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- 4. TOOL REGISTRY WORKSPACE ISOLATION ---');
  assert(documentEditorTools.length >= 21, `All Document Editor tools registered (found ${documentEditorTools.length})`);

  // Document tools in 'doc' workspace:
  const docTools = getAvailableTools({ workspaceType: 'doc' });
  const hasDocToolsInDoc = documentEditorTools.every((t) => docTools.some((dt) => dt.name === t.name));
  assert(hasDocToolsInDoc, 'All 21 Document Editor tools available in Document workspace (workspaceType = "doc")');

  // Document tools in 'sheet' workspace:
  const sheetTools = getAvailableTools({ workspaceType: 'sheet' });
  const hasDocToolsInSheet = documentEditorTools.some((t) => sheetTools.some((st) => st.name === t.name));
  assert(!hasDocToolsInSheet, 'Document Editor tools are NOT registered or visible in Spreadsheet workspace');

  // Document tools in 'slide' workspace:
  const slideTools = getAvailableTools({ workspaceType: 'slide' });
  const hasDocToolsInSlide = documentEditorTools.some((t) => slideTools.some((slt) => slt.name === t.name));
  assert(!hasDocToolsInSlide, 'Document Editor tools are NOT registered or visible in Presentation workspace');

  // Document tools in 'pdf' workspace:
  const pdfToolsList = getAvailableTools({ workspaceType: 'pdf' });
  const hasDocToolsInPdf = documentEditorTools.some((t) => pdfToolsList.some((pt) => pt.name === t.name));
  assert(!hasDocToolsInPdf, 'Document Editor tools are NOT registered or visible in PDF workspace');

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Document Reading & Navigation Tools Execution
  // --------------------------------------------------------------------------
  console.log('\n--- 5. DOCUMENT READING & NAVIGATION TOOLS ---');
  const mockContext: ToolExecutionContext = {
    workspaceId: 'doc-test-1',
    workspaceType: 'doc',
    conversationId: 'conv-test-1',
    attachedSources: [],
    conversationHistory: [],
    scratchpad: '',
    activeDocument: {
      id: 'doc-test-1',
      title: 'Docium Architecture Overview',
      format: 'doc',
      content: `<h1>System Architecture</h1><p>Docium is a universal workspace for documents, sheets, and slides.</p><h2>Storage Layer</h2><p>The storage layer uses IndexedDB and local file system bridges.</p><h2>AI Orchestration</h2><p>The universal AI agent manages multi-step tool loops.</p>`,
      headings: [
        { level: 1, text: 'System Architecture', pos: 0 },
        { level: 2, text: 'Storage Layer', pos: 80 },
        { level: 2, text: 'AI Orchestration', pos: 170 },
      ],
      selection: {
        hasSelection: true,
        selectedText: 'universal workspace',
        from: 20,
        to: 39,
        cursorPos: 20,
        surroundingParagraph: 'Docium is a universal workspace for documents, sheets, and slides.',
      },
      wordCount: 32,
      characterCount: 220,
      saveStatus: 'saved',
      hasUnsavedChanges: false,
    },
  };

  // 5.1 read_active_document_structure
  const structRes = await executeTool('read_active_document_structure', {}, mockContext);
  assert(structRes.success, 'read_active_document_structure executes successfully');
  const structData = structRes.data as { headings: unknown[]; headingCount: number };
  assert(structData.headingCount === 3, 'read_active_document_structure returns correct heading count');

  // 5.2 inspect_active_document_metadata
  const metaRes = await executeTool('inspect_active_document_metadata', {}, mockContext);
  assert(metaRes.success, 'inspect_active_document_metadata executes successfully');
  const metaData = metaRes.data as { title: string; saveStatus: string };
  assert(metaData.title === 'Docium Architecture Overview' && metaData.saveStatus === 'saved', 'inspect_active_document_metadata returns correct document metadata');

  // 5.3 read_active_document_selection
  const selRes = await executeTool('read_active_document_selection', {}, mockContext);
  assert(selRes.success, 'read_active_document_selection executes successfully');
  const selData = selRes.data as { hasSelection: boolean; selectedText: string };
  assert(selData.hasSelection && selData.selectedText === 'universal workspace', 'read_active_document_selection returns active selected text');

  // 5.4 search_document_text
  const searchRes = await executeTool('search_document_text', { query: 'storage' }, mockContext);
  assert(searchRes.success, 'search_document_text executes successfully');
  const searchData = searchRes.data as { totalMatches: number };
  assert(searchData.totalMatches >= 1, 'search_document_text finds matches with offset and line context');

  // 5.5 navigate_to_document_heading
  const navRes = await executeTool('navigate_to_document_heading', { headingText: 'Storage Layer' }, mockContext);
  assert(navRes.success, 'navigate_to_document_heading locates heading');
  assert(navRes.editorAction?.action === 'navigate_to_document_heading', 'navigate_to_document_heading generates editor navigation event');

  // --------------------------------------------------------------------------
  // TEST SUITE 6: Document Content Editing Tools & Destructive Guard
  // --------------------------------------------------------------------------
  console.log('\n--- 6. CONTENT EDITING TOOLS & DESTRUCTIVE GUARDS ---');

  // 6.1 insert_text_at_cursor
  const insertRes = await executeTool('insert_text_at_cursor', { text: 'New content paragraph' }, mockContext);
  assert(insertRes.success && insertRes.editorAction?.action === 'insert_text_at_cursor', 'insert_text_at_cursor dispatches Tiptap insertion action');

  // 6.2 create_document_list
  const listRes = await executeTool('create_document_list', { items: ['Feature A', 'Feature B'], listType: 'bullet' }, mockContext);
  assert(listRes.success && listRes.editorAction?.action === 'create_document_list', 'create_document_list dispatches list creation action');

  // 6.3 insert_document_table
  const tableRes = await executeTool('insert_document_table', { headers: ['Name', 'Role'], rows: [['Alice', 'Admin']] }, mockContext);
  assert(tableRes.success && tableRes.editorAction?.action === 'insert_document_table', 'insert_document_table dispatches table insertion action');

  // 6.4 format_document_text
  const fmtRes = await executeTool('format_document_text', { formatting: 'bold' }, mockContext);
  assert(fmtRes.success && fmtRes.editorAction?.action === 'format_document_text', 'format_document_text dispatches format action');

  // 6.5 change_document_alignment
  const alignRes = await executeTool('change_document_alignment', { alignment: 'center' }, mockContext);
  assert(alignRes.success && alignRes.editorAction?.action === 'change_document_alignment', 'change_document_alignment dispatches alignment action');

  // 6.6 rename_current_document
  const renameRes = await executeTool('rename_current_document', { newTitle: 'Updated Architecture v2' }, mockContext);
  assert(renameRes.success && renameRes.editorAction?.action === 'rename_current_document', 'rename_current_document dispatches rename action');

  // 6.7 save_document_changes
  const saveRes = await executeTool('save_document_changes', {}, mockContext);
  assert(saveRes.success && saveRes.editorAction?.action === 'save_document_changes', 'save_document_changes dispatches save action');

  // 6.8 Destructive edit guard test (> 500 chars without confirmation)
  const largeTextContext: ToolExecutionContext = {
    ...mockContext,
    activeDocument: {
      ...mockContext.activeDocument!,
      selection: {
        hasSelection: true,
        selectedText: 'A'.repeat(600), // 600 characters
        from: 0,
        to: 600,
        cursorPos: 0,
      },
    },
  };

  const destructiveAttempt = await executeTool('replace_selected_text', { text: 'Short replacement' }, largeTextContext);
  assert(!destructiveAttempt.success, 'Destructive edit safeguard blocks unconfirmed replacement > 500 chars');
  assert(Boolean(destructiveAttempt.error?.includes('Destructive replacement safeguard')), 'Error explains that confirmation is required');

  const confirmedAttempt = await executeTool('replace_selected_text', { text: 'Short replacement', confirmed: true }, largeTextContext);
  assert(Boolean(confirmedAttempt.success), 'Destructive replacement succeeds when confirmed=true');

  // --------------------------------------------------------------------------
  // TEST SUITE 7: Document Action Intent Detection & Action Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- 7. INTENT DETECTION & ACTION ENFORCEMENT ---');
  const { isDocumentActionRequest, shouldEnableToolsForPrompt } = await import('../src/lib/ai/agent/orchestrator');

  // Positive action requests:
  assert(isDocumentActionRequest('Place some content in the page as about yourself'), 'Action request: "Place some content in the page as about yourself" detected');
  assert(isDocumentActionRequest('Add an about section to the document'), 'Action request: "Add an about section to the document" detected');
  assert(isDocumentActionRequest('Write a comprehensive report on machine learning'), 'Action request: "Write a comprehensive report on machine learning" detected');
  assert(isDocumentActionRequest('Insert a table comparing React and Vue'), 'Action request: "Insert a table comparing React and Vue" detected');
  assert(isDocumentActionRequest('Make the selected text bold'), 'Action request: "Make the selected text bold" detected');
  assert(isDocumentActionRequest('Change the heading to H1'), 'Action request: "Change the heading to H1" detected');
  assert(isDocumentActionRequest('Append a paragraph summarizing our Q3 results'), 'Action request: "Append a paragraph summarizing our Q3 results" detected');

  // Negative conversational prompts:
  assert(!isDocumentActionRequest('Hi'), 'Conversational prompt: "Hi" is not an action request');
  assert(!isDocumentActionRequest('Hello! How are you?'), 'Conversational prompt: "Hello! How are you?" is not an action request');
  assert(!isDocumentActionRequest('What is the difference between synchronous and asynchronous?'), 'Question: "What is the difference..." is not a document action request');

  // Tool enablement in document workspace:
  assert(shouldEnableToolsForPrompt('Place some content in the page as about yourself', false, undefined, 'doc'), 'Tools enabled for document action in doc workspace');
  assert(!shouldEnableToolsForPrompt('Hi', false, undefined, 'doc'), 'Tools bypassed for pure greeting "Hi" in doc workspace (fast, non-stuck generation)');
  assert(shouldEnableToolsForPrompt('Summarize key findings', false, undefined, 'doc'), 'Tools enabled for general work prompt in doc workspace');

  // --------------------------------------------------------------------------
  // TEST SUITE 8: read_active_document & insert_structured_document Tools
  // --------------------------------------------------------------------------
  console.log('\n--- 8. NEW DOCUMENT TOOLS ---');

  // 8.1 read_active_document
  const readFullDocRes = await executeTool('read_active_document', {}, mockContext);
  assert(Boolean(readFullDocRes.success), 'read_active_document executes successfully');
  const readDocData = (readFullDocRes.data || {}) as { title?: string; content?: string; plainText?: string };
  assert(readDocData.title === 'Docium Architecture Overview', 'read_active_document returns document title');
  assert(typeof readDocData.content === 'string' && readDocData.content.length > 0, 'read_active_document returns full HTML/markdown content');
  assert(typeof readDocData.plainText === 'string', 'read_active_document returns stripped plain text');

  // 8.2 insert_structured_document
  const structDocRes = await executeTool(
    'insert_structured_document',
    {
      title: 'About the Assistant',
      content: 'I am an advanced pair-programming and document intelligence assistant built for DOCIUM.\n\n### Core Strengths\n- Multi-modal analysis\n- Direct ProseMirror transactions\n- High-performance streaming',
      position: 'cursor',
    },
    mockContext
  );
  assert(Boolean(structDocRes.success), 'insert_structured_document executes successfully');
  assert(structDocRes.editorAction?.action === 'insert_structured_document', 'Dispatches insert_structured_document action event');
  const structPayload = (structDocRes.editorAction?.payload || {}) as { content?: string };
  assert(Boolean(structPayload.content?.includes('About the Assistant')), 'Includes prepended title and formatted content');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

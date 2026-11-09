/**
 * Comprehensive Integration Test Suite: Full Document Assistant Capabilities
 * Tests ProseMirror search engine, section relocation, editor registry,
 * tool registry permission boundaries, and orchestrator prompt generation.
 */

import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  searchProseMirrorDoc,
  findSectionByHeading,
  replaceTextInRange,
  replaceAllMatches,
  moveDocumentSectionInEditor,
} from '../src/lib/editor/documentSearch';
import { editorRegistry } from '../src/lib/editor/editorRegistry';
import { getAvailableTools, executeTool } from '../src/lib/ai/tools/registry';
import { ToolExecutionContext } from '../src/lib/ai/tools/types';
import { DOCUMENT_CAPABILITIES, getDocumentCapabilitiesPromptSummary } from '../src/lib/editor/capabilityRegistry';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. Setup minimal ProseMirror schema for testing document-native operations
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    text: { group: 'inline' },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
    italic: { toDOM: () => ['em', 0] },
  },
});

function createMockEditor(initialDocNode: any) {
  let state = EditorState.create({
    schema: testSchema,
    doc: initialDocNode,
  });

  const mockEditor: any = {
    state,
    view: {
      dispatch: (tr: any) => {
        state = state.apply(tr);
        mockEditor.state = state;
      },
    },
    chain: () => {
      const commands = {
        focus: () => commands,
        deleteSelection: () => {
          const { tr } = state;
          tr.deleteSelection();
          state = state.apply(tr);
          mockEditor.state = state;
          return commands;
        },
        insertContent: (content: string) => {
          const { tr } = state;
          tr.insertText(content);
          state = state.apply(tr);
          mockEditor.state = state;
          return commands;
        },
        run: () => true,
      };
      return commands;
    },
    commands: {
      undo: () => true,
      redo: () => true,
      insertContent: () => true,
    },
    getHTML: () => `<p>${state.doc.textContent}</p>`,
    getJSON: () => state.doc.toJSON(),
    getText: () => state.doc.textBetween(0, state.doc.content.size, '\n'),
    isEditable: true,
    isDestroyed: false,
    destroy: () => {
      mockEditor.isDestroyed = true;
    },
  };

  return mockEditor;
}

async function runTests() {
  console.log('\n======================================================');
  console.log('DOCIUM — Full Document Assistant Capability Tests');
  console.log('======================================================\n');

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: Document Search Engine & Outline Resolution
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: Document-Native ProseMirror Search ---');

  const testDoc = testSchema.node('doc', null, [
    testSchema.node('heading', { level: 1 }, [testSchema.text('Introduction')]),
    testSchema.node('paragraph', null, [
      testSchema.text('Welcome to Docium document editor. Docium provides smart editing.'),
    ]),
    testSchema.node('heading', { level: 2 }, [testSchema.text('Features')]),
    testSchema.node('paragraph', null, [
      testSchema.text('Docium supports advanced AI document assistance and collaboration.'),
    ]),
    testSchema.node('heading', { level: 1 }, [testSchema.text('Conclusion')]),
    testSchema.node('paragraph', null, [
      testSchema.text('In conclusion, Docium is fast and reliable.'),
    ]),
  ]);

  // Test searchProseMirrorDoc
  const searchAll = searchProseMirrorDoc(testDoc, { query: 'Docium' });
  assert(searchAll.totalMatches === 4, `Found 4 occurrences of "Docium" (found: ${searchAll.totalMatches})`);
  assert(searchAll.matches[0].sectionTitle === 'Introduction', 'Match 0 belongs to "Introduction" section');
  assert(searchAll.matches[2].sectionTitle === 'Features', 'Match 2 belongs to "Features" section');
  assert(searchAll.matches[2].headingHierarchy.join(' > ') === 'Introduction > Features', 'Hierarchy correctly resolves nested H2 under H1');
  assert(searchAll.matches[3].sectionTitle === 'Conclusion', 'Match 3 belongs to "Conclusion" section');

  // Test whole word and case sensitivity
  const searchLower = searchProseMirrorDoc(testDoc, { query: 'docium', caseSensitive: true });
  assert(searchLower.totalMatches === 0, 'Case sensitive search for "docium" returns 0');

  // Test findSectionByHeading
  const introSec = findSectionByHeading(testDoc, 'Introduction');
  assert(introSec.found === true, 'Found section by heading "Introduction"');
  assert(introSec.level === 1, 'Introduction level is 1');

  const featSec = findSectionByHeading(testDoc, 'Features');
  assert(featSec.found === true, 'Found section by heading "Features"');
  assert(featSec.level === 2, 'Features level is 2');

  // Test replaceAllMatches in reverse order
  const editorForReplace = createMockEditor(testDoc);
  const replaceCount = replaceAllMatches(editorForReplace, 'Docium', 'DOCIUM PRO');
  assert(replaceCount === 4, `Replaced 4 occurrences of "Docium" with "DOCIUM PRO"`);
  assert(editorForReplace.getText().includes('DOCIUM PRO document editor'), 'Doc contains replaced text');
  assert(!editorForReplace.getText().includes('Docium'), 'Doc no longer contains original "Docium"');

  // Test moveDocumentSectionInEditor
  const editorForMove = createMockEditor(testDoc);
  const moveSuccess = moveDocumentSectionInEditor(editorForMove, 'Conclusion', 'Introduction', 'before');
  assert(moveSuccess === true, 'Moved section "Conclusion" to before "Introduction"');
  const textAfterMove = editorForMove.getText();
  const conclusionIdx = textAfterMove.indexOf('Conclusion');
  const introIdx = textAfterMove.indexOf('Introduction');
  assert(conclusionIdx < introIdx, '"Conclusion" now appears before "Introduction" in document text');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: Capability Registry & Summary
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Capability Registry ---');

  assert(DOCUMENT_CAPABILITIES.length >= 20, `Document capabilities count >= 20 (found: ${DOCUMENT_CAPABILITIES.length})`);
  const promptSummary = getDocumentCapabilitiesPromptSummary();
  assert(promptSummary.includes('insert_structured_document'), 'Summary includes insert_structured_document');
  assert(promptSummary.includes('format_document_text'), 'Summary includes format_document_text');
  assert(promptSummary.includes('modify_page_layout'), 'Summary includes modify_page_layout');
  assert(promptSummary.includes('move_document_section'), 'Summary includes move_document_section');
  assert(promptSummary.includes('find_and_replace_text'), 'Summary includes find_and_replace_text');

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: Editor Registry & Permission Boundaries
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Editor Registry Permissions ---');

  const docId = 'doc-test-123';
  const otherDocId = 'doc-other-999';
  const testEditor = createMockEditor(testDoc);

  editorRegistry.register(docId, testEditor, 'workspace-1');
  assert(editorRegistry.getEditor(docId) !== null, 'Editor registered for doc-test-123');

  // Execute action with wrong documentId -> MUST FAIL
  const wrongDocResult = await editorRegistry.executeAction('insert_text_at_cursor', {
    documentId: otherDocId,
    text: 'Unauthorized content',
  });
  assert(wrongDocResult.success === false, 'Action rejected for unauthorized/different documentId');
  assert(Boolean(wrongDocResult.error?.includes('Permission denied')), `Error message mentions permission denied: "${wrongDocResult.error}"`);

  // Execute action with correct documentId -> MUST SUCCEED
  let persistCalled = false;
  let persistedPageSize = '';
  const onPersistCallback = (dId: string, data: any) => {
    if (dId === docId) {
      persistCalled = true;
      if (data.pageSize) persistedPageSize = data.pageSize;
    }
  };

  const layoutResult = await editorRegistry.executeAction(
    'modify_page_layout',
    {
      documentId: docId,
      pageSize: 'Letter',
      orientation: 'landscape',
      columns: 2,
      headerText: 'Confidential',
      footerText: 'Page %p%',
    },
    docId,
    onPersistCallback
  );
  assert(Boolean(layoutResult.success), 'modify_page_layout succeeded on active document');
  assert(persistCalled, 'Persist callback triggered after layout change');
  assert(persistedPageSize === 'Letter', `Persisted layout contains pageSize="Letter" (got: ${persistedPageSize})`);

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: Tool Registry Filtering & Permission Enforcement
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: Tool Registry Workspace Filtering ---');

  // In document workspace: external file tools must NOT be available
  const docTools = getAvailableTools({
    workspaceType: 'doc',
    hasAttachments: false,
  });
  const docToolNames = docTools.map((t) => t.name);
  assert(!docToolNames.includes('create_workspace_file'), 'create_workspace_file excluded in doc workspace');
  assert(!docToolNames.includes('update_document_file'), 'update_document_file excluded in doc workspace');
  assert(!docToolNames.includes('create_workspace_artifact'), 'create_workspace_artifact excluded in doc workspace');
  assert(docToolNames.includes('insert_structured_document'), 'insert_structured_document included in doc workspace');
  assert(docToolNames.includes('search_document_content'), 'search_document_content included in doc workspace');
  assert(docToolNames.includes('modify_page_layout'), 'modify_page_layout included in doc workspace');
  assert(docToolNames.includes('move_document_section'), 'move_document_section included in doc workspace');
  assert(docToolNames.includes('find_and_replace_text'), 'find_and_replace_text included in doc workspace');

  // In general workspace: external file tools ARE available
  const generalTools = getAvailableTools({
    workspaceType: 'general',
    hasAttachments: false,
  });
  const generalToolNames = generalTools.map((t) => t.name);
  assert(generalToolNames.includes('create_workspace_file'), 'create_workspace_file included in general workspace');

  // Test tool execution permission boundary in doc workspace
  let toolDispatchedAction: any = null;
  const mockContext: ToolExecutionContext = {
    workspaceId: 'workspace-1',
    workspaceType: 'doc',
    conversationId: 'conv-1',
    scratchpad: '',
    attachedSources: [],
    conversationHistory: [],
    activeDocument: {
      id: docId,
      title: 'Test Document',
      format: 'doc',
      wordCount: 150,
      characterCount: 800,
    },
    onEditorAction: async (action) => {
      toolDispatchedAction = action;
    },
  };

  // 1. Attempting to execute update_document_file in doc workspace must fail
  const fileToolRes = await executeTool(
    'update_document_file',
    { documentIdOrTitle: 'other.md', content: 'test' },
    mockContext
  );
  assert(fileToolRes.success === false, 'update_document_file rejected in doc workspace');
  assert(Boolean(fileToolRes.error?.includes('Cannot modify or create external workspace files')), 'Error mentions Document Workspace restriction');

  // 2. Attempting to execute document tool targeting different document must fail
  const mismatchRes = await executeTool(
    'insert_structured_document',
    { documentId: otherDocId, content: '# Malicious Insert' },
    mockContext
  );
  assert(mismatchRes.success === false, 'insert_structured_document targeting other docId rejected');
  assert(Boolean(mismatchRes.error?.includes('Permission denied')), 'Error mentions permission denied');

  // 3. Executing valid document editing tool must succeed and dispatch editor action
  const validEditRes = await executeTool(
    'insert_structured_document',
    { documentId: docId, content: '## New Section\nContent here.' },
    mockContext
  );
  assert(validEditRes.success === true, 'insert_structured_document targeting active document succeeded');
  assert(toolDispatchedAction !== null, 'Editor action dispatched via onEditorAction callback');
  assert(toolDispatchedAction.action === 'insert_structured_document', 'Dispatched action is insert_structured_document');

  // 4. Executing find_and_replace_text tool
  const findReplaceRes = await executeTool(
    'find_and_replace_text',
    { documentId: docId, findText: 'Docium', replaceText: 'DOCIUM AI', replaceAll: true },
    mockContext
  );
  assert(findReplaceRes.success === true, 'find_and_replace_text tool succeeded');

  // 5. Executing modify_page_layout tool
  const pageLayoutToolRes = await executeTool(
    'modify_page_layout',
    { documentId: docId, pageSize: 'Letter', orientation: 'landscape', columns: 2 },
    mockContext
  );
  assert(pageLayoutToolRes.success === true, 'modify_page_layout tool succeeded');

  // 6. Executing move_document_section tool
  const moveSectionToolRes = await executeTool(
    'move_document_section',
    { documentId: docId, sourceHeading: 'Features', position: 'start' },
    mockContext
  );
  assert(moveSectionToolRes.success === true, 'move_document_section tool succeeded');

  // 7. Executing prepend_to_document tool
  const prependRes = await executeTool(
    'prepend_to_document',
    { documentId: docId, content: '# Top Level Title' },
    mockContext
  );
  assert(prependRes.success === true, 'prepend_to_document tool succeeded');

  // 8. Executing duplicate_content tool
  const duplicateRes = await executeTool(
    'duplicate_content',
    { documentId: docId, target: 'selection' },
    mockContext
  );
  assert(duplicateRes.success === true, 'duplicate_content tool succeeded');

  // 9. Executing set_font_style tool
  const fontStyleRes = await executeTool(
    'set_font_style',
    { documentId: docId, fontFamily: 'Georgia, serif', fontSize: '14pt' },
    mockContext
  );
  assert(fontStyleRes.success === true, 'set_font_style tool succeeded');

  // 10. Executing set_line_height tool
  const lineHeightRes = await executeTool(
    'set_line_height',
    { documentId: docId, lineHeight: '1.5', spaceAfter: '8pt' },
    mockContext
  );
  assert(lineHeightRes.success === true, 'set_line_height tool succeeded');

  // 11. Executing modify_table_structure tool
  const tableOpRes = await executeTool(
    'modify_table_structure',
    { documentId: docId, operation: 'add_row_after' },
    mockContext
  );
  assert(tableOpRes.success === true, 'modify_table_structure tool succeeded');

  // 12. Executing insert_callout_box tool
  const calloutRes = await executeTool(
    'insert_callout_box',
    { documentId: docId, type: 'tip', content: 'Here is an expert tip.' },
    mockContext
  );
  assert(calloutRes.success === true, 'insert_callout_box tool succeeded');

  // 13. Executing insert_vector_shape tool
  const shapeRes = await executeTool(
    'insert_vector_shape',
    { documentId: docId, shapeType: 'rounded-rectangle', text: 'Step 1' },
    mockContext
  );
  assert(shapeRes.success === true, 'insert_vector_shape tool succeeded');

  // 14. Executing insert_document_image tool
  const imageRes = await executeTool(
    'insert_document_image',
    { documentId: docId, url: 'https://example.com/chart.png', alt: 'Test image' },
    mockContext
  );
  assert(imageRes.success === true, 'insert_document_image tool succeeded');

  // 15. Executing insert_document_section_break tool
  const sectionBreakRes = await executeTool(
    'insert_document_section_break',
    { documentId: docId, breakType: 'nextPage' },
    mockContext
  );
  assert(sectionBreakRes.success === true, 'insert_document_section_break tool succeeded');

  // 16. Executing editor_undo & editor_redo tools
  const undoRes = await executeTool('editor_undo', { documentId: docId }, mockContext);
  assert(undoRes.success === true, 'editor_undo tool succeeded');
  const redoRes = await executeTool('editor_redo', { documentId: docId }, mockContext);
  assert(redoRes.success === true, 'editor_redo tool succeeded');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: Routine Editing Detection & Source Search Optimization
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Routine Editing vs Source Retrieval ---');

  const checkIsDocEditingRoutine = (prompt: string, workspaceType: string, explicitSources: string[] = []) => {
    return (
      workspaceType === 'doc' &&
      explicitSources.length === 0 &&
      !/\b(?:based on|according to|cite|reference|from (?:attached|the source|sources)|consult)\b/i.test(prompt)
    );
  };

  assert(
    checkIsDocEditingRoutine('Make the title bold and change font to Inter', 'doc') === true,
    'Routine edit "Make title bold" skips source search'
  );
  assert(
    checkIsDocEditingRoutine('Add a comparison table for products', 'doc') === true,
    'Routine edit "Add comparison table" skips source search'
  );
  assert(
    checkIsDocEditingRoutine('Summarize based on the attached report', 'doc') === false,
    '"based on the attached report" activates source search'
  );
  assert(
    checkIsDocEditingRoutine('Cite the findings from sources', 'doc') === false,
    '"Cite the findings from sources" activates source search'
  );
  assert(
    checkIsDocEditingRoutine('Make title bold', 'doc', ['src-1']) === false,
    'Explicit source @attach activates source search'
  );
  assert(
    checkIsDocEditingRoutine('Make title bold', 'general') === false,
    'General workspace does not skip source search'
  );

  console.log('\n======================================================');
  console.log(`ALL TESTS PASSED: ${passedTests} passed, ${failedTests} failed`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\nTests failed with unhandled error:', err);
  process.exit(1);
});

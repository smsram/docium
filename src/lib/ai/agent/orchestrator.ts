/**
 * Universal AI Agent Orchestration Engine
 * Coordinates model calls, multi-step tool execution loops, context retrieval,
 * structured block generation, and Server-Sent Event (SSE) streaming.
 */

import { ProviderId, AiChatMessage, ResearchSource, StructuredContentBlock, AgentActivityEvent, AgentActivityStepUpdate, AgentStepStatus, WorkspaceFileRecord, ActiveDocumentContext, EditorActionEvent } from '@/lib/types';
import { resolveProviderAdapter } from '../adapters/registry';
import { NormalizedMessage, ToolCallRequest } from '../adapters/base';
import {
  getAvailableTools,
  toNormalizedToolDefinitions,
  executeTool,
  getCatalogTool,
  searchToolCatalogTool,
  loadToolDefinitionsTool,
  getAvailableCatalogTools,
  getToolByName,
} from '../tools/registry';
import { ToolExecutionContext } from '../tools/types';
import { searchRelevantChunks } from '../embeddings';
import { isVisionCapableModel } from '../providers';
import { getDocumentCapabilitiesPromptSummary } from '@/lib/editor/capabilityRegistry';
import { parseCloudflarePairs, CloudflarePair } from '../credentials';
import { buildSharedAgentSystemPrompt } from './systemPrompt';
import { getOriginalFile, loadPersistedWorkspaceChunks } from '@/lib/storage/sourceStorage';
import { normalizeBase64DataUrl } from '../adapters/cloudflare';
import { convertMarkdownToDocumentHtml } from '@/components/editor/utils/markdownToHtml';
import { applyEditorActionToShadowDocHtml } from '@/lib/editor/shadowDocEngine';
import { hydrateWorkspaceIndexes } from '../serverIndexBridge';
import { optimizeImageBufferForVision } from '../pdf/pdfService';

/**
 * Mirrors dispatched browser editor actions onto the server's in-memory activeDocContext
 * so subsequent read_document_content / get_document_links / verify_document_state calls
 * within the same agent turn see up-to-date HTML and links instead of stale Round 0 state.
 */
function applyEditorActionToShadowDoc(
  doc: ActiveDocumentContext | undefined,
  action: string,
  payload: Record<string, unknown>
): void {
  applyEditorActionToShadowDocHtml(doc, action, payload);
}

export interface AgentRunParams {
  requestId?: string;
  workspaceId: string;
  workspaceType: string;
  conversationId?: string;
  userPrompt: string;
  attachments?: { name: string; size: string; type: string; url?: string; dataUrl?: string }[];
  attachedSources?: ResearchSource[];
  explicitSourceIds?: string[];
  conversationHistory?: AiChatMessage[];
  scratchpad?: string;
  providerId: ProviderId;
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  accountId?: string;
  searchConfig?: {
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
  };
  enabledTools?: {
    internetSearch?: boolean;
    imageGeneration?: boolean;
    chartsAndData?: boolean;
  };
  workspaceFiles?: WorkspaceFileRecord[];
  activeDocument?: ActiveDocumentContext;
  timeZone?: string;
  adapter?: any;
  onUpdateScratchpad?: (notes: string) => Promise<void> | void;
  signal?: AbortSignal;
}

export type AgentSSEPayload =
  | { type: 'status'; status: 'idle' | 'preparing' | 'executing_tool' | 'generating' | 'completed' | 'cancelled' | 'failed' }
  | { type: 'activity'; event: AgentActivityEvent }
  | { type: 'working_step_started'; stepId: string; title: string; summary?: string; status?: 'running' }
  | { type: 'working_step_completed'; stepId: string; safeSummary?: string; status?: 'completed' | 'failed' | 'cancelled' }
  | { type: 'working_progress_update'; stepId: string; update: { id: string; sequence: number; content: string; timestamp: string } }
  | { type: 'step_explanation'; stepId: string; explanation: string }
  | { type: 'task_started'; taskId?: string }
  | { type: 'task_completed'; taskId?: string }
  | { type: 'task_failed'; taskId?: string; error?: string }
  | { type: 'task_cancelled'; taskId?: string }
  | { type: 'final_response_started' }
  | { type: 'delta'; text: string }
  | { type: 'replace_content'; text: string }
  | { type: 'block'; block: StructuredContentBlock }
  | { type: 'citation'; citation: { sourceId: string; sourceTitle: string; page?: number; snippet: string; url?: string } }
  | { type: 'scratchpad'; notes: string }
  | { type: 'file_op'; operation: 'update' | 'create'; itemType: string; itemId: string; title: string; content: string; mode?: string; summary?: string }
  | { type: 'editor_action'; actionId?: string; action: string; payload: Record<string, unknown>; summary?: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };

export type AgentSSEEvent = AgentSSEPayload & {
  seq?: number;
  streamId?: string;
  requestId?: string;
  responseId?: string;
  conversationId?: string;
};

export type AgentExecutionStage =
  | 'idle'
  | 'model_request_started'
  | 'model_response_received'
  | 'tool_calls_parsed'
  | 'tools_executing'
  | 'tools_completed'
  | 'followup_request_started'
  | 'final_response_received';

export interface ExecutedToolRecord {
  name: string;
  id?: string;
  arguments?: Record<string, unknown>;
  success: boolean;
  summary?: string;
  error?: string;
  isEditorAction?: boolean;
  isFileOp?: boolean;
  data?: unknown;
}

/**
 * Synthesizes an authoritative, helpful confirmation when tools have successfully
 * executed in previous rounds, but the follow-up model response is empty.
 */
export function synthesizeToolCompletionConfirmation(
  executedTools: ExecutedToolRecord[],
  context: {
    activeDocTitle?: string;
    workspaceType?: string;
    userPrompt?: string;
  }
): string {
  // 1. Check for document editor actions
  const editorTools = executedTools.filter(
    (t) =>
      t.isEditorAction ||
      t.name.startsWith('insert_') ||
      t.name.startsWith('append_') ||
      t.name.startsWith('prepend_') ||
      t.name.startsWith('delete_') ||
      t.name.startsWith('duplicate_') ||
      t.name.startsWith('move_') ||
      t.name.startsWith('modify_') ||
      t.name.startsWith('set_') ||
      t.name === 'create_or_edit_heading' ||
      t.name === 'create_document_list' ||
      t.name.startsWith('format_') ||
      t.name.startsWith('replace_') ||
      t.name === 'find_and_replace_text' ||
      t.name === 'editor_undo' ||
      t.name === 'editor_redo' ||
      t.name === 'clear_current_page' ||
      t.name === 'apply_text_formatting' ||
      t.name === 'verify_document_state' ||
      t.name === 'insert_text' ||
      t.name === 'replace_text' ||
      t.name === 'delete_content' ||
      t.name === 'update_document_file'
  );
  if (editorTools.length > 0) {
    const docName = context.activeDocTitle || 'active document';
    const successfulEdits = editorTools.filter((t) => t.success);
    if (successfulEdits.length > 0) {
      const summaryList = successfulEdits
        .map((t) => t.summary)
        .filter(Boolean)
        .join(', ');
      return `I have applied the requested updates directly to **${docName}**${summaryList ? ` (${summaryList})` : ''}.`;
    }
    const failedEdits = editorTools.filter((t) => !t.success);
    const err = failedEdits[0]?.error || 'Failed to update document.';
    return `The document update could not be completed: ${err}`;
  }

  // 2. Check for workspace file operations (create or update)
  const fileTools = executedTools.filter(
    (t) => t.isFileOp || t.name === 'create_workspace_file' || t.name === 'update_workspace_file'
  );
  if (fileTools.length > 0) {
    const successfulFiles = fileTools.filter((t) => t.success);
    if (successfulFiles.length > 0) {
      const titles = successfulFiles
        .map((t) => (t.data as any)?.title || (t.arguments as any)?.title || 'workspace document')
        .filter(Boolean);
      const isCreate = successfulFiles.some((t) => t.name === 'create_workspace_file');
      const uniqueTitles = Array.from(new Set(titles));
      const titleStr = uniqueTitles.length > 0 ? `**${uniqueTitles.join('**, **')}**` : 'the requested file';
      return isCreate
        ? `I created ${titleStr} with the requested content.`
        : `I updated ${titleStr} with the requested content.`;
    }
    const failedFiles = fileTools.filter((t) => !t.success);
    const err = failedFiles[0]?.error || 'Failed to update file.';
    return `The file operation could not be completed: ${err}`;
  }

  // 3. Check for web search results
  const searchTool = executedTools.find((t) => t.name === 'web_search' && t.success);
  if (searchTool && searchTool.data) {
    const data = searchTool.data as { query?: string; results?: Array<{ title: string; url: string; snippet?: string }> };
    if (data.results && data.results.length > 0) {
      const topResults = data.results.slice(0, 4);
      const items = topResults
        .map((r) => `- **[${r.title}](${r.url})**: ${r.snippet || ''}`)
        .join('\n\n');
      return `I found the following information from web search${data.query ? ` for "${data.query}"` : ''}:\n\n${items}`;
    }
    return `I completed the web search${data.query ? ` for "${data.query}"` : ''}, but no relevant results were found.`;
  }

  // 4. Fallback for other executed tools
  const successfulTools = executedTools.filter((t) => t.success);
  if (successfulTools.length > 0) {
    const names = successfulTools.map((t) => humanReadableToolLabel(t.name)).join(', ');
    return `I have successfully completed the requested operations: ${names}.`;
  }

  const failedTools = executedTools.filter((t) => !t.success);
  if (failedTools.length > 0) {
    const errorMsg = failedTools[0]?.error || 'The requested operation could not be completed.';
    return `The requested operation could not be completed: ${errorMsg}`;
  }

  return 'I have completed your request.';
}

function humanReadableToolLabel(toolName: string, args?: Record<string, unknown>): string {
  switch (toolName) {
    case 'search_tool_catalog':
      return 'Discovering tools';
    case 'load_tool_definitions':
      return 'Loading tool capabilities';
    case 'web_search':
      return 'Searching the web';
    case 'open_web_page':
      return 'Reading relevant web content';
    case 'create_bar_chart':
    case 'create_line_chart':
    case 'create_pie_chart':
    case 'create_comparison_chart':
    case 'create_data_table':
      return 'Creating data visual';
    case 'generate_image':
    case 'analyze_attached_image':
    case 'extract_text_from_image':
    case 'inspect_source_image':
      return 'Analyzing visual content';
    case 'calculate':
      return 'Calculating mathematical result';
    case 'search_sources':
      return 'Searching attached sources';
    case 'read_source':
    case 'inspect_source':
    case 'extract_source_tables':
    case 'summarize_source':
    case 'read_source_content':
      return 'Reading source content';
    case 'get_source_details': {
      const target = String(args?.sourceId || args?.filename || '').toLowerCase();
      return target.endsWith('.pdf') ? 'Locating source PDF' : 'Locating source file';
    }
    case 'list_sources':
      return 'Locating workspace sources';
    case 'read_chat_history':
    case 'search_chat_history':
      return 'Reviewing conversation context';
    case 'update_scratchpad':
    case 'clear_scratchpad':
    case 'get_task_scratchpad':
    case 'update_task_scratchpad':
      return 'Updating notes';
    case 'list_documents':
    case 'search_documents':
    case 'extract_document_tables':
      return 'Inspecting the workspace';
    case 'read_active_document':
    case 'read_active_document_structure':
    case 'inspect_active_document_metadata':
    case 'read_active_document_selection':
    case 'get_document_structure':
      return 'Checking active document';
    case 'inspect_active_document_metadata':
    case 'read_active_document_selection':
    case 'get_document_structure':
      return 'Inspecting the document';
    case 'read_document_content':
      return 'Reading document content';
    case 'search_document_text':
    case 'search_document_content':
    case 'locate_document_section':
    case 'find_document_content':
      return 'Finding the requested content';
    case 'find_and_replace_text':
    case 'replace_selected_text':
    case 'insert_text_at_cursor':
    case 'insert_structured_document':
    case 'insert_text':
    case 'replace_text':
    case 'prepend_to_document':
    case 'append_or_insert_paragraph':
    case 'create_or_edit_heading':
    case 'create_document_list':
    case 'insert_document_table':
    case 'modify_table_structure':
    case 'insert_hyperlink':
    case 'change_document_alignment':
    case 'insert_callout_box':
    case 'insert_vector_shape':
    case 'insert_document_image':
    case 'insert_document_page_break':
    case 'insert_document_section_break':
    case 'modify_page_layout':
    case 'editor_undo':
    case 'editor_redo':
    case 'rename_current_document':
      return 'Updating the document';
    case 'clear_current_page':
      return 'Clearing document page';
    case 'insert_paragraph':
    case 'insert_heading':
    case 'insert_list':
    case 'insert_table':
    case 'insert_image':
    case 'insert_link':
    case 'insert_page_break':
    case 'insert_section_break':
    case 'insert_horizontal_rule':
    case 'insert_quote':
    case 'insert_code_block':
    case 'insert_table_of_contents':
    case 'append_content':
    case 'prepend_content':
    case 'insert_callout':
      return 'Inserting structured content';
    case 'rewrite_content':
    case 'expand_content':
    case 'shorten_content':
    case 'simplify_content':
    case 'formalize_content':
    case 'change_content_tone':
    case 'translate_content':
    case 'proofread_content':
    case 'continue_writing':
    case 'generate_document_outline':
    case 'generate_section_content':
    case 'generate_introduction':
    case 'generate_conclusion':
    case 'generate_summary':
    case 'generate_faq':
    case 'convert_content_to_bullets':
    case 'convert_bullets_to_paragraph':
    case 'convert_content_to_table':
    case 'convert_table_to_text':
    case 'convert_content_to_steps':
      return 'Transforming document content';
    case 'delete_paragraph':
    case 'delete_section':
    case 'delete_heading':
    case 'delete_table':
    case 'delete_image':
    case 'delete_matching_content':
    case 'delete_repeated_content':
    case 'delete_empty_paragraphs':
    case 'delete_hyperlinks':
      return 'Removing document content';
    case 'replace_paragraph':
    case 'replace_section':
    case 'replace_table':
    case 'replace_image':
    case 'replace_placeholder':
      return 'Replacing document content';
    case 'move_content':
    case 'merge_paragraphs':
    case 'split_paragraph':
      return 'Organizing document content';
    case 'set_font_family':
    case 'set_font_size':
    case 'set_font_color':
    case 'set_highlight_color':
    case 'set_bold':
    case 'set_italic':
    case 'set_underline':
    case 'set_strikethrough':
    case 'set_text_alignment':
    case 'set_line_spacing':
    case 'set_paragraph_spacing':
    case 'format_all_headings':
    case 'format_all_paragraphs':
    case 'format_matching_content':
    case 'remove_formatting':
    case 'format_document_text':
    case 'set_font_style':
    case 'set_line_height':
    case 'apply_text_formatting':
      return 'Formatting the document';
    case 'get_document_outline':
    case 'get_paragraph_details':
    case 'get_section_details':
    case 'get_table_details':
    case 'get_image_details':
    case 'get_document_statistics':
    case 'get_document_settings':
    case 'navigate_to_content':
    case 'select_content':
      return 'Inspecting document structure';
    case 'create_table':
    case 'clear_table_contents':
    case 'add_table_row':
    case 'delete_table_row':
    case 'add_table_column':
    case 'delete_table_column':
    case 'merge_table_cells':
    case 'split_table_cells':
    case 'update_table_cell':
    case 'replace_table_data':
    case 'extract_table_data':
      return 'Managing table data';
    case 'list_document_images':
    case 'set_image_alt_text':
    case 'check_missing_alt_text':
      return 'Managing embedded media';
    case 'get_page_settings':
    case 'set_page_size':
    case 'set_page_orientation':
    case 'set_page_margins':
    case 'update_header':
    case 'update_footer':
    case 'delete_header':
    case 'delete_footer':
    case 'insert_page_numbers':
      return 'Configuring page layout';
    case 'get_document_links':
    case 'insert_hyperlink':
    case 'update_hyperlink':
    case 'remove_hyperlink':
    case 'get_document_comments':
    case 'add_document_comment':
    case 'resolve_document_comment':
    case 'delete_document_comment':
      return 'Managing links and comments';
    case 'check_spelling':
    case 'check_grammar':
    case 'check_readability':
    case 'check_repetition':
    case 'check_heading_hierarchy':
    case 'check_accessibility':
    case 'create_review_report':
      return 'Reviewing document quality';
    case 'export_as_pdf':
    case 'export_as_docx':
    case 'export_as_txt':
    case 'export_as_html':
      return 'Exporting the document';
    case 'get_document_versions':
    case 'create_document_snapshot':
    case 'restore_document_version':
    case 'undo_document_operation':
    case 'redo_document_operation':
      return 'Managing document versions';
    case 'delete_selected_content':
    case 'delete_content':
      return 'Removing the selected content';
    case 'duplicate_content':
      return 'Duplicating content';
    case 'move_document_section':
      return 'Moving document section';
    case 'save_document_changes':
    case 'inspect_document_save_status':
    case 'verify_document_state':
      return 'Verifying document changes';
    case 'search_workspace_images':
    case 'inspect_image_details':
      return 'Analyzing visual content';
    case 'update_document_file':
    case 'create_workspace_file':
    case 'inspect_file_metadata':
    case 'search_workspace_files':
    case 'list_workspace_files':
    case 'create_workspace_artifact':
      return 'Managing workspace files';
    case 'list_sheets':
    case 'read_sheet_range':
    case 'calculate_statistics':
      return 'Analyzing spreadsheet data';
    case 'list_slides':
    case 'read_slide_content':
      return 'Reviewing presentation deck';
    case 'read_pdf_page': {
      const pageNum = args?.pageNumber;
      return typeof pageNum === 'number' && pageNum > 0 ? `Reading PDF page ${pageNum}` : 'Reading PDF content';
    }
    case 'search_pdf_content':
      return 'Searching PDF content';
    case 'multi_source_research':
    case 'fact_extraction':
      return 'Synthesizing multi-source research';
    default:
      return 'Executing operation';
  }
}

/**
 * Generates natural-language progress explanations for steps.
 * Replaces developer/system logs with conversational assistant progress summaries.
 */
function generateNaturalStepContent(
  toolName: string,
  args?: unknown,
  isCompleted: boolean = false,
  resultSummary?: string
): string {
  // If a clean natural summary is already available and doesn't look like a log or query dump
  if (
    resultSummary &&
    !resultSummary.startsWith('Query:') &&
    !resultSummary.startsWith('Called ') &&
    !resultSummary.startsWith('{') &&
    resultSummary !== 'Completed' &&
    resultSummary !== 'OK' &&
    resultSummary !== 'Saved'
  ) {
    return resultSummary;
  }

  switch (toolName) {
    case 'search_tool_catalog':
      return isCompleted
        ? 'I identified suitable tools in the registry for this task.'
        : 'I am searching the tool registry for available capabilities.';
    case 'load_tool_definitions':
      return isCompleted
        ? 'I loaded the required tool capabilities for this task.'
        : 'I am loading the required tool definitions.';
    case 'clear_current_page':
      return isCompleted
        ? 'The body content of the active page has been cleared while preserving document structure.'
        : 'I am removing the body content from the active document page while preserving other pages.';
    case 'insert_text':
      return isCompleted
        ? 'I have inserted the content into the active document.'
        : 'I am inserting the requested content into the active document.';
    case 'replace_text':
      return isCompleted
        ? 'I have replaced the matching text in the active document.'
        : 'I am replacing the matching text in the active document.';
    case 'delete_content':
      return isCompleted
        ? 'The selected content has been removed from the active document.'
        : 'I am removing the selected content from the active document.';
    case 'apply_text_formatting':
      return isCompleted
        ? 'I have updated the document formatting as requested.'
        : 'I am applying formatting to the specified content in the active document.';
    case 'verify_document_state':
      return isCompleted
        ? 'The document changes have been verified and applied to the active page.'
        : 'I am verifying the document state, content integrity, and persistence.';
    case 'get_document_structure':
      return isCompleted
        ? 'I have inspected the active document structure, headings, and outline.'
        : 'I am inspecting the active document structure and headings outline.';
    case 'read_document_content':
      return isCompleted
        ? 'I have read the specified document content.'
        : 'I am reading the specified content from the active document.';
    case 'find_document_content':
      return isCompleted
        ? 'I located the matching content in the active document.'
        : 'I am scanning the active document to find matching content.';
    case 'list_sources':
      return isCompleted
        ? 'I have retrieved the accessible sources for this task.'
        : 'I am listing the accessible sources and files for this workspace.';
    case 'get_source_details':
      return isCompleted
        ? 'I have inspected the source metadata and structure details.'
        : 'I am retrieving metadata and structure details for the source.';
    case 'read_source_content':
      return isCompleted
        ? 'I have reviewed the relevant source content.'
        : 'I am reading the relevant content from the source.';
    case 'inspect_source_image':
      return isCompleted
        ? 'I have inspected the visual content.'
        : 'I am visually inspecting the image or page figure.';
    case 'get_task_scratchpad':
      return isCompleted
        ? 'I have reviewed the task notes.'
        : 'I am retrieving the latest task notes from the scratchpad.';
    case 'update_task_scratchpad':
      return isCompleted
        ? 'I have updated the task notes.'
        : 'I am updating the persistent task notes.';
    case 'read_active_document':
    case 'read_active_document_structure':
    case 'inspect_active_document_metadata':
      return isCompleted
        ? 'I have inspected the active document structure, headings, and current page outline.'
        : 'I am reading the active document structure to identify the target page and sections.';
    case 'read_active_document_selection':
      return isCompleted
        ? 'I checked the currently selected text in the document editor.'
        : 'I am checking the current selection in the document editor.';
    case 'search_document_text':
    case 'search_document_content':
    case 'locate_document_section':
      return isCompleted
        ? 'I located the target section and identified the content to be modified.'
        : 'I am scanning the active document to find the matching sections.';
    case 'delete_selected_content':
      return isCompleted
        ? 'The selected content has been removed from the active page while preserving other sections.'
        : 'I have identified the target page and am removing its content.';
    case 'insert_structured_document':
    case 'insert_text_at_cursor':
    case 'append_or_insert_paragraph':
    case 'replace_selected_text':
    case 'find_and_replace_text':
      return isCompleted
        ? 'I have applied the requested changes to the active document while preserving the rest of the pages.'
        : 'I have identified the target page. I am now applying the updates while preserving the document\'s other pages.';
    case 'format_document_text':
    case 'set_font_style':
    case 'set_line_height':
    case 'change_document_alignment':
      return isCompleted
        ? 'I have updated the formatting and text styles as requested.'
        : 'I am updating the text formatting in the active document.';
    case 'save_document_changes':
      return isCompleted
        ? 'The document changes have been verified and saved in the active editor.'
        : 'The page is now updated. I am checking that the other pages remain unchanged.';
    case 'web_search':
      return isCompleted
        ? 'I located relevant online information to inform this task.'
        : 'I am searching for relevant information to fulfill your request.';
    case 'open_web_page':
      return isCompleted
        ? 'I reviewed the web content and extracted the key information.'
        : 'I am reading the relevant online source.';
    case 'create_bar_chart':
    case 'create_line_chart':
    case 'create_pie_chart':
    case 'create_comparison_chart':
    case 'create_data_table':
      return isCompleted
        ? 'I have generated the data visual to illustrate the information.'
        : 'I am preparing the data visual for your document.';
    default:
      return isCompleted
        ? 'I have completed this stage of the task.'
        : 'I am performing the requested operation on the document.';
  }
}

/**
 * Detects whether the prompt requires live, real-time, or external web research.
 */
export function isLiveResearchRequired(userPrompt: string): boolean {
  const clean = userPrompt.trim().toLowerCase();

  // Exclude simple greetings and pleasantries if no web/news/current research terms
  if (
    /^(hi|hello|hey|who are you|what can you do|how are you|how are you doing|thanks|thank you|ok|okay|bye|goodbye)\b/i.test(clean) &&
    !/\b(search|news|latest|online|web|stock|weather|price)\b/i.test(clean)
  ) {
    return false;
  }

  // 1. Explicit search actions
  if (/\b(search(\s+the|\s+for|\s+online|\s+web|\s+internet)?|look\s*up|google|browse|find\s+online)\b/i.test(clean)) {
    return true;
  }

  // 2. Freshness and time-sensitive triggers with domain keywords
  if (/\b(latest|recent|current|today|as\s+of\s+today|this\s+(week|month|year)|breaking\s*news|live\s*(facts?|data|news))\b/i.test(clean)) {
    if (/\b(news|updates?|developments?|trends?|events?|announcements?|releases?|prices?|weather|score|results?|stats?|status|ai|models?)\b/i.test(clean)) {
      return true;
    }
  }

  // 3. Questions asking for current facts, news, or external research
  if (/\b(what\s+are\s+the\s+latest|find\s+the\s+latest|what\s+is\s+the\s+current|what\s+happened\s+(today|recently|this\s+week)|who\s+won|score\s+of)\b/i.test(clean)) {
    return true;
  }

  // 4. "Find ... news"
  if (/\bfind\s+(the\s+)?(latest|current|recent)?\s*([a-z0-9\-_\s]+)\s+news\b/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Extracts a concise, high-signal search query from user prompt.
 */
export function extractSearchQuery(userPrompt: string): string {
  let q = userPrompt.trim();

  // Strip leading document/workspace action phrases (e.g. "Remove existing content and place...", "Find and place...")
  q = q.replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:(?:remove|clear|delete)\s+(?:the\s+)?(?:existing|current|all)\s+(?:content|text|page)\s+and\s+)?(?:search(?:\s+for|\s+the\s+web\s+for|\s+online\s+for)?|look\s*up|find(?:\s+out\s+about|\s+the|\s+me)?|google|browse\s+for)\s+(?:and\s+(?:place|insert|put|add|write|create|draft)\s+)?/i, '');
  q = q.replace(/^(?:place|insert|put|add|write|create|draft)\s+/i, '');

  // Strip trailing styling, chart, and file-operation clauses
  q = q.replace(/\s+and\s+(?:make\s+it\s+look(?:\s+good)?|style\s+it|format\s+it|use\s+best\s+font|you\s+(?:might|can|should)\s+use\s+(?:charts?|graphs?|tables?)|with\s+(?:best\s+)?font|including\s+(?:charts?|graphs?)).*$/i, '');
  q = q.replace(/\s+with\s+(?:best\s+)?(?:font|fonts|styling|formatting|colors|charts?|graphs?).*$/i, '');
  q = q.replace(/\s+and\s+(update|write|save|store|add|append|put|create|record|log)\s+(it\s+)?(to|in|into|my)?\s+([a-zA-Z0-9_\-\.\s]+)?(document|file|workspace|notes?|doc).*$/i, '');
  q = q.replace(/\s+and\s+(compare\s+them|give\s+me\s+a\s+summary|summarize\s+them|put\s+it\s+in\s+a\s+table).*$/i, '');

  // Strip leading question markers
  q = q.replace(/^(what\s+are\s+the|what\s+is\s+the|tell\s+me\s+about\s+the|who\s+is\s+the)\s+/i, '');

  // Normalize "until now" / "up to now" to current year for cleaner web search results
  const currentYear = String(new Date().getFullYear());
  if (/\b(?:until\s+now|up\s+to\s+now|so\s+far|to\s+date|latest)\b/i.test(q) && !/\b20\d{2}\b/.test(q)) {
    q = q.replace(/\b(?:until\s+now|up\s+to\s+now|so\s+far|to\s+date)\b/gi, '').trim();
    q = `${q} ${currentYear}`.trim();
  }

  // Strip ending punctuation
  q = q.replace(/[?!.,]+$/, '').trim();

  // If query became too short or empty, fall back to cleaned prompt
  if (q.length < 3) {
    q = userPrompt.replace(/[?!.]+$/, '').trim();
  }

  return q;
}

/**
 * Detects whether user explicitly requested a file update or creation.
 */
export function detectFileOperationIntent(userPrompt: string): {
  isTargeted: boolean;
  operation: 'update' | 'create';
  documentTitle?: string;
} {
  const clean = userPrompt.trim();
  // Check for "update [my] <title> document" or "save to [my] <title> document"
  const updateMatch = clean.match(
    /\b(?:update|append\s+to|add\s+to|save\s+to|write\s+to)\s+(?:my\s+|the\s+)?([a-zA-Z0-9_\-\s]+?)\s+(?:document|doc|file)\b/i
  );
  if (updateMatch && updateMatch[1]) {
    const title = updateMatch[1].trim();
    if (!['a', 'the', 'my', 'new', 'existing'].includes(title.toLowerCase())) {
      return { isTargeted: true, operation: 'update', documentTitle: title };
    }
  }

  // Check for "create a [document/file] [named/called] <title>"
  const createMatch = clean.match(
    /\b(?:create|make|draft)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:document|file|doc)\s+(?:named|called|titled)?\s*["']?([a-zA-Z0-9_\-\s]+?)["']?(?:\s|$|\.)/i
  );
  if (createMatch && createMatch[1]) {
    const title = createMatch[1].trim();
    if (!['a', 'the', 'my', 'new'].includes(title.toLowerCase())) {
      return { isTargeted: true, operation: 'create', documentTitle: title };
    }
  }

  return { isTargeted: false, operation: 'update' };
}

/**
 * Detects whether the user's prompt is an action request requiring document modification.
 */
export function isDocumentActionRequest(userPrompt: string): boolean {
  const clean = userPrompt.trim().toLowerCase();

  // 1. Direct placement, preparation, update, or creation intent on document/page
  if (
    /\b(prepare|place|insert|add|put|write|append|prepend|type|include|draft|create|generate|populate|update|modify|edit|fill|build|compile|compose|produce|summarize|outline|design|construct|craft|format|style)\b[\s\S]*?\b(page|document|doc|content|section|paragraph|heading|table|list|text|intro|introduction|report|here|editor|summary|overview|about|guide|article|essay|spec|specification|models)\b/i.test(clean)
  ) {
    return true;
  }

  // 2. Direct document artifact creation ("Prepare a document on...", "Create a report on...", "Write an article about...")
  if (
    /\b(prepare|create|write|draft|generate|make|build|compile|compose|produce)\s+(?:a\s+|an\s+|the\s+)?(?:detailed\s+|comprehensive\s+|complete\s+|full\s+|short\s+|quick\s+|new\s+|styled\s+)?(?:report|article|summary|essay|guide|section|outline|overview|table|list|comparison|document|doc|page|note|notes|catalog)\b/i.test(clean)
  ) {
    return true;
  }

  // 3. Formatting, spacing, font, and styling actions
  if (
    /\b(make|change|set|format|bold|italic|underline|align|style|styling|heading|h1|h2|h3|h4|h5|h6|center|justify|indent|colorize|highlight|spacing|line\s*height|line\s*spacing|font)\b[\s\S]*?\b(heading|headings|paragraph|paragraphs|title|text|section|line|selection|table|list|page|document|doc|spacing|height|font|size|color|styling|1|1\.0|1\.15|1\.5|2|2\.0|single|double)\b/i.test(clean) ||
    /\bmake\s+(?:the|this|that)?\s*.*?\s+(?:heading|bold|italic|underline|center|spacing)/i.test(clean) ||
    /\b(?:spacing|line\s*spacing|line\s*height)\s*(?:as|to|=)?\s*(?:1|1\.0|1\.15|1\.5|2|2\.0|single|double)\b/i.test(clean)
  ) {
    return true;
  }

  // 4. Replacement, editing, or deletion actions
  if (
    /\b(replace|rewrite|substitute|delete|remove|clear|rephrase|improve)\b[\s\S]*?\b(selection|selected|paragraph|sentence|text|heading|section|content|table|word|with)\b/i.test(clean)
  ) {
    return true;
  }

  // 5. Document management actions
  if (
    /\b(rename\s+(?:the\s+|this\s+)?document|save\s+(?:the\s+|this\s+)?document|save\s+changes|insert\s+page\s+break)\b/i.test(clean)
  ) {
    return true;
  }

  // 6. Explicit page/document references ("in the page", "on the page", "in the doc", "to the document")
  if (
    /\b(in\s+the\s+page|on\s+the\s+page|to\s+the\s+page|in\s+this\s+doc|in\s+the\s+document|to\s+the\s+document|at\s+the\s+end|at\s+cursor)\b/i.test(clean)
  ) {
    return true;
  }

  return false;
}

/**
 * Synthesizes meaningful, structured document content for action requests when the model outputs only conversational promises.
 */
export function generateSubstantiveDocumentContent(userPrompt: string, docTitle?: string): string {
  const clean = userPrompt.trim();
  const effectiveTitle = docTitle && docTitle !== 'Untitled' ? docTitle : 'Overview';

  if (/about\s*(?:yourself|ai|assistant|me)/i.test(clean)) {
    return `## About the AI Assistant\n\nI am DOCIUM AI, an integrated workspace intelligence partner designed to assist with document drafting, research synthesis, and content organization. I operate directly within your workspace using secure, canonical editor transactions.\n\n### Core Capabilities\n- **Structured Authoring**: Instant multi-section generation with headings, lists, and tables\n- **Multi-source Analysis**: Seamless grounding across uploaded files and workspace documents\n- **Editor Integration**: Direct ProseMirror document transactions with verified persistence`;
  }

  if (/\b(?:table|comparison)\b/i.test(clean)) {
    return `## Feature Comparison\n\n| Capability | Standard Edition | Enterprise Edition |\n| --- | --- | --- |\n| AI Document Editing | Real-time | Real-time & Multi-turn |\n| Multimodal Analysis | Local & Vision | High-concurrency |\n| Offline Persistence | IndexedDB & Store | Encrypted Local Cache |`;
  }

  if (/\b(?:heading|headings|title)\b/i.test(clean)) {
    return `## ${effectiveTitle}\n\nThis section establishes the framework for ${effectiveTitle}. It outlines key objectives, structural highlights, and operational considerations.\n\n### Strategic Objectives\n- Maintain clear, consistent typography and hierarchical headings.\n- Ensure all content edits are verified through canonical editor transactions.\n- Preserve document styling and layout pagination across revisions.`;
  }

  return `## ${effectiveTitle}\n\nWelcome to ${effectiveTitle}. This document provides a structured foundation for authoring, reviewing, and organizing information within DOCIUM.\n\n### Key Highlights\n- **Hierarchical Layout**: Clean section organization with standard typography\n- **Dynamic Editing**: Seamless integration between AI assistance and direct document manipulation\n- **Reliable Persistence**: Undoable transactions preserved across document reloads`;
}

/**
 * Determines whether tools and function schemas should be attached for a given prompt.
 * Simple greetings, casual banter, and general explanations bypass tool injection,
 * ensuring fast, direct natural language generation without model confusion.
 */
export function shouldEnableToolsForPrompt(
  userPrompt: string,
  hasAttachments: boolean,
  enabledTools?: { internetSearch?: boolean; imageGeneration?: boolean; chartsAndData?: boolean },
  workspaceType?: string
): boolean {
  if (hasAttachments) {
    return true;
  }

  // If in Document workspace and it's any document action request: ALWAYS enable tools!
  if (workspaceType === 'doc' && isDocumentActionRequest(userPrompt)) {
    return true;
  }

  const clean = userPrompt.trim().toLowerCase();
  const normalized = clean.replace(/[!?,.:;'"-]+$/, '').trim();

  // 1. Common Conversational Greetings and Pleasantries
  const conversationalPhrases = new Set([
    'hi',
    'hello',
    'hey',
    'hey there',
    'hello there',
    'howdy',
    'yo',
    'greetings',
    'good morning',
    'good afternoon',
    'good evening',
    'good day',
    'how are you',
    'how are you doing',
    'who are you',
    'what can you do',
    'what are you',
    'what is your name',
    'help',
    'test',
    'testing',
    'ping',
    'thanks',
    'thank you',
    'ok',
    'okay',
    'great',
    'cool',
    'awesome',
    'bye',
    'goodbye',
  ]);

  if (conversationalPhrases.has(normalized)) {
    return false;
  }

  // In document workspaces, any non-greeting request receives tools
  if (workspaceType === 'doc') {
    return true;
  }

  // 2. Explicit Tool Triggers
  const hasSearchIntent =
    Boolean(enabledTools?.internetSearch) &&
    /\b(search|google|browse|look\s*up|find\s*online|web|latest|today|news|current|weather|stock\s*price)\b/i.test(clean);

  const hasChartIntent =
    enabledTools?.chartsAndData !== false &&
    /\b(chart|graph|plot|visualize|bar\s*chart|pie\s*chart|line\s*chart|comparison\s*chart|data\s*table|distribution)\b/i.test(clean);

  const hasImageGenIntent =
    Boolean(enabledTools?.imageGeneration) &&
    /\b(generate|create|draw|make|render|illustrate)\s+(an?\s+)?(image|picture|photo|illustration|drawing|artwork|graphic|banner|logo)\b/i.test(clean);

  const hasCalculationIntent =
    /\b(calculate|compute|solve|\d+\s*[\+\-\*\/%^]\s*\d+)\b/i.test(clean);

  const hasScratchpadIntent =
    /\b(scratchpad|note\s*down|remember\s*this|save\s*to\s*notes|clear\s*notes)\b/i.test(clean);

  const hasWorkspaceOrFileIntent =
    /\b(document|documents|file|files|workspace|update|edit|write|save|append|create|read|inspect|draft|notes?)\b/i.test(clean);

  if (
    hasSearchIntent ||
    hasChartIntent ||
    hasImageGenIntent ||
    hasCalculationIntent ||
    hasScratchpadIntent ||
    hasWorkspaceOrFileIntent ||
    isLiveResearchRequired(userPrompt)
  ) {
    return true;
  }

  // If user explicitly enabled internet search or image gen and asks an open research question
  if (enabledTools?.internetSearch && /\b(who is|what happened|when did|where is|latest|current)\b/i.test(clean)) {
    return true;
  }

  return false;
}

export function stripInternalReasoningTokens(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
    .replace(/<\/?(?:think|thought|internal_reasoning)>/gi, '')
    .replace(/<\|(?:im_end|im_start|endoftext|im_sep)\|>/gi, '');
}

export function isMetaNarration(text: string): boolean {
  const clean = text.trim().toLowerCase();
  return (
    /^(?:let me\b|i will now\b|i'll now\b|i am now going to\b|i need to\b|first,? let me\b|now let me\b|let's\b)/i.test(clean) &&
    /\b(?:search|tool|tools|inspect|list|check|call|query|load|read)\b/i.test(clean)
  );
}

export interface LiveStepProgressState {
  currentLiveUpdateId: string | null;
  updateSequence: number;
}

export function applyLiveStepProgress(
  step: AgentActivityEvent,
  content: string,
  state: LiveStepProgressState
): AgentActivityStepUpdate | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;

  if (!step.updates) {
    step.updates = [];
  }

  if (state.currentLiveUpdateId) {
    const liveIdx = step.updates.findIndex((u) => u.id === state.currentLiveUpdateId);
    if (liveIdx !== -1) {
      step.updates[liveIdx].content = trimmed;
      step.safeSummary = trimmed;
      step.description = trimmed;
      return step.updates[liveIdx];
    }
  }

  state.updateSequence++;
  const newId = `upd-${Date.now()}-${state.updateSequence}`;
  state.currentLiveUpdateId = newId;
  const update: AgentActivityStepUpdate = {
    id: newId,
    sequence: step.updates.length + 1,
    content: trimmed,
    timestamp: new Date().toISOString(),
  };
  step.updates.push(update);
  step.safeSummary = trimmed;
  step.description = trimmed;
  return update;
}

export function updateLiveStepProgress(
  step: AgentActivityEvent,
  content: string,
  state?: LiveStepProgressState
): AgentActivityStepUpdate | undefined {
  const internalState = state || {
    currentLiveUpdateId: (step as any)._currentLiveUpdateId || null,
    updateSequence: (step as any)._updateSequence || 0,
  };
  const res = applyLiveStepProgress(step, content, internalState);
  (step as any)._currentLiveUpdateId = internalState.currentLiveUpdateId;
  (step as any)._updateSequence = internalState.updateSequence;
  return res;
}

export async function* runAgentOrchestrator(params: AgentRunParams): AsyncIterable<AgentSSEEvent> {
  const {
    workspaceId,
    workspaceType,
    userPrompt,
    attachedSources: rawAttachedSources,
    providerId,
    modelId,
    apiKey,
    baseUrl,
    accountId,
    enabledTools,
    signal,
  } = params;

  const conversationId = params.conversationId || workspaceId;
  const conversationHistory = params.conversationHistory || [];
  const attachedSources: ResearchSource[] = [];
  const seenSrcIds = new Set<string>();
  const seenSrcHashes = new Set<string>();
  const seenSrcNames = new Set<string>();
  for (const s of rawAttachedSources || []) {
    if (!s || !s.id) continue;
    const h = s.contentHash?.toLowerCase() || '';
    const n = `${(s.title || '').toLowerCase()}::${(s.fileSize || '').toLowerCase()}`;
    if (seenSrcIds.has(s.id) || (h && seenSrcHashes.has(h)) || seenSrcNames.has(n)) {
      continue;
    }
    seenSrcIds.add(s.id);
    if (h) seenSrcHashes.add(h);
    seenSrcNames.add(n);
    attachedSources.push(s);
  }

  // Server Defense-in-Depth: Recover any turn-attached or @mentioned files stored in .docium_storage
  // if client state dropped attachedSources between upload and prompt submission
  if (workspaceId) {
    const persistedChunks = loadPersistedWorkspaceChunks(workspaceId);
    const recoveryKeys = new Set<string>();
    for (const att of params.attachments || []) {
      if ((att as any).id) recoveryKeys.add(String((att as any).id));
      if (att.name) recoveryKeys.add(att.name);
    }
    for (const sid of params.explicitSourceIds || []) {
      if (sid) recoveryKeys.add(sid);
    }
    for (const key of recoveryKeys) {
      const alreadyPresent = attachedSources.some(
        (s) => s.id === key || s.title.toLowerCase() === key.toLowerCase()
      );
      if (alreadyPresent) continue;

      const stored = getOriginalFile(workspaceId, key);
      if (stored) {
        const matchedChunks = persistedChunks.filter((c) => c.sourceId === stored.sourceId);
        const recoveredText = matchedChunks.map((c) => c.text).join('\n\n').slice(0, 12000);
        const lowerName = stored.filename.toLowerCase();
        const inferredType: ResearchSource['type'] =
          stored.mimeType === 'application/pdf' || lowerName.endsWith('.pdf')
            ? 'pdf'
            : lowerName.endsWith('.docx') || lowerName.endsWith('.doc')
            ? 'docx'
            : lowerName.endsWith('.xlsx') || lowerName.endsWith('.csv')
            ? 'xlsx'
            : lowerName.endsWith('.pptx')
            ? 'pptx'
            : stored.mimeType?.startsWith('image/')
            ? 'image'
            : 'txt';
        attachedSources.push({
          id: stored.sourceId,
          title: stored.filename,
          type: inferredType,
          mimeType: stored.mimeType,
          fileSize: `${(stored.byteLength / 1024).toFixed(1)} KB`,
          snippet: recoveredText.slice(0, 280) || `Stored workspace source "${stored.filename}"`,
          extractedText: recoveredText || undefined,
          chunkCount: matchedChunks.length || 1,
          addedAt: stored.createdAt,
          status: 'ready',
          tags: ['Attachment', inferredType.toUpperCase()],
          isIncludedInContext: true,
          workspaceId,
        });
      }
    }
  }

  const activeDocContext: ActiveDocumentContext | undefined = params.activeDocument || (workspaceType === 'doc' ? {
    id: workspaceId,
    title: 'Untitled Document',
    format: 'doc',
    editorMounted: true,
    isEditable: true,
  } : undefined);

  let currentScratchpad = params.scratchpad || '';
  const activityEvents: AgentActivityEvent[] = [];
  const structuredBlocks: StructuredContentBlock[] = [];
  const collectedCitations: Array<{ sourceId: string; sourceTitle: string; page?: number; snippet: string; url?: string }> = [];

  const pendingFileOps: Array<{
    operation: 'update' | 'create';
    itemType: string;
    itemId: string;
    title: string;
    content: string;
    mode?: string;
    summary?: string;
  }> = [];

  const pendingEditorActions: Array<{
    actionId?: string;
    action: string;
    payload: Record<string, unknown>;
    summary?: string;
  }> = [];

  const dispatchedActionIds = new Set<string>();
  let fileOpExecuted = false;
  let editorActionExecuted = false;
  let contentPlacementExecuted = false;
  const isPureLayoutViewOrExportIntent =
    /\b(border|borders|margin|margins|orientation|landscape|portrait|page\s*size|a4|letter|legal|a3|a5|tabloid|column|columns|watermark|page\s*color|background\s*color|header|footer|first\s*page|different\s*first\s*page|page\s*number|zoom|ruler|outline|focus\s*mode|formatting\s*marks|continuous\s*view|paginated\s*view|export|download|print)\b/i.test(userPrompt) &&
    !/\b(prepare|write|draft|essay|article|report|notes|answers?|questions?|code|program|script|diagram|flowchart|chart)\b/i.test(userPrompt);
  const requiresContentPlacement =
    workspaceType === 'doc' &&
    !isPureLayoutViewOrExportIntent &&
    /\b(place|insert|write|create|draft|generate|prepare|build|add|put|replace|update|fill|compose|produce)\b/i.test(userPrompt);
  const CONTENT_PLACEMENT_TOOLS = new Set([
    'insert_text',
    'insert_structured_document',
    'insert_paragraph',
    'append_or_insert_paragraph',
    'append_content',
    'prepend_content',
    'insert_heading',
    'create_or_edit_heading',
    'insert_list',
    'create_document_list',
    'insert_table',
    'insert_document_table',
    'replace_table',
    'style_table',
    'insert_code_block',
    'insert_callout',
    'insert_shape',
    'insert_text_box',
    'insert_chart',
    'insert_diagram',
    'insert_image',
    'insert_equation',
    'insert_cover_page',
    'insert_footnote',
    'insert_endnote',
    'insert_caption',
    'replace_text',
    'replace_content',
    'replace_section',
    'replace_paragraph',
    'delete_content',
    'delete_section',
    'delete_paragraph',
    'delete_matching_content',
    'rewrite_content',
    'expand_content',
    'shorten_content',
    'simplify_content',
    'formalize_content',
    'change_content_tone',
    'translate_content',
    'proofread_content',
    'continue_writing',
    'generate_section_content',
    'set_page_borders',
    'set_page_color',
    'set_page_columns',
    'set_page_size',
    'set_page_orientation',
    'set_page_margins',
    'update_header',
    'update_footer',
    'delete_header',
    'delete_footer',
    'insert_page_numbers',
    'insert_watermark',
    'set_document_view',
    'export_as_pdf',
    'export_as_docx',
    'export_as_html',
    'export_as_txt',
    'export_as_markdown',
    'print_document',
  ]);

  let stepOrder = 0;
  let eventSeq = 0;
  const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const responseId = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const requestId = params.requestId;

  const createSSEEvent = (payload: AgentSSEPayload): AgentSSEEvent => {
    return {
      ...payload,
      seq: ++eventSeq,
      streamId,
      requestId,
      responseId,
      conversationId,
    };
  };

  let updateSequence = 0;
  let currentLiveUpdateId: string | null = null;

  const updateLiveStepProgress = (stepId: string, content: string): AgentActivityStepUpdate | undefined => {
    const existing = activityEvents.find((a) => a.id === stepId || a.stepId === stepId);
    if (!existing) return undefined;
    const state: LiveStepProgressState = { currentLiveUpdateId, updateSequence };
    const res = applyLiveStepProgress(existing, content, state);
    currentLiveUpdateId = state.currentLiveUpdateId;
    updateSequence = state.updateSequence;
    return res;
  };

  const addStepUpdate = (stepId: string, content: string): AgentActivityStepUpdate | undefined => {
    currentLiveUpdateId = null;
    const trimmed = content.trim();
    if (!trimmed) return undefined;
    const existing = activityEvents.find((a) => a.id === stepId || a.stepId === stepId);
    if (!existing) return undefined;

    if (!existing.updates) {
      existing.updates = [];
    }

    // Check if duplicate of last update
    const last = existing.updates[existing.updates.length - 1];
    if (last && last.content === trimmed) {
      return last;
    }

    updateSequence++;
    const update: AgentActivityStepUpdate = {
      id: `upd-${Date.now()}-${updateSequence}`,
      sequence: existing.updates.length + 1,
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    existing.updates.push(update);
    existing.safeSummary = trimmed;
    existing.description = trimmed;
    return update;
  };

  const createStep = (
    label: string,
    options?: {
      stepId?: string;
      eventType?: string;
      toolName?: string;
      status?: AgentStepStatus;
      safeSummary?: string;
      description?: string;
    }
  ): AgentActivityEvent => {
    currentLiveUpdateId = null;
    stepOrder++;
    const stepId = options?.stepId || `step-${Date.now()}-${stepOrder}-${Math.random().toString(36).slice(2, 6)}`;
    const summary = options?.safeSummary || options?.description;
    updateSequence++;
    const initialUpdates: AgentActivityStepUpdate[] = summary
      ? [
          {
            id: `upd-${Date.now()}-${updateSequence}`,
            sequence: 1,
            content: summary,
            timestamp: new Date().toISOString(),
          },
        ]
      : [];
    const evt: AgentActivityEvent = {
      id: stepId,
      stepId,
      taskId,
      conversationId,
      responseId,
      eventType: options?.eventType || label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label,
      title: label,
      status: options?.status || 'running',
      safeSummary: summary,
      description: summary,
      toolName: options?.toolName,
      order: stepOrder,
      timestamp: new Date().toISOString(),
      updates: initialUpdates,
    };
    activityEvents.push(evt);
    return evt;
  };

  const updateStep = (
    stepId: string,
    updates: Partial<AgentActivityEvent>
  ): AgentActivityEvent | undefined => {
    const existing = activityEvents.find((a) => a.id === stepId || a.stepId === stepId);
    if (existing) {
      Object.assign(existing, updates);
      if (updates.safeSummary && !updates.description) {
        existing.description = updates.safeSummary;
      }
      return existing;
    }
    return undefined;
  };

  const addActivity = (
    label: string,
    status: AgentStepStatus,
    safeSummary?: string,
    existingId?: string
  ): AgentActivityEvent => {
    if (existingId) {
      const updated = updateStep(existingId, { status, safeSummary });
      if (updated) return updated;
    }
    return createStep(label, { status, safeSummary });
  };

  // 1. Initial State & Activity
  yield createSSEEvent({ type: 'status', status: 'preparing' });
  const initialAct = createStep('Understanding the request', {
    stepId: `step-prepare-${Date.now()}`,
    eventType: 'understanding_request',
    status: 'running',
    safeSummary: 'I am analyzing your request to identify the active document and determine required actions.',
  });
  yield createSSEEvent({ type: 'activity', event: initialAct });

  // 2. Resolve Provider Adapter & Vision Capability Check
  const adapter = params.adapter || resolveProviderAdapter(providerId);

  // Validate vision capability ONLY if images are attached in this turn or explicitly targeted by the prompt
  const promptMentionsImage = /\b(image|photo|picture|screenshot|diagram|chart|visual|ocr|inspect|look at)\b/i.test(userPrompt);
  const hasExplicitImageMention = Boolean(
    params.explicitSourceIds?.some((sid) => {
      const s = attachedSources.find((src) => src.id === sid);
      return Boolean(s && (s.type === 'image' || s.mimeType?.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(s.title)));
    })
  );
  const hasImageAttachments =
    Boolean(params.attachments && params.attachments.some((a) => a.type?.startsWith('image/'))) ||
    hasExplicitImageMention ||
    (promptMentionsImage && attachedSources.some((s) => s.type === 'image' || s.mimeType?.startsWith('image/')));

  const needsDirectVisionInTurn =
    Boolean(params.attachments && params.attachments.some((a) => a.type?.startsWith('image/'))) ||
    attachedSources.some((s) => {
      const isImg = s.type === 'image' || s.mimeType?.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(s.title);
      if (!isImg) return false;
      const hasCachedAnalysis = Boolean(s.imageDescription && s.imageCards?.some((c) => c.analysisStatus === 'analyzed'));
      return !hasCachedAnalysis && (hasExplicitImageMention || promptMentionsImage);
    });

  if (needsDirectVisionInTurn) {
    const isVision = isVisionCapableModel(modelId, providerId);
    if (!isVision) {
      initialAct.status = 'failed';
      initialAct.safeSummary = `Model ${modelId} does not support visual input`;
      yield createSSEEvent({ type: 'activity', event: initialAct });
      yield createSSEEvent({
        type: 'error',
        message: `The selected model "${modelId}" does not support image or visual inputs. Please select a vision-capable chat model (e.g. GPT-4o, Gemini 2.0 Flash, Claude 3.5 Sonnet, or Llama 3.2 Vision).`,
      });
      yield createSSEEvent({ type: 'status', status: 'failed' });
      return;
    }
  }

  // 3. Construct Tool Execution Context
  const toolExecutionContext: ToolExecutionContext = {
    workspaceId,
    workspaceType,
    conversationId,
    attachedSources,
    conversationHistory,
    workspaceFiles: params.workspaceFiles,
    activeDocument: activeDocContext,
    attachments: params.attachments,
    scratchpad: currentScratchpad,
    providerId,
    modelId,
    apiKey,
    baseUrl,
    accountId,
    requestId,
    onUpdateScratchpad: async (newScratchpad: string) => {
      currentScratchpad = newScratchpad;
      if (params.onUpdateScratchpad) {
        await params.onUpdateScratchpad(newScratchpad);
      }
    },
    onFileOperation: async (op) => {
      fileOpExecuted = true;
      pendingFileOps.push({
        operation: op.operation,
        itemType: op.itemType,
        itemId: op.itemId,
        title: op.title,
        content: op.content,
        mode: op.mode,
        summary: op.summary,
      });
    },
    onEditorAction: async (action) => {
      editorActionExecuted = true;
      pendingEditorActions.push({
        actionId: action.actionId,
        action: action.action,
        payload: action.payload,
        summary: action.summary,
      });
    },
    apiKeys: {
      tavily: params.searchConfig?.provider === 'tavily' ? params.searchConfig.apiKey || '' : process.env.TAVILY_API_KEY || '',
      brave: params.searchConfig?.provider === 'brave' ? params.searchConfig.apiKey || '' : process.env.BRAVE_API_KEY || '',
      serper: params.searchConfig?.provider === 'serper' ? params.searchConfig.apiKey || '' : process.env.SERPER_API_KEY || '',
    },
    searchProvider:
      (params.searchConfig?.provider as 'tavily' | 'brave' | 'serper' | 'searxng') ||
      (process.env.BRAVE_API_KEY
        ? 'brave'
        : process.env.TAVILY_API_KEY
        ? 'tavily'
        : process.env.SERPER_API_KEY
        ? 'serper'
        : undefined),
    imageGenProvider: 'cloudflare-flux',
  };

  // 4. Dynamic Two-Layer Tool Discovery & Loading (Lean, Intent-Driven Preloading)
  const hasTurnAttachments = Boolean(params.attachments && params.attachments.length > 0);
  const hasExplicitMentions = Boolean(params.explicitSourceIds && params.explicitSourceIds.length > 0);
  const hasAttachments = attachedSources.length > 0 || hasTurnAttachments;
  const promptReferencesSource = /\b(pdf|source|file|attachment|attached|upload|uploaded|program|extract)\b/i.test(userPrompt);
  const isSourceReferenced = hasTurnAttachments || hasExplicitMentions || (attachedSources.length > 0 && promptReferencesSource);
  const toolsNeeded = shouldEnableToolsForPrompt(userPrompt, hasAttachments, enabledTools, params.workspaceType);

  const activeLoadedToolIds = new Set<string>();

  // Hydrate persisted workspace chunks & image cards from disk on cold start / cache miss
  hydrateWorkspaceIndexes(workspaceId);

  const isStyleInspectionIntent = /\b(style|styling|styles|theme|font|fonts|color|colors|palette|margin|margins|layout|design|template|match|replicate|look\s+like)\b/i.test(userPrompt);

  // In AI Chat, universal tools and source reading capabilities are available by default
  if (params.workspaceType === 'chat') {
    activeLoadedToolIds.add('list_sources');
    activeLoadedToolIds.add('get_source_details');
    activeLoadedToolIds.add('search_sources');
    activeLoadedToolIds.add('read_source_content');
    activeLoadedToolIds.add('read_pdf_page');
    activeLoadedToolIds.add('search_pdf_content');
    if (hasAttachments) {
      activeLoadedToolIds.add('inspect_source_styles');
    }
    if (hasImageAttachments) {
      activeLoadedToolIds.add('inspect_source_image');
    }
    activeLoadedToolIds.add('get_task_scratchpad');
    activeLoadedToolIds.add('update_task_scratchpad');
  }

  // In Document workspaces, preload a lean core set (~24 tools) + intent-matched clusters
  // instead of all 54 tools on every round (cuts input token usage by ~70% per round!)
  if (params.workspaceType === 'doc') {
    const coreDocTools = [
      // Reading & navigation
      'read_document_content',
      'find_document_content',
      'get_document_structure',
      // Core edits (text-level & universal block/range replace)
      'insert_text',
      'replace_text',
      'replace_content',
      'replace_section',
      'delete_content',
      'clear_current_page',
      // Structural composition (headings, paragraphs, lists, appending)
      'insert_heading',
      'insert_paragraph',
      'insert_list',
      'append_content',
      'prepend_content',
      // Formatting
      'apply_text_formatting',
      'set_line_spacing',
      'set_font_family',
      'set_font_size',
      'format_all_headings',
      'verify_document_state',
      // Scratchpad memory — always available so the model can track multi-step progress
      'get_task_scratchpad',
      'update_task_scratchpad',
    ];
    for (const id of coreDocTools) {
      activeLoadedToolIds.add(id);
    }

    // Conditionally load specialized clusters only when prompt intent matches
    if (/\b(table|tables|row|rows|column|columns|cell|cells|comparison)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('insert_table');
      activeLoadedToolIds.add('style_table');
      activeLoadedToolIds.add('replace_table');
    }
    if (/\b(code|program|programs|script|python|javascript|typescript|java|c\+\+|snippet|function)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('insert_code_block');
    }
    if (/\b(margin|margins|page\s*size|a4|letter|legal|a3|a5|tabloid|orientation|landscape|portrait|header|footer|first\s*page|remaining\s*pages|page\s*number|page\s*break|section\s*break|watermark|page\s*color|background\s*color|border|borders|column|columns|cover\s*page)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('get_page_settings');
      activeLoadedToolIds.add('set_page_size');
      activeLoadedToolIds.add('set_page_orientation');
      activeLoadedToolIds.add('set_page_margins');
      activeLoadedToolIds.add('set_page_columns');
      activeLoadedToolIds.add('set_page_color');
      activeLoadedToolIds.add('set_page_borders');
      activeLoadedToolIds.add('update_header');
      activeLoadedToolIds.add('update_footer');
      activeLoadedToolIds.add('delete_header');
      activeLoadedToolIds.add('delete_footer');
      activeLoadedToolIds.add('insert_page_numbers');
      activeLoadedToolIds.add('insert_page_break');
      activeLoadedToolIds.add('insert_section_break');
      activeLoadedToolIds.add('insert_watermark');
      activeLoadedToolIds.add('insert_cover_page');
    }
    if (/\b(export|download|save\s*as|print|pdf|docx|word|html|markdown|md|txt)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('export_as_pdf');
      activeLoadedToolIds.add('export_as_docx');
      activeLoadedToolIds.add('export_as_html');
      activeLoadedToolIds.add('export_as_txt');
      activeLoadedToolIds.add('export_as_markdown');
      activeLoadedToolIds.add('print_document');
    }
    if (/\b(zoom|ruler|outline|formatting\s*marks|focus\s*mode|paginated|continuous\s*view|suggesting|spell\s*check|comment|comments|footnote|endnote|citation|bibliography|table\s*of\s*contents|toc)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('set_document_view');
      activeLoadedToolIds.add('set_editor_preferences');
      activeLoadedToolIds.add('add_document_comment');
      activeLoadedToolIds.add('insert_footnote');
      activeLoadedToolIds.add('insert_endnote');
      activeLoadedToolIds.add('insert_table_of_contents');
    }
    if (/\b(align|alignment|center|justify|bold|italic|underline|strike|color|highlight|spacing|paragraph|style|styling|callout|subscript|superscript|indent|outdent|uppercase|lowercase|title\s*case|case|clear\s*formatting)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('set_text_alignment');
      activeLoadedToolIds.add('format_all_paragraphs');
      activeLoadedToolIds.add('set_font_color');
      activeLoadedToolIds.add('set_highlight_color');
      activeLoadedToolIds.add('set_paragraph_spacing');
      activeLoadedToolIds.add('insert_callout');
      activeLoadedToolIds.add('set_subscript');
      activeLoadedToolIds.add('set_superscript');
      activeLoadedToolIds.add('adjust_indent');
      activeLoadedToolIds.add('change_text_case');
      activeLoadedToolIds.add('remove_formatting');
    }
    if (/\b(shape|shapes|rectangle|circle|ellipse|arrow|diamond|star|flowchart|banner|text\s*box|textbox|sidebar\s*box|equation|formula|math)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('insert_shape');
      activeLoadedToolIds.add('insert_text_box');
      activeLoadedToolIds.add('insert_equation');
      activeLoadedToolIds.add('insert_diagram');
    }
    if (/\b(chart|charts|graph|graphs|plot|visual|diagram|diagrams|flowchart|flow|sequence|architecture|mindmap|ascii|mermaid)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('insert_diagram');
      activeLoadedToolIds.add('insert_chart');
    }
    if (
      hasAttachments &&
      /\b(image|images|diagram|diagrams|figure|chart|visual|screenshot|picture|page\s*\d+)\b/i.test(userPrompt)
    ) {
      activeLoadedToolIds.add('inspect_source_image');
    }
    // Web search: load when prompt involves research, news, latest info, or document creation from scratch
    if (/\b(search|find|look up|research|latest|recent|current|news|update|google|web|internet|until now|as of|today)\b/i.test(userPrompt) ||
        /\b(prepare|create|write|draft|generate|make)\b.*\b(document|report|article|paper|post|content)\b/i.test(userPrompt)) {
      activeLoadedToolIds.add('web_search');
    }

    // Preload source reading tools ONLY when sources/attachments are actually referenced in this turn
    if (isSourceReferenced) {
      activeLoadedToolIds.add('list_sources');
      activeLoadedToolIds.add('get_source_details');
      activeLoadedToolIds.add('search_sources');
      activeLoadedToolIds.add('read_source_content');
      activeLoadedToolIds.add('read_pdf_page');
      activeLoadedToolIds.add('search_pdf_content');
      if (isStyleInspectionIntent) {
        activeLoadedToolIds.add('inspect_source_styles');
      }
      if (hasImageAttachments) {
        activeLoadedToolIds.add('inspect_source_image');
      }
    }
  }

  // Proactively preload image/style source tools when relevant
  if (hasImageAttachments) {
    activeLoadedToolIds.add('inspect_source_image');
    activeLoadedToolIds.add('list_sources');
    activeLoadedToolIds.add('get_source_details');
    if (isStyleInspectionIntent) {
      activeLoadedToolIds.add('inspect_source_styles');
    }
  } else if (isSourceReferenced) {
    activeLoadedToolIds.add('list_sources');
    activeLoadedToolIds.add('get_source_details');
    activeLoadedToolIds.add('search_sources');
    activeLoadedToolIds.add('read_source_content');
    activeLoadedToolIds.add('read_pdf_page');
    activeLoadedToolIds.add('search_pdf_content');
    if (isStyleInspectionIntent) {
      activeLoadedToolIds.add('inspect_source_styles');
    }
  }

  // Hook up context.onLoadTools so load_tool_definitions activates tools for subsequent rounds
  toolExecutionContext.onLoadTools = (toolIds: string[]) => {
    for (const id of toolIds) {
      activeLoadedToolIds.add(id);
    }
  };

  const getActiveNormalizedTools = (): ReturnType<typeof toNormalizedToolDefinitions> => {
    if (!toolsNeeded || !adapter.supportsNativeTools()) return [];

    // Always include bootstrap discovery tools
    const toolsToNormalize: Array<any> = [
      searchToolCatalogTool,
      loadToolDefinitionsTool,
    ];

    // Add any loaded tools from catalog or legacy registry
    for (const toolId of activeLoadedToolIds) {
      const catTool = getCatalogTool(toolId);
      if (catTool && catTool.availability === 'implemented') {
        if (!toolsToNormalize.some((t) => t.name === catTool.name)) {
          toolsToNormalize.push(catTool);
        }
      } else {
        const legacyTool = getToolByName(toolId);
        if (legacyTool && !toolsToNormalize.some((t) => t.name === legacyTool.name)) {
          toolsToNormalize.push(legacyTool);
        }
      }
    }

    return toNormalizedToolDefinitions(toolsToNormalize);
  };

  let normalizedTools = getActiveNormalizedTools();

  // 5. Retrieve Relevant Context Chunks from Attached Sources
  // For routine editing in Document workspace, avoid repeatedly scanning all attached sources
  const lowerUserPrompt = userPrompt.toLowerCase();
  let targetedSource: ResearchSource | undefined;

  if (params.explicitSourceIds && params.explicitSourceIds.length === 1) {
    targetedSource = attachedSources.find((s) => s.id === params.explicitSourceIds![0]);
  }
  if (!targetedSource) {
    targetedSource = attachedSources.find((s) => {
      const lowerTitle = s.title.toLowerCase();
      const baseTitle = lowerTitle.replace(/\.[a-z0-9]+$/i, '');
      return (
        lowerUserPrompt.includes(lowerTitle) ||
        lowerUserPrompt.includes(s.id.toLowerCase()) ||
        (baseTitle.length > 3 && lowerUserPrompt.includes(baseTitle))
      );
    });
  }

  const isDocEditingRoutine =
    workspaceType === 'doc' &&
    (!params.explicitSourceIds || params.explicitSourceIds.length === 0) &&
    (!params.attachments || params.attachments.length === 0) &&
    !targetedSource &&
    !/\b(?:based on|according to|cite|reference|from (?:attached|the source|sources)|consult)\b/i.test(userPrompt);

  if (attachedSources.length > 0 && !isDocEditingRoutine) {
    const scanLabel = targetedSource
      ? `Reading "${targetedSource.title}"`
      : `Scanning ${attachedSources.length} sources`;
    const searchAct = addActivity('Reading attached files', 'running', scanLabel);
    yield createSSEEvent({ type: 'activity', event: searchAct });

    const activeSourceIds = new Set(attachedSources.map((s) => s.id));
    const rawChunks = await searchRelevantChunks(userPrompt, workspaceId, 8);
    const chunks = rawChunks.filter((c) => activeSourceIds.has(c.chunk.sourceId)).slice(0, 4);
    const emittedCitationKeys = new Set<string>();
    for (const chk of chunks) {
      const citeKey = `src:${(chk.chunk.sourceId || chk.sourceTitle || '').toLowerCase()}`;
      if (emittedCitationKeys.has(citeKey)) {
        continue;
      }
      emittedCitationKeys.add(citeKey);
      const cite = {
        sourceId: chk.chunk.sourceId,
        sourceTitle: chk.sourceTitle,
        page: chk.chunk.page,
        snippet: chk.chunk.text.slice(0, 200),
      };
      collectedCitations.push(cite);
      yield createSSEEvent({
        type: 'citation',
        citation: cite,
      });
    }
    searchAct.status = 'completed';
    searchAct.safeSummary = chunks.length > 0 ? `Retrieved ${chunks.length} relevant sections` : (targetedSource ? `Read "${targetedSource.title}"` : 'Sources scanned');
    yield createSSEEvent({ type: 'activity', event: searchAct });
  }

  // 6. Proactive Orchestrator-Managed Web Search Execution
  const liveResearchNeeded = isLiveResearchRequired(userPrompt);
  const searchProvider = params.searchConfig?.provider || toolExecutionContext.searchProvider;
  const searchApiKey =
    (searchProvider && toolExecutionContext.apiKeys?.[searchProvider as 'tavily' | 'brave' | 'serper']) ||
    params.searchConfig?.apiKey ||
    toolExecutionContext.apiKeys?.brave ||
    toolExecutionContext.apiKeys?.tavily ||
    toolExecutionContext.apiKeys?.serper;
  const isSearchConfigured = Boolean(searchApiKey && searchApiKey.trim());
  const isSearchEnabled = enabledTools?.internetSearch !== false;

  let preSearchedEvidence = '';

  if (liveResearchNeeded) {
    if (!isSearchEnabled) {
      preSearchedEvidence = `\n\n[CAPABILITY NOTICE - WEB SEARCH DISABLED]\nInternet search is currently toggled OFF in the chat tools for this session. The user asked for live or current information ("${userPrompt}"). Inform the user clearly that live web search is currently toggled off in their chat tools, and that they can enable Internet Search in the tools menu to retrieve live web results. Under NO circumstances should you fabricate current news, events, or fake citations.`;
    } else if (!isSearchConfigured) {
      preSearchedEvidence = `\n\n[CAPABILITY NOTICE - NO SEARCH PROVIDER CONFIGURED]\nNo web search provider is configured. The user asked for live or current information ("${userPrompt}"). Inform the user clearly that no web search provider is currently configured, and that they can configure an API key for Brave Search, Tavily, or Serper in Settings → AI Providers to enable live web research. Under NO circumstances should you fabricate current news, events, or fake citations.`;
    } else {
      const searchQuery = extractSearchQuery(userPrompt);
      const searchAct = addActivity('Searching the web', 'running', `Query: "${searchQuery}"`);
      yield createSSEEvent({ type: 'activity', event: searchAct });

      const searchRes = await executeTool('web_search', { query: searchQuery }, toolExecutionContext);

      if (searchRes.success && searchRes.data) {
        const rawResults = (searchRes.data as { results?: unknown[] }).results;
        searchAct.status = 'completed';
        searchAct.safeSummary = searchRes.activitySummary || `Found ${rawResults?.length || 0} results`;
        yield createSSEEvent({ type: 'activity', event: searchAct });

        const results = (rawResults || []) as Array<{
          title: string;
          url: string;
          snippet: string;
          domain?: string;
          publishedDate?: string;
        }>;

        for (const item of results) {
          const cite = {
            sourceId: item.url || 'web-search',
            sourceTitle: item.title,
            snippet: item.snippet,
            url: item.url,
          };
          collectedCitations.push(cite);
          yield createSSEEvent({ type: 'citation', citation: cite });
        }

        preSearchedEvidence = `\n\n[VERIFIED LIVE WEB SEARCH EVIDENCE (Query: "${searchQuery}")]\n${results
          .map(
            (r, idx) =>
              `[Result ${idx + 1}] Title: ${r.title}\nURL: ${r.url}\nDomain: ${r.domain || ''}\nPublished Date: ${r.publishedDate || 'Unknown'}\nSnippet: ${r.snippet}`
          )
          .join('\n\n')}

EVIDENCE CITATION GUIDELINES:
1. The above search results were retrieved live at runtime from the web.
2. Ground your entire response in this verified evidence.
3. Explicitly cite source URLs and domains from these results when stating facts.
4. Distinguish publication dates from event dates.
5. NEVER say "I don't have web access" or "I cannot check live info", because live search has already succeeded and the verified findings are right here.
6. Never fabricate external links or Wikipedia URLs.`;
      } else {
        searchAct.status = 'failed';
        searchAct.safeSummary = searchRes.error || 'Web search failed';
        yield createSSEEvent({ type: 'activity', event: searchAct });

        preSearchedEvidence = `\n\n[CAPABILITY NOTICE - WEB SEARCH ERROR]\nA live web search attempt was made for "${searchQuery}" using provider "${searchProvider || 'web search'}", but the request failed with the following error: "${searchRes.error}".
Report this exact API error to the user so they can verify their API key or provider status in Settings → AI Providers. Do NOT claim that you lack web access as a system capability, and do NOT fabricate information.`;
      }
    }
  }

  // 7. Assemble Authoritative Shared Agent System Prompt
  const systemPrompt = buildSharedAgentSystemPrompt({
    workspaceId,
    workspaceType,
    timeZone: params.timeZone,
    activeDocument: activeDocContext,
    workspaceFiles: params.workspaceFiles,
    attachedSources,
    explicitSourceIds: params.explicitSourceIds,
    currentScratchpad,
    collectedCitations,
    preSearchedEvidence,
    hasLoadedTools: activeLoadedToolIds.size > 0,
  });

  // 8. Build Normalized Message Array
  const messages: NormalizedMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Include recent conversation history (last 8 messages for context budget)
  for (const m of (conversationHistory || []).slice(-8)) {
    messages.push({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls?.map((tc) => ({
        id: `call_${tc.name}`,
        name: tc.name,
        arguments: {},
      })),
    });
  }

  // Extract and resolve images from attachments and attached sources into strictly valid base64 data URIs
  const imageUrls: string[] = [];
  const candidateImageRefs: Array<{ ref: string; mimeHint?: string; nameHint?: string }> = [];

  if (params.attachments) {
    for (const a of params.attachments) {
      if (a.dataUrl) {
        candidateImageRefs.push({ ref: a.dataUrl, mimeHint: a.type, nameHint: a.name });
      } else if (a.url && (a.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(a.url || a.name))) {
        candidateImageRefs.push({ ref: a.url, mimeHint: a.type, nameHint: a.name });
      } else if ((a as any).id && (a.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(a.name))) {
        candidateImageRefs.push({ ref: (a as any).id, mimeHint: a.type, nameHint: a.name });
      }
    }
  }

  // 2. Attached workspace sources: ONLY attach an image if explicitly requested or relevant to this turn
  const isPdfOrDocTargeted = Boolean(
    targetedSource &&
      (targetedSource.type === 'pdf' ||
        targetedSource.title.toLowerCase().endsWith('.pdf') ||
        targetedSource.mimeType === 'application/pdf')
  ) || /\b(?:pdf|document|read the pdf|summarize the pdf|dl lab programs)\b/i.test(lowerUserPrompt);

  const isImageTargeted =
    !isPdfOrDocTargeted &&
    (/\b(?:image|photo|picture|screenshot|diagram|chart|visual|ocr|inspect|look at this)\b/i.test(lowerUserPrompt) ||
      Boolean(targetedSource && (targetedSource.type === 'image' || targetedSource.mimeType?.startsWith('image/'))));

  const turnAttachmentIds = new Set<string>(
    (params.attachments || []).map((a) => ((a as any).id || a.name || '').toLowerCase()).filter(Boolean)
  );
  const needsExactPixelInspection = /\b(?:exact|pixel|crop|hex|zoom|read every|ocr|transcribe|verbatim)\b/i.test(lowerUserPrompt);

  // Only include workspace sources if NOT targeting a PDF and either unanalyzed or explicitly attached for this turn
  if (!isPdfOrDocTargeted) {
    for (const s of attachedSources) {
      // Never treat a PDF as an image source!
      if (s.type === 'pdf' || s.mimeType === 'application/pdf' || s.title.toLowerCase().endsWith('.pdf')) {
        continue;
      }

      const isImageSrc = s.type === 'image' || s.mimeType?.startsWith('image/') || Boolean(s.title.match(/\.(jpe?g|png|webp|gif|svg)$/i));
      if (!isImageSrc) continue;

      const isTurnAttached = turnAttachmentIds.has(s.id.toLowerCase()) || turnAttachmentIds.has(s.title.toLowerCase());
      const hasCachedVisionSummary = Boolean(s.imageDescription && s.imageCards?.some((c) => c.analysisStatus === 'analyzed'));

      // Skip eager raw base64 re-injection when we already have a real VLM summary in the manifest
      // (AI can still call inspect_source_image on demand if pixel inspection is required)
      if (!isTurnAttached && hasCachedVisionSummary && !needsExactPixelInspection) {
        continue;
      }

      const isThisSourceMentioned =
        Boolean(params.explicitSourceIds && params.explicitSourceIds.includes(s.id)) ||
        lowerUserPrompt.includes(s.title.toLowerCase()) ||
        lowerUserPrompt.includes(s.id.toLowerCase());

      const shouldInclude = isThisSourceMentioned || isImageTargeted;

      if (shouldInclude) {
        candidateImageRefs.push({ ref: s.id, mimeHint: s.mimeType, nameHint: s.title });
      }
    }
  }

  for (const item of candidateImageRefs) {
    if (imageUrls.length >= 5) break; // Enforce configured limit of 5 images per request

    // 1. If already a valid base64 data URI (optimize if oversized)
    const norm = normalizeBase64DataUrl(item.ref);
    if (norm) {
      let finalUri = norm;
      const m = norm.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,([\s\S]+)$/);
      if (m && m[2].length > 900 * 1024) {
        const opt = await optimizeImageBufferForVision(Buffer.from(m[2], 'base64'), m[1]);
        finalUri = `data:${opt.mimeType};base64,${opt.buffer.toString('base64')}`;
      }
      if (!imageUrls.includes(finalUri)) imageUrls.push(finalUri);
      continue;
    }

    // 2. If storage reference, source ID, or filename, retrieve from original binary storage
    let lookupKey = item.ref;
    if (lookupKey.startsWith('source-storage://')) {
      const parts = lookupKey.replace(/^source-storage:\/\//, '').split('/');
      if (parts.length > 1 && parts[0] === workspaceId) {
        lookupKey = parts[1];
      } else {
        lookupKey = parts[0];
      }
    }
    const stored = getOriginalFile(workspaceId, lookupKey) || (item.nameHint ? getOriginalFile(workspaceId, item.nameHint) : null);
    if (stored && stored.buffer && stored.buffer.length > 0) {
      const mime = stored.mimeType || item.mimeHint || 'image/jpeg';
      const opt = await optimizeImageBufferForVision(stored.buffer, mime);
      const cleanDataUrl = `data:${opt.mimeType};base64,${opt.buffer.toString('base64')}`;
      const validated = normalizeBase64DataUrl(cleanDataUrl);
      if (validated && !imageUrls.includes(validated)) {
        imageUrls.push(validated);
      }
    }
  }

  // Add the new user prompt
  messages.push({
    role: 'user',
    content: userPrompt,
    images: imageUrls.length > 0 ? imageUrls : undefined,
  });

  // Complete initial understanding step now that request context is resolved
  if (initialAct.status === 'running') {
    initialAct.status = 'completed';
    initialAct.safeSummary = activeDocContext?.title
      ? `Identified active document "${activeDocContext.title}".`
      : 'Identified active workspace document.';
    initialAct.description = initialAct.safeSummary;
    yield createSSEEvent({ type: 'activity', event: initialAct });
  }

  // 7. Dynamic Task-Aware Execution Management
  let loopCount = 0;
  const BASE_EXECUTION_BUDGET = 14;
  const MAX_DYNAMIC_BUDGET = 24;
  let dynamicBudget = BASE_EXECUTION_BUDGET;
  let executionStage: AgentExecutionStage = 'idle';
  const executedToolsRecord: ExecutedToolRecord[] = [];
  const toolCallSignatures = new Map<string, number>();
  let consecutiveNoProgressRounds = 0;

  // Per-response Task Progress Ledger & Read Deduplication Cache
  // Ensures the agent remembers every step completed in this response and never re-reads unchanged content
  let docRevision = 0;
  const readResultCache = new Map<string, { revision: number; round: number; summary: string }>();
  const ledgerCompletedSteps: string[] = [];

  const buildCompactedMessagesForRound = (roundNum: number): NormalizedMessage[] => {
    const recentCutoff = Math.max(2, messages.length - 4);
    // Once past initial vision inspection or non-discovery tool calls, strip heavy raw user.images so styling/verification rounds stay fast & lean
    const stripUserImagesOnFollowup =
      roundNum >= 3 ||
      (roundNum >= 2 &&
        executedToolsRecord.some((t) => t.name !== 'search_tool_catalog' && t.name !== 'load_tool_definitions'));

    const compacted = messages.map((msg, idx) => {
      let nextMsg = msg;
      if (stripUserImagesOnFollowup && nextMsg.role === 'user' && nextMsg.images && nextMsg.images.length > 0) {
        nextMsg = { ...nextMsg, images: undefined };
      }
      // Compact older bulky tool payloads (> 1400 chars) so context tokens do not grow quadratically across rounds
      if (idx < recentCutoff && nextMsg.role === 'tool' && nextMsg.content && nextMsg.content.length > 1400) {
        return {
          ...nextMsg,
          content: `${nextMsg.content.slice(0, 450)}\n...[Compacted ${nextMsg.content.length} chars from earlier round; refer to Task Progress Ledger]`,
        };
      }
      return nextMsg;
    });

    // Inject compact Per-Response Task Progress Ledger into the system prompt on Round 2+
    if (roundNum >= 2 && ledgerCompletedSteps.length > 0 && compacted.length > 0 && compacted[0].role === 'system') {
      const ledgerBlock = `\n\n[CURRENT TASK PROGRESS LEDGER — ROUND ${roundNum}]\nCompleted steps in this response (DO NOT repeat these reads or edits):\n${ledgerCompletedSteps
        .slice(-15)
        .map((s) => `- ${s}`)
        .join('\n')}\nDirective: Keep thinking under 50 words. Do NOT re-read unchanged content. Batch remaining edits into one round and finish cleanly.`;
      compacted[0] = {
        ...compacted[0],
        content: compacted[0].content + ledgerBlock,
      };
    }

    return compacted;
  };

  // Retain the active eligible Cloudflare pair index across rounds within this agent task
  let activeCfPairIndex: number | undefined = undefined;

  // Resolve keys and Cloudflare pairs for silent rotation
  const cfPairResult = providerId === 'cloudflare'
    ? parseCloudflarePairs(accountId, apiKey)
    : { valid: true, pairs: [] as CloudflarePair[], error: undefined as string | undefined };

  if (providerId === 'cloudflare' && cfPairResult.error) {
    yield createSSEEvent({ type: 'error', message: cfPairResult.error });
    return;
  }

  const cfPairs = cfPairResult.pairs;

  let lastAssistantContent = '';

  while (loopCount < dynamicBudget) {
    loopCount++;

    // Recompute normalizedTools with any tools dynamically loaded in previous rounds
    normalizedTools = getActiveNormalizedTools();

    executionStage = loopCount === 1 ? 'model_request_started' : 'followup_request_started';
    console.log(`[DOCIUM AI Diagnostic] Agent stage: ${executionStage} | round: ${loopCount}/${dynamicBudget} | provider: ${providerId} | model: ${modelId}`);

    let assistantContent = '';
    let roundReasoningContent = '';
    let roundFinishReason: string | undefined = undefined;
    let insideThinkTag = false;
    const pendingCalls: ToolCallRequest[] = [];
    // Only stream directly to final response if pure conversational request with no tools needed
    const isPureConversation = !toolsNeeded;
    let isFinalResponseStreaming = isPureConversation;

    if (isFinalResponseStreaming) {
      for (const a of activityEvents) {
        if (a.status === 'running') {
          a.status = 'completed';
          a.safeSummary = a.safeSummary || 'Completed';
          yield createSSEEvent({ type: 'activity', event: a });
        }
      }
      yield createSSEEvent({ type: 'final_response_started' });
    }

    let roundBufferedDeltas: string[] = [];
    let roundBufferedReasoning: string[] = [];
    let roundSucceeded = false;
    let emptyRoundRetries = 0;
    const maxEmptyRoundRetries = loopCount === 1 ? 2 : 0;
    let repetitionLoopAborted = false;

    const detectTrailingRepetitionLoop = (text: string): { repeated: boolean; cleanedText: string } => {
      if (text.length < 480) return { repeated: false, cleanedText: text };
      const tail = text.slice(-1800);
      // Match any block of 90..500 chars that repeats 3+ times consecutively at the tail
      const repMatch = tail.match(/([\s\S]{90,500}?)\1{2,}[\s\S]{0,60}$/);
      if (repMatch && repMatch[1]) {
        const unit = repMatch[1];
        const firstIdx = text.indexOf(unit);
        const cleaned = firstIdx !== -1 ? text.slice(0, firstIdx + unit.length).trim() : text.slice(0, text.length - repMatch[0].length + unit.length).trim();
        return { repeated: true, cleanedText: cleaned };
      }
      return { repeated: false, cleanedText: text };
    };

    const emitRoundWorkingProgress = () => {
      const reasoningText = roundBufferedReasoning.join('');
      const preToolText = !isFinalResponseStreaming ? roundBufferedDeltas.join('') : '';
      const combined =
        reasoningText && preToolText
          ? `${reasoningText}\n${preToolText}`
          : reasoningText || preToolText;
      const cleaned = stripInternalReasoningTokens(combined).trim();
      if (!cleaned) return null;
      const targetStep =
        [...activityEvents].reverse().find((a) => a.status === 'running') ||
        activityEvents[activityEvents.length - 1];
      if (!targetStep) return null;
      const liveUpd = updateLiveStepProgress(targetStep.id, cleaned);
      if (!liveUpd) return null;
      return createSSEEvent({
        type: 'working_progress_update',
        stepId: targetStep.id,
        update: liveUpd,
      });
    };

    while (!roundSucceeded) {
      const roundMessages = buildCompactedMessagesForRound(loopCount);
      const roundAbortController = new AbortController();
      const onParentAbort = () => roundAbortController.abort();
      if (signal) {
        if (signal.aborted) roundAbortController.abort();
        else signal.addEventListener('abort', onParentAbort, { once: true });
      }
      repetitionLoopAborted = false;

      const stream = adapter.generateStream(roundMessages, normalizedTools, {
        model: modelId,
        apiKey,
        baseUrl,
        accountId,
        signal: roundAbortController.signal,
        preferredPairIndex: activeCfPairIndex,
        onCredentialActive: (info: any) => {
          if (info.providerId === 'cloudflare' && typeof info.index === 'number' && info.index >= 0) {
            activeCfPairIndex = info.index;
          }
        },
      });

      let errorInStream: string | null = null;

      try {
        for await (const chunk of stream) {
          if (signal?.aborted) {
            initialAct.status = 'completed';
            initialAct.safeSummary = 'Cancelled';
            yield createSSEEvent({ type: 'activity', event: initialAct });
            yield createSSEEvent({ type: 'status', status: 'cancelled' });
            yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
            return;
          }

          if (chunk.finishReason) {
            roundFinishReason = chunk.finishReason;
          }

          if (chunk.type === 'reasoning' && chunk.delta) {
            if (executionStage === 'model_request_started' || executionStage === 'followup_request_started') {
              executionStage = 'model_response_received';
            }
            roundReasoningContent += chunk.delta;
            roundBufferedReasoning.push(chunk.delta);
            const repCheck = detectTrailingRepetitionLoop(roundReasoningContent);
            if (repCheck.repeated) {
              console.warn(`[DOCIUM AI Diagnostic] Repetition loop detected in reasoning stream (round ${loopCount}, chars=${roundReasoningContent.length}). Aborting stuck stream immediately.`);
              roundReasoningContent = repCheck.cleanedText;
              roundBufferedReasoning = [repCheck.cleanedText];
              repetitionLoopAborted = true;
              const evt = emitRoundWorkingProgress();
              if (evt) yield evt;
              roundAbortController.abort();
              break;
            }
            const evt = emitRoundWorkingProgress();
            if (evt) yield evt;
          } else if (chunk.type === 'delta' && chunk.delta) {
          if (executionStage === 'model_request_started' || executionStage === 'followup_request_started') {
            executionStage = 'model_response_received';
          }

          // Separate any <think>...</think> tags emitted inside regular delta stream
          let remaining = chunk.delta;
          let visibleChunk = '';
          let reasoningChunk = '';

          while (remaining.length > 0) {
            if (insideThinkTag) {
              const closeIdx = remaining.search(/<\/(?:think|thought)>/i);
              if (closeIdx === -1) {
                reasoningChunk += remaining;
                remaining = '';
              } else {
                const closeMatch = remaining.slice(closeIdx).match(/^<\/(?:think|thought)>/i);
                const closeLen = closeMatch ? closeMatch[0].length : 8;
                reasoningChunk += remaining.slice(0, closeIdx);
                remaining = remaining.slice(closeIdx + closeLen);
                insideThinkTag = false;
              }
            } else {
              const openIdx = remaining.search(/<(?:think|thought)>/i);
              if (openIdx === -1) {
                visibleChunk += remaining;
                remaining = '';
              } else {
                const openMatch = remaining.slice(openIdx).match(/^<(?:think|thought)>/i);
                const openLen = openMatch ? openMatch[0].length : 7;
                visibleChunk += remaining.slice(0, openIdx);
                remaining = remaining.slice(openIdx + openLen);
                insideThinkTag = true;
              }
            }
          }

          if (reasoningChunk) {
            roundReasoningContent += reasoningChunk;
            roundBufferedReasoning.push(reasoningChunk);
            const evt = emitRoundWorkingProgress();
            if (evt) yield evt;
          }

          const cleanDelta = stripInternalReasoningTokens(visibleChunk);
          if (cleanDelta) {
            assistantContent += cleanDelta;
            roundBufferedDeltas.push(cleanDelta);

            // Strict channel separation: Only emit delta to the main assistant message when in final response stage
            if (isFinalResponseStreaming) {
              yield createSSEEvent({ type: 'delta', text: cleanDelta });
            } else {
              const evt = emitRoundWorkingProgress();
              if (evt) yield evt;
            }
          }
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          if (executionStage === 'model_request_started' || executionStage === 'followup_request_started') {
            executionStage = 'model_response_received';
          }
          pendingCalls.push(chunk.toolCall);
        } else if (chunk.type === 'error' && chunk.error) {
          if (!repetitionLoopAborted) {
            errorInStream = chunk.error;
          }
          break;
        }
      }
      } finally {
        if (signal) {
          signal.removeEventListener('abort', onParentAbort);
        }
      }

      if (errorInStream) {
        initialAct.status = 'failed';
        initialAct.safeSummary = errorInStream;
        yield createSSEEvent({ type: 'activity', event: initialAct });
        yield createSSEEvent({ type: 'status', status: 'failed' });
        yield createSSEEvent({ type: 'error', message: errorInStream });
        return;
      }

      // Check if Round 1 returned completely empty (no deltas, no reasoning, no tool calls)
      if (
        !errorInStream &&
        !assistantContent.trim() &&
        !roundReasoningContent.trim() &&
        pendingCalls.length === 0 &&
        emptyRoundRetries < maxEmptyRoundRetries &&
        !signal?.aborted
      ) {
        emptyRoundRetries++;
        const backoffMs = 500 * Math.pow(2, emptyRoundRetries - 1) + Math.random() * 200;
        console.warn(
          `[DOCIUM AI Diagnostic] Empty response in round ${loopCount} (attempt ${emptyRoundRetries}/${maxEmptyRoundRetries + 1}). Retrying in ${Math.round(backoffMs)}ms...`
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }

      roundSucceeded = true;
    }

    // If no tool calls were made in this round
    if (pendingCalls.length === 0) {
      // Automatic multi-iteration continuation when a round hit max output token limit
      if (
        roundFinishReason === 'length' &&
        workspaceType === 'doc' &&
        loopCount < dynamicBudget - 1
      ) {
        dynamicBudget = Math.min(MAX_DYNAMIC_BUDGET, dynamicBudget + 2);
        console.log(
          `[DOCIUM Agent] Output hit token limit (finishReason=length) on round ${loopCount}. Prompting chunked continuation via append_content...`
        );
        if (assistantContent.trim()) {
          messages.push({ role: 'assistant', content: assistantContent });
        }
        messages.push({
          role: 'user',
          content: contentPlacementExecuted
            ? `/no_think\n[SYSTEM CONTINUATION] Your previous output reached the token limit. Continue writing only the REMAINING sections into the document by calling "append_content" (or "insert_text" with position "end"), without repeating earlier headings. Keep sections compact (~600-900 words per call) and run final styling + "verify_document_state" when finished. /no_think`
            : `/no_think\n[SYSTEM CONTINUATION] Your previous output hit the token limit before calling tools. Split the document into smaller batches: call "insert_text" right now with just the first 2-3 sections cleanly, then append the rest in the next round. /no_think`,
        });
        continue;
      }

      // Check document action request enforcement first
      const isDocAction = workspaceType === 'doc' && isDocumentActionRequest(userPrompt);

      const needsContentPlacementStill = requiresContentPlacement && !contentPlacementExecuted;
      if (isDocAction && (!editorActionExecuted || needsContentPlacementStill || repetitionLoopAborted)) {
        // Document modification requested, but content placement was not executed yet!
        const isFormatOrReplaceOnly =
          isPureLayoutViewOrExportIntent ||
          (/\b(spacing|line\s*height|line\s*spacing|font|bold|italic|underline|strikethrough|align|center|justify|color|highlight|replace|delete|remove|clear)\b/i.test(userPrompt) &&
            !/\b(prepare|write|create|draft|generate|insert|add|extract|put|build|compile|compose|produce)\b/i.test(userPrompt));

        const hasCodeBlock = /```[\s\S]*?```/.test(assistantContent);
        const hasStructuredContent = assistantContent.length > 180 && (assistantContent.includes('#') || assistantContent.includes('\n\n'));
        const isSubstantive = !isFormatOrReplaceOnly && (hasCodeBlock || hasStructuredContent) && !isMetaNarration(assistantContent);

        // Never scrape private reasoning_content into the document! Instead, enforce a /no_think tool-execution round.
        if (!isSubstantive && loopCount < Math.min(5, dynamicBudget - 1)) {
          console.log(
            `[DOCIUM Agent] Document action enforcement: round ${loopCount} ended with 0 tool calls (finishReason=${roundFinishReason || 'stop'}, hasAssistantText=${Boolean(assistantContent.trim())}, repetitionAborted=${repetitionLoopAborted}). Prompting immediate tool execution with /no_think...`
          );
          if (assistantContent.trim()) {
            messages.push({ role: 'assistant', content: assistantContent });
          } else {
            messages.push({
              role: 'assistant',
              content: 'Ready to execute document tools.',
            });
          }
          messages.push({
            role: 'user',
            content: isFormatOrReplaceOnly
              ? `/no_think\n[SYSTEM ACTION ENFORCEMENT] Immediately invoke the required document formatting/editing tool right now (e.g., "set_line_spacing", "set_font_family", "set_font_size", "set_text_alignment", "apply_text_formatting", "replace_text", or "delete_content") so the change is applied to the document page. Request: "${userPrompt}" /no_think`
              : `/no_think\n[SYSTEM ACTION ENFORCEMENT] Do NOT output prose or thinking. Immediately invoke "insert_text" right now with the complete, well-structured Markdown document (including # headings, paragraphs, markdown tables, and bullet lists), plus any "insert_chart" and styling tools ("format_all_headings", "set_font_family", "set_line_spacing") to fulfill: "${userPrompt}" /no_think`,
          });
          continue;
        }

        if (!isSubstantive) {
          messages.push({ role: 'assistant', content: assistantContent || 'Ready to execute document insertion.' });
          messages.push({
            role: 'user',
            content: `/no_think\n[SYSTEM ACTION ENFORCEMENT] You must invoke "insert_text" or "insert_paragraph" right now to update the active document. Request: "${userPrompt}" /no_think`,
          });
          continue;
        }

        // Automatic structured document action execution with substantive assistantContent:
        let contentToInsert = assistantContent.trim();
        const preambleMatch = contentToInsert.match(/^(?:Sure!|Certainly!|Here (?:is|are)|I have (?:added|created)|Of course)[^\n]*\n+/i);
        if (preambleMatch && contentToInsert.length > preambleMatch[0].length + 20) {
          contentToInsert = contentToInsert.substring(preambleMatch[0].length).trim();
        }

        const act = createStep('Updating the document', {
          eventType: 'editor_action',
          toolName: 'insert_structured_document',
          status: 'running',
          safeSummary: 'I am applying the updates to the active document while preserving other sections.',
        });
        yield createSSEEvent({
          type: 'working_step_started',
          stepId: act.id,
          title: act.label,
          summary: act.safeSummary,
          status: 'running',
        });
        yield createSSEEvent({ type: 'activity', event: act });

        console.log(`[DOCIUM Agent] Document action enforcement: executing insert_structured_document on "${activeDocContext?.title || workspaceId}"`);

        const editResult = await executeTool(
          'insert_structured_document',
          {
            content: contentToInsert,
            position: 'cursor',
          },
          toolExecutionContext
        );

        act.status = editResult.success ? 'completed' : 'failed';
        act.safeSummary = editResult.success
          ? 'I have applied the requested changes to the active document.'
          : (editResult.error || 'Failed to update document.');
        act.description = act.safeSummary;
        yield createSSEEvent({
          type: 'working_step_completed',
          stepId: act.id,
          safeSummary: act.safeSummary,
          status: act.status as any,
        });
        yield createSSEEvent({ type: 'activity', event: act });

        executedToolsRecord.push({
          name: 'insert_structured_document',
          arguments: { content: contentToInsert, position: 'cursor' },
          success: editResult.success,
          summary: editResult.activitySummary,
          error: editResult.error,
          isEditorAction: true,
        });

        if (editResult.success) {
          contentPlacementExecuted = true;
        }

        while (pendingEditorActions.length > 0) {
          const ea = pendingEditorActions.shift()!;
          const key = ea.actionId || `${ea.action}-${JSON.stringify(ea.payload)}`;
          if (!dispatchedActionIds.has(key)) {
            dispatchedActionIds.add(key);
            editorActionExecuted = true;
            console.log(`[DOCIUM Agent] Editor action dispatched: "${ea.action}", id="${ea.actionId || key}"`);
            yield createSSEEvent({ type: 'editor_action', ...ea });
          }
        }
        if (editResult.editorAction) {
          const key = editResult.editorAction.actionId || `${editResult.editorAction.action}-${JSON.stringify(editResult.editorAction.payload)}`;
          if (!dispatchedActionIds.has(key)) {
            dispatchedActionIds.add(key);
            editorActionExecuted = true;
            console.log(`[DOCIUM Agent] Editor action dispatched: "${editResult.editorAction.action}", id="${editResult.editorAction.actionId || key}"`);
            yield createSSEEvent({ type: 'editor_action', ...editResult.editorAction });
          }
        }

        // Verify document state
        const verifyAct = createStep('Verifying document changes', {
          eventType: 'verification',
          toolName: 'verify_document_state',
          status: 'running',
          safeSummary: 'I am verifying that the document content was updated successfully.',
        });
        yield createSSEEvent({
          type: 'working_step_started',
          stepId: verifyAct.id,
          title: verifyAct.label,
          summary: verifyAct.safeSummary,
          status: 'running',
        });
        yield createSSEEvent({ type: 'activity', event: verifyAct });

        const verifyResult = await executeTool('verify_document_state', {}, toolExecutionContext);
        verifyAct.status = verifyResult.success ? 'completed' : 'failed';
        verifyAct.safeSummary = verifyResult.success ? 'Document state verified successfully.' : 'Verification check completed.';
        verifyAct.description = verifyAct.safeSummary;
        yield createSSEEvent({
          type: 'working_step_completed',
          stepId: verifyAct.id,
          safeSummary: verifyAct.safeSummary,
          status: verifyAct.status as any,
        });
        yield createSSEEvent({ type: 'activity', event: verifyAct });

        // Transition to final response and collapse Working
        isFinalResponseStreaming = true;
        yield createSSEEvent({ type: 'final_response_started' });
        for (const a of activityEvents) {
          if (a.status === 'running') {
            a.status = 'completed';
            a.safeSummary = a.safeSummary || 'Completed';
            yield createSSEEvent({ type: 'activity', event: a });
          }
        }

        const docName = activeDocContext?.title || 'active document';
        const fullReply = `I have placed the requested content into **${docName}** with structured headings and formatting.`;
        assistantContent = fullReply;
        yield createSSEEvent({ type: 'delta', text: fullReply });
        break;
      }

      // If document was already updated or not a doc action:
      if (!isFinalResponseStreaming && assistantContent.trim().length > 0) {
        // Prevent large code blocks or raw extracted text from leaking into the chat bubble
        // when the primary user request was to place content directly into the document
        const isDocPlacementPrompt = /place|insert|put|add.*into.*doc|write.*into.*doc/i.test(userPrompt);
        if (editorActionExecuted && isDocPlacementPrompt && assistantContent.includes('```')) {
          const docName = activeDocContext?.title || 'active document';
          const cleanConfirmation = `I have placed the requested content into **${docName}** with structured headings and formatting.`;
          assistantContent = cleanConfirmation;
          roundBufferedDeltas = [cleanConfirmation];
        }

        isFinalResponseStreaming = true;
        yield createSSEEvent({ type: 'final_response_started' });
        for (const act of activityEvents) {
          if (act.status === 'running') {
            act.status = 'completed';
            act.safeSummary = act.safeSummary || 'Completed';
            yield createSSEEvent({ type: 'activity', event: act });
          }
        }
        if (roundBufferedDeltas.length > 0) {
          const buffered = roundBufferedDeltas.join('');
          roundBufferedDeltas = [];
          yield createSSEEvent({ type: 'status', status: 'generating' });
          yield createSSEEvent({ type: 'delta', text: buffered });
        }
      }

      // If the final response is empty:
      if (!assistantContent.trim()) {
        if (structuredBlocks.length > 0) {
          const summary = 'I have generated the requested visual content above based on your prompt.';
          if (!isFinalResponseStreaming) {
            isFinalResponseStreaming = true;
            yield createSSEEvent({ type: 'final_response_started' });
            for (const a of activityEvents) {
              if (a.status === 'running') {
                a.status = 'completed';
                a.safeSummary = a.safeSummary || 'Completed';
                yield createSSEEvent({ type: 'activity', event: a });
              }
            }
          }
          yield createSSEEvent({ type: 'delta', text: summary });
          assistantContent = summary;
        } else if ((!requiresContentPlacement || contentPlacementExecuted) && (executedToolsRecord.length > 0 || editorActionExecuted || fileOpExecuted)) {
          // Graceful recovery from empty follow-up response when tools previously succeeded!
          const synthesized = synthesizeToolCompletionConfirmation(executedToolsRecord, {
            activeDocTitle: activeDocContext?.title,
            workspaceType,
            userPrompt,
          });
          console.log(`[DOCIUM Agent] Follow-up response was empty after tool execution. Recovered cleanly with synthesized confirmation: "${synthesized}"`);
          if (!isFinalResponseStreaming) {
            isFinalResponseStreaming = true;
            yield createSSEEvent({ type: 'final_response_started' });
            for (const a of activityEvents) {
              if (a.status === 'running') {
                a.status = 'completed';
                a.safeSummary = a.safeSummary || 'Completed';
                yield createSSEEvent({ type: 'activity', event: a });
              }
            }
          }
          yield createSSEEvent({ type: 'delta', text: synthesized });
          assistantContent = synthesized;
        } else if (roundReasoningContent.trim().length > 0 && loopCount < Math.min(3, dynamicBudget - 1)) {
          // Model spent round in reasoning without emitting visible final answer yet
          console.log(`[DOCIUM Agent] Non-tool turn finished in reasoning without final answer (round ${loopCount}). Prompting direct final answer...`);
          messages.push({
            role: 'assistant',
            content: `Completed analysis.`,
          });
          messages.push({
            role: 'user',
            content: `[SYSTEM] Please provide your final response directly to the user now without repeating internal reasoning.`,
          });
          continue;
        } else {
          // Genuine empty response where NO tools succeeded and retries exhausted
          console.warn(`[DOCIUM AI Diagnostic] Provider returned empty response (model: ${modelId}, loop: ${loopCount})`);
          initialAct.status = 'failed';
          initialAct.safeSummary = 'Provider returned empty response';
          yield createSSEEvent({ type: 'activity', event: initialAct });
          yield createSSEEvent({ type: 'status', status: 'failed' });
          yield createSSEEvent({
            type: 'error',
            message: 'The AI provider returned an empty response. Please verify your API key, model selection, or network connection.',
          });
          return;
        }
      }

      executionStage = 'final_response_received';
      lastAssistantContent = assistantContent;
      break;
    }

    executionStage = 'tool_calls_parsed';
    console.log(`[DOCIUM AI Diagnostic] Agent stage: ${executionStage} | toolCallsCount: ${pendingCalls.length}`);

    // Clear buffered pre-tool remarks (already shown via live progress; avoid duplicating in Working UI)
    roundBufferedDeltas = [];

    // Append assistant's thoughts/tool call to history
    messages.push({
      role: 'assistant',
      content: assistantContent,
      toolCalls: pendingCalls,
    });

    executionStage = 'tools_executing';
    yield createSSEEvent({ type: 'status', status: 'executing_tool' });

    let roundHasProductiveWork = false;

    // Execute each requested tool
    for (const tc of pendingCalls) {
      console.log(`[DOCIUM Agent] Tool-call requested: "${tc.name}", id="${tc.id}"`);
      const isDiscovery = tc.name === 'search_tool_catalog' || tc.name === 'load_tool_definitions';
      const existingDiscovery = isDiscovery
        ? activityEvents.find((a) => a.eventType === 'tool_discovery' || a.toolName === 'search_tool_catalog')
        : undefined;

      // Transition any prior running steps to completed
      for (const a of activityEvents) {
        if (a !== existingDiscovery && a.status === 'running') {
          a.status = 'completed';
          a.safeSummary = a.safeSummary || 'Completed';
          yield createSSEEvent({
            type: 'working_step_completed',
            stepId: a.id,
            safeSummary: a.safeSummary,
            status: 'completed',
          });
          yield createSSEEvent({ type: 'activity', event: a });
        }
      }

      let act: AgentActivityEvent;
      if (existingDiscovery) {
        act = existingDiscovery;
        act.status = 'running';
        const qStr = typeof tc.arguments?.query === 'string' ? ` for "${tc.arguments.query}"` : '';
        const upd = addStepUpdate(act.id, `Searching tool catalog${qStr}...`);
        if (upd) yield createSSEEvent({ type: 'working_progress_update', stepId: act.id, update: upd });
        yield createSSEEvent({ type: 'activity', event: act });
      } else {
        const stepId = `step-tool-${tc.name}-${tc.id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const naturalRunningSummary = generateNaturalStepContent(tc.name, tc.arguments, false);
        const stepLabel = humanReadableToolLabel(tc.name, tc.arguments);

        act = createStep(stepLabel, {
          stepId,
          eventType: isDiscovery ? 'tool_discovery' : 'tool_execution',
          toolName: tc.name,
          status: 'running',
          safeSummary: naturalRunningSummary,
        });
        yield createSSEEvent({
          type: 'working_step_started',
          stepId: act.id,
          title: act.label,
          summary: naturalRunningSummary,
          status: 'running',
        });
        yield createSSEEvent({ type: 'activity', event: act });
      }

      toolExecutionContext.toolCallId = tc.id;

      // Read Deduplication: If the model attempts to re-read the exact same unchanged document scope,
      // return a compact cached notice instead of dumping thousands of duplicate tokens into context!
      const isReadTool = tc.name === 'read_document_content' || tc.name === 'find_document_content';
      const readCacheKey = isReadTool ? `${tc.name}:${JSON.stringify(tc.arguments || {})}` : '';
      const cachedRead = isReadTool ? readResultCache.get(readCacheKey) : undefined;

      let result;
      if (cachedRead && cachedRead.revision === docRevision) {
        result = {
          success: true,
          data: {
            cached: true,
            alreadyReadInRound: cachedRead.round,
            docUnchanged: true,
            note: 'You already read this exact content earlier in this response and the document has not changed. Proceed directly to making edits.',
          },
          activitySummary: `Reused earlier ${tc.name} result (document unchanged)`,
        };
      } else {
        result = await executeTool(tc.name, tc.arguments, toolExecutionContext);
        if (isReadTool && result.success) {
          readResultCache.set(readCacheKey, {
            revision: docRevision,
            round: loopCount,
            summary: result.activitySummary || tc.name,
          });
        }
      }
      console.log(`[DOCIUM Agent] Tool execution completed: "${tc.name}", success=${result.success}${result.errorCategory ? ` [${result.errorCategory}]` : ''}`);

      if (result.success) {
        roundHasProductiveWork = true;
        if (result.editorAction || result.fileOperation) {
          docRevision++;
        }
        if (CONTENT_PLACEMENT_TOOLS.has(tc.name)) {
          contentPlacementExecuted = true;
        }
        const targetHint =
          (tc.arguments?.headingTitle as string) ||
          (tc.arguments?.heading as string) ||
          (tc.arguments?.query as string) ||
          (tc.arguments?.scope as string) ||
          '';
        ledgerCompletedSteps.push(
          `R${loopCount}: ${tc.name}${targetHint ? ` (${String(targetHint).slice(0, 40)})` : ''} -> ${result.activitySummary || 'ok'}`
        );
      }

      // Mandatory Security Stop Behavior: Exceeded active workspace boundary
      if (result.isSecurityViolation || result.statusCode === 'WORKSPACE_BOUNDARY_VIOLATION') {
        const securityMsg = 'The task was stopped because the requested operation exceeded the active workspace boundary.';
        act.status = 'failed';
        act.safeSummary = securityMsg;
        const resUpd = addStepUpdate(act.id, securityMsg);
        if (resUpd) yield createSSEEvent({ type: 'working_progress_update', stepId: act.id, update: resUpd });
        yield createSSEEvent({
          type: 'working_step_completed',
          stepId: act.id,
          safeSummary: securityMsg,
          status: 'failed',
        });
        yield createSSEEvent({ type: 'activity', event: act });

        if (!isFinalResponseStreaming) {
          isFinalResponseStreaming = true;
          yield createSSEEvent({ type: 'final_response_started' });
        }
        yield createSSEEvent({ type: 'delta', text: securityMsg });
        yield createSSEEvent({ type: 'status', status: 'failed' });
        yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
        return;
      }

      act.status = result.success ? 'completed' : 'failed';
      const naturalCompletedSummary = result.success
        ? generateNaturalStepContent(tc.name, tc.arguments, true, result.activitySummary)
        : (result.error || 'Failed to complete this step.');
      const resUpd = addStepUpdate(act.id, naturalCompletedSummary);
      if (resUpd) yield createSSEEvent({ type: 'working_progress_update', stepId: act.id, update: resUpd });
      yield createSSEEvent({
        type: 'working_step_completed',
        stepId: act.id,
        safeSummary: naturalCompletedSummary,
        status: act.status as any,
      });
      yield createSSEEvent({ type: 'activity', event: act });

      // Save extracted source content to task scratchpad
      if ((tc.name === 'read_pdf_page' || tc.name === 'search_pdf_content' || tc.name === 'read_source_content' || tc.name === 'inspect_source_image') && result.success && result.data) {
        const ext = (result.data as any).content || (result.data as any).extractedText || (result.data as any).text;
        if (ext) {
          currentScratchpad = `[Extracted Source Content: ${tc.name}]\n${String(ext).slice(0, 2000)}\n\n${currentScratchpad}`;
          yield createSSEEvent({ type: 'scratchpad', notes: currentScratchpad });
        }
      }

      executedToolsRecord.push({
        name: tc.name,
        id: tc.id,
        arguments: tc.arguments,
        success: result.success,
        summary: result.activitySummary,
        error: result.error,
        isEditorAction: Boolean(result.editorAction),
        isFileOp: Boolean(result.fileOperation),
        data: result.data,
      });

      // Immediate stop on authentication errors (401) to prevent burning rounds
      if (
        (result as any).errorCategory === 'AUTHENTICATION_ERROR' ||
        (result.error && (result.error.includes('401') || /authentication error/i.test(result.error)))
      ) {
        console.warn(`[DOCIUM Agent] Halting execution immediately due to authentication failure in tool "${tc.name}":`, result.error);
        const authErrMsg = result.error || `Authentication error with ${providerId}. Please verify your API key and Account ID in Settings > AI Providers.`;
        yield createSSEEvent({ type: 'delta', text: `\n\n**Authentication Error**: ${authErrMsg}` });
        yield createSSEEvent({ type: 'error', message: authErrMsg });
        yield createSSEEvent({ type: 'status', status: 'failed' });
        yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
        return;
      }

      // If tool generated a structured block (chart, image, table), emit to client
      if (result.structuredBlock) {
        structuredBlocks.push(result.structuredBlock);
        yield createSSEEvent({ type: 'block', block: result.structuredBlock });
      }

      // If scratchpad was updated, emit update
      if (tc.name === 'update_scratchpad' || tc.name === 'clear_scratchpad') {
        yield createSSEEvent({ type: 'scratchpad', notes: currentScratchpad });
      }

      // If file operations were performed, emit to client
      while (pendingFileOps.length > 0) {
        const op = pendingFileOps.shift()!;
        fileOpExecuted = true;
        yield createSSEEvent({ type: 'file_op', ...op });
      }
      if (result.fileOperation) {
        fileOpExecuted = true;
        yield createSSEEvent({ type: 'file_op', ...result.fileOperation });
      }

      // If editor actions were performed, emit to client idempotently and keep server shadow doc in sync
      while (pendingEditorActions.length > 0) {
        const ea = pendingEditorActions.shift()!;
        const key = ea.actionId || `${ea.action}-${JSON.stringify(ea.payload)}`;
        if (!dispatchedActionIds.has(key)) {
          dispatchedActionIds.add(key);
          editorActionExecuted = true;
          applyEditorActionToShadowDoc(activeDocContext, ea.action, ea.payload);
          console.log(`[DOCIUM Agent] Editor action dispatched: "${ea.action}", id="${ea.actionId || key}"`);
          yield createSSEEvent({ type: 'editor_action', ...ea });
        }
      }
      if (result.editorAction) {
        const key = result.editorAction.actionId || `${result.editorAction.action}-${JSON.stringify(result.editorAction.payload)}`;
        if (!dispatchedActionIds.has(key)) {
          dispatchedActionIds.add(key);
          editorActionExecuted = true;
          applyEditorActionToShadowDoc(activeDocContext, result.editorAction.action, result.editorAction.payload);
          console.log(`[DOCIUM Agent] Editor action dispatched: "${result.editorAction.action}", id="${result.editorAction.actionId || key}"`);
          yield createSSEEvent({ type: 'editor_action', ...result.editorAction });
        }
      }

      // Add tool output back to conversation context
      messages.push({
        role: 'tool',
        name: tc.name,
        toolCallId: tc.id,
        content: result.success ? JSON.stringify(result.data || 'OK') : `Error: ${result.error}`,
      });
    }

    // Auto-persist the per-response task ledger to the scratchpad after each productive round.
    // This lets the model check scratchpad on subsequent rounds and know exactly what it already did,
    // without relying on tool result compaction alone (which only truncates old messages, not the scratchpad).
    if (roundHasProductiveWork && ledgerCompletedSteps.length > 0 && params.onUpdateScratchpad) {
      const ledgerNote = `[TASK PROGRESS LEDGER — after round ${loopCount}]\n${ledgerCompletedSteps
        .slice(-15)
        .map((s) => `- ${s}`)
        .join('\n')}\n`;
      const updatedScratchpad = ledgerNote + (currentScratchpad ? `\n---\nPrevious notes:\n${currentScratchpad}` : '');
      currentScratchpad = updatedScratchpad;
      try { await params.onUpdateScratchpad(updatedScratchpad); } catch { /* scratchpad persistence is best-effort */ }
      yield createSSEEvent({ type: 'scratchpad', notes: currentScratchpad });
    }

    // Dynamic budget adaptation and no-progress guard
    if (roundHasProductiveWork) {
      consecutiveNoProgressRounds = 0;
      const isDocAction = workspaceType === 'doc' && isDocumentActionRequest(userPrompt);
      if (isDocAction && !editorActionExecuted) {
        dynamicBudget = Math.min(MAX_DYNAMIC_BUDGET, dynamicBudget + 2);
      }
    } else {
      consecutiveNoProgressRounds++;
      if (consecutiveNoProgressRounds >= 3) {
        console.warn(`[DOCIUM Agent] No productive work across 3 consecutive rounds. Halting loop.`);
        break;
      }
    }

    executionStage = 'tools_completed';
  }

  // Completion Gate Check at loop exit:
  const isDocActionAtExit = workspaceType === 'doc' && isDocumentActionRequest(userPrompt);
  const missingRequiredPlacement = requiresContentPlacement && !contentPlacementExecuted;
  if ((isDocActionAtExit && (!editorActionExecuted || missingRequiredPlacement)) || (consecutiveNoProgressRounds >= 3 && !editorActionExecuted && !fileOpExecuted)) {
    console.warn(`[DOCIUM Agent] Loop terminated without executing document modification for doc action request.`);
    const incompleteMsg = 'The task reached its maximum execution budget before the document modifications could be completed. The extracted content has been preserved in your workspace notes. Please request the document insertion directly.';
    yield createSSEEvent({ type: 'final_response_started' });
    yield createSSEEvent({ type: 'delta', text: incompleteMsg });
    yield createSSEEvent({ type: 'status', status: 'failed' });
    yield createSSEEvent({ type: 'task_failed', taskId, error: incompleteMsg });
    yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
    return;
  }

  // If user requested a file operation (e.g. "update my AI News document") but no file tool was executed
  // (such as when using models without native tool calling like Cloudflare Workers AI):
  // NOTE: In a Document workspace ('doc'), the AI must ONLY modify the currently active document via editor actions,
  // never creating or editing other workspace files.
  const fileIntent = detectFileOperationIntent(userPrompt);
  if (workspaceType !== 'doc' && !fileOpExecuted && fileIntent.isTargeted && fileIntent.documentTitle && lastAssistantContent.trim()) {
    const fileAct = addActivity(
      fileIntent.operation === 'create' ? 'Creating file' : 'Updating document',
      'running',
      `Target: "${fileIntent.documentTitle}"`
    );
    yield createSSEEvent({ type: 'activity', event: fileAct });

    let docContent = lastAssistantContent;
    const docUpdateMatch = lastAssistantContent.match(/```(?:docium:document_update|json)?\s*(\{[\s\S]*?\})\s*```/);
    if (docUpdateMatch) {
      try {
        const parsed = JSON.parse(docUpdateMatch[1]);
        if (parsed.content) docContent = parsed.content;
      } catch {
        // use raw
      }
    }

    const fileResult =
      fileIntent.operation === 'create'
        ? await executeTool(
            'create_workspace_file',
            {
              title: fileIntent.documentTitle,
              content: docContent,
              type: 'doc',
            },
            toolExecutionContext
          )
        : await executeTool(
            'update_document_file',
            {
              documentIdOrTitle: fileIntent.documentTitle,
              content: docContent,
              mode: 'append',
            },
            toolExecutionContext
          );

    fileAct.status = fileResult.success ? 'completed' : 'failed';
    fileAct.safeSummary = fileResult.activitySummary || (fileResult.success ? 'Saved' : fileResult.error);
    fileAct.description = fileAct.safeSummary;
    yield createSSEEvent({ type: 'activity', event: fileAct });

    while (pendingFileOps.length > 0) {
      const op = pendingFileOps.shift()!;
      yield createSSEEvent({ type: 'file_op', ...op });
    }
    if (fileResult.fileOperation) {
      yield createSSEEvent({ type: 'file_op', ...fileResult.fileOperation });
    }
  }

  // Finalize
  initialAct.status = 'completed';
  initialAct.safeSummary = 'Completed';
  yield createSSEEvent({ type: 'activity', event: initialAct });
  yield createSSEEvent({ type: 'task_completed', taskId });
  yield createSSEEvent({ type: 'status', status: 'completed' });
  yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
}

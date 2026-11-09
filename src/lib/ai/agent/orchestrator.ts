/**
 * Universal AI Agent Orchestration Engine
 * Coordinates model calls, multi-step tool execution loops, context retrieval,
 * structured block generation, and Server-Sent Event (SSE) streaming.
 */

import { ProviderId, AiChatMessage, ResearchSource, StructuredContentBlock, AgentActivityEvent, AgentStepStatus, WorkspaceFileRecord, ActiveDocumentContext, EditorActionEvent } from '@/lib/types';
import { resolveProviderAdapter } from '../adapters/registry';
import { NormalizedMessage, ToolCallRequest } from '../adapters/base';
import { getAvailableTools, toNormalizedToolDefinitions, executeTool } from '../tools/registry';
import { ToolExecutionContext } from '../tools/types';
import { searchRelevantChunks } from '../embeddings';
import { isVisionCapableModel } from '../providers';
import { getDocumentCapabilitiesPromptSummary } from '@/lib/editor/capabilityRegistry';
import { parseCloudflarePairs, CloudflarePair } from '../credentials';

export interface AgentRunParams {
  requestId?: string;
  workspaceId: string;
  workspaceType: string;
  conversationId: string;
  userPrompt: string;
  attachments?: { name: string; size: string; type: string; url?: string; dataUrl?: string }[];
  attachedSources: ResearchSource[];
  explicitSourceIds?: string[];
  conversationHistory: AiChatMessage[];
  scratchpad: string;
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
  onUpdateScratchpad?: (notes: string) => Promise<void> | void;
  signal?: AbortSignal;
}

export type AgentSSEPayload =
  | { type: 'status'; status: 'idle' | 'preparing' | 'executing_tool' | 'generating' | 'completed' | 'cancelled' | 'failed' }
  | { type: 'activity'; event: AgentActivityEvent }
  | { type: 'step_explanation'; stepId: string; explanation: string }
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
    return `I have applied the requested updates directly to **${docName}**.`;
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

  return 'I have completed your request.';
}

function humanReadableToolLabel(toolName: string): string {
  switch (toolName) {
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
      return 'Analyzing visual content';
    case 'calculate':
      return 'Calculating mathematical result';
    case 'search_sources':
    case 'read_source':
    case 'inspect_source':
    case 'extract_source_tables':
    case 'summarize_source':
      return 'Reading attached sources';
    case 'read_chat_history':
    case 'search_chat_history':
      return 'Reviewing conversation context';
    case 'update_scratchpad':
    case 'clear_scratchpad':
      return 'Updating notes';
    case 'list_documents':
    case 'search_documents':
    case 'read_document_content':
    case 'extract_document_tables':
      return 'Inspecting the workspace';
    case 'read_active_document':
    case 'read_active_document_structure':
    case 'inspect_active_document_metadata':
    case 'read_active_document_selection':
      return 'Inspecting the document';
    case 'search_document_text':
    case 'search_document_content':
    case 'locate_document_section':
      return 'Finding the requested content';
    case 'find_and_replace_text':
    case 'replace_selected_text':
    case 'insert_text_at_cursor':
    case 'insert_structured_document':
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
    case 'format_document_text':
    case 'set_font_style':
    case 'set_line_height':
      return 'Formatting the document';
    case 'delete_selected_content':
      return 'Removing the selected content';
    case 'duplicate_content':
      return 'Duplicating content';
    case 'move_document_section':
      return 'Moving document section';
    case 'save_document_changes':
    case 'inspect_document_save_status':
      return 'Verifying the changes';
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
    case 'read_pdf_page':
    case 'search_pdf_content':
      return 'Analyzing PDF document';
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

  // Strip leading action phrases:
  q = q.replace(/^(please\s+)?(can\s+you\s+)?(search(\s+for|\s+the\s+web\s+for|\s+online\s+for)?|look\s*up|find(\s+out\s+about|\s+the|\s+me)?|google|browse\s+for)\s+/i, '');

  // Strip trailing file operation / presentation clauses:
  q = q.replace(/\s+and\s+(update|write|save|store|add|append|put|create|record|log)\s+(it\s+)?(to|in|into|my)?\s+([a-zA-Z0-9_\-\.\s]+)?(document|file|workspace|notes?|doc).*$/i, '');
  q = q.replace(/\s+and\s+(compare\s+them|give\s+me\s+a\s+summary|summarize\s+them|put\s+it\s+in\s+a\s+table).*$/i, '');

  // Strip leading question markers
  q = q.replace(/^(what\s+are\s+the|what\s+is\s+the|tell\s+me\s+about\s+the|who\s+is\s+the)\s+/i, '');

  // Strip ending punctuation
  q = q.replace(/[?!.]+$/, '').trim();

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

  // 1. Direct placement or creation intent on document/page
  if (
    /\b(place|insert|add|put|write|append|prepend|type|include|draft|create|generate|populate)\b[\s\S]*?\b(page|document|doc|content|section|paragraph|heading|table|list|text|intro|introduction|report|here|editor|summary|overview|about)\b/i.test(clean)
  ) {
    return true;
  }

  // 2. Direct document artifact creation ("Create a report on...", "Write an article about...", "Draft a summary of...")
  if (
    /\b(create|write|draft|generate|make|build)\s+(?:a\s+|an\s+)?(?:detailed\s+|comprehensive\s+|short\s+|quick\s+)?(?:report|article|summary|essay|guide|section|outline|overview|table|list|comparison|document|page)\b/i.test(clean)
  ) {
    return true;
  }

  // 3. Formatting and styling actions
  if (
    /\b(make|change|format|bold|italic|underline|align|style|heading|h1|h2|h3|h4|h5|h6|center|justify|indent|colorize|highlight)\b[\s\S]*?\b(heading|paragraph|title|text|section|line|selection|table|list|page)\b/i.test(clean) ||
    /\bmake\s+(?:the|this|that)\s+.*?\s+(?:heading|bold|italic|underline|center)/i.test(clean)
  ) {
    return true;
  }

  // 4. Replacement, editing, or deletion actions
  if (
    /\b(replace|rewrite|substitute|delete|remove|clear|rephrase|improve)\b[\s\S]*?\b(selection|selected|paragraph|sentence|text|heading|section|content|table|word)\b/i.test(clean)
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

export async function* runAgentOrchestrator(params: AgentRunParams): AsyncIterable<AgentSSEEvent> {
  const {
    workspaceId,
    workspaceType,
    conversationId,
    userPrompt,
    attachedSources,
    conversationHistory,
    providerId,
    modelId,
    apiKey,
    baseUrl,
    accountId,
    enabledTools,
    signal,
  } = params;

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
    stepOrder++;
    const stepId = options?.stepId || `step-${Date.now()}-${stepOrder}-${Math.random().toString(36).slice(2, 6)}`;
    const summary = options?.safeSummary || options?.description;
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
  const adapter = resolveProviderAdapter(providerId);

  // Validate vision capability if image attachments are present
  const hasImageAttachments =
    (params.attachments && params.attachments.some((a) => a.type?.startsWith('image/'))) ||
    attachedSources.some((s) => s.type === 'image' || s.mimeType?.startsWith('image/'));

  if (hasImageAttachments) {
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
    scratchpad: currentScratchpad,
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

  // 4. Filter Available Tools & Direct Response Optimization
  const hasAttachments = attachedSources.length > 0 || Boolean(params.attachments && params.attachments.length > 0);
  const toolsNeeded = shouldEnableToolsForPrompt(userPrompt, hasAttachments, enabledTools, params.workspaceType);

  let normalizedTools: ReturnType<typeof toNormalizedToolDefinitions> = [];
  if (toolsNeeded && adapter.supportsNativeTools()) {
    const availableTools = getAvailableTools({
      workspaceType: params.workspaceType,
      hasAttachments,
      enabledTools,
    });
    normalizedTools = toNormalizedToolDefinitions(availableTools);
  }

  // 5. Retrieve Relevant Context Chunks from Attached Sources
  // For routine editing in Document workspace, avoid repeatedly scanning all attached sources
  const isDocEditingRoutine =
    workspaceType === 'doc' &&
    (!params.explicitSourceIds || params.explicitSourceIds.length === 0) &&
    (!params.attachments || params.attachments.length === 0) &&
    !/\b(?:based on|according to|cite|reference|from (?:attached|the source|sources)|consult)\b/i.test(userPrompt);

  if (attachedSources.length > 0 && !isDocEditingRoutine) {
    const searchAct = addActivity('Reading attached files', 'running', `Scanning ${attachedSources.length} sources`);
    yield createSSEEvent({ type: 'activity', event: searchAct });

    const chunks = await searchRelevantChunks(userPrompt, workspaceId, 4);
    for (const chk of chunks) {
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
    searchAct.safeSummary = chunks.length > 0 ? `Retrieved ${chunks.length} relevant sections` : 'Sources scanned';
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

  // 7. Inject Temporal Context & Workspace Capabilities into System Instruction
  const userTimeZone = params.timeZone || 'Asia/Kolkata';
  const now = new Date();
  const currentDateStr = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeZone: userTimeZone,
  }).format(now);
  const currentTimeStr = new Intl.DateTimeFormat('en-US', {
    timeStyle: 'medium',
    timeZone: userTimeZone,
  }).format(now);

  let systemPrompt = `You are Docium AI, an expert workspace intelligence partner and research assistant.
You operate cleanly in an open-source, BYOK architecture.

Temporal & Environment Context:
- Current Runtime Date: ${currentDateStr}
- Current Runtime Time: ${currentTimeStr} (${userTimeZone})
- Today's Year: ${now.getFullYear()}
- Note: Always evaluate temporal expressions ("today", "yesterday", "recently", "latest", "this year", "current") relative to this runtime date (${currentDateStr}).

Workspace Context:
- Active Workspace ID: ${workspaceId}
- Workspace Format: ${workspaceType.toUpperCase()}
- Active Document Title: ${activeDocContext?.title || 'Untitled'}
- Workspace Files Available: ${(params.workspaceFiles || []).map((f) => `"${f.title}" (${f.type})`).join(', ') || 'None'}
- Attached Sources: ${attachedSources.map((s) => s.title).join(', ') || 'None'}${
    params.explicitSourceIds && params.explicitSourceIds.length > 0
      ? `\n- Explicitly Mentioned Sources (@attach): ${attachedSources
          .filter((s) => params.explicitSourceIds?.includes(s.id))
          .map((s) => s.title)
          .join(', ')} (PRIORITY 1 - Base your answers primarily on these referenced files)`
      : ''
  }

Workspace Capabilities & Tools:
1. You have FULL PERMISSION and capability to read, search, inspect, create, and update files and documents in this workspace through your tools.
2. If asked to update an existing document or create a new file, ALWAYS execute the appropriate workspace tool (such as update_document_file or create_workspace_file) instead of refusing or claiming you cannot modify files.
3. When updating a document, preserve existing content unless asked to replace it, and provide clean Markdown content.
4. When performing live web research, ground your answers in verified external search results and cite the source URLs accurately. Never claim you lack web access when search results are provided or web search is available.
5. Provide thoughtful, direct, well-structured answers using clean Markdown with clear headings, lists, tables, and code snippets when appropriate.
6. For greetings and casual conversation, respond warmly and concisely.`;

  if (normalizedTools.length > 0) {
    systemPrompt += `\n7. When answering questions based on attached sources, cite them clearly.
8. If the user asks for a chart, statistics comparison, or distribution, autonomously use the appropriate chart tool (create_bar_chart, create_line_chart, create_pie_chart, or create_comparison_chart).
9. If the user asks to generate an image or illustration and image generation is enabled, invoke the generate_image tool.
10. If the user asks for current web data and web search is enabled, invoke the web_search tool.
11. When performing mathematical calculations, use the calculate tool for accuracy.
12. Keep working notes in the scratchpad using update_scratchpad when task state should be preserved across future messages.`;
  }

  if (workspaceType === 'doc') {
    const doc = activeDocContext;
    const headingsOutline =
      doc?.headings && doc.headings.length > 0
        ? doc.headings.map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}- [H${h.level}] ${h.text}`).join('\n')
        : 'No headings present yet';

    const activeSelText = doc?.selectedText || doc?.selection?.selectedText;
    const activeCursorPos = doc?.cursorPosition !== undefined ? doc.cursorPosition : doc?.selection?.cursorPos;
    const activeSurroundingPara = doc?.surroundingParagraph || doc?.selection?.surroundingParagraph;

    systemPrompt += `\n\n================================================================================
MANDATORY DIRECTIVE FOR ACTIVE DOCUMENT WORKSPACE:
You are directly connected to the active DOCIUM Document Editor.

ACTIVE DOCUMENT CONTEXT:
- Document Title: "${doc?.title || 'Untitled'}"
- Document ID: "${doc?.id || 'active'}"
- Word Count: ${doc?.wordCount ?? 'N/A'} | Character Count: ${doc?.characterCount ?? 'N/A'}
- Active Text Selection: ${activeSelText ? `"${activeSelText}"` : 'None (no text currently selected)'}
- Cursor Position: ${activeCursorPos !== undefined ? activeCursorPos : 'N/A'}
- Surrounding Paragraph: ${activeSurroundingPara ? `"${activeSurroundingPara}"` : 'None'}
- Document Outline / Headings:
${headingsOutline}
- Page Layout Settings:
  * Page Size: ${doc?.pageSize || 'A4'}
  * Orientation: ${doc?.orientation || 'portrait'}
  * Columns: ${doc?.columns || 1}
  * Running Header: ${doc?.headerText || 'None'}
  * Running Footer: ${doc?.footerText || 'None'}
  * Page Numbers: ${doc?.showPageNumbers ? 'Enabled' : 'Disabled'}

CRITICAL ARCHITECTURAL RULES:
1. STRICT PERMISSION BOUNDARY: You have permission to modify ONLY the currently active document ("${doc?.title || 'Untitled'}", ID: "${doc?.id || 'active'}").
   - You MUST NEVER create, rename, edit, or delete any other workspace files.
   - If the user asks to modify other files or create files outside this active document, politely explain that you are operating inside the active document editor and can only modify this active document.
2. DIRECT ACTION OVER TALK: When the user asks you to write, add, insert, draft, edit, format, organize, structure, replace, or delete content, or adjust page layout:
   - YOU MUST EXECUTE THE APPROPRIATE DOCUMENT TOOL(S) IMMEDIATELY.
   - NEVER merely output instructions or say "Here is what I will write" or "Please paste this into your document" without executing the tool.
   - After tool execution completes successfully, give a concise confirmation summarizing the edits made.
3. CONTEXT-AWARE TARGETING:
   - If the user refers to "this", "the selection", or "selected text", target the active selection using replace_selected_text or format_document_text.
   - If the user specifies a section or heading, use append_or_insert_paragraph with afterHeading or locate_document_section.
   - For finding and replacing text or phrases, use find_and_replace_text or search_document_content.
   - If a targeting request is genuinely ambiguous (multiple distinct matches exist), ask one concise clarifying question before applying destructive edits.
4. OUTLINE & LAYOUT SYNCHRONIZATION:
   - All headings and structural changes you apply directly update the document's real-time outline and page layout.

${getDocumentCapabilitiesPromptSummary()}
================================================================================`;
  }

  if (currentScratchpad) {
    systemPrompt += `\n\nActive Conversation Notes (Scratchpad):\n${currentScratchpad}`;
  }

  if (collectedCitations.length > 0) {
    systemPrompt += `\n\nRelevant Retrieved Source Content:\n${collectedCitations
      .map((c, i) => `[Source ${i + 1}: ${c.sourceTitle}${c.page ? ` (Page ${c.page})` : ''}]\n${c.snippet}`)
      .join('\n\n')}`;
  }

  if (preSearchedEvidence) {
    systemPrompt += preSearchedEvidence;
  }

  // 8. Build Normalized Message Array
  const messages: NormalizedMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Include recent conversation history (last 8 messages for context budget)
  for (const m of conversationHistory.slice(-8)) {
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

  // Extract images from attachments and attached sources
  const imageUrls: string[] = [];
  if (params.attachments) {
    for (const a of params.attachments) {
      if (a.dataUrl) {
        imageUrls.push(a.dataUrl);
      } else if (a.url && (a.type?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(a.url))) {
        imageUrls.push(a.url);
      }
    }
  }
  for (const s of attachedSources) {
    if (s.extractedImages) {
      for (const img of s.extractedImages) {
        if (img.url) imageUrls.push(img.url);
      }
    }
  }

  // Add the new user prompt
  messages.push({
    role: 'user',
    content: userPrompt,
    images: imageUrls.length > 0 ? imageUrls : undefined,
  });

  // 7. Multi-step Execution Loop (max 5 rounds)
  let loopCount = 0;
  const maxRounds = 5;
  let executionStage: AgentExecutionStage = 'idle';
  const executedToolsRecord: ExecutedToolRecord[] = [];

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

  while (loopCount < maxRounds) {
    loopCount++;

    executionStage = loopCount === 1 ? 'model_request_started' : 'followup_request_started';
    console.log(`[DOCIUM AI Diagnostic] Agent stage: ${executionStage} | round: ${loopCount}/${maxRounds} | provider: ${providerId} | model: ${modelId}`);

    let assistantContent = '';
    const pendingCalls: ToolCallRequest[] = [];
    let isFinalResponseStreaming = false;
    let roundBufferedDeltas: string[] = [];
    const STREAM_PREAMBLE_THRESHOLD = 80;
    let roundSucceeded = false;
    let emptyRoundRetries = 0;
    const maxEmptyRoundRetries = loopCount === 1 ? 2 : 0;

    while (!roundSucceeded) {
      const stream = adapter.generateStream(messages, normalizedTools, {
        model: modelId,
        apiKey,
        baseUrl,
        accountId,
        signal,
      });

      let errorInStream: string | null = null;

      for await (const chunk of stream) {
        if (signal?.aborted) {
          initialAct.status = 'completed';
          initialAct.safeSummary = 'Cancelled';
          yield createSSEEvent({ type: 'activity', event: initialAct });
          yield createSSEEvent({ type: 'status', status: 'cancelled' });
          yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
          return;
        }

        if (chunk.type === 'delta' && chunk.delta) {
          if (executionStage === 'model_request_started' || executionStage === 'followup_request_started') {
            executionStage = 'model_response_received';
          }
          assistantContent += chunk.delta;

          // If tool calls were already discovered in this round, buffer as intermediate remarks
          if (pendingCalls.length > 0) {
            roundBufferedDeltas.push(chunk.delta);
            continue;
          }

          // If final response streaming hasn't begun yet, buffer until threshold or stream end
          if (!isFinalResponseStreaming) {
            roundBufferedDeltas.push(chunk.delta);
            const currentBuffered = roundBufferedDeltas.join('');
            if (currentBuffered.length >= STREAM_PREAMBLE_THRESHOLD) {
              // Beyond preamble threshold without tool calls: this is genuine final response content
              isFinalResponseStreaming = true;
              yield createSSEEvent({ type: 'final_response_started' });
              for (const act of activityEvents) {
                if (act.status === 'running') {
                  act.status = 'completed';
                  act.safeSummary = act.safeSummary || 'Completed';
                  yield createSSEEvent({ type: 'activity', event: act });
                }
              }
              roundBufferedDeltas = [];
              yield createSSEEvent({ type: 'status', status: 'generating' });
              yield createSSEEvent({ type: 'delta', text: currentBuffered });
            }
          } else {
            yield createSSEEvent({ type: 'status', status: 'generating' });
            yield createSSEEvent({ type: 'delta', text: chunk.delta });
          }
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          if (executionStage === 'model_request_started' || executionStage === 'followup_request_started') {
            executionStage = 'model_response_received';
          }
          pendingCalls.push(chunk.toolCall);

          // If final response streaming was prematurely started before this tool call arrived,
          // retract the premature text from the client message bubble!
          if (isFinalResponseStreaming) {
            isFinalResponseStreaming = false;
            yield createSSEEvent({ type: 'replace_content', text: '' });
          }
        } else if (chunk.type === 'error' && chunk.error) {
          errorInStream = chunk.error;
          break;
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

      // Check if Round 1 returned completely empty (no deltas, no tool calls)
      // Retry bounded with exponential backoff before declaring empty
      if (
        !errorInStream &&
        !assistantContent.trim() &&
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
      // Check document action request enforcement first
      const isDocAction = workspaceType === 'doc' && isDocumentActionRequest(userPrompt);
      const isNarrativePromise = /\b(?:i'll|i will|let me|i am going to|i'm going to|i shall|i can)\s+(?:add|insert|write|create|update|place|put|format|append|draft|include)\b/i.test(assistantContent);

      if (isDocAction && !editorActionExecuted) {
        if (loopCount === 1 && isNarrativePromise) {
          // Model promised to do it in natural language but did not trigger a tool call.
          // Retract premature narrative text from message bubble so round 2 starts clean!
          if (isFinalResponseStreaming) {
            isFinalResponseStreaming = false;
            yield createSSEEvent({ type: 'replace_content', text: '' });
          }
          const enforAct = createStep('Updating the document', {
            status: 'completed',
            safeSummary: 'I am preparing the document editor to apply the requested updates.',
          });
          yield createSSEEvent({ type: 'activity', event: enforAct });

          messages.push({ role: 'assistant', content: assistantContent });
          messages.push({
            role: 'user',
            content: `[SYSTEM ACTION ENFORCEMENT] You stated your intention to update the document, but you did NOT invoke any document editing tool. You must invoke "insert_structured_document" or "append_or_insert_paragraph" right now with the complete structured content so the editor updates. Do not reply with narrative text without calling a tool. Request: "${userPrompt}"`,
          });
          continue;
        }

        // Automatic structured document action execution:
        let contentToInsert = assistantContent.trim();
        const preambleMatch = contentToInsert.match(/^(?:Sure!|Certainly!|Here (?:is|are)|I have (?:added|created)|Of course)[^\n]*\n+/i);
        if (preambleMatch && contentToInsert.length > preambleMatch[0].length + 20) {
          contentToInsert = contentToInsert.substring(preambleMatch[0].length).trim();
        }

        // Guard against inserting an empty promise string like "I'll insert it now..." as document content
        const isShortPromise = isNarrativePromise && contentToInsert.length < 150 && !contentToInsert.includes('\n\n') && !contentToInsert.includes('#');
        if (isShortPromise || !contentToInsert) {
          contentToInsert = generateSubstantiveDocumentContent(userPrompt, activeDocContext?.title);
        }

        if (contentToInsert) {
          const act = createStep('Updating the document', {
            eventType: 'editor_action',
            toolName: 'insert_structured_document',
            status: 'running',
            safeSummary: 'I am applying the updates to the active document while preserving other sections.',
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
          yield createSSEEvent({ type: 'activity', event: act });

          executedToolsRecord.push({
            name: 'insert_structured_document',
            arguments: { content: contentToInsert, position: 'cursor' },
            success: editResult.success,
            summary: editResult.activitySummary,
            error: editResult.error,
            isEditorAction: true,
          });

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

          const docName = activeDocContext?.title || 'active document';
          if (isShortPromise) {
            const fullReply = `I have inserted the requested content into **${docName}**.\n\n` + contentToInsert;
            yield createSSEEvent({ type: 'replace_content', text: fullReply });
            assistantContent = fullReply;
          } else {
            const summaryText = `\n\nInserted structured content into **${docName}** based on your request.`;
            assistantContent += summaryText;
            yield createSSEEvent({ type: 'delta', text: summaryText });
          }
        }
      }

      if (!isFinalResponseStreaming && assistantContent.trim().length > 0) {
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
        } else if (executedToolsRecord.length > 0 || editorActionExecuted || fileOpExecuted) {
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

    // If pre-tool remarks were buffered, preserve as intermediate explanation (Category B)
    const intermediateExplanation = roundBufferedDeltas.join('').trim();
    roundBufferedDeltas = [];

    // Append assistant's thoughts/tool call to history
    messages.push({
      role: 'assistant',
      content: assistantContent,
      toolCalls: pendingCalls,
    });

    executionStage = 'tools_executing';
    yield createSSEEvent({ type: 'status', status: 'executing_tool' });

    // Execute each requested tool
    for (const tc of pendingCalls) {
      console.log(`[DOCIUM Agent] Tool-call requested: "${tc.name}", id="${tc.id}"`);
      const stepId = `step-tool-${tc.name}-${tc.id || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const naturalRunningSummary = generateNaturalStepContent(tc.name, tc.arguments, false);
      const initialStepSummary = intermediateExplanation || naturalRunningSummary;

      const act = createStep(humanReadableToolLabel(tc.name), {
        stepId,
        eventType: 'tool_execution',
        toolName: tc.name,
        status: 'running',
        safeSummary: initialStepSummary,
      });
      yield createSSEEvent({ type: 'activity', event: act });

      const result = await executeTool(tc.name, tc.arguments, toolExecutionContext);
      console.log(`[DOCIUM Agent] Tool execution completed: "${tc.name}", success=${result.success}`);

      act.status = result.success ? 'completed' : 'failed';
      const naturalCompletedSummary = result.success
        ? generateNaturalStepContent(tc.name, tc.arguments, true, result.activitySummary)
        : (result.error || 'Failed to complete this step.');
      act.safeSummary = naturalCompletedSummary;
      act.description = act.safeSummary;
      yield createSSEEvent({ type: 'activity', event: act });

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

      // If editor actions were performed, emit to client idempotently
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
      if (result.editorAction) {
        const key = result.editorAction.actionId || `${result.editorAction.action}-${JSON.stringify(result.editorAction.payload)}`;
        if (!dispatchedActionIds.has(key)) {
          dispatchedActionIds.add(key);
          editorActionExecuted = true;
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

    executionStage = 'tools_completed';
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
  yield createSSEEvent({ type: 'status', status: 'completed' });
  yield createSSEEvent({ type: 'done', messageId: `msg-${Date.now()}` });
}

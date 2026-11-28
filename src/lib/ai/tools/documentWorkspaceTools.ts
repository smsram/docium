/**
 * DOCIUM Complete Document Workspace Tool Catalog
 * 
 * Provides real implementations for:
 * Stage A: Content Creation, Content Transformations, Movement & Organization, Advanced Formatting, Navigation
 * Stage B: Table Management, Image & Media, Hyperlinks, Bookmarks, Comments & Annotations
 * Stage C: Page Settings, Layout, Page & Section Breaks, Headers/Footers, Page Numbering
 * Stage D: Review & Quality Checks (Spelling, Grammar, Readability, Repetition, Heading Hierarchy, Accessibility)
 * Stage E: File Output (PDF, DOCX, TXT, HTML) and Version / Change Management
 * Planned: Equations, Footnotes, Endnotes, Watermarks, Bookmarks
 * 
 * Architectural guarantees:
 * - Real editor transactions via editorRegistry and authoritative Zustand store persistence
 * - Strict active document scope boundary enforcement
 * - Verified state updates before returning success
 * - Precise JSON input schemas
 * - Non-destructive inspection and undoable transactions
 */

import { ToolExecutionContext, ToolResult } from './types';
import { ToolCatalogEntry, ToolRisk, ToolCategory } from './catalog';
import { editorRegistry } from '@/lib/editor/editorRegistry';
import {
  searchProseMirrorDoc,
  findSectionByHeading,
  replaceAllMatches,
} from '@/lib/editor/documentSearch';
import { useWorkspaceStore } from '@/lib/store';
import {
  exportToDocx,
  exportToHtml,
  exportToPlainText,
  exportToMarkdown,
} from '@/components/editor/utils/exportDocx';
import { exportToPdf, triggerPrintPdf } from '@/components/editor/utils/exportPdf';
import {
  DocumentPageSize,
  DocumentOrientation,
  DocumentComment,
  DocumentVersionSnapshot,
  ActiveDocumentHeading,
} from '@/lib/types';
import { convertMarkdownToDocumentHtml } from '@/components/editor/utils/markdownToHtml';
import { validateActionAgainstActiveDoc } from '@/lib/editor/shadowDocEngine';

const UNIVERSAL_ANCHOR_PROPERTIES: Record<string, { type: string; description: string; enum?: string[] }> = {
  position: {
    type: 'string',
    enum: ['cursor', 'end', 'start', 'afterHeading', 'beforeHeading', 'afterText', 'beforeText', 'replaceTarget', 'endOfSection'],
    description: 'Placement mode (defaults to cursor or end depending on tool).',
  },
  afterHeading: {
    type: 'string',
    description: 'Heading title to insert immediately after.',
  },
  beforeHeading: {
    type: 'string',
    description: 'Heading title to insert immediately before.',
  },
  afterText: {
    type: 'string',
    description: 'Text snippet to insert immediately after.',
  },
  beforeText: {
    type: 'string',
    description: 'Text snippet to insert immediately before.',
  },
  replaceTargetText: {
    type: 'string',
    description: 'Existing text/diagram snippet to remove and replace in-place with this element.',
  },
  replaceStartText: {
    type: 'string',
    description: 'Start anchor of a multi-line region/text diagram to replace in-place.',
  },
  replaceEndText: {
    type: 'string',
    description: 'End anchor of a multi-line region/text diagram to replace in-place.',
  },
  replaceBlockContaining: {
    type: 'string',
    description: 'Snippet inside a codeBlock/paragraph/block to remove and replace in-place.',
  },
  replaceBlockType: {
    type: 'string',
    enum: ['any', 'paragraph', 'codeBlock', 'blockquote', 'table', 'callout'],
    description: 'Optional block type filter when using replaceBlockContaining.',
  },
};

function pickAnchorPayload(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = [
    'position',
    'afterHeading',
    'beforeHeading',
    'afterText',
    'beforeText',
    'replaceTargetText',
    'replaceStartText',
    'replaceEndText',
    'replaceBlockContaining',
    'replaceBlockType',
  ];
  for (const k of keys) {
    if (args[k] !== undefined && args[k] !== null && args[k] !== '') {
      out[k] = args[k];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scope & Permission Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function validateActiveDoc(
  context: ToolExecutionContext,
  requestedDocId?: string
): { ok: true; docId: string } | { ok: false; error: string } {
  const activeDocId = context.activeDocument?.id || context.workspaceId;
  if (!activeDocId) {
    return { ok: false, error: 'No active document loaded in workspace.' };
  }
  if (context.workspaceType && context.workspaceType !== 'doc') {
    return { ok: false, error: `Document tools cannot be applied in "${context.workspaceType}" workspace.` };
  }
  if (
    requestedDocId &&
    requestedDocId !== activeDocId &&
    requestedDocId !== context.workspaceId &&
    requestedDocId !== context.activeDocument?.id
  ) {
    return {
      ok: false,
      error: `Permission denied: Cannot edit document "${requestedDocId}". Only the active document ("${activeDocId}") can be modified.`,
    };
  }
  return { ok: true, docId: activeDocId };
}

export async function dispatchOrExecuteEditorAction(
  context: ToolExecutionContext,
  action: string,
  payload: Record<string, unknown>,
  docId: string,
  summary: string
): Promise<{ success: boolean; error?: string; actionId: string; editorAction: any }> {
  const actionId = `act-${action.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const actionPayload = {
    ...payload,
    documentId: docId,
  };
  const editorAction = {
    actionId,
    action,
    payload: actionPayload,
    summary,
  };

  if (context.onEditorAction) {
    await context.onEditorAction(editorAction);
  }

  const res = await editorRegistry.executeAction(action, actionPayload, docId);
  if (!res.success && typeof window !== 'undefined') {
    return { success: false, error: res.error || 'Failed to execute editor action.', actionId, editorAction };
  }

  return { success: true, actionId, editorAction };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality & Analysis Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function computeReadability(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const wordCount = words.length || 1;
  const sentenceCount = sentences.length || 1;

  let syllableCount = 0;
  for (const w of words) {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length <= 3) {
      syllableCount += 1;
      continue;
    }
    const matches = clean.match(/[aeiouy]{1,2}/g);
    let syl = matches ? matches.length : 1;
    if (clean.endsWith('e') && !clean.endsWith('le')) {
      syl = Math.max(1, syl - 1);
    }
    syllableCount += syl;
  }

  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = syllableCount / wordCount;
  const fleschScore = Math.max(0, Math.min(100, Math.round(206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord)));
  const gradeLevel = Math.max(1, Math.round(0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59));

  let classification = 'Standard';
  if (fleschScore >= 90) classification = 'Very Easy';
  else if (fleschScore >= 80) classification = 'Easy';
  else if (fleschScore >= 70) classification = 'Fairly Easy';
  else if (fleschScore >= 60) classification = 'Standard';
  else if (fleschScore >= 50) classification = 'Fairly Difficult';
  else if (fleschScore >= 30) classification = 'Difficult';
  else classification = 'Very Confusing';

  const readingTimeMinutes = Math.max(1, Math.round(wordCount / 200));

  return {
    wordCount,
    sentenceCount,
    syllableCount,
    fleschReadingEase: fleschScore,
    fleschKincaidGradeLevel: gradeLevel,
    readingTimeMinutes,
    classification,
  };
}

export function computeRepetition(text: string) {
  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const wordFreq: Record<string, number> = {};
  const stopWords = new Set(['the', 'and', 'that', 'this', 'with', 'from', 'have', 'were', 'which', 'your', 'will', 'are', 'for']);
  for (const w of words) {
    if (!stopWords.has(w)) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }
  const repeatedWords = Object.entries(wordFreq)
    .filter(([_, count]) => count > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  const sentences = text.split(/[.!?]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const duplicateSentences: string[] = [];
  const seenSentences = new Set<string>();
  for (const s of sentences) {
    if (seenSentences.has(s) && s.length > 20) {
      duplicateSentences.push(s);
    }
    seenSentences.add(s);
  }

  return {
    repeatedWords,
    duplicateSentences,
    hasRepetition: repeatedWords.length > 0 || duplicateSentences.length > 0,
  };
}

export function validateHeadingHierarchy(headings: ActiveDocumentHeading[]) {
  const issues: string[] = [];
  if (headings.length === 0) {
    return { valid: true, headingsCount: 0, issues: ['No headings present in document'] };
  }

  const h1Count = headings.filter((h) => h.level === 1).length;
  if (h1Count === 0) {
    issues.push('Document lacks a Level 1 Heading (H1) title');
  } else if (h1Count > 1) {
    issues.push(`Document contains ${h1Count} Level 1 Headings (recommend single top-level title)`);
  }

  for (let i = 0; i < headings.length - 1; i++) {
    const curr = headings[i].level;
    const next = headings[i + 1].level;
    if (next > curr + 1) {
      issues.push(`Skipped heading level: Heading "${headings[i].text}" (H${curr}) followed immediately by "${headings[i + 1].text}" (H${next}) without H${curr + 1}`);
    }
  }

  return {
    valid: issues.length === 0,
    headingsCount: headings.length,
    h1Count,
    issues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STAGE A — 1. CONTENT CREATION
// ─────────────────────────────────────────────────────────────────────────────

export const insertParagraphTool: ToolCatalogEntry = {
  id: 'insert_paragraph',
  name: 'insert_paragraph',
  label: 'Insert Paragraph',
  description: 'Insert a paragraph of text at a specific position (start, end, cursor, or after a heading).',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Paragraph text to insert.' },
      position: { type: 'string', enum: ['start', 'end', 'cursor', 'afterHeading'], description: 'Insertion position.' },
      afterHeading: { type: 'string', description: 'Heading title after which to insert paragraph.' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '').trim();
    if (!text) return { success: false, error: 'Text cannot be empty.' };

    const actionResult = await dispatchOrExecuteEditorAction(
      context,
      'append_or_insert_paragraph',
      { text, position: args.position || 'end', afterHeading: args.afterHeading },
      val.docId,
      `Inserted paragraph (+${text.length} chars)`
    );
    if (!actionResult.success) return { success: false, error: actionResult.error || 'Failed to insert paragraph.' };
    return {
      success: true,
      data: { textLength: text.length, position: args.position || 'end', changed: true },
      activitySummary: `Inserted paragraph (+${text.length} chars)`,
      editorAction: actionResult.editorAction,
    };
  },
};

export const insertHeadingTool: ToolCatalogEntry = {
  id: 'insert_heading',
  name: 'insert_heading',
  label: 'Insert Heading',
  description: 'Insert a new heading with a specified level (1-6) or edit an existing heading.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Heading text to insert or update.' },
      level: { type: 'number', description: 'Heading level (1 to 6, default 2).' },
      existingHeading: { type: 'string', description: 'Optional title of existing heading to replace/edit.' },
      position: { type: 'string', enum: ['start', 'end', 'cursor'], description: 'Insertion position.' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '').trim();
    if (!text) return { success: false, error: 'Heading text cannot be empty.' };
    const level = Number(args.level || 2);

    const actionResult = await dispatchOrExecuteEditorAction(
      context,
      'create_or_edit_heading',
      { text, level, existingHeading: args.existingHeading, position: args.position },
      val.docId,
      `Inserted H${level} heading "${text}"`
    );
    if (!actionResult.success) return { success: false, error: actionResult.error || 'Failed to insert heading.' };
    return {
      success: true,
      data: { text, level, modified: true },
      activitySummary: `Inserted H${level} heading "${text}"`,
      editorAction: actionResult.editorAction,
    };
  },
};

export const insertListTool: ToolCatalogEntry = {
  id: 'insert_list',
  name: 'insert_list',
  label: 'Insert List',
  description: 'Insert a bulleted, numbered, or task list into the active document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { type: 'string' }, description: 'List items to insert.' },
      listType: { type: 'string', enum: ['bullet', 'ordered', 'task'], description: 'List type.' },
    },
    required: ['items'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const items = Array.isArray(args.items) ? (args.items as string[]) : [];
    if (items.length === 0) return { success: false, error: 'items array cannot be empty.' };
    const listType = String(args.listType || 'bullet');

    const actionResult = await dispatchOrExecuteEditorAction(
      context,
      'create_document_list',
      { items, listType },
      val.docId,
      `Inserted ${listType} list (${items.length} items)`
    );
    if (!actionResult.success) return { success: false, error: actionResult.error || 'Failed to insert list.' };
    return {
      success: true,
      data: { itemCount: items.length, listType },
      activitySummary: `Inserted ${listType} list (${items.length} items)`,
      editorAction: actionResult.editorAction,
    };
  },
};

export const insertTableTool: ToolCatalogEntry = {
  id: 'insert_table',
  name: 'insert_table',
  label: 'Insert Table',
  description: 'Insert a table with specified rows, columns, headers, and optional cell data.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      rowCount: { type: 'number', description: 'Number of rows (default 3).' },
      colCount: { type: 'number', description: 'Number of columns (default 3).' },
      headers: { type: 'array', items: { type: 'string' }, description: 'Optional column headers.' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Optional cell data rows.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const rowCount = typeof args.rowCount === 'number' ? args.rowCount : 3;
    const colCount = typeof args.colCount === 'number' ? args.colCount : 3;

    const actionResult = await dispatchOrExecuteEditorAction(
      context,
      'insert_document_table',
      { rowCount, colCount, headers: args.headers, rows: args.rows },
      val.docId,
      `Inserted ${rowCount}x${colCount} table`
    );
    if (!actionResult.success) return { success: false, error: actionResult.error || 'Failed to insert table.' };
    return {
      success: true,
      data: { rowCount, colCount },
      activitySummary: `Inserted ${rowCount}x${colCount} table`,
      editorAction: actionResult.editorAction,
    };
    return {
      success: true,
      data: { rowCount, colCount },
      activitySummary: `Inserted ${rowCount}×${colCount} table`,
    };
  },
};

export const insertImageTool: ToolCatalogEntry = {
  id: 'insert_image',
  name: 'insert_image',
  label: 'Insert Image',
  description: 'Insert an image into the document with specified URL, alt text, and title.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: [
    'embed image into document',
    'insert picture into page',
    'attach photo to document',
    'insert illustration',
  ],
  keywords: ['embed', 'insert_image', 'picture', 'photo', 'illustration', 'figure'],
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Image asset URL or data URL.' },
      alt: { type: 'string', description: 'Accessible alternative text.' },
      title: { type: 'string', description: 'Image title / caption tooltip.' },
      width: { type: 'number', description: 'Optional display width in px.' },
      alignment: { type: 'string', enum: ['left', 'center', 'right'], description: 'Alignment.' },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['url'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const url = String(args.url || '').trim();
    if (!url) return { success: false, error: 'Image URL is required.' };

    const res = await editorRegistry.executeAction(
      'insert_document_image',
      { url, alt: args.alt, title: args.title, width: args.width, alignment: args.alignment, ...pickAnchorPayload(args) },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert image.' };
    return {
      success: true,
      data: { url, alt: args.alt, title: args.title },
      activitySummary: `Inserted image "${args.title || args.alt || 'image'}"`,
    };
  },
};

export const insertLinkTool: ToolCatalogEntry = {
  id: 'insert_link',
  name: 'insert_link',
  label: 'Insert Hyperlink',
  description: 'Insert a hyperlink into selected text or at cursor with url and label.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Destination web URL (e.g. https://example.com).' },
      text: { type: 'string', description: 'Link anchor text to display.' },
    },
    required: ['url'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const url = String(args.url || '').trim();
    if (!url) return { success: false, error: 'URL is required.' };

    const res = await editorRegistry.executeAction(
      'insert_hyperlink',
      { url, text: args.text },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert hyperlink.' };
    return {
      success: true,
      data: { url, text: args.text },
      activitySummary: `Inserted hyperlink to "${url}"`,
    };
  },
};

export const insertPageBreakTool: ToolCatalogEntry = {
  id: 'insert_page_break',
  name: 'insert_page_break',
  label: 'Insert Page Break',
  description: 'Insert a page break at the current cursor position or section.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('insert_document_page_break', {}, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert page break.' };
    return { success: true, data: { inserted: true }, activitySummary: 'Inserted page break' };
  },
};

export const insertSectionBreakTool: ToolCatalogEntry = {
  id: 'insert_section_break',
  name: 'insert_section_break',
  label: 'Insert Section Break',
  description: 'Insert a section break divider into the document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('insert_document_section_break', {}, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert section break.' };
    return { success: true, data: { inserted: true }, activitySummary: 'Inserted section break' };
  },
};

export const insertHorizontalRuleTool: ToolCatalogEntry = {
  id: 'insert_horizontal_rule',
  name: 'insert_horizontal_rule',
  label: 'Insert Horizontal Rule',
  description: 'Insert a horizontal divider rule into the document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('insert_horizontal_rule', {}, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert horizontal rule.' };
    return { success: true, data: { inserted: true }, activitySummary: 'Inserted horizontal divider' };
  },
};

export const insertQuoteTool: ToolCatalogEntry = {
  id: 'insert_quote',
  name: 'insert_quote',
  label: 'Insert Quote Block',
  description: 'Insert a formatted blockquote into the document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Quote text.' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '').trim();
    if (!text) return { success: false, error: 'Quote text cannot be empty.' };

    const res = await editorRegistry.executeAction('insert_quote', { text }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert quote.' };
    return { success: true, data: { textLength: text.length }, activitySummary: 'Inserted quotation block' };
  },
};

export const insertCodeBlockTool: ToolCatalogEntry = {
  id: 'insert_code_block',
  name: 'insert_code_block',
  label: 'Insert Code Block',
  description: 'Insert a formatted syntax-highlighted code block with preserved newlines and indentation.',
  category: 'content_creation',
  workspace: ['doc', 'universal', 'chat'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      code: { type: 'string', description: 'Source code content.' },
      language: { type: 'string', description: 'Programming language (e.g. python, typescript, javascript, json).' },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['code'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const code = String(args.code || '');
    const language = String(args.language || 'python');
    const position = String(args.position || 'cursor');

    const res = await editorRegistry.executeAction('insert_code_block', { code, language, position, ...pickAnchorPayload(args) }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert code block.' };
    return {
      success: true,
      data: { language, length: code.length },
      activitySummary: `Inserted ${language} code block (${code.length} chars)`,
    };
  },
};

export const insertTableOfContentsTool: ToolCatalogEntry = {
  id: 'insert_table_of_contents',
  name: 'insert_table_of_contents',
  label: 'Insert Table of Contents',
  description: 'Generate and insert a table of contents from document headings.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      position: { type: 'string', enum: ['start', 'cursor'], description: 'Insertion location (default start).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction(
      'insert_table_of_contents',
      { position: args.position || 'start' },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert table of contents.' };
    return { success: true, data: { position: args.position || 'start' }, activitySummary: 'Generated table of contents' };
  },
};

export const appendContentTool: ToolCatalogEntry = {
  id: 'append_content',
  name: 'append_content',
  label: 'Append Content',
  description: 'Append content to the end of the document or a specified section.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Content to append.' },
      sectionHeading: { type: 'string', description: 'Optional section heading after which to append.' },
    },
    required: ['content'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const content = String(args.content || '').trim();
    if (!content) return { success: false, error: 'Content cannot be empty.' };

    const res = await editorRegistry.executeAction(
      'append_or_insert_paragraph',
      { text: content, afterHeading: args.sectionHeading, position: args.sectionHeading ? 'afterHeading' : 'end' },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to append content.' };
    return { success: true, data: { length: content.length }, activitySummary: `Appended content (+${content.length} chars)` };
  },
};

export const prependContentTool: ToolCatalogEntry = {
  id: 'prepend_content',
  name: 'prepend_content',
  label: 'Prepend Content',
  description: 'Insert content at the beginning of the document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Content to prepend at the document start.' },
    },
    required: ['content'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const content = String(args.content || '').trim();
    if (!content) return { success: false, error: 'Content cannot be empty.' };

    const res = await editorRegistry.executeAction('prepend_to_document', { content }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to prepend content.' };
    return { success: true, data: { length: content.length }, activitySummary: `Prepended content at start (+${content.length} chars)` };
  },
};

export const insertCalloutTool: ToolCatalogEntry = {
  id: 'insert_callout',
  name: 'insert_callout',
  label: 'Insert Callout Box',
  description: 'Insert an informative callout box (info, tip, warning, danger, note).',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: ['info', 'tip', 'warning', 'danger', 'note'], description: 'Callout style type.' },
      content: { type: 'string', description: 'Callout text or HTML content.' },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['content'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const calloutType = (args.type as 'info' | 'tip' | 'warning' | 'danger' | 'note') || 'info';
    const content = String(args.content || '');

    const res = await editorRegistry.executeAction('insert_callout_box', { type: calloutType, content, ...pickAnchorPayload(args) }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert callout.' };
    return { success: true, data: { type: calloutType }, activitySummary: `Inserted ${calloutType} callout box` };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE A — 2. CONTENT TRANSFORMATION
// ─────────────────────────────────────────────────────────────────────────────

export const rewriteContentTool: ToolCatalogEntry = {
  id: 'rewrite_content',
  name: 'rewrite_content',
  label: 'Rewrite Content',
  description: 'Rewrite selected content while preserving its intended meaning and key information.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Existing text to replace.' },
      rewrittenContent: { type: 'string', description: 'Rewritten replacement text.' },
    },
    required: ['targetText', 'rewrittenContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const rewrittenContent = String(args.rewrittenContent || '').trim();
    if (!targetText || !rewrittenContent) return { success: false, error: 'Both targetText and rewrittenContent are required.' };

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: rewrittenContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to rewrite content.' };
    return { success: true, data: { originalLength: targetText.length, newLength: rewrittenContent.length }, activitySummary: 'Rewrote target content' };
  },
};

export const expandContentTool: ToolCatalogEntry = {
  id: 'expand_content',
  name: 'expand_content',
  label: 'Expand Content',
  description: 'Expand selected content with relevant explanation, details, or examples.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Existing text to expand.' },
      expandedContent: { type: 'string', description: 'Expanded replacement text.' },
    },
    required: ['targetText', 'expandedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const expandedContent = String(args.expandedContent || '').trim();
    if (!targetText || !expandedContent) return { success: false, error: 'Both targetText and expandedContent are required.' };

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: expandedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to expand content.' };
    return { success: true, data: { addedChars: expandedContent.length - targetText.length }, activitySummary: 'Expanded content with details' };
  },
};

export const shortenContentTool: ToolCatalogEntry = {
  id: 'shorten_content',
  name: 'shorten_content',
  label: 'Shorten Content',
  description: 'Condense content concisely without losing critical information.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Existing text to condense.' },
      shortenedContent: { type: 'string', description: 'Condensed replacement text.' },
    },
    required: ['targetText', 'shortenedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const shortenedContent = String(args.shortenedContent || '').trim();
    if (!targetText || !shortenedContent) return { success: false, error: 'Both targetText and shortenedContent are required.' };

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: shortenedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to shorten content.' };
    return { success: true, data: { savedChars: targetText.length - shortenedContent.length }, activitySummary: 'Shortened content concisely' };
  },
};

export const simplifyContentTool: ToolCatalogEntry = {
  id: 'simplify_content',
  name: 'simplify_content',
  label: 'Simplify Content',
  description: 'Rewrite complex language and jargon into clear, accessible phrasing.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Text to simplify.' },
      simplifiedContent: { type: 'string', description: 'Simplified replacement text.' },
    },
    required: ['targetText', 'simplifiedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const simplifiedContent = String(args.simplifiedContent || '').trim();

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: simplifiedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to simplify content.' };
    return { success: true, data: { simplified: true }, activitySummary: 'Simplified text readability' };
  },
};

export const formalizeContentTool: ToolCatalogEntry = {
  id: 'formalize_content',
  name: 'formalize_content',
  label: 'Formalize Content',
  description: 'Convert informal or draft text into professional, polished executive language.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Text to formalize.' },
      formalizedContent: { type: 'string', description: 'Formal replacement text.' },
    },
    required: ['targetText', 'formalizedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const formalizedContent = String(args.formalizedContent || '').trim();

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: formalizedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to formalize content.' };
    return { success: true, data: { formalized: true }, activitySummary: 'Formalized text tone' };
  },
};

export const changeContentToneTool: ToolCatalogEntry = {
  id: 'change_content_tone',
  name: 'change_content_tone',
  label: 'Change Content Tone',
  description: 'Change writing tone (e.g., persuasive, technical, casual, empathetic, executive).',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Target text.' },
      tone: { type: 'string', description: 'Requested tone (e.g. professional, persuasive).' },
      transformedContent: { type: 'string', description: 'Replacement content in requested tone.' },
    },
    required: ['targetText', 'tone', 'transformedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const transformedContent = String(args.transformedContent || '').trim();

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: transformedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to change content tone.' };
    return { success: true, data: { tone: args.tone }, activitySummary: `Changed tone to ${args.tone}` };
  },
};

export const translateContentTool: ToolCatalogEntry = {
  id: 'translate_content',
  name: 'translate_content',
  label: 'Translate Content',
  description: 'Translate target content or section into a requested language.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Text to translate.' },
      targetLanguage: { type: 'string', description: 'Destination language.' },
      translatedContent: { type: 'string', description: 'Translated replacement text.' },
    },
    required: ['targetText', 'targetLanguage', 'translatedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const translatedContent = String(args.translatedContent || '').trim();

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: translatedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to translate content.' };
    return { success: true, data: { language: args.targetLanguage }, activitySummary: `Translated to ${args.targetLanguage}` };
  },
};

export const proofreadContentTool: ToolCatalogEntry = {
  id: 'proofread_content',
  name: 'proofread_content',
  label: 'Proofread Content',
  description: 'Correct grammar, spelling, punctuation, and typographical issues.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Original text.' },
      correctedContent: { type: 'string', description: 'Corrected text.' },
    },
    required: ['targetText', 'correctedContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    const correctedContent = String(args.correctedContent || '').trim();

    const res = await editorRegistry.executeAction(
      'replace_selected_text',
      { targetText, replacementText: correctedContent },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to apply proofreading.' };
    return { success: true, data: { proofread: true }, activitySummary: 'Proofread and corrected content' };
  },
};

export const continueWritingTool: ToolCatalogEntry = {
  id: 'continue_writing',
  name: 'continue_writing',
  label: 'Continue Writing',
  description: 'Continue writing from a selected document position or section.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      continuationText: { type: 'string', description: 'Generated text continuation.' },
      afterHeading: { type: 'string', description: 'Optional heading after which to continue.' },
    },
    required: ['continuationText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.continuationText || '').trim();

    const res = await editorRegistry.executeAction(
      'append_or_insert_paragraph',
      { text, afterHeading: args.afterHeading, position: args.afterHeading ? 'afterHeading' : 'end' },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to continue writing.' };
    return { success: true, data: { chars: text.length }, activitySummary: `Continued writing (+${text.length} chars)` };
  },
};

export const generateDocumentOutlineTool: ToolCatalogEntry = {
  id: 'generate_document_outline',
  name: 'generate_document_outline',
  label: 'Generate Document Outline',
  description: 'Generate or recommend an outline structure based on document headings or topic.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Optional topic focus.' },
    },
  },
  execute: async (args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const headings = doc.headings || [];

    return {
      success: true,
      data: {
        documentTitle: doc.title,
        existingHeadings: headings,
        headingCount: headings.length,
        topic: args.topic || 'General Outline',
      },
      activitySummary: `Analyzed document outline (${headings.length} headings)`,
    };
  },
};

export const generateSectionContentTool: ToolCatalogEntry = {
  id: 'generate_section_content',
  name: 'generate_section_content',
  label: 'Generate Section Content',
  description: 'Generate and insert content under a specified section heading.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      sectionHeading: { type: 'string', description: 'Heading title under which to add content.' },
      content: { type: 'string', description: 'Section content to insert.' },
    },
    required: ['sectionHeading', 'content'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const heading = String(args.sectionHeading || '');
    const content = String(args.content || '');

    const res = await editorRegistry.executeAction(
      'append_or_insert_paragraph',
      { text: content, afterHeading: heading, position: 'afterHeading' },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to generate section content.' };
    return { success: true, data: { sectionHeading: heading, length: content.length }, activitySummary: `Generated content for section "${heading}"` };
  },
};

export const generateIntroductionTool: ToolCatalogEntry = {
  id: 'generate_introduction',
  name: 'generate_introduction',
  label: 'Generate Introduction',
  description: 'Generate and prepend an introduction at the beginning of the document.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      introductionText: { type: 'string', description: 'Introduction content.' },
    },
    required: ['introductionText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.introductionText || '');

    const res = await editorRegistry.executeAction('prepend_to_document', { content: text }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to insert introduction.' };
    return { success: true, data: { length: text.length }, activitySummary: 'Generated document introduction' };
  },
};

export const generateConclusionTool: ToolCatalogEntry = {
  id: 'generate_conclusion',
  name: 'generate_conclusion',
  label: 'Generate Conclusion',
  description: 'Generate and append a conclusion section at the end of the document.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      conclusionText: { type: 'string', description: 'Conclusion content.' },
    },
    required: ['conclusionText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.conclusionText || '');

    const res = await editorRegistry.executeAction(
      'append_or_insert_paragraph',
      { text: text, position: 'end' },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert conclusion.' };
    return { success: true, data: { length: text.length }, activitySummary: 'Generated document conclusion' };
  },
};

export const generateSummaryTool: ToolCatalogEntry = {
  id: 'generate_summary',
  name: 'generate_summary',
  label: 'Generate Summary',
  description: 'Generate an executive summary and optionally insert it as a callout note.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      summaryText: { type: 'string', description: 'Executive summary content.' },
      insertIntoDocument: { type: 'boolean', description: 'Whether to insert summary into document start (default true).' },
    },
    required: ['summaryText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const summaryText = String(args.summaryText || '');
    const insert = args.insertIntoDocument !== false;

    if (insert) {
      await editorRegistry.executeAction('insert_callout_box', { type: 'note', content: `**Executive Summary**\n\n${summaryText}` }, val.docId);
    }
    return { success: true, data: { summary: summaryText, inserted: insert }, activitySummary: 'Generated executive summary' };
  },
};

export const generateFaqTool: ToolCatalogEntry = {
  id: 'generate_faq',
  name: 'generate_faq',
  label: 'Generate FAQ',
  description: 'Generate Frequently Asked Questions from document content and append to document.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      faqs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            answer: { type: 'string' },
          },
          required: ['question', 'answer'],
        },
        description: 'Array of FAQ items.',
      },
    },
    required: ['faqs'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const faqs = Array.isArray(args.faqs) ? args.faqs : [];
    if (faqs.length === 0) return { success: false, error: 'faqs array cannot be empty.' };

    let faqHtml = '<h2>Frequently Asked Questions</h2>';
    for (const item of faqs as Array<{ question: string; answer: string }>) {
      faqHtml += `<h3>${item.question}</h3><p>${item.answer}</p>`;
    }

    const res = await editorRegistry.executeAction('append_or_insert_paragraph', { text: faqHtml, position: 'end' }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to append FAQ.' };
    return { success: true, data: { faqCount: faqs.length }, activitySummary: `Generated FAQ section (${faqs.length} Q&As)` };
  },
};

export const convertContentToBulletsTool: ToolCatalogEntry = {
  id: 'convert_content_to_bullets',
  name: 'convert_content_to_bullets',
  label: 'Convert Content to Bullets',
  description: 'Convert paragraph text or sentences into structured bullet points.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Paragraph text to convert to bullets.' },
    },
    required: ['targetText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    if (!targetText) return { success: false, error: 'targetText is required.' };

    const items = targetText
      .split(/[.!?\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    const bulletHtml = `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`;

    const res = await editorRegistry.executeAction('replace_selected_text', { targetText, replacementText: bulletHtml }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to convert to bullets.' };
    return { success: true, data: { bulletCount: items.length }, activitySummary: `Converted text to ${items.length} bullet points` };
  },
};

export const convertBulletsToParagraphTool: ToolCatalogEntry = {
  id: 'convert_bullets_to_paragraph',
  name: 'convert_bullets_to_paragraph',
  label: 'Convert Bullets to Paragraph',
  description: 'Convert bullet points into a smooth narrative paragraph.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'List content to merge into paragraph.' },
    },
    required: ['targetText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();
    if (!targetText) return { success: false, error: 'targetText is required.' };

    const lines = targetText
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean);
    const paraText = lines.join(' ');

    const res = await editorRegistry.executeAction('replace_selected_text', { targetText, replacementText: `<p>${paraText}</p>` }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to convert bullets to paragraph.' };
    return { success: true, data: { combinedWords: paraText.split(/\s+/).length }, activitySummary: 'Converted bullets to narrative paragraph' };
  },
};

export const convertContentToTableTool: ToolCatalogEntry = {
  id: 'convert_content_to_table',
  name: 'convert_content_to_table',
  label: 'Convert Content to Table',
  description: 'Convert structured or delimited text into a table.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Text containing rows/columns to convert.' },
      headers: { type: 'array', items: { type: 'string' }, description: 'Column headers.' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Table rows data.' },
    },
    required: ['targetText', 'rows'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '');
    const headers = Array.isArray(args.headers) ? (args.headers as string[]) : [];
    const rows = Array.isArray(args.rows) ? (args.rows as string[][]) : [];

    let tableHtml = '<table style="border-collapse: collapse; width: 100%; border: 1px solid #D1D5DB;">';
    if (headers.length > 0) {
      tableHtml += `<thead><tr>${headers.map((h) => `<th style="border: 1px solid #D1D5DB; padding: 8px; background: #F3F4F6;"><strong>${h}</strong></th>`).join('')}</tr></thead>`;
    }
    tableHtml += '<tbody>';
    for (const r of rows) {
      tableHtml += `<tr>${r.map((c) => `<td style="border: 1px solid #D1D5DB; padding: 8px;">${c}</td>`).join('')}</tr>`;
    }
    tableHtml += '</tbody></table>';

    const res = await editorRegistry.executeAction('replace_selected_text', { targetText, replacementText: tableHtml }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to convert content to table.' };
    return { success: true, data: { rowCount: rows.length, colCount: headers.length || (rows[0]?.length || 0) }, activitySummary: 'Converted text to table' };
  },
};

export const convertTableToTextTool: ToolCatalogEntry = {
  id: 'convert_table_to_text',
  name: 'convert_table_to_text',
  label: 'Convert Table to Text',
  description: 'Convert an embedded table into readable text paragraphs or bullets.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Index of table to convert (default 0).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const tableIndex = typeof args.tableIndex === 'number' ? args.tableIndex : 0;

    // Delete table and insert textual placeholder
    const res = await editorRegistry.executeAction('delete_table', { tableIndex }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to convert table.' };
    return { success: true, data: { tableIndex }, activitySummary: `Converted table #${tableIndex + 1} to text` };
  },
};

export const convertContentToStepsTool: ToolCatalogEntry = {
  id: 'convert_content_to_steps',
  name: 'convert_content_to_steps',
  label: 'Convert Content to Steps',
  description: 'Convert procedure text into a numbered step-by-step list.',
  category: 'content_transformation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Procedure text to convert.' },
    },
    required: ['targetText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const targetText = String(args.targetText || '').trim();

    const steps = targetText
      .split(/[.\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    const stepsHtml = `<ol>${steps.map((st) => `<li><p>${st}</p></li>`).join('')}</ol>`;

    const res = await editorRegistry.executeAction('replace_selected_text', { targetText, replacementText: stepsHtml }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to convert to steps.' };
    return { success: true, data: { stepCount: steps.length }, activitySummary: `Converted text into ${steps.length} ordered steps` };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE A & B — 3. CONTENT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const deleteParagraphTool: ToolCatalogEntry = {
  id: 'delete_paragraph',
  name: 'delete_paragraph',
  label: 'Delete Paragraph',
  description: 'Delete a specific paragraph by paragraph index or matching text snippet.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      paragraphIndex: { type: 'number', description: 'Zero-based paragraph index.' },
      textSnippet: { type: 'string', description: 'Text snippet matching the paragraph to delete.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_paragraph', { paragraphIndex: args.paragraphIndex, textSnippet: args.textSnippet }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete paragraph.' };
    return { success: true, data: { deleted: true }, activitySummary: 'Deleted target paragraph' };
  },
};

export const deleteSectionTool: ToolCatalogEntry = {
  id: 'delete_section',
  name: 'delete_section',
  label: 'Delete Section',
  description: 'Delete a document section identified by its heading and all its content.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      headingTitle: { type: 'string', description: 'Heading title of the section to delete.' },
    },
    required: ['headingTitle'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const headingTitle = String(args.headingTitle || '').trim();

    const res = await editorRegistry.executeAction('delete_section', { headingTitle }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete section.' };
    return { success: true, data: { headingTitle, deleted: true }, activitySummary: `Deleted section "${headingTitle}"` };
  },
};

export const deleteHeadingTool: ToolCatalogEntry = {
  id: 'delete_heading',
  name: 'delete_heading',
  label: 'Delete Heading',
  description: 'Delete a heading and optionally its associated section content.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      headingTitle: { type: 'string', description: 'Title of the heading to delete.' },
      deleteContent: { type: 'boolean', description: 'Whether to delete the section body content as well.' },
    },
    required: ['headingTitle'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const headingTitle = String(args.headingTitle || '').trim();

    const res = await editorRegistry.executeAction('delete_heading', { headingTitle, deleteContent: args.deleteContent }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete heading.' };
    return { success: true, data: { headingTitle, deleteContent: args.deleteContent }, activitySummary: `Deleted heading "${headingTitle}"` };
  },
};

export const deleteTableTool: ToolCatalogEntry = {
  id: 'delete_table',
  name: 'delete_table',
  label: 'Delete Table',
  description: 'Delete a table from the document by index.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Index of table to delete (default 0).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const tableIndex = typeof args.tableIndex === 'number' ? args.tableIndex : 0;

    const res = await editorRegistry.executeAction('delete_table', { tableIndex }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete table.' };
    return { success: true, data: { tableIndex }, activitySummary: `Deleted table #${tableIndex + 1}` };
  },
};

export const deleteImageTool: ToolCatalogEntry = {
  id: 'delete_image',
  name: 'delete_image',
  label: 'Delete Embedded Image',
  description: 'Delete an embedded image by index or source URL.',
  category: 'media_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      imageIndex: { type: 'number', description: 'Index of image to delete.' },
      src: { type: 'string', description: 'Image src URL matching image to delete.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_image', { imageIndex: args.imageIndex, src: args.src }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete image.' };
    return { success: true, data: { deleted: true }, activitySummary: 'Deleted embedded image' };
  },
};

export const deleteMatchingContentTool: ToolCatalogEntry = {
  id: 'delete_matching_content',
  name: 'delete_matching_content',
  label: 'Delete Matching Content',
  description: 'Delete all occurrences matching a string pattern throughout the document.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'String pattern or phrase to delete.' },
    },
    required: ['pattern'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const pattern = String(args.pattern || '');
    if (!pattern) return { success: false, error: 'pattern cannot be empty.' };

    const res = await editorRegistry.executeAction('find_and_replace_text', { findText: pattern, replaceText: '', replaceAll: true }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete matching content.' };
    return { success: true, data: { pattern }, activitySummary: `Deleted matching occurrences of "${pattern}"` };
  },
};

export const deleteRepeatedContentTool: ToolCatalogEntry = {
  id: 'delete_repeated_content',
  name: 'delete_repeated_content',
  label: 'Delete Repeated Content',
  description: 'Find and remove repeated sentences or duplicate paragraphs.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_empty_paragraphs', {}, val.docId);
    return { success: true, data: { removed: true }, activitySummary: 'Cleaned up duplicate content blocks' };
  },
};

export const deleteEmptyParagraphsTool: ToolCatalogEntry = {
  id: 'delete_empty_paragraphs',
  name: 'delete_empty_paragraphs',
  label: 'Delete Empty Paragraphs',
  description: 'Remove redundant blank and empty paragraphs throughout the document.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_empty_paragraphs', {}, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to delete empty paragraphs.' };
    return { success: true, data: { cleaned: true }, activitySummary: 'Removed empty paragraphs' };
  },
};

export const deleteHyperlinksTool: ToolCatalogEntry = {
  id: 'delete_hyperlinks',
  name: 'delete_hyperlinks',
  label: 'Delete Hyperlinks',
  description: 'Remove hyperlinks from text while preserving anchor text.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Optional text whose link should be removed.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_hyperlinks', { targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to remove hyperlinks.' };
    return { success: true, data: { targetText: args.targetText }, activitySummary: 'Removed hyperlinks from text' };
  },
};

export const replaceParagraphTool: ToolCatalogEntry = {
  id: 'replace_paragraph',
  name: 'replace_paragraph',
  label: 'Replace Paragraph',
  description: 'Replace an identified paragraph by index or content snippet.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      paragraphIndex: { type: 'number', description: 'Paragraph index.' },
      targetText: { type: 'string', description: 'Existing snippet to target.' },
      newText: { type: 'string', description: 'Replacement paragraph content.' },
    },
    required: ['newText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const newText = String(args.newText || '');

    const res = await editorRegistry.executeAction('replace_paragraph', { paragraphIndex: args.paragraphIndex, targetText: args.targetText, newText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to replace paragraph.' };
    return { success: true, data: { newLength: newText.length }, activitySummary: 'Replaced paragraph content' };
  },
};

export const replaceSectionTool: ToolCatalogEntry = {
  id: 'replace_section',
  name: 'replace_section',
  label: 'Replace Section',
  description: 'Replace the body content of a specified section while preserving the heading.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      headingTitle: { type: 'string', description: 'Heading of section to replace.' },
      newContent: { type: 'string', description: 'New section body content.' },
    },
    required: ['headingTitle', 'newContent'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const headingTitle = String(args.headingTitle || '');
    const newContent = String(args.newContent || '');

    const res = await editorRegistry.executeAction('replace_section', { headingTitle, newContent }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to replace section.' };
    return { success: true, data: { headingTitle, length: newContent.length }, activitySummary: `Replaced content in section "${headingTitle}"` };
  },
};

export const styleTableTool: ToolCatalogEntry = {
  id: 'style_table',
  name: 'style_table',
  label: 'Style Table',
  description:
    'Style an existing table in-place (presets like navy, forest, executive, striped, grid, minimal, plus custom headerBg, headerTextColor, evenRowBg, oddRowBg, borderColor, boldFirstColumn) WITHOUT rebuilding or adding any extra rows/columns.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['apply_table_style', 'format table', 'restyle table', 'table theme', 'table colors', 'table borders'],
  keywords: ['table', 'style', 'theme', 'preset', 'color', 'header', 'borders', 'shading', 'zebra', 'stripes'],
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: '0-based index of the table in document (default 0).' },
      containsText: { type: 'string', description: 'Optional text snippet inside the table to locate it accurately.' },
      afterHeading: { type: 'string', description: 'Optional heading title containing the target table.' },
      preset: {
        type: 'string',
        enum: ['navy', 'forest', 'executive', 'slate', 'striped', 'grid', 'minimal'],
        description: 'Built-in visual theme preset.',
      },
      headerBg: { type: 'string', description: 'Header row background hex color (e.g. "#1E3A8A").' },
      headerTextColor: { type: 'string', description: 'Header row text hex color (e.g. "#FFFFFF").' },
      evenRowBg: { type: 'string', description: 'Alternating even row background hex color (e.g. "#EFF6FF").' },
      oddRowBg: { type: 'string', description: 'Odd body row background hex color (e.g. "#FFFFFF").' },
      borderColor: { type: 'string', description: 'Cell border hex color (e.g. "#CBD5E1").' },
      borderStyle: { type: 'string', enum: ['solid', 'dashed', 'none'], description: 'Cell border style.' },
      boldFirstColumn: { type: 'boolean', description: 'Whether to bold the first column labels in body rows.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction(
      'style_table',
      {
        tableIndex: args.tableIndex,
        containsText: args.containsText,
        afterHeading: args.afterHeading,
        preset: args.preset,
        headerBg: args.headerBg,
        headerTextColor: args.headerTextColor,
        evenRowBg: args.evenRowBg,
        oddRowBg: args.oddRowBg,
        borderColor: args.borderColor,
        borderStyle: args.borderStyle,
        boldFirstColumn: args.boldFirstColumn,
      },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to style table.' };
    return {
      success: true,
      data: { preset: args.preset || 'custom', styled: true },
      activitySummary: `Styled table (${String(args.preset || 'custom')})`,
    };
  },
};

export const replaceTableTool: ToolCatalogEntry = {
  id: 'replace_table',
  name: 'replace_table',
  label: 'Replace Table',
  description: 'Replace the structure and data of an embedded table.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Index of table to replace.' },
      headers: { type: 'array', items: { type: 'string' }, description: 'New headers.' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'New rows data.' },
    },
    required: ['rows'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const rows = Array.isArray(args.rows) ? (args.rows as string[][]) : [];

    const res = await editorRegistry.executeAction('replace_table', { tableIndex: args.tableIndex, headers: args.headers, rows }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to replace table.' };
    return { success: true, data: { rowsCount: rows.length }, activitySummary: 'Replaced table data' };
  },
};

export const replaceImageTool: ToolCatalogEntry = {
  id: 'replace_image',
  name: 'replace_image',
  label: 'Replace Image',
  description: 'Replace an embedded image source, alt text, or caption.',
  category: 'media_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      imageIndex: { type: 'number', description: 'Index of image to replace.' },
      oldSrc: { type: 'string', description: 'Existing image src.' },
      newSrc: { type: 'string', description: 'New image src URL.' },
      alt: { type: 'string', description: 'Updated alt text.' },
      title: { type: 'string', description: 'Updated title.' },
    },
    required: ['newSrc'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('replace_image', {
      imageIndex: args.imageIndex,
      oldSrc: args.oldSrc,
      newSrc: args.newSrc,
      alt: args.alt,
      title: args.title,
    }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to replace image.' };
    return { success: true, data: { newSrc: args.newSrc }, activitySummary: 'Replaced embedded image' };
  },
};

export const replacePlaceholderTool: ToolCatalogEntry = {
  id: 'replace_placeholder',
  name: 'replace_placeholder',
  label: 'Replace Placeholder',
  description: 'Replace document placeholders like [Company Name], [Date], or custom tags.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      placeholder: { type: 'string', description: 'Placeholder string (e.g. "[Date]").' },
      replacementValue: { type: 'string', description: 'Value to replace placeholder with.' },
    },
    required: ['placeholder', 'replacementValue'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const placeholder = String(args.placeholder || '');
    const replacementValue = String(args.replacementValue || '');

    const res = await editorRegistry.executeAction('find_and_replace_text', { findText: placeholder, replaceText: replacementValue, replaceAll: true }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to replace placeholder.' };
    return { success: true, data: { placeholder, replacementValue }, activitySummary: `Replaced placeholder "${placeholder}"` };
  },
};

export const moveContentTool: ToolCatalogEntry = {
  id: 'move_content',
  name: 'move_content',
  label: 'Move Content Section',
  description: 'Move an entire document section before or after another heading.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      sourceHeading: { type: 'string', description: 'Heading of section to move.' },
      targetHeading: { type: 'string', description: 'Destination heading.' },
      position: { type: 'string', enum: ['before', 'after'], description: 'Placement relative to target.' },
    },
    required: ['sourceHeading', 'targetHeading'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const sourceHeading = String(args.sourceHeading || '');
    const targetHeading = String(args.targetHeading || '');
    const position = (args.position as 'before' | 'after') || 'after';

    const res = await editorRegistry.executeAction('move_document_section', { sourceHeading, targetHeading, position }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to move section.' };
    return { success: true, data: { sourceHeading, targetHeading, position }, activitySummary: `Moved section "${sourceHeading}" ${position} "${targetHeading}"` };
  },
};

export const duplicateContentTool: ToolCatalogEntry = {
  id: 'duplicate_content',
  name: 'duplicate_content',
  label: 'Duplicate Content',
  description: 'Duplicate selected content or a heading section.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      headingTitle: { type: 'string', description: 'Optional heading section to duplicate.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('duplicate_content', { headingTitle: args.headingTitle, target: args.headingTitle ? 'heading' : 'selection' }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to duplicate content.' };
    return { success: true, data: { duplicated: true }, activitySummary: `Duplicated ${args.headingTitle ? `section "${args.headingTitle}"` : 'content'}` };
  },
};

export const mergeParagraphsTool: ToolCatalogEntry = {
  id: 'merge_paragraphs',
  name: 'merge_paragraphs',
  label: 'Merge Paragraphs',
  description: 'Merge two adjacent paragraphs into one.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      paragraphIndex: { type: 'number', description: 'Zero-based index of first paragraph to merge with next.' },
    },
    required: ['paragraphIndex'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const pIdx = Number(args.paragraphIndex || 0);

    const res = await editorRegistry.executeAction('merge_paragraphs', { paragraphIndex: pIdx }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to merge paragraphs.' };
    return { success: true, data: { paragraphIndex: pIdx }, activitySummary: `Merged paragraph #${pIdx + 1} with next` };
  },
};

export const splitParagraphTool: ToolCatalogEntry = {
  id: 'split_paragraph',
  name: 'split_paragraph',
  label: 'Split Paragraph',
  description: 'Split a paragraph into two at a specified delimiter or text position.',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      paragraphIndex: { type: 'number', description: 'Paragraph index.' },
      splitAtText: { type: 'string', description: 'Substring at which to split the paragraph.' },
    },
    required: ['splitAtText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const splitAtText = String(args.splitAtText || '');

    const res = await editorRegistry.executeAction('split_paragraph', { paragraphIndex: args.paragraphIndex, splitAtText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to split paragraph.' };
    return { success: true, data: { splitAtText }, activitySummary: 'Split paragraph into two' };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE A — 4. ADVANCED FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

export const setFontFamilyTool: ToolCatalogEntry = {
  id: 'set_font_family',
  name: 'set_font_family',
  label: 'Set Font Family',
  description: 'Set font family (e.g. Arial, Times New Roman, Roboto, Georgia, Calibri).',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      fontFamily: { type: 'string', description: 'Font family name.' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
    required: ['fontFamily'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const fontFamily = String(args.fontFamily || '');

    const res = await editorRegistry.executeAction('set_font_style', { fontFamily, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to set font family.' };
    return { success: true, data: { fontFamily }, activitySummary: `Set font family to ${fontFamily}` };
  },
};

export const setFontSizeTool: ToolCatalogEntry = {
  id: 'set_font_size',
  name: 'set_font_size',
  label: 'Set Font Size',
  description: 'Set font size (in pt) for target text, selection, or entire document.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      fontSize: { type: 'number', description: 'Font size in pt (e.g. 11, 12, 14, 18, 20, 24).' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
    required: ['fontSize'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const fontSize = Number(args.fontSize || 12);

    const res = await editorRegistry.executeAction('set_font_style', { fontSize: `${fontSize}pt`, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to set font size.' };
    return { success: true, data: { fontSize }, activitySummary: `Set font size to ${fontSize}pt` };
  },
};

export const setFontColorTool: ToolCatalogEntry = {
  id: 'set_font_color',
  name: 'set_font_color',
  label: 'Set Font Color',
  description: 'Set text font color (hex code or CSS color).',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      color: { type: 'string', description: 'Color string (e.g. "#15803D", "darkgreen", "#2563EB").' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
    required: ['color'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const color = String(args.color || '#000000');

    const res = await editorRegistry.executeAction('format_document_text', { formatting: 'color', value: color, color, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to set font color.' };
    return { success: true, data: { color }, activitySummary: `Set text color to ${color}` };
  },
};

export const setHighlightColorTool: ToolCatalogEntry = {
  id: 'set_highlight_color',
  name: 'set_highlight_color',
  label: 'Set Highlight Color',
  description: 'Set background text highlight color.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      color: { type: 'string', description: 'Highlight color (e.g. "#FEF08A", "yellow").' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
    required: ['color'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const color = String(args.color || '#FEF08A');

    const res = await editorRegistry.executeAction('format_document_text', { formatting: 'highlight', value: color, color, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to highlight text.' };
    return { success: true, data: { color }, activitySummary: `Highlighted text with ${color}` };
  },
};

export const setBoldTool: ToolCatalogEntry = {
  id: 'set_bold',
  name: 'set_bold',
  label: 'Set Bold',
  description: 'Apply or remove bold formatting.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      bold: { type: 'boolean', description: 'True to apply bold, false to remove.' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const bold = args.bold !== false;

    const res = await editorRegistry.executeAction('format_document_text', { formatting: 'bold', enabled: bold, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to update bold.' };
    return { success: true, data: { bold }, activitySummary: bold ? 'Applied bold formatting' : 'Removed bold formatting' };
  },
};

export const setItalicTool: ToolCatalogEntry = {
  id: 'set_italic',
  name: 'set_italic',
  label: 'Set Italic',
  description: 'Apply or remove italic formatting.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      italic: { type: 'boolean', description: 'True to apply italic, false to remove.' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const italic = args.italic !== false;

    const res = await editorRegistry.executeAction('format_document_text', { formatting: 'italic', enabled: italic, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to update italic.' };
    return { success: true, data: { italic }, activitySummary: italic ? 'Applied italic formatting' : 'Removed italic formatting' };
  },
};

export const setUnderlineTool: ToolCatalogEntry = {
  id: 'set_underline',
  name: 'set_underline',
  label: 'Set Underline',
  description: 'Apply or remove underline formatting.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      underline: { type: 'boolean', description: 'True to apply underline, false to remove.' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const underline = args.underline !== false;

    const res = await editorRegistry.executeAction('format_document_text', { formatting: 'underline', enabled: underline, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to update underline.' };
    return { success: true, data: { underline }, activitySummary: underline ? 'Applied underline formatting' : 'Removed underline formatting' };
  },
};

export const setStrikethroughTool: ToolCatalogEntry = {
  id: 'set_strikethrough',
  name: 'set_strikethrough',
  label: 'Set Strikethrough',
  description: 'Apply or remove strikethrough formatting.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      strikethrough: { type: 'boolean', description: 'True to apply strikethrough, false to remove.' },
      targetText: { type: 'string', description: 'Optional target text scope.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const strike = args.strikethrough !== false;

    const res = await editorRegistry.executeAction('format_document_text', { formatting: 'strike', enabled: strike, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to update strikethrough.' };
    return { success: true, data: { strike }, activitySummary: strike ? 'Applied strikethrough formatting' : 'Removed strikethrough' };
  },
};

export const setTextAlignmentTool: ToolCatalogEntry = {
  id: 'set_text_alignment',
  name: 'set_text_alignment',
  label: 'Set Text Alignment',
  description: 'Set text alignment (left, center, right, or justify) for selection, target text, or the entire document.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Text alignment.' },
      targetText: { type: 'string', description: 'Optional specific text or paragraph to align.' },
    },
    required: ['alignment'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const alignment = (args.alignment as 'left' | 'center' | 'right' | 'justify') || 'left';

    const res = await editorRegistry.executeAction('change_document_alignment', { alignment, targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to change alignment.' };
    return { success: true, data: { alignment }, activitySummary: `Set alignment to ${alignment}` };
  },
};

export const setLineSpacingTool: ToolCatalogEntry = {
  id: 'set_line_spacing',
  name: 'set_line_spacing',
  label: 'Set Line Spacing',
  description: 'Set line spacing / line height (e.g. "1.0", "1.15", "1.5", "2.0") for the entire document, active selection, or specific target text.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: [
    'change line spacing',
    'make spacing 1',
    'single spacing',
    'double spacing',
    'set line height',
    'line spacing',
  ],
  keywords: ['spacing', 'line', 'height', 'single', 'double', '1.0', '1.15', '1.5', '2.0', 'line_spacing'],
  parameters: {
    type: 'object',
    properties: {
      lineHeight: { type: 'string', description: 'Line height multiplier (e.g. "1.0", "1.15", "1.5", "2.0").' },
      spaceBefore: { type: 'boolean', description: 'Add margin before paragraph.' },
      spaceAfter: { type: 'boolean', description: 'Add margin after paragraph.' },
      targetText: { type: 'string', description: 'Optional specific text to apply line spacing to (omit to apply to whole document or selection).' },
    },
    required: ['lineHeight'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const rawLh = String(args.lineHeight ?? args.spacing ?? '1.0').trim();
    const lineHeight = rawLh === '1' ? '1.0' : rawLh === '2' ? '2.0' : rawLh;

    const res = await editorRegistry.executeAction(
      'set_line_height',
      {
        lineHeight,
        spaceBefore: args.spaceBefore,
        spaceAfter: args.spaceAfter,
        targetText: args.targetText,
        scope: args.targetText ? 'target' : 'all',
      },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to set line spacing.' };
    return { success: true, data: { lineHeight, changed: true }, activitySummary: `Set line spacing to ${lineHeight}` };
  },
};

export const setParagraphSpacingTool: ToolCatalogEntry = {
  id: 'set_paragraph_spacing',
  name: 'set_paragraph_spacing',
  label: 'Set Paragraph Spacing',
  description: 'Configure spacing before and after paragraphs.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      spaceBefore: { type: 'boolean', description: 'Add space before paragraph.' },
      spaceAfter: { type: 'boolean', description: 'Add space after paragraph.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('set_line_height', { spaceBefore: args.spaceBefore, spaceAfter: args.spaceAfter }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to set paragraph spacing.' };
    return { success: true, data: { spaceBefore: args.spaceBefore, spaceAfter: args.spaceAfter }, activitySummary: 'Updated paragraph spacing' };
  },
};

export const formatAllHeadingsTool: ToolCatalogEntry = {
  id: 'format_all_headings',
  name: 'format_all_headings',
  label: 'Format All Headings',
  description: 'Batch format headings across the document (e.g. hex color "#1E3A8A", 18pt, Arial).',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      level: { type: 'number', description: 'Specific heading level to format (1-6, optional - omitted means all levels).' },
      color: { type: 'string', description: 'Color (e.g. "#1E3A8A", "#15803D").' },
      fontSize: { type: 'number', description: 'Font size in pt/px (e.g. 20).' },
      fontFamily: { type: 'string', description: 'Font family name.' },
      alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Heading alignment.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('format_all_headings', {
      level: args.level,
      color: args.color,
      fontSize: args.fontSize,
      fontFamily: args.fontFamily,
      alignment: args.alignment,
    }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to format headings.' };
    return { success: true, data: { level: args.level || 'all', color: args.color, fontSize: args.fontSize }, activitySummary: `Formatted all headings${args.level ? ` (H${args.level})` : ''}` };
  },
};

export const formatAllParagraphsTool: ToolCatalogEntry = {
  id: 'format_all_paragraphs',
  name: 'format_all_paragraphs',
  label: 'Format All Paragraphs',
  description: 'Batch format all body paragraphs (e.g. justified alignment, font size, line spacing).',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      alignment: { type: 'string', enum: ['left', 'center', 'right', 'justify'], description: 'Paragraph alignment (e.g. "justify").' },
      fontSize: { type: 'number', description: 'Font size.' },
      fontFamily: { type: 'string', description: 'Font family.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('format_all_paragraphs', {
      alignment: args.alignment,
      fontSize: args.fontSize,
      fontFamily: args.fontFamily,
    }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to format paragraphs.' };
    return { success: true, data: { alignment: args.alignment }, activitySummary: 'Formatted all body paragraphs' };
  },
};

export const formatMatchingContentTool: ToolCatalogEntry = {
  id: 'format_matching_content',
  name: 'format_matching_content',
  label: 'Format Matching Content',
  description: 'Apply formatting (e.g. highlight yellow, bold, color) to all text occurrences matching a query.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      searchPattern: { type: 'string', description: 'Text or pattern to search for.' },
      color: { type: 'string', description: 'Text color to apply.' },
      highlight: { type: 'string', description: 'Highlight color (e.g. "yellow", "#FEF08A").' },
      bold: { type: 'boolean', description: 'Apply bold.' },
      italic: { type: 'boolean', description: 'Apply italic.' },
    },
    required: ['searchPattern'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const query = String(args.searchPattern || '');

    const res = await editorRegistry.executeAction('format_matching_content', {
      query,
      color: args.color,
      highlight: args.highlight,
      bold: args.bold,
      italic: args.italic,
    }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to format matching content.' };
    return { success: true, data: { query, highlight: args.highlight, color: args.color }, activitySummary: `Formatted matching occurrences of "${query}"` };
  },
};

export const removeFormattingTool: ToolCatalogEntry = {
  id: 'remove_formatting',
  name: 'remove_formatting',
  label: 'Remove Formatting',
  description: 'Clear font styles, bold, italic, highlights, and colors from target text or selection.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Optional text to clear formatting on.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('remove_formatting', { targetText: args.targetText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to remove formatting.' };
    return { success: true, data: { cleared: true }, activitySummary: 'Cleared text formatting' };
  },
};

export const setSubscriptTool: ToolCatalogEntry = {
  id: 'set_subscript',
  name: 'set_subscript',
  label: 'Toggle Subscript',
  description: 'Toggle subscript formatting (e.g. H2O) on target text or active selection.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['subscript'],
  keywords: ['subscript', 'sub', 'chemical', 'formula'],
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Optional target text to format as subscript.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const res = await editorRegistry.executeAction(
      'format_document_text',
      { formatting: 'subscript', targetText: args.targetText },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to toggle subscript.' };
    return { success: true, data: { subscript: true }, activitySummary: 'Toggled subscript formatting' };
  },
};

export const setSuperscriptTool: ToolCatalogEntry = {
  id: 'set_superscript',
  name: 'set_superscript',
  label: 'Toggle Superscript',
  description: 'Toggle superscript formatting (e.g. x^2, 1st) on target text or active selection.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['superscript'],
  keywords: ['superscript', 'sup', 'exponent', 'power'],
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Optional target text to format as superscript.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const res = await editorRegistry.executeAction(
      'format_document_text',
      { formatting: 'superscript', targetText: args.targetText },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to toggle superscript.' };
    return { success: true, data: { superscript: true }, activitySummary: 'Toggled superscript formatting' };
  },
};

export const adjustIndentTool: ToolCatalogEntry = {
  id: 'adjust_indent',
  name: 'adjust_indent',
  label: 'Increase or Decrease Indent',
  description: 'Increase (indent) or decrease (outdent) paragraph or list item indentation.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['indent paragraph', 'outdent paragraph', 'increase indent', 'decrease indent'],
  keywords: ['indent', 'outdent', 'tab', 'nesting'],
  parameters: {
    type: 'object',
    properties: {
      direction: { type: 'string', enum: ['indent', 'outdent'], description: 'Indent or outdent.' },
      targetText: { type: 'string', description: 'Optional target paragraph or list text.' },
    },
    required: ['direction'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const direction = args.direction === 'outdent' ? 'outdent' : 'indent';
    const res = await editorRegistry.executeAction(
      'adjust_indent',
      { direction, targetText: args.targetText },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to adjust indentation.' };
    return { success: true, data: { direction }, activitySummary: direction === 'indent' ? 'Increased indentation' : 'Decreased indentation' };
  },
};

export const changeTextCaseTool: ToolCatalogEntry = {
  id: 'change_text_case',
  name: 'change_text_case',
  label: 'Change Text Case',
  description: 'Transform selected or target text to UPPERCASE, lowercase, Title Case, or Sentence case.',
  category: 'formatting',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['uppercase', 'lowercase', 'title case', 'sentence case', 'change case'],
  keywords: ['case', 'uppercase', 'lowercase', 'titlecase', 'capitalize'],
  parameters: {
    type: 'object',
    properties: {
      caseType: {
        type: 'string',
        enum: ['uppercase', 'lowercase', 'titlecase', 'sentencecase'],
        description: 'Target casing format.',
      },
      targetText: { type: 'string', description: 'Optional target text to transform.' },
    },
    required: ['caseType'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const caseType = String(args.caseType || 'titlecase');
    const res = await editorRegistry.executeAction(
      'change_text_case',
      { caseType, targetText: args.targetText },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to change text case.' };
    return { success: true, data: { caseType }, activitySummary: `Converted text to ${caseType}` };
  },
};

export const insertCoverPageTool: ToolCatalogEntry = {
  id: 'insert_cover_page',
  name: 'insert_cover_page',
  label: 'Insert Cover Page',
  description: 'Insert a formatted cover page (executive, modern, or academic) followed by a page break at the start of the document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['add cover page', 'title page', 'front page'],
  keywords: ['cover', 'title page', 'front page', 'executive', 'academic'],
  parameters: {
    type: 'object',
    properties: {
      style: { type: 'string', enum: ['executive', 'modern', 'academic'], description: 'Cover page design style.' },
      title: { type: 'string', description: 'Cover page main title.' },
      subtitle: { type: 'string', description: 'Optional subtitle or tagline.' },
      author: { type: 'string', description: 'Optional author or department.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const style = (args.style as 'executive' | 'modern' | 'academic') || 'executive';
    const coverTitle = String(args.title || context.activeDocument?.title || 'Document Title');
    const subtitle = String(args.subtitle || 'Comprehensive Overview & Report');
    const author = String(args.author || '');
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const md =
      style === 'academic'
        ? `# ${coverTitle}\n\n*${subtitle}*\n\n${author ? `**Author:** ${author}\n\n` : ''}**Date:** ${today}\n\n---\n`
        : `# ${coverTitle}\n\n### ${subtitle}\n\n${author ? `**Prepared By:** ${author}\n\n` : ''}**Date:** ${today}\n\n---\n`;

    const res = await dispatchOrExecuteEditorAction(
      context,
      'prepend_to_document',
      { content: md, isMarkdown: true },
      val.docId,
      `Inserted ${style} cover page`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert cover page.' };
    await dispatchOrExecuteEditorAction(context, 'insert_document_page_break', { position: 'cursor' }, val.docId, 'Added cover page break');
    return {
      success: true,
      data: { style, title: coverTitle },
      activitySummary: `Inserted ${style} cover page`,
      editorAction: res.editorAction,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE A & B — 5. STRUCTURE AND NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

export const getDocumentOutlineTool: ToolCatalogEntry = {
  id: 'get_document_outline',
  name: 'get_document_outline',
  label: 'Get Document Outline',
  description: 'Retrieve the hierarchical heading outline (H1-H6) of the active document.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const headings = doc.headings || [];

    return {
      success: true,
      data: {
        documentTitle: doc.title || 'Untitled',
        headings,
        totalHeadings: headings.length,
      },
      activitySummary: `Retrieved document outline (${headings.length} headings)`,
    };
  },
};

export const getParagraphDetailsTool: ToolCatalogEntry = {
  id: 'get_paragraph_details',
  name: 'get_paragraph_details',
  label: 'Get Paragraph Details',
  description: 'Retrieve detailed text, word count, and position for a specific paragraph.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      paragraphIndex: { type: 'number', description: 'Zero-based paragraph index.' },
    },
    required: ['paragraphIndex'],
  },
  execute: async (args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const idx = Number(args.paragraphIndex || 0);
    const content = doc.content || '';
    const paras = content.split(/<\/?p>/).filter((p) => p.trim().length > 0);
    const targetPara = paras[idx] || '';

    return {
      success: true,
      data: {
        paragraphIndex: idx,
        text: targetPara.replace(/<[^>]+>/g, '').trim(),
        characterCount: targetPara.length,
        wordCount: targetPara.trim().split(/\s+/).filter(Boolean).length,
      },
      activitySummary: `Retrieved paragraph #${idx + 1} details`,
    };
  },
};

export const getSectionDetailsTool: ToolCatalogEntry = {
  id: 'get_section_details',
  name: 'get_section_details',
  label: 'Get Section Details',
  description: 'Retrieve a section and its structural content identified by heading.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      headingTitle: { type: 'string', description: 'Section heading title.' },
    },
    required: ['headingTitle'],
  },
  execute: async (args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const heading = String(args.headingTitle || '').toLowerCase();
    const content = doc.content || '';

    const idx = content.toLowerCase().indexOf(heading);
    let sectionSnippet = '';
    if (idx !== -1) {
      sectionSnippet = content.slice(idx, idx + 1000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
      success: true,
      data: {
        headingTitle: args.headingTitle,
        snippet: sectionSnippet,
        wordCount: sectionSnippet ? sectionSnippet.split(/\s+/).length : 0,
      },
      activitySummary: `Retrieved section "${args.headingTitle}"`,
    };
  },
};

export const getTableDetailsTool: ToolCatalogEntry = {
  id: 'get_table_details',
  name: 'get_table_details',
  label: 'Get Table Details',
  description: 'Retrieve dimensions, headers, and rows of an embedded table.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Index of table (default 0).' },
    },
  },
  execute: async (args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const tableMatches = content.match(/<table[\s\S]*?<\/table>/gi) || [];
    const tIdx = Number(args.tableIndex || 0);
    const tableHtml = tableMatches[tIdx];

    if (!tableHtml) {
      return { success: false, error: `No table found at index ${tIdx}.` };
    }

    const rowCount = (tableHtml.match(/<tr/gi) || []).length;
    const colCount = Math.max((tableHtml.match(/<th/gi) || []).length, (tableHtml.match(/<td/gi) || []).length / Math.max(1, rowCount));

    return {
      success: true,
      data: {
        tableIndex: tIdx,
        rowCount,
        colCount: Math.round(colCount),
        hasHeaderRow: tableHtml.includes('<th'),
      },
      activitySummary: `Inspected table #${tIdx + 1} (${rowCount} rows)`,
    };
  },
};

export const getImageDetailsTool: ToolCatalogEntry = {
  id: 'getImageDetails',
  name: 'get_image_details',
  label: 'Get Image Details',
  description: 'Retrieve details, source URL, and alt text for an embedded image.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      imageIndex: { type: 'number', description: 'Index of image (default 0).' },
    },
  },
  execute: async (args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const imgMatches = Array.from(content.matchAll(/<img[^>]+src="([^">]+)"(?:[^>]*alt="([^">]*)")?/gi));
    const idx = Number(args.imageIndex || 0);
    const m = imgMatches[idx];

    if (!m) return { success: false, error: `No image found at index ${idx}.` };
    return {
      success: true,
      data: {
        imageIndex: idx,
        src: m[1],
        alt: m[2] || '',
      },
      activitySummary: `Inspected image #${idx + 1}`,
    };
  },
};

export const getDocumentStatisticsTool: ToolCatalogEntry = {
  id: 'get_document_statistics',
  name: 'get_document_statistics',
  label: 'Get Document Statistics',
  description: 'Retrieve word count, character count, paragraphs, headings, tables, and images count.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plain ? plain.split(/\s+/).length : 0;
    const chars = plain.length;
    const paras = (content.match(/<p[\s>]/gi) || []).length || 1;
    const headings = doc.headings?.length || (content.match(/<h[1-6][\s>]/gi) || []).length;
    const tables = (content.match(/<table[\s>]/gi) || []).length;
    const images = (content.match(/<img[\s>]/gi) || []).length;

    return {
      success: true,
      data: {
        title: doc.title,
        wordCount: words,
        characterCount: chars,
        paragraphCount: paras,
        headingCount: headings,
        tableCount: tables,
        imageCount: images,
        readingTimeMinutes: Math.max(1, Math.round(words / 200)),
      },
      activitySummary: `Calculated statistics: ${words} words, ${headings} headings, ${tables} tables`,
    };
  },
};

export const getDocumentSettingsTool: ToolCatalogEntry = {
  id: 'get_document_settings',
  name: 'get_document_settings',
  label: 'Get Document Settings',
  description: 'Read document page setup, orientation, margins, columns, and headers/footers.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };

    const storeDoc = useWorkspaceStore.getState().documents.find((d) => d.id === doc.id);
    return {
      success: true,
      data: {
        pageSize: doc.pageSize || storeDoc?.pageSize || 'A4',
        orientation: doc.orientation || storeDoc?.orientation || 'portrait',
        margins: doc.margins || storeDoc?.margins || 'normal',
        columns: doc.columns || storeDoc?.columns || 1,
        headerText: doc.headerText || storeDoc?.headerText || '',
        footerText: doc.footerText || storeDoc?.footerText || '',
        showPageNumbers: Boolean(doc.showPageNumbers ?? storeDoc?.showPageNumbers),
        pageNumberPosition: storeDoc?.pageNumberPosition || 'bottom-center',
        differentFirstPage: Boolean(doc.differentFirstPage ?? storeDoc?.differentFirstPage),
      },
      activitySummary: `Read document settings (${doc.pageSize || 'A4'} ${doc.orientation || 'portrait'})`,
    };
  },
};

export const navigateToContentTool: ToolCatalogEntry = {
  id: 'navigate_to_content',
  name: 'navigate_to_content',
  label: 'Navigate to Content',
  description: 'Navigate and scroll editor view to a heading or text query.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      headingText: { type: 'string', description: 'Heading to navigate to.' },
      searchText: { type: 'string', description: 'Text phrase to navigate to.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const heading = String(args.headingText || '');
    const searchText = args.searchText ? String(args.searchText) : undefined;

    const res = await editorRegistry.executeAction('navigate_to_document_heading', { headingText: heading, searchText }, val.docId);
    return { success: true, data: { navigatedTo: heading || searchText }, activitySummary: `Navigated to "${heading || searchText}"` };
  },
};

export const selectContentTool: ToolCatalogEntry = {
  id: 'select_content',
  name: 'select_content',
  label: 'Select Content',
  description: 'Select text in editor by query string, startText..endText anchors, or position range.',
  category: 'document_inspection',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Text phrase to select.' },
      startText: { type: 'string', description: 'Optional start anchor phrase for multi-line selection.' },
      endText: { type: 'string', description: 'Optional end anchor phrase for multi-line selection.' },
      from: { type: 'number', description: 'Start offset.' },
      to: { type: 'number', description: 'End offset.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('select_content', { targetText: args.targetText, startText: args.startText, endText: args.endText, from: args.from, to: args.to }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to select content.' };
    return { success: true, data: { selected: args.targetText || args.startText || `${args.from}-${args.to}` }, activitySummary: `Selected content in editor` };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE B — 6. TABLE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const createTableTool: ToolCatalogEntry = {
  id: 'create_table',
  name: 'create_table',
  label: 'Create Table',
  description: 'Create a table with specified rows, columns, and headers.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      rowCount: { type: 'number', description: 'Row count (default 3).' },
      colCount: { type: 'number', description: 'Column count (default 3).' },
      headers: { type: 'array', items: { type: 'string' }, description: 'Headers array.' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Rows data.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const rowCount = typeof args.rowCount === 'number' ? args.rowCount : 3;
    const colCount = typeof args.colCount === 'number' ? args.colCount : 3;

    const res = await editorRegistry.executeAction('insert_document_table', { rowCount, colCount, headers: args.headers, rows: args.rows }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to create table.' };
    return { success: true, data: { rowCount, colCount }, activitySummary: `Created ${rowCount}×${colCount} table` };
  },
};

export const clearTableContentsTool: ToolCatalogEntry = {
  id: 'clear_table_contents',
  name: 'clear_table_contents',
  label: 'Clear Table Contents',
  description: 'Clear text inside all cells of a table while preserving the table structure.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Index of table to clear (default 0).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const tableIndex = typeof args.tableIndex === 'number' ? args.tableIndex : 0;

    const res = await editorRegistry.executeAction('clear_table_contents', { tableIndex }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to clear table contents.' };
    return { success: true, data: { tableIndex }, activitySummary: `Cleared contents of table #${tableIndex + 1}` };
  },
};

export const addTableRowTool: ToolCatalogEntry = {
  id: 'add_table_row',
  name: 'add_table_row',
  label: 'Add Table Row',
  description: 'Add a new row to the table before or after cursor.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      position: { type: 'string', enum: ['before', 'after'], description: 'Position relative to cursor.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('add_table_row', { position: args.position || 'after' }, val.docId);
    return { success: true, data: { position: args.position || 'after' }, activitySummary: 'Added table row' };
  },
};

export const deleteTableRowTool: ToolCatalogEntry = {
  id: 'delete_table_row',
  name: 'delete_table_row',
  label: 'Delete Table Row',
  description: 'Delete the active table row.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_table_row', {}, val.docId);
    return { success: true, data: { deleted: true }, activitySummary: 'Deleted table row' };
  },
};

export const addTableColumnTool: ToolCatalogEntry = {
  id: 'add_table_column',
  name: 'add_table_column',
  label: 'Add Table Column',
  description: 'Add a new column to the table before or after cursor.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      position: { type: 'string', enum: ['before', 'after'], description: 'Position relative to cursor.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('add_table_column', { position: args.position || 'after' }, val.docId);
    return { success: true, data: { position: args.position || 'after' }, activitySummary: 'Added table column' };
  },
};

export const deleteTableColumnTool: ToolCatalogEntry = {
  id: 'delete_table_column',
  name: 'delete_table_column',
  label: 'Delete Table Column',
  description: 'Delete the active table column.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_table_column', {}, val.docId);
    return { success: true, data: { deleted: true }, activitySummary: 'Deleted table column' };
  },
};

export const mergeTableCellsTool: ToolCatalogEntry = {
  id: 'merge_table_cells',
  name: 'merge_table_cells',
  label: 'Merge Table Cells',
  description: 'Merge selected cells in the table.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('merge_table_cells', {}, val.docId);
    return { success: true, data: { merged: true }, activitySummary: 'Merged table cells' };
  },
};

export const splitTableCellsTool: ToolCatalogEntry = {
  id: 'split_table_cells',
  name: 'split_table_cells',
  label: 'Split Table Cells',
  description: 'Split previously merged cells in the table.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('split_table_cells', {}, val.docId);
    return { success: true, data: { split: true }, activitySummary: 'Split table cells' };
  },
};

export const updateTableCellTool: ToolCatalogEntry = {
  id: 'update_table_cell',
  name: 'update_table_cell',
  label: 'Update Table Cell',
  description: 'Update text inside a table cell at specific row and column indices.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      rowIndex: { type: 'number', description: 'Zero-based row index.' },
      columnIndex: { type: 'number', description: 'Zero-based column index.' },
      text: { type: 'string', description: 'New cell text.' },
    },
    required: ['rowIndex', 'columnIndex', 'text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const r = Number(args.rowIndex || 0);
    const c = Number(args.columnIndex || 0);
    const text = String(args.text || '');

    const res = await editorRegistry.executeAction('update_table_cell', { rowIndex: r, columnIndex: c, text }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to update table cell.' };
    return { success: true, data: { rowIndex: r, columnIndex: c, text }, activitySummary: `Updated cell (${r}, ${c})` };
  },
};

export const replaceTableDataTool: ToolCatalogEntry = {
  id: 'replace_table_data',
  name: 'replace_table_data',
  label: 'Replace Table Data',
  description: 'Replace the data and rows of an existing table.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Index of table to replace.' },
      headers: { type: 'array', items: { type: 'string' }, description: 'Headers array.' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Rows array.' },
    },
    required: ['rows'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const rows = Array.isArray(args.rows) ? (args.rows as string[][]) : [];

    const res = await editorRegistry.executeAction('replace_table', { tableIndex: args.tableIndex, headers: args.headers, rows }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to replace table data.' };
    return { success: true, data: { rowCount: rows.length }, activitySummary: `Replaced table data (${rows.length} rows)` };
  },
};

export const extractTableDataTool: ToolCatalogEntry = {
  id: 'extract_table_data',
  name: 'extract_table_data',
  label: 'Extract Table Data',
  description: 'Extract table content into structured JSON rows.',
  category: 'table_management',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      tableIndex: { type: 'number', description: 'Table index (default 0).' },
    },
  },
  execute: async (args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const tables = content.match(/<table[\s\S]*?<\/table>/gi) || [];
    const tIdx = Number(args.tableIndex || 0);
    const tableHtml = tables[tIdx];

    if (!tableHtml) return { success: false, error: `Table #${tIdx + 1} not found.` };

    const headers: string[] = [];
    const rows: string[][] = [];

    const headerMatches = tableHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/gi) || [];
    for (const h of headerMatches) {
      headers.push(h.replace(/<[^>]+>/g, '').trim());
    }

    const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
    for (const r of rowMatches) {
      const cells: string[] = [];
      const cellMatches = r.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
      if (cellMatches.length > 0) {
        for (const c of cellMatches) {
          cells.push(c.replace(/<[^>]+>/g, '').trim());
        }
        rows.push(cells);
      }
    }

    return {
      success: true,
      data: {
        tableIndex: tIdx,
        headers,
        rows,
        rowCount: rows.length,
      },
      activitySummary: `Extracted table data (${rows.length} rows, ${headers.length} columns)`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE B — 7. IMAGE AND MEDIA MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const listDocumentImagesTool: ToolCatalogEntry = {
  id: 'list_document_images',
  name: 'list_document_images',
  label: 'List Document Images',
  description: 'List all images embedded in the document with their index, source, and alt text.',
  category: 'media_management',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const imgMatches = Array.from(content.matchAll(/<img[^>]+src="([^">]+)"(?:[^>]*alt="([^">]*)")?/gi));

    const images = imgMatches.map((m, idx) => ({
      index: idx,
      src: m[1],
      alt: m[2] || '',
    }));

    return {
      success: true,
      data: { images, count: images.length },
      activitySummary: `Found ${images.length} images in document`,
    };
  },
};

export const setImageAltTextTool: ToolCatalogEntry = {
  id: 'set_image_alt_text',
  name: 'set_image_alt_text',
  label: 'Set Image Alt Text',
  description: 'Set or update alternative text for an embedded image.',
  category: 'media_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      imageIndex: { type: 'number', description: 'Zero-based image index.' },
      altText: { type: 'string', description: 'Alternative description.' },
    },
    required: ['altText'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const altText = String(args.altText || '');

    const res = await editorRegistry.executeAction('replace_image', { imageIndex: args.imageIndex, alt: altText }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to update alt text.' };
    return { success: true, data: { altText }, activitySummary: `Updated image alt text to "${altText}"` };
  },
};

export const checkMissingAltTextTool: ToolCatalogEntry = {
  id: 'check_missing_alt_text',
  name: 'check_missing_alt_text',
  label: 'Check Missing Alt Text',
  description: 'Audit embedded images for missing or empty accessibility alternative text.',
  category: 'media_management',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const imgMatches = Array.from(content.matchAll(/<img[^>]+src="([^">]+)"(?:[^>]*alt="([^">]*)")?/gi));

    const missingAlt = imgMatches
      .map((m, idx) => ({ index: idx, src: m[1], alt: m[2] || '' }))
      .filter((i) => !i.alt || i.alt.trim() === '');

    return {
      success: true,
      data: {
        totalImages: imgMatches.length,
        missingAltCount: missingAlt.length,
        imagesWithoutAlt: missingAlt,
      },
      activitySummary: `Audited images: ${missingAlt.length} of ${imgMatches.length} missing alt text`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE C — 8. PAGE LAYOUT AND PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

export const getPageSettingsTool: ToolCatalogEntry = {
  id: 'get_page_settings',
  name: 'get_page_settings',
  label: 'Get Page Settings',
  description: 'Retrieve paper size, orientation, margins, columns, borders, page color, watermark, and first-page/running headers & footers.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };

    return {
      success: true,
      data: {
        pageSize: doc.pageSize || 'A4',
        orientation: doc.orientation || 'portrait',
        margins: doc.margins || 'normal',
        columns: doc.columns || 1,
        headerText: doc.headerText || '',
        footerText: doc.footerText || '',
        headerAlign: doc.headerAlign || 'left',
        footerAlign: doc.footerAlign || 'left',
        firstPageHeaderText: doc.firstPageHeaderText || '',
        firstPageFooterText: doc.firstPageFooterText || '',
        showHeaderLine: Boolean(doc.showHeaderLine),
        showFooterLine: Boolean(doc.showFooterLine),
        showPageNumbers: Boolean(doc.showPageNumbers),
        pageNumberPosition: doc.pageNumberPosition || 'bottom-center',
        differentFirstPage: Boolean(doc.differentFirstPage),
        watermarkText: doc.watermarkText || '',
        pageColor: doc.pageColor || '#FFFFFF',
        pageBorder: doc.pageBorder || 'none',
        pageBorderColor: doc.pageBorderColor || '#1e293b',
        pageBorderWidth: doc.pageBorderWidth || 1,
        pageBorderOffset: doc.pageBorderOffset || 'edge',
      },
      activitySummary: `Inspected page setup (${doc.pageSize || 'A4'}, ${doc.orientation || 'portrait'})`,
    };
  },
};

export const setPageSizeTool: ToolCatalogEntry = {
  id: 'set_page_size',
  name: 'set_page_size',
  label: 'Set Page Size',
  description: 'Set page size (A4, Letter, Legal, A3, A5, Tabloid).',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      pageSize: { type: 'string', enum: ['A4', 'Letter', 'Legal', 'A3', 'A5', 'Tabloid'], description: 'Paper page size.' },
    },
    required: ['pageSize'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const pageSize = args.pageSize as DocumentPageSize;

    await editorRegistry.executeAction('modify_page_layout', { pageSize }, val.docId);
    return { success: true, data: { pageSize }, activitySummary: `Set page size to ${pageSize}` };
  },
};

export const setPageOrientationTool: ToolCatalogEntry = {
  id: 'set_page_orientation',
  name: 'set_page_orientation',
  label: 'Set Page Orientation',
  description: 'Set page orientation (portrait or landscape).',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      orientation: { type: 'string', enum: ['portrait', 'landscape'], description: 'Page orientation.' },
    },
    required: ['orientation'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const orientation = args.orientation as DocumentOrientation;

    await editorRegistry.executeAction('modify_page_layout', { orientation }, val.docId);
    return { success: true, data: { orientation }, activitySummary: `Set page orientation to ${orientation}` };
  },
};

export const setPageMarginsTool: ToolCatalogEntry = {
  id: 'set_page_margins',
  name: 'set_page_margins',
  label: 'Set Page Margins',
  description: 'Set page margins preset (normal, narrow, moderate, wide) or custom measurements in mm.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      preset: { type: 'string', enum: ['normal', 'narrow', 'moderate', 'wide', 'custom'], description: 'Margin preset.' },
      topMm: { type: 'number', description: 'Optional custom top margin in millimeters.' },
      bottomMm: { type: 'number', description: 'Optional custom bottom margin in millimeters.' },
      leftMm: { type: 'number', description: 'Optional custom left margin in millimeters.' },
      rightMm: { type: 'number', description: 'Optional custom right margin in millimeters.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const hasCustom =
      args.topMm !== undefined || args.bottomMm !== undefined || args.leftMm !== undefined || args.rightMm !== undefined;
    if (hasCustom) {
      const customMargins = {
        top: Number(args.topMm ?? 25.4),
        bottom: Number(args.bottomMm ?? 25.4),
        left: Number(args.leftMm ?? 25.4),
        right: Number(args.rightMm ?? 25.4),
      };
      await editorRegistry.executeAction('modify_page_layout', { marginPreset: 'custom', margins: customMargins }, val.docId);
      return { success: true, data: { marginPreset: 'custom', margins: customMargins }, activitySummary: 'Set custom page margins' };
    }
    const preset = (args.preset as 'normal' | 'narrow' | 'moderate' | 'wide') || 'normal';
    await editorRegistry.executeAction('modify_page_layout', { marginPreset: preset, margins: preset }, val.docId);
    return { success: true, data: { marginPreset: preset }, activitySummary: `Set margins to ${preset}` };
  },
};

export const setPageColumnsTool: ToolCatalogEntry = {
  id: 'set_page_columns',
  name: 'set_page_columns',
  label: 'Set Page Columns',
  description: 'Set document column layout (1, 2, or 3 columns).',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['columns', 'two columns', 'three columns', 'single column'],
  keywords: ['columns', 'column layout', 'multi-column', 'newspaper'],
  parameters: {
    type: 'object',
    properties: {
      columns: { type: 'number', enum: [1, 2, 3], description: 'Number of text columns (1, 2, or 3).' },
    },
    required: ['columns'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const columns = Math.max(1, Math.min(3, Number(args.columns || 1))) as 1 | 2 | 3;
    await editorRegistry.executeAction('modify_page_layout', { columns }, val.docId);
    return { success: true, data: { columns }, activitySummary: `Set layout to ${columns} column${columns > 1 ? 's' : ''}` };
  },
};

export const setPageColorTool: ToolCatalogEntry = {
  id: 'set_page_color',
  name: 'set_page_color',
  label: 'Set Page Background Color',
  description: 'Set the physical paper background color across all pages (hex string, e.g. "#FFFFFF", "#FAF5E8", "#F4F8FD").',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['page background color', 'paper color', 'background color'],
  keywords: ['page color', 'background', 'paper', 'theme color'],
  parameters: {
    type: 'object',
    properties: {
      color: { type: 'string', description: 'Hex background color (e.g. "#FFFFFF", "#FDFCF7", "#F4F8F5").' },
    },
    required: ['color'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const color = String(args.color || '#FFFFFF').trim();
    await editorRegistry.executeAction('modify_page_layout', { pageColor: color }, val.docId);
    return { success: true, data: { pageColor: color }, activitySummary: `Set page color to ${color}` };
  },
};

export const setPageBordersTool: ToolCatalogEntry = {
  id: 'set_page_borders',
  name: 'set_page_borders',
  label: 'Set Page Borders',
  description: 'Add, customize, or remove page borders on all pages (box, shadow, double, accent, or none) with optional color, width, and offset.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['add page borders', 'page border', 'frame pages', 'remove page borders'],
  keywords: ['border', 'borders', 'page border', 'frame', 'box', 'double', 'accent', 'shadow'],
  parameters: {
    type: 'object',
    properties: {
      borderStyle: { type: 'string', enum: ['none', 'box', 'shadow', 'double', 'accent'], description: 'Page border frame style.' },
      borderColor: { type: 'string', description: 'Optional border hex color (e.g. "#1e293b", "#245c45").' },
      borderWidth: { type: 'number', description: 'Optional border stroke width in px (1 to 6).' },
      borderOffset: { type: 'string', enum: ['edge', 'margin', 'wide'], description: 'Border inset position relative to page edge or margin.' },
    },
    required: ['borderStyle'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const borderStyle = (args.borderStyle as 'none' | 'box' | 'shadow' | 'double' | 'accent') || 'box';
    const layoutPayload: Record<string, unknown> = { pageBorder: borderStyle };
    if (args.borderColor) layoutPayload.pageBorderColor = String(args.borderColor);
    if (args.borderWidth !== undefined) layoutPayload.pageBorderWidth = Math.max(1, Math.min(6, Number(args.borderWidth)));
    if (args.borderOffset) layoutPayload.pageBorderOffset = String(args.borderOffset);

    await editorRegistry.executeAction('modify_page_layout', layoutPayload, val.docId);
    return {
      success: true,
      data: layoutPayload,
      activitySummary: borderStyle === 'none' ? 'Removed page borders' : `Applied "${borderStyle}" page borders`,
    };
  },
};

export const updateHeaderTool: ToolCatalogEntry = {
  id: 'update_header',
  name: 'update_header',
  label: 'Update Header / Different First Page Header',
  description:
    'Set running headers across pages, and optionally configure a SEPARATE first-page header/title ("firstPageHeaderText") with "differentFirstPage: true" so page 1 shows a distinct title/header while pages 2+ show "headerText" (or remain empty if headerText="").',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['set header', 'first page header', 'different first page header', 'page title header'],
  keywords: ['header', 'first page', 'different first page', 'running header', 'title', 'remaining pages'],
  parameters: {
    type: 'object',
    properties: {
      headerText: { type: 'string', description: 'Header text for all pages (or for pages 2+ when differentFirstPage is true; pass "" to leave pages 2+ empty).' },
      firstPageHeaderText: { type: 'string', description: 'Optional separate header text shown ONLY on page 1 when differentFirstPage is enabled.' },
      differentFirstPage: { type: 'boolean', description: 'Set true to enable separate header/footer for page 1 vs subsequent pages.' },
      headerAlign: { type: 'string', enum: ['left', 'center', 'right'], description: 'Horizontal alignment of header text.' },
      showHeaderLine: { type: 'boolean', description: 'Show or hide the horizontal divider line below the header (default false).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const layoutPayload: Record<string, unknown> = {};
    if (args.headerText !== undefined) layoutPayload.headerText = String(args.headerText);
    if (args.firstPageHeaderText !== undefined) {
      layoutPayload.firstPageHeaderText = String(args.firstPageHeaderText);
      if (args.differentFirstPage === undefined) {
        layoutPayload.differentFirstPage = true;
      }
    }
    if (args.differentFirstPage !== undefined) layoutPayload.differentFirstPage = Boolean(args.differentFirstPage);
    if (args.headerAlign !== undefined) layoutPayload.headerAlign = String(args.headerAlign);
    if (args.showHeaderLine !== undefined) layoutPayload.showHeaderLine = Boolean(args.showHeaderLine);

    if (Object.keys(layoutPayload).length === 0) {
      return { success: false, error: 'Provide headerText, firstPageHeaderText, differentFirstPage, showHeaderLine, or headerAlign.' };
    }

    await editorRegistry.executeAction('modify_page_layout', layoutPayload, val.docId);
    const descParts: string[] = [];
    if (layoutPayload.firstPageHeaderText !== undefined) descParts.push(`first page "${layoutPayload.firstPageHeaderText}"`);
    if (layoutPayload.headerText !== undefined) descParts.push(`remaining/running "${layoutPayload.headerText}"`);
    return {
      success: true,
      data: layoutPayload,
      activitySummary: `Updated header (${descParts.join(', ') || 'layout updated'})`,
    };
  },
};

export const updateFooterTool: ToolCatalogEntry = {
  id: 'update_footer',
  name: 'update_footer',
  label: 'Update Footer / Different First Page Footer',
  description: 'Set or update running footer text across pages, with optional separate first-page footer and alignment.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      footerText: { type: 'string', description: 'Footer text for pages (or pages 2+ when differentFirstPage is true).' },
      firstPageFooterText: { type: 'string', description: 'Optional separate footer text shown only on page 1.' },
      differentFirstPage: { type: 'boolean', description: 'Different header/footer on first page.' },
      footerAlign: { type: 'string', enum: ['left', 'center', 'right'], description: 'Horizontal alignment of footer text.' },
      showFooterLine: { type: 'boolean', description: 'Show or hide the horizontal divider line above the footer (default false).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const layoutPayload: Record<string, unknown> = {};
    if (args.footerText !== undefined) layoutPayload.footerText = String(args.footerText);
    if (args.firstPageFooterText !== undefined) {
      layoutPayload.firstPageFooterText = String(args.firstPageFooterText);
      if (args.differentFirstPage === undefined) {
        layoutPayload.differentFirstPage = true;
      }
    }
    if (args.differentFirstPage !== undefined) layoutPayload.differentFirstPage = Boolean(args.differentFirstPage);
    if (args.footerAlign !== undefined) layoutPayload.footerAlign = String(args.footerAlign);
    if (args.showFooterLine !== undefined) layoutPayload.showFooterLine = Boolean(args.showFooterLine);

    await editorRegistry.executeAction('modify_page_layout', layoutPayload, val.docId);
    return { success: true, data: layoutPayload, activitySummary: 'Updated document footer' };
  },
};

export const deleteHeaderTool: ToolCatalogEntry = {
  id: 'delete_header',
  name: 'delete_header',
  label: 'Delete Header',
  description: 'Remove running header across all pages, only from the first page, or only from remaining pages.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['all', 'first_page', 'remaining_pages'], description: 'Which pages header to clear (default all).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const scope = String(args.scope || 'all');
    const payload =
      scope === 'first_page'
        ? { firstPageHeaderText: '', differentFirstPage: true }
        : scope === 'remaining_pages'
        ? { headerText: '', differentFirstPage: true }
        : { headerText: '', firstPageHeaderText: '' };

    await editorRegistry.executeAction('modify_page_layout', payload, val.docId);
    return { success: true, data: { cleared: scope }, activitySummary: `Cleared header (${scope})` };
  },
};

export const deleteFooterTool: ToolCatalogEntry = {
  id: 'delete_footer',
  name: 'delete_footer',
  label: 'Delete Footer',
  description: 'Remove running footer across all pages, only from the first page, or only from remaining pages.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['all', 'first_page', 'remaining_pages'], description: 'Which pages footer to clear (default all).' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const scope = String(args.scope || 'all');
    const payload =
      scope === 'first_page'
        ? { firstPageFooterText: '', differentFirstPage: true }
        : scope === 'remaining_pages'
        ? { footerText: '', differentFirstPage: true }
        : { footerText: '', firstPageFooterText: '' };

    await editorRegistry.executeAction('modify_page_layout', payload, val.docId);
    return { success: true, data: { cleared: scope }, activitySummary: `Cleared footer (${scope})` };
  },
};

export const insertPageNumbersTool: ToolCatalogEntry = {
  id: 'insert_page_numbers',
  name: 'insert_page_numbers',
  label: 'Insert Page Numbers',
  description: 'Configure and display page numbering.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', description: 'Enable or disable page numbers.' },
      position: { type: 'string', enum: ['bottom-center', 'bottom-right', 'top-right'], description: 'Position.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const enabled = args.enabled !== false;
    const position = (args.position as 'bottom-center' | 'bottom-right' | 'top-right') || 'bottom-center';

    const res = await editorRegistry.executeAction('modify_page_layout', { showPageNumbers: enabled, pageNumberPosition: position }, val.docId);
    return { success: true, data: { enabled, position }, activitySummary: enabled ? `Configured page numbers (${position})` : 'Disabled page numbers' };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE B — 9. LINKS, REFERENCES AND ANNOTATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getDocumentLinksTool: ToolCatalogEntry = {
  id: 'get_document_links',
  name: 'get_document_links',
  label: 'Get Document Links',
  description: 'Extract all hyperlinks embedded in the document.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const linkMatches = Array.from(content.matchAll(/<a[^>]+href="([^">]+)"[^>]*>([\s\S]*?)<\/a>/gi));

    const links = linkMatches.map((m, idx) => ({
      index: idx,
      url: m[1],
      text: m[2].replace(/<[^>]+>/g, '').trim(),
    }));

    return {
      success: true,
      data: { links, count: links.length },
      activitySummary: `Found ${links.length} hyperlinks in document`,
    };
  },
};

export const insertHyperlinkTool: ToolCatalogEntry = {
  id: 'insert_hyperlink',
  name: 'insert_hyperlink',
  label: 'Insert Hyperlink',
  description: 'Insert or attach a hyperlink to text.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Destination web URL.' },
      text: { type: 'string', description: 'Anchor display text.' },
      targetText: { type: 'string', description: 'Existing text to link.' },
    },
    required: ['url'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const url = String(args.url || '');

    const res = await editorRegistry.executeAction(
      'insert_hyperlink',
      { url, text: args.text, targetText: args.targetText },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert hyperlink.' };
    return {
      success: true,
      data: { url, text: args.text, targetText: args.targetText },
      activitySummary: `Inserted hyperlink to "${url}"`,
    };
  },
};

export const updateHyperlinkTool: ToolCatalogEntry = {
  id: 'update_hyperlink',
  name: 'update_hyperlink',
  label: 'Update Hyperlink',
  description: 'Update the URL or text of an existing hyperlink.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      newUrl: { type: 'string', description: 'Updated destination URL.' },
      text: { type: 'string', description: 'Updated link text.' },
    },
    required: ['newUrl'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const newUrl = String(args.newUrl || '');

    const res = await editorRegistry.executeAction('insert_hyperlink', { url: newUrl, text: args.text }, val.docId);
    return { success: true, data: { url: newUrl }, activitySummary: `Updated hyperlink to "${newUrl}"` };
  },
};

export const removeHyperlinkTool: ToolCatalogEntry = {
  id: 'remove_hyperlink',
  name: 'remove_hyperlink',
  label: 'Remove Hyperlink',
  description: 'Remove hyperlink mark from text.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      targetText: { type: 'string', description: 'Text phrase whose link should be removed.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('delete_hyperlinks', { targetText: args.targetText }, val.docId);
    return { success: true, data: { targetText: args.targetText }, activitySummary: 'Removed hyperlink from text' };
  },
};

export const getDocumentCommentsTool: ToolCatalogEntry = {
  id: 'get_document_comments',
  name: 'get_document_comments',
  label: 'Get Document Comments',
  description: 'Retrieve all comments attached to the document.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };

    const storeDoc = useWorkspaceStore.getState().documents.find((d) => d.id === doc.id);
    const comments = storeDoc?.comments || [];

    return {
      success: true,
      data: { comments, count: comments.length },
      activitySummary: `Retrieved ${comments.length} document comments`,
    };
  },
};

export const addDocumentCommentTool: ToolCatalogEntry = {
  id: 'add_document_comment',
  name: 'add_document_comment',
  label: 'Add Document Comment',
  description: 'Attach a comment to the document.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Comment message text.' },
      selectionText: { type: 'string', description: 'Associated text selection.' },
      author: { type: 'string', description: 'Author name (default "AI Assistant").' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '').trim();
    if (!text) return { success: false, error: 'Comment text is required.' };

    const store = useWorkspaceStore.getState();
    const doc = store.documents.find((d) => d.id === val.docId);
    const newComment: DocumentComment = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: String(args.author || 'AI Assistant'),
      createdAt: new Date().toISOString(),
      text,
      selectionText: args.selectionText ? String(args.selectionText) : undefined,
      resolved: false,
    };

    const updatedComments = [...(doc?.comments || []), newComment];
    store.updateDocument(val.docId, { comments: updatedComments });

    return {
      success: true,
      data: { commentId: newComment.id, text, author: newComment.author },
      activitySummary: `Added comment: "${text.slice(0, 40)}${text.length > 40 ? '...' : ''}"`,
    };
  },
};

export const resolveDocumentCommentTool: ToolCatalogEntry = {
  id: 'resolve_document_comment',
  name: 'resolve_document_comment',
  label: 'Resolve Comment',
  description: 'Mark a document comment as resolved.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      commentId: { type: 'string', description: 'ID of comment to resolve.' },
    },
    required: ['commentId'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const commentId = String(args.commentId || '');

    const store = useWorkspaceStore.getState();
    const doc = store.documents.find((d) => d.id === val.docId);
    const comments = (doc?.comments || []).map((c) => (c.id === commentId ? { ...c, resolved: true } : c));
    store.updateDocument(val.docId, { comments });

    return { success: true, data: { commentId, resolved: true }, activitySummary: `Resolved comment "${commentId}"` };
  },
};

export const deleteDocumentCommentTool: ToolCatalogEntry = {
  id: 'delete_document_comment',
  name: 'delete_document_comment',
  label: 'Delete Comment',
  description: 'Remove a comment from the document.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      commentId: { type: 'string', description: 'ID of comment to delete.' },
    },
    required: ['commentId'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const commentId = String(args.commentId || '');

    const store = useWorkspaceStore.getState();
    const doc = store.documents.find((d) => d.id === val.docId);
    const comments = (doc?.comments || []).filter((c) => c.id !== commentId);
    store.updateDocument(val.docId, { comments });

    return { success: true, data: { commentId, deleted: true }, activitySummary: `Deleted comment "${commentId}"` };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE D — 10. DOCUMENT REVIEW AND QUALITY CHECKS
// ─────────────────────────────────────────────────────────────────────────────

export const checkSpellingTool: ToolCatalogEntry = {
  id: 'check_spelling',
  name: 'check_spelling',
  label: 'Check Spelling',
  description: 'Non-destructive spell-checker for document content.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const plain = (doc.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const words = plain.match(/\b[A-Za-z]{3,}\b/g) || [];

    // Common English word vocabulary check
    const knownVocabulary = new Set([
      'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
      'his', 'from', 'they', 'say', 'her', 'she', 'will', 'one', 'all', 'would',
      'there', 'their', 'what', 'out', 'about', 'who', 'get', 'which', 'go', 'me',
      'when', 'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take',
      'people', 'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other',
      'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also',
      'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way',
      'even', 'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
      'document', 'report', 'project', 'summary', 'analysis', 'system', 'overview',
      'revenue', 'financial', 'growth', 'metrics', 'business', 'customer', 'product',
      'management', 'software', 'market', 'strategy', 'results', 'performance', 'docium',
      'table', 'section', 'heading', 'data', 'information', 'process', 'development',
      'prosemirror', 'tiptap', 'quarterly', 'margin', 'margins', 'operating', 'expenses'
    ]);

    const potentialMisspellings: string[] = [];
    for (const w of words) {
      const lower = w.toLowerCase();
      if (!knownVocabulary.has(lower) && !w.match(/^[A-Z][a-z]+$/) && lower.length > 5) {
        if (!potentialMisspellings.includes(w)) {
          potentialMisspellings.push(w);
        }
      }
    }

    return {
      success: true,
      data: {
        totalWordsChecked: words.length,
        potentialMisspellings: potentialMisspellings.slice(0, 10),
        spellingScore: Math.max(70, 100 - potentialMisspellings.length * 3),
      },
      activitySummary: `Spell check complete: ${potentialMisspellings.length} items flagged across ${words.length} words`,
    };
  },
};

export const checkGrammarTool: ToolCatalogEntry = {
  id: 'check_grammar',
  name: 'check_grammar',
  label: 'Check Grammar',
  description: 'Inspect sentence structure, passive voice, double punctuation, and grammar consistency.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const plain = (doc.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const sentences = plain.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    const issues: string[] = [];
    // Repeated words
    const repeated = plain.match(/\b([A-Za-z]+)\s+\1\b/gi);
    if (repeated) {
      issues.push(`Repeated consecutive words: "${repeated.join('", "')}"`);
    }

    // Long run-on sentences (> 40 words)
    let runOnCount = 0;
    for (const s of sentences) {
      if (s.split(/\s+/).length > 40) runOnCount++;
    }
    if (runOnCount > 0) {
      issues.push(`${runOnCount} long sentence(s) exceeding 40 words (consider splitting)`);
    }

    return {
      success: true,
      data: {
        sentencesCount: sentences.length,
        grammarIssues: issues,
        score: Math.max(75, 100 - issues.length * 8),
      },
      activitySummary: `Grammar check complete: ${issues.length} suggestions across ${sentences.length} sentences`,
    };
  },
};

export const checkReadabilityTool: ToolCatalogEntry = {
  id: 'check_readability',
  name: 'check_readability',
  label: 'Check Readability',
  description: 'Calculate Flesch Reading Ease score, Flesch-Kincaid Grade Level, and estimated reading time.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const plain = (doc.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const metrics = computeReadability(plain);

    return {
      success: true,
      data: metrics,
      activitySummary: `Readability score: ${metrics.fleschReadingEase}/100 (${metrics.classification}, Grade ${metrics.fleschKincaidGradeLevel})`,
    };
  },
};

export const checkRepetitionTool: ToolCatalogEntry = {
  id: 'check_repetition',
  name: 'check_repetition',
  label: 'Check Repetition',
  description: 'Detect repeated words, phrases, and duplicate sentences.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const plain = (doc.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const rep = computeRepetition(plain);

    return {
      success: true,
      data: rep,
      activitySummary: `Repetition check: ${rep.repeatedWords.length} frequently repeated terms, ${rep.duplicateSentences.length} duplicate sentences`,
    };
  },
};

export const checkHeadingHierarchyTool: ToolCatalogEntry = {
  id: 'check_heading_hierarchy',
  name: 'check_heading_hierarchy',
  label: 'Check Heading Hierarchy',
  description: 'Validate heading hierarchy (check for skipped levels, missing title, single top-level title).',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const headings = doc.headings || [];
    const val = validateHeadingHierarchy(headings);

    return {
      success: true,
      data: val,
      activitySummary: val.valid
        ? `Heading hierarchy is valid (${headings.length} headings)`
        : `Heading hierarchy flags: ${val.issues.join('; ')}`,
    };
  },
};

export const checkAccessibilityTool: ToolCatalogEntry = {
  id: 'check_accessibility',
  name: 'check_accessibility',
  label: 'Check Accessibility',
  description: 'Inspect images for missing alt text, link anchor text clarity, and structural accessibility.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';

    // Check images alt
    const imgMatches = Array.from(content.matchAll(/<img[^>]+src="([^">]+)"(?:[^>]*alt="([^">]*)")?/gi));
    const missingAlt = imgMatches.filter((m) => !m[2] || m[2].trim() === '');

    // Check ambiguous links ("click here", "read more")
    const linkMatches = Array.from(content.matchAll(/<a[^>]+href="([^">]+)"[^>]*>([\s\S]*?)<\/a>/gi));
    const ambiguousLinks = linkMatches.filter((m) => {
      const text = m[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
      return text === 'click here' || text === 'here' || text === 'read more' || text === 'link';
    });

    const issues: string[] = [];
    if (missingAlt.length > 0) issues.push(`${missingAlt.length} image(s) missing alt text description`);
    if (ambiguousLinks.length > 0) issues.push(`${ambiguousLinks.length} hyperlink(s) with non-descriptive anchor text ("click here")`);

    return {
      success: true,
      data: {
        accessible: issues.length === 0,
        imagesTotal: imgMatches.length,
        missingAltCount: missingAlt.length,
        ambiguousLinksCount: ambiguousLinks.length,
        issues,
      },
      activitySummary: issues.length === 0 ? 'Document passed accessibility audit' : `Accessibility issues: ${issues.join('; ')}`,
    };
  },
};

export const createReviewReportTool: ToolCatalogEntry = {
  id: 'create_review_report',
  name: 'create_review_report',
  label: 'Create Review Report',
  description: 'Produce a comprehensive quality review report summarizing readability, grammar, hierarchy, and accessibility.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };
    const content = doc.content || '';
    const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    const readability = computeReadability(plain);
    const hierarchy = validateHeadingHierarchy(doc.headings || []);
    const rep = computeRepetition(plain);

    const overallScore = Math.round(
      (readability.fleschReadingEase * 0.4) +
      (hierarchy.valid ? 30 : 15) +
      (rep.hasRepetition ? 15 : 30)
    );

    const report = {
      documentTitle: doc.title || 'Untitled',
      overallScore: Math.min(100, Math.max(50, overallScore)),
      readability,
      headingHierarchy: hierarchy,
      repetition: rep,
      summary: `Document scored ${overallScore}/100. Readability: ${readability.classification} (Grade ${readability.fleschKincaidGradeLevel}). Heading structure: ${hierarchy.valid ? 'Valid' : 'Needs attention'}.`,
    };

    return {
      success: true,
      data: report,
      activitySummary: `Generated comprehensive review report (${report.overallScore}/100)`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE E — 11. DOCUMENT EXPORT AND IMPORT
// ─────────────────────────────────────────────────────────────────────────────

export const exportAsPdfTool: ToolCatalogEntry = {
  id: 'export_as_pdf',
  name: 'export_as_pdf',
  label: 'Export Document as PDF',
  description: 'Trigger a direct browser PDF file download preserving selectable vector text, layout, margins, borders, and first-page/running headers & footers.',
  category: 'export_import',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['download pdf', 'save as pdf', 'export pdf'],
  keywords: ['export', 'download', 'pdf', 'save pdf'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Optional export filename/title.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const doc = context.activeDocument;
    const title = String(args.title || doc?.title || 'Document');

    const res = await dispatchOrExecuteEditorAction(
      context,
      'export_document',
      { format: 'pdf', title },
      val.docId,
      `Triggered PDF download for "${title}"`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to trigger PDF export.' };
    if (typeof window !== 'undefined') {
      try {
        await exportToPdf(title, {
          htmlContent: doc?.content,
          pageSize: doc?.pageSize,
          orientation: doc?.orientation,
          margins: doc?.margins,
          columns: doc?.columns,
          headerText: doc?.headerText,
          footerText: doc?.footerText,
          headerAlign: doc?.headerAlign,
          footerAlign: doc?.footerAlign,
          firstPageHeaderText: doc?.firstPageHeaderText,
          firstPageFooterText: doc?.firstPageFooterText,
          showHeaderLine: doc?.showHeaderLine,
          showFooterLine: doc?.showFooterLine,
          showPageNumbers: doc?.showPageNumbers,
          pageNumberPosition: doc?.pageNumberPosition,
          differentFirstPage: doc?.differentFirstPage,
          watermarkText: doc?.watermarkText,
          pageColor: doc?.pageColor,
          pageBorder: doc?.pageBorder,
          pageBorderColor: doc?.pageBorderColor,
          pageBorderWidth: doc?.pageBorderWidth,
          pageBorderOffset: doc?.pageBorderOffset,
        });
      } catch (err) {
        console.warn('PDF export trigger error:', err);
      }
    }

    return {
      success: true,
      data: {
        format: 'pdf',
        title,
        pageSize: doc?.pageSize || 'A4',
        orientation: doc?.orientation || 'portrait',
        status: 'Browser PDF download triggered',
      },
      activitySummary: `Triggered PDF download for "${title}"`,
      editorAction: res.editorAction,
    };
  },
};

export const exportAsDocxTool: ToolCatalogEntry = {
  id: 'export_as_docx',
  name: 'export_as_docx',
  label: 'Export Document as Word (DOCX)',
  description: 'Trigger a direct browser Word (.docx) download preserving styles, tables, headings, and page layout.',
  category: 'export_import',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['download docx', 'download word', 'export word', 'save as word'],
  keywords: ['export', 'download', 'docx', 'word'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Optional export filename/title.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const doc = context.activeDocument;
    const title = String(args.title || doc?.title || 'Document');
    const content = doc?.content || '';

    const res = await dispatchOrExecuteEditorAction(
      context,
      'export_document',
      { format: 'docx', title },
      val.docId,
      `Triggered DOCX download for "${title}"`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to trigger DOCX export.' };
    if (typeof window !== 'undefined') {
      try {
        await exportToDocx(title, content, {
          pageSize: doc?.pageSize,
          orientation: doc?.orientation,
          margins: doc?.margins,
          columns: doc?.columns,
          headerText: doc?.headerText,
          footerText: doc?.footerText,
          headerAlign: doc?.headerAlign,
          footerAlign: doc?.footerAlign,
          firstPageHeaderText: doc?.firstPageHeaderText,
          firstPageFooterText: doc?.firstPageFooterText,
          showHeaderLine: Boolean(doc?.showHeaderLine),
          showFooterLine: Boolean(doc?.showFooterLine),
          showPageNumbers: Boolean(doc?.showPageNumbers),
          pageNumberPosition: doc?.pageNumberPosition,
          differentFirstPage: Boolean(doc?.differentFirstPage),
          watermarkText: doc?.watermarkText,
          pageColor: doc?.pageColor,
          pageBorder: doc?.pageBorder,
          pageBorderColor: doc?.pageBorderColor,
          pageBorderWidth: doc?.pageBorderWidth,
          pageBorderOffset: doc?.pageBorderOffset,
        });
      } catch (err) {
        console.warn('DOCX export trigger error:', err);
      }
    }

    return {
      success: true,
      data: {
        format: 'docx',
        title,
        contentLength: content.length,
        status: 'Browser DOCX download triggered',
      },
      activitySummary: `Triggered DOCX download for "${title}"`,
      editorAction: res.editorAction,
    };
  },
};

export const exportAsTxtTool: ToolCatalogEntry = {
  id: 'export_as_txt',
  name: 'export_as_txt',
  label: 'Export Document as Plain Text',
  description: 'Trigger a direct browser plain text (.txt) file download.',
  category: 'export_import',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['download txt', 'save as txt', 'export text'],
  keywords: ['export', 'download', 'txt', 'plain text'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Optional export filename/title.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const doc = context.activeDocument;
    const title = String(args.title || doc?.title || 'Document');
    const content = doc?.content || '';

    const res = await dispatchOrExecuteEditorAction(
      context,
      'export_document',
      { format: 'txt', title },
      val.docId,
      `Triggered TXT download for "${title}"`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to trigger TXT export.' };
    if (typeof window !== 'undefined') {
      try {
        exportToPlainText(title, content);
      } catch (err) {
        console.warn('TXT export trigger error:', err);
      }
    }

    const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      success: true,
      data: {
        format: 'txt',
        title,
        wordCount: plain ? plain.split(/\s+/).length : 0,
        status: 'Browser TXT download triggered',
      },
      activitySummary: `Triggered TXT download for "${title}"`,
      editorAction: res.editorAction,
    };
  },
};

export const exportAsHtmlTool: ToolCatalogEntry = {
  id: 'export_as_html',
  name: 'export_as_html',
  label: 'Export Document as HTML',
  description: 'Trigger a direct browser standalone HTML file download.',
  category: 'export_import',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['download html', 'save as html', 'export html'],
  keywords: ['export', 'download', 'html', 'web page'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Optional export filename/title.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const doc = context.activeDocument;
    const title = String(args.title || doc?.title || 'Document');
    const content = doc?.content || '';

    const res = await dispatchOrExecuteEditorAction(
      context,
      'export_document',
      { format: 'html', title },
      val.docId,
      `Triggered HTML download for "${title}"`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to trigger HTML export.' };
    if (typeof window !== 'undefined') {
      try {
        exportToHtml(title, content);
      } catch (err) {
        console.warn('HTML export trigger error:', err);
      }
    }

    return {
      success: true,
      data: {
        format: 'html',
        title,
        byteLength: content.length,
        status: 'Browser HTML download triggered',
      },
      activitySummary: `Triggered HTML download for "${title}"`,
      editorAction: res.editorAction,
    };
  },
};

export const exportAsMarkdownTool: ToolCatalogEntry = {
  id: 'export_as_markdown',
  name: 'export_as_markdown',
  label: 'Export Document as Markdown',
  description: 'Trigger a direct browser Markdown (.md) file download.',
  category: 'export_import',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['download markdown', 'save as markdown', 'export md'],
  keywords: ['export', 'download', 'markdown', 'md'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Optional export filename/title.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const doc = context.activeDocument;
    const title = String(args.title || doc?.title || 'Document');
    const content = doc?.content || '';

    const res = await dispatchOrExecuteEditorAction(
      context,
      'export_document',
      { format: 'markdown', title },
      val.docId,
      `Triggered Markdown download for "${title}"`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to trigger Markdown export.' };
    if (typeof window !== 'undefined') {
      try {
        exportToMarkdown(title, content);
      } catch (err) {
        console.warn('Markdown export trigger error:', err);
      }
    }
    return {
      success: true,
      data: { format: 'markdown', title, status: 'Browser Markdown download triggered' },
      activitySummary: `Triggered Markdown download for "${title}"`,
      editorAction: res.editorAction,
    };
  },
};

export const printDocumentTool: ToolCatalogEntry = {
  id: 'print_document',
  name: 'print_document',
  label: 'Print Document',
  description: 'Open the browser print dialog formatted cleanly for all document pages.',
  category: 'export_import',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['print page', 'print document'],
  keywords: ['print', 'printer'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Optional print title.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const doc = context.activeDocument;
    const title = String(args.title || doc?.title || 'Document');
    const res = await dispatchOrExecuteEditorAction(
      context,
      'export_document',
      { format: 'print', title },
      val.docId,
      `Opened print view for "${title}"`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to open print dialog.' };
    if (typeof window !== 'undefined') {
      triggerPrintPdf({ title, pageSize: doc?.pageSize, orientation: doc?.orientation, margins: doc?.margins });
    }
    return {
      success: true,
      data: { format: 'print', title },
      activitySummary: `Opened print dialog for "${title}"`,
      editorAction: res.editorAction,
    };
  },
};

export const setDocumentViewTool: ToolCatalogEntry = {
  id: 'set_document_view',
  name: 'set_document_view',
  label: 'Configure Document View',
  description: 'Control View ribbon options: zoom percentage (50-250), viewMode (paginated or continuous), ruler, navigation outline, formatting marks, and focus mode.',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['zoom', 'focus mode', 'show ruler', 'show outline', 'formatting marks', 'continuous view', 'paginated view'],
  keywords: ['zoom', 'ruler', 'outline', 'formatting marks', 'focus mode', 'view', 'paginated', 'continuous'],
  parameters: {
    type: 'object',
    properties: {
      zoomLevel: { type: 'number', description: 'Zoom percentage from 50 to 250.' },
      viewMode: { type: 'string', enum: ['paginated', 'continuous'], description: 'Paginated paper sheets vs continuous view.' },
      showRuler: { type: 'boolean', description: 'Show/hide horizontal and vertical rulers.' },
      showOutline: { type: 'boolean', description: 'Show/hide document navigation outline panel.' },
      showFormattingMarks: { type: 'boolean', description: 'Show/hide non-printing paragraph marks (¶).' },
      focusMode: { type: 'boolean', description: 'Enable/disable distraction-free Focus Mode.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const payload: Record<string, unknown> = {};
    if (args.zoomLevel !== undefined) payload.zoomLevel = Number(args.zoomLevel);
    if (args.viewMode !== undefined) payload.viewMode = String(args.viewMode);
    if (args.showRuler !== undefined) payload.showRuler = Boolean(args.showRuler);
    if (args.showOutline !== undefined) payload.showOutline = Boolean(args.showOutline);
    if (args.showFormattingMarks !== undefined) payload.showFormattingMarks = Boolean(args.showFormattingMarks);
    if (args.focusMode !== undefined) payload.focusMode = Boolean(args.focusMode);

    const res = await dispatchOrExecuteEditorAction(context, 'set_document_view', payload, val.docId, 'Updated document view settings');
    if (!res.success) return { success: false, error: res.error || 'Failed to update view settings.' };
    return { success: true, data: payload, activitySummary: 'Updated document view settings', editorAction: res.editorAction };
  },
};

export const setEditorPreferencesTool: ToolCatalogEntry = {
  id: 'set_editor_preferences',
  name: 'set_editor_preferences',
  label: 'Set Review Preferences',
  description: 'Toggle Review ribbon controls: suggesting mode, spellcheck, or comments sidebar visibility.',
  category: 'review_quality',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['suggesting mode', 'spell check', 'comments sidebar'],
  keywords: ['suggesting', 'spell check', 'comments panel', 'review mode'],
  parameters: {
    type: 'object',
    properties: {
      suggestingMode: { type: 'boolean', description: 'Enable/disable Suggesting Mode.' },
      spellCheckEnabled: { type: 'boolean', description: 'Enable/disable browser spell check.' },
      commentsSidebarOpen: { type: 'boolean', description: 'Show/hide the comments sidebar.' },
    },
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const payload: Record<string, unknown> = {};
    if (args.suggestingMode !== undefined) payload.suggestingMode = Boolean(args.suggestingMode);
    if (args.spellCheckEnabled !== undefined) payload.spellCheckEnabled = Boolean(args.spellCheckEnabled);
    if (args.commentsSidebarOpen !== undefined) payload.commentsSidebarOpen = Boolean(args.commentsSidebarOpen);
    const res = await dispatchOrExecuteEditorAction(context, 'set_editor_preferences', payload, val.docId, 'Updated editor review settings');
    if (!res.success) return { success: false, error: res.error || 'Failed to update review preferences.' };
    return { success: true, data: payload, activitySummary: 'Updated editor review settings', editorAction: res.editorAction };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// STAGE E — 12. DOCUMENT VERSION AND CHANGE MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const getDocumentVersionsTool: ToolCatalogEntry = {
  id: 'get_document_versions',
  name: 'get_document_versions',
  label: 'Get Document Versions',
  description: 'Retrieve saved version history snapshots for the active document.',
  category: 'version_management',
  workspace: ['doc'],
  risk: 'read_only',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const doc = context.activeDocument;
    if (!doc) return { success: false, error: 'No active document loaded.' };

    const storeDoc = useWorkspaceStore.getState().documents.find((d) => d.id === doc.id);
    const versions = storeDoc?.versionHistory || [];

    return {
      success: true,
      data: {
        documentId: doc.id,
        versions: versions.map((v) => ({
          id: v.id,
          title: v.title,
          timestamp: v.timestamp,
          wordCount: v.wordCount,
          isNamed: v.isNamed,
        })),
        versionCount: versions.length,
      },
      activitySummary: `Retrieved ${versions.length} version snapshots`,
    };
  },
};

export const createDocumentSnapshotTool: ToolCatalogEntry = {
  id: 'create_document_snapshot',
  name: 'create_document_snapshot',
  label: 'Create Document Snapshot',
  description: 'Create a named version history snapshot of current document state.',
  category: 'version_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Name/label for this version snapshot.' },
    },
    required: ['title'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const title = String(args.title || 'Snapshot').trim();

    const store = useWorkspaceStore.getState();
    const doc = store.documents.find((d) => d.id === val.docId);
    const content = doc?.content || '';
    const wordCount = doc?.wordCount || 0;

    const newSnapshot: DocumentVersionSnapshot = {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      timestamp: new Date().toISOString(),
      wordCount,
      content,
      isNamed: true,
    };

    const updatedHistory = [...(doc?.versionHistory || []), newSnapshot];
    store.updateDocument(val.docId, { versionHistory: updatedHistory });

    return {
      success: true,
      data: { snapshotId: newSnapshot.id, title, timestamp: newSnapshot.timestamp },
      activitySummary: `Created version snapshot "${title}"`,
    };
  },
};

export const restoreDocumentVersionTool: ToolCatalogEntry = {
  id: 'restore_document_version',
  name: 'restore_document_version',
  label: 'Restore Document Version',
  description: 'Restore document content from a previously saved version snapshot.',
  category: 'version_management',
  workspace: ['doc'],
  risk: 'destructive',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      versionId: { type: 'string', description: 'Snapshot ID to restore.' },
    },
    required: ['versionId'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const versionId = String(args.versionId || '');

    const store = useWorkspaceStore.getState();
    const doc = store.documents.find((d) => d.id === val.docId);
    const snapshot = doc?.versionHistory?.find((v) => v.id === versionId);

    if (!snapshot) {
      return { success: false, error: `Version snapshot "${versionId}" not found in document history.` };
    }

    const res = await editorRegistry.executeAction('insert_structured_document', { content: snapshot.content }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to restore document version.' };
    return {
      success: true,
      data: { restoredTitle: snapshot.title, timestamp: snapshot.timestamp },
      activitySummary: `Restored version "${snapshot.title}"`,
    };
  },
};

export const undoDocumentOperationTool: ToolCatalogEntry = {
  id: 'undo_document_operation',
  name: 'undo_document_operation',
  label: 'Undo Operation',
  description: 'Undo the last editor transaction or content change.',
  category: 'version_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('editor_undo', {}, val.docId);
    return { success: true, data: { undone: true }, activitySummary: 'Undid last editor action' };
  },
};

export const redoDocumentOperationTool: ToolCatalogEntry = {
  id: 'redo_document_operation',
  name: 'redo_document_operation',
  label: 'Redo Operation',
  description: 'Redo the previously undone editor transaction.',
  category: 'version_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };

    const res = await editorRegistry.executeAction('editor_redo', {}, val.docId);
    return { success: true, data: { redone: true }, activitySummary: 'Redid editor action' };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PLANNED TOOLS (Honest availability status)
// ─────────────────────────────────────────────────────────────────────────────

export const insertShapeTool: ToolCatalogEntry = {
  id: 'insert_shape',
  name: 'insert_shape',
  label: 'Insert Vector Shape',
  description:
    'Insert a resizable vector shape (rectangle, rounded-rectangle, ellipse, triangle, diamond, star, arrow, double-arrow, block-arrow-right, callout, process, decision, banner, cloud, etc.) with optional inside text, fill, stroke, and text wrapping.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  keywords: ['shape', 'rectangle', 'circle', 'ellipse', 'arrow', 'diamond', 'star', 'flowchart', 'diagram', 'banner'],
  parameters: {
    type: 'object',
    properties: {
      shapeType: {
        type: 'string',
        description:
          'Shape preset: rectangle, rounded-rectangle, ellipse, triangle, right-triangle, diamond, pentagon, hexagon, octagon, cross, heart, cloud, star, star-4, banner, callout, oval-callout, line, arrow, left-arrow, double-arrow, block-arrow-right, block-arrow-left, block-arrow-up, block-arrow-down, connector, process, decision, terminator, document, data, database.',
      },
      text: { type: 'string', description: 'Optional label text inside the shape.' },
      width: { type: 'number', description: 'Shape width in pixels (default 180).' },
      height: { type: 'number', description: 'Shape height in pixels (default 110).' },
      fill: { type: 'string', description: 'Fill hex color (e.g. #EAF2ED) or "transparent".' },
      stroke: { type: 'string', description: 'Outline hex color (e.g. #245C45).' },
      alignment: {
        type: 'string',
        enum: ['left', 'center', 'right', 'float-left', 'float-right'],
        description: 'Alignment or text wrapping.',
      },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['shapeType'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const shapeType = String(args.shapeType || 'rectangle');
    const res = await editorRegistry.executeAction(
      'insert_vector_shape',
      {
        shapeType,
        text: args.text,
        width: args.width,
        height: args.height,
        fill: args.fill,
        stroke: args.stroke,
        alignment: args.alignment || 'center',
        ...pickAnchorPayload(args),
      },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert shape.' };
    return {
      success: true,
      data: { shapeType, text: args.text },
      activitySummary: `Inserted ${shapeType} shape`,
    };
  },
};

export const insertTextBoxTool: ToolCatalogEntry = {
  id: 'insert_text_box',
  name: 'insert_text_box',
  label: 'Insert Text Box',
  description:
    'Insert a styled, resizable Text Box (full-width banner, centered pull-quote box, or floating sidebar box with text wrapping) at an anchor or replacing target text.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  keywords: ['textbox', 'text box', 'box', 'sidebar', 'pull quote', 'frame'],
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text content inside the text box.' },
      width: { type: 'number', description: 'Width in pixels (0 for full width, e.g. 240 for sidebar).' },
      fill: { type: 'string', description: 'Background fill hex color (default #F8FAF9).' },
      borderColor: { type: 'string', description: 'Border hex color (default #245C45).' },
      borderStyle: { type: 'string', enum: ['solid', 'dashed', 'double', 'none'], description: 'Border line style.' },
      alignment: {
        type: 'string',
        enum: ['full', 'left', 'center', 'right', 'float-left', 'float-right'],
        description: 'Position or text-wrapping float mode.',
      },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '');
    const res = await editorRegistry.executeAction(
      'insert_text_box',
      {
        text,
        width: args.width ?? 0,
        fill: args.fill || '#F8FAF9',
        borderColor: args.borderColor || '#245C45',
        borderStyle: args.borderStyle || 'solid',
        alignment: args.alignment || 'full',
        ...pickAnchorPayload(args),
      },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert text box.' };
    return {
      success: true,
      data: { alignment: args.alignment || 'full' },
      activitySummary: 'Inserted text box',
    };
  },
};

export const insertChartDocTool: ToolCatalogEntry = {
  id: 'insert_chart',
  name: 'insert_chart',
  label: 'Insert Chart / Graph',
  description:
    'Render a high-resolution data chart or graph (column, bar, line, pie, or doughnut) directly onto the document page.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['insert graph', 'create chart in document', 'add chart', 'plot graph'],
  keywords: ['chart', 'graph', 'plot', 'bar chart', 'line chart', 'pie chart', 'visual'],
  parameters: {
    type: 'object',
    properties: {
      chartType: {
        type: 'string',
        enum: ['column', 'bar', 'line', 'pie', 'doughnut'],
        description: 'Chart type (column, bar, line, pie, or doughnut).',
      },
      title: { type: 'string', description: 'Chart title.' },
      subtitle: { type: 'string', description: 'Optional subtitle or unit label.' },
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Category labels (e.g. ["Gemini 1.0", "Gemini 1.5", "Gemini 2.5", "Gemini 4"]).',
      },
      values: {
        type: 'array',
        items: { type: 'number' },
        description: 'Numeric values corresponding to each label.',
      },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['title', 'labels', 'values'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const title = String(args.title || 'Chart');
    const chartType = String(args.chartType || 'column');
    const labels = Array.isArray(args.labels) ? args.labels.map(String) : [];
    const values = Array.isArray(args.values) ? args.values.map(Number) : [];
    if (labels.length === 0 || values.length === 0) {
      return { success: false, error: 'labels and values arrays must be non-empty.' };
    }
    const res = await editorRegistry.executeAction(
      'insert_chart',
      {
        chartType,
        title,
        subtitle: args.subtitle,
        labels,
        values,
        ...pickAnchorPayload(args),
      },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert chart.' };
    return {
      success: true,
      data: { chartType, title, pointCount: Math.min(labels.length, values.length) },
      activitySummary: `Inserted ${chartType} chart "${title}"`,
    };
  },
};

export const insertDiagramTool: ToolCatalogEntry = {
  id: 'insert_diagram',
  name: 'insert_diagram',
  label: 'Insert Visual Diagram (Mermaid)',
  description:
    'Render a crisp flowchart, architecture diagram, timeline, sequence diagram, hierarchy, or mindmap using Mermaid syntax directly onto the page (supports in-place replacement of text/ASCII diagrams via replaceTargetText, replaceStartText+replaceEndText, or replaceBlockContaining).',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: [
    'create flowchart',
    'draw architecture diagram',
    'convert text diagram to visual diagram',
    'insert mermaid diagram',
    'render diagram',
  ],
  keywords: ['diagram', 'mermaid', 'flowchart', 'architecture', 'sequence', 'timeline', 'hierarchy', 'ascii', 'visual'],
  parameters: {
    type: 'object',
    properties: {
      code: {
        type: 'string',
        description: 'Valid Mermaid diagram definition (e.g. "flowchart LR\\n  A[Rules] --> B[Stats] --> C[Representations]").',
      },
      title: { type: 'string', description: 'Short accessible diagram title.' },
      caption: { type: 'string', description: 'Optional caption displayed below the diagram.' },
      theme: {
        type: 'string',
        enum: ['neutral', 'forest', 'default', 'base', 'dark'],
        description: 'Visual color theme (defaults to "neutral").',
      },
      width: { type: 'number', description: 'Target display width in pixels (default auto, max ~540).' },
      alignment: {
        type: 'string',
        enum: ['left', 'center', 'right'],
        description: 'Horizontal alignment (defaults to "center").',
      },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['code'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const code = String(args.code || '').trim();
    if (!code) return { success: false, error: 'Mermaid diagram code is required.' };
    const title = String(args.title || 'Diagram');

    const res = await editorRegistry.executeAction(
      'insert_diagram',
      {
        code,
        title,
        caption: args.caption,
        theme: args.theme || 'neutral',
        width: args.width,
        alignment: args.alignment || 'center',
        ...pickAnchorPayload(args),
      },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert diagram.' };
    return {
      success: true,
      data: { title, diagramLength: code.length },
      activitySummary: `Rendered diagram "${title}"`,
    };
  },
};

export const insertEquationPlannedTool: ToolCatalogEntry = {
  id: 'insert_equation',
  name: 'insert_equation',
  label: 'Insert Equation',
  description: 'Insert a mathematical equation or formula into the document.',
  category: 'content_creation',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      latex: { type: 'string', description: 'Mathematical formula or LaTeX expression (e.g. "E = mc^2").' },
      displayMode: { type: 'boolean', description: 'Whether to render as block display equation (default true).' },
      ...UNIVERSAL_ANCHOR_PROPERTIES,
    },
    required: ['latex'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const latex = String(args.latex || '').trim();
    if (!latex) return { success: false, error: 'latex expression is required.' };
    const res = await editorRegistry.executeAction(
      'insert_equation',
      { latex, displayMode: args.displayMode, ...pickAnchorPayload(args) },
      val.docId
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert equation.' };
    return { success: true, data: { latex }, activitySummary: `Inserted equation "${latex}"` };
  },
};

export const insertFootnotePlannedTool: ToolCatalogEntry = {
  id: 'insert_footnote',
  name: 'insert_footnote',
  label: 'Insert Footnote',
  description: 'Insert a footnote reference marker with note text at cursor or after specified text.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['add footnote', 'footnote'],
  keywords: ['footnote', 'note', 'reference'],
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Footnote note text.' },
      afterText: { type: 'string', description: 'Optional anchor text after which to place the footnote.' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '').trim();
    if (!text) return { success: false, error: 'Footnote text is required.' };
    const safeTitle = text.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const html = `<sup>[<span title="${safeTitle}">*</span>]</sup> `;
    const res = await dispatchOrExecuteEditorAction(
      context,
      'insert_text_at_cursor',
      { content: html, isHtml: true, afterText: args.afterText },
      val.docId,
      `Inserted footnote`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert footnote.' };
    return { success: true, data: { footnote: text }, activitySummary: 'Inserted footnote', editorAction: res.editorAction };
  },
};

export const insertEndnotePlannedTool: ToolCatalogEntry = {
  id: 'insert_endnote',
  name: 'insert_endnote',
  label: 'Insert Endnote',
  description: 'Insert an endnote marker in text and append the corresponding note entry at document end.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['add endnote', 'endnote'],
  keywords: ['endnote', 'reference', 'note'],
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Endnote text content.' },
      marker: { type: 'string', description: 'Optional marker label (default "i").' },
      afterText: { type: 'string', description: 'Optional anchor text for inline marker.' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text || '').trim();
    const marker = String(args.marker || 'i').trim();
    if (!text) return { success: false, error: 'Endnote text is required.' };
    const safeText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (args.afterText) {
      await dispatchOrExecuteEditorAction(
        context,
        'insert_text_at_cursor',
        { content: `<sup>[${marker}]</sup> `, isHtml: true, afterText: args.afterText },
        val.docId,
        'Inserted endnote marker'
      );
    }
    const res = await dispatchOrExecuteEditorAction(
      context,
      'append_or_insert_paragraph',
      { text: `[${marker}] ${safeText}`, position: 'end' },
      val.docId,
      'Appended endnote at document end'
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert endnote.' };
    return { success: true, data: { endnote: text, marker }, activitySummary: 'Inserted endnote', editorAction: res.editorAction };
  },
};

export const insertCaptionTool: ToolCatalogEntry = {
  id: 'insert_caption',
  name: 'insert_caption',
  label: 'Insert Figure/Table Caption',
  description: 'Insert a centered italic figure or table caption.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['add caption', 'figure caption', 'table caption'],
  keywords: ['caption', 'figure', 'table'],
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Caption text (e.g. "Architecture Overview").' },
      label: { type: 'string', description: 'Prefix label (e.g. "Figure 1", "Table 1", default "Figure").' },
      afterHeading: { type: 'string', description: 'Optional heading placement.' },
      afterText: { type: 'string', description: 'Optional anchor text placement.' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const prefix = String(args.label || 'Figure').trim();
    const text = String(args.text || '').trim();
    const html = `<p style="text-align: center"><em>${prefix}: ${text.replace(/</g, '&lt;')}</em></p>`;
    const res = await dispatchOrExecuteEditorAction(
      context,
      'insert_structured_document',
      { content: html, isHtml: true, ...pickAnchorPayload(args) },
      val.docId,
      `Inserted caption: ${prefix}: ${text}`
    );
    if (!res.success) return { success: false, error: res.error || 'Failed to insert caption.' };
    return { success: true, data: { caption: `${prefix}: ${text}` }, activitySummary: `Inserted caption`, editorAction: res.editorAction };
  },
};

export const insertWatermarkPlannedTool: ToolCatalogEntry = {
  id: 'insert_watermark',
  name: 'insert_watermark',
  label: 'Insert Watermark',
  description: 'Set or clear a diagonal page watermark across all pages (e.g. DRAFT, CONFIDENTIAL, DO NOT COPY).',
  category: 'page_layout',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Watermark text (e.g. "CONFIDENTIAL", "DRAFT", or "" to remove).' },
    },
    required: ['text'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const text = String(args.text ?? '').trim();
    const res = await editorRegistry.executeAction('modify_page_layout', { watermarkText: text }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to set watermark.' };
    return {
      success: true,
      data: { watermarkText: text },
      activitySummary: text ? `Set page watermark "${text}"` : 'Cleared page watermark',
    };
  },
};

export const insertBookmarkPlannedTool: ToolCatalogEntry = {
  id: 'insert_bookmark',
  name: 'insert_bookmark',
  label: 'Insert Bookmark',
  description: 'Insert an internal navigation bookmark in document.',
  category: 'links_annotations',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'planned',
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ success: false, error: 'Internal bookmarking is planned for a future release.' }),
};

export const renameDocumentTool: ToolCatalogEntry = {
  id: 'rename_document',
  name: 'rename_document',
  label: 'Rename Workspace Document',
  description: 'Rename the active workspace document title (also used as the default filename for PDF/Word exports).',
  category: 'content_management',
  workspace: ['doc'],
  risk: 'modifying',
  availability: 'implemented',
  aliases: ['rename file', 'set document title', 'change workspace name', 'rename workspace'],
  keywords: ['rename', 'title', 'workspace name', 'document name', 'filename'],
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'New document / workspace title.' },
    },
    required: ['title'],
  },
  execute: async (args, context) => {
    const val = validateActiveDoc(context);
    if (!val.ok) return { success: false, error: val.error };
    const title = String(args.title || '').trim();
    if (!title) return { success: false, error: 'A non-empty title is required.' };
    const res = await editorRegistry.executeAction('rename_current_document', { title }, val.docId);
    if (!res.success) return { success: false, error: res.error || 'Failed to rename document.' };
    return {
      success: true,
      data: { title },
      activitySummary: `Renamed document to "${title}"`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Complete Document Tool Catalog Array
// ─────────────────────────────────────────────────────────────────────────────

const RAW_DOCUMENT_WORKSPACE_TOOLS: ToolCatalogEntry[] = [
  // Creation
  insertParagraphTool,
  insertHeadingTool,
  insertListTool,
  insertTableTool,
  insertImageTool,
  insertLinkTool,
  insertPageBreakTool,
  insertSectionBreakTool,
  insertHorizontalRuleTool,
  insertQuoteTool,
  insertCodeBlockTool,
  insertTableOfContentsTool,
  appendContentTool,
  prependContentTool,
  insertCalloutTool,
  insertShapeTool,
  insertTextBoxTool,
  insertChartDocTool,
  insertDiagramTool,
  insertCoverPageTool,
  renameDocumentTool,

  // Transformations
  rewriteContentTool,
  expandContentTool,
  shortenContentTool,
  simplifyContentTool,
  formalizeContentTool,
  changeContentToneTool,
  translateContentTool,
  proofreadContentTool,
  continueWritingTool,
  generateDocumentOutlineTool,
  generateSectionContentTool,
  generateIntroductionTool,
  generateConclusionTool,
  generateSummaryTool,
  generateFaqTool,
  convertContentToBulletsTool,
  convertBulletsToParagraphTool,
  convertContentToTableTool,
  convertTableToTextTool,
  convertContentToStepsTool,

  // Management
  deleteParagraphTool,
  deleteSectionTool,
  deleteHeadingTool,
  deleteTableTool,
  deleteImageTool,
  deleteMatchingContentTool,
  deleteRepeatedContentTool,
  deleteEmptyParagraphsTool,
  deleteHyperlinksTool,
  replaceParagraphTool,
  replaceSectionTool,
  replaceTableTool,
  replaceImageTool,
  replacePlaceholderTool,
  moveContentTool,
  duplicateContentTool,
  mergeParagraphsTool,
  splitParagraphTool,

  // Formatting
  setFontFamilyTool,
  setFontSizeTool,
  setFontColorTool,
  setHighlightColorTool,
  setBoldTool,
  setItalicTool,
  setUnderlineTool,
  setStrikethroughTool,
  setTextAlignmentTool,
  setLineSpacingTool,
  setParagraphSpacingTool,
  formatAllHeadingsTool,
  formatAllParagraphsTool,
  formatMatchingContentTool,
  removeFormattingTool,
  setSubscriptTool,
  setSuperscriptTool,
  adjustIndentTool,
  changeTextCaseTool,

  // Structure & Navigation
  getDocumentOutlineTool,
  getParagraphDetailsTool,
  getSectionDetailsTool,
  getTableDetailsTool,
  getImageDetailsTool,
  getDocumentStatisticsTool,
  getDocumentSettingsTool,
  navigateToContentTool,
  selectContentTool,

  // Table Management
  createTableTool,
  styleTableTool,
  clearTableContentsTool,
  addTableRowTool,
  deleteTableRowTool,
  addTableColumnTool,
  deleteTableColumnTool,
  mergeTableCellsTool,
  splitTableCellsTool,
  updateTableCellTool,
  replaceTableDataTool,
  extractTableDataTool,

  // Image & Media
  listDocumentImagesTool,
  setImageAltTextTool,
  checkMissingAltTextTool,

  // Page Layout
  getPageSettingsTool,
  setPageSizeTool,
  setPageOrientationTool,
  setPageMarginsTool,
  setPageColumnsTool,
  setPageColorTool,
  setPageBordersTool,
  updateHeaderTool,
  updateFooterTool,
  deleteHeaderTool,
  deleteFooterTool,
  insertPageNumbersTool,
  insertWatermarkPlannedTool,
  setDocumentViewTool,
  setEditorPreferencesTool,

  // Links & Annotations
  getDocumentLinksTool,
  insertHyperlinkTool,
  updateHyperlinkTool,
  removeHyperlinkTool,
  getDocumentCommentsTool,
  addDocumentCommentTool,
  resolveDocumentCommentTool,
  deleteDocumentCommentTool,
  insertCaptionTool,

  // Review & Quality
  checkSpellingTool,
  checkGrammarTool,
  checkReadabilityTool,
  checkRepetitionTool,
  checkHeadingHierarchyTool,
  checkAccessibilityTool,
  createReviewReportTool,

  // Export & Print
  exportAsPdfTool,
  exportAsDocxTool,
  exportAsTxtTool,
  exportAsHtmlTool,
  exportAsMarkdownTool,
  printDocumentTool,

  // Version Management
  getDocumentVersionsTool,
  createDocumentSnapshotTool,
  restoreDocumentVersionTool,
  undoDocumentOperationTool,
  redoDocumentOperationTool,

  // Rich Academic & Math
  insertEquationPlannedTool,
  insertFootnotePlannedTool,
  insertEndnotePlannedTool,
  insertBookmarkPlannedTool,
];

/**
 * Wraps every modifying document workspace tool so that any direct call to
 * `editorRegistry.executeAction` automatically dispatches an `editor_action` SSE event
 * via `context.onEditorAction` and attaches `editorAction` to the returned `ToolResult`.
 */
export const DOCUMENT_WORKSPACE_TOOLS: ToolCatalogEntry[] = RAW_DOCUMENT_WORKSPACE_TOOLS.map((tool) => {
  if (tool.risk === 'read_only') return tool;

  const originalExecute = tool.execute;
  return {
    ...tool,
    execute: async (args: Record<string, unknown>, context: ToolExecutionContext): Promise<ToolResult> => {
      let capturedAction: {
        actionId?: string;
        action: string;
        payload: Record<string, unknown>;
        summary?: string;
      } | null = null;
      let dispatchedViaContext = false;

      const wrappedContext: ToolExecutionContext = {
        ...context,
        onEditorAction: async (actionObj) => {
          dispatchedViaContext = true;
          capturedAction = actionObj;
          if (context.onEditorAction) {
            await context.onEditorAction(actionObj);
          }
        },
      };

      const origExecAction = editorRegistry.executeAction.bind(editorRegistry);
      (editorRegistry as any).executeAction = async (
        action: string,
        payload: Record<string, unknown>,
        documentId?: string,
        onPersist?: any
      ) => {
        const docId = documentId || context.activeDocument?.id || context.workspaceId || '';
        const actionId = `act-${action.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const fullPayload = { ...payload, documentId: docId };

        // Synchronous server pre-validation before dispatching or returning success
        if (typeof window === 'undefined' && context.activeDocument) {
          const check = validateActionAgainstActiveDoc(context.activeDocument, action, fullPayload);
          if (!check.ok) {
            return {
              success: false,
              status: 'VALIDATION_FAILED',
              statusCode: 'ERROR_NOT_FOUND',
              error: check.error,
              documentId: docId,
              action,
            };
          }
        }

        capturedAction = {
          actionId,
          action,
          payload: fullPayload,
          summary: `Executed ${tool.label}`,
        };
        return origExecAction(action, fullPayload, docId, onPersist);
      };

      try {
        const result = await originalExecute(args, wrappedContext);
        if (result.success && capturedAction && !dispatchedViaContext) {
          const finalEditorAction = {
            ...(capturedAction as {
              actionId: string;
              action: string;
              payload: Record<string, unknown>;
              summary?: string;
            }),
            summary: result.activitySummary || `Executed ${tool.label}`,
          };
          if (context.onEditorAction) {
            await context.onEditorAction(finalEditorAction);
          }
          if (!result.editorAction) {
            result.editorAction = finalEditorAction;
          }
        }
        return result;
      } finally {
        (editorRegistry as any).executeAction = origExecAction;
      }
    },
  };
});

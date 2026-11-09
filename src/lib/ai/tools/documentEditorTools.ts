/**
 * Universal AI Agent — Document Workspace Interactive Tools
 * Provides direct reading, navigation, structural analysis, Tiptap-level editing,
 * and management tools for the active document workspace.
 */

import { ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import { ActiveDocumentHeading } from '@/lib/types';
import { editorRegistry } from '@/lib/editor/editorRegistry';
import { searchProseMirrorDoc, findSectionByHeading } from '@/lib/editor/documentSearch';

// Helper to strip HTML tags for plain text search
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Helper to parse headings from Markdown or HTML content
function extractHeadingsFromContent(content: string): ActiveDocumentHeading[] {
  const headings: ActiveDocumentHeading[] = [];
  if (!content) return headings;

  // 1. Try HTML heading tags (<h1> to <h6>)
  const htmlRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = htmlRegex.exec(content)) !== null) {
    const level = parseInt(match[1], 10);
    const rawText = match[2].replace(/<[^>]*>/g, '').trim();
    if (rawText) {
      headings.push({ level, text: rawText, pos: match.index });
    }
  }

  if (headings.length > 0) return headings;

  // 2. Fallback to Markdown headings (# to ######)
  const mdRegex = /^(#{1,6})\s+(.+)$/gm;
  while ((match = mdRegex.exec(content)) !== null) {
    const level = match[1].length;
    const rawText = match[2].trim();
    if (rawText) {
      headings.push({ level, text: rawText, pos: match.index });
    }
  }

  return headings;
}

// Helper to extract surrounding paragraph context
function extractSurroundingSnippet(fullText: string, offset: number, queryLen: number): string {
  const start = Math.max(0, offset - 60);
  const end = Math.min(fullText.length, offset + queryLen + 60);
  let snippet = fullText.slice(start, end).replace(/\s+/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < fullText.length) snippet = snippet + '...';
  return snippet;
}

// Generate unique, stable action request IDs to guarantee idempotent dispatch
function generateActionId(prefix = 'act'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// Rigorous server-side validation to enforce active-document-only modification permission boundary
function validateActiveDocumentForEdit(
  context: ToolExecutionContext,
  requestedDocId?: string
): { ok: true } | { ok: false; error: string; summary: string } {
  const activeDoc = context.activeDocument;
  if (!activeDoc) {
    return {
      ok: false,
      error: 'No active document is currently loaded in this workspace.',
      summary: 'No active document loaded',
    };
  }

  if (context.workspaceType && context.workspaceType !== 'doc') {
    return {
      ok: false,
      error: `Document editing tools cannot be applied in a "${context.workspaceType}" workspace.`,
      summary: 'Invalid workspace format',
    };
  }

  // Strict permission boundary: reject attempts to modify any document other than the active one
  if (requestedDocId && requestedDocId !== activeDoc.id && requestedDocId !== context.workspaceId) {
    return {
      ok: false,
      error: `Permission denied: Cannot edit document "${requestedDocId}". Only the currently active document "${activeDoc.title || activeDoc.id}" can be modified. To edit another document, open it as the active document first.`,
      summary: 'Permission denied for non-active document',
    };
  }

  if (activeDoc.editorMounted === false) {
    return {
      ok: false,
      error: `No active document editor is currently mounted for document "${activeDoc.title || activeDoc.id}". Ensure the document is open and active in the editor.`,
      summary: 'Editor not mounted',
    };
  }

  if (activeDoc.isEditable === false) {
    return {
      ok: false,
      error: `Document "${activeDoc.title || activeDoc.id}" is read-only. Edits cannot be applied.`,
      summary: 'Document is read-only',
    };
  }

  return { ok: true };
}

// ============================================================================
// 1. READING & NAVIGATION TOOLS
// ============================================================================

export const readActiveDocumentStructureTool: ToolDefinition = {
  name: 'read_active_document_structure',
  label: 'Read Document Structure',
  description: 'Returns headings, outline structure, sections, word count, and character count of the active document.',
  activityLabel: 'Analyzing document structure',
  parameters: {
    type: 'object',
    properties: {
      maxHeadings: {
        type: 'number',
        description: 'Maximum number of outline headings to return (default 50).',
      },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    if (!activeDoc) {
      return {
        success: false,
        error: 'No active document is currently loaded in this workspace.',
        activitySummary: 'No active document found',
      };
    }

    const content = activeDoc.content || '';
    const headings =
      activeDoc.headings && activeDoc.headings.length > 0
        ? activeDoc.headings
        : extractHeadingsFromContent(content);

    const maxHeadings = typeof args.maxHeadings === 'number' ? args.maxHeadings : 50;
    const limitedHeadings = headings.slice(0, maxHeadings);

    const words = activeDoc.wordCount ?? content.split(/\s+/).filter(Boolean).length;
    const chars = activeDoc.characterCount ?? content.length;

    return {
      success: true,
      data: {
        title: activeDoc.title,
        wordCount: words,
        characterCount: chars,
        headingCount: headings.length,
        headings: limitedHeadings,
        sectionsCount: Math.max(1, headings.length),
        outlineSummary:
          headings.length > 0
            ? headings.map((h) => `${'  '.repeat(Math.max(0, h.level - 1))}- H${h.level}: ${h.text}`).join('\n')
            : 'Document has no headings; standard linear body text.',
      },
      activitySummary: `Analyzed document outline (${headings.length} headings, ${words} words)`,
    };
  },
};

export const inspectActiveDocumentMetadataTool: ToolDefinition = {
  name: 'inspect_active_document_metadata',
  label: 'Inspect Document Metadata',
  description: 'Returns metadata for the active document: title, format, margins, word count, last modified, and reading time.',
  activityLabel: 'Reading document metadata',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    if (!activeDoc) {
      return {
        success: false,
        error: 'No active document is currently loaded.',
        activitySummary: 'No active document',
      };
    }

    const words = activeDoc.wordCount ?? (activeDoc.content || '').split(/\s+/).filter(Boolean).length;
    const chars = activeDoc.characterCount ?? (activeDoc.content || '').length;
    const readingTime = activeDoc.readingTime ?? Math.max(1, Math.ceil(words / 200));

    return {
      success: true,
      data: {
        id: activeDoc.id,
        title: activeDoc.title,
        format: activeDoc.format || 'doc',
        wordCount: words,
        characterCount: chars,
        readingTime: `${readingTime} min`,
        lastModified: activeDoc.lastModified || new Date().toISOString(),
        margins: activeDoc.margins || { top: 25.4, bottom: 25.4, left: 25.4, right: 25.4, preset: 'normal' },
        saveStatus: activeDoc.saveStatus || 'saved',
        hasUnsavedChanges: Boolean(activeDoc.hasUnsavedChanges),
      },
      activitySummary: `Metadata: "${activeDoc.title}" (${words} words, ${readingTime} min read)`,
    };
  },
};

export const readActiveDocumentSelectionTool: ToolDefinition = {
  name: 'read_active_document_selection',
  label: 'Read Document Selection',
  description: 'Returns the user’s currently selected text in the document editor, cursor position, and surrounding paragraph.',
  activityLabel: 'Checking document selection',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    const sel = activeDoc?.selection;

    if (!sel || !sel.hasSelection || !sel.selectedText) {
      return {
        success: true,
        data: {
          hasSelection: false,
          selectedText: '',
          cursorPosition: sel?.cursorPos ?? 0,
          surroundingParagraph: sel?.surroundingParagraph || '',
          message: 'No text is currently selected in the document editor. Cursor is positioned at ' + (sel?.cursorPos ?? 0) + '.',
        },
        activitySummary: 'No active text selection',
      };
    }

    return {
      success: true,
      data: {
        hasSelection: true,
        selectedText: sel.selectedText,
        characterCount: sel.selectedText.length,
        from: sel.from,
        to: sel.to,
        cursorPosition: sel.cursorPos,
        surroundingParagraph: sel.surroundingParagraph,
      },
      activitySummary: `Active selection (${sel.selectedText.length} chars)`,
    };
  },
};

export const searchDocumentTextTool: ToolDefinition = {
  name: 'search_document_text',
  label: 'Search Document Text',
  description: 'Searches the active document for keywords, phrases, or regex patterns, returning character offsets and line context.',
  activityLabel: 'Searching document contents',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Text string, phrase, or regular expression pattern to search for.',
      },
      isRegex: {
        type: 'boolean',
        description: 'Set to true if query is a regular expression pattern.',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether search is case-sensitive (default false).',
      },
    },
    required: ['query'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    if (!activeDoc || !activeDoc.content) {
      return {
        success: false,
        error: 'No active document content available to search.',
        activitySummary: 'Document content empty',
      };
    }

    const query = String(args.query || '').trim();
    if (!query) {
      return {
        success: false,
        error: 'Query parameter cannot be empty.',
        activitySummary: 'Empty search query',
      };
    }

    const isRegex = Boolean(args.isRegex);
    const caseSensitive = Boolean(args.caseSensitive);
    const rawContent = activeDoc.content;
    const plainText = stripHtml(rawContent);

    interface MatchItem {
      offset: number;
      line: number;
      context: string;
      exactMatch: string;
    }
    const matches: MatchItem[] = [];

    try {
      const flags = caseSensitive ? 'g' : 'gi';
      const regex = isRegex
        ? new RegExp(query, flags)
        : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

      let match: RegExpExecArray | null;
      let count = 0;
      const maxResults = 25;

      while ((match = regex.exec(plainText)) !== null && count < maxResults) {
        count++;
        const offset = match.index;
        const line = plainText.slice(0, offset).split('\n').length;
        const snippet = extractSurroundingSnippet(plainText, offset, match[0].length);
        matches.push({
          offset,
          line,
          context: snippet,
          exactMatch: match[0],
        });
      }

      return {
        success: true,
        data: {
          query,
          totalMatches: matches.length,
          matches,
          truncated: count >= maxResults,
        },
        activitySummary: `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}"`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid search pattern';
      return {
        success: false,
        error: `Search error: ${msg}`,
        activitySummary: 'Search failed',
      };
    }
  },
};

export const searchDocumentContentTool: ToolDefinition = {
  name: 'search_document_content',
  label: 'Search Document Content',
  description: 'Searches the active document using the ProseMirror document model. Returns exact match offsets, match counts, surrounding context snippets, and containing heading/section paths.',
  activityLabel: 'Searching document content',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Text string, phrase, or keyword to search for.',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Set to true for case-sensitive matching.',
      },
      matchWholeWord: {
        type: 'boolean',
        description: 'Set to true to match whole words only.',
      },
    },
    required: ['query'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    if (!activeDoc) {
      return { success: false, error: 'No active document loaded.', activitySummary: 'No active document' };
    }
    const query = String(args.query || '').trim();
    if (!query) {
      return { success: false, error: 'Query parameter cannot be empty.', activitySummary: 'Empty query' };
    }

    const editor = editorRegistry.getEditor(activeDoc.id);
    if (editor && !editor.isDestroyed) {
      const res = searchProseMirrorDoc(editor.state.doc, {
        query,
        caseSensitive: Boolean(args.caseSensitive),
        matchWholeWord: Boolean(args.matchWholeWord),
      });
      return {
        success: true,
        data: res,
        activitySummary: `Found ${res.totalMatches} match${res.totalMatches === 1 ? '' : 'es'} for "${query}"`,
      };
    }

    // Fallback: search plain text content
    const plainText = stripHtml(activeDoc.content || '');
    const flags = args.caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const matches: Array<{ matchIndex: number; from: number; to: number; snippet: string }> = [];
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = regex.exec(plainText)) !== null && idx < 25) {
      matches.push({
        matchIndex: idx++,
        from: m.index,
        to: m.index + m[0].length,
        snippet: extractSurroundingSnippet(plainText, m.index, m[0].length),
      });
    }

    return {
      success: true,
      data: { query, totalMatches: matches.length, matches },
      activitySummary: `Found ${matches.length} match${matches.length === 1 ? '' : 'es'} for "${query}"`,
    };
  },
};

export const locateDocumentSectionTool: ToolDefinition = {
  name: 'locate_document_section',
  label: 'Locate Document Section',
  description: 'Locates a section by heading title. Returns the section range, heading level, word count, and text excerpt.',
  activityLabel: 'Locating document section',
  parameters: {
    type: 'object',
    properties: {
      headingQuery: {
        type: 'string',
        description: 'Heading title or keyword to locate.',
      },
    },
    required: ['headingQuery'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    if (!activeDoc) {
      return { success: false, error: 'No active document loaded.', activitySummary: 'No active document' };
    }
    const query = String(args.headingQuery || '').trim();
    const editor = editorRegistry.getEditor(activeDoc.id);

    if (editor && !editor.isDestroyed) {
      const section = findSectionByHeading(editor.state.doc, query);
      if (section.found) {
        return {
          success: true,
          data: section,
          activitySummary: `Located section "${section.headingText}" (${section.wordCount || 0} words)`,
        };
      }
      return {
        success: false,
        error: `Section matching "${query}" was not found in document "${activeDoc.title}".`,
        activitySummary: `Section "${query}" not found`,
      };
    }

    const matched = activeDoc.headings?.find((h) => h.text.toLowerCase().includes(query.toLowerCase()));
    if (matched) {
      return {
        success: true,
        data: { found: true, headingText: matched.text, level: matched.level, pos: matched.pos },
        activitySummary: `Located heading "${matched.text}" (H${matched.level})`,
      };
    }

    return {
      success: false,
      error: `Heading "${query}" not found in document "${activeDoc.title}".`,
      activitySummary: `Heading "${query}" not found`,
    };
  },
};

export const findAndReplaceTextTool: ToolDefinition = {
  name: 'find_and_replace_text',
  label: 'Find and Replace Text',
  description: 'Finds matching text and replaces a specific occurrence (matchIndex, 0-based) or all occurrences in the active document.',
  activityLabel: 'Replacing document text',
  parameters: {
    type: 'object',
    properties: {
      findText: {
        type: 'string',
        description: 'Text string to search for.',
      },
      replaceText: {
        type: 'string',
        description: 'Replacement text.',
      },
      matchIndex: {
        type: 'number',
        description: 'Optional 0-based index of the specific match to replace (0 = first match). Leave empty to replace all occurrences.',
      },
      caseSensitive: {
        type: 'boolean',
        description: 'Whether search is case-sensitive.',
      },
      matchWholeWord: {
        type: 'boolean',
        description: 'Whether to match whole words only.',
      },
    },
    required: ['findText', 'replaceText'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const findText = String(args.findText || '');
    const replaceText = String(args.replaceText ?? '');
    const matchIndex = typeof args.matchIndex === 'number' ? args.matchIndex : undefined;
    const caseSensitive = Boolean(args.caseSensitive);
    const matchWholeWord = Boolean(args.matchWholeWord);

    const actionId = generateActionId('act-replace');
    const actionEvent = {
      actionId,
      action: 'find_and_replace_text' as const,
      payload: {
        actionId,
        documentId: context.activeDocument?.id || context.workspaceId,
        findText,
        replaceText,
        matchIndex,
        caseSensitive,
        matchWholeWord,
      },
      summary: matchIndex !== undefined
        ? `Replaced match #${matchIndex + 1} of "${findText}"`
        : `Replaced occurrences of "${findText}" with "${replaceText}"`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: { findText, replaceText, matchIndex, actionId },
      editorAction: actionEvent,
      activitySummary: actionEvent.summary,
    };
  },
};

export const navigateToDocumentHeadingTool: ToolDefinition = {
  name: 'navigate_to_document_heading',
  label: 'Navigate to Heading',
  description: 'Locates a heading in the document by name or level and centers the editor view on it.',
  activityLabel: 'Navigating document heading',
  parameters: {
    type: 'object',
    properties: {
      headingText: {
        type: 'string',
        description: 'Text or title of the heading to find and navigate to.',
      },
      level: {
        type: 'number',
        description: 'Optional heading level (1 to 6) to narrow down the search.',
      },
    },
    required: ['headingText'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    const targetText = String(args.headingText || '').toLowerCase().trim();
    const targetLevel = args.level ? Number(args.level) : undefined;

    const headings =
      activeDoc?.headings && activeDoc.headings.length > 0
        ? activeDoc.headings
        : extractHeadingsFromContent(activeDoc?.content || '');

    const found = headings.find((h) => {
      const matchText = h.text.toLowerCase().includes(targetText);
      const matchLevel = targetLevel ? h.level === targetLevel : true;
      return matchText && matchLevel;
    });

    if (!found) {
      return {
        success: false,
        error: `Heading "${args.headingText}" was not found in the document outline.`,
        activitySummary: `Heading "${args.headingText}" not found`,
      };
    }

    const actionEvent = {
      action: 'navigate_to_document_heading' as const,
      payload: {
        headingText: found.text,
        level: found.level,
        pos: found.pos,
      },
      summary: `Navigated to H${found.level} "${found.text}"`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        found: true,
        heading: found,
      },
      editorAction: actionEvent,
      activitySummary: `Navigated to H${found.level} "${found.text}"`,
    };
  },
};

// ============================================================================
// 2. CONTENT EDITING TOOLS (Tiptap Transactions Single Source of Truth)
// ============================================================================

export const insertTextAtCursorTool: ToolDefinition = {
  name: 'insert_text_at_cursor',
  label: 'Insert Text at Cursor',
  description: 'Inserts formatted text or Markdown content directly at the current cursor location in the document editor.',
  activityLabel: 'Inserting text at cursor',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text or Markdown content to insert at the active cursor position.',
      },
    },
    required: ['text'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const text = String(args.text || '');
    if (!text) {
      return {
        success: false,
        error: 'Content to insert cannot be empty.',
        activitySummary: 'Empty text to insert',
      };
    }

    const actionId = generateActionId('act-cursor');
    const actionEvent = {
      actionId,
      action: 'insert_text_at_cursor' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, text },
      summary: `Inserted text (${text.length} chars)`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        inserted: true,
        actionId,
        length: text.length,
      },
      editorAction: actionEvent,
      activitySummary: `Inserted text at cursor (${text.length} chars)`,
    };
  },
};

export const replaceSelectedTextTool: ToolDefinition = {
  name: 'replace_selected_text',
  label: 'Replace Selected Text',
  description: 'Replaces the currently selected text in the document editor with new content, preserving undo history.',
  activityLabel: 'Replacing selected text',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'New content to replace the current selection with.',
      },
      confirmed: {
        type: 'boolean',
        description: 'Explicit confirmation flag required if replacing a large selection (> 500 characters).',
      },
    },
    required: ['text'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const text = String(args.text || '');
    const sel = context.activeDocument?.selection;
    const selectedLen = sel?.selectedText ? sel.selectedText.length : 0;

    // Destructive change guard: require confirmation if replacing large section
    if (selectedLen > 500 && !args.confirmed) {
      return {
        success: false,
        error: `Destructive replacement safeguard: The current selection is large (${selectedLen} characters). Please ask the user to confirm this replacement before proceeding, and pass confirmed=true.`,
        activitySummary: 'Safeguard: Large replacement requires confirmation',
      };
    }

    const actionId = generateActionId('act-replace');
    const actionEvent = {
      actionId,
      action: 'replace_selected_text' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, text },
      summary: `Replaced selection (${selectedLen} chars with ${text.length} chars)`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        replaced: true,
        actionId,
        previousLength: selectedLen,
        newLength: text.length,
      },
      editorAction: actionEvent,
      activitySummary: `Replaced selection with ${text.length} chars`,
    };
  },
};

export const deleteSelectedContentTool: ToolDefinition = {
  name: 'delete_selected_content',
  label: 'Delete Selected Content',
  description: 'Deletes the currently selected text or element in the document editor, maintaining undo/redo history.',
  activityLabel: 'Deleting selected content',
  parameters: {
    type: 'object',
    properties: {
      confirmed: {
        type: 'boolean',
        description: 'Explicit confirmation flag required if deleting a large selection (> 500 characters).',
      },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const sel = context.activeDocument?.selection;
    if (!sel || !sel.hasSelection || !sel.selectedText) {
      return {
        success: false,
        error: 'No content is currently selected to delete.',
        activitySummary: 'No selection to delete',
      };
    }

    const selectedLen = sel.selectedText.length;
    if (selectedLen > 500 && !args.confirmed) {
      return {
        success: false,
        error: `Destructive delete safeguard: The current selection is large (${selectedLen} characters). Please ask the user to confirm this deletion before proceeding, and pass confirmed=true.`,
        activitySummary: 'Safeguard: Large deletion requires confirmation',
      };
    }

    const actionId = generateActionId('act-delete');
    const actionEvent = {
      actionId,
      action: 'delete_selected_content' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId },
      summary: `Deleted ${selectedLen} characters`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        deleted: true,
        actionId,
        deletedCharacters: selectedLen,
      },
      editorAction: actionEvent,
      activitySummary: `Deleted ${selectedLen} characters`,
    };
  },
};

export const appendOrInsertParagraphTool: ToolDefinition = {
  name: 'append_or_insert_paragraph',
  label: 'Append or Insert Paragraph',
  description: 'Appends a paragraph to the end of the document, or inserts it after a specified heading.',
  activityLabel: 'Updating document paragraph',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Paragraph text or content to append or insert.',
      },
      position: {
        type: 'string',
        enum: ['end', 'start', 'cursor'],
        description: 'Placement of the paragraph: "end" (default), "start", or "cursor".',
      },
      afterHeading: {
        type: 'string',
        description: 'Optional heading name after which to insert the paragraph.',
      },
    },
    required: ['text'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const text = String(args.text || '').trim();
    if (!text) {
      return {
        success: false,
        error: 'Paragraph text cannot be empty.',
        activitySummary: 'Empty paragraph text',
      };
    }

    const position = (args.position as 'end' | 'start' | 'cursor') || 'end';
    const afterHeading = args.afterHeading ? String(args.afterHeading).trim() : undefined;

    const actionId = generateActionId('act-p');
    const actionEvent = {
      actionId,
      action: 'append_or_insert_paragraph' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, text, position, afterHeading },
      summary: afterHeading
        ? `Inserted paragraph after heading "${afterHeading}"`
        : `Appended paragraph at ${position}`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        success: true,
        actionId,
        position,
        afterHeading,
        length: text.length,
      },
      editorAction: actionEvent,
      activitySummary: afterHeading
        ? `Inserted paragraph after "${afterHeading}"`
        : `Appended paragraph at ${position} (${text.length} chars)`,
    };
  },
};

export const createOrEditHeadingTool: ToolDefinition = {
  name: 'create_or_edit_heading',
  label: 'Create or Edit Heading',
  description: 'Inserts a new heading (H1 to H6) or updates an existing heading in the active document.',
  activityLabel: 'Creating heading',
  parameters: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Heading text to create or update.',
      },
      level: {
        type: 'number',
        description: 'Heading level from 1 (H1) to 6 (H6). Default is 2.',
      },
      existingHeading: {
        type: 'string',
        description: 'Optional existing heading title to rename or edit.',
      },
    },
    required: ['text'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const text = String(args.text || '').trim();
    if (!text) {
      return {
        success: false,
        error: 'Heading text cannot be empty.',
        activitySummary: 'Empty heading text',
      };
    }

    const level = Math.min(6, Math.max(1, typeof args.level === 'number' ? args.level : 2));
    const existingHeading = args.existingHeading ? String(args.existingHeading).trim() : undefined;

    const actionId = generateActionId('act-heading');
    const actionEvent = {
      actionId,
      action: 'create_or_edit_heading' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, text, level, existingHeading },
      summary: existingHeading
        ? `Updated heading "${existingHeading}" to H${level} "${text}"`
        : `Created H${level} heading "${text}"`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        level,
        text,
        actionId,
        existingHeading,
      },
      editorAction: actionEvent,
      activitySummary: `Created H${level} heading "${text}"`,
    };
  },
};

export const createDocumentListTool: ToolDefinition = {
  name: 'create_document_list',
  label: 'Create Document List',
  description: 'Inserts a bulleted, numbered, or checklist item list into the active document editor.',
  activityLabel: 'Creating list',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of list item strings.',
      },
      listType: {
        type: 'string',
        enum: ['bullet', 'ordered', 'task'],
        description: 'List type: "bullet" (default), "ordered" (numbered), or "task" (checklist).',
      },
    },
    required: ['items'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const items = Array.isArray(args.items) ? (args.items as string[]).map((i) => String(i).trim()).filter(Boolean) : [];
    if (items.length === 0) {
      return {
        success: false,
        error: 'Items array must contain at least one item.',
        activitySummary: 'Empty list items',
      };
    }

    const listType = (args.listType as 'bullet' | 'ordered' | 'task') || 'bullet';

    const actionId = generateActionId('act-list');
    const actionEvent = {
      actionId,
      action: 'create_document_list' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, items, listType },
      summary: `Created ${listType} list with ${items.length} items`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        listType,
        count: items.length,
      },
      editorAction: actionEvent,
      activitySummary: `Created ${listType} list (${items.length} items)`,
    };
  },
};

export const insertDocumentTableTool: ToolDefinition = {
  name: 'insert_document_table',
  label: 'Insert Document Table',
  description: 'Inserts a formatted table with specified rows, columns, and optional headers into the document editor.',
  activityLabel: 'Inserting table',
  parameters: {
    type: 'object',
    properties: {
      headers: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of column header titles.',
      },
      rows: {
        type: 'array',
        items: { type: 'array', items: { type: 'string' } },
        description: '2D array of table row data cells.',
      },
      rowCount: {
        type: 'number',
        description: 'Optional row count if rows data is omitted (default 3).',
      },
      colCount: {
        type: 'number',
        description: 'Optional column count if headers are omitted (default 3).',
      },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const headers = Array.isArray(args.headers) ? (args.headers as string[]) : undefined;
    const rows = Array.isArray(args.rows) ? (args.rows as string[][]) : undefined;
    const rowCount = typeof args.rowCount === 'number' ? args.rowCount : rows?.length || 3;
    const colCount = typeof args.colCount === 'number' ? args.colCount : headers?.length || 3;

    const actionId = generateActionId('act-table');
    const actionEvent = {
      actionId,
      action: 'insert_document_table' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, headers, rows, rowCount, colCount },
      summary: `Inserted table (${rowCount} rows × ${colCount} cols)`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        rows: rowCount,
        cols: colCount,
        actionId,
        hasHeaders: Boolean(headers && headers.length > 0),
      },
      editorAction: actionEvent,
      activitySummary: `Inserted ${rowCount}×${colCount} table`,
    };
  },
};

export const insertHyperlinkTool: ToolDefinition = {
  name: 'insert_hyperlink',
  label: 'Insert Hyperlink',
  description: 'Attaches a hyperlink URL to the selected text, or inserts a new link with display text at cursor.',
  activityLabel: 'Inserting hyperlink',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The destination URL (must start with http:// or https://).',
      },
      text: {
        type: 'string',
        description: 'Optional display text if no text is currently selected in editor.',
      },
    },
    required: ['url'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const url = String(args.url || '').trim();
    if (!url) {
      return {
        success: false,
        error: 'URL parameter cannot be empty.',
        activitySummary: 'Missing hyperlink URL',
      };
    }

    const text = args.text ? String(args.text).trim() : undefined;

    const actionId = generateActionId('act-link');
    const actionEvent = {
      actionId,
      action: 'insert_hyperlink' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, url, text },
      summary: `Attached hyperlink: ${url}`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        url,
        text,
        actionId,
      },
      editorAction: actionEvent,
      activitySummary: `Inserted link to ${url}`,
    };
  },
};

export const formatDocumentTextTool: ToolDefinition = {
  name: 'format_document_text',
  label: 'Format Document Text',
  description: 'Applies formatting (bold, italic, underline, strikethrough, subscript, superscript, code, color, highlight, clear) to selected text or targeted matching text.',
  activityLabel: 'Formatting text',
  parameters: {
    type: 'object',
    properties: {
      formatting: {
        type: 'string',
        enum: ['bold', 'italic', 'underline', 'strike', 'subscript', 'superscript', 'code', 'color', 'highlight', 'clear'],
        description: 'Formatting operation to apply.',
      },
      value: {
        type: 'string',
        description: 'Color hex code (for "color") or highlight color (for "highlight").',
      },
      targetText: {
        type: 'string',
        description: 'Optional specific text in the document to format instead of the current selection.',
      },
    },
    required: ['formatting'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const formatting = String(args.formatting || '').toLowerCase();
    const value = args.value ? String(args.value) : undefined;
    const targetText = args.targetText ? String(args.targetText).trim() : undefined;

    const actionId = generateActionId('act-fmt');
    const actionEvent = {
      actionId,
      action: 'format_document_text' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, formatting, value, targetText },
      summary: targetText ? `Applied ${formatting} to "${targetText}"` : `Applied ${formatting} formatting`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: { formatting, value, targetText, actionId },
      editorAction: actionEvent,
      activitySummary: actionEvent.summary,
    };
  },
};

export const setFontStyleTool: ToolDefinition = {
  name: 'set_font_style',
  label: 'Set Font Style',
  description: 'Sets font family and/or font size for selected text or targeted matching text in the active document.',
  activityLabel: 'Setting font style',
  parameters: {
    type: 'object',
    properties: {
      fontFamily: {
        type: 'string',
        description: 'Font family: Inter, Geist, Georgia, Merriweather, Playfair Display, JetBrains Mono, Arial, Times New Roman.',
      },
      fontSize: {
        type: 'string',
        description: 'Font size with unit (e.g. "12pt", "14pt", "18pt", "24pt").',
      },
      targetText: {
        type: 'string',
        description: 'Optional specific text in the document to style instead of the current selection.',
      },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const fontFamily = args.fontFamily ? String(args.fontFamily) : undefined;
    const fontSize = args.fontSize ? String(args.fontSize) : undefined;
    const targetText = args.targetText ? String(args.targetText).trim() : undefined;

    const actionId = generateActionId('act-font');
    const actionEvent = {
      actionId,
      action: 'set_font_style' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, fontFamily, fontSize, targetText },
      summary: `Set font ${[fontFamily, fontSize].filter(Boolean).join(' ')}${targetText ? ` on "${targetText}"` : ''}`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { fontFamily, fontSize, targetText, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const setLineHeightTool: ToolDefinition = {
  name: 'set_line_height',
  label: 'Set Line Spacing',
  description: 'Sets line spacing (1.0, 1.15, 1.5, 2.0) and paragraph spacing (space before/after).',
  activityLabel: 'Setting line spacing',
  parameters: {
    type: 'object',
    properties: {
      lineHeight: {
        type: 'string',
        enum: ['1.0', '1.15', '1.5', '2.0'],
        description: 'Line height spacing factor.',
      },
      spaceBefore: {
        type: 'boolean',
        description: 'Add 14px space before paragraph.',
      },
      spaceAfter: {
        type: 'boolean',
        description: 'Add 14px space after paragraph.',
      },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const lineHeight = args.lineHeight ? String(args.lineHeight) : undefined;
    const spaceBefore = Boolean(args.spaceBefore);
    const spaceAfter = Boolean(args.spaceAfter);

    const actionId = generateActionId('act-lh');
    const actionEvent = {
      actionId,
      action: 'set_line_height' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, lineHeight, spaceBefore, spaceAfter },
      summary: `Set line spacing to ${lineHeight || 'custom'}`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { lineHeight, spaceBefore, spaceAfter, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const prependToDocumentTool: ToolDefinition = {
  name: 'prepend_to_document',
  label: 'Prepend to Document',
  description: 'Inserts content at the very beginning of the active document.',
  activityLabel: 'Prepending content',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Structured Markdown content to insert at the top.',
      },
    },
    required: ['content'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const content = String(args.content || '').trim();
    const actionId = generateActionId('act-prepend');
    const actionEvent = {
      actionId,
      action: 'prepend_to_document' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, content },
      summary: `Prepended content (${content.length} chars)`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { prepended: true, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const duplicateContentTool: ToolDefinition = {
  name: 'duplicate_content',
  label: 'Duplicate Content',
  description: 'Duplicates the current selection, current paragraph, or a specific heading section in the active document.',
  activityLabel: 'Duplicating content',
  parameters: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        enum: ['selection', 'heading'],
        description: '"selection" to duplicate selected text, or "heading" to duplicate a specific section.',
      },
      headingTitle: {
        type: 'string',
        description: 'Title of heading/section to duplicate if target is "heading".',
      },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const target = (args.target as string) || 'selection';
    const headingTitle = args.headingTitle ? String(args.headingTitle) : undefined;
    const actionId = generateActionId('act-dup');
    const actionEvent = {
      actionId,
      action: 'duplicate_content' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, target, headingTitle },
      summary: headingTitle ? `Duplicated section "${headingTitle}"` : 'Duplicated content',
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { duplicated: true, target, headingTitle, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const moveDocumentSectionTool: ToolDefinition = {
  name: 'move_document_section',
  label: 'Move Document Section',
  description: 'Moves an entire section (heading and its body text) to before or after another heading, or to start/end of document.',
  activityLabel: 'Moving section',
  parameters: {
    type: 'object',
    properties: {
      sourceHeading: {
        type: 'string',
        description: 'Title of heading/section to move.',
      },
      destinationHeading: {
        type: 'string',
        description: 'Title of reference destination heading.',
      },
      position: {
        type: 'string',
        enum: ['before', 'after', 'start', 'end'],
        description: 'Position relative to destination ("before", "after", "start", "end").',
      },
    },
    required: ['sourceHeading', 'position'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const sourceHeading = String(args.sourceHeading || '');
    const destinationHeading = args.destinationHeading ? String(args.destinationHeading) : undefined;
    const position = (args.position as 'before' | 'after' | 'start' | 'end') || 'after';

    const actionId = generateActionId('act-move');
    const actionEvent = {
      actionId,
      action: 'move_document_section' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, sourceHeading, destinationHeading, position },
      summary: destinationHeading ? `Moved section "${sourceHeading}" ${position} "${destinationHeading}"` : `Moved section "${sourceHeading}" to ${position}`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { moved: true, sourceHeading, destinationHeading, position, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const modifyTableStructureTool: ToolDefinition = {
  name: 'modify_table_structure',
  label: 'Modify Table Structure',
  description: 'Modifies table layout: adds/removes rows or columns, merges or splits cells, or deletes the active table.',
  activityLabel: 'Modifying table',
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['addRowBefore', 'addRowAfter', 'deleteRow', 'addColumnBefore', 'addColumnAfter', 'deleteColumn', 'mergeCells', 'splitCell', 'deleteTable'],
        description: 'Table operation to execute.',
      },
    },
    required: ['operation'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const operation = String(args.operation || '');
    const actionId = generateActionId('act-tblmod');
    const actionEvent = {
      actionId,
      action: 'modify_table_structure' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, operation },
      summary: `Table: ${operation}`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { operation, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const insertCalloutBoxTool: ToolDefinition = {
  name: 'insert_callout_box',
  label: 'Insert Callout Box',
  description: 'Inserts a stylized callout box (info, tip, warning, danger, note) with custom content.',
  activityLabel: 'Inserting callout box',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['info', 'tip', 'warning', 'danger', 'note'],
        description: 'Callout style.',
      },
      content: {
        type: 'string',
        description: 'Text or markdown inside the callout.',
      },
    },
    required: ['type'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const type = (args.type as 'info' | 'tip' | 'warning' | 'danger' | 'note') || 'info';
    const content = args.content ? String(args.content) : '';
    const actionId = generateActionId('act-callout');
    const actionEvent = {
      actionId,
      action: 'insert_callout_box' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, type, content },
      summary: `Inserted ${type} callout`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { type, content, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const insertVectorShapeTool: ToolDefinition = {
  name: 'insert_vector_shape',
  label: 'Insert Vector Shape',
  description: 'Inserts an inline vector SVG shape (rectangle, rounded-rectangle, circle, diamond, star, arrow-right, triangle).',
  activityLabel: 'Inserting shape',
  parameters: {
    type: 'object',
    properties: {
      shapeType: {
        type: 'string',
        enum: ['rectangle', 'rounded-rectangle', 'circle', 'diamond', 'star', 'arrow-right', 'triangle'],
        description: 'Shape geometry.',
      },
      fill: { type: 'string', description: 'Fill color hex (default: "#E7EAE4").' },
      stroke: { type: 'string', description: 'Stroke color hex (default: "#245C45").' },
      width: { type: 'number', description: 'Width in px.' },
      height: { type: 'number', description: 'Height in px.' },
    },
    required: ['shapeType'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const shapeType = String(args.shapeType || 'rectangle');
    const actionId = generateActionId('act-shape');
    const actionEvent = {
      actionId,
      action: 'insert_vector_shape' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, shapeType, ...args },
      summary: `Inserted ${shapeType} shape`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { shapeType, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const insertDocumentImageTool: ToolDefinition = {
  name: 'insert_document_image',
  label: 'Insert Image',
  description: 'Inserts an image into the document via URL or data URI with alt text and title caption.',
  activityLabel: 'Inserting image',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Web URL or data URI of the image.' },
      alt: { type: 'string', description: 'Alternative accessible text.' },
      title: { type: 'string', description: 'Image title / caption.' },
    },
    required: ['url'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const url = String(args.url || '');
    const alt = args.alt ? String(args.alt) : undefined;
    const title = args.title ? String(args.title) : undefined;
    const actionId = generateActionId('act-img');
    const actionEvent = {
      actionId,
      action: 'insert_document_image' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, url, alt, title },
      summary: `Inserted image: ${title || alt || url.slice(0, 30)}`,
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { url, alt, title, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const insertDocumentSectionBreakTool: ToolDefinition = {
  name: 'insert_document_section_break',
  label: 'Insert Section Break',
  description: 'Inserts a section break that starts a new page section with independent layout.',
  activityLabel: 'Inserting section break',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };
    const actionId = generateActionId('act-secbrk');
    const actionEvent = {
      actionId,
      action: 'insert_document_section_break' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId },
      summary: 'Inserted section break',
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { inserted: true, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const modifyPageLayoutTool: ToolDefinition = {
  name: 'modify_page_layout',
  label: 'Modify Page Layout',
  description: 'Configures document layout: page size (A4, Letter, Legal), orientation (portrait, landscape), margins (preset or mm), columns (1, 2, 3), running headers, footers, and page numbers.',
  activityLabel: 'Configuring page layout',
  parameters: {
    type: 'object',
    properties: {
      pageSize: { type: 'string', enum: ['A4', 'Letter', 'Legal'], description: 'Paper size.' },
      orientation: { type: 'string', enum: ['portrait', 'landscape'], description: 'Page orientation.' },
      marginPreset: { type: 'string', enum: ['normal', 'narrow', 'wide', 'custom'], description: 'Margin preset.' },
      margins: {
        type: 'object',
        description: 'Custom margins in mm { top, bottom, left, right }',
        properties: {
          top: { type: 'number' },
          bottom: { type: 'number' },
          left: { type: 'number' },
          right: { type: 'number' },
        },
      },
      columns: { type: 'number', enum: ['1', '2', '3'], description: 'Number of columns (1, 2, or 3).' },
      headerText: { type: 'string', description: 'Running header text.' },
      footerText: { type: 'string', description: 'Running footer text.' },
      showPageNumbers: { type: 'boolean', description: 'Show page numbers.' },
      differentFirstPage: { type: 'boolean', description: 'Different header/footer on first page.' },
    },
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };

    const actionId = generateActionId('act-layout');
    const actionEvent = {
      actionId,
      action: 'modify_page_layout' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, ...args },
      summary: 'Updated page layout settings',
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { ...args, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const editorUndoTool: ToolDefinition = {
  name: 'editor_undo',
  label: 'Undo Action',
  description: 'Undoes the last editing action in the active document.',
  activityLabel: 'Undoing action',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };
    const actionId = generateActionId('act-undo');
    const actionEvent = {
      actionId,
      action: 'editor_undo' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId },
      summary: 'Undid last editor action',
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { undone: true, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const editorRedoTool: ToolDefinition = {
  name: 'editor_redo',
  label: 'Redo Action',
  description: 'Redoes the previously undone editing action.',
  activityLabel: 'Redoing action',
  parameters: { type: 'object', properties: {} },
  execute: async (_args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) return { success: false, error: val.error, activitySummary: val.summary };
    const actionId = generateActionId('act-redo');
    const actionEvent = {
      actionId,
      action: 'editor_redo' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId },
      summary: 'Redid editor action',
    };
    if (context.onEditorAction) await context.onEditorAction(actionEvent);
    return { success: true, data: { redone: true, actionId }, editorAction: actionEvent, activitySummary: actionEvent.summary };
  },
};

export const changeDocumentAlignmentTool: ToolDefinition = {
  name: 'change_document_alignment',
  label: 'Change Document Alignment',
  description: 'Sets text alignment for the current paragraph or selected blocks (left, center, right, justify).',
  activityLabel: 'Adjusting document alignment',
  parameters: {
    type: 'object',
    properties: {
      alignment: {
        type: 'string',
        enum: ['left', 'center', 'right', 'justify'],
        description: 'Alignment mode: "left", "center", "right", or "justify".',
      },
    },
    required: ['alignment'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const alignment = (args.alignment as 'left' | 'center' | 'right' | 'justify') || 'left';

    const actionId = generateActionId('act-align');
    const actionEvent = {
      actionId,
      action: 'change_document_alignment' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId, alignment },
      summary: `Set alignment to ${alignment}`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: { alignment, actionId },
      editorAction: actionEvent,
      activitySummary: `Changed alignment to ${alignment}`,
    };
  },
};

export const insertDocumentPageBreakTool: ToolDefinition = {
  name: 'insert_document_page_break',
  label: 'Insert Page Break',
  description: 'Inserts a clean page break at the active cursor position in the document.',
  activityLabel: 'Inserting page break',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const actionId = generateActionId('act-pgbreak');
    const actionEvent = {
      actionId,
      action: 'insert_document_page_break' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId },
      summary: 'Inserted page break',
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: { inserted: true, actionId },
      editorAction: actionEvent,
      activitySummary: 'Inserted page break',
    };
  },
};

// ============================================================================
// 3. DOCUMENT MANAGEMENT TOOLS
// ============================================================================

export const renameCurrentDocumentTool: ToolDefinition = {
  name: 'rename_current_document',
  label: 'Rename Document',
  description: 'Updates the title of the current document workspace.',
  activityLabel: 'Renaming document',
  parameters: {
    type: 'object',
    properties: {
      newTitle: {
        type: 'string',
        description: 'The new title for the document.',
      },
    },
    required: ['newTitle'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const newTitle = String(args.newTitle || '').trim();
    if (!newTitle) {
      return {
        success: false,
        error: 'New title cannot be empty.',
        activitySummary: 'Empty title provided',
      };
    }

    const oldTitle = context.activeDocument?.title || 'Untitled';
    const actionId = generateActionId('act-rename');
    const actionEvent = {
      actionId,
      action: 'rename_current_document' as const,
      payload: { actionId, newTitle, documentId: context.activeDocument?.id || context.workspaceId },
      summary: `Renamed document to "${newTitle}"`,
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        oldTitle,
        newTitle,
        actionId,
      },
      editorAction: actionEvent,
      activitySummary: `Renamed document to "${newTitle}"`,
    };
  },
};

export const saveDocumentChangesTool: ToolDefinition = {
  name: 'save_document_changes',
  label: 'Save Document Changes',
  description: 'Triggers an immediate explicit save of all current changes to the active document.',
  activityLabel: 'Saving document',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const actionId = generateActionId('act-save');
    const actionEvent = {
      actionId,
      action: 'save_document_changes' as const,
      payload: { actionId, documentId: context.activeDocument?.id || context.workspaceId },
      summary: 'Saved current document changes',
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        saved: true,
        actionId,
        timestamp: new Date().toISOString(),
      },
      editorAction: actionEvent,
      activitySummary: 'Saved document changes',
    };
  },
};

export const inspectDocumentSaveStatusTool: ToolDefinition = {
  name: 'inspect_document_save_status',
  label: 'Inspect Save Status',
  description: 'Checks whether the document has unsaved edits, is currently saving, or is safely saved.',
  activityLabel: 'Checking save status',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    const saveStatus = activeDoc?.saveStatus || 'saved';
    const hasUnsavedChanges = Boolean(activeDoc?.hasUnsavedChanges);

    return {
      success: true,
      data: {
        saveStatus,
        hasUnsavedChanges,
        lastModified: activeDoc?.lastModified || new Date().toISOString(),
      },
      activitySummary: `Document status: ${saveStatus}`,
    };
  },
};

export const readActiveDocumentContentTool: ToolDefinition = {
  name: 'read_active_document',
  label: 'Read Active Document',
  description: 'Reads the complete full content, plain text, and word count of the active document loaded in the editor.',
  activityLabel: 'Reading document content',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context): Promise<ToolResult> => {
    const activeDoc = context.activeDocument;
    if (!activeDoc) {
      return {
        success: false,
        error: 'No active document is currently loaded in this workspace.',
        activitySummary: 'No active document found',
      };
    }

    const rawContent = activeDoc.content || '';
    const plainText = stripHtml(rawContent);
    const words = activeDoc.wordCount ?? plainText.split(/\s+/).filter(Boolean).length;

    return {
      success: true,
      data: {
        id: activeDoc.id,
        title: activeDoc.title,
        content: rawContent,
        plainText,
        wordCount: words,
        characterCount: rawContent.length,
      },
      activitySummary: `Read active document "${activeDoc.title}" (${words} words)`,
    };
  },
};

export const insertStructuredDocumentTool: ToolDefinition = {
  name: 'insert_structured_document',
  label: 'Insert Structured Document Content',
  description: 'Inserts multi-section, structured content with headings, paragraphs, lists, tables, and formatting into the document in an atomic, undoable transaction.',
  activityLabel: 'Writing document section',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Formatted Markdown or HTML content to insert (can include headings #, ##, paragraphs, lists -, 1., tables, and callouts).',
      },
      title: {
        type: 'string',
        description: 'Optional heading or section title to prepend.',
      },
      position: {
        type: 'string',
        enum: ['cursor', 'end', 'start', 'replace_selection'],
        description: 'Placement in the document: "cursor" (default), "end", "start", or "replace_selection".',
      },
      summary: {
        type: 'string',
        description: 'Brief description of the written section.',
      },
    },
    required: ['content'],
  },
  execute: async (args, context): Promise<ToolResult> => {
    const val = validateActiveDocumentForEdit(context);
    if (!val.ok) {
      return { success: false, error: val.error, activitySummary: val.summary };
    }

    const rawContent = String(args.content || '').trim();
    if (!rawContent) {
      return {
        success: false,
        error: 'Content parameter cannot be empty.',
        activitySummary: 'Empty document content',
      };
    }

    const title = args.title ? String(args.title).trim() : undefined;
    const position = (args.position as 'cursor' | 'end' | 'start' | 'replace_selection') || 'cursor';

    let finalContent = rawContent;
    if (title && !finalContent.toLowerCase().includes(title.toLowerCase())) {
      finalContent = `## ${title}\n\n${finalContent}`;
    }

    const actionId = generateActionId('act-struct');
    const actionEvent = {
      actionId,
      action: 'insert_structured_document' as const,
      payload: {
        actionId,
        documentId: context.activeDocument?.id || context.workspaceId,
        content: finalContent,
        title,
        position,
      },
      summary: args.summary ? String(args.summary) : (title ? `Inserted section "${title}"` : `Inserted structured content (${finalContent.length} chars)`),
    };

    if (context.onEditorAction) {
      await context.onEditorAction(actionEvent);
    }

    return {
      success: true,
      data: {
        inserted: true,
        actionId,
        title,
        position,
        length: finalContent.length,
      },
      editorAction: actionEvent,
      activitySummary: actionEvent.summary,
    };
  },
};

// Export all Document Editor Tools
export const documentEditorTools: ToolDefinition[] = [
  // 1. Reading, Navigation & Native Search
  readActiveDocumentContentTool,
  readActiveDocumentStructureTool,
  inspectActiveDocumentMetadataTool,
  readActiveDocumentSelectionTool,
  searchDocumentContentTool,
  locateDocumentSectionTool,
  searchDocumentTextTool,
  navigateToDocumentHeadingTool,

  // 2. Content Creation & Editing
  insertStructuredDocumentTool,
  insertTextAtCursorTool,
  prependToDocumentTool,
  appendOrInsertParagraphTool,
  replaceSelectedTextTool,
  findAndReplaceTextTool,
  deleteSelectedContentTool,
  duplicateContentTool,
  moveDocumentSectionTool,
  createOrEditHeadingTool,
  createDocumentListTool,

  // 3. Typography & Text Formatting
  formatDocumentTextTool,
  setFontStyleTool,
  setLineHeightTool,
  changeDocumentAlignmentTool,

  // 4. Structured Content & Media
  insertDocumentTableTool,
  modifyTableStructureTool,
  insertHyperlinkTool,
  insertDocumentImageTool,
  insertCalloutBoxTool,
  insertVectorShapeTool,

  // 5. Page Breaks & Layout
  insertDocumentPageBreakTool,
  insertDocumentSectionBreakTool,
  modifyPageLayoutTool,

  // 6. Undo/Redo & Document Management
  editorUndoTool,
  editorRedoTool,
  renameCurrentDocumentTool,
  saveDocumentChangesTool,
  inspectDocumentSaveStatusTool,
];


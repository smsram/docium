/**
 * File and Source Understanding Tools
 * Manages discovery, semantic search, tabular extraction, and summarization of attached sources.
 */

import { ToolDefinition } from './types';
import { searchRelevantChunks } from '../embeddings';

export const listAttachedSourcesTool: ToolDefinition = {
  name: 'list_attached_sources',
  label: 'List Sources',
  description: 'List all files and URLs attached to the current conversation.',
  activityLabel: 'Listing attached sources',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context) => {
    const list = context.attachedSources.map((s) => ({
      id: s.id,
      title: s.title,
      type: s.type,
      status: s.status,
      fileSize: s.fileSize,
      chunkCount: s.chunkCount || 1,
    }));

    return {
      success: true,
      data: { sources: list, count: list.length },
      activitySummary: `Found ${list.length} attached sources`,
    };
  },
};

export const inspectSourceTool: ToolDefinition = {
  name: 'inspect_source',
  label: 'Inspect Source',
  description: 'Get metadata, structure, and preliminary overview of an attached source by ID or title.',
  activityLabel: 'Inspecting source metadata',
  parameters: {
    type: 'object',
    properties: {
      sourceIdOrTitle: {
        type: 'string',
        description: 'The source ID or title of the file to inspect.',
      },
    },
    required: ['sourceIdOrTitle'],
  },
  execute: async (args, context) => {
    const target = String(args.sourceIdOrTitle || '').toLowerCase();
    const source = context.attachedSources.find(
      (s) => s.id.toLowerCase() === target || s.title.toLowerCase().includes(target)
    );

    if (!source) {
      return { success: false, error: `Source "${args.sourceIdOrTitle}" not found in conversation.` };
    }

    return {
      success: true,
      data: {
        id: source.id,
        title: source.title,
        type: source.type,
        fileSize: source.fileSize,
        mimeType: source.mimeType,
        chunkCount: source.chunkCount || 1,
        snippet: source.snippet,
        status: source.status,
        hasExtractedText: Boolean(source.extractedText),
      },
      activitySummary: `Inspected source "${source.title}"`,
    };
  },
};

export const readSourceTool: ToolDefinition = {
  name: 'read_source',
  label: 'Read Source',
  description: 'Read the extracted text of an attached source with optional page and length limits.',
  activityLabel: 'Reading attached file',
  parameters: {
    type: 'object',
    properties: {
      sourceIdOrTitle: {
        type: 'string',
        description: 'Source ID or title to read.',
      },
      page: {
        type: 'number',
        description: 'Optional page number for paginated documents (PDF, PPTX).',
      },
      maxCharacters: {
        type: 'number',
        description: 'Max characters to read (defaults to 3000).',
      },
    },
    required: ['sourceIdOrTitle'],
  },
  execute: async (args, context) => {
    const target = String(args.sourceIdOrTitle || '').toLowerCase();
    const source = context.attachedSources.find(
      (s) => s.id.toLowerCase() === target || s.title.toLowerCase().includes(target)
    );

    if (!source) {
      return { success: false, error: `Source "${args.sourceIdOrTitle}" not found.` };
    }

    const maxChars = typeof args.maxCharacters === 'number' ? Math.min(args.maxCharacters, 6000) : 3000;
    const fullText = source.extractedText || source.snippet || '';

    let contentToReturn = fullText;
    if (typeof args.page === 'number') {
      const pageTag = `[Page ${args.page}]`;
      const pageIdx = fullText.indexOf(pageTag);
      if (pageIdx !== -1) {
        contentToReturn = fullText.slice(pageIdx, pageIdx + maxChars);
      } else {
        contentToReturn = fullText.slice(0, maxChars);
      }
    } else {
      contentToReturn = fullText.slice(0, maxChars);
    }

    return {
      success: true,
      data: {
        sourceId: source.id,
        title: source.title,
        text: contentToReturn,
        totalLength: fullText.length,
      },
      activitySummary: `Read content from "${source.title}"`,
    };
  },
};

export const searchSourcesTool: ToolDefinition = {
  name: 'search_sources',
  label: 'Search Sources',
  description: 'Search across all attached conversation sources using semantic & keyword matching to find citations.',
  activityLabel: 'Searching attached sources',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query or concept to look up in attached sources.',
      },
      limit: {
        type: 'number',
        description: 'Number of relevant chunks to retrieve (defaults to 4).',
      },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const query = String(args.query || '').trim();
    if (!query) return { success: false, error: 'Query is required' };

    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 8) : 4;

    // Use semantic retrieval from embeddings index
    const results = await searchRelevantChunks(query, context.workspaceId, limit);

    if (results.length === 0) {
      // Fallback: search source texts directly
      const fallbackMatches: Array<{ sourceTitle: string; snippet: string; score: number }> = [];
      const lowerQ = query.toLowerCase();

      for (const src of context.attachedSources) {
        const text = src.extractedText || src.snippet || '';
        const idx = text.toLowerCase().indexOf(lowerQ);
        if (idx !== -1) {
          const start = Math.max(0, idx - 100);
          const snippet = text.slice(start, start + 350);
          fallbackMatches.push({
            sourceTitle: src.title,
            snippet,
            score: 0.85,
          });
        }
      }

      return {
        success: true,
        data: { query, results: fallbackMatches, count: fallbackMatches.length },
        activitySummary: `Found ${fallbackMatches.length} matching sections in sources`,
      };
    }

    const formatted = results.map((r) => ({
      sourceId: r.chunk.sourceId,
      sourceTitle: r.sourceTitle,
      heading: r.chunk.heading,
      page: r.chunk.page,
      snippet: r.chunk.text,
      score: r.score,
    }));

    return {
      success: true,
      data: { query, results: formatted, count: formatted.length },
      activitySummary: `Retrieved ${formatted.length} relevant sections from sources`,
    };
  },
};

export const extractSourceTablesTool: ToolDefinition = {
  name: 'extract_source_tables',
  label: 'Extract Source Tables',
  description: 'Extract structured tables, CSV data, or spreadsheet grids from attached files.',
  activityLabel: 'Extracting source tables',
  parameters: {
    type: 'object',
    properties: {
      sourceIdOrTitle: {
        type: 'string',
        description: 'Source ID or title containing tabular data.',
      },
    },
    required: ['sourceIdOrTitle'],
  },
  execute: async (args, context) => {
    const target = String(args.sourceIdOrTitle || '').toLowerCase();
    const source = context.attachedSources.find(
      (s) => s.id.toLowerCase() === target || s.title.toLowerCase().includes(target)
    );

    if (!source) {
      return { success: false, error: `Source "${args.sourceIdOrTitle}" not found.` };
    }

    const text = source.extractedText || source.snippet || '';
    // Look for markdown table or CSV lines
    const lines = text.split('\n');
    const tableLines: string[] = [];
    let inTable = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') || trimmed.includes(',')) {
        inTable = true;
        tableLines.push(trimmed);
      } else if (inTable && !trimmed) {
        break;
      }
    }

    const extracted = tableLines.slice(0, 30).join('\n');

    return {
      success: true,
      data: {
        sourceTitle: source.title,
        tabularData: extracted || 'No clear tabular rows detected in source.',
      },
      activitySummary: `Extracted table data from "${source.title}"`,
    };
  },
};

export const summarizeSourceTool: ToolDefinition = {
  name: 'summarize_source',
  label: 'Summarize Source',
  description: 'Generate an executive summary and key takeaways from an attached document.',
  activityLabel: 'Summarizing document',
  parameters: {
    type: 'object',
    properties: {
      sourceIdOrTitle: {
        type: 'string',
        description: 'Source to summarize.',
      },
    },
    required: ['sourceIdOrTitle'],
  },
  execute: async (args, context) => {
    const target = String(args.sourceIdOrTitle || '').toLowerCase();
    const source = context.attachedSources.find(
      (s) => s.id.toLowerCase() === target || s.title.toLowerCase().includes(target)
    );

    if (!source) return { success: false, error: 'Source not found' };

    const snippet = (source.extractedText || source.snippet || '').slice(0, 1500);

    return {
      success: true,
      data: {
        sourceTitle: source.title,
        type: source.type,
        overview: source.snippet,
        sampleContent: snippet,
      },
      activitySummary: `Summarized source "${source.title}"`,
    };
  },
};

export const sourceTools = [
  listAttachedSourcesTool,
  inspectSourceTool,
  readSourceTool,
  searchSourcesTool,
  extractSourceTablesTool,
  summarizeSourceTool,
];

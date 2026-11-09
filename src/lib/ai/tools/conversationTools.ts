/**
 * Conversation and Memory Tools
 * Manages conversation history inspection and persistent scratchpad task notes.
 */

import { ToolDefinition } from './types';

export const readChatHistoryTool: ToolDefinition = {
  name: 'read_chat_history',
  label: 'Read Chat History',
  description: 'Retrieve previous messages from the current conversation to review past instructions or answers.',
  activityLabel: 'Reading conversation context',
  parameters: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Number of recent messages to retrieve (defaults to 6).',
      },
    },
  },
  execute: async (args, context) => {
    const limit = typeof args.limit === 'number' ? Math.min(args.limit, 20) : 6;
    const history = context.conversationHistory.slice(-limit).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 1000),
      timestamp: m.timestamp,
    }));

    return {
      success: true,
      data: { messages: history, count: history.length },
      activitySummary: `Retrieved ${history.length} previous messages`,
    };
  },
};

export const searchChatHistoryTool: ToolDefinition = {
  name: 'search_chat_history',
  label: 'Search Chat History',
  description: 'Search for specific keywords or topics in past conversation messages.',
  activityLabel: 'Searching conversation history',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keyword or phrase to search for in prior messages.',
      },
    },
    required: ['query'],
  },
  execute: async (args, context) => {
    const query = String(args.query || '').toLowerCase();
    if (!query) {
      return { success: false, error: 'Query is required' };
    }

    const matches = context.conversationHistory
      .filter((m) => m.content.toLowerCase().includes(query))
      .slice(-5)
      .map((m) => ({
        role: m.role,
        snippet: m.content.slice(0, 300),
        timestamp: m.timestamp,
      }));

    return {
      success: true,
      data: { query, matches, count: matches.length },
      activitySummary: `Found ${matches.length} matching messages for "${query}"`,
    };
  },
};

export const readScratchpadTool: ToolDefinition = {
  name: 'read_scratchpad',
  label: 'Read Chat Notes',
  description: 'Retrieve persistent working notes, decisions, and facts saved for this conversation.',
  activityLabel: 'Reading chat notes',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context) => {
    return {
      success: true,
      data: { scratchpad: context.scratchpad || 'No notes currently stored.' },
      activitySummary: context.scratchpad ? 'Read existing conversation notes' : 'Chat notes empty',
    };
  },
};

export const updateScratchpadTool: ToolDefinition = {
  name: 'update_scratchpad',
  label: 'Update Chat Notes',
  description: 'Save concise operational notes, user preferences, or task progress for future conversation turns.',
  activityLabel: 'Updating chat notes',
  parameters: {
    type: 'object',
    properties: {
      notes: {
        type: 'string',
        description: 'Concise summary of facts, decisions, or task state to preserve (under 1000 characters).',
      },
      append: {
        type: 'boolean',
        description: 'Whether to append to existing notes instead of replacing.',
      },
    },
    required: ['notes'],
  },
  execute: async (args, context) => {
    const newNotes = String(args.notes || '').trim().slice(0, 1500);
    const append = Boolean(args.append);

    const updated = append && context.scratchpad
      ? `${context.scratchpad}\n${newNotes}`.slice(0, 2000)
      : newNotes;

    if (context.onUpdateScratchpad) {
      await context.onUpdateScratchpad(updated);
    }

    return {
      success: true,
      data: { scratchpad: updated },
      activitySummary: 'Updated conversation notes',
    };
  },
};

export const clearScratchpadTool: ToolDefinition = {
  name: 'clear_scratchpad',
  label: 'Clear Chat Notes',
  description: 'Clears working notes for this conversation.',
  activityLabel: 'Clearing chat notes',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async (_args, context) => {
    if (context.onUpdateScratchpad) {
      await context.onUpdateScratchpad('');
    }
    return {
      success: true,
      data: { scratchpad: '' },
      activitySummary: 'Cleared conversation notes',
    };
  },
};

export const conversationTools = [
  readChatHistoryTool,
  searchChatHistoryTool,
  readScratchpadTool,
  updateScratchpadTool,
  clearScratchpadTool,
];


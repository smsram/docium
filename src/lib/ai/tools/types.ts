/**
 * Central Tool Registry Types
 */

import {
  ResearchSource,
  AiChatMessage,
  ChartSpecification,
  GeneratedImageMetadata,
  WorkspaceFileRecord,
  FileOperationEvent,
  ActiveDocumentContext,
  EditorActionEvent,
} from '@/lib/types';

export type { WorkspaceFileRecord, FileOperationEvent, ActiveDocumentContext, EditorActionEvent };

export interface ToolExecutionContext {
  workspaceId: string;
  workspaceType: string;
  conversationId: string;
  attachedSources: ResearchSource[];
  conversationHistory: AiChatMessage[];
  scratchpad: string;
  workspaceFiles?: WorkspaceFileRecord[];
  activeDocument?: ActiveDocumentContext;
  onUpdateScratchpad?: (newScratchpad: string) => Promise<void> | void;
  onActivityEvent?: (event: { label: string; status: 'running' | 'completed' | 'failed'; safeSummary?: string }) => void;
  onFileOperation?: (op: FileOperationEvent) => Promise<void> | void;
  onEditorAction?: (action: EditorActionEvent) => Promise<void> | void;
  apiKeys?: Record<string, string>;
  searchProvider?: string;
  imageGenProvider?: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  activitySummary?: string;
  fileOperation?: FileOperationEvent;
  editorAction?: EditorActionEvent;
  // If the tool generated a chart, image, or citation block:
  structuredBlock?:
    | { type: 'chart'; chart: ChartSpecification }
    | { type: 'image'; image: GeneratedImageMetadata }
    | { type: 'table'; title?: string; headers: string[]; rows: string[][] };
}

export interface ToolDefinition {
  name: string;
  label: string; // e.g. "Web Search"
  description: string;
  activityLabel: string; // e.g. "Searching the web"
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolResult>;
}


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
  ProviderId,
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
  attachments?: { name: string; size: string; type: string; url?: string; dataUrl?: string }[];
  onUpdateScratchpad?: (newScratchpad: string) => Promise<void> | void;
  onActivityEvent?: (event: { label: string; status: 'running' | 'completed' | 'failed'; safeSummary?: string }) => void;
  onFileOperation?: (op: FileOperationEvent) => Promise<void> | void;
  onEditorAction?: (action: EditorActionEvent) => Promise<void> | void;
  onLoadTools?: (toolIds: string[]) => void;
  apiKeys?: Record<string, string>;
  searchProvider?: string;
  imageGenProvider?: string;
  providerId?: ProviderId;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
  requestId?: string;
  toolCallId?: string;
}

export interface ToolResult {
  success: boolean;
  status?: string;
  sourceId?: string;
  mimeType?: string;
  data?: unknown;
  error?: string;
  errorCategory?: string;
  activitySummary?: string;
  fileOperation?: FileOperationEvent;
  editorAction?: EditorActionEvent;
  isSecurityViolation?: boolean;
  statusCode?: string;
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


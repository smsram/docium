/**
 * Central Tool Registry
 * Single point of registration, discovery, validation, and safe execution for all AI tools.
 * One universal architecture serving Documents, Spreadsheets, Presentations, and PDFs.
 */

import { ToolDefinition, ToolExecutionContext, ToolResult } from './types';
import {
  TOOL_CATALOG,
  searchToolCatalogTool,
  loadToolDefinitionsTool,
  getCatalogTool,
  getAllImplementedCatalogTools,
  getAvailableCatalogTools,
  catalogToNormalizedToolDefinitions,
  ToolCatalogEntry,
} from './catalog';
import { conversationTools } from './conversationTools';
import { sourceTools } from './sourceTools';
import { imageTools } from './imageTools';
import { webTools } from './webTools';
import { chartTools } from './chartTools';
import { imageGenTools } from './imageGenTools';
import { calculateTool } from './calculator';
import { documentTools } from './documentTools';
import { documentEditorTools } from './documentEditorTools';
import { spreadsheetTools } from './spreadsheetTools';
import { presentationTools } from './presentationTools';
import { pdfTools } from './pdfTools';
import { researchTools } from './researchTools';
import { workspaceTools } from './workspaceTools';
import { NormalizedToolDefinition } from '../adapters/base';
import { assertWorkspaceBoundary, WorkspaceSecurityViolationError } from '../security/workspaceBoundary';

export const ALL_TOOLS: ToolDefinition[] = [
  ...conversationTools,
  ...sourceTools,
  ...imageTools,
  ...webTools,
  ...chartTools,
  ...imageGenTools,
  calculateTool,
  ...documentTools,
  ...documentEditorTools,
  ...spreadsheetTools,
  ...presentationTools,
  ...pdfTools,
  ...researchTools,
  ...workspaceTools,
];

const toolMap = new Map<string, ToolDefinition>();
for (const tool of ALL_TOOLS) {
  toolMap.set(tool.name, tool);
}

export function getToolByName(name: string): ToolDefinition | undefined {
  return toolMap.get(name);
}

export function getAllTools(): ToolDefinition[] {
  return ALL_TOOLS;
}

/**
 * Filter tools available for a given request based on workspace type, user toggles, and context attachments.
 */
export function getAvailableTools(options: {
  workspaceType?: string;
  hasAttachments?: boolean;
  enabledTools?: {
    internetSearch?: boolean;
    imageGeneration?: boolean;
    chartsAndData?: boolean;
  };
}): ToolDefinition[] {
  const { workspaceType = 'doc', hasAttachments = false, enabledTools = {} } = options;

  return ALL_TOOLS.filter((t) => {
    // 1. Web tools require internetSearch toggle
    if (webTools.some((wt) => wt.name === t.name)) {
      return Boolean(enabledTools.internetSearch);
    }

    // 2. Image gen tools require imageGeneration toggle
    if (imageGenTools.some((igt) => igt.name === t.name)) {
      return Boolean(enabledTools.imageGeneration);
    }

    // 3. Chart tools require chartsAndData toggle (default true)
    if (chartTools.some((ct) => ct.name === t.name)) {
      return enabledTools.chartsAndData !== false;
    }

    // 4. Document workspace specific interactive editor tools
    if (documentEditorTools.some((det) => det.name === t.name)) {
      return workspaceType === 'doc';
    }

    // 5. Spreadsheet specific tools
    if (spreadsheetTools.some((st) => st.name === t.name)) {
      return workspaceType === 'sheet' || hasAttachments;
    }

    // 6. Presentation specific tools
    if (presentationTools.some((pt) => pt.name === t.name)) {
      return workspaceType === 'slide' || hasAttachments;
    }

    // 7. PDF specific tools
    if (pdfTools.some((pdt) => pdt.name === t.name)) {
      return workspaceType === 'pdf' || hasAttachments;
    }

    // 8. Source & image understanding tools
    if (sourceTools.some((st) => st.name === t.name) || imageTools.some((it) => it.name === t.name)) {
      return hasAttachments || true;
    }

    // 9. When in Document workspace, prohibit tools that create or update external workspace files
    // (Strict active-document-only modification permission boundary)
    if (workspaceType === 'doc') {
      const isOtherFileModification =
        t.name === 'create_workspace_file' ||
        t.name === 'update_document_file' ||
        t.name === 'create_workspace_artifact';
      if (isOtherFileModification) {
        return false;
      }
    }

    // 10. Universal tools: document, conversation, research, calculation, and read-only workspace tools
    return true;
  });
}

/**
 * Converts tool definitions to normalized schema for provider adapters.
 */
export function toNormalizedToolDefinitions(tools: ToolDefinition[]): NormalizedToolDefinition[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

/**
 * Executes a tool safely with input validation, error handling, loop mitigation, and timeout.
 */
export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  timeoutMs?: number
): Promise<ToolResult> {
  const effectiveTimeoutMs =
    typeof timeoutMs === 'number'
      ? timeoutMs
      : toolName === 'inspect_source_image' ||
        toolName === 'generate_image' ||
        toolName === 'web_search' ||
        toolName === 'inspect_source_styles'
      ? 45000
      : 15000;
  const catalogTool = getCatalogTool(toolName);
  const tool = catalogTool || getToolByName(toolName);
  if (!tool) {
    return {
      success: false,
      error: `Tool "${toolName}" is not registered in the DOCIUM Tool Registry.`,
      activitySummary: `Failed to find tool ${toolName}`,
    };
  }

  // Safety check: validate required parameters
  if (tool.parameters.required) {
    for (const req of tool.parameters.required) {
      if (args[req] === undefined || args[req] === null || args[req] === '') {
        return {
          success: false,
          error: `Missing required parameter "${req}" for tool "${toolName}".`,
          activitySummary: `Invalid arguments for ${tool.label}`,
        };
      }
    }
  }

  // Strict Architectural Workspace Isolation Boundary Check
  const targetResources: string[] = [];
  if (typeof args.documentId === 'string') targetResources.push(args.documentId);
  if (typeof args.itemId === 'string') targetResources.push(args.itemId);
  if (typeof args.sourceId === 'string') targetResources.push(args.sourceId);
  if (Array.isArray(args.sourceIds)) {
    for (const sid of args.sourceIds) {
      if (typeof sid === 'string') targetResources.push(sid);
    }
  }
  if (typeof args.documentIdOrTitle === 'string') targetResources.push(args.documentIdOrTitle);
  if (typeof args.imageIdOrFilename === 'string') targetResources.push(args.imageIdOrFilename);
  if (typeof args.path === 'string') targetResources.push(args.path);

  try {
    for (const target of targetResources) {
      assertWorkspaceBoundary(target, context, toolName);
    }
  } catch (secErr) {
    if (secErr instanceof WorkspaceSecurityViolationError || (secErr as any)?.isSecurityViolation) {
      return {
        success: false,
        isSecurityViolation: true,
        statusCode: 'WORKSPACE_BOUNDARY_VIOLATION',
        error: 'The task was stopped because the requested operation exceeded the active workspace boundary.',
        activitySummary: 'Task stopped: Exceeded active workspace boundary',
      };
    }
    throw secErr;
  }

  // Strict active-document modification permission boundary for Document workspaces
  if (context.workspaceType === 'doc') {
    const isOtherFileModification =
      toolName === 'create_workspace_file' ||
      toolName === 'update_document_file' ||
      toolName === 'create_workspace_artifact';

    if (isOtherFileModification) {
      const activeTitle = context.activeDocument?.title || context.activeDocument?.id || 'the active document';
      return {
        success: false,
        error: `Permission denied: Cannot modify or create external workspace files from within an active Document workspace. Only the currently active document ("${activeTitle}") can be modified. To edit another document, open it as the active document first.`,
        activitySummary: 'Permission denied for other workspace files',
      };
    }

    const requestedDocId = (args.documentId as string) || (args.itemId as string);
    if (
      requestedDocId &&
      context.activeDocument?.id &&
      requestedDocId !== context.activeDocument.id &&
      requestedDocId !== context.workspaceId
    ) {
      return {
        success: false,
        error: `Permission denied: Cannot edit document "${requestedDocId}". Only the currently active document ("${context.activeDocument.title || context.activeDocument.id}") can be modified.`,
        activitySummary: 'Permission denied for non-active document',
      };
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    const execContext: ToolExecutionContext = {
      ...context,
      abortSignal: controller.signal,
    };

    const executionPromise = tool.execute(args, execContext);
    const result = await Promise.race([
      executionPromise,
      new Promise<ToolResult>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error(`Tool ${toolName} execution timed out after ${Math.round(effectiveTimeoutMs / 1000)}s`)))
      ),
    ]);

    clearTimeout(timer);
    return result;
  } catch (err: unknown) {
    if (err instanceof WorkspaceSecurityViolationError || (err as any)?.isSecurityViolation) {
      return {
        success: false,
        isSecurityViolation: true,
        statusCode: 'WORKSPACE_BOUNDARY_VIOLATION',
        error: 'The task was stopped because the requested operation exceeded the active workspace boundary.',
        activitySummary: 'Task stopped: Exceeded active workspace boundary',
      };
    }
    const message = err instanceof Error ? err.message : 'Tool execution error';
    return {
      success: false,
      error: `Execution error in "${tool.label}": ${message}`,
      activitySummary: `Failed to execute ${tool.label}`,
    };
  }
}

export {
  TOOL_CATALOG,
  searchToolCatalogTool,
  loadToolDefinitionsTool,
  getCatalogTool,
  getAllImplementedCatalogTools,
  getAvailableCatalogTools,
  catalogToNormalizedToolDefinitions,
};
export type { ToolCatalogEntry };


/**
 * Central Tool Registry
 * Single point of registration, discovery, validation, and safe execution for all AI tools.
 * One universal architecture serving Documents, Spreadsheets, Presentations, and PDFs.
 */

import { ToolDefinition, ToolExecutionContext, ToolResult } from './types';
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
  timeoutMs = 12000
): Promise<ToolResult> {
  const tool = getToolByName(toolName);
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
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const executionPromise = tool.execute(args, context);
    const result = await Promise.race([
      executionPromise,
      new Promise<ToolResult>((_, reject) =>
        controller.signal.addEventListener('abort', () => reject(new Error(`Tool ${toolName} execution timed out`)))
      ),
    ]);

    clearTimeout(timer);
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tool execution error';
    return {
      success: false,
      error: `Execution error in "${tool.label}": ${message}`,
      activitySummary: `Failed to execute ${tool.label}`,
    };
  }
}

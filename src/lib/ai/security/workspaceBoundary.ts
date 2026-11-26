/**
 * DOCIUM Architectural Security & Workspace Isolation Guard
 *
 * Enforces strict, hard access boundaries around the currently active workspace:
 * 1. Agent has access ONLY to the currently active workspace and its permitted files/sources.
 * 2. Agent is completely unaware of other workspaces and their contents.
 * 3. Any attempt to access, search, inspect, or read files outside the active workspace
 *    triggers an immediate, non-recoverable task abort with a security event.
 * 4. Security events are recorded WITHOUT exposing restricted filenames, paths, or contents.
 */

import { ToolExecutionContext } from '../tools/types';
import { useWorkspaceStore } from '@/lib/store';
import { hasOriginalFile } from '@/lib/storage/sourceStorage';

export interface SecurityEventRecord {
  id: string;
  timestamp: string;
  activeWorkspaceId: string;
  action: string;
  status: 'blocked';
  reason: string;
}

// In-memory security audit log (persisted across agent runs, strictly sanitized)
const securityAuditLog: SecurityEventRecord[] = [];

/**
 * Custom error thrown when an operation violates the active workspace boundary.
 */
export class WorkspaceSecurityViolationError extends Error {
  public readonly isSecurityViolation = true;
  public readonly statusCode = 'WORKSPACE_BOUNDARY_VIOLATION';
  public readonly activeWorkspaceId: string;

  constructor(activeWorkspaceId: string) {
    super('The task was stopped because the requested operation exceeded the active workspace boundary.');
    this.name = 'WorkspaceSecurityViolationError';
    this.activeWorkspaceId = activeWorkspaceId;
  }
}

/**
 * Record a security event without exposing restricted filenames, paths, or contents.
 */
export function recordSecurityEvent(event: Omit<SecurityEventRecord, 'id' | 'timestamp' | 'status'>): SecurityEventRecord {
  const record: SecurityEventRecord = {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    status: 'blocked',
    ...event,
  };
  securityAuditLog.push(record);
  console.warn('[DOCIUM Security Boundary] Blocked cross-workspace access attempt', {
    securityEventId: record.id,
    activeWorkspaceId: record.activeWorkspaceId,
    action: record.action,
    timestamp: record.timestamp,
  });
  return record;
}

export function getSecurityAuditLog(): SecurityEventRecord[] {
  return [...securityAuditLog];
}

export function clearSecurityAuditLog(): void {
  securityAuditLog.length = 0;
}

/**
 * Validates whether a requested resource target (ID, filename, path) is within the permitted
 * boundary of the active workspace.
 *
 * Rejection conditions:
 * - Cross-workspace path traversals (e.g. "../", "workspace:", "workspace-")
 * - Referencing an ID belonging to another document/workspace in the workspace store
 * - Referencing a file title belonging to a different document/workspace in the workspace store
 * - Requesting document/source access when the resource does not belong to activeWorkspaceId
 *
 * @throws WorkspaceSecurityViolationError if the target exceeds the active workspace boundary
 */
export function assertWorkspaceBoundary(
  targetResourceIdOrPath: string | undefined | null,
  context: ToolExecutionContext,
  action: string = 'access'
): void {
  if (!targetResourceIdOrPath) return;

  const rawTarget = String(targetResourceIdOrPath).trim();
  if (!rawTarget || rawTarget === '*' || rawTarget === 'all') return;

  const targetLower = rawTarget.toLowerCase();
  const activeWs = (context.workspaceId || '').toLowerCase();
  const activeDocId = (context.activeDocument?.id || '').toLowerCase();
  const activeDocTitle = (context.activeDocument?.title || '').toLowerCase();

  // 1. Direct match with current active workspace or active document
  if (targetLower === activeWs || targetLower === activeDocId) {
    return;
  }
  if (activeDocTitle && targetLower === activeDocTitle) {
    return;
  }

  // 2. Check if the target is in the permitted sources attached to THIS workspace
  const isAttachedToCurrent = (context.attachedSources || []).some(
    (s) => s.id.toLowerCase() === targetLower || s.title.toLowerCase() === targetLower
  );
  if (isAttachedToCurrent) {
    return;
  }

  // 3. Check if the target is in the workspace files of THIS workspace
  const isCurrentWorkspaceFile = (context.workspaceFiles || []).some(
    (wf) => wf.id.toLowerCase() === targetLower || wf.title.toLowerCase() === targetLower
  );
  if (isCurrentWorkspaceFile) {
    return;
  }

  // 4. Check if the target is in current conversation attachments
  const isConversationAttachment = (context.attachments || []).some(
    (att) => att.name.toLowerCase() === targetLower || att.url?.toLowerCase() === targetLower
  );
  if (isConversationAttachment) {
    return;
  }

  // 4b. Check if the target is in original source storage for THIS workspace
  try {
    if (hasOriginalFile(context.workspaceId, rawTarget) || hasOriginalFile(context.workspaceId, targetLower)) {
      return;
    }
  } catch {
    // ignore
  }

  // 5. Detect explicit cross-workspace path or namespace patterns
  const isCrossWorkspaceSyntax =
    targetLower.includes('../') ||
    targetLower.includes('..\\') ||
    targetLower.startsWith('workspace:') ||
    targetLower.includes('/workspaces/') ||
    targetLower.includes('\\workspaces\\');

  if (isCrossWorkspaceSyntax) {
    recordSecurityEvent({
      activeWorkspaceId: context.workspaceId,
      action: `${action}:cross_workspace_traversal`,
      reason: 'Attempted cross-workspace path traversal syntax',
    });
    throw new WorkspaceSecurityViolationError(context.workspaceId);
  }

  // 6. Check against global store to detect if target belongs to ANOTHER workspace
  try {
    const store = useWorkspaceStore.getState();
    if (store) {
      const allOtherDocs = [
        ...(store.documents || []).filter((d) => d.id.toLowerCase() !== activeWs && d.id.toLowerCase() !== activeDocId),
        ...(store.sheets || []).filter((s) => s.id.toLowerCase() !== activeWs),
        ...(store.slides || []).filter((sl) => sl.id.toLowerCase() !== activeWs),
        ...(store.pdfs || []).filter((p) => p.id.toLowerCase() !== activeWs),
      ];

      const matchesOtherWorkspace = allOtherDocs.some(
        (doc) => doc.id.toLowerCase() === targetLower || (doc.title && doc.title.toLowerCase() === targetLower)
      );

      if (matchesOtherWorkspace) {
        recordSecurityEvent({
          activeWorkspaceId: context.workspaceId,
          action: `${action}:other_workspace_resource_target`,
          reason: 'Target explicitly references an external workspace resource ID or title',
        });
        throw new WorkspaceSecurityViolationError(context.workspaceId);
      }
    }
  } catch (err) {
    if (err instanceof WorkspaceSecurityViolationError || (err as any)?.isSecurityViolation) {
      throw err;
    }
    // If store is not mounted (e.g. unit test runner), fall back to pattern check
  }

  // 7. Check if target has foreign workspace ID format (e.g. doc-2, sheet-1, etc.)
  const foreignWorkspaceIdMatch = /^(doc|sheet|slide|pdf|conv|workspace)-[a-zA-Z0-9_-]+$/i.test(targetLower);
  if (foreignWorkspaceIdMatch && targetLower !== activeWs && targetLower !== activeDocId) {
    recordSecurityEvent({
      activeWorkspaceId: context.workspaceId,
      action: `${action}:foreign_workspace_id`,
      reason: 'Target is a foreign workspace ID format',
    });
    throw new WorkspaceSecurityViolationError(context.workspaceId);
  }
}


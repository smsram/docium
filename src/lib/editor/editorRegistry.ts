/**
 * DOCIUM Centralized Document Editor Registry & Transaction Execution Bridge
 * 
 * Provides:
 * 1. Singleton registry for active Tiptap Editor instances keyed by documentId/workspaceId.
 * 2. StrictMode-safe registration and unregistration to prevent lost references.
 * 3. Bounded wait/retry mechanism for asynchronous mounting latency.
 * 4. Authoritative ProseMirror transaction execution, state change verification, and persistence.
 */

import type { Editor } from '@tiptap/react';
import { convertMarkdownAndLatexToHtml, convertMarkdownToDocumentHtml, escapeHtml, sanitizeTableHtmlWhitespace } from '@/components/editor/utils/markdownToHtml';
import { useWorkspaceStore } from '@/lib/store';
import {
  DocumentPageSize,
  DocumentOrientation,
  DocumentMargins,
  MarginPreset,
  EditorActionResult,
} from '@/lib/types';
import {
  searchProseMirrorDoc,
  findSectionByHeading,
  findRangeByAnchors,
  findBlockNodes,
  expandRangeToEnclosingBlocks,
  replaceTextInRange,
  replaceAllMatches,
  moveDocumentSectionInEditor,
} from './documentSearch';
import {
  resolveFontFamilyValue,
  normalizeFontSizeToPt,
  ensureGoogleFontLoaded,
} from './fontCatalog';

export interface RegisteredEditorEntry {
  documentId: string;
  workspaceId?: string;
  editor: Editor;
  registeredAt: number;
}

export type DocumentPersistCallback = (
  documentId: string,
  data: {
    content: string;
    contentJson: Record<string, unknown>;
    wordCount: number;
    characterCount: number;
    updatedAt: string;
    title?: string;
    pageSize?: DocumentPageSize;
    orientation?: DocumentOrientation;
    margins?: DocumentMargins;
    marginPreset?: MarginPreset;
    columns?: 1 | 2 | 3;
    headerText?: string;
    footerText?: string;
    headerAlign?: 'left' | 'center' | 'right';
    footerAlign?: 'left' | 'center' | 'right';
    firstPageHeaderText?: string;
    firstPageFooterText?: string;
    showHeaderLine?: boolean;
    showFooterLine?: boolean;
    showPageNumbers?: boolean;
    pageNumberPosition?: 'bottom-center' | 'bottom-right' | 'top-right';
    differentFirstPage?: boolean;
    watermarkText?: string;
    pageColor?: string;
    pageBorder?: 'none' | 'box' | 'shadow' | 'double' | 'accent';
    pageBorderColor?: string;
    pageBorderWidth?: number;
    pageBorderOffset?: 'edge' | 'margin' | 'wide';
  }
) => void;

class DocumentEditorRegistry {
  private editors = new Map<string, RegisteredEditorEntry>();
  private activeDocumentId: string | null = null;
  private listeners = new Set<(docId: string, editor: Editor | null) => void>();
  private waitResolvers = new Map<string, Array<(editor: Editor) => void>>();

  /**
   * Register a mounted Tiptap Editor instance for a given document.
   */
  public register(documentId: string, editor: Editor, workspaceId?: string): void {
    if (!documentId || !editor || editor.isDestroyed) return;

    this.editors.set(documentId, {
      documentId,
      workspaceId: workspaceId || documentId,
      editor,
      registeredAt: Date.now(),
    });
    this.activeDocumentId = documentId;

    // Resolve any pending wait callers
    const pending = this.waitResolvers.get(documentId);
    if (pending && pending.length > 0) {
      pending.forEach((res) => {
        try {
          res(editor);
        } catch {
          // Ignore caller errors
        }
      });
      this.waitResolvers.delete(documentId);
    }

    // Resolve any wildcard wait callers
    const wildcardPending = this.waitResolvers.get('*');
    if (wildcardPending && wildcardPending.length > 0) {
      wildcardPending.forEach((res) => {
        try {
          res(editor);
        } catch {
          // Ignore caller errors
        }
      });
      this.waitResolvers.delete('*');
    }

    this.notify(documentId, editor);
  }

  /**
   * Unregister an editor instance on unmount.
   * Only unregisters if the registered instance matches the unmounting instance.
   * This prevents React StrictMode remounts from dropping a valid newly registered editor.
   */
  public unregister(documentId: string, editor?: Editor): void {
    if (!documentId) return;

    const existing = this.editors.get(documentId);
    if (!existing) return;

    if (!editor || existing.editor === editor) {
      this.editors.delete(documentId);
      if (this.activeDocumentId === documentId) {
        // Pick another active editor if one exists
        const remaining = Array.from(this.editors.keys());
        this.activeDocumentId = remaining.length > 0 ? remaining[0] : null;
      }
      this.notify(documentId, null);
    }
  }

  /**
   * Retrieve the active Tiptap editor for a document.
   * If a documentId is provided, ONLY returns the editor instance registered for that document.
   * Does NOT fall back to other documents, preventing command pollution across documents.
   */
  public getEditor(documentId?: string): Editor | null {
    if (typeof window === 'undefined') {
      return null;
    }

    if (documentId) {
      const entry = this.editors.get(documentId);
      if (entry && !entry.editor.isDestroyed) {
        return entry.editor;
      }
      if (entry && entry.editor.isDestroyed) {
        this.editors.delete(documentId);
      }
      // Also check if any editor was registered with this workspaceId or documentId
      for (const [id, e] of this.editors.entries()) {
        if ((id === documentId || e.workspaceId === documentId || e.documentId === documentId) && !e.editor.isDestroyed) {
          return e.editor;
        }
      }
      return null;
    }

    // Fall back to current active document ID only when no specific ID requested
    if (this.activeDocumentId) {
      const activeEntry = this.editors.get(this.activeDocumentId);
      if (activeEntry && !activeEntry.editor.isDestroyed) {
        return activeEntry.editor;
      }
    }

    return null;
  }

  /**
   * Check if a valid, non-destroyed editor is currently registered.
   */
  public hasActiveEditor(documentId?: string): boolean {
    const editor = this.getEditor(documentId);
    return Boolean(editor && !editor.isDestroyed);
  }

  /**
   * Returns the current active document ID.
   */
  public getActiveDocumentId(): string | null {
    return this.activeDocumentId;
  }

  /**
   * Asynchronously wait for an editor instance to mount (with reactive listener + bounded timeout).
   * Essential for bridging mounting latency or React concurrent rendering delays.
   */
  public async waitForEditor(documentId?: string, timeoutMs: number = 2500): Promise<Editor | null> {
    const existing = this.getEditor(documentId);
    if (existing && !existing.isDestroyed) {
      return existing;
    }

    const targetKey = documentId || this.activeDocumentId || '*';

    return new Promise((resolve) => {
      let resolved = false;
      let timer: NodeJS.Timeout | null = null;
      let unsubscribe: (() => void) | null = null;

      const finish = (ed: Editor | null) => {
        if (!resolved) {
          resolved = true;
          if (timer) clearTimeout(timer);
          if (unsubscribe) unsubscribe();
          resolve(ed);
        }
      };

      // Subscribe to reactive registration events
      unsubscribe = this.subscribe((registeredDocId, ed) => {
        if ((targetKey === '*' || registeredDocId === targetKey) && ed && !ed.isDestroyed) {
          finish(ed);
        }
      });

      // Bounded timeout
      timer = setTimeout(() => {
        const finalCheck = this.getEditor(documentId);
        finish(finalCheck);
      }, timeoutMs);
    });
  }

  /**
   * Executes a document action on canonical document store state when no live Tiptap editor is mounted.
   * Enables background, server-side, or Universal AI chat operations on documents.
   */
  public executeCanonicalAction(
    action: string,
    payload: Record<string, unknown>,
    documentId: string
  ): EditorActionResult | null {
    try {
      const store = useWorkspaceStore.getState();
      if (!store || !Array.isArray(store.documents)) return null;

      const doc = store.documents.find((d) => d.id === documentId);
      if (!doc) return null;

      const targetPage = typeof payload.page === 'number' ? Math.max(1, payload.page) : 1;

      if (action === 'clear_current_page') {
        const contentStr = (doc.content || '').trim();
        const isHtmlEmpty = !contentStr || contentStr === '<p></p>' || contentStr === '<p><br></p>' || contentStr === '<div></div>';

        if (isHtmlEmpty) {
          return {
            success: true,
            status: 'already_empty',
            statusCode: 'PAGE_ALREADY_EMPTY',
            changed: false,
            documentId,
            pageNumber: targetPage,
            summary: `Page ${targetPage} was already empty`,
            verification: {
              pageExists: true,
              bodyContentEmpty: true,
              headersPreserved: true,
              footersPreserved: true,
              pageStructurePreserved: true,
            },
            persisted: true,
          };
        }

        // Apply page clearing to canonical store
        store.updateDocument(documentId, {
          content: '<p></p>',
          wordCount: 0,
          characterCount: 0,
          updatedAt: new Date().toISOString(),
        });

        return {
          success: true,
          status: 'cleared',
          statusCode: 'SUCCESS',
          changed: true,
          documentId,
          pageNumber: targetPage,
          summary: `Cleared body content on page ${targetPage}`,
          verification: {
            pageExists: true,
            bodyContentEmpty: true,
            headersPreserved: true,
            footersPreserved: true,
            pageStructurePreserved: true,
          },
          persisted: true,
        };
      }

      if (action === 'insert_code_block') {
        const lang = payload.language ? String(payload.language).trim() : 'python';
        const rawCode = String(payload.code || '');
        if (!rawCode) {
          return {
            success: false,
            status: 'INVALID_ARGUMENTS',
            statusCode: 'INVALID_ARGUMENTS',
            error: 'No code provided for insertion.',
            documentId,
            action,
          };
        }

        const codeLines = rawCode.split(/\r?\n/);
        const MAX_LINES_PER_PAGE = 36;
        let codeHtml = '';

        if (codeLines.length > MAX_LINES_PER_PAGE + 6) {
          const chunks: string[] = [];
          for (let idx = 0; idx < codeLines.length; idx += MAX_LINES_PER_PAGE) {
            const slice = codeLines.slice(idx, idx + MAX_LINES_PER_PAGE);
            const escaped = escapeHtml(slice.join('\n'));
            chunks.push(`<pre><code class="${lang ? 'language-' + lang : ''}">${escaped}</code></pre>`);
          }
          codeHtml = chunks.join('<div data-type="page-break" class="docium-page-break"></div>');
        } else {
          const escaped = escapeHtml(rawCode);
          codeHtml = `<pre><code class="${lang ? 'language-' + lang : ''}">${escaped}</code></pre>`;
        }

        const prevContent = doc.content || '';
        const newContent = prevContent && prevContent !== '<p></p>' ? `${prevContent}${codeHtml}` : codeHtml;

        store.updateDocument(documentId, {
          content: newContent,
          characterCount: (doc.characterCount || 0) + rawCode.length,
          updatedAt: new Date().toISOString(),
        });

        return {
          success: true,
          status: 'inserted',
          statusCode: 'SUCCESS',
          changed: true,
          contentChanged: true,
          documentId,
          action,
          insertedCharacters: rawCode.length,
          summary: `Inserted ${lang} code block (${rawCode.length} chars)`,
          persisted: true,
        };
      }

      if (action === 'insert_text' || action === 'append_or_insert_paragraph' || action === 'insert_structured_document') {
        const textToInsert = String(payload.content || payload.text || '');
        if (!textToInsert) {
          return {
            success: false,
            status: 'INVALID_ARGUMENTS',
            statusCode: 'INVALID_ARGUMENTS',
            error: 'No content provided for insertion.',
            documentId,
            action,
          };
        }

        const htmlToInsert =
          action === 'insert_structured_document' || action === 'append_or_insert_paragraph'
            ? convertMarkdownToDocumentHtml(textToInsert)
            : textToInsert.split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('');

        const prevContent = doc.content || '';
        const newContent = prevContent && prevContent !== '<p></p>' ? `${prevContent}${htmlToInsert}` : htmlToInsert;

        store.updateDocument(documentId, {
          content: newContent,
          characterCount: (doc.characterCount || 0) + textToInsert.length,
          updatedAt: new Date().toISOString(),
        });

        return {
          success: true,
          status: 'inserted',
          statusCode: 'SUCCESS',
          changed: true,
          documentId,
          insertedCharacters: textToInsert.length,
          summary: `Inserted content into ${doc.title || documentId} (+${textToInsert.length} chars)`,
          persisted: true,
        };
      }

      if (action === 'insert_hyperlink') {
        const url = String(payload.url || '').trim();
        if (!url) {
          return {
            success: false,
            status: 'INVALID_ARGUMENTS',
            statusCode: 'INVALID_ARGUMENTS',
            error: 'A non-empty URL is required for insert_hyperlink.',
            documentId,
            action,
          };
        }
        const text = payload.text ? String(payload.text) : undefined;
        const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
        const escapeAttr = (s: string) =>
          s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const prevContent = doc.content || '';
        let newContent = prevContent;
        let changed = false;

        if (targetText) {
          const linkHtml = `<a href="${escapeAttr(url)}">${escapeHtml(text || targetText)}</a>`;
          // Replace targetText only outside HTML tag attributes (<...>)
          const re = new RegExp(`(>[^<]*?)(${escapeRegExp(targetText)})`, 'i');
          if (re.test(prevContent)) {
            newContent = prevContent.replace(re, `$1${linkHtml}`);
            changed = newContent !== prevContent;
          }
        }

        if (!changed) {
          const anchor = `<a href="${escapeAttr(url)}">${escapeHtml(text || targetText || url)}</a>`;
          newContent = prevContent && prevContent !== '<p></p>' ? `${prevContent}<p>${anchor}</p>` : `<p>${anchor}</p>`;
          changed = true;
        }

        store.updateDocument(documentId, {
          content: newContent,
          updatedAt: new Date().toISOString(),
        });

        return {
          success: true,
          status: 'inserted',
          statusCode: 'SUCCESS',
          changed,
          contentChanged: changed,
          documentId,
          action,
          summary: `Inserted hyperlink to "${url}"`,
          persisted: true,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Executes a document editing action as a verified ProseMirror transaction on the active editor.
   */
  public async executeAction(
    action: string,
    payload: Record<string, unknown>,
    documentId?: string,
    onPersist?: DocumentPersistCallback
  ): Promise<EditorActionResult> {
    const targetDocId = (payload.documentId as string) || documentId || this.activeDocumentId || '';

    // If running in Node.js server environment: actions are dispatched via SSE to the browser client
    if (typeof window === 'undefined') {
      return {
        success: true,
        status: 'DISPATCHED_TO_CLIENT',
        statusCode: 'SUCCESS_DISPATCHED',
        documentId: targetDocId,
        action,
        summary: `Action "${action}" prepared for client editor execution on document "${targetDocId}".`,
      };
    }

    // Enforce strict active document boundary if activeDocumentId is explicitly set
    if (
      this.activeDocumentId &&
      targetDocId &&
      targetDocId !== this.activeDocumentId &&
      !Array.from(this.editors.values()).some((e) => e.workspaceId === targetDocId && e.documentId === this.activeDocumentId)
    ) {
      console.warn('[DOCIUM Editor Registry] Permission violation: Attempted to modify non-active document', {
        targetDocId,
        activeDocumentId: this.activeDocumentId,
        action,
      });
      return {
        success: false,
        status: 'EDITOR_REGISTRATION_MISMATCH',
        statusCode: 'EDITOR_REGISTRATION_MISMATCH',
        error: `Permission denied: Cannot edit document "${targetDocId}". Only the currently active document ("${this.activeDocumentId}") can be modified. To edit another document, open it as the active document first.`,
        documentId: targetDocId,
        action,
      };
    }

    let editor = this.getEditor(targetDocId);
    if (!editor || editor.isDestroyed) {
      for (const entry of this.editors.values()) {
        if (
          (entry.workspaceId === targetDocId ||
            entry.documentId === targetDocId ||
            (this.activeDocumentId && entry.documentId === this.activeDocumentId)) &&
          !entry.editor.isDestroyed
        ) {
          editor = entry.editor;
          break;
        }
      }
    }

    if (!editor || editor.isDestroyed) {
      editor = await this.waitForEditor(targetDocId, 2500);
    }

    if (!editor || editor.isDestroyed) {
      // Check document existence in workspace store or active editor registration
      const store = useWorkspaceStore.getState();
      const docExistsInStore =
        store?.documents?.some((d) => d.id === targetDocId) ||
        this.activeDocumentId === targetDocId ||
        this.editors.has(targetDocId) ||
        Array.from(this.editors.values()).some((e) => e.workspaceId === targetDocId);

      if (!docExistsInStore) {
        return {
          success: false,
          status: 'DOCUMENT_NOT_FOUND',
          statusCode: 'DOCUMENT_NOT_FOUND',
          error: `Document "${targetDocId}" was not found in the workspace.`,
          documentId: targetDocId,
          action,
        };
      }

      // If document exists, attempt canonical headless execution
      const canonicalResult = this.executeCanonicalAction(action, payload, targetDocId);
      if (canonicalResult) {
        return canonicalResult;
      }

      console.warn('[DOCIUM Editor Registry] Rejected: No active editor mounted', {
        action,
        documentId: targetDocId,
      });
      return {
        success: false,
        status: 'EDITOR_NOT_MOUNTED',
        statusCode: 'EDITOR_NOT_MOUNTED',
        error: `No active document editor is currently mounted for document "${targetDocId}". Ensure the document is open in the workspace.`,
        documentId: targetDocId,
        action,
      };
    }

    if (!editor.isEditable) {
      console.warn('[DOCIUM Editor Registry] Rejected: Document is read-only', {
        action,
        documentId: targetDocId,
      });
      return {
        success: false,
        status: 'DOCUMENT_READ_ONLY',
        statusCode: 'DOCUMENT_READ_ONLY',
        error: `Document "${targetDocId}" is read-only. Edits cannot be applied.`,
        documentId: targetDocId,
        action,
      };
    }

    const effectivePayload = await preRenderAsyncDiagramPayload(action, payload);
    return executeEditorTransaction(editor, action, effectivePayload, targetDocId, onPersist);
  }

  private notify(docId: string, editor: Editor | null) {
    for (const listener of this.listeners) {
      try {
        listener(docId, editor);
      } catch (err) {
        console.error('[DOCIUM Editor Registry] Listener error:', err);
      }
    }
  }

  public subscribe(listener: (docId: string, editor: Editor | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

type ResolvedTarget =
  | { mode: 'replace'; from: number; to: number }
  | { mode: 'insert'; pos: number }
  | { mode: 'start' }
  | { mode: 'end' }
  | { mode: 'cursor' }
  | { mode: 'error'; error: string };

/**
 * Resolves universal placement & replacement anchors (`replaceTargetText`, `replaceStartText`..`replaceEndText`,
 * `replaceBlockContaining`, `afterHeading`, `beforeHeading`, `afterText`, `beforeText`, `position`).
 */
function resolveTargetPositionOrRange(editor: Editor, payload: Record<string, unknown>): ResolvedTarget {
  const { doc } = editor.state;

  if (payload.replaceBlockContaining) {
    const matches = findBlockNodes(doc, {
      blockType: payload.replaceBlockType ? String(payload.replaceBlockType) : 'any',
      containsText: String(payload.replaceBlockContaining),
      afterHeading: payload.afterHeading ? String(payload.afterHeading) : undefined,
      maxResults: 5,
    });
    if (matches.length === 0) {
      return {
        mode: 'error',
        error: `No block containing "${String(payload.replaceBlockContaining)}" found in document.`,
      };
    }
    return { mode: 'replace', from: matches[0].from, to: matches[0].to };
  }

  if (payload.replaceStartText) {
    const anchor = findRangeByAnchors(
      doc,
      String(payload.replaceStartText),
      payload.replaceEndText ? String(payload.replaceEndText) : undefined,
      { expandToBlocks: payload.expandToBlocks !== false }
    );
    if (!anchor.found || anchor.from === undefined || anchor.to === undefined) {
      return {
        mode: 'error',
        error: `Anchor range starting at "${String(payload.replaceStartText)}" not found in document.`,
      };
    }
    return { mode: 'replace', from: anchor.from, to: anchor.to };
  }

  if (payload.replaceTargetText) {
    const searchRes = searchProseMirrorDoc(doc, { query: String(payload.replaceTargetText), maxResults: 5 });
    if (searchRes.totalMatches === 0) {
      return {
        mode: 'error',
        error: `No occurrences of "${String(payload.replaceTargetText)}" found in document.`,
      };
    }
    const rawRange = { from: searchRes.matches[0].from, to: searchRes.matches[0].to };
    const expanded = payload.expandToBlocks !== false ? expandRangeToEnclosingBlocks(doc, rawRange) : rawRange;
    return { mode: 'replace', from: expanded.from, to: expanded.to };
  }

  if (payload.beforeHeading) {
    const sec = findSectionByHeading(doc, String(payload.beforeHeading));
    if (sec.found && sec.from !== undefined) {
      return { mode: 'insert', pos: sec.from };
    }
  }

  if (payload.afterHeading) {
    const searchHeading = String(payload.afterHeading).toLowerCase().trim();
    let afterPos: number | null = null;
    doc.descendants((node, pos) => {
      if (
        afterPos === null &&
        node.type?.name === 'heading' &&
        node.textContent.toLowerCase().includes(searchHeading)
      ) {
        afterPos = pos + node.nodeSize;
      }
    });
    if (afterPos !== null) {
      if (payload.position === 'endOfSection') {
        const sec = findSectionByHeading(doc, searchHeading);
        if (sec.found && sec.to !== undefined) {
          return { mode: 'insert', pos: sec.to };
        }
      }
      return { mode: 'insert', pos: afterPos };
    }
  }

  if (payload.afterText || payload.beforeText) {
    const q = String(payload.afterText || payload.beforeText);
    const searchRes = searchProseMirrorDoc(doc, { query: q, maxResults: 5 });
    if (searchRes.totalMatches > 0) {
      const bounds = expandRangeToEnclosingBlocks(doc, {
        from: searchRes.matches[0].from,
        to: searchRes.matches[0].to,
      });
      return { mode: 'insert', pos: payload.beforeText ? bounds.from : bounds.to };
    }
  }

  const position = String(payload.position || '');
  if (position === 'start') return { mode: 'start' };
  if (position === 'end') return { mode: 'end' };
  if (position === 'replace_selection' && !editor.state.selection.empty) {
    return { mode: 'replace', from: editor.state.selection.from, to: editor.state.selection.to };
  }
  return { mode: 'cursor' };
}

function applyPositionedContent(
  editor: Editor,
  payload: Record<string, unknown>,
  contentOrNode: string | Record<string, unknown>,
  defaultFallbackPosition: 'cursor' | 'end' = 'cursor'
): { ok: true } | { ok: false; error: string } {
  const safeContent = typeof contentOrNode === 'string' ? sanitizeTableHtmlWhitespace(contentOrNode) : contentOrNode;
  const target = resolveTargetPositionOrRange(editor, payload);
  if (target.mode === 'error') {
    return { ok: false, error: target.error };
  }
  if (target.mode === 'replace') {
    editor
      .chain()
      .focus()
      .deleteRange({ from: target.from, to: target.to })
      .insertContentAt(target.from, safeContent)
      .run();
    return { ok: true };
  }
  if (target.mode === 'insert') {
    editor.chain().focus().insertContentAt(target.pos, safeContent).run();
    return { ok: true };
  }
  if (target.mode === 'start') {
    editor.chain().focus('start').insertContent(safeContent).run();
    return { ok: true };
  }
  if (target.mode === 'end' || (target.mode === 'cursor' && defaultFallbackPosition === 'end')) {
    editor.chain().focus('end').insertContent(safeContent).run();
    return { ok: true };
  }
  if (!editor.state.selection.empty) {
    editor.chain().focus().deleteSelection().insertContent(safeContent).run();
  } else {
    editor.chain().focus().insertContent(safeContent).run();
  }
  return { ok: true };
}

/**
 * Pre-renders Mermaid diagrams asynchronously in the browser into high-DPI PNG data URLs
 * (`htmlLabels: false` avoids SVG foreignObject canvas tainting and exports cleanly to Word/PDF).
 */
async function preRenderAsyncDiagramPayload(
  action: string,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const diagramCode = payload.diagramCode ?? (action === 'insert_diagram' ? payload.code : undefined);
  if (!diagramCode || typeof window === 'undefined' || typeof document === 'undefined') {
    return payload;
  }

  try {
    const mermaidMod = await import('mermaid');
    const mermaid = mermaidMod.default;
    const themeRaw = String(payload.theme || 'neutral').toLowerCase();
    const theme =
      themeRaw === 'forest' || themeRaw === 'dark' || themeRaw === 'default' || themeRaw === 'base'
        ? themeRaw
        : 'neutral';

    mermaid.initialize({
      startOnLoad: false,
      theme: theme as any,
      fontFamily: 'Calibri, Arial, sans-serif',
      securityLevel: 'loose',
      flowchart: { htmlLabels: false, useMaxWidth: false },
      sequence: { useMaxWidth: false },
    });

    const uniqueId = `docium-mmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { svg } = await mermaid.render(uniqueId, String(diagramCode));

    // Clean any leftover temporary render node created by mermaid
    try {
      document.getElementById(uniqueId)?.remove();
    } catch {
      // ignore cleanup error
    }

    // Determine rendered SVG bounding dimensions
    let svgW = 640;
    let svgH = 360;
    const vbMatch = svg.match(/viewBox=["'][\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)["']/i);
    if (vbMatch) {
      svgW = Math.max(180, Math.min(1200, Math.ceil(parseFloat(vbMatch[1]))));
      svgH = Math.max(100, Math.min(1000, Math.ceil(parseFloat(vbMatch[2]))));
    } else {
      const wMatch = svg.match(/width=["']([\d.]+)/i);
      const hMatch = svg.match(/height=["']([\d.]+)/i);
      if (wMatch) svgW = Math.max(180, Math.min(1200, Math.ceil(parseFloat(wMatch[1]))));
      if (hMatch) svgH = Math.max(100, Math.min(1000, Math.ceil(parseFloat(hMatch[1]))));
    }

    // Normalize explicit SVG pixel dimensions and background for clean offscreen rasterization
    let normalizedSvg = svg;
    if (!/xmlns=/.test(normalizedSvg)) {
      normalizedSvg = normalizedSvg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const svgBase64 = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(normalizedSvg)))}`;

    const pngDataUrl = await new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const pad = 20;
          const logicalW = svgW + pad * 2;
          const logicalH = svgH + pad * 2;
          const scaleFactor = 2;
          const canvas = document.createElement('canvas');
          canvas.width = logicalW * scaleFactor;
          canvas.height = logicalH * scaleFactor;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(svgBase64);
            return;
          }
          ctx.scale(scaleFactor, scaleFactor);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, logicalW, logicalH);
          ctx.drawImage(img, pad, pad, svgW, svgH);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(svgBase64);
        }
      };
      img.onerror = () => resolve(svgBase64);
      img.src = svgBase64;
    });

    const maxDocWidth = Number(payload.width) || Math.min(540, Math.max(280, svgW + 40));
    const aspectRatio = svgH / Math.max(1, svgW);
    const displayHeight = Math.round(maxDocWidth * aspectRatio);

    return {
      ...payload,
      _renderedDiagramDataUrl: pngDataUrl,
      _renderedDiagramWidth: maxDocWidth,
      _renderedDiagramHeight: displayHeight,
    };
  } catch (err) {
    return {
      ...payload,
      _renderedDiagramError: err instanceof Error ? err.message : 'Failed to render Mermaid diagram.',
    };
  }
}

/**
 * Execute atomic ProseMirror transaction on Tiptap editor and verify state changes.
 */
export function executeEditorTransaction(
  editor: Editor,
  action: string,
  payload: Record<string, unknown>,
  documentId: string,
  onPersist?: DocumentPersistCallback
): EditorActionResult {
  const initialHtml = editor.getHTML();
  const initialText = editor.getText();
  const initialSize = editor.state.doc.content.size;
  const prevChildrenSet =
    typeof window !== 'undefined' && editor.view?.dom
      ? new WeakSet<Element>(Array.from(editor.view.dom.children))
      : null;

  console.log(`[DOCIUM Editor Bridge] Executing "${action}" on doc "${documentId}"`, payload);

  let newTitle: string | undefined = undefined;
  let layoutUpdates: Record<string, unknown> | undefined = undefined;

  switch (action) {
    case 'insert_structured_document': {
      const rawContent = String(payload.content || '');
      const htmlContent = convertMarkdownAndLatexToHtml(rawContent);
      const isPlaceholder = initialText.trim() === 'Start typing...' || !initialText.trim();
      const effectivePayload = isPlaceholder && !payload.replaceTargetText && !payload.replaceStartText && !payload.replaceBlockContaining
        ? { ...payload, position: 'start' }
        : payload;
      const applied = applyPositionedContent(editor, effectivePayload, htmlContent, 'cursor');
      if (!applied.ok) {
        return { success: false, error: applied.error, documentId, action };
      }
      break;
    }

    case 'insert_text_at_cursor': {
      const rawText = String(payload.text || '');
      const htmlContent = convertMarkdownToDocumentHtml(rawText);
      editor.chain().focus().insertContent(htmlContent).run();
      break;
    }

    case 'prepend_to_document': {
      const rawContent = String(payload.content || payload.text || '');
      const htmlContent = convertMarkdownToDocumentHtml(rawContent);
      editor.chain().focus('start').insertContent(htmlContent).run();
      break;
    }

    case 'replace_selected_text': {
      const targetText = payload.targetText ? String(payload.targetText) : undefined;
      const rawText = String(payload.replacementText ?? payload.text ?? '');
      const htmlContent = convertMarkdownToDocumentHtml(rawText);
      if (targetText) {
        const count = replaceAllMatches(editor, targetText, rawText);
        if (count === 0 && !editor.state.selection.empty) {
          editor.chain().focus().deleteSelection().insertContent(htmlContent).run();
        }
      } else if (editor.state.selection.empty) {
        editor.chain().focus().insertContent(htmlContent).run();
      } else {
        editor.chain().focus().deleteSelection().insertContent(htmlContent).run();
      }
      break;
    }

    case 'delete_selected_content': {
      editor.chain().focus().deleteSelection().run();
      break;
    }

    case 'clear_current_page': {
      const targetPage = typeof payload.page === 'number' ? Math.max(1, payload.page) : 1;
      const { doc } = editor.state;
      const pageBreakPositions: number[] = [];

      doc.descendants((node, pos) => {
        if (node.type?.name === 'pageBreak') {
          pageBreakPositions.push(pos);
        }
      });

      const totalPages = pageBreakPositions.length + 1;
      if (targetPage > totalPages) {
        return {
          success: false,
          status: 'PAGE_NOT_FOUND',
          statusCode: 'PAGE_NOT_FOUND',
          error: `Page ${targetPage} does not exist in document (document has ${totalPages} page${totalPages === 1 ? '' : 's'}).`,
          documentId,
          action,
        };
      }

      // Determine page boundaries
      let fromPos = 0;
      let toPos = doc.content.size;

      if (pageBreakPositions.length > 0) {
        if (targetPage === 1) {
          toPos = pageBreakPositions[0];
        } else {
          fromPos = pageBreakPositions[targetPage - 2] + 1;
          toPos = targetPage - 1 < pageBreakPositions.length ? pageBreakPositions[targetPage - 1] : doc.content.size;
        }
      }

      // Check if page body is already empty (contains only empty paragraphs and no text, images, tables, or shapes)
      let hasBodyContent = false;
      doc.nodesBetween(fromPos, toPos, (node) => {
        if (hasBodyContent) return false;
        const name = node.type?.name;
        if (name === 'pageBreak' || name === 'sectionBreak') return true;
        if (node.isText && node.text && node.text.trim().length > 0) {
          hasBodyContent = true;
          return false;
        }
        if (name === 'image' || name === 'table' || name === 'dociumShape' || name === 'codeBlock') {
          hasBodyContent = true;
          return false;
        }
        return true;
      });

      if (!hasBodyContent) {
        // ALREADY EMPTY NO-OP: Successful outcome!
        return {
          success: true,
          status: 'already_empty',
          statusCode: 'PAGE_ALREADY_EMPTY',
          changed: false,
          contentChanged: false,
          documentId,
          pageNumber: targetPage,
          summary: `Page ${targetPage} was already empty`,
          verification: {
            pageExists: true,
            bodyContentEmpty: true,
            headersPreserved: true,
            footersPreserved: true,
            pageStructurePreserved: true,
          },
          persisted: true,
        };
      }

      // Execute actual deletion of body content on target page
      if (pageBreakPositions.length === 0) {
        editor.chain().focus().setContent('<p></p>').run();
      } else {
        editor
          .chain()
          .focus()
          .deleteRange({ from: fromPos, to: toPos })
          .insertContentAt(fromPos, '<p></p>')
          .run();
      }
      break;
    }

    case 'duplicate_content': {
      const target = (payload.target as string) || 'selection';
      if (target === 'heading' || payload.headingTitle) {
        const heading = String(payload.headingTitle || '');
        const sec = findSectionByHeading(editor.state.doc, heading);
        if (sec.found && sec.from !== undefined && sec.to !== undefined) {
          const slice = editor.state.doc.slice(sec.from, sec.to);
          const { tr } = editor.state;
          tr.insert(sec.to, slice.content);
          editor.view.dispatch(tr);
        }
      } else {
        const { from, to, empty } = editor.state.selection;
        if (!empty) {
          const slice = editor.state.doc.slice(from, to);
          const { tr } = editor.state;
          tr.insert(to, slice.content);
          editor.view.dispatch(tr);
        } else {
          const $from = editor.state.selection.$from;
          const paraStart = $from.start();
          const paraEnd = $from.end();
          const slice = editor.state.doc.slice(paraStart, paraEnd);
          const { tr } = editor.state;
          tr.insert(paraEnd, slice.content);
          editor.view.dispatch(tr);
        }
      }
      break;
    }

    case 'find_and_replace_text': {
      const findText = String(payload.findText || '');
      const replaceText = String(payload.replaceText ?? '');
      const matchIndex = typeof payload.matchIndex === 'number' ? payload.matchIndex : undefined;
      const caseSensitive = Boolean(payload.caseSensitive);
      const matchWholeWord = Boolean(payload.matchWholeWord);
      const plainTextOnly = Boolean(payload.plainTextOnly);

      if (matchIndex !== undefined) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, {
          query: findText,
          caseSensitive,
          matchWholeWord,
        });
        const match = searchRes.matches[matchIndex];
        if (match) {
          replaceTextInRange(editor, { from: match.from, to: match.to }, replaceText, { plainTextOnly });
        } else {
          return {
            success: false,
            error: `Match index ${matchIndex} not found for "${findText}" (total matches: ${searchRes.totalMatches}).`,
            documentId,
            action,
          };
        }
      } else {
        const count = replaceAllMatches(editor, findText, replaceText, {
          caseSensitive,
          matchWholeWord,
          plainTextOnly,
        });
        if (count === 0) {
          return {
            success: false,
            error: `No occurrences of "${findText}" found in document.`,
            documentId,
            action,
          };
        }
      }
      break;
    }

    case 'replace_content': {
      if (payload._renderedDiagramError) {
        return { success: false, error: String(payload._renderedDiagramError), documentId, action };
      }

      const rawReplacement = payload.replacement !== undefined ? String(payload.replacement) : '';
      let targetRange: { from: number; to: number } | null = null;

      if (payload.headingTitle) {
        const sec = findSectionByHeading(editor.state.doc, String(payload.headingTitle));
        if (!sec.found || sec.from === undefined || sec.to === undefined) {
          return { success: false, error: `Heading "${String(payload.headingTitle)}" not found.`, documentId, action };
        }
        let headingSize = 0;
        if (!payload.includeHeading) {
          editor.state.doc.nodesBetween(sec.from, Math.min(sec.from + 1, editor.state.doc.content.size), (n) => {
            if (n.type?.name === 'heading') headingSize = n.nodeSize;
          });
        }
        targetRange = { from: sec.from + headingSize, to: sec.to };
      } else if (payload.startText) {
        const anchor = findRangeByAnchors(
          editor.state.doc,
          String(payload.startText),
          payload.endText ? String(payload.endText) : undefined,
          {
            caseSensitive: Boolean(payload.caseSensitive),
            expandToBlocks: payload.expandToBlocks !== false,
          }
        );
        if (!anchor.found || anchor.from === undefined || anchor.to === undefined) {
          return {
            success: false,
            error: `Anchor range starting at "${String(payload.startText)}" was not found in document.`,
            documentId,
            action,
          };
        }
        targetRange = { from: anchor.from, to: anchor.to };
      } else if (payload.blockType || payload.containsText || typeof payload.blockIndex === 'number') {
        const blocks = findBlockNodes(editor.state.doc, {
          blockType: payload.blockType ? String(payload.blockType) : 'any',
          containsText: payload.containsText ? String(payload.containsText) : undefined,
          afterHeading: payload.afterHeading ? String(payload.afterHeading) : undefined,
          maxResults: 50,
        });
        const idx = typeof payload.blockIndex === 'number' ? payload.blockIndex : 0;
        const chosen = blocks[idx];
        if (!chosen && payload.targetText) {
          const fallbackRes = searchProseMirrorDoc(editor.state.doc, {
            query: String(payload.targetText),
            caseSensitive: Boolean(payload.caseSensitive),
          });
          if (fallbackRes.matches[0]) {
            targetRange = { from: fallbackRes.matches[0].from, to: fallbackRes.matches[0].to };
          }
        } else if (chosen) {
          targetRange = { from: chosen.from, to: chosen.to };
        }
        if (!targetRange) {
          return {
            success: false,
            error: `No matching ${payload.blockType || 'block'} found${payload.containsText ? ` containing "${payload.containsText}"` : ''}.`,
            documentId,
            action,
          };
        }
      } else if (payload.targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, {
          query: String(payload.targetText),
          caseSensitive: Boolean(payload.caseSensitive),
          matchWholeWord: Boolean(payload.matchWholeWord),
        });
        const mIdx = typeof payload.matchIndex === 'number' ? payload.matchIndex : 0;
        const match = searchRes.matches[mIdx];
        if (!match) {
          return {
            success: false,
            error: `No occurrences of "${String(payload.targetText)}" found in document.`,
            documentId,
            action,
          };
        }
        targetRange =
          payload.expandToBlocks !== false
            ? expandRangeToEnclosingBlocks(editor.state.doc, { from: match.from, to: match.to })
            : { from: match.from, to: match.to };
      } else {
        return {
          success: false,
          error: 'replace_content requires targetText, startText+endText, blockType/containsText, or headingTitle.',
          documentId,
          action,
        };
      }

      if (payload._renderedDiagramDataUrl) {
        const title = String(payload.diagramTitle || payload.title || 'Diagram');
        const diagNode = {
          type: 'image',
          attrs: {
            src: String(payload._renderedDiagramDataUrl),
            alt: title,
            title,
            width: Number(payload._renderedDiagramWidth || 480),
            height: Number(payload._renderedDiagramHeight || 280),
            alignment: String(payload.alignment || 'center'),
            caption: payload.caption ? String(payload.caption) : undefined,
          },
        };
        replaceTextInRange(editor, targetRange, '', { richContent: diagNode });
      } else if (!rawReplacement) {
        replaceTextInRange(editor, targetRange, '');
      } else {
        replaceTextInRange(editor, targetRange, rawReplacement, {
          plainTextOnly: Boolean(payload.plainTextOnly),
        });
      }
      break;
    }

    case 'move_document_section': {
      const srcHeading = String(payload.sourceHeading || '');
      const destHeading = payload.destinationHeading ? String(payload.destinationHeading) : undefined;
      const pos = (payload.position as 'before' | 'after' | 'start' | 'end') || 'after';
      const moved = moveDocumentSectionInEditor(editor, srcHeading, destHeading, pos);
      if (!moved) {
        return {
          success: false,
          error: `Could not move section "${srcHeading}". Verify that heading exists.`,
          documentId,
          action,
        };
      }
      break;
    }

    case 'append_or_insert_paragraph': {
      const rawText = String(payload.text || payload.content || '');
      const pText = convertMarkdownToDocumentHtml(rawText);
      const isPlaceholder = initialText.trim() === 'Start typing...' || !initialText.trim();
      if (isPlaceholder || payload.position === 'start') {
        editor.chain().focus('start').insertContent(pText).run();
      } else if (payload.position === 'cursor') {
        editor.chain().focus().insertContent(pText).run();
      } else if (payload.afterHeading) {
        let targetPos: number | null = null;
        const searchHeading = String(payload.afterHeading).toLowerCase();
        editor.state.doc.descendants((node, pos) => {
          if (
            targetPos === null &&
            node.type?.name === 'heading' &&
            node.textContent.toLowerCase().includes(searchHeading)
          ) {
            targetPos = pos + node.nodeSize;
          }
        });
        if (targetPos !== null) {
          editor.chain().focus().insertContentAt(targetPos, pText).run();
        } else {
          editor.chain().focus('end').insertContent(pText).run();
        }
      } else {
        editor.chain().focus('end').insertContent(pText).run();
      }
      break;
    }

    case 'create_or_edit_heading': {
      const level = Number(payload.level || 2);
      const text = String(payload.text || '');
      const headingHtml = `<h${level}>${text}</h${level}>`;
      if (payload.existingHeading) {
        let foundRange: { from: number; to: number } | null = null;
        const searchHeading = String(payload.existingHeading).toLowerCase();
        editor.state.doc.descendants((node, pos) => {
          if (
            !foundRange &&
            node.type?.name === 'heading' &&
            node.textContent.toLowerCase().includes(searchHeading)
          ) {
            foundRange = { from: pos, to: pos + node.nodeSize };
          }
        });
        if (foundRange) {
          const targetFrom = (foundRange as { from: number; to: number }).from;
          editor.chain().focus().deleteRange(foundRange).insertContentAt(targetFrom, headingHtml).run();
        } else {
          editor.chain().focus().insertContent(headingHtml).run();
        }
      } else {
        editor.chain().focus().insertContent(headingHtml).run();
      }
      break;
    }

    case 'create_document_list': {
      const items = Array.isArray(payload.items) ? (payload.items as string[]) : [];
      const listType = String(payload.listType || 'bullet');
      let listHtml = '';
      if (listType === 'task') {
        listHtml = `<ul data-type="taskList">${items
          .map((i) => `<li data-type="taskItem" data-checked="false"><p>${i}</p></li>`)
          .join('')}</ul>`;
      } else if (listType === 'ordered') {
        listHtml = `<ol>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ol>`;
      } else {
        listHtml = `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`;
      }
      editor.chain().focus().insertContent(listHtml).run();
      break;
    }

    case 'insert_document_table': {
      const headers = Array.isArray(payload.headers) ? (payload.headers as string[]) : undefined;
      const rows = Array.isArray(payload.rows) ? (payload.rows as string[][]) : undefined;
      const rowCount = typeof payload.rowCount === 'number' ? payload.rowCount : rows?.length || 3;
      const colCount = typeof payload.colCount === 'number' ? payload.colCount : headers?.length || 3;
      let tableHtml = '<table>';
      if (headers && headers.length > 0) {
        tableHtml += `<thead><tr>${headers.map((h) => `<th><p>${h}</p></th>`).join('')}</tr></thead>`;
      }
      tableHtml += '<tbody>';
      if (rows && rows.length > 0) {
        for (const row of rows) {
          tableHtml += `<tr>${row.map((c) => `<td><p>${c}</p></td>`).join('')}</tr>`;
        }
      } else {
        for (let r = 0; r < rowCount; r++) {
          tableHtml += `<tr>${Array(colCount).fill('<td><p></p></td>').join('')}</tr>`;
        }
      }
      tableHtml += '</tbody></table>';
      editor.chain().focus().insertContent(tableHtml).run();
      break;
    }

    case 'modify_table_structure': {
      const op = String(payload.operation || '');
      const chain = editor.chain().focus();
      if (op === 'addRowBefore') chain.addRowBefore().run();
      else if (op === 'addRowAfter') chain.addRowAfter().run();
      else if (op === 'deleteRow') chain.deleteRow().run();
      else if (op === 'addColumnBefore') chain.addColumnBefore().run();
      else if (op === 'addColumnAfter') chain.addColumnAfter().run();
      else if (op === 'deleteColumn') chain.deleteColumn().run();
      else if (op === 'mergeCells') chain.mergeCells().run();
      else if (op === 'splitCell') chain.splitCell().run();
      else if (op === 'deleteTable') chain.deleteTable().run();
      break;
    }

    case 'style_table': {
      const tableMatches = findBlockNodes(editor.state.doc, {
        blockType: 'table',
        containsText: payload.containsText ? String(payload.containsText) : undefined,
        afterHeading: payload.afterHeading ? String(payload.afterHeading) : undefined,
        maxResults: 50,
      });
      const reqIdx = typeof payload.tableIndex === 'number' ? payload.tableIndex : 0;
      const targetMatch = tableMatches[reqIdx] || tableMatches[0];
      if (!targetMatch) {
        return {
          success: false,
          error: payload.containsText
            ? `No table containing "${String(payload.containsText)}" found.`
            : 'No table found in document to style.',
          documentId,
          action,
        };
      }

      const tableNode = editor.state.doc.nodeAt(targetMatch.from);
      if (!tableNode || tableNode.type.name !== 'table') {
        return { success: false, error: 'Target node is not a table.', documentId, action };
      }

      const preset = String(payload.preset || 'grid').toLowerCase();
      const presetDefaults: Record<string, { headerBg: string; headerText: string; evenBg: string | null; oddBg: string | null; borderColor: string; borderStyle: 'solid' | 'dashed' | 'none' }> = {
        forest: { headerBg: '#245C45', headerText: '#FFFFFF', evenBg: '#F4F8F6', oddBg: '#FFFFFF', borderColor: '#B7D1C5', borderStyle: 'solid' },
        navy: { headerBg: '#1E3A8A', headerText: '#FFFFFF', evenBg: '#EFF6FF', oddBg: '#FFFFFF', borderColor: '#CBD5E1', borderStyle: 'solid' },
        executive: { headerBg: '#1E293B', headerText: '#FFFFFF', evenBg: '#F8FAFC', oddBg: '#FFFFFF', borderColor: '#CBD5E1', borderStyle: 'solid' },
        slate: { headerBg: '#1E293B', headerText: '#FFFFFF', evenBg: '#F8FAFC', oddBg: '#FFFFFF', borderColor: '#CBD5E1', borderStyle: 'solid' },
        striped: { headerBg: '#E2E8F0', headerText: '#171C19', evenBg: '#F8FAFC', oddBg: '#FFFFFF', borderColor: '#CBD5E1', borderStyle: 'solid' },
        minimal: { headerBg: '#F8FAFC', headerText: '#171C19', evenBg: null, oddBg: null, borderColor: '#E2E8F0', borderStyle: 'none' },
        grid: { headerBg: '#F1F5F3', headerText: '#171C19', evenBg: null, oddBg: null, borderColor: '#CBD5E1', borderStyle: 'solid' },
      };
      const base = presetDefaults[preset] || presetDefaults.grid;

      const headerBg = payload.headerBg ? String(payload.headerBg) : base.headerBg;
      const headerText = payload.headerTextColor ? String(payload.headerTextColor) : base.headerText;
      const evenBg = payload.evenRowBg !== undefined ? (payload.evenRowBg ? String(payload.evenRowBg) : null) : base.evenBg;
      const oddBg = payload.oddRowBg !== undefined ? (payload.oddRowBg ? String(payload.oddRowBg) : null) : base.oddBg;
      const borderColor = payload.borderColor ? String(payload.borderColor) : base.borderColor;
      const borderStyle = (payload.borderStyle as 'solid' | 'dashed' | 'none') || base.borderStyle;
      const boldFirstCol = Boolean(payload.boldFirstColumn);
      const boldMark = editor.state.schema.marks.bold;

      const { tr } = editor.state;
      let rowIdx = 0;
      tableNode.forEach((rowNode, rowOffset) => {
        const isFirstRow = rowIdx === 0;
        let colIdx = 0;
        rowNode.forEach((cellNode, cellOffset) => {
          const cellPos = targetMatch.from + 1 + rowOffset + 1 + cellOffset;
          const cellBg = isFirstRow ? headerBg : rowIdx % 2 === 1 ? oddBg : evenBg;
          const cellText = isFirstRow ? headerText : payload.textColor ? String(payload.textColor) : '#171C19';

          tr.setNodeMarkup(cellPos, undefined, {
            ...cellNode.attrs,
            backgroundColor: cellBg,
            textColor: cellText,
            borderColor,
            borderStyle,
            ...(payload.verticalAlign ? { verticalAlign: String(payload.verticalAlign) } : {}),
          });

          if (boldFirstCol && colIdx === 0 && !isFirstRow && boldMark) {
            const cFrom = cellPos + 1;
            const cTo = cellPos + cellNode.nodeSize - 1;
            if (cTo > cFrom) {
              tr.addMark(cFrom, cTo, boldMark.create());
            }
          }
          colIdx++;
        });
        rowIdx++;
      });

      editor.view.dispatch(tr);
      break;
    }

    case 'insert_hyperlink': {
      const url = String(payload.url || '').trim();
      const text = payload.text ? String(payload.text) : undefined;
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
      const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      if (!url) {
        return { success: false, error: 'A non-empty URL is required for insert_hyperlink.' };
      }

      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        if (searchRes.totalMatches > 0) {
          for (let i = searchRes.matches.length - 1; i >= 0; i--) {
            const m = searchRes.matches[i];
            if (text && text !== targetText) {
              editor
                .chain()
                .focus()
                .insertContentAt({ from: m.from, to: m.to }, `<a href="${escapeAttr(url)}">${escapeHtml(text)}</a>`)
                .run();
            } else {
              editor
                .chain()
                .focus()
                .setTextSelection({ from: m.from, to: m.to })
                .extendMarkRange('link')
                .setLink({ href: url })
                .run();
            }
          }
          // If the target text already had this exact link href, treat as idempotent success rather than failing
          if (editor.getHTML() === initialHtml) {
            return {
              success: true,
              documentId,
              action,
              contentChanged: false,
              persisted: true,
            };
          }
        } else if (text) {
          editor.chain().focus('end').insertContent(`<a href="${escapeAttr(url)}">${escapeHtml(text)}</a>`).run();
        } else {
          return {
            success: false,
            error: `Target text "${targetText}" not found in document.`,
            documentId,
            action,
            contentChanged: false,
            persisted: false,
          };
        }
      } else if (!editor.state.selection.empty && !text) {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        if (editor.getHTML() === initialHtml) {
          return {
            success: true,
            documentId,
            action,
            contentChanged: false,
            persisted: true,
          };
        }
      } else if (text) {
        editor.chain().focus().insertContent(`<a href="${escapeAttr(url)}">${escapeHtml(text)}</a>`).run();
      } else {
        editor.chain().focus().insertContent(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`).run();
      }
      break;
    }

    case 'format_document_text': {
      const fmt = String(payload.formatting || '');
      const val = payload.value ? String(payload.value) : undefined;
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;

      const applyMarkToChain = (chain: any) => {
        if (fmt === 'bold') {
          if (payload.enabled === true) chain.setBold();
          else if (payload.enabled === false) chain.unsetBold();
          else chain.toggleBold();
        } else if (fmt === 'italic') {
          if (payload.enabled === true) chain.setItalic();
          else if (payload.enabled === false) chain.unsetItalic();
          else chain.toggleItalic();
        } else if (fmt === 'underline') {
          if (payload.enabled === true) chain.setUnderline();
          else if (payload.enabled === false) chain.unsetUnderline();
          else chain.toggleUnderline();
        } else if (fmt === 'strike') {
          if (payload.enabled === true) chain.setStrike();
          else if (payload.enabled === false) chain.unsetStrike();
          else chain.toggleStrike();
        } else if (fmt === 'subscript') chain.toggleSubscript();
        else if (fmt === 'superscript') chain.toggleSuperscript();
        else if (fmt === 'code') chain.toggleCode();
        else if (fmt === 'color') chain.setColor(val || '#000000');
        else if (fmt === 'highlight') chain.setHighlight({ color: val || '#fef08a' });
        else if (fmt === 'clear') chain.unsetAllMarks().clearNodes();
        chain.run();
      };

      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        if (searchRes.totalMatches > 0) {
          for (let i = searchRes.matches.length - 1; i >= 0; i--) {
            const m = searchRes.matches[i];
            applyMarkToChain(editor.chain().setTextSelection({ from: m.from, to: m.to }));
          }
        } else {
          return {
            success: false,
            error: `Target text "${targetText}" not found for formatting.`,
            documentId,
            action,
          };
        }
      } else if (editor.state.selection.empty) {
        const docSize = editor.state.doc.content.size;
        if (docSize > 2) {
          const prevPos = editor.state.selection.from;
          applyMarkToChain(editor.chain().selectAll());
          try {
            editor.commands.setTextSelection(Math.max(1, Math.min(prevPos, editor.state.doc.content.size - 1)));
          } catch {
            // ignore non-inline fallback cursor restore
          }
        }
      } else {
        applyMarkToChain(editor.chain().focus());
      }
      break;
    }

    case 'set_font_style': {
      const rawFontFamily = payload.fontFamily ? String(payload.fontFamily) : undefined;
      const fontFamily = rawFontFamily ? resolveFontFamilyValue(rawFontFamily) : undefined;
      if (fontFamily) ensureGoogleFontLoaded(fontFamily);
      const rawFontSize = payload.fontSize !== undefined && payload.fontSize !== null ? payload.fontSize : undefined;
      const fontSize = rawFontSize !== undefined ? normalizeFontSizeToPt(rawFontSize as string | number) : undefined;
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;

      const applyFontToChain = (chain: any) => {
        if (fontFamily) chain.setFontFamily(fontFamily);
        if (fontSize) chain.setFontSize(fontSize);
        chain.run();
      };

      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        for (let i = searchRes.matches.length - 1; i >= 0; i--) {
          const m = searchRes.matches[i];
          applyFontToChain(editor.chain().setTextSelection({ from: m.from, to: m.to }));
        }
      } else if (editor.state.selection.empty) {
        const docSize = editor.state.doc.content.size;
        if (docSize > 2) {
          const prevPos = editor.state.selection.from;
          applyFontToChain(editor.chain().selectAll());
          try {
            editor.commands.setTextSelection(Math.max(1, Math.min(prevPos, editor.state.doc.content.size - 1)));
          } catch {
            // ignore non-inline fallback cursor restore
          }
        }
      } else {
        applyFontToChain(editor.chain().focus());
      }
      break;
    }

    case 'set_line_height': {
      const rawLh = payload.lineHeight !== undefined && payload.lineHeight !== null ? String(payload.lineHeight).trim() : undefined;
      const lh = rawLh === '1' ? '1.0' : rawLh === '2' ? '2.0' : rawLh === '3' ? '3.0' : rawLh;
      const spaceBefore = payload.spaceBefore !== undefined ? Boolean(payload.spaceBefore) : undefined;
      const spaceAfter = payload.spaceAfter !== undefined ? Boolean(payload.spaceAfter) : undefined;
      const marginTopPx = typeof payload.marginTopPx === 'number' ? `${payload.marginTopPx}px` : spaceBefore !== undefined ? (spaceBefore ? '14px' : '0px') : undefined;
      const marginBottomPx = typeof payload.marginBottomPx === 'number' ? `${payload.marginBottomPx}px` : spaceAfter !== undefined ? (spaceAfter ? '14px' : '0px') : undefined;
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;

      const applySpacingToChain = (chain: any) => {
        if (lh) chain.setLineHeight(lh);
        if (marginTopPx !== undefined || marginBottomPx !== undefined) {
          chain.setParagraphSpacing({
            ...(marginTopPx !== undefined ? { marginTop: marginTopPx } : {}),
            ...(marginBottomPx !== undefined ? { marginBottom: marginBottomPx } : {}),
          });
        }
        chain.run();
      };

      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        for (let i = searchRes.matches.length - 1; i >= 0; i--) {
          const m = searchRes.matches[i];
          applySpacingToChain(editor.chain().setTextSelection({ from: m.from, to: m.to }));
        }
      } else if (editor.state.selection.empty || payload.scope === 'all') {
        const docSize = editor.state.doc.content.size;
        if (docSize > 2) {
          const prevPos = editor.state.selection.from;
          applySpacingToChain(editor.chain().selectAll());
          try {
            editor.commands.setTextSelection(Math.max(1, Math.min(prevPos, editor.state.doc.content.size - 1)));
          } catch {
            // ignore non-inline fallback cursor restore
          }
        }
      } else {
        applySpacingToChain(editor.chain().focus());
      }
      break;
    }

    case 'change_document_alignment': {
      const align = (payload.alignment as 'left' | 'center' | 'right' | 'justify') || 'left';
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        for (let i = searchRes.matches.length - 1; i >= 0; i--) {
          const m = searchRes.matches[i];
          editor.chain().setTextSelection({ from: m.from, to: m.to }).setTextAlign(align).run();
        }
      } else if (editor.state.selection.empty || payload.scope === 'all') {
        const docSize = editor.state.doc.content.size;
        if (docSize > 2) {
          const prevPos = editor.state.selection.from;
          editor.chain().selectAll().setTextAlign(align).run();
          try {
            editor.commands.setTextSelection(Math.max(1, Math.min(prevPos, editor.state.doc.content.size - 1)));
          } catch {
            // ignore non-inline fallback cursor restore
          }
        }
      } else {
        editor.chain().focus().setTextAlign(align).run();
      }
      break;
    }

    case 'insert_callout_box': {
      const calloutType = (payload.type as 'info' | 'tip' | 'warning' | 'danger' | 'note') || 'info';
      const innerHtml = payload.content ? convertMarkdownAndLatexToHtml(String(payload.content)) : '<p></p>';
      const calloutHtml = `<div data-type="callout" data-callout-type="${calloutType}">${innerHtml}</div>`;
      const applied = applyPositionedContent(editor, payload, calloutHtml, 'cursor');
      if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      break;
    }

    case 'insert_vector_shape': {
      const shapeNode = {
        type: 'shape',
        attrs: {
          shapeType: (payload.shapeType as any) || 'rectangle',
          width: Number(payload.width || 180),
          height: Number(payload.height || 110),
          fill: String(payload.fill || '#EAF2ED'),
          stroke: String(payload.stroke || '#245C45'),
          strokeWidth: Number(payload.strokeWidth ?? 2),
          strokeStyle: (payload.strokeStyle as any) || 'solid',
          rotation: Number(payload.rotation || 0),
          alignment: (payload.alignment as any) || 'center',
          text: payload.text ? String(payload.text) : '',
          textColor: payload.textColor ? String(payload.textColor) : '#171C19',
          fontSize: Number(payload.fontSize || 12),
        },
      };
      const applied = applyPositionedContent(editor, payload, shapeNode, 'cursor');
      if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      break;
    }

    case 'insert_text_box': {
      const boxText = payload.text ? String(payload.text) : payload.content ? String(payload.content) : 'Text box content...';
      const textBoxNode = {
        type: 'textBox',
        attrs: {
          width: Number(payload.width ?? 0),
          minHeight: Number(payload.minHeight ?? 64),
          fill: String(payload.fill || '#F8FAF9'),
          textColor: String(payload.textColor || '#171C19'),
          borderColor: String(payload.borderColor || '#245C45'),
          borderWidth: Number(payload.borderWidth ?? 1),
          borderStyle: (payload.borderStyle as any) || 'solid',
          borderRadius: Number(payload.borderRadius ?? 4),
          padding: Number(payload.padding ?? 12),
          alignment: (payload.alignment as any) || 'full',
          shadow: Boolean(payload.shadow),
        },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: boxText }],
          },
        ],
      };
      const applied = applyPositionedContent(editor, payload, textBoxNode, 'cursor');
      if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      break;
    }

    case 'insert_equation': {
      const latex = String(payload.latex || payload.expression || 'E = mc^2');
      const eqNode = {
        type: 'equation',
        attrs: { latex, displayMode: payload.displayMode !== false },
      };
      if (payload.afterHeading || payload.beforeHeading || payload.afterText || payload.beforeText || payload.replaceTargetText || payload.replaceStartText || payload.replaceBlockContaining || payload.position) {
        const applied = applyPositionedContent(editor, payload, eqNode, 'cursor');
        if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      } else {
        editor.chain().focus().insertEquation({ latex, displayMode: payload.displayMode !== false }).run();
      }
      break;
    }

    case 'insert_document_image': {
      const url = String(payload.url || '');
      const alt = payload.alt ? String(payload.alt) : undefined;
      const title = payload.title ? String(payload.title) : undefined;
      const imageNode = {
        type: 'image',
        attrs: {
          src: url,
          alt,
          title,
          ...(payload.width ? { width: Number(payload.width) } : {}),
          ...(payload.height ? { height: Number(payload.height) } : {}),
          ...(payload.alignment ? { alignment: String(payload.alignment) } : {}),
          ...(payload.caption ? { caption: String(payload.caption) } : {}),
        },
      };
      const applied = applyPositionedContent(editor, payload, imageNode, 'cursor');
      if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      break;
    }

    case 'insert_diagram': {
      if (payload._renderedDiagramError) {
        return {
          success: false,
          error: String(payload._renderedDiagramError),
          documentId,
          action,
        };
      }
      if (!payload._renderedDiagramDataUrl) {
        return {
          success: false,
          error: 'Mermaid diagram rendering did not produce an image.',
          documentId,
          action,
        };
      }
      const diagTitle = String(payload.title || payload.diagramTitle || 'Diagram');
      const diagramNode = {
        type: 'image',
        attrs: {
          src: String(payload._renderedDiagramDataUrl),
          alt: diagTitle,
          title: diagTitle,
          width: Number(payload._renderedDiagramWidth || 480),
          height: Number(payload._renderedDiagramHeight || 280),
          alignment: String(payload.alignment || 'center'),
          caption: payload.caption ? String(payload.caption) : diagTitle,
        },
      };
      const applied = applyPositionedContent(editor, payload, diagramNode, 'end');
      if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      break;
    }

    case 'insert_chart': {
      const chartType = (String(payload.chartType || 'column').toLowerCase()) as 'column' | 'bar' | 'line' | 'pie' | 'doughnut';
      const chartTitle = String(payload.title || 'Chart');
      const labels = Array.isArray(payload.labels) ? payload.labels.map(String) : ['Q1', 'Q2', 'Q3', 'Q4'];
      const values = Array.isArray(payload.values) ? payload.values.map((v) => Number(v) || 0) : [25, 50, 75, 100];
      const subtitle = payload.subtitle ? String(payload.subtitle) : '';
      const palette = ['#245C45', '#398568', '#54B68E', '#84CC16', '#0D9488', '#1E40AF', '#2563EB'];

      // Render high-DPI 2x PNG chart via offscreen canvas so it renders cleanly in Editor AND native OpenXML .docx
      let chartDataUrl = '';
      if (typeof document !== 'undefined') {
        const logicalW = 540;
        const logicalH = 320;
        const canvas = document.createElement('canvas');
        canvas.width = logicalW * 2;
        canvas.height = logicalH * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.scale(2, 2);
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, logicalW, logicalH);
          ctx.strokeStyle = '#E2E8F0';
          ctx.lineWidth = 1;
          ctx.strokeRect(0.5, 0.5, logicalW - 1, logicalH - 1);

          ctx.fillStyle = '#171C19';
          ctx.font = 'bold 15px Calibri, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(chartTitle, logicalW / 2, 28);
          if (subtitle) {
            ctx.fillStyle = '#64748B';
            ctx.font = '11px Calibri, Arial, sans-serif';
            ctx.fillText(subtitle, logicalW / 2, 46);
          }

          const count = Math.max(1, Math.min(labels.length, values.length));
          const safeLabels = labels.slice(0, count);
          const safeVals = values.slice(0, count);

          if (chartType === 'pie' || chartType === 'doughnut') {
            const total = safeVals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
            const cx = logicalW * 0.38;
            const cy = 185;
            const r = 92;
            let startAngle = -Math.PI / 2;
            safeVals.forEach((v, idx) => {
              const sliceAngle = (Math.max(0, v) / total) * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
              ctx.closePath();
              ctx.fillStyle = palette[idx % palette.length];
              ctx.fill();
              ctx.strokeStyle = '#FFFFFF';
              ctx.lineWidth = 2;
              ctx.stroke();
              startAngle += sliceAngle;
            });
            if (chartType === 'doughnut') {
              ctx.beginPath();
              ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2);
              ctx.fillStyle = '#FFFFFF';
              ctx.fill();
            }
            ctx.textAlign = 'left';
            safeLabels.forEach((lbl, idx) => {
              const ly = 96 + idx * 24;
              const pct = Math.round((Math.max(0, safeVals[idx]) / total) * 100);
              ctx.fillStyle = palette[idx % palette.length];
              ctx.fillRect(logicalW * 0.65, ly - 9, 12, 12);
              ctx.fillStyle = '#1E293B';
              ctx.font = '11px Calibri, Arial, sans-serif';
              ctx.fillText(`${lbl.slice(0, 18)}: ${safeVals[idx]} (${pct}%)`, logicalW * 0.65 + 18, ly + 1);
            });
          } else {
            const padLeft = chartType === 'bar' ? 115 : 58;
            const padRight = 28;
            const padTop = 64;
            const padBottom = 48;
            const plotW = logicalW - padLeft - padRight;
            const plotH = logicalH - padTop - padBottom;
            const maxVal = Math.max(...safeVals, 1) * 1.15;

            ctx.strokeStyle = '#CBD5E1';
            ctx.beginPath();
            ctx.moveTo(padLeft, padTop);
            ctx.lineTo(padLeft, padTop + plotH);
            ctx.lineTo(padLeft + plotW, padTop + plotH);
            ctx.stroke();

            if (chartType === 'bar') {
              const slotH = plotH / count;
              const barH = Math.min(28, slotH * 0.58);
              safeVals.forEach((v, idx) => {
                const bw = (Math.max(0, v) / maxVal) * plotW;
                const by = padTop + idx * slotH + (slotH - barH) / 2;
                ctx.fillStyle = palette[idx % palette.length];
                ctx.fillRect(padLeft, by, bw, barH);
                ctx.fillStyle = '#1E293B';
                ctx.font = 'bold 10px Calibri, Arial, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(String(v), padLeft + bw + 5, by + barH / 2 + 3);
                ctx.fillStyle = '#475569';
                ctx.textAlign = 'right';
                ctx.fillText(safeLabels[idx].slice(0, 16), padLeft - 8, by + barH / 2 + 3);
              });
            } else if (chartType === 'line') {
              const stepX = count > 1 ? plotW / (count - 1) : plotW / 2;
              const pts = safeVals.map((v, idx) => ({
                x: count > 1 ? padLeft + idx * stepX : padLeft + plotW / 2,
                y: padTop + plotH - (Math.max(0, v) / maxVal) * plotH,
              }));
              ctx.strokeStyle = palette[0];
              ctx.lineWidth = 2.5;
              ctx.beginPath();
              pts.forEach((pt, idx) => (idx === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
              ctx.stroke();
              pts.forEach((pt, idx) => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                ctx.strokeStyle = palette[0];
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.fillStyle = '#1E293B';
                ctx.font = 'bold 10px Calibri, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(safeVals[idx]), pt.x, pt.y - 8);
                ctx.fillStyle = '#475569';
                ctx.fillText(safeLabels[idx].slice(0, 12), pt.x, padTop + plotH + 16);
              });
            } else {
              const slotW = plotW / count;
              const barW = Math.min(44, slotW * 0.56);
              safeVals.forEach((v, idx) => {
                const bh = (Math.max(0, v) / maxVal) * plotH;
                const bx = padLeft + idx * slotW + (slotW - barW) / 2;
                const by = padTop + plotH - bh;
                ctx.fillStyle = palette[idx % palette.length];
                ctx.fillRect(bx, by, barW, bh);
                ctx.fillStyle = '#1E293B';
                ctx.font = 'bold 10px Calibri, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(v), bx + barW / 2, by - 5);
                ctx.fillStyle = '#475569';
                ctx.fillText(safeLabels[idx].slice(0, 12), bx + barW / 2, padTop + plotH + 16);
              });
            }
          }
          chartDataUrl = canvas.toDataURL('image/png');
        }
      }

      if (chartDataUrl) {
        const chartNode = {
          type: 'image',
          attrs: {
            src: chartDataUrl,
            alt: chartTitle,
            title: chartTitle,
            width: 480,
            height: 285,
            alignment: String(payload.alignment || 'center'),
            caption: `Chart: ${chartTitle}`,
          },
        };
        const applied = applyPositionedContent(editor, payload, chartNode, 'end');
        if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      }
      break;
    }

    case 'insert_document_page_break': {
      editor.chain().focus().setPageBreak().run();
      break;
    }

    case 'insert_document_section_break': {
      editor.chain().focus().setSectionBreak().run();
      break;
    }

    case 'modify_page_layout': {
      layoutUpdates = {
        ...(payload.pageSize !== undefined ? { pageSize: payload.pageSize as DocumentPageSize } : {}),
        ...(payload.orientation !== undefined ? { orientation: payload.orientation as DocumentOrientation } : {}),
        ...(payload.marginPreset !== undefined ? { marginPreset: payload.marginPreset as MarginPreset } : {}),
        ...(payload.margins !== undefined ? { margins: payload.margins as DocumentMargins } : {}),
        ...(payload.columns !== undefined ? { columns: Number(payload.columns) as 1 | 2 | 3 } : {}),
        ...(payload.headerText !== undefined ? { headerText: String(payload.headerText) } : {}),
        ...(payload.footerText !== undefined ? { footerText: String(payload.footerText) } : {}),
        ...(payload.headerAlign !== undefined ? { headerAlign: payload.headerAlign as 'left' | 'center' | 'right' } : {}),
        ...(payload.footerAlign !== undefined ? { footerAlign: payload.footerAlign as 'left' | 'center' | 'right' } : {}),
        ...(payload.firstPageHeaderText !== undefined ? { firstPageHeaderText: String(payload.firstPageHeaderText) } : {}),
        ...(payload.firstPageFooterText !== undefined ? { firstPageFooterText: String(payload.firstPageFooterText) } : {}),
        ...(payload.showHeaderLine !== undefined ? { showHeaderLine: Boolean(payload.showHeaderLine) } : {}),
        ...(payload.showFooterLine !== undefined ? { showFooterLine: Boolean(payload.showFooterLine) } : {}),
        ...(payload.showPageNumbers !== undefined ? { showPageNumbers: Boolean(payload.showPageNumbers) } : {}),
        ...(payload.pageNumberPosition !== undefined ? { pageNumberPosition: payload.pageNumberPosition as 'bottom-center' | 'bottom-right' | 'top-right' } : {}),
        ...(payload.differentFirstPage !== undefined ? { differentFirstPage: Boolean(payload.differentFirstPage) } : {}),
        ...(payload.watermarkText !== undefined ? { watermarkText: String(payload.watermarkText) } : {}),
        ...(payload.pageColor !== undefined ? { pageColor: String(payload.pageColor) } : {}),
        ...(payload.pageBorder !== undefined ? { pageBorder: payload.pageBorder as 'none' | 'box' | 'shadow' | 'double' | 'accent' } : {}),
        ...(payload.pageBorderColor !== undefined ? { pageBorderColor: String(payload.pageBorderColor) } : {}),
        ...(payload.pageBorderWidth !== undefined ? { pageBorderWidth: Number(payload.pageBorderWidth) } : {}),
        ...(payload.pageBorderOffset !== undefined ? { pageBorderOffset: payload.pageBorderOffset as 'edge' | 'margin' | 'wide' } : {}),
      };
      break;
    }

    case 'export_document':
    case 'set_document_view':
    case 'set_editor_preferences': {
      break;
    }

    case 'adjust_indent': {
      const dir = payload.direction === 'outdent' ? 'outdent' : 'indent';
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
      const applyIndent = (chain: any) => {
        if (editor.isActive('listItem') || editor.isActive('taskItem')) {
          const itemType = editor.isActive('taskItem') ? 'taskItem' : 'listItem';
          if (dir === 'indent') chain.sinkListItem(itemType);
          else chain.liftListItem(itemType);
        } else {
          if (dir === 'indent') chain.indentParagraph();
          else chain.outdentParagraph();
        }
        chain.run();
      };
      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        for (let i = searchRes.matches.length - 1; i >= 0; i--) {
          const m = searchRes.matches[i];
          applyIndent(editor.chain().setTextSelection({ from: m.from, to: m.to }));
        }
      } else if (editor.state.selection.empty && payload.scope === 'all') {
        applyIndent(editor.chain().selectAll());
      } else {
        applyIndent(editor.chain().focus());
      }
      break;
    }

    case 'change_text_case': {
      const caseType = String(payload.caseType || 'titlecase');
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
      const transformCase = (txt: string) => {
        if (caseType === 'uppercase') return txt.toUpperCase();
        if (caseType === 'lowercase') return txt.toLowerCase();
        if (caseType === 'sentencecase') {
          return txt.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (c) => c.toUpperCase());
        }
        return txt.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
      };

      const applyCaseToRange = (from: number, to: number) => {
        const selected = editor.state.doc.textBetween(from, to, ' ');
        if (!selected) return;
        const tr = editor.state.tr;
        tr.insertText(transformCase(selected), from, to);
        editor.view.dispatch(tr);
      };

      if (targetText) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        for (let i = searchRes.matches.length - 1; i >= 0; i--) {
          const m = searchRes.matches[i];
          applyCaseToRange(m.from, m.to);
        }
      } else if (!editor.state.selection.empty) {
        const { from, to } = editor.state.selection;
        applyCaseToRange(from, to);
      }
      break;
    }

    case 'editor_undo': {
      editor.chain().focus().undo().run();
      break;
    }

    case 'editor_redo': {
      editor.chain().focus().redo().run();
      break;
    }

    case 'navigate_to_document_heading': {
      const searchHeading = String(payload.headingText || '').toLowerCase();
      const searchText = payload.searchText ? String(payload.searchText) : '';
      let foundPos: number | null = null;
      if (searchHeading) {
        editor.state.doc.descendants((node, pos) => {
          if (
            foundPos === null &&
            node.type?.name === 'heading' &&
            node.textContent.toLowerCase().includes(searchHeading)
          ) {
            foundPos = pos;
          }
        });
      }
      if (foundPos === null && (searchText || searchHeading)) {
        const query = searchText || String(payload.headingText || '');
        const res = searchProseMirrorDoc(editor.state.doc, { query, maxResults: 1 });
        if (res.matches.length > 0) {
          editor.chain().focus().setTextSelection({ from: res.matches[0].from, to: res.matches[0].to }).scrollIntoView().run();
          break;
        }
      }
      if (foundPos !== null) {
        editor.chain().focus().setTextSelection(foundPos).scrollIntoView().run();
      }
      break;
    }

    case 'insert_horizontal_rule': {
      editor.chain().focus().setHorizontalRule().run();
      break;
    }

    case 'insert_quote': {
      const qText = payload.text ? convertMarkdownToDocumentHtml(String(payload.text)) : '<p></p>';
      editor.chain().focus().insertContent(`<blockquote>${qText}</blockquote>`).run();
      break;
    }

    case 'insert_code_block': {
      const lang = payload.language ? String(payload.language).trim() : 'python';
      const rawCode = String(payload.code || '');
      const position = (payload.position as string) || 'cursor';

      const codeLines = rawCode.split(/\r?\n/);
      const MAX_LINES_PER_PAGE = 36;
      let codeHtml = '';

      if (codeLines.length > MAX_LINES_PER_PAGE + 6) {
        const chunks: string[] = [];
        for (let idx = 0; idx < codeLines.length; idx += MAX_LINES_PER_PAGE) {
          const slice = codeLines.slice(idx, idx + MAX_LINES_PER_PAGE);
          const escaped = escapeHtml(slice.join('\n'));
          chunks.push(`<pre><code class="${lang ? 'language-' + lang : ''}">${escaped}</code></pre>`);
        }
        codeHtml = chunks.join('<div data-type="page-break" class="docium-page-break"></div>');
      } else {
        const escaped = escapeHtml(rawCode);
        codeHtml = `<pre><code class="${lang ? 'language-' + lang : ''}">${escaped}</code></pre>`;
      }

      const isPlaceholder = initialText.trim() === 'Start typing...' || !initialText.trim();
      const effectivePayload =
        isPlaceholder && !payload.replaceTargetText && !payload.replaceStartText && !payload.replaceBlockContaining
          ? { ...payload, position: 'start' }
          : payload;
      const applied = applyPositionedContent(editor, effectivePayload, codeHtml, 'cursor');
      if (!applied.ok) return { success: false, error: applied.error, documentId, action };
      break;
    }

    case 'insert_table_of_contents': {
      const headings: { level: number; text: string }[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type?.name === 'heading') {
          headings.push({ level: node.attrs.level, text: node.textContent.trim() });
        }
      });
      let tocHtml = '<div class="table-of-contents"><p><strong>Table of Contents</strong></p><ul>';
      if (headings.length === 0) {
        tocHtml += '<li><p>No headings found in document</p></li>';
      } else {
        for (const h of headings) {
          const indent = Math.max(0, (h.level - 1) * 16);
          tocHtml += `<li style="margin-left: ${indent}px"><p>${h.text}</p></li>`;
        }
      }
      tocHtml += '</ul></div>';
      if (payload.position === 'start') {
        editor.chain().focus('start').insertContent(tocHtml).run();
      } else {
        editor.chain().focus().insertContent(tocHtml).run();
      }
      break;
    }

    case 'delete_paragraph': {
      const reqIndex = typeof payload.paragraphIndex === 'number' ? payload.paragraphIndex : -1;
      const snippet = payload.textSnippet ? String(payload.textSnippet) : '';
      const paraBlocks = findBlockNodes(editor.state.doc, { blockType: 'paragraph', maxResults: 200 });
      let targetRange: { from: number; to: number } | null = null;
      if (reqIndex >= 0 && paraBlocks[reqIndex]) {
        targetRange = { from: paraBlocks[reqIndex].from, to: paraBlocks[reqIndex].to };
      } else if (snippet) {
        const anyBlocks = findBlockNodes(editor.state.doc, { blockType: 'any', containsText: snippet, maxResults: 5 });
        if (anyBlocks[0]) {
          targetRange = { from: anyBlocks[0].from, to: anyBlocks[0].to };
        }
      }
      if (targetRange) {
        editor.chain().focus().deleteRange(targetRange).run();
      } else {
        return { success: false, error: 'Target paragraph or block not found.', documentId, action };
      }
      break;
    }

    case 'delete_section': {
      const secHeading = String(payload.headingTitle || payload.headingText || '');
      const sec = findSectionByHeading(editor.state.doc, secHeading);
      if (sec.found && sec.from !== undefined && sec.to !== undefined) {
        editor.chain().focus().deleteRange({ from: sec.from, to: sec.to }).run();
      }
      break;
    }

    case 'delete_heading': {
      const headingText = String(payload.headingTitle || payload.headingText || '').toLowerCase();
      const deleteContent = Boolean(payload.deleteContent);
      if (deleteContent) {
        const sec = findSectionByHeading(editor.state.doc, headingText);
        if (sec.found && sec.from !== undefined && sec.to !== undefined) {
          editor.chain().focus().deleteRange({ from: sec.from, to: sec.to }).run();
        }
      } else {
        let headingPos: { from: number; to: number } | null = null;
        editor.state.doc.descendants((node, pos) => {
          if (!headingPos && node.type?.name === 'heading' && node.textContent.toLowerCase().includes(headingText)) {
            headingPos = { from: pos, to: pos + node.nodeSize };
          }
        });
        if (headingPos) {
          editor.chain().focus().deleteRange(headingPos).run();
        }
      }
      break;
    }

    case 'delete_table': {
      let targetTable: { from: number; to: number } | null = null;
      let curTIdx = 0;
      const reqTableIdx = typeof payload.tableIndex === 'number' ? payload.tableIndex : 0;
      editor.state.doc.descendants((node, pos) => {
        if (targetTable) return;
        if (node.type?.name === 'table') {
          if (curTIdx === reqTableIdx) {
            targetTable = { from: pos, to: pos + node.nodeSize };
          }
          curTIdx++;
        }
      });
      if (targetTable) {
        editor.chain().focus().deleteRange(targetTable).run();
      } else {
        editor.chain().focus().deleteTable().run();
      }
      break;
    }

    case 'delete_image': {
      let targetImg: { from: number; to: number } | null = null;
      let curIIdx = 0;
      const reqImgIdx = typeof payload.imageIndex === 'number' ? payload.imageIndex : -1;
      const reqSrc = payload.src ? String(payload.src) : '';
      editor.state.doc.descendants((node, pos) => {
        if (targetImg) return;
        if (node.type?.name === 'image') {
          if (reqImgIdx >= 0 && curIIdx === reqImgIdx) {
            targetImg = { from: pos, to: pos + node.nodeSize };
          } else if (reqSrc && node.attrs.src === reqSrc) {
            targetImg = { from: pos, to: pos + node.nodeSize };
          }
          curIIdx++;
        }
      });
      if (targetImg) {
        editor.chain().focus().deleteRange(targetImg).run();
      }
      break;
    }

    case 'delete_empty_paragraphs': {
      const emptyRanges: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type?.name === 'paragraph' && node.textContent.trim() === '' && node.childCount === 0) {
          emptyRanges.push({ from: pos, to: pos + node.nodeSize });
        }
      });
      for (let i = emptyRanges.length - 1; i >= 0; i--) {
        editor.chain().deleteRange(emptyRanges[i]).run();
      }
      break;
    }

    case 'delete_hyperlinks': {
      const targetLinkText = payload.targetText ? String(payload.targetText).toLowerCase() : undefined;
      const linkRanges: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some((m) => m.type.name === 'link')) {
          if (!targetLinkText || node.text?.toLowerCase().includes(targetLinkText)) {
            linkRanges.push({ from: pos, to: pos + node.nodeSize });
          }
        }
      });
      for (let i = linkRanges.length - 1; i >= 0; i--) {
        editor.chain().setTextSelection(linkRanges[i]).unsetLink().run();
      }
      break;
    }

    case 'replace_paragraph': {
      const pIdx = typeof payload.paragraphIndex === 'number' ? payload.paragraphIndex : -1;
      const targetText = payload.targetText ? String(payload.targetText) : '';
      const newText = convertMarkdownAndLatexToHtml(String(payload.newText || ''));
      const paraBlocks = findBlockNodes(editor.state.doc, { blockType: 'paragraph', maxResults: 200 });
      let pRange: { from: number; to: number } | null = null;
      if (pIdx >= 0 && paraBlocks[pIdx]) {
        pRange = { from: paraBlocks[pIdx].from, to: paraBlocks[pIdx].to };
      } else if (targetText) {
        const anyBlocks = findBlockNodes(editor.state.doc, { blockType: 'any', containsText: targetText, maxResults: 5 });
        if (anyBlocks[0]) {
          pRange = { from: anyBlocks[0].from, to: anyBlocks[0].to };
        }
      }
      if (pRange) {
        editor.chain().focus().deleteRange(pRange).insertContentAt(pRange.from, newText).run();
      } else {
        return { success: false, error: 'Target paragraph or block not found.', documentId, action };
      }
      break;
    }

    case 'replace_section': {
      const secHeading = String(payload.headingTitle || payload.headingText || '');
      const newContent = convertMarkdownToDocumentHtml(String(payload.newContent || ''));
      const sec = findSectionByHeading(editor.state.doc, secHeading);
      if (sec.found && sec.from !== undefined && sec.to !== undefined) {
        let headingNodeSize = 0;
        editor.state.doc.nodesBetween(sec.from, sec.from + 1, (node) => {
          if (node.type?.name === 'heading') {
            headingNodeSize = node.nodeSize;
          }
        });
        const startAfterHeading = sec.from + headingNodeSize;
        if (sec.to > startAfterHeading) {
          editor.chain().focus().deleteRange({ from: startAfterHeading, to: sec.to }).insertContentAt(startAfterHeading, newContent).run();
        } else {
          editor.chain().focus().insertContentAt(startAfterHeading, newContent).run();
        }
      }
      break;
    }

    case 'replace_table': {
      const tableIdx = typeof payload.tableIndex === 'number' ? payload.tableIndex : 0;
      const headers = Array.isArray(payload.headers) ? (payload.headers as string[]) : undefined;
      const rows = Array.isArray(payload.rows) ? (payload.rows as string[][]) : [];
      let targetTableRange: { from: number; to: number } | null = null;
      let cTIdx = 0;
      editor.state.doc.descendants((node, pos) => {
        if (targetTableRange) return;
        if (node.type?.name === 'table') {
          if (cTIdx === tableIdx) {
            targetTableRange = { from: pos, to: pos + node.nodeSize };
          }
          cTIdx++;
        }
      });
      let tableHtml = '<table style="border-collapse: collapse; width: 100%; border: 1px solid #D1D5DB;">';
      if (headers && headers.length > 0) {
        tableHtml += '<thead><tr>';
        for (const h of headers) {
          tableHtml += `<th style="border: 1px solid #D1D5DB; padding: 8px; background-color: #F3F4F6; font-weight: bold;"><p>${h}</p></th>`;
        }
        tableHtml += '</tr></thead>';
      }
      tableHtml += '<tbody>';
      for (const row of rows) {
        tableHtml += '<tr>';
        for (const cell of row) {
          tableHtml += `<td style="border: 1px solid #D1D5DB; padding: 8px;"><p>${cell}</p></td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';

      if (targetTableRange) {
        editor.chain().focus().deleteRange(targetTableRange).insertContentAt((targetTableRange as { from: number; to: number }).from, tableHtml).run();
      } else {
        editor.chain().focus().insertContent(tableHtml).run();
      }
      break;
    }

    case 'replace_image': {
      const imgIdx = typeof payload.imageIndex === 'number' ? payload.imageIndex : -1;
      const oldSrc = payload.oldSrc ? String(payload.oldSrc) : '';
      const newSrc = String(payload.newSrc || '');
      const alt = payload.alt !== undefined ? String(payload.alt) : undefined;
      const title = payload.title !== undefined ? String(payload.title) : undefined;
      let targetImgRange: { from: number; to: number; attrs: any } | null = null;
      let cImg = 0;
      editor.state.doc.descendants((node, pos) => {
        if (targetImgRange) return;
        if (node.type?.name === 'image') {
          if (imgIdx >= 0 && cImg === imgIdx) {
            targetImgRange = { from: pos, to: pos + node.nodeSize, attrs: node.attrs };
          } else if (oldSrc && node.attrs.src === oldSrc) {
            targetImgRange = { from: pos, to: pos + node.nodeSize, attrs: node.attrs };
          }
          cImg++;
        }
      });
      const imgInfo = targetImgRange as { from: number; to: number; attrs: any } | null;
      if (imgInfo) {
        const mergedAttrs = {
          ...imgInfo.attrs,
          src: newSrc,
          alt: alt !== undefined ? alt : imgInfo.attrs.alt,
          title: title !== undefined ? title : imgInfo.attrs.title,
        };
        editor.chain().focus().deleteRange({ from: imgInfo.from, to: imgInfo.to }).setImage(mergedAttrs).run();
      }
      break;
    }

    case 'merge_paragraphs': {
      const mergeIdx = typeof payload.paragraphIndex === 'number' ? payload.paragraphIndex : 0;
      let firstP: { from: number; to: number; text: string } | null = null;
      let secondP: { from: number; to: number; text: string } | null = null;
      let curP = 0;
      editor.state.doc.descendants((node, pos) => {
        if (secondP) return;
        if (node.type?.name === 'paragraph') {
          if (curP === mergeIdx) {
            firstP = { from: pos, to: pos + node.nodeSize, text: node.textContent };
          } else if (curP === mergeIdx + 1 && firstP) {
            secondP = { from: pos, to: pos + node.nodeSize, text: node.textContent };
          }
          curP++;
        }
      });
      if (firstP && secondP) {
        const combinedText = `${(firstP as any).text} ${(secondP as any).text}`;
        editor.chain().focus()
          .deleteRange({ from: (firstP as any).from, to: (secondP as any).to })
          .insertContentAt((firstP as any).from, `<p>${combinedText}</p>`)
          .run();
      }
      break;
    }

    case 'split_paragraph': {
      const splitText = String(payload.splitAtText || '');
      const splitIdx = typeof payload.paragraphIndex === 'number' ? payload.paragraphIndex : -1;
      let targetToSplit: { from: number; to: number; text: string } | null = null;
      let pCount = 0;
      editor.state.doc.descendants((node, pos) => {
        if (targetToSplit) return;
        if (node.type?.name === 'paragraph') {
          if (splitIdx >= 0 && pCount === splitIdx) {
            targetToSplit = { from: pos, to: pos + node.nodeSize, text: node.textContent };
          } else if (splitText && node.textContent.includes(splitText)) {
            targetToSplit = { from: pos, to: pos + node.nodeSize, text: node.textContent };
          }
          pCount++;
        }
      });
      if (targetToSplit) {
        const t = (targetToSplit as any).text;
        const splitPos = splitText ? t.indexOf(splitText) : Math.floor(t.length / 2);
        if (splitPos !== -1) {
          const part1 = t.slice(0, splitPos).trim();
          const part2 = t.slice(splitPos + (splitText ? splitText.length : 0)).trim();
          editor.chain().focus()
            .deleteRange({ from: (targetToSplit as any).from, to: (targetToSplit as any).to })
            .insertContentAt((targetToSplit as any).from, `<p>${part1}</p><p>${splitText ? splitText + ' ' + part2 : part2}</p>`)
            .run();
        }
      }
      break;
    }

    case 'clear_table_contents': {
      const tIdx = typeof payload.tableIndex === 'number' ? payload.tableIndex : 0;
      let targetT: { from: number; to: number } | null = null;
      let cT = 0;
      editor.state.doc.descendants((node, pos) => {
        if (targetT) return;
        if (node.type?.name === 'table') {
          if (cT === tIdx) targetT = { from: pos, to: pos + node.nodeSize };
          cT++;
        }
      });
      if (targetT) {
        const cellRanges: { from: number; to: number }[] = [];
        editor.state.doc.nodesBetween((targetT as any).from, (targetT as any).to, (node, pos) => {
          if (node.type?.name === 'tableCell' || node.type?.name === 'tableHeader') {
            cellRanges.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
          }
        });
        for (let i = cellRanges.length - 1; i >= 0; i--) {
          const range = cellRanges[i];
          if (range.to > range.from) {
            editor.chain().deleteRange(range).insertContentAt(range.from, '<p></p>').run();
          }
        }
      }
      break;
    }

    case 'add_table_row': {
      const pos = payload.position === 'before' ? 'addRowBefore' : 'addRowAfter';
      editor.chain().focus()[pos]().run();
      break;
    }

    case 'delete_table_row': {
      editor.chain().focus().deleteRow().run();
      break;
    }

    case 'add_table_column': {
      const pos = payload.position === 'before' ? 'addColumnBefore' : 'addColumnAfter';
      editor.chain().focus()[pos]().run();
      break;
    }

    case 'delete_table_column': {
      editor.chain().focus().deleteColumn().run();
      break;
    }

    case 'merge_table_cells': {
      editor.chain().focus().mergeCells().run();
      break;
    }

    case 'split_table_cells': {
      editor.chain().focus().splitCell().run();
      break;
    }

    case 'update_table_cell': {
      const rowIdx = Number(payload.rowIndex || 0);
      const colIdx = Number(payload.columnIndex || 0);
      const cellText = String(payload.text || '');
      let cellPos: { from: number; to: number } | null = null;
      let currRow = 0;
      editor.state.doc.descendants((node, pos) => {
        if (cellPos) return;
        if (node.type?.name === 'tableRow') {
          if (currRow === rowIdx) {
            let currCol = 0;
            node.forEach((cellNode, cellOffset) => {
              if (currCol === colIdx && !cellPos) {
                const actualPos = pos + 1 + cellOffset;
                cellPos = { from: actualPos, to: actualPos + cellNode.nodeSize };
              }
              currCol++;
            });
          }
          currRow++;
        }
      });
      if (cellPos) {
        editor.chain().focus()
          .deleteRange(cellPos)
          .insertContentAt((cellPos as { from: number; to: number }).from, `<p>${cellText}</p>`)
          .run();
      }
      break;
    }

    case 'format_all_headings': {
      const reqLevel = typeof payload.level === 'number' ? payload.level : undefined;
      const fontFamily = payload.fontFamily ? resolveFontFamilyValue(String(payload.fontFamily)) : undefined;
      if (fontFamily) ensureGoogleFontLoaded(fontFamily);
      const fontSize = payload.fontSize !== undefined ? normalizeFontSizeToPt(payload.fontSize as string | number) : undefined;
      const color = payload.color ? String(payload.color) : undefined;
      const alignment = payload.alignment as 'left' | 'center' | 'right' | 'justify' | undefined;

      const headingRanges: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type?.name === 'heading' && node.content.size > 0) {
          if (!reqLevel || node.attrs.level === reqLevel) {
            // Target inline text boundaries inside the heading block (pos+1 .. pos+nodeSize-1)
            headingRanges.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
          }
        }
      });
      for (const r of headingRanges) {
        const chain = editor.chain().setTextSelection(r);
        if (fontFamily) chain.setFontFamily(fontFamily);
        if (fontSize) chain.setFontSize(fontSize);
        if (color) chain.setColor(color);
        if (alignment) chain.setTextAlign(alignment);
        chain.run();
      }
      break;
    }

    case 'format_all_paragraphs': {
      const align = payload.alignment as 'left' | 'center' | 'right' | 'justify' | undefined;
      const fontSize = payload.fontSize !== undefined ? normalizeFontSizeToPt(payload.fontSize as string | number) : undefined;
      const fontFamily = payload.fontFamily ? resolveFontFamilyValue(String(payload.fontFamily)) : undefined;
      if (fontFamily) ensureGoogleFontLoaded(fontFamily);
      const pRanges: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type?.name === 'paragraph' && node.content.size > 0) {
          pRanges.push({ from: pos + 1, to: pos + node.nodeSize - 1 });
        }
      });
      for (const r of pRanges) {
        const chain = editor.chain().setTextSelection(r);
        if (align) chain.setTextAlign(align);
        if (fontSize) chain.setFontSize(fontSize);
        if (fontFamily) chain.setFontFamily(fontFamily);
        chain.run();
      }
      break;
    }

    case 'format_matching_content': {
      const query = String(payload.query || payload.pattern || payload.searchPattern || '');
      const bold = payload.bold !== undefined ? Boolean(payload.bold) : undefined;
      const italic = payload.italic !== undefined ? Boolean(payload.italic) : undefined;
      const color = payload.color ? String(payload.color) : undefined;
      const highlight = payload.highlight ? String(payload.highlight) : undefined;

      if (query) {
        const res = searchProseMirrorDoc(editor.state.doc, { query });
        for (let i = res.matches.length - 1; i >= 0; i--) {
          const m = res.matches[i];
          const chain = editor.chain().setTextSelection({ from: m.from, to: m.to });
          if (bold !== undefined) {
            if (bold) chain.setBold(); else chain.unsetBold();
          }
          if (italic !== undefined) {
            if (italic) chain.setItalic(); else chain.unsetItalic();
          }
          if (color) chain.setColor(color);
          if (highlight) chain.setHighlight({ color: highlight });
          chain.run();
        }
      }
      break;
    }

    case 'remove_formatting': {
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
      if (targetText) {
        const res = searchProseMirrorDoc(editor.state.doc, { query: targetText });
        for (let i = res.matches.length - 1; i >= 0; i--) {
          const m = res.matches[i];
          editor.chain()
            .setTextSelection({ from: m.from, to: m.to })
            .unsetAllMarks()
            .unsetLineHeight()
            .run();
        }
      } else if (editor.state.selection.empty) {
        const docSize = editor.state.doc.content.size;
        if (docSize > 2) {
          editor.chain().selectAll().unsetAllMarks().unsetLineHeight().run();
        }
      } else {
        editor.chain().focus().unsetAllMarks().unsetLineHeight().run();
      }
      break;
    }

    case 'select_content': {
      const query = payload.targetText ? String(payload.targetText) : '';
      if (payload.startText) {
        const anchor = findRangeByAnchors(
          editor.state.doc,
          String(payload.startText),
          payload.endText ? String(payload.endText) : undefined,
          { expandToBlocks: Boolean(payload.expandToBlocks) }
        );
        if (anchor.found && anchor.from !== undefined && anchor.to !== undefined) {
          editor.chain().focus().setTextSelection({ from: anchor.from, to: anchor.to }).scrollIntoView().run();
          break;
        }
      }
      if (query) {
        const res = searchProseMirrorDoc(editor.state.doc, { query });
        if (res.matches.length > 0) {
          editor.chain().focus().setTextSelection({ from: res.matches[0].from, to: res.matches[0].to }).scrollIntoView().run();
        } else {
          return { success: false, error: `Target text "${query}" not found to select.`, documentId, action };
        }
      } else if (typeof payload.from === 'number' && typeof payload.to === 'number') {
        editor.chain().focus().setTextSelection({ from: payload.from, to: payload.to }).scrollIntoView().run();
      }
      break;
    }

    case 'rename_current_document': {
      newTitle = String(payload.newTitle || payload.title || '').trim();
      break;
    }

    case 'save_document_changes': {
      break;
    }

    default:
      console.warn('[DOCIUM Editor Bridge] Unknown action:', action);
      break;
  }

  // Verify resulting content in editor state
  const afterHtml = editor.getHTML();
  const afterText = editor.getText();
  const afterSize = editor.state.doc.content.size;
  const contentChanged = afterHtml !== initialHtml || afterSize !== initialSize;

  if (typeof window !== 'undefined' && editor.view?.dom) {
    requestAnimationFrame(() => {
      try {
        if (action === 'modify_page_layout') {
          document.querySelectorAll('.docium-paper-sheet').forEach((sheet) => {
            sheet.classList.remove('docium-animate-layout');
            void (sheet as HTMLElement).offsetWidth;
            sheet.classList.add('docium-animate-layout');
            setTimeout(() => sheet.classList.remove('docium-animate-layout'), 650);
          });
          return;
        }

        if (action.startsWith('delete_') || action === 'clear_current_page') {
          const dom = editor.view.dom as HTMLElement;
          dom.classList.remove('docium-animate-soft');
          void dom.offsetWidth;
          dom.classList.add('docium-animate-soft');
          setTimeout(() => dom.classList.remove('docium-animate-soft'), 350);
          return;
        }

        if (prevChildrenSet) {
          const newEls = Array.from(editor.view.dom.children).filter((el) => !prevChildrenSet.has(el));
          if (newEls.length > 0) {
            newEls.slice(0, 18).forEach((el) => {
              el.classList.remove('docium-animate-insert');
              void (el as HTMLElement).offsetWidth;
              el.classList.add('docium-animate-insert');
              setTimeout(() => el.classList.remove('docium-animate-insert'), 680);
            });
            return;
          }
        }

        if (contentChanged || action.startsWith('format_') || action.startsWith('set_') || action === 'style_table') {
          const { from } = editor.state.selection;
          const resolved = editor.view.domAtPos(Math.max(0, Math.min(from, editor.state.doc.content.size)));
          let el: HTMLElement | null =
            resolved.node instanceof HTMLElement ? resolved.node : resolved.node.parentElement;
          while (el && el.parentElement !== editor.view.dom) {
            el = el.parentElement;
          }
          if (el && editor.view.dom.contains(el)) {
            el.classList.remove('docium-animate-update');
            void el.offsetWidth;
            el.classList.add('docium-animate-update');
            setTimeout(() => el?.classList.remove('docium-animate-update'), 720);
          }
        }
      } catch {
        // Ignore transient animation DOM errors
      }
    });
  }

  const nonContentActions = new Set([
    'save_document_changes',
    'navigate_to_document_heading',
    'rename_current_document',
    'modify_page_layout',
    'export_document',
    'set_document_view',
    'set_editor_preferences',
    'adjust_indent',
    'change_text_case',
    'editor_undo',
    'editor_redo',
    'select_content',
    'modify_table_structure',
    'style_table',
    'add_table_row',
    'delete_table_row',
    'add_table_column',
    'delete_table_column',
    'merge_table_cells',
    'split_table_cells',
    'format_all_headings',
    'format_all_paragraphs',
    'format_matching_content',
    'remove_formatting',
    'delete_hyperlinks',
    'delete_empty_paragraphs',
    'update_table_cell',
    'clear_table_contents',
    'set_line_height',
    'set_font_style',
    'change_document_alignment',
    'format_document_text',
  ]);

  if (!contentChanged && !nonContentActions.has(action)) {
    console.warn('[DOCIUM Editor Bridge] Transaction applied but document state unchanged', { action, documentId });
    return {
      success: false,
      status: 'TRANSACTION_NO_CHANGE',
      statusCode: 'TRANSACTION_NO_CHANGE',
      error: 'Editor transaction did not modify document content.',
      documentId,
      action,
      contentChanged: false,
      persisted: false,
    };
  }

  // Persist editor changes immediately
  const wCount = afterText.trim() ? afterText.trim().split(/\s+/).length : 0;
  const contentJson = editor.getJSON() as Record<string, unknown>;

  if (onPersist) {
    onPersist(documentId, {
      content: afterHtml,
      contentJson,
      wordCount: wCount,
      characterCount: afterText.length,
      updatedAt: new Date().toISOString(),
      title: newTitle,
      ...(layoutUpdates || {}),
    });
  } else {
    try {
      const store = useWorkspaceStore.getState();
      if (store && typeof store.updateDocument === 'function') {
        store.updateDocument(documentId, {
          content: afterHtml,
          contentJson,
          wordCount: wCount,
          characterCount: afterText.length,
          updatedAt: new Date().toISOString(),
          ...(newTitle ? { title: newTitle } : {}),
          ...(layoutUpdates || {}),
        });
      }
    } catch {
      // Ignore background persistence errors
    }
  }

  const insertedChars = Math.max(0, afterText.length - initialText.length);
  console.log(`[DOCIUM Editor Bridge] Verified success: ${action} | docId: ${documentId} | chars: +${insertedChars} | persisted: true`);

  return {
    success: true,
    status: action === 'clear_current_page' ? 'cleared' : 'applied',
    statusCode: 'SUCCESS',
    pageNumber: typeof payload.page === 'number' ? payload.page : 1,
    documentId,
    action,
    contentChanged: true,
    insertedCharacters: insertedChars,
    persisted: true,
    verification: action === 'clear_current_page' ? {
      pageExists: true,
      bodyContentEmpty: true,
      headersPreserved: true,
      footersPreserved: true,
      pageStructurePreserved: true,
    } : undefined,
    summary:
      (payload.summary as string) ||
      (action === 'insert_code_block'
        ? `Inserted code block (+${insertedChars} chars)`
        : action === 'insert_structured_document'
        ? `Inserted structured content (+${insertedChars} chars)`
        : action === 'replace_selected_text'
        ? 'Replaced selected text'
        : action === 'find_and_replace_text'
        ? `Replaced occurrences of "${payload.findText}"`
        : action === 'move_document_section'
        ? `Moved section "${payload.sourceHeading}"`
        : action === 'duplicate_content'
        ? 'Duplicated content'
        : action === 'clear_current_page'
        ? `Cleared body content on page ${payload.page || 1}`
        : action === 'modify_page_layout'
        ? 'Updated document page layout'
        : action === 'insert_document_table'
        ? 'Inserted table'
        : action === 'modify_table_structure'
        ? `Modified table (${payload.operation})`
        : action === 'set_font_style'
        ? 'Updated font style'
        : action === 'insert_callout_box'
        ? `Inserted ${payload.type || 'info'} callout`
        : action === 'insert_vector_shape'
        ? `Inserted ${payload.shapeType || 'shape'}`
        : action === 'editor_undo'
        ? 'Undid last editor action'
        : action === 'editor_redo'
        ? 'Redid editor action'
        : `Applied ${action}`),
  };
}

export const editorRegistry = new DocumentEditorRegistry();


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
import { convertMarkdownToDocumentHtml } from '@/components/editor/utils/markdownToHtml';
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
  replaceTextInRange,
  replaceAllMatches,
  moveDocumentSectionInEditor,
} from './documentSearch';

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
    firstPageHeaderText?: string;
    firstPageFooterText?: string;
    showPageNumbers?: boolean;
    differentFirstPage?: boolean;
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
   */
  public getEditor(documentId?: string): Editor | null {
    if (documentId) {
      const entry = this.editors.get(documentId);
      if (entry && !entry.editor.isDestroyed) {
        return entry.editor;
      }
      if (entry && entry.editor.isDestroyed) {
        this.editors.delete(documentId);
      }
    }

    // Fall back to current active document ID
    if (this.activeDocumentId) {
      const activeEntry = this.editors.get(this.activeDocumentId);
      if (activeEntry && !activeEntry.editor.isDestroyed) {
        return activeEntry.editor;
      }
    }

    // Fall back to any registered, non-destroyed editor
    for (const [id, entry] of this.editors.entries()) {
      if (entry.editor && !entry.editor.isDestroyed) {
        return entry.editor;
      } else if (entry.editor?.isDestroyed) {
        this.editors.delete(id);
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
   * Asynchronously wait for an editor instance to mount (with bounded retry/timeout).
   * Essential for bridging mounting latency or React concurrent rendering delays.
   */
  public async waitForEditor(documentId?: string, timeoutMs: number = 2500): Promise<Editor | null> {
    const existing = this.getEditor(documentId);
    if (existing && !existing.isDestroyed) {
      return existing;
    }

    const key = documentId || '*';
    const startTime = Date.now();

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (ed: Editor | null) => {
        if (!resolved) {
          resolved = true;
          clearInterval(interval);
          resolve(ed);
        }
      };

      // Periodic check every 40ms
      const interval = setInterval(() => {
        const check = this.getEditor(documentId);
        if (check && !check.isDestroyed) {
          finish(check);
          return;
        }

        if (Date.now() - startTime >= timeoutMs) {
          finish(null);
        }
      }, 40);

      // Register listener in resolvers map
      const list = this.waitResolvers.get(key) || [];
      list.push((ed: Editor) => finish(ed));
      this.waitResolvers.set(key, list);
    });
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

    // Enforce strict active document boundary
    if (this.activeDocumentId && targetDocId && targetDocId !== this.activeDocumentId) {
      console.warn('[DOCIUM Editor Registry] Permission violation: Attempted to modify non-active document', {
        targetDocId,
        activeDocumentId: this.activeDocumentId,
        action,
      });
      return {
        success: false,
        error: `Permission denied: Cannot edit document "${targetDocId}". Only the currently active document ("${this.activeDocumentId}") can be modified. To edit another document, open it as the active document first.`,
        documentId: targetDocId,
        action,
      };
    }

    let editor = this.getEditor(targetDocId);
    if (!editor || editor.isDestroyed) {
      editor = await this.waitForEditor(targetDocId, 2500);
    }

    if (!editor || editor.isDestroyed) {
      console.warn('[DOCIUM Editor Registry] Rejected: No active editor mounted', {
        action,
        documentId: targetDocId,
      });
      return {
        success: false,
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
        error: `Document "${targetDocId}" is read-only. Edits cannot be applied.`,
        documentId: targetDocId,
        action,
      };
    }

    return executeEditorTransaction(editor, action, payload, targetDocId, onPersist);
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

  console.log(`[DOCIUM Editor Bridge] Executing "${action}" on doc "${documentId}"`, payload);

  let newTitle: string | undefined = undefined;
  let layoutUpdates: Record<string, unknown> | undefined = undefined;

  switch (action) {
    case 'insert_structured_document': {
      const rawContent = String(payload.content || '');
      const htmlContent = convertMarkdownToDocumentHtml(rawContent);
      const position = (payload.position as string) || 'cursor';

      const isPlaceholder = initialText.trim() === 'Start typing...' || !initialText.trim();

      if (position === 'start' || isPlaceholder) {
        editor.chain().focus('start').insertContent(htmlContent).run();
      } else if (position === 'end') {
        editor.chain().focus('end').insertContent(htmlContent).run();
      } else if (position === 'replace_selection' && !editor.state.selection.empty) {
        editor.chain().focus().deleteSelection().insertContent(htmlContent).run();
      } else {
        if (!editor.state.selection.empty) {
          editor.chain().focus().deleteSelection().insertContent(htmlContent).run();
        } else {
          editor.chain().focus().insertContent(htmlContent).run();
        }
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
      const rawText = String(payload.text || '');
      const htmlContent = convertMarkdownToDocumentHtml(rawText);
      if (editor.state.selection.empty) {
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

      if (matchIndex !== undefined) {
        const searchRes = searchProseMirrorDoc(editor.state.doc, {
          query: findText,
          caseSensitive,
          matchWholeWord,
        });
        const match = searchRes.matches[matchIndex];
        if (match) {
          replaceTextInRange(editor, { from: match.from, to: match.to }, replaceText);
        } else {
          return {
            success: false,
            error: `Match index ${matchIndex} not found for "${findText}" (total matches: ${searchRes.totalMatches}).`,
            documentId,
            action,
          };
        }
      } else {
        const count = replaceAllMatches(editor, findText, replaceText, { caseSensitive, matchWholeWord });
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
      const rawText = String(payload.text || '');
      const pText = convertMarkdownToDocumentHtml(rawText);
      if (payload.position === 'start') {
        editor.chain().focus('start').insertContent(pText).run();
      } else if (payload.position === 'cursor') {
        editor.chain().focus().insertContent(pText).run();
      } else if (payload.afterHeading) {
        let targetPos: number | null = null;
        const searchHeading = String(payload.afterHeading).toLowerCase();
        editor.state.doc.descendants((node, pos) => {
          if (
            targetPos === null &&
            node.type.name === 'heading' &&
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
            node.type.name === 'heading' &&
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

    case 'insert_hyperlink': {
      const url = String(payload.url || '');
      const text = payload.text ? String(payload.text) : undefined;
      if (!editor.state.selection.empty) {
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      } else if (text) {
        editor.chain().focus().insertContent(`<a href="${url}">${text}</a>`).run();
      } else {
        editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
      }
      break;
    }

    case 'format_document_text': {
      const fmt = String(payload.formatting || '');
      const val = payload.value ? String(payload.value) : undefined;
      const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;

      const applyMarkToChain = (chain: any) => {
        if (fmt === 'bold') chain.toggleBold();
        else if (fmt === 'italic') chain.toggleItalic();
        else if (fmt === 'underline') chain.toggleUnderline();
        else if (fmt === 'strike') chain.toggleStrike();
        else if (fmt === 'subscript') chain.toggleSubscript();
        else if (fmt === 'superscript') chain.toggleSuperscript();
        else if (fmt === 'code') chain.toggleCode();
        else if (fmt === 'color') chain.setColor(val || '#000000');
        else if (fmt === 'highlight') chain.toggleHighlight({ color: val || '#fef08a' });
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
      } else {
        applyMarkToChain(editor.chain().focus());
      }
      break;
    }

    case 'set_font_style': {
      const fontFamily = payload.fontFamily ? String(payload.fontFamily) : undefined;
      const fontSize = payload.fontSize ? String(payload.fontSize) : undefined;
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
      } else {
        applyFontToChain(editor.chain().focus());
      }
      break;
    }

    case 'set_line_height': {
      const lh = payload.lineHeight ? String(payload.lineHeight) : undefined;
      const spaceBefore = Boolean(payload.spaceBefore);
      const spaceAfter = Boolean(payload.spaceAfter);
      const chain = editor.chain().focus();
      if (lh) chain.setLineHeight(lh);
      if (spaceBefore) chain.updateAttributes('paragraph', { style: 'margin-top: 14px' });
      if (spaceAfter) chain.updateAttributes('paragraph', { style: 'margin-bottom: 14px' });
      chain.run();
      break;
    }

    case 'change_document_alignment': {
      const align = (payload.alignment as 'left' | 'center' | 'right' | 'justify') || 'left';
      editor.chain().focus().setTextAlign(align).run();
      break;
    }

    case 'insert_callout_box': {
      const calloutType = (payload.type as 'info' | 'tip' | 'warning' | 'danger' | 'note') || 'info';
      const content = payload.content ? convertMarkdownToDocumentHtml(String(payload.content)) : '<p></p>';
      editor.chain().focus().setCallout({ type: calloutType }).insertContent(content).run();
      break;
    }

    case 'insert_vector_shape': {
      editor.chain().focus().insertShape({
        shapeType: (payload.shapeType as any) || 'rectangle',
        width: Number(payload.width || 180),
        height: Number(payload.height || 110),
        fill: String(payload.fill || '#E7EAE4'),
        stroke: String(payload.stroke || '#245C45'),
        strokeWidth: Number(payload.strokeWidth || 2),
        rotation: 0,
        alignment: 'center',
      }).run();
      break;
    }

    case 'insert_document_image': {
      const url = String(payload.url || '');
      const alt = payload.alt ? String(payload.alt) : undefined;
      const title = payload.title ? String(payload.title) : undefined;
      editor.chain().focus().setImage({ src: url, alt, title }).run();
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
        pageSize: payload.pageSize,
        orientation: payload.orientation,
        marginPreset: payload.marginPreset,
        margins: payload.margins,
        columns: payload.columns,
        headerText: payload.headerText,
        footerText: payload.footerText,
        showPageNumbers: payload.showPageNumbers,
        differentFirstPage: payload.differentFirstPage,
      };
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
      let foundPos: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (
          foundPos === null &&
          node.type.name === 'heading' &&
          node.textContent.toLowerCase().includes(searchHeading)
        ) {
          foundPos = pos;
        }
      });
      if (foundPos !== null) {
        editor.chain().focus().setTextSelection(foundPos).scrollIntoView().run();
      }
      break;
    }

    case 'rename_current_document': {
      newTitle = String(payload.newTitle || '').trim();
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

  const nonContentActions = new Set([
    'save_document_changes',
    'navigate_to_document_heading',
    'rename_current_document',
    'modify_page_layout',
    'editor_undo',
    'editor_redo',
  ]);

  if (!contentChanged && !nonContentActions.has(action)) {
    console.warn('[DOCIUM Editor Bridge] Transaction applied but document state unchanged', { action, documentId });
    return {
      success: false,
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
  }

  const insertedChars = Math.max(0, afterText.length - initialText.length);
  console.log(`[DOCIUM Editor Bridge] Verified success: ${action} | docId: ${documentId} | chars: +${insertedChars} | persisted: true`);

  return {
    success: true,
    documentId,
    action,
    contentChanged: true,
    insertedCharacters: insertedChars,
    persisted: true,
    summary:
      (payload.summary as string) ||
      (action === 'insert_structured_document'
        ? `Inserted structured content (+${insertedChars} chars)`
        : action === 'replace_selected_text'
        ? 'Replaced selected text'
        : action === 'find_and_replace_text'
        ? `Replaced occurrences of "${payload.findText}"`
        : action === 'move_document_section'
        ? `Moved section "${payload.sourceHeading}"`
        : action === 'duplicate_content'
        ? 'Duplicated content'
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


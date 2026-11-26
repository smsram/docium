/**
 * DOCIUM Document Pagination Engine
 * 
 * Provides:
 * 1. Automatic measurement and overflow calculation for document blocks.
 * 2. Splitting long code blocks cleanly across physical page boundaries at line breaks.
 * 3. Distribution of content across physical pages using native ProseMirror pageBreak nodes.
 * 4. Preservation of canonical document state without competing schemas.
 */

import type { Editor } from '@tiptap/react';

export interface PaginationOptions {
  pageContentHeightPx?: number;
  maxLinesPerCodeBlock?: number;
}

export const DEFAULT_PAGE_CONTENT_HEIGHT_PX = 931; // A4 height (1123px) - top margin (96px) - bottom margin (96px)
export const DEFAULT_MAX_LINES_PER_CODE_PAGE = 36;

/**
 * Splits source code into clean chunks bounded by maxLines at line breaks.
 * Strictly preserves leading indentation, blank lines, and formatting.
 */
export function splitCodeBlockAtLines(
  code: string,
  maxLines = DEFAULT_MAX_LINES_PER_CODE_PAGE
): string[] {
  if (!code) return [''];
  const lines = code.split(/\r?\n/);
  if (lines.length <= maxLines + 6) {
    return [code];
  }

  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    const slice = lines.slice(i, i + maxLines);
    chunks.push(slice.join('\n'));
  }
  return chunks;
}

/**
 * Estimates the rendered pixel height of a ProseMirror block node.
 */
export function estimateBlockNodeHeight(node: any): number {
  if (!node) return 0;
  const typeName = node.type?.name;

  switch (typeName) {
    case 'pageBreak':
    case 'sectionBreak':
      return 0; // Boundary marker, resets page height

    case 'heading': {
      const level = node.attrs?.level || 1;
      return level === 1 ? 52 : level === 2 ? 42 : level === 3 ? 34 : 28;
    }

    case 'codeBlock': {
      const text = node.textContent || '';
      const lineCount = Math.max(1, text.split(/\r?\n/).length);
      return lineCount * 21 + 36; // 21px line height + 36px padding/margins
    }

    case 'table': {
      let rowCount = 0;
      node.descendants?.((child: any) => {
        if (child.type?.name === 'tableRow') rowCount++;
      });
      return Math.max(1, rowCount) * 38 + 24;
    }

    case 'image':
      return 260;

    case 'bulletList':
    case 'orderedList': {
      let itemCount = 0;
      node.descendants?.((child: any) => {
        if (child.type?.name === 'listItem') itemCount++;
      });
      return Math.max(1, itemCount) * 26 + 16;
    }

    case 'paragraph': {
      const text = node.textContent || '';
      if (!text.trim()) return 24;
      const lines = Math.max(1, Math.ceil(text.length / 85));
      return lines * 22 + 12;
    }

    default:
      return 32;
  }
}

/**
 * Checks if the document needs pagination, and if so, inserts pageBreak nodes
 * and splits long code blocks at line breaks.
 * Returns true if the document was modified, false otherwise.
 */
export function paginateDocument(
  editor: Editor,
  options?: PaginationOptions
): boolean {
  if (!editor || !editor.state || !editor.state.doc) return false;

  const targetHeight = options?.pageContentHeightPx || DEFAULT_PAGE_CONTENT_HEIGHT_PX;
  const maxLines = options?.maxLinesPerCodeBlock || DEFAULT_MAX_LINES_PER_CODE_PAGE;

  const doc = editor.state.doc;
  const schema = editor.state.schema;
  const pageBreakType = schema.nodes.pageBreak;
  const codeBlockType = schema.nodes.codeBlock;

  if (!pageBreakType) return false;

  let currentPageHeight = 0;
  let hasModifications = false;
  const tr = editor.state.tr;

  // We process top-level blocks in document order
  // Offset tracker for modifications applied to `tr`
  doc.forEach((node, offset) => {
    const typeName = node.type.name;

    if (typeName === 'pageBreak' || typeName === 'sectionBreak') {
      currentPageHeight = 0;
      return;
    }

    const estimatedHeight = estimateBlockNodeHeight(node);

    // If a single codeBlock exceeds page capacity, split it
    if (typeName === 'codeBlock' && codeBlockType) {
      const text = node.textContent || '';
      const lines = text.split(/\r?\n/);

      if (lines.length > maxLines + 6) {
        const chunks = splitCodeBlockAtLines(text, maxLines);
        const language = node.attrs?.language || 'python';

        const nodesToInsert: any[] = [];
        chunks.forEach((chunk, chunkIdx) => {
          nodesToInsert.push(
            codeBlockType.create({ language }, schema.text(chunk))
          );
          if (chunkIdx < chunks.length - 1) {
            nodesToInsert.push(pageBreakType.create());
          }
        });

        // Replace the single oversized codeBlock with paginated chunks
        const mappedPos = tr.mapping.map(offset);
        tr.replaceWith(mappedPos, mappedPos + node.nodeSize, nodesToInsert);
        hasModifications = true;
        currentPageHeight = (chunks[chunks.length - 1].split(/\r?\n/).length * 21) + 36;
        return;
      }
    }

    // If adding this block overflows the current page, insert pageBreak before it
    if (currentPageHeight > 0 && currentPageHeight + estimatedHeight > targetHeight) {
      const mappedPos = tr.mapping.map(offset);
      tr.insert(mappedPos, pageBreakType.create());
      hasModifications = true;
      currentPageHeight = estimatedHeight;
    } else {
      currentPageHeight += estimatedHeight;
    }
  });

  if (hasModifications) {
    editor.view.dispatch(tr);
    return true;
  }

  return false;
}

/**
 * Counts total pages based on pageBreak nodes.
 */
export function countDocumentPages(editorOrDoc: any): number {
  if (!editorOrDoc) return 1;
  const doc = editorOrDoc.state ? editorOrDoc.state.doc : editorOrDoc;
  if (!doc || !doc.descendants) return 1;

  let breaks = 0;
  doc.descendants((node: any) => {
    if (node.type?.name === 'pageBreak' || node.type?.name === 'sectionBreak') {
      breaks++;
    }
  });
  return breaks + 1;
}


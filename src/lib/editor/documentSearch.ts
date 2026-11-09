/**
 * DOCIUM Document-Native ProseMirror Search Engine
 * 
 * Provides:
 * 1. Exact and partial text search with offset positions, match counts, and surrounding context.
 * 2. Section and heading hierarchy resolution for matches.
 * 3. Range-based targeted replacement and safe reverse-walk replace-all.
 * 4. Section boundary identification (heading + body) for section moves and reorganization.
 */

import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';

export interface DocumentSearchMatch {
  matchIndex: number;
  from: number;
  to: number;
  matchedText: string;
  snippet: string;
  sectionTitle?: string;
  headingHierarchy: string[];
}

export interface DocumentSearchResult {
  query: string;
  totalMatches: number;
  matches: DocumentSearchMatch[];
}

export interface DocumentSectionResult {
  found: boolean;
  headingText?: string;
  level?: number;
  from?: number;
  to?: number;
  headingPos?: number;
  wordCount?: number;
  textSnippet?: string;
}

/**
 * Extracts a surrounding snippet from text around an offset.
 */
function createSnippet(text: string, matchStart: number, matchLen: number, contextRadius = 50): string {
  const start = Math.max(0, matchStart - contextRadius);
  const end = Math.min(text.length, matchStart + matchLen + contextRadius);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Searches a ProseMirror document for text matches with exact positions and hierarchy.
 */
export function searchProseMirrorDoc(
  doc: ProseMirrorNode,
  options: {
    query: string;
    caseSensitive?: boolean;
    matchWholeWord?: boolean;
    maxResults?: number;
  }
): DocumentSearchResult {
  const { query, caseSensitive = false, matchWholeWord = false, maxResults = 50 } = options;
  if (!query || !query.trim()) {
    return { query, totalMatches: 0, matches: [] };
  }

  const matches: DocumentSearchMatch[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];

  const flags = caseSensitive ? 'g' : 'gi';
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regexPattern = matchWholeWord ? `\\b${escapedQuery}\\b` : escapedQuery;
  const regex = new RegExp(regexPattern, flags);

  doc.descendants((node, pos) => {
    // Track heading hierarchy
    if (node.type.name === 'heading') {
      const level = node.attrs.level || 1;
      const text = node.textContent.trim();
      // Pop deeper or equal headings
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
    }

    // Search inside text nodes
    if (node.isText && node.text) {
      const text = node.text;
      let m: RegExpExecArray | null;
      regex.lastIndex = 0;

      while ((m = regex.exec(text)) !== null) {
        if (matches.length >= maxResults) break;

        const matchOffset = m.index;
        const matchLen = m[0].length;
        const from = pos + matchOffset;
        const to = from + matchLen;

        const hierarchy = headingStack.map((h) => h.text);
        const sectionTitle = hierarchy.length > 0 ? hierarchy[hierarchy.length - 1] : undefined;
        const snippet = createSnippet(text, matchOffset, matchLen);

        matches.push({
          matchIndex: matches.length,
          from,
          to,
          matchedText: m[0],
          snippet,
          sectionTitle,
          headingHierarchy: hierarchy,
        });

        // Prevent infinite loops with zero-length matches
        if (m.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }
  });

  return {
    query,
    totalMatches: matches.length,
    matches,
  };
}

/**
 * Finds a document section by heading title and determines its start and end boundaries.
 * Boundary extends until the next heading of equal or higher level (e.g. H2 extends until next H2 or H1).
 */
export function findSectionByHeading(
  doc: ProseMirrorNode,
  headingQuery: string
): DocumentSectionResult {
  const cleanQuery = headingQuery.toLowerCase().trim();
  let foundHeading: { pos: number; level: number; text: string; nodeSize: number } | null = null;
  let sectionEndPos: number | null = null;

  // 1. Locate target heading
  doc.descendants((node, pos) => {
    if (foundHeading) return false;
    if (node.type.name === 'heading') {
      const text = node.textContent.trim();
      if (text.toLowerCase().includes(cleanQuery)) {
        foundHeading = {
          pos,
          level: node.attrs.level || 1,
          text,
          nodeSize: node.nodeSize,
        };
      }
    }
  });

  if (!foundHeading) {
    return { found: false };
  }

  const { pos: headingPos, level: targetLevel, text: headingText, nodeSize } = foundHeading;
  const sectionContentStart = headingPos + nodeSize;

  // 2. Locate boundary: find next heading of equal or higher level
  doc.descendants((node, pos) => {
    if (pos <= headingPos) return;
    if (sectionEndPos !== null) return false;

    if (node.type.name === 'heading') {
      const currentLevel = node.attrs.level || 1;
      if (currentLevel <= targetLevel) {
        sectionEndPos = pos;
        return false;
      }
    }
  });

  if (sectionEndPos === null) {
    sectionEndPos = doc.content.size;
  }

  // Extract section text and metrics
  const sectionText = doc.textBetween(headingPos, sectionEndPos, ' ');
  const words = sectionText.trim() ? sectionText.trim().split(/\s+/).length : 0;
  const snippet = sectionText.slice(0, 200) + (sectionText.length > 200 ? '...' : '');

  return {
    found: true,
    headingText,
    level: targetLevel,
    from: headingPos,
    to: sectionEndPos,
    headingPos,
    wordCount: words,
    textSnippet: snippet,
  };
}

/**
 * Replaces a specific character range [from, to] in the editor with new text or html.
 */
export function replaceTextInRange(
  editor: Editor,
  range: { from: number; to: number },
  replacementText: string
): boolean {
  if (!editor || range.from < 0 || range.to > editor.state.doc.content.size) {
    return false;
  }

  const { tr } = editor.state;
  tr.insertText(replacementText, range.from, range.to);
  editor.view.dispatch(tr);
  return true;
}

/**
 * Replaces all occurrences of a search term by walking from end to start
 * to prevent character offset shift from corrupting subsequent positions.
 */
export function replaceAllMatches(
  editor: Editor,
  findText: string,
  replaceText: string,
  options?: { caseSensitive?: boolean; matchWholeWord?: boolean }
): number {
  if (!editor || !findText) return 0;

  const searchRes = searchProseMirrorDoc(editor.state.doc, {
    query: findText,
    caseSensitive: options?.caseSensitive,
    matchWholeWord: options?.matchWholeWord,
    maxResults: 200,
  });

  if (searchRes.totalMatches === 0) return 0;

  const { tr } = editor.state;
  // Replace in reverse order so earlier positions remain valid!
  for (let i = searchRes.matches.length - 1; i >= 0; i--) {
    const match = searchRes.matches[i];
    tr.insertText(replaceText, match.from, match.to);
  }

  editor.view.dispatch(tr);
  return searchRes.totalMatches;
}

/**
 * Moves a document section (heading + body) to before or after another heading or to start/end.
 */
export function moveDocumentSectionInEditor(
  editor: Editor,
  sourceHeading: string,
  destinationHeading: string | undefined,
  position: 'before' | 'after' | 'start' | 'end'
): boolean {
  const src = findSectionByHeading(editor.state.doc, sourceHeading);
  if (!src.found || src.from === undefined || src.to === undefined) {
    return false;
  }

  let targetPos: number;

  if (position === 'start') {
    targetPos = 0;
  } else if (position === 'end') {
    targetPos = editor.state.doc.content.size;
  } else if (destinationHeading) {
    const dest = findSectionByHeading(editor.state.doc, destinationHeading);
    if (!dest.found || dest.from === undefined || dest.to === undefined) {
      return false;
    }
    targetPos = position === 'before' ? dest.from : dest.to;
  } else {
    return false;
  }

  // Prevent moving into itself
  if (targetPos >= src.from && targetPos <= src.to) {
    return false;
  }

  const { state } = editor;
  const slice = state.doc.slice(src.from, src.to);

  const tr = state.tr;
  if (targetPos < src.from) {
    // Target is earlier: delete source, then insert at targetPos
    tr.delete(src.from, src.to);
    tr.insert(targetPos, slice.content);
  } else {
    // Target is later: insert at targetPos first, then delete original source
    tr.insert(targetPos, slice.content);
    tr.delete(src.from, src.to);
  }

  editor.view.dispatch(tr);
  return true;
}


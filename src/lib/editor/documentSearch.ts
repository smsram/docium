/**
 * DOCIUM Document-Native ProseMirror Search & Rich Replace Engine
 *
 * Provides:
 * 1. Cross-node linearized text search with exact ProseMirror [from, to] mapping
 *    (matches across bold/italic/code/link inline marks, <br> breaks, code blocks, and multiple paragraphs).
 * 2. Normalized whitespace/newline fallback matching.
 * 3. Start/End anchor range lookup and typed block-node targeting (paragraph, codeBlock, table, shape, etc.).
 * 4. Rich replacement (Markdown, LaTeX, HTML, structured node JSON, or clean block deletion).
 * 5. Section boundary identification and section reorganization.
 */

import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/react';
import {
  convertMarkdownAndLatexToHtml,
  convertMarkdownToDocumentHtml,
  isHtmlContent,
  sanitizeTableHtmlWhitespace,
} from '@/components/editor/utils/markdownToHtml';

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

export interface DocumentBlockMatch {
  blockIndex: number;
  type: string;
  from: number;
  to: number;
  text: string;
  sectionTitle?: string;
}

interface LinearizedDocIndex {
  text: string;
  /** ProseMirror position for each character in `text`, or -1 for synthetic block separator `\n`. */
  posMap: number[];
  /** Node end positions (`pos + 1` for text/hardBreak char, or node boundary). */
  endPosMap: number[];
  headings: Array<{ pos: number; level: number; text: string }>;
}

const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;

function createSnippet(text: string, matchStart: number, matchLen: number, contextRadius = 50): string {
  const start = Math.max(0, matchStart - contextRadius);
  const end = Math.min(text.length, matchStart + matchLen + contextRadius);
  let snippet = text.slice(start, end).replace(/\s+/g, ' ');
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Builds a flat character buffer from a ProseMirror document while preserving
 * exact per-character ProseMirror positions across inline marks, <br> breaks,
 * code blocks, list items, table cells, and block boundaries.
 */
export function buildProseMirrorTextIndex(doc: ProseMirrorNode): LinearizedDocIndex {
  const chars: string[] = [];
  const posMap: number[] = [];
  const endPosMap: number[] = [];
  const headings: Array<{ pos: number; level: number; text: string }> = [];
  let seenTextblock = false;

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({
        pos,
        level: Number(node.attrs.level || 1),
        text: node.textContent.trim(),
      });
    }

    if (node.isTextblock) {
      if (seenTextblock) {
        chars.push('\n');
        posMap.push(-1);
        endPosMap.push(-1);
      }
      seenTextblock = true;
      return true;
    }

    if (node.type.name === 'hardBreak') {
      chars.push('\n');
      posMap.push(pos);
      endPosMap.push(pos + node.nodeSize);
      return false;
    }

    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        chars.push(node.text[i]);
        posMap.push(pos + i);
        endPosMap.push(pos + i + 1);
      }
      return false;
    }

    return true;
  });

  return {
    text: chars.join(''),
    posMap,
    endPosMap,
    headings,
  };
}

function resolveHeadingContext(
  headings: Array<{ pos: number; level: number; text: string }>,
  targetPos: number
): string[] {
  const stack: Array<{ level: number; text: string }> = [];
  for (const h of headings) {
    if (h.pos > targetPos) break;
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    stack.push({ level: h.level, text: h.text });
  }
  return stack.map((h) => h.text);
}

function mapRawSpanToPmRange(
  index: LinearizedDocIndex,
  rawStart: number,
  rawEnd: number
): { from: number; to: number } | null {
  let firstIdx = rawStart;
  while (firstIdx < rawEnd && index.posMap[firstIdx] === -1) {
    firstIdx++;
  }
  let lastIdx = rawEnd - 1;
  while (lastIdx >= firstIdx && index.posMap[lastIdx] === -1) {
    lastIdx--;
  }
  if (firstIdx >= rawEnd || lastIdx < firstIdx) {
    return null;
  }
  const from = index.posMap[firstIdx];
  const to = index.endPosMap[lastIdx];
  if (from < 0 || to <= from) {
    return null;
  }
  return { from, to };
}

function normalizeTextWithMap(raw: string): { norm: string; normToRaw: number[] } {
  const out: string[] = [];
  const normToRaw: number[] = [];
  let pendingSpaceRawIdx = -1;
  let pendingNewlineRawIdx = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\r') continue;
    if (ch === '\n') {
      pendingSpaceRawIdx = -1;
      if (out.length > 0 && out[out.length - 1] !== '\n' && pendingNewlineRawIdx === -1) {
        pendingNewlineRawIdx = i;
      }
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\u00a0') {
      if (pendingNewlineRawIdx === -1 && pendingSpaceRawIdx === -1 && out.length > 0 && out[out.length - 1] !== '\n') {
        pendingSpaceRawIdx = i;
      }
      continue;
    }

    if (pendingNewlineRawIdx !== -1) {
      out.push('\n');
      normToRaw.push(pendingNewlineRawIdx);
      pendingNewlineRawIdx = -1;
      pendingSpaceRawIdx = -1;
    } else if (pendingSpaceRawIdx !== -1) {
      out.push(' ');
      normToRaw.push(pendingSpaceRawIdx);
      pendingSpaceRawIdx = -1;
    }

    const mapped =
      ch === '\u201c' || ch === '\u201d'
        ? '"'
        : ch === '\u2018' || ch === '\u2019'
        ? "'"
        : ch === '\u2014' || ch === '\u2013'
        ? '-'
        : ch;
    out.push(mapped);
    normToRaw.push(i);
  }

  return { norm: out.join(''), normToRaw };
}

/**
 * Searches a ProseMirror document for text matches across inline marks and block boundaries,
 * with exact ProseMirror [from, to] positions and heading hierarchy.
 */
export function searchProseMirrorDoc(
  doc: ProseMirrorNode,
  options: {
    query: string;
    caseSensitive?: boolean;
    matchWholeWord?: boolean;
    maxResults?: number;
    exactOnly?: boolean;
  }
): DocumentSearchResult {
  const { query, caseSensitive = false, matchWholeWord = false, maxResults = 50, exactOnly = false } = options;
  if (!query || !query.trim()) {
    return { query, totalMatches: 0, matches: [] };
  }

  const index = buildProseMirrorTextIndex(doc);
  const matches: DocumentSearchMatch[] = [];
  const flags = caseSensitive ? 'g' : 'gi';
  const normalizedQueryRaw = query.replace(/\r\n/g, '\n');
  const escapedExact = normalizedQueryRaw.replace(REGEX_META_RE, '\\$&');
  const exactPattern = matchWholeWord ? `\\b${escapedExact}\\b` : escapedExact;
  const exactRegex = new RegExp(exactPattern, flags);

  let m: RegExpExecArray | null;
  while ((m = exactRegex.exec(index.text)) !== null) {
    if (matches.length >= maxResults) break;
    const rawStart = m.index;
    const rawEnd = rawStart + m[0].length;
    const range = mapRawSpanToPmRange(index, rawStart, rawEnd);
    if (range) {
      const hierarchy = resolveHeadingContext(index.headings, range.from);
      matches.push({
        matchIndex: matches.length,
        from: range.from,
        to: range.to,
        matchedText: m[0],
        snippet: createSnippet(index.text, rawStart, m[0].length),
        sectionTitle: hierarchy.length > 0 ? hierarchy[hierarchy.length - 1] : undefined,
        headingHierarchy: hierarchy,
      });
    }
    if (m.index === exactRegex.lastIndex) {
      exactRegex.lastIndex++;
    }
  }

  if (matches.length > 0 || exactOnly) {
    return { query, totalMatches: matches.length, matches };
  }

  // Pass 2: Normalized whitespace / newline / smart-quote matching
  const docNorm = normalizeTextWithMap(index.text);
  const queryNorm = normalizeTextWithMap(normalizedQueryRaw.trim()).norm;
  if (!queryNorm) {
    return { query, totalMatches: 0, matches: [] };
  }

  // Allow any newline or space sequence in normalized query to match flexible whitespace in document
  const flexiblePattern = queryNorm
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.replace(REGEX_META_RE, '\\$&'))
    .join('\\s+');

  if (!flexiblePattern) {
    return { query, totalMatches: 0, matches: [] };
  }

  const normRegex = new RegExp(matchWholeWord ? `\\b${flexiblePattern}\\b` : flexiblePattern, flags);
  while ((m = normRegex.exec(docNorm.norm)) !== null) {
    if (matches.length >= maxResults) break;
    const normStart = m.index;
    const normEnd = normStart + m[0].length;
    const rawStart = docNorm.normToRaw[normStart];
    const lastNormIdx = normEnd - 1;
    let rawEnd = docNorm.normToRaw[lastNormIdx] + 1;
    // Extend rawEnd past trailing collapsed chars if next mapped char starts further
    if (normEnd < docNorm.normToRaw.length) {
      const nextRaw = docNorm.normToRaw[normEnd];
      if (nextRaw > rawEnd && index.text.slice(rawEnd, nextRaw).trim() === '') {
        // Keep tight end of last matched token
      }
    }
    const range = mapRawSpanToPmRange(index, rawStart, rawEnd);
    if (range) {
      const hierarchy = resolveHeadingContext(index.headings, range.from);
      matches.push({
        matchIndex: matches.length,
        from: range.from,
        to: range.to,
        matchedText: doc.textBetween(range.from, range.to, '\n'),
        snippet: createSnippet(index.text, rawStart, Math.max(1, rawEnd - rawStart)),
        sectionTitle: hierarchy.length > 0 ? hierarchy[hierarchy.length - 1] : undefined,
        headingHierarchy: hierarchy,
      });
    }
    if (m.index === normRegex.lastIndex) {
      normRegex.lastIndex++;
    }
  }

  return {
    query,
    totalMatches: matches.length,
    matches,
  };
}

/**
 * Expands a character [from, to] range to enclose full top-level/enclosing textblocks
 * if requested or when a match spans the majority of a block.
 */
export function expandRangeToEnclosingBlocks(
  doc: ProseMirrorNode,
  range: { from: number; to: number }
): { from: number; to: number } {
  const safeFrom = Math.max(0, Math.min(range.from, doc.content.size));
  const safeTo = Math.max(safeFrom, Math.min(range.to, doc.content.size));
  const $from = doc.resolve(safeFrom);
  const $to = doc.resolve(safeTo);

  let fromPos = safeFrom;
  let toPos = safeTo;

  for (let d = $from.depth; d >= 1; d--) {
    const n = $from.node(d);
    if (n.isTextblock || n.type.name === 'codeBlock' || n.type.name === 'blockquote' || n.type.name === 'callout') {
      fromPos = $from.before(d);
      break;
    }
  }

  for (let d = $to.depth; d >= 1; d--) {
    const n = $to.node(d);
    if (n.isTextblock || n.type.name === 'codeBlock' || n.type.name === 'blockquote' || n.type.name === 'callout') {
      toPos = $to.after(d);
      break;
    }
  }

  return { from: fromPos, to: Math.max(fromPos, toPos) };
}

/**
 * Finds a range between a starting anchor phrase and an ending anchor phrase.
 */
export function findRangeByAnchors(
  doc: ProseMirrorNode,
  startText: string,
  endText?: string,
  options?: { caseSensitive?: boolean; expandToBlocks?: boolean }
): { found: boolean; from?: number; to?: number; matchedText?: string } {
  const startClean = String(startText || '').trim();
  if (!startClean) return { found: false };

  const startRes = searchProseMirrorDoc(doc, {
    query: startClean,
    caseSensitive: options?.caseSensitive,
    maxResults: 10,
  });
  if (startRes.totalMatches === 0) return { found: false };

  const firstMatch = startRes.matches[0];
  let rawFrom = firstMatch.from;
  let rawTo = firstMatch.to;

  const endClean = endText ? String(endText).trim() : '';
  if (endClean) {
    const endRes = searchProseMirrorDoc(doc, {
      query: endClean,
      caseSensitive: options?.caseSensitive,
      maxResults: 50,
    });
    const endMatch = endRes.matches.find((m) => m.to >= firstMatch.from);
    if (!endMatch) return { found: false };
    rawTo = Math.max(rawTo, endMatch.to);
  }

  const finalRange =
    options?.expandToBlocks !== false
      ? expandRangeToEnclosingBlocks(doc, { from: rawFrom, to: rawTo })
      : { from: rawFrom, to: rawTo };

  return {
    found: true,
    from: finalRange.from,
    to: finalRange.to,
    matchedText: doc.textBetween(finalRange.from, finalRange.to, '\n'),
  };
}

/**
 * Finds matching block nodes of any supported type (paragraph, codeBlock, blockquote,
 * table, callout, image, shape, textBox, equation, list, or 'any').
 */
export function findBlockNodes(
  doc: ProseMirrorNode,
  options?: {
    blockType?: string;
    containsText?: string;
    afterHeading?: string;
    maxResults?: number;
  }
): DocumentBlockMatch[] {
  const reqType = (options?.blockType || 'any').toLowerCase();
  const contains = (options?.containsText || '').trim().toLowerCase();
  const maxResults = options?.maxResults ?? 20;

  let minPos = 0;
  let maxPos = doc.content.size;
  if (options?.afterHeading) {
    const sec = findSectionByHeading(doc, options.afterHeading);
    if (sec.found && sec.from !== undefined && sec.to !== undefined) {
      minPos = sec.from;
      maxPos = sec.to;
    }
  }

  const matches: DocumentBlockMatch[] = [];
  let currentHeading: string | undefined;
  let typeCounter = 0;

  const matchesType = (nodeName: string): boolean => {
    if (reqType === 'any' || !reqType) {
      return (
        nodeName === 'paragraph' ||
        nodeName === 'codeBlock' ||
        nodeName === 'blockquote' ||
        nodeName === 'table' ||
        nodeName === 'callout' ||
        nodeName === 'image' ||
        nodeName === 'shapeNode' ||
        nodeName === 'shape' ||
        nodeName === 'textBox' ||
        nodeName === 'equationNode' ||
        nodeName === 'bulletList' ||
        nodeName === 'orderedList' ||
        nodeName === 'heading'
      );
    }
    if (reqType === 'shape') return nodeName === 'shape' || nodeName === 'shapeNode';
    if (reqType === 'textbox') return nodeName === 'textBox' || nodeName === 'textbox';
    if (reqType === 'code' || reqType === 'codeblock') return nodeName === 'codeBlock';
    if (reqType === 'list') return nodeName === 'bulletList' || nodeName === 'orderedList' || nodeName === 'taskList';
    if (reqType === 'equation') return nodeName === 'equationNode' || nodeName === 'equation';
    return nodeName.toLowerCase() === reqType;
  };

  doc.descendants((node, pos) => {
    if (matches.length >= maxResults) return false;
    if (node.type.name === 'heading') {
      currentHeading = node.textContent.trim();
    }
    if (pos < minPos || pos >= maxPos) return true;
    if (!matchesType(node.type.name)) return true;

    const attrText = [
      node.attrs?.text,
      node.attrs?.alt,
      node.attrs?.title,
      node.attrs?.caption,
      node.attrs?.latex,
      node.attrs?.language,
    ]
      .filter(Boolean)
      .map(String)
      .join(' ');
    const fullText = (node.textContent || attrText || '').trim();
    const normBlockText = fullText.replace(/\s+/g, ' ').toLowerCase();
    const normContains = contains.replace(/\s+/g, ' ').trim();

    if (!normContains || normBlockText.includes(normContains)) {
      matches.push({
        blockIndex: typeCounter,
        type: node.type.name,
        from: pos,
        to: pos + node.nodeSize,
        text: fullText,
        sectionTitle: currentHeading,
      });
    }
    typeCounter++;

    // Don't descend inside container blocks if we already matched the outer block
    if (
      node.type.name === 'table' ||
      node.type.name === 'codeBlock' ||
      node.type.name === 'blockquote' ||
      node.type.name === 'callout'
    ) {
      return false;
    }
    return true;
  });

  return matches;
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

  const { pos: headingPos, level: targetLevel, text: headingText } = foundHeading;

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

function hasBlockOrRichMarkdown(text: string): boolean {
  if (!text) return false;
  if (isHtmlContent(text)) return true;
  if (text.includes('\n')) return true;
  return /(?:^#{1,6}\s|^[-*+]\s|^\d+\.\s|^>\s|```|~~~|\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$(?!\d)[^$\n]+\$|\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|^\|.+\|$)/m.test(
    text
  );
}

function renderInlineOrBlockReplacement(raw: string): string {
  const html = sanitizeTableHtmlWhitespace(convertMarkdownAndLatexToHtml(raw));
  // If single paragraph wrapper for an inline single-line edit, unwrap outer <p>...</p>
  if (!raw.includes('\n')) {
    const singlePMatch = html.match(/^<p>([\s\S]*)<\/p>$/i);
    if (singlePMatch && !/<(p|h[1-6]|ul|ol|table|pre|blockquote|div)/i.test(singlePMatch[1])) {
      return singlePMatch[1];
    }
  }
  return html;
}

/**
 * Replaces a specific character range [from, to] in the editor.
 * Supports plain text, clean deletion (empty replacement), rich Markdown/LaTeX/HTML,
 * or structured ProseMirror JSON content.
 */
export function replaceTextInRange(
  editor: Editor,
  range: { from: number; to: number },
  replacementText: string,
  options?: { plainTextOnly?: boolean; richContent?: unknown }
): boolean {
  if (!editor || range.from < 0 || range.to > editor.state.doc.content.size || range.to < range.from) {
    return false;
  }

  // Structured ProseMirror node/fragment replacement
  if (options?.richContent && typeof options.richContent === 'object') {
    return editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContentAt(range.from, options.richContent as Record<string, unknown>)
      .run();
  }

  // Pure deletion
  if (!replacementText) {
    const { state } = editor;
    const $from = state.doc.resolve(range.from);
    const $to = state.doc.resolve(range.to);
    let deleteFrom = range.from;
    let deleteTo = range.to;

    // If deleting the entire content of a single block (e.g. paragraph or codeBlock), delete the empty block wrapper too
    if (
      $from.sameParent($to) &&
      $from.depth >= 1 &&
      range.from === $from.start($from.depth) &&
      range.to === $from.end($from.depth)
    ) {
      deleteFrom = $from.before($from.depth);
      deleteTo = $from.after($from.depth);
    }

    const { tr } = state;
    tr.delete(deleteFrom, deleteTo);
    editor.view.dispatch(tr);
    return true;
  }

  if (options?.plainTextOnly || !hasBlockOrRichMarkdown(replacementText)) {
    const { tr } = editor.state;
    tr.insertText(replacementText, range.from, range.to);
    editor.view.dispatch(tr);
    return true;
  }

  const parsedHtml = renderInlineOrBlockReplacement(replacementText);
  return editor
    .chain()
    .focus()
    .deleteRange(range)
    .insertContentAt(range.from, parsedHtml)
    .run();
}

/**
 * Replaces all occurrences of a search term by walking from end to start
 * to prevent character offset shift from corrupting subsequent positions.
 */
export function replaceAllMatches(
  editor: Editor,
  findText: string,
  replaceText: string,
  options?: { caseSensitive?: boolean; matchWholeWord?: boolean; plainTextOnly?: boolean }
): number {
  if (!editor || !findText) return 0;

  const searchRes = searchProseMirrorDoc(editor.state.doc, {
    query: findText,
    caseSensitive: options?.caseSensitive,
    matchWholeWord: options?.matchWholeWord,
    maxResults: 200,
  });

  if (searchRes.totalMatches === 0) return 0;

  // Replace in reverse order so earlier positions remain valid
  if (!replaceText || (!options?.plainTextOnly && hasBlockOrRichMarkdown(replaceText))) {
    for (let i = searchRes.matches.length - 1; i >= 0; i--) {
      const match = searchRes.matches[i];
      replaceTextInRange(editor, { from: match.from, to: match.to }, replaceText, {
        plainTextOnly: options?.plainTextOnly,
      });
    }
    return searchRes.totalMatches;
  }

  const { tr } = editor.state;
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

  if (targetPos >= src.from && targetPos <= src.to) {
    return false;
  }

  const { state } = editor;
  const slice = state.doc.slice(src.from, src.to);

  const tr = state.tr;
  if (targetPos < src.from) {
    tr.delete(src.from, src.to);
    tr.insert(targetPos, slice.content);
  } else {
    tr.insert(targetPos, slice.content);
    tr.delete(src.from, src.to);
  }

  editor.view.dispatch(tr);
  return true;
}

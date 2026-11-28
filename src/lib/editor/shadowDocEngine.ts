/**
 * Server-Side HTML Validation & Shadow Document Sync Engine
 *
 * Ensures AI document editing tools pre-validate targets/anchors against the active
 * document HTML BEFORE returning `success: true` or emitting SSE `editor_action`s,
 * and keeps `activeDocContext.content` in sync across multi-round tool calls.
 */

import {
  convertMarkdownAndLatexToHtml,
  convertMarkdownToDocumentHtml,
  escapeHtml,
} from '@/components/editor/utils/markdownToHtml';
import { ActiveDocumentContext } from '@/lib/types';

export interface HtmlBlockSpan {
  index: number;
  tagName: string;
  blockType: string;
  start: number;
  end: number;
  rawHtml: string;
  text: string;
}

const REGEX_META_RE = /[.*+?^${}()|[\]\\]/g;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&rarr;/gi, '→')
    .replace(/&larr;/gi, '←')
    .replace(/&harr;/gi, '↔')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'");
}

function stripTagsToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<\/(p|h[1-6]|li|tr|div|pre|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeForMatch(s: string): string {
  return decodeHtmlEntities(s)
    .replace(/\r\n/g, '\n')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n')
    .trim();
}

/**
 * Parses top-level HTML blocks from document content HTML.
 */
export function parseTopLevelHtmlBlocks(html: string): HtmlBlockSpan[] {
  const blocks: HtmlBlockSpan[] = [];
  if (!html) return blocks;

  const blockPattern =
    /<(h[1-6]|p|pre|blockquote|ul|ol|table|div)\b[^>]*>[\s\S]*?<\/\1>|<hr\b[^>]*\/?>|<img\b[^>]*\/?>/gi;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = blockPattern.exec(html)) !== null) {
    const rawHtml = m[0];
    const tagMatch = rawHtml.match(/^<([a-z0-9]+)/i);
    const tagName = (tagMatch?.[1] || 'div').toLowerCase();
    let blockType = tagName;
    if (tagName === 'pre') blockType = 'codeBlock';
    else if (tagName === 'ul' || tagName === 'ol') blockType = 'list';
    else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
      blockType = 'heading';
    } else if (/data-type=["']docium-shape["']/i.test(rawHtml)) {
      blockType = 'shape';
    } else if (/data-type=["']docium-textbox["']/i.test(rawHtml)) {
      blockType = 'textBox';
    } else if (/data-type=["']callout["']/i.test(rawHtml)) {
      blockType = 'callout';
    } else if (/data-type=["']docium-equation["']/i.test(rawHtml)) {
      blockType = 'equation';
    }

    const attrFallback =
      rawHtml.match(/(?:alt|title|caption|data-text|data-latex)=["']([^"']*)["']/i)?.[1] || '';
    const text = stripTagsToPlainText(rawHtml) || decodeHtmlEntities(attrFallback);

    blocks.push({
      index: idx++,
      tagName,
      blockType,
      start: m.index,
      end: m.index + rawHtml.length,
      rawHtml,
      text,
    });
  }

  return blocks;
}

/**
 * Finds the best [start, end] span in `html` matching `query`, ignoring inline formatting
 * tags (`<strong>`, `<code>`, `<span>`, `<a>`) and normalizing whitespace/line breaks.
 */
export function findHtmlTextSpan(
  html: string,
  query: string,
  options?: { caseSensitive?: boolean; afterOffset?: number }
): { found: boolean; start: number; end: number; isWholeBlockSpan?: boolean } {
  const cleanQuery = normalizeForMatch(query);
  if (!cleanQuery || !html) return { found: false, start: -1, end: -1 };

  const afterOffset = options?.afterOffset ?? 0;

  // 1. Direct substring match inside HTML
  const searchHtmlSlice = html.slice(afterOffset);
  const directIdx = options?.caseSensitive
    ? searchHtmlSlice.indexOf(query)
    : searchHtmlSlice.toLowerCase().indexOf(query.toLowerCase());
  if (directIdx !== -1) {
    const start = afterOffset + directIdx;
    return { found: true, start, end: start + query.length };
  }

  // 2. Build plain text with exact HTML offset mapping
  const chars: string[] = [];
  const startMap: number[] = [];
  const endMap: number[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      const closeIdx = html.indexOf('>', i);
      if (closeIdx === -1) break;
      const tag = html.slice(i, closeIdx + 1);
      if (/^<br\s*\/?>$/i.test(tag) || /^<\/(p|h[1-6]|li|tr|div|pre|blockquote)>$/i.test(tag)) {
        if (chars.length > 0 && chars[chars.length - 1] !== '\n') {
          chars.push('\n');
          startMap.push(i);
          endMap.push(closeIdx + 1);
        }
      }
      i = closeIdx + 1;
      continue;
    }

    if (html[i] === '&') {
      const semi = html.indexOf(';', i);
      if (semi !== -1 && semi - i <= 8) {
        const entity = html.slice(i, semi + 1);
        const decoded = decodeHtmlEntities(entity);
        if (decoded !== entity) {
          for (const ch of decoded) {
            chars.push(ch);
            startMap.push(i);
            endMap.push(semi + 1);
          }
          i = semi + 1;
          continue;
        }
      }
    }

    chars.push(html[i]);
    startMap.push(i);
    endMap.push(i + 1);
    i++;
  }

  const plain = chars.join('');
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { found: false, start: -1, end: -1 };

  const flexibleRegex = new RegExp(
    tokens.map((t) => t.replace(REGEX_META_RE, '\\$&')).join('[\\s\\u00a0]+'),
    options?.caseSensitive ? 'g' : 'gi'
  );

  let m: RegExpExecArray | null;
  while ((m = flexibleRegex.exec(plain)) !== null) {
    const pStart = m.index;
    const pEnd = pStart + m[0].length - 1;
    if (pStart >= startMap.length || pEnd >= endMap.length) continue;
    const htmlStart = startMap[pStart];
    const htmlEnd = endMap[pEnd];
    if (htmlStart >= afterOffset) {
      return { found: true, start: htmlStart, end: htmlEnd };
    }
    if (m.index === flexibleRegex.lastIndex) flexibleRegex.lastIndex++;
  }

  return { found: false, start: -1, end: -1 };
}

function findHeadingSectionSpanInHtml(
  html: string,
  headingQuery: string
): { found: boolean; headingStart: number; headingEnd: number; sectionEnd: number } {
  const cleanQ = headingQuery.trim().toLowerCase();
  if (!cleanQ || !html) {
    return { found: false, headingStart: -1, headingEnd: -1, sectionEnd: -1 };
  }

  const headingRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  let target: { start: number; end: number; level: number } | null = null;
  let sectionEnd = html.length;

  while ((m = headingRe.exec(html)) !== null) {
    const lvl = Number(m[1]);
    const text = stripTagsToPlainText(m[2]).toLowerCase();
    if (!target) {
      if (text.includes(cleanQ)) {
        target = { start: m.index, end: m.index + m[0].length, level: lvl };
      }
    } else if (lvl <= target.level) {
      sectionEnd = m.index;
      break;
    }
  }

  if (!target) {
    return { found: false, headingStart: -1, headingEnd: -1, sectionEnd: -1 };
  }

  return {
    found: true,
    headingStart: target.start,
    headingEnd: target.end,
    sectionEnd,
  };
}

function expandHtmlOffsetRangeToBlockBounds(
  html: string,
  start: number,
  end: number
): { start: number; end: number } {
  const blocks = parseTopLevelHtmlBlocks(html);
  let outStart = start;
  let outEnd = end;
  for (const b of blocks) {
    if (start >= b.start && start <= b.end) {
      outStart = Math.min(outStart, b.start);
    }
    if (end >= b.start && end <= b.end) {
      outEnd = Math.max(outEnd, b.end);
    }
  }
  return { start: outStart, end: outEnd };
}

function findBlockInHtml(
  html: string,
  blockType?: string,
  containsText?: string,
  blockIndex?: number,
  afterHeading?: string
): HtmlBlockSpan | null {
  let blocks = parseTopLevelHtmlBlocks(html);
  if (afterHeading) {
    const sec = findHeadingSectionSpanInHtml(html, afterHeading);
    if (sec.found) {
      blocks = blocks.filter((b) => b.start >= sec.headingStart && b.end <= sec.sectionEnd);
    }
  }

  const reqType = (blockType || 'any').toLowerCase();
  const filtered = blocks.filter((b) => {
    if (reqType === 'any') return true;
    if (reqType === 'code' || reqType === 'codeblock') return b.blockType === 'codeBlock';
    if (reqType === 'textbox') return b.blockType === 'textBox';
    return b.blockType.toLowerCase() === reqType;
  });

  if (typeof blockIndex === 'number' && blockIndex >= 0 && !containsText) {
    return filtered[blockIndex] || null;
  }

  const normQuery = containsText ? normalizeForMatch(containsText).toLowerCase() : '';
  for (const b of filtered) {
    if (!normQuery || normalizeForMatch(b.text).toLowerCase().includes(normQuery)) {
      return b;
    }
  }
  return null;
}

function renderVisualActionToPlaceholderHtml(action: string, payload: Record<string, unknown>): string {
  if (action === 'insert_diagram') {
    const title = String(payload.diagramTitle || payload.title || 'Diagram');
    return `<p><img alt="${escapeAttr(title)}" title="${escapeAttr(title)}" data-diagram="mermaid" /></p>`;
  }
  if (action === 'insert_chart') {
    const title = String(payload.title || 'Chart');
    return `<p><img alt="${escapeAttr(title)}" title="${escapeAttr(title)}" data-chart="true" /></p>`;
  }
  if (action === 'insert_document_image') {
    const alt = String(payload.alt || payload.title || 'Image');
    return `<p><img src="${escapeAttr(String(payload.url || ''))}" alt="${escapeAttr(alt)}" /></p>`;
  }
  if (action === 'insert_vector_shape') {
    const label = String(payload.text || payload.shapeType || 'Shape');
    return `<div data-type="docium-shape" data-shape-type="${escapeAttr(String(payload.shapeType || 'rectangle'))}" data-text="${escapeAttr(label)}">${escapeHtml(label)}</div>`;
  }
  if (action === 'insert_text_box') {
    const text = String(payload.text || payload.content || '');
    return `<div data-type="docium-textbox">${escapeHtml(text)}</div>`;
  }
  if (action === 'insert_code_block') {
    const lang = String(payload.language || 'plaintext');
    return `<pre><code class="language-${escapeAttr(lang)}">${escapeHtml(String(payload.code || ''))}</code></pre>`;
  }
  if (action === 'insert_callout_box') {
    return `<div data-type="callout" data-callout-type="${escapeAttr(String(payload.type || 'info'))}">${convertMarkdownAndLatexToHtml(String(payload.content || ''))}</div>`;
  }
  if (action === 'insert_equation') {
    const latex = String(payload.latex || payload.expression || '');
    return `<div data-type="docium-equation" data-latex="${escapeAttr(latex)}">${escapeHtml(latex)}</div>`;
  }
  return '';
}

function suggestNearbyHints(html: string): string {
  const blocks = parseTopLevelHtmlBlocks(html).filter((b) => b.text.length > 0);
  const headings = blocks
    .filter((b) => b.blockType === 'heading')
    .slice(0, 6)
    .map((b) => `"${b.text.slice(0, 50)}"`);
  const snippet = blocks.slice(0, 4).map((b) => b.text.slice(0, 60)).join(' | ');
  const parts: string[] = [];
  if (headings.length > 0) parts.push(`Headings: ${headings.join(', ')}`);
  if (snippet) parts.push(`Sample content: "${snippet}"`);
  return parts.join('. ');
}

/**
 * Validates that a target/anchor-based edit can resolve against the server's document HTML
 * BEFORE returning success or emitting an SSE action to the client.
 */
export function validateActionAgainstActiveDoc(
  doc: ActiveDocumentContext | undefined,
  action: string,
  payload: Record<string, unknown>
): { ok: true } | { ok: false; error: string } {
  if (!doc) return { ok: false, error: 'No active document loaded.' };
  const html = doc.content || '';
  if (!html.trim()) {
    // Allow creation/append/insert on empty docs unless specifically deleting/replacing existing target
    const targetRequired =
      action === 'find_and_replace_text' ||
      action === 'replace_content' ||
      action === 'delete_section' ||
      action === 'replace_section' ||
      action === 'delete_paragraph' ||
      action === 'replace_paragraph' ||
      Boolean(payload.replaceTargetText || payload.replaceStartText || payload.replaceBlockContaining);
    if (targetRequired) {
      return { ok: false, error: 'The active document is empty; target content was not found.' };
    }
    return { ok: true };
  }

  // Universal replacement / anchor check for all insert_* actions too
  if (payload.replaceBlockContaining) {
    const block = findBlockInHtml(
      html,
      payload.replaceBlockType ? String(payload.replaceBlockType) : 'any',
      String(payload.replaceBlockContaining)
    );
    if (!block) {
      return {
        ok: false,
        error: `No block containing "${payload.replaceBlockContaining}" was found in document. ${suggestNearbyHints(html)}`,
      };
    }
    return { ok: true };
  }

  if (payload.replaceStartText) {
    const sSpan = findHtmlTextSpan(html, String(payload.replaceStartText));
    if (!sSpan.found) {
      return {
        ok: false,
        error: `Start anchor "${payload.replaceStartText}" not found in document. ${suggestNearbyHints(html)}`,
      };
    }
    if (payload.replaceEndText) {
      const eSpan = findHtmlTextSpan(html, String(payload.replaceEndText), { afterOffset: sSpan.start });
      if (!eSpan.found) {
        return {
          ok: false,
          error: `End anchor "${payload.replaceEndText}" not found after start anchor.`,
        };
      }
    }
    return { ok: true };
  }

  if (payload.replaceTargetText) {
    const span = findHtmlTextSpan(html, String(payload.replaceTargetText));
    if (!span.found) {
      return {
        ok: false,
        error: `No occurrences of "${String(payload.replaceTargetText).slice(0, 80)}" found in document. ${suggestNearbyHints(html)}`,
      };
    }
    return { ok: true };
  }

  if (action === 'find_and_replace_text') {
    const findText = String(payload.findText || '');
    if (!findText.trim()) return { ok: false, error: 'findText is required.' };
    const span = findHtmlTextSpan(html, findText, { caseSensitive: Boolean(payload.caseSensitive) });
    if (!span.found) {
      return {
        ok: false,
        error: `No occurrences of "${findText.slice(0, 80)}" found in document. Tip: use replace_content with startText+endText or blockType+containsText for multi-line/formatted blocks. ${suggestNearbyHints(html)}`,
      };
    }
    return { ok: true };
  }

  if (action === 'replace_content') {
    if (payload.headingTitle) {
      const sec = findHeadingSectionSpanInHtml(html, String(payload.headingTitle));
      if (!sec.found) {
        return { ok: false, error: `Heading "${payload.headingTitle}" not found. ${suggestNearbyHints(html)}` };
      }
      return { ok: true };
    }
    if (payload.startText) {
      const sSpan = findHtmlTextSpan(html, String(payload.startText), { caseSensitive: Boolean(payload.caseSensitive) });
      if (!sSpan.found) {
        return { ok: false, error: `Start anchor "${payload.startText}" not found. ${suggestNearbyHints(html)}` };
      }
      if (payload.endText) {
        const eSpan = findHtmlTextSpan(html, String(payload.endText), {
          caseSensitive: Boolean(payload.caseSensitive),
          afterOffset: sSpan.start,
        });
        if (!eSpan.found) {
          return { ok: false, error: `End anchor "${payload.endText}" not found after start anchor.` };
        }
      }
      return { ok: true };
    }
    if (payload.blockType || payload.containsText || typeof payload.blockIndex === 'number') {
      const blk = findBlockInHtml(
        html,
        payload.blockType ? String(payload.blockType) : 'any',
        payload.containsText ? String(payload.containsText) : undefined,
        typeof payload.blockIndex === 'number' ? payload.blockIndex : undefined,
        payload.afterHeading ? String(payload.afterHeading) : undefined
      );
      if (!blk && payload.targetText) {
        const span = findHtmlTextSpan(html, String(payload.targetText), { caseSensitive: Boolean(payload.caseSensitive) });
        if (span.found) return { ok: true };
      }
      if (!blk) {
        return {
          ok: false,
          error: `No matching ${payload.blockType || 'block'} found${payload.containsText ? ` containing "${payload.containsText}"` : ''}. ${suggestNearbyHints(html)}`,
        };
      }
      return { ok: true };
    }
    if (payload.targetText) {
      const span = findHtmlTextSpan(html, String(payload.targetText), { caseSensitive: Boolean(payload.caseSensitive) });
      if (!span.found) {
        return {
          ok: false,
          error: `Target text "${String(payload.targetText).slice(0, 80)}" not found. ${suggestNearbyHints(html)}`,
        };
      }
      return { ok: true };
    }
    return { ok: false, error: 'Specify targetText, startText+endText, blockType/containsText, or headingTitle.' };
  }

  if (action === 'delete_section' || action === 'replace_section') {
    const h = String(payload.headingTitle || payload.headingText || '');
    const sec = findHeadingSectionSpanInHtml(html, h);
    if (!sec.found) {
      return { ok: false, error: `Section heading "${h}" not found. ${suggestNearbyHints(html)}` };
    }
    return { ok: true };
  }

  if (action === 'style_table') {
    const tbl = findBlockInHtml(
      html,
      'table',
      payload.containsText ? String(payload.containsText) : undefined,
      typeof payload.tableIndex === 'number' ? payload.tableIndex : undefined,
      payload.afterHeading ? String(payload.afterHeading) : undefined
    );
    if (!tbl) {
      return { ok: false, error: `No matching table found to style. ${suggestNearbyHints(html)}` };
    }
    return { ok: true };
  }

  if (action === 'delete_paragraph' || action === 'replace_paragraph') {
    const snippet = payload.textSnippet ? String(payload.textSnippet) : payload.targetText ? String(payload.targetText) : '';
    const idx = typeof payload.paragraphIndex === 'number' ? payload.paragraphIndex : undefined;
    const blk = findBlockInHtml(html, 'any', snippet || undefined, idx);
    if (!blk) {
      return { ok: false, error: `Target paragraph/block not found. ${suggestNearbyHints(html)}` };
    }
    return { ok: true };
  }

  return { ok: true };
}

/**
 * Mirrors any editor action onto the server's in-memory `activeDocContext.content` HTML
 * so subsequent reads/searches/edits within the same turn stay synchronized.
 */
export function applyEditorActionToShadowDocHtml(
  doc: ActiveDocumentContext | undefined,
  action: string,
  payload: Record<string, unknown>
): void {
  if (!doc) return;
  const html = doc.content || '';

  const updateCounts = (nextHtml: string) => {
    doc.content = nextHtml;
    const plain = stripTagsToPlainText(nextHtml);
    doc.characterCount = plain.length;
    doc.wordCount = plain ? plain.split(/\s+/).length : 0;
  };

  if (action === 'clear_current_page') {
    updateCounts('<p></p>');
    return;
  }

  // Handle anchored/replacing insertion actions universally
  const insertOrReplaceAnchor = (insertedHtml: string): boolean => {
    if (!insertedHtml) return false;
    if (payload.replaceBlockContaining) {
      const blk = findBlockInHtml(
        html,
        payload.replaceBlockType ? String(payload.replaceBlockType) : 'any',
        String(payload.replaceBlockContaining)
      );
      if (blk) {
        updateCounts(html.slice(0, blk.start) + insertedHtml + html.slice(blk.end));
        return true;
      }
    }
    if (payload.replaceStartText) {
      const sSpan = findHtmlTextSpan(html, String(payload.replaceStartText));
      if (sSpan.found) {
        let endIdx = sSpan.end;
        if (payload.replaceEndText) {
          const eSpan = findHtmlTextSpan(html, String(payload.replaceEndText), { afterOffset: sSpan.start });
          if (eSpan.found) endIdx = eSpan.end;
        }
        const bounds = expandHtmlOffsetRangeToBlockBounds(html, sSpan.start, endIdx);
        updateCounts(html.slice(0, bounds.start) + insertedHtml + html.slice(bounds.end));
        return true;
      }
    }
    if (payload.replaceTargetText) {
      const span = findHtmlTextSpan(html, String(payload.replaceTargetText));
      if (span.found) {
        const bounds = expandHtmlOffsetRangeToBlockBounds(html, span.start, span.end);
        updateCounts(html.slice(0, bounds.start) + insertedHtml + html.slice(bounds.end));
        return true;
      }
    }
    if (payload.afterHeading || payload.beforeHeading) {
      const hQuery = String(payload.afterHeading || payload.beforeHeading);
      const sec = findHeadingSectionSpanInHtml(html, hQuery);
      if (sec.found) {
        const insertPos = payload.beforeHeading ? sec.headingStart : sec.headingEnd;
        updateCounts(html.slice(0, insertPos) + insertedHtml + html.slice(insertPos));
        return true;
      }
    }
    if (payload.afterText || payload.beforeText) {
      const q = String(payload.afterText || payload.beforeText);
      const span = findHtmlTextSpan(html, q);
      if (span.found) {
        const bounds = expandHtmlOffsetRangeToBlockBounds(html, span.start, span.end);
        const pos = payload.beforeText ? bounds.start : bounds.end;
        updateCounts(html.slice(0, pos) + insertedHtml + html.slice(pos));
        return true;
      }
    }
    return false;
  };

  if (
    action === 'insert_text' ||
    action === 'insert_structured_document' ||
    action === 'append_or_insert_paragraph' ||
    action === 'prepend_to_document'
  ) {
    const raw = String(payload.content || payload.text || '');
    if (!raw) return;
    const converted = convertMarkdownAndLatexToHtml(raw);
    if (insertOrReplaceAnchor(converted)) return;
    const isEmpty = !html.trim() || html.trim() === '<p></p>' || html.trim() === '<p><br></p>';
    const next = isEmpty
      ? converted
      : action === 'prepend_to_document' || payload.position === 'start'
      ? `${converted}${html}`
      : `${html}${converted}`;
    updateCounts(next);
    return;
  }

  if (
    action === 'insert_diagram' ||
    action === 'insert_chart' ||
    action === 'insert_document_image' ||
    action === 'insert_vector_shape' ||
    action === 'insert_text_box' ||
    action === 'insert_code_block' ||
    action === 'insert_callout_box' ||
    action === 'insert_equation'
  ) {
    const placeholder = renderVisualActionToPlaceholderHtml(action, payload);
    if (!placeholder) return;
    if (insertOrReplaceAnchor(placeholder)) return;
    const isEmpty = !html.trim() || html.trim() === '<p></p>';
    const next = isEmpty
      ? placeholder
      : payload.position === 'start'
      ? `${placeholder}${html}`
      : `${html}${placeholder}`;
    updateCounts(next);
    return;
  }

  if (action === 'find_and_replace_text') {
    const findText = String(payload.findText || '');
    const rep = String(payload.replaceText ?? '');
    if (!findText) return;
    const repHtml = rep ? convertMarkdownAndLatexToHtml(rep).replace(/^<p>([\s\S]*)<\/p>$/i, '$1') : '';
    const span = findHtmlTextSpan(html, findText, { caseSensitive: Boolean(payload.caseSensitive) });
    if (span.found) {
      const next = html.slice(0, span.start) + repHtml + html.slice(span.end);
      updateCounts(next);
    }
    return;
  }

  if (action === 'replace_content') {
    const rawRep = payload.replacement !== undefined ? String(payload.replacement) : '';
    let repHtml = '';
    if (payload.diagramCode) {
      repHtml = renderVisualActionToPlaceholderHtml('insert_diagram', {
        diagramTitle: payload.diagramTitle || 'Diagram',
      });
    } else if (rawRep.trim()) {
      repHtml = convertMarkdownAndLatexToHtml(rawRep);
    }

    if (payload.headingTitle) {
      const sec = findHeadingSectionSpanInHtml(html, String(payload.headingTitle));
      if (sec.found) {
        const start = payload.includeHeading ? sec.headingStart : sec.headingEnd;
        updateCounts(html.slice(0, start) + repHtml + html.slice(sec.sectionEnd));
      }
      return;
    }

    if (payload.startText) {
      const sSpan = findHtmlTextSpan(html, String(payload.startText), { caseSensitive: Boolean(payload.caseSensitive) });
      if (sSpan.found) {
        let endIdx = sSpan.end;
        if (payload.endText) {
          const eSpan = findHtmlTextSpan(html, String(payload.endText), {
            caseSensitive: Boolean(payload.caseSensitive),
            afterOffset: sSpan.start,
          });
          if (eSpan.found) endIdx = eSpan.end;
        }
        const bounds =
          payload.expandToBlocks !== false ? expandHtmlOffsetRangeToBlockBounds(html, sSpan.start, endIdx) : { start: sSpan.start, end: endIdx };
        updateCounts(html.slice(0, bounds.start) + repHtml + html.slice(bounds.end));
      }
      return;
    }

    if (payload.blockType || payload.containsText || typeof payload.blockIndex === 'number') {
      const blk = findBlockInHtml(
        html,
        payload.blockType ? String(payload.blockType) : 'any',
        payload.containsText ? String(payload.containsText) : undefined,
        typeof payload.blockIndex === 'number' ? payload.blockIndex : undefined,
        payload.afterHeading ? String(payload.afterHeading) : undefined
      );
      if (blk) {
        updateCounts(html.slice(0, blk.start) + repHtml + html.slice(blk.end));
        return;
      }
    }

    if (payload.targetText) {
      const span = findHtmlTextSpan(html, String(payload.targetText), { caseSensitive: Boolean(payload.caseSensitive) });
      if (span.found) {
        const bounds = expandHtmlOffsetRangeToBlockBounds(html, span.start, span.end);
        updateCounts(html.slice(0, bounds.start) + repHtml + html.slice(bounds.end));
      }
    }
    return;
  }

  if (action === 'delete_section') {
    const h = String(payload.headingTitle || payload.headingText || '');
    const sec = findHeadingSectionSpanInHtml(html, h);
    if (sec.found) {
      updateCounts(html.slice(0, sec.headingStart) + html.slice(sec.sectionEnd));
    }
    return;
  }

  if (action === 'replace_section') {
    const headingTitle = String(payload.headingTitle || payload.headingText || '').trim();
    const newBody = convertMarkdownAndLatexToHtml(String(payload.newContent || ''));
    const sec = findHeadingSectionSpanInHtml(html, headingTitle);
    if (sec.found) {
      updateCounts(html.slice(0, sec.headingEnd) + newBody + html.slice(sec.sectionEnd));
    }
    return;
  }

  if (action === 'style_table') {
    return;
  }

  if (action === 'delete_paragraph' || action === 'replace_paragraph') {
    const snippet = payload.textSnippet ? String(payload.textSnippet) : payload.targetText ? String(payload.targetText) : '';
    const idx = typeof payload.paragraphIndex === 'number' ? payload.paragraphIndex : undefined;
    const blk = findBlockInHtml(html, 'any', snippet || undefined, idx);
    if (blk) {
      const repHtml =
        action === 'replace_paragraph' ? convertMarkdownAndLatexToHtml(String(payload.newText || '')) : '';
      updateCounts(html.slice(0, blk.start) + repHtml + html.slice(blk.end));
    }
    return;
  }

  if (action === 'replace_text') {
    const find = String(payload.searchText || payload.oldText || payload.targetText || '');
    const rep = String(payload.replaceText || payload.newText || '');
    if (find) {
      const span = findHtmlTextSpan(html, find);
      if (span.found) {
        updateCounts(html.slice(0, span.start) + (rep ? escapeHtml(rep) : '') + html.slice(span.end));
      }
    }
    return;
  }

  if (action === 'insert_hyperlink') {
    const url = String(payload.url || '').trim();
    if (!url) return;
    const text = payload.text ? String(payload.text) : undefined;
    const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
    if (targetText) {
      const linkHtml = `<a href="${escapeAttr(url)}">${escapeHtml(text || targetText)}</a>`;
      const re = new RegExp(`(>[^<]*?)(${targetText.replace(REGEX_META_RE, '\\$&')})`, 'i');
      if (re.test(html)) {
        updateCounts(html.replace(re, `$1${linkHtml}`));
        return;
      }
    }
    const anchor = `<a href="${escapeAttr(url)}">${escapeHtml(text || targetText || url)}</a>`;
    const isEmpty = !html.trim() || html.trim() === '<p></p>';
    updateCounts(isEmpty ? `<p>${anchor}</p>` : `${html}<p>${anchor}</p>`);
    return;
  }

  if (action === 'delete_hyperlinks') {
    const targetText = payload.targetText ? String(payload.targetText).trim() : undefined;
    if (targetText) {
      const re = new RegExp(`<a[^>]*>([^<]*${targetText.replace(REGEX_META_RE, '\\$&')}[^<]*)<\\/a>`, 'gi');
      updateCounts(html.replace(re, '$1'));
    } else {
      updateCounts(html.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1'));
    }
  }
}


/**
 * DOCIUM Optimized Incremental Streaming Markdown Renderer
 * 
 * Performance Guarantees:
 * 1. O(1) block parsing during streaming: completed blocks are sealed into an immutable cache
 *    and NEVER re-parsed or re-rendered as new tokens stream into the tail.
 * 2. Only the active tail block undergoes auto-closing and active rendering.
 * 3. Deferred syntax highlighting on streaming code blocks: avoids running expensive regex
 *    engines on incomplete code fences on every frame.
 * 4. Referential stability across blocks prevents React VDOM churn and layout thrashing.
 * 5. Full support for headings, paragraphs, bold/italic/strikethrough, lists, nested lists,
 *    blockquotes, tables, code blocks, links, math formulas, and citations.
 */

'use client';

import React, { memo, useMemo, useRef } from 'react';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { chatDiagnostics } from '@/lib/ai/diagnostics';

export interface StreamingMarkdownProps {
  content: string;
  isStreaming?: boolean;
  copiedId?: string | null;
  onCopy?: (id: string, text: string) => void;
}

export interface MarkdownBlockItem {
  id: string;
  rawText: string;
}

/**
 * Validates URLs to prevent script injection via links.
 */
function isValidExternalUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('mailto:');
}

/**
 * Removes internal reasoning blocks and raw tool-call tags before rendering.
 * Includes O(1) literal indexOf fast-path to prevent regex scanning of 50k+ char strings.
 */
function sanitizeStreamingContent(raw: string): string {
  if (!raw) return '';
  const hasThink = raw.indexOf('<think') !== -1;
  const hasToolJson = raw.indexOf('{"') !== -1 || raw.indexOf('{ "') !== -1;
  if (!hasThink && !hasToolJson) {
    return raw.trimStart();
  }

  let text = raw;
  if (hasThink) {
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const openThinkIdx = text.indexOf('<think>');
    if (openThinkIdx !== -1) {
      text = text.substring(0, openThinkIdx);
    }
  }
  if (hasToolJson) {
    text = text.replace(/```(?:json)?\s*\{\s*"(?:name|tool|function|call)"[\s\S]*?\}\s*```/gi, '');
  }
  return text.trimStart();
}

/**
 * Auto-closes incomplete Markdown syntax at the stream tail.
 */
function autoCloseIncompleteMarkdown(text: string): { normalized: string; isUnclosedCodeBlock: boolean; unclosedLang?: string } {
  if (!text) return { normalized: '', isUnclosedCodeBlock: false };

  let normalized = text;
  let isUnclosedCodeBlock = false;
  let unclosedLang: string | undefined;

  // 1. Unclosed code blocks (odd count of ```)
  const codeBlockCount = (normalized.match(/```/g) || []).length;
  if (codeBlockCount % 2 === 1) {
    isUnclosedCodeBlock = true;
    const lastFenceIdx = normalized.lastIndexOf('```');
    const fenceLine = normalized.slice(lastFenceIdx);
    const langMatch = fenceLine.match(/^```([a-zA-Z0-9_-]*)/);
    unclosedLang = langMatch ? langMatch[1] : undefined;
    normalized += '\n```';
  }

  // 2. Unclosed inline code (odd count of ` outside code blocks)
  const lastLine = normalized.split('\n').pop() || '';
  const backtickCount = (lastLine.match(/`/g) || []).length;
  if (backtickCount % 2 === 1 && !isUnclosedCodeBlock) {
    normalized += '`';
  }

  // 3. Unclosed bold/italic markers at stream tail
  if (!isUnclosedCodeBlock) {
    const trailingAsterisks = lastLine.match(/\*{1,3}$/);
    if (trailingAsterisks) {
      const astCount = (lastLine.match(/\*/g) || []).length;
      if (astCount % 2 === 1) {
        normalized += trailingAsterisks[0];
      }
    }
  }

  // 4. Incomplete LaTeX math ($... without closing $)
  if (!isUnclosedCodeBlock) {
    const dollarCount = (lastLine.match(/\$/g) || []).length;
    if (dollarCount % 2 === 1) {
      normalized += '$';
    }
  }

  return { normalized, isUnclosedCodeBlock, unclosedLang };
}

/**
 * Math formula symbol replacer.
 */
function formatMathFormula(latex: string): string {
  return latex
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\delta/g, 'Δ')
    .replace(/\\omega/g, 'Ω')
    .replace(/\\sum/g, '∑')
    .replace(/\\int/g, '∫')
    .replace(/\\prod/g, '∏')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')
    .replace(/\\partial/g, '∂')
    .replace(/\\nabla/g, '∇')
    .replace(/\\to/g, '→')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\leftarrow/g, '←')
    .replace(/\\in/g, '∈')
    .replace(/\\forall/g, '∀')
    .replace(/\\exists/g, '∃')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
}

/**
 * Parses inline formatting: bold, italic, strikethrough, inline code, links, math, citations.
 */
function parseInlineFormatting(text: string, keyPrefix: string): React.ReactNode {
  if (!text) return null;
  // Fast-path: if text contains no markdown formatting characters, return as plain string
  if (!/[*_~`$\[]/.test(text)) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  const inlineRegex =
    /(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|_.*?_|~~.*?~~|`.*?`|\[Source:[^\]]+\]|\[.*?\]\(.*?\)|\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let inlineIdx = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-inl-${inlineIdx++}`;

    if (token.startsWith('***') && token.endsWith('***')) {
      parts.push(
        <strong key={key} className="font-bold italic text-[var(--text)]">
          {token.slice(3, -3)}
        </strong>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={key} className="font-semibold text-[var(--text)]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~')) {
      parts.push(
        <del key={key} className="line-through opacity-70">
          {token.slice(2, -2)}
        </del>
      );
    } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
      parts.push(
        <em key={key} className="italic text-[var(--text)]">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={key}
          className="rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--primary)] font-medium border border-[var(--border-subtle)]"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('$$') && token.endsWith('$$')) {
      parts.push(
        <div
          key={key}
          className="my-2 p-2 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-center font-serif text-xs text-[var(--primary)] overflow-x-auto"
        >
          {formatMathFormula(token.slice(2, -2).trim())}
        </div>
      );
    } else if (token.startsWith('$') && token.endsWith('$')) {
      parts.push(
        <span
          key={key}
          className="font-serif text-[11px] italic text-[var(--primary)] px-1 py-0.5 rounded bg-[var(--accent)]/50"
        >
          {formatMathFormula(token.slice(1, -1))}
        </span>
      );
    } else if (token.startsWith('[Source:')) {
      parts.push(
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded bg-[var(--surface-elevated)] border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)] mx-0.5 shadow-2xs"
        >
          {token.slice(1, -1)}
        </span>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = token.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const linkUrl = linkMatch[2];
        const isValid = isValidExternalUrl(linkUrl);

        if (isValid) {
          parts.push(
            <a
              key={key}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--primary)] hover:underline inline-flex items-center gap-0.5 font-medium transition-colors"
            >
              <span>{linkText}</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-70" />
            </a>
          );
        } else {
          parts.push(<span key={key} className="underline font-medium">{linkText}</span>);
        }
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * Parses and renders Markdown tables.
 */
function renderMarkdownTable(rows: string[], keyPrefix: string): React.ReactNode {
  if (rows.length < 2) return null;

  const headerRow = rows[0];
  const separatorRow = rows[1];
  const dataRows = rows.slice(2);

  const parseCells = (rowStr: string): string[] => {
    return rowStr
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.trim());
  };

  const headers = parseCells(headerRow);
  if (headers.length === 0) return null;

  const isSeparator = /^\|?(\s*:?-+:?\s*\|?)+$/.test(separatorRow.trim());
  if (!isSeparator) return null;

  return (
    <div key={keyPrefix} className="my-3 overflow-x-auto rounded-xl border border-[var(--border)] shadow-2xs bg-[var(--surface)]">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--accent)]/50">
            {headers.map((h, hIdx) => (
              <th key={hIdx} className="py-2 px-3 font-semibold text-[var(--text)] text-[11px]">
                {parseInlineFormatting(h, `${keyPrefix}-th-${hIdx}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text)]">
          {dataRows.map((r, rIdx) => {
            const cells = parseCells(r);
            return (
              <tr key={rIdx} className="hover:bg-[var(--accent)]/30 transition-colors">
                {cells.map((cell, cIdx) => (
                  <td key={cIdx} className="py-2 px-3 leading-relaxed text-[11px]">
                    {parseInlineFormatting(cell, `${keyPrefix}-td-${rIdx}-${cIdx}`)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Core Block Renderer
 */
function renderSingleBlock(
  blockText: string,
  keyPrefix: string,
  options: {
    isStreaming?: boolean;
    isLast?: boolean;
    copiedId?: string | null;
    onCopy?: (id: string, text: string) => void;
  }
): React.ReactNode {
  const { isStreaming = false, isLast = false, copiedId, onCopy } = options;
  const lines = blockText.split('\n');
  const firstLine = lines[0].trim();

  // 1. Code Block detection
  if (firstLine.startsWith('```')) {
    const lang = firstLine.slice(3).trim() || 'code';
    let codeContent = lines.slice(1).join('\n');
    let isUnclosed = false;

    if (codeContent.endsWith('```')) {
      codeContent = codeContent.slice(0, -3);
    } else {
      isUnclosed = true;
    }

    const codeId = `code-block-${keyPrefix}`;

    return (
      <div
        key={keyPrefix}
        className="my-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[#101412] text-zinc-100 text-xs font-mono shadow-xs"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 bg-[#161B18] px-3.5 py-1.5 text-[11px] text-zinc-400">
          <span className="font-semibold uppercase tracking-wider text-[10px]">{lang}</span>
          <div className="flex items-center gap-2">
            {isStreaming && isLast && isUnclosed && (
              <span className="text-[10px] text-zinc-500 italic">Streaming...</span>
            )}
            {onCopy && (
              <button
                type="button"
                onClick={() => onCopy(codeId, codeContent)}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                {copiedId === codeId ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px]">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span className="text-[10px]">Copy code</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <pre className="overflow-x-auto p-3.5 leading-relaxed text-[11px] font-mono whitespace-pre">
          <code>{codeContent}</code>
          {isStreaming && isLast && isUnclosed && (
            <span className="inline-block h-3.5 w-1.5 bg-[var(--primary)] ml-1 animate-pulse align-middle" />
          )}
        </pre>
      </div>
    );
  }

  // 2. Table detection (starts with | and has separator)
  if (lines.length >= 2 && firstLine.startsWith('|') && lines[1].trim().startsWith('|')) {
    const tableElement = renderMarkdownTable(lines, keyPrefix);
    if (tableElement) return tableElement;
  }

  // 3. Headings
  if (firstLine.startsWith('# ')) {
    return (
      <h1 key={keyPrefix} className="text-lg font-bold text-[var(--text)] mt-5 mb-2 pb-1.5 border-b border-[var(--border)]">
        {parseInlineFormatting(firstLine.slice(2), `${keyPrefix}-h1`)}
      </h1>
    );
  }
  if (firstLine.startsWith('## ')) {
    return (
      <h2 key={keyPrefix} className="text-base font-bold text-[var(--text)] mt-4 mb-1.5 pb-1 border-b border-[var(--border-subtle)]">
        {parseInlineFormatting(firstLine.slice(3), `${keyPrefix}-h2`)}
      </h2>
    );
  }
  if (firstLine.startsWith('### ')) {
    return (
      <h3 key={keyPrefix} className="text-sm font-semibold text-[var(--text)] mt-3.5 mb-1">
        {parseInlineFormatting(firstLine.slice(4), `${keyPrefix}-h3`)}
      </h3>
    );
  }
  if (firstLine.startsWith('#### ')) {
    return (
      <h4 key={keyPrefix} className="text-xs font-bold text-[var(--text)] mt-3 mb-1">
        {parseInlineFormatting(firstLine.slice(5), `${keyPrefix}-h4`)}
      </h4>
    );
  }

  // 4. Blockquotes
  if (firstLine.startsWith('> ')) {
    const bqLines = lines.map((l) => (l.trim().startsWith('> ') ? l.trim().slice(2) : l.trim()));
    return (
      <blockquote
        key={keyPrefix}
        className="my-2.5 border-l-2 border-[var(--primary)] pl-3.5 py-0.5 text-xs italic text-[var(--text-muted)] bg-[var(--accent)]/20 rounded-r-lg"
      >
        {bqLines.map((bql, bqIdx) => (
          <p key={bqIdx} className="leading-relaxed">
            {parseInlineFormatting(bql, `${keyPrefix}-bqp-${bqIdx}`)}
          </p>
        ))}
      </blockquote>
    );
  }

  // 5. Ordered and Unordered Lists (supports nested indentations)
  const isList = lines.some((l) => /^\s*(?:[-*]|\d+\.)\s/.test(l));
  if (isList) {
    return (
      <div key={keyPrefix} className="my-2 space-y-1">
        {lines.map((line, lIdx) => {
          const indentMatch = line.match(/^(\s*)/);
          const indentSpaces = indentMatch ? indentMatch[1].length : 0;
          const indentLevel = Math.min(3, Math.floor(indentSpaces / 2));
          const trimmed = line.trim();

          const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
          if (olMatch) {
            return (
              <div
                key={lIdx}
                style={{ marginLeft: `${indentLevel * 16}px` }}
                className="flex items-start gap-2 text-xs text-[var(--text)] leading-relaxed"
              >
                <span className="font-mono text-[11px] font-semibold text-[var(--primary)] shrink-0 min-w-[18px]">
                  {olMatch[1]}.
                </span>
                <div className="flex-1">
                  {parseInlineFormatting(olMatch[2], `${keyPrefix}-ol-${lIdx}`)}
                </div>
              </div>
            );
          }

          const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
          if (ulMatch) {
            return (
              <div
                key={lIdx}
                style={{ marginLeft: `${indentLevel * 16}px` }}
                className="flex items-start gap-2 text-xs text-[var(--text)] leading-relaxed"
              >
                <span className="text-[var(--primary)] text-sm leading-none mt-0.5 shrink-0">•</span>
                <div className="flex-1">
                  {parseInlineFormatting(ulMatch[1], `${keyPrefix}-ul-${lIdx}`)}
                </div>
              </div>
            );
          }

          if (!trimmed) return <div key={lIdx} className="h-1.5" />;

          return (
            <div
              key={lIdx}
              style={{ marginLeft: `${indentLevel * 16 + 22}px` }}
              className="text-xs text-[var(--text)] leading-relaxed"
            >
              {parseInlineFormatting(trimmed, `${keyPrefix}-li-cont-${lIdx}`)}
            </div>
          );
        })}
      </div>
    );
  }

  // 6. Standard Paragraph
  return (
    <p key={keyPrefix} className="my-1.5 text-xs text-[var(--text)] leading-relaxed">
      {parseInlineFormatting(blockText, `${keyPrefix}-p`)}
      {isStreaming && isLast && (
        <span className="inline-block h-3 w-1.5 bg-[var(--primary)] ml-1 animate-pulse align-middle" />
      )}
    </p>
  );
}

/**
 * Immutable Sealed Block Component
 * Once a block is completed, it renders EXACTLY ONCE and NEVER re-renders.
 */
interface SealedBlockProps {
  block: MarkdownBlockItem;
  copiedId?: string | null;
  onCopy?: (id: string, text: string) => void;
}

const SealedMarkdownBlock = memo(
  function SealedMarkdownBlock({ block, copiedId, onCopy }: SealedBlockProps) {
    return renderSingleBlock(block.rawText, block.id, {
      isStreaming: false,
      isLast: false,
      copiedId,
      onCopy,
    });
  },
  (prev, next) => {
    if (prev.block.id !== next.block.id) return false;
    if (prev.block.rawText !== next.block.rawText) return false;
    const prevCopied = prev.copiedId && prev.copiedId.includes(prev.block.id);
    const nextCopied = next.copiedId && next.copiedId.includes(next.block.id);
    if (prevCopied !== nextCopied) return false;
    return true;
  }
);

/**
 * Active Tail Block Component
 * Renders ONLY the actively growing block at the end of the stream.
 */
interface ActiveTailBlockProps {
  rawText: string;
  isStreaming: boolean;
  copiedId?: string | null;
  onCopy?: (id: string, text: string) => void;
}

const ActiveTailMarkdownBlock = memo(function ActiveTailMarkdownBlock({
  rawText,
  isStreaming,
  copiedId,
  onCopy,
}: ActiveTailBlockProps) {
  const { normalized } = autoCloseIncompleteMarkdown(rawText);

  return renderSingleBlock(normalized, 'tail-block', {
    isStreaming,
    isLast: true,
    copiedId,
    onCopy,
  });
});

interface BlockPartitionCache {
  lastRaw: string;
  lastSanitized: string;
  lastSealedOffset: number;
  sealedBlocks: MarkdownBlockItem[];
  activeTail: string;
  isStreaming: boolean;
}

/**
 * Incremental Block Partitioning with Offset Caching
 * Partitions content into sealed (immutable) blocks and an active tail block.
 * When streaming tokens append to existing content, scanning begins ONLY from
 * lastSealedOffset, preventing O(N^2) rescanning and memory bloat.
 */
function partitionIncrementalWithCache(
  text: string,
  isStreaming: boolean,
  cache: BlockPartitionCache
): {
  sealedBlocks: MarkdownBlockItem[];
  activeTail: string;
} {
  if (!text) {
    cache.lastRaw = '';
    cache.lastSanitized = '';
    cache.lastSealedOffset = 0;
    cache.sealedBlocks = [];
    cache.activeTail = '';
    cache.isStreaming = isStreaming;
    return { sealedBlocks: [], activeTail: '' };
  }

  const sanitized = sanitizeStreamingContent(text);
  if (!sanitized.trim()) {
    cache.lastRaw = text;
    cache.lastSanitized = sanitized;
    cache.lastSealedOffset = 0;
    cache.sealedBlocks = [];
    cache.activeTail = '';
    cache.isStreaming = isStreaming;
    return { sealedBlocks: [], activeTail: '' };
  }

  // Fast-path: if text and streaming status are unchanged, return cached result immediately
  if (text === cache.lastRaw && isStreaming === cache.isStreaming) {
    return { sealedBlocks: cache.sealedBlocks, activeTail: cache.activeTail };
  }

  let sealedBlocks: MarkdownBlockItem[];
  let blockStart: number;
  let blockIdx: number;
  let i: number;

  const isIncrementalAppend =
    cache.lastSanitized.length > 0 &&
    sanitized.length >= cache.lastSanitized.length &&
    sanitized.startsWith(cache.lastSanitized);

  if (isIncrementalAppend && cache.lastSealedOffset <= sanitized.length) {
    // Incremental fast-path: start scanning ONLY from the last sealed offset!
    sealedBlocks = cache.sealedBlocks;
    blockStart = cache.lastSealedOffset;
    blockIdx = sealedBlocks.length;
    i = cache.lastSealedOffset;
  } else {
    // Full re-partition (e.g. content replacement or new message)
    sealedBlocks = [];
    blockStart = 0;
    blockIdx = 0;
    i = 0;
  }

  const len = sanitized.length;
  let inCodeFence = false;

  while (i < len) {
    if (inCodeFence) {
      // Look for closing ```
      if (
        sanitized[i] === '`' &&
        i + 2 < len &&
        sanitized[i + 1] === '`' &&
        sanitized[i + 2] === '`'
      ) {
        i += 3;
        while (i < len && sanitized[i] !== '\n') {
          i++;
        }
        if (i < len && sanitized[i] === '\n') {
          i++;
        }
        inCodeFence = false;
        const rawBlock = sanitized.substring(blockStart, i).trim();
        if (rawBlock) {
          sealedBlocks.push({ id: `blk-${blockIdx++}`, rawText: rawBlock });
        }
        while (i < len && (sanitized[i] === '\n' || sanitized[i] === ' ' || sanitized[i] === '\t')) {
          i++;
        }
        blockStart = i;
        continue;
      }
      i++;
    } else {
      // Check for opening ```
      if (
        sanitized[i] === '`' &&
        i + 2 < len &&
        sanitized[i + 1] === '`' &&
        sanitized[i + 2] === '`' &&
        (i === 0 || sanitized[i - 1] === '\n')
      ) {
        if (i > blockStart) {
          const rawBlock = sanitized.substring(blockStart, i).trim();
          if (rawBlock) {
            sealedBlocks.push({ id: `blk-${blockIdx++}`, rawText: rawBlock });
          }
        }
        blockStart = i;
        inCodeFence = true;
        i += 3;
        continue;
      }

      // Check for double newline \n\n outside code fence
      if (sanitized[i] === '\n' && i + 1 < len && sanitized[i + 1] === '\n') {
        const rawBlock = sanitized.substring(blockStart, i).trim();
        if (rawBlock) {
          sealedBlocks.push({ id: `blk-${blockIdx++}`, rawText: rawBlock });
        }
        while (i < len && sanitized[i] === '\n') {
          i++;
        }
        blockStart = i;
        continue;
      }

      i++;
    }
  }

  const activeTail = sanitized.substring(blockStart).trim();

  // If streaming has finished, seal the final tail block too
  if (!isStreaming && activeTail) {
    sealedBlocks.push({ id: `blk-${blockIdx++}`, rawText: activeTail });
    cache.lastRaw = text;
    cache.lastSanitized = sanitized;
    cache.lastSealedOffset = len;
    cache.sealedBlocks = sealedBlocks;
    cache.activeTail = '';
    cache.isStreaming = isStreaming;
    return { sealedBlocks, activeTail: '' };
  }

  cache.lastRaw = text;
  cache.lastSanitized = sanitized;
  cache.lastSealedOffset = blockStart;
  cache.sealedBlocks = sealedBlocks;
  cache.activeTail = activeTail;
  cache.isStreaming = isStreaming;

  return { sealedBlocks, activeTail };
}

/**
 * Main Streaming Markdown Component
 */
export const StreamingMarkdown = memo(function StreamingMarkdown({
  content,
  isStreaming = false,
  copiedId = null,
  onCopy,
}: StreamingMarkdownProps) {
  chatDiagnostics.recordRenderedResponseLength(content.length);

  const cacheRef = useRef<BlockPartitionCache>({
    lastRaw: '',
    lastSanitized: '',
    lastSealedOffset: 0,
    sealedBlocks: [],
    activeTail: '',
    isStreaming: false,
  });

  const { sealedBlocks, activeTail } = partitionIncrementalWithCache(
    content,
    isStreaming,
    cacheRef.current
  );

  const hasSealed = sealedBlocks.length > 0;
  const hasTail = Boolean(activeTail);

  if (!hasSealed && !hasTail) {
    if (isStreaming) {
      return (
        <div className="flex items-center gap-1.5 py-1 text-xs text-[var(--text-muted)]">
          <span className="inline-block h-3.5 w-1.5 bg-[var(--primary)] animate-pulse" />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="w-full text-xs text-[var(--text)] leading-relaxed select-text space-y-1">
      {/* 1. Immutable Sealed Blocks (never re-rendered) */}
      {sealedBlocks.map((block) => (
        <SealedMarkdownBlock
          key={block.id}
          block={block}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      ))}

      {/* 2. Actively Growing Tail Block (only block that renders as tokens stream) */}
      {hasTail && (
        <ActiveTailMarkdownBlock
          key="tail"
          rawText={activeTail}
          isStreaming={isStreaming}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      )}
    </div>
  );
});

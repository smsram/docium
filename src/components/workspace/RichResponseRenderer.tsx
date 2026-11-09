'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  FileCheck,
} from 'lucide-react';

interface RichResponseRendererProps {
  content: string;
  citations?: {
    sourceId: string;
    sourceTitle: string;
    page?: number;
    snippet: string;
  }[];
  suggestedAction?: {
    label: string;
    type: 'insert_doc' | 'create_table' | 'create_chart' | 'create_diagram' | 'add_slide';
    payload: string;
  };
  onApplyAction?: (actionType: string, payload: string) => void;
  onRetry?: () => void;
  className?: string;
}

export function RichResponseRenderer({
  content,
  citations = [],
  suggestedAction,
  onApplyAction,
  onRetry,
  className = '',
}: RichResponseRendererProps) {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [actionApplied, setActionApplied] = useState(false);

  const copyText = (text: string, id?: string) => {
    navigator.clipboard.writeText(text);
    if (id) {
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } else {
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    }
  };

  const handleApply = () => {
    if (suggestedAction && onApplyAction) {
      onApplyAction(suggestedAction.type, suggestedAction.payload);
      setActionApplied(true);
      setTimeout(() => setActionApplied(false), 3000);
    }
  };

  // Safe and structured markdown parser
  const renderFormattedMarkdown = (text: string) => {
    // Split text into code blocks and normal text sections
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let blockId = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      const precedingText = text.substring(lastIndex, match.index);
      if (precedingText) {
        parts.push(renderTextSections(precedingText, `text-${blockId}`));
      }

      const lang = match[1] || 'code';
      const code = match[2];
      const currentBlockId = `code-${blockId++}`;

      parts.push(
        <div
          key={currentBlockId}
          className="my-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[#101412] text-zinc-100 text-xs font-mono shadow-xs"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 bg-[#161B18] px-3.5 py-1.5 text-[11px] text-zinc-400">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {lang}
            </span>
            <button
              onClick={() => copyText(code, currentBlockId)}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {copiedCodeId === currentBlockId ? (
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
          </div>
          <pre className="overflow-x-auto p-3.5 leading-relaxed text-[11px]">
            <code>{code.trim()}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      parts.push(renderTextSections(remainingText, `text-${blockId}`));
    }

    return parts;
  };

  // Parses headers, lists, tables, and paragraphs
  const renderTextSections = (text: string, keyPrefix: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const flushTable = (index: number) => {
      if (tableBuffer.length >= 2) {
        const rows = tableBuffer.map((r) =>
          r
            .split('|')
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map((c) => c.trim())
        );

        const headerRow = rows[0];
        const bodyRows = rows.slice(2); // Skip separator row

        elements.push(
          <div
            key={`${keyPrefix}-tbl-${index}`}
            className="my-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]"
          >
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--accent)] text-[var(--text)] font-semibold">
                  {headerRow.map((cell, cIdx) => (
                    <th key={cIdx} className="px-3 py-2 text-[11px]">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[var(--text)]">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--accent)]/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-1.5 text-[11px]">
                        {parseInlineFormatting(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableBuffer = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Check for table syntax
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        tableBuffer.push(trimmed);
        continue;
      } else if (tableBuffer.length > 0) {
        flushTable(i);
      }

      if (!trimmed) {
        elements.push(<div key={`${keyPrefix}-sp-${i}`} className="h-2" />);
        continue;
      }

      // Headings
      if (trimmed.startsWith('#### ')) {
        elements.push(
          <h4
            key={`${keyPrefix}-h4-${i}`}
            className="text-xs font-bold text-[var(--text)] mt-3 mb-1"
          >
            {parseInlineFormatting(trimmed.slice(5))}
          </h4>
        );
      } else if (trimmed.startsWith('### ')) {
        elements.push(
          <h3
            key={`${keyPrefix}-h3-${i}`}
            className="text-sm font-bold text-[var(--text)] mt-3.5 mb-1 tracking-tight"
          >
            {parseInlineFormatting(trimmed.slice(4))}
          </h3>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h2
            key={`${keyPrefix}-h2-${i}`}
            className="text-base font-bold text-[var(--text)] mt-4 mb-1.5 tracking-tight border-b border-[var(--border-subtle)] pb-1"
          >
            {parseInlineFormatting(trimmed.slice(3))}
          </h2>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h1
            key={`${keyPrefix}-h1-${i}`}
            className="text-lg font-bold text-[var(--text)] mt-4 mb-2 tracking-tight"
          >
            {parseInlineFormatting(trimmed.slice(2))}
          </h1>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        // Bullet list
        elements.push(
          <div key={`${keyPrefix}-li-${i}`} className="flex items-start gap-2 ml-2 my-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)] mt-1.5 shrink-0" />
            <span className="text-xs text-[var(--text)] leading-relaxed">
              {parseInlineFormatting(trimmed.slice(2))}
            </span>
          </div>
        );
      } else if (trimmed.match(/^\d+\.\s/)) {
        // Numbered list
        const num = trimmed.match(/^\d+/)?.[0] || '1';
        const rest = trimmed.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={`${keyPrefix}-oli-${i}`} className="flex items-start gap-2 ml-2 my-0.5">
            <span className="text-[11px] font-mono text-[var(--primary)] font-semibold shrink-0 min-w-[14px]">
              {num}.
            </span>
            <span className="text-xs text-[var(--text)] leading-relaxed">
              {parseInlineFormatting(rest)}
            </span>
          </div>
        );
      } else {
        // Normal paragraph
        elements.push(
          <p
            key={`${keyPrefix}-p-${i}`}
            className="text-xs text-[var(--text)] leading-relaxed my-1"
          >
            {parseInlineFormatting(trimmed)}
          </p>
        );
      }
    }

    if (tableBuffer.length > 0) {
      flushTable(lines.length);
    }

    return elements;
  };

  // Inline formatting: **bold**, *italic*, `code`, and [citations]
  const parseInlineFormatting = (text: string): React.ReactNode => {
    // Bold: **text**, Inline code: `code`, Citations: [Source: ...]
    const tokens = text.split(/(\*\*.*?\*\*|`.*?`|\[Source:[^\]]+\])/g);

    return tokens.map((token, idx) => {
      if (token.startsWith('**') && token.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-[var(--text)]">
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code
            key={idx}
            className="rounded bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--primary)] border border-[var(--border)]"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      if (token.startsWith('[Source:') && token.endsWith(']')) {
        const sourceLabel = token.slice(8, -1).trim();
        return (
          <span
            key={idx}
            className="inline-flex items-center gap-1 mx-1 rounded-md bg-[var(--primary-light)] text-[var(--primary)] px-1.5 py-0.2 text-[10px] font-mono border border-[var(--primary)]/20 cursor-pointer hover:bg-[var(--primary)] hover:text-white transition-colors"
            title={`Referenced source: ${sourceLabel}`}
          >
            <FileCheck className="h-2.5 w-2.5" />
            <span>{sourceLabel}</span>
          </span>
        );
      }
      return token;
    });
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Markdown Content */}
      <div className="prose-clean">{renderFormattedMarkdown(content)}</div>

      {/* Citations Card Strip (if citations present) */}
      {citations.length > 0 && (
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
            <FileCheck className="h-3 w-3 text-[var(--primary)]" />
            <span>Referenced Sources ({citations.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {citations.map((c, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[11px] text-[var(--text)] shadow-2xs"
              >
                <span className="font-medium truncate max-w-[140px]">
                  {c.sourceTitle}
                </span>
                {c.page && (
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">
                    p.{c.page}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggested Action Card (Document Editing / Insertion) */}
      {suggestedAction && (
        <div className="my-2.5 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-light)]/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span className="text-xs font-semibold text-[var(--text)]">
                {suggestedAction.label}
              </span>
            </div>
            <span className="text-[10px] font-mono uppercase rounded bg-[var(--surface)] px-1.5 py-0.2 text-[var(--text-muted)] border border-[var(--border)]">
              {suggestedAction.type.replace('_', ' ')}
            </span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[var(--text-muted)]">
              Click apply to write changes directly to this workspace.
            </span>
            <button
              onClick={handleApply}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all shadow-2xs cursor-pointer ${
                actionApplied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
              }`}
            >
              {actionApplied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Applied</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Apply to Workspace</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer Utility Actions: Copy & Retry */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)]">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded px-2 py-1 hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Retry</span>
          </button>
        )}
        <button
          onClick={() => copyText(content)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors"
        >
          {copiedResponse ? (
            <>
              <Check className="h-3 w-3 text-emerald-500" />
              <span>Copied response</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}


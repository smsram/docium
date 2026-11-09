'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { type Editor, EditorContent } from '@tiptap/react';
import { PageDimensions } from '../utils/pageMetrics';
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Hash,
  Check,
  X,
  FileText,
} from 'lucide-react';

interface PaginatedCanvasProps {
  editor: Editor | null;
  pageDimensions: PageDimensions;
  zoomLevel: number;
  isPaginatedView: boolean;
  headerText?: string;
  footerText?: string;
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  onUpdateHeaderText?: (text: string) => void;
  onUpdateFooterText?: (text: string) => void;
  onUpdateFirstPageHeaderText?: (text: string) => void;
  onUpdateFirstPageFooterText?: (text: string) => void;
  showPageNumbers?: boolean;
  differentFirstPage?: boolean;
  onToggleDifferentFirstPage?: () => void;
  columns?: 1 | 2 | 3;
  showFormattingMarks?: boolean;
  wordCount?: number;
  readingTime?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function PaginatedCanvas({
  editor,
  pageDimensions,
  zoomLevel,
  isPaginatedView,
  headerText = '',
  footerText = '',
  firstPageHeaderText = '',
  firstPageFooterText = '',
  onUpdateHeaderText,
  onUpdateFooterText,
  onUpdateFirstPageHeaderText,
  onUpdateFirstPageFooterText,
  showPageNumbers = true,
  differentFirstPage = false,
  onToggleDifferentFirstPage,
  columns = 1,
  showFormattingMarks = false,
  wordCount = 0,
  readingTime = 1,
  onContextMenu,
}: PaginatedCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  const [pageCount, setPageCount] = useState(1);

  // Active in-place Header / Footer editing state
  const [editingSection, setEditingSection] = useState<{
    type: 'header' | 'footer';
    pageNumber: number;
  } | null>(null);

  // Draft texts for active editing
  const [draftText, setDraftText] = useState('');
  const [draftAlign, setDraftAlign] = useState<'left' | 'center' | 'right'>('left');

  const { widthPx, heightPx, marginsPx } = pageDimensions;
  const scale = zoomLevel / 100;

  // Header and Footer container heights equal the configured page margins
  const headerHeightPx = Math.max(36, marginsPx.top);
  const footerHeightPx = Math.max(36, marginsPx.bottom);

  // Printable body content height
  const pageContentHeightPx = Math.max(
    300,
    heightPx - marginsPx.top - marginsPx.bottom
  );

  // Resolve dynamic tokens like {page} and {pages}
  const resolvePageTokens = useCallback(
    (rawText: string, pageNum: number, totalPages: number) => {
      if (!rawText) return '';
      return rawText
        .replace(/\{page\}/gi, pageNum.toString())
        .replace(/\{pages\}/gi, totalPages.toString());
    },
    []
  );

  // Recalculate page count cleanly: distinguishes intentional breaks, overflow, and empty docs
  useEffect(() => {
    if (!editor || !contentWrapperRef.current) return;

    const calculatePages = () => {
      const el = contentWrapperRef.current;
      if (!el) return;

      // Count hard page breaks and section breaks
      const hardBreakNodes = el.querySelectorAll('.docium-page-break, .docium-section-break').length;

      // If document is empty and has no explicit breaks, it is strictly 1 page
      const isDocEmpty = editor.isEmpty || editor.getText().trim() === '';
      if (isDocEmpty && hardBreakNodes === 0) {
        setPageCount(1);
        return;
      }

      // Measure editor DOM content height directly
      const editorDom = el.querySelector('.tiptap, .ProseMirror') as HTMLElement | null;
      const contentHeight = editorDom ? editorDom.scrollHeight : el.scrollHeight;

      // Allow 32px tolerance for subpixel font rendering and trailing paragraph
      const effectiveContentHeight = Math.max(0, contentHeight - 32);
      const overflowPages = Math.max(1, Math.ceil(effectiveContentHeight / pageContentHeightPx));

      const calculated = Math.max(1, hardBreakNodes + 1, overflowPages);
      setPageCount(calculated);
    };

    calculatePages();

    const observer = new ResizeObserver(() => {
      calculatePages();
    });

    observer.observe(contentWrapperRef.current);
    return () => observer.disconnect();
  }, [editor, editor?.state.doc, pageContentHeightPx, heightPx, widthPx]);

  // Activate Header editing
  const startEditingHeader = (pageNumber: number) => {
    const isFirstPage = pageNumber === 1;
    const initialText =
      isFirstPage && differentFirstPage ? firstPageHeaderText : headerText;
    setDraftText(initialText || '');
    setDraftAlign('left');
    setEditingSection({ type: 'header', pageNumber });
    setTimeout(() => headerInputRef.current?.focus(), 50);
  };

  // Activate Footer editing
  const startEditingFooter = (pageNumber: number) => {
    const isFirstPage = pageNumber === 1;
    const initialText =
      isFirstPage && differentFirstPage ? firstPageFooterText : footerText;
    setDraftText(initialText || '');
    setDraftAlign('left');
    setEditingSection({ type: 'footer', pageNumber });
    setTimeout(() => footerInputRef.current?.focus(), 50);
  };

  // Commit Header edits
  const handleCommitHeader = () => {
    if (!editingSection || editingSection.type !== 'header') return;
    const isFirstPage = editingSection.pageNumber === 1;

    if (isFirstPage && differentFirstPage) {
      if (onUpdateFirstPageHeaderText) onUpdateFirstPageHeaderText(draftText);
    } else {
      if (onUpdateHeaderText) onUpdateHeaderText(draftText);
    }
    setEditingSection(null);
  };

  // Commit Footer edits
  const handleCommitFooter = () => {
    if (!editingSection || editingSection.type !== 'footer') return;
    const isFirstPage = editingSection.pageNumber === 1;

    if (isFirstPage && differentFirstPage) {
      if (onUpdateFirstPageFooterText) onUpdateFirstPageFooterText(draftText);
    } else {
      if (onUpdateFooterText) onUpdateFooterText(draftText);
    }
    setEditingSection(null);
  };

  // Insert page number token into draft input
  const handleInsertPageToken = (format: 'page' | 'pages' | 'both') => {
    let token = '{page}';
    if (format === 'pages') token = '{pages}';
    if (format === 'both') token = 'Page {page} of {pages}';

    setDraftText((prev) => (prev ? `${prev} • ${token}` : token));
  };

  // Column styling
  const columnStyle: React.CSSProperties = {
    columnCount: columns > 1 ? columns : undefined,
    columnGap: columns > 1 ? '28px' : undefined,
    columnRule: columns > 1 ? '1px solid var(--border)' : undefined,
  };

  // Helper: Render Header area for a page
  const renderHeaderArea = (pageNumber: number) => {
    const isFirstPage = pageNumber === 1;
    const isEditingThisHeader =
      editingSection?.type === 'header' && editingSection.pageNumber === pageNumber;

    const currentText =
      isFirstPage && differentFirstPage ? firstPageHeaderText : headerText;
    const resolvedText = resolvePageTokens(currentText, pageNumber, pageCount);
    const hasHeaderContent = resolvedText.trim().length > 0;

    if (isEditingThisHeader) {
      return (
        <div
          style={{
            height: `${headerHeightPx}px`,
            paddingLeft: `${marginsPx.left}px`,
            paddingRight: `${marginsPx.right}px`,
          }}
          className="flex flex-col justify-end pb-2 border-b border-dashed border-[var(--primary)] bg-[var(--primary-light)]/20 text-xs shrink-0 transition-all select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Toolbar */}
          <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--primary)] font-bold bg-[var(--primary-light)] px-1.5 py-0.5 rounded">
                {isFirstPage && differentFirstPage ? 'Header (First Page)' : 'Header'}
              </span>

              {/* Text Alignment */}
              <div className="flex items-center gap-0.5 bg-[var(--surface)] p-0.5 rounded border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setDraftAlign('left')}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'left'
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setDraftAlign('center')}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'center'
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Align Center"
                >
                  <AlignCenter className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setDraftAlign('right')}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'right'
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="h-3 w-3" />
                </button>
              </div>

              {/* Insert Page Number Token */}
              <button
                type="button"
                onClick={() => handleInsertPageToken('both')}
                className="flex items-center gap-1 text-[10px] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer"
                title="Insert Page Number Placeholder"
              >
                <Hash className="h-3 w-3 text-[var(--primary)]" />
                <span>+ Page Number</span>
              </button>

              {/* Different First Page Toggle */}
              {onToggleDifferentFirstPage && (
                <button
                  type="button"
                  onClick={onToggleDifferentFirstPage}
                  className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                    differentFirstPage
                      ? 'bg-[var(--primary-light)] border-[var(--primary)] text-[var(--primary)] font-medium'
                      : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Different First Page
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCommitHeader}
              className="flex items-center gap-1 text-[11px] bg-[var(--primary)] text-white px-2.5 py-0.5 rounded hover:bg-[var(--primary-hover)] font-medium cursor-pointer shadow-2xs"
            >
              <Check className="h-3 w-3" />
              <span>Done (Esc)</span>
            </button>
          </div>

          {/* Header Editable Text Input */}
          <input
            ref={headerInputRef}
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                handleCommitHeader();
              }
            }}
            onBlur={handleCommitHeader}
            placeholder="Type header text or insert page number..."
            style={{ textAlign: draftAlign }}
            className="w-full bg-transparent text-xs text-[var(--text)] outline-none font-medium placeholder:text-[var(--text-muted)] px-1"
          />
        </div>
      );
    }

    // Normal non-editing Header area
    return (
      <div
        style={{
          height: `${headerHeightPx}px`,
          paddingLeft: `${marginsPx.left}px`,
          paddingRight: `${marginsPx.right}px`,
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditingHeader(pageNumber);
        }}
        title="Double-click to edit Header"
        className={`flex items-end pb-2 text-[10px] text-[var(--text-muted)] select-none shrink-0 cursor-text transition-colors group ${
          hasHeaderContent
            ? 'border-b border-[var(--border-subtle)]'
            : 'border-b border-transparent hover:border-[var(--border-subtle)]'
        }`}
      >
        <div className="w-full flex items-center justify-between">
          {hasHeaderContent ? (
            <span className="truncate max-w-[80%] font-medium">{resolvedText}</span>
          ) : (
            <span className="text-[9px] text-[var(--text-muted)] opacity-0 group-hover:opacity-40 transition-opacity">
              Double-click to edit header
            </span>
          )}

          {isFirstPage && differentFirstPage && hasHeaderContent && (
            <span className="text-[8px] font-mono uppercase bg-[var(--accent)] px-1 rounded text-[var(--text-muted)]">
              First Page
            </span>
          )}
        </div>
      </div>
    );
  };

  // Helper: Render Footer area for a page
  const renderFooterArea = (pageNumber: number) => {
    const isFirstPage = pageNumber === 1;
    const isEditingThisFooter =
      editingSection?.type === 'footer' && editingSection.pageNumber === pageNumber;

    const currentText =
      isFirstPage && differentFirstPage ? firstPageFooterText : footerText;
    const resolvedText = resolvePageTokens(currentText, pageNumber, pageCount);
    const hasFooterContent = resolvedText.trim().length > 0;

    if (isEditingThisFooter) {
      return (
        <div
          style={{
            height: `${footerHeightPx}px`,
            paddingLeft: `${marginsPx.left}px`,
            paddingRight: `${marginsPx.right}px`,
          }}
          className="flex flex-col justify-start pt-2 border-t border-dashed border-[var(--primary)] bg-[var(--primary-light)]/20 text-xs shrink-0 transition-all select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Footer Toolbar */}
          <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--primary)] font-bold bg-[var(--primary-light)] px-1.5 py-0.5 rounded">
                {isFirstPage && differentFirstPage ? 'Footer (First Page)' : 'Footer'}
              </span>

              {/* Text Alignment */}
              <div className="flex items-center gap-0.5 bg-[var(--surface)] p-0.5 rounded border border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setDraftAlign('left')}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'left'
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setDraftAlign('center')}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'center'
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Align Center"
                >
                  <AlignCenter className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setDraftAlign('right')}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'right'
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="h-3 w-3" />
                </button>
              </div>

              {/* Insert Page Number Token */}
              <button
                type="button"
                onClick={() => handleInsertPageToken('both')}
                className="flex items-center gap-1 text-[10px] bg-[var(--surface)] border border-[var(--border)] px-1.5 py-0.5 rounded text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer"
                title="Insert Page Number Placeholder"
              >
                <Hash className="h-3 w-3 text-[var(--primary)]" />
                <span>+ Page Number</span>
              </button>

              {/* Different First Page Toggle */}
              {onToggleDifferentFirstPage && (
                <button
                  type="button"
                  onClick={onToggleDifferentFirstPage}
                  className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                    differentFirstPage
                      ? 'bg-[var(--primary-light)] border-[var(--primary)] text-[var(--primary)] font-medium'
                      : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  Different First Page
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCommitFooter}
              className="flex items-center gap-1 text-[11px] bg-[var(--primary)] text-white px-2.5 py-0.5 rounded hover:bg-[var(--primary-hover)] font-medium cursor-pointer shadow-2xs"
            >
              <Check className="h-3 w-3" />
              <span>Done (Esc)</span>
            </button>
          </div>

          {/* Footer Editable Text Input */}
          <input
            ref={footerInputRef}
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                handleCommitFooter();
              }
            }}
            onBlur={handleCommitFooter}
            placeholder="Type footer text or insert page number..."
            style={{ textAlign: draftAlign }}
            className="w-full bg-transparent text-xs text-[var(--text)] outline-none font-medium placeholder:text-[var(--text-muted)] px-1"
          />
        </div>
      );
    }

    // Normal non-editing Footer area
    return (
      <div
        style={{
          height: `${footerHeightPx}px`,
          paddingLeft: `${marginsPx.left}px`,
          paddingRight: `${marginsPx.right}px`,
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditingFooter(pageNumber);
        }}
        title="Double-click to edit Footer"
        className={`flex items-start pt-2 text-[10px] text-[var(--text-muted)] select-none shrink-0 cursor-text transition-colors group ${
          hasFooterContent || showPageNumbers
            ? 'border-t border-[var(--border-subtle)]'
            : 'border-t border-transparent hover:border-[var(--border-subtle)]'
        }`}
      >
        <div className="w-full flex items-center justify-between">
          <div className="truncate max-w-[65%]">
            {hasFooterContent ? (
              <span>{resolvedText}</span>
            ) : (
              <span className="text-[9px] text-[var(--text-muted)] opacity-0 group-hover:opacity-40 transition-opacity">
                Double-click to edit footer
              </span>
            )}
          </div>

          {showPageNumbers && !currentText.includes('{page}') && (
            <span className="font-mono font-medium text-[10px] ml-auto">
              Page {pageNumber} of {pageCount}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      onClick={() => {
        // Clicking outside commits active header/footer
        if (editingSection) {
          if (editingSection.type === 'header') handleCommitHeader();
          if (editingSection.type === 'footer') handleCommitFooter();
        }
      }}
      className={`flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 bg-[var(--background)] transition-colors select-text ${
        showFormattingMarks ? 'show-formatting-marks' : ''
      }`}
    >
      {/* 
        Horizontal centering container:
        Using min-w-fit and margin: '0 auto' guarantees that:
        1. If canvas is wider than viewport (e.g. landscape A4), left edge is NEVER clipped into negative coordinates!
        2. If canvas is narrower, it perfectly centers horizontally!
      */}
      <div
        style={{
          width: `${Math.round(widthPx * scale)}px`,
          minWidth: `${Math.round(widthPx * scale)}px`,
          margin: '0 auto',
          padding: '16px 0',
        }}
        className="flex flex-col items-center"
      >
        <div
          style={{
            width: `${widthPx}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="flex flex-col items-center"
        >
          {isPaginatedView ? (
            // ==================== PAGINATED MULTI-SHEET VIEW ====================
            <div className="flex flex-col items-center space-y-8">
              {Array.from({ length: pageCount }).map((_, pageIndex) => {
                const pageNumber = pageIndex + 1;

                return (
                  <div
                    key={pageNumber}
                    id={`docium-page-${pageNumber}`}
                    style={{
                      width: `${widthPx}px`,
                      minHeight: `${heightPx}px`,
                    }}
                    className="page-sheet relative bg-[var(--surface)] border border-[var(--border)] rounded-sm shadow-md flex flex-col justify-between overflow-hidden transition-all"
                  >
                    {/* Header Region */}
                    {renderHeaderArea(pageNumber)}

                    {/* Printable Content Region */}
                    {pageIndex === 0 ? (
                      <div
                        ref={contentWrapperRef}
                        style={{
                          paddingLeft: `${marginsPx.left}px`,
                          paddingRight: `${marginsPx.right}px`,
                          minHeight: `${pageContentHeightPx}px`,
                          ...columnStyle,
                        }}
                        className="flex-1 text-[var(--text)] text-sm leading-relaxed"
                      >
                        <EditorContent editor={editor} />
                      </div>
                    ) : (
                      // Subsequent physical pages (rendered seamlessly without artificial text)
                      <div
                        style={{
                          paddingLeft: `${marginsPx.left}px`,
                          paddingRight: `${marginsPx.right}px`,
                          minHeight: `${pageContentHeightPx}px`,
                        }}
                        className="flex-1 select-none pointer-events-none"
                      />
                    )}

                    {/* Footer Region */}
                    {renderFooterArea(pageNumber)}
                  </div>
                );
              })}
            </div>
          ) : (
            // ==================== CONTINUOUS WEB VIEW ====================
            <div
              style={{
                width: `${widthPx}px`,
                minHeight: '1000px',
              }}
              className="page-sheet bg-[var(--surface)] border border-[var(--border)] rounded-sm shadow-md flex flex-col justify-between overflow-hidden"
            >
              {/* Header */}
              {renderHeaderArea(1)}

              {/* Content */}
              <div
                ref={contentWrapperRef}
                style={{
                  paddingLeft: `${marginsPx.left}px`,
                  paddingRight: `${marginsPx.right}px`,
                  ...columnStyle,
                }}
                className="flex-1 text-[var(--text)] text-sm leading-relaxed"
              >
                <EditorContent editor={editor} />
              </div>

              {/* Footer */}
              {renderFooterArea(1)}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* Formatting marks display styling */
        .show-formatting-marks p::after {
          content: ' ¶';
          color: var(--text-muted);
          opacity: 0.4;
          font-family: monospace;
          font-size: 11px;
        }
        .show-formatting-marks h1::after,
        .show-formatting-marks h2::after,
        .show-formatting-marks h3::after {
          content: ' ¶';
          color: var(--text-muted);
          opacity: 0.3;
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}

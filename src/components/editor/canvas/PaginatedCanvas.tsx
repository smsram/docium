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
} from 'lucide-react';

interface PaginatedCanvasProps {
  editor: Editor | null;
  pageDimensions: PageDimensions;
  zoomLevel: number;
  isPaginatedView: boolean;
  headerText?: string;
  footerText?: string;
  headerAlign?: 'left' | 'center' | 'right';
  footerAlign?: 'left' | 'center' | 'right';
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  onUpdateHeaderText?: (text: string) => void;
  onUpdateFooterText?: (text: string) => void;
  onUpdateHeaderAlign?: (align: 'left' | 'center' | 'right') => void;
  onUpdateFooterAlign?: (align: 'left' | 'center' | 'right') => void;
  onUpdateFirstPageHeaderText?: (text: string) => void;
  onUpdateFirstPageFooterText?: (text: string) => void;
  showPageNumbers?: boolean;
  differentFirstPage?: boolean;
  onToggleDifferentFirstPage?: () => void;
  columns?: 1 | 2 | 3;
  showFormattingMarks?: boolean;
  watermarkText?: string;
  pageColor?: string;
  pageBorder?: 'none' | 'box' | 'shadow' | 'double' | 'accent';
  pageBorderColor?: string;
  pageBorderWidth?: number;
  pageBorderOffset?: 'edge' | 'margin' | 'wide';
  wordCount?: number;
  readingTime?: number;
  onContextMenu?: (e: React.MouseEvent) => void;
}

const PAGE_GAP_PX = 32;

export function PaginatedCanvas({
  editor,
  pageDimensions,
  zoomLevel,
  isPaginatedView,
  headerText = '',
  footerText = '',
  headerAlign = 'left',
  footerAlign = 'left',
  firstPageHeaderText = '',
  firstPageFooterText = '',
  onUpdateHeaderText,
  onUpdateFooterText,
  onUpdateHeaderAlign,
  onUpdateFooterAlign,
  onUpdateFirstPageHeaderText,
  onUpdateFirstPageFooterText,
  showPageNumbers = false,
  differentFirstPage = false,
  onToggleDifferentFirstPage,
  columns = 1,
  showFormattingMarks = false,
  watermarkText = '',
  pageColor = '#FFFFFF',
  pageBorder = 'none',
  pageBorderColor = '#1e293b',
  pageBorderWidth = 1,
  pageBorderOffset = 'edge',
  onContextMenu,
}: PaginatedCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetStackRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const isSplittingRef = useRef(false);
  const isMutatingPaginationRef = useRef(false);

  const [pageCount, setPageCount] = useState(1);

  const [editingSection, setEditingSection] = useState<{
    type: 'header' | 'footer';
    pageNumber: number;
  } | null>(null);

  const [draftText, setDraftText] = useState('');
  const [draftAlign, setDraftAlign] = useState<'left' | 'center' | 'right'>('left');

  const { widthPx, heightPx, marginsPx } = pageDimensions;
  const scale = zoomLevel / 100;

  const headerHeightPx = Math.max(36, marginsPx.top);
  const footerHeightPx = Math.max(36, marginsPx.bottom);

  const pageContentHeightPx = Math.max(
    260,
    heightPx - headerHeightPx - footerHeightPx
  );

  const pageStridePx = heightPx + PAGE_GAP_PX;
  const effectivePaperBg = pageColor || '#FFFFFF';

  const resolvePageTokens = useCallback(
    (rawText: string, pageNum: number, totalPages: number) => {
      if (!rawText) return '';
      return rawText
        .replace(/\{page\}/gi, pageNum.toString())
        .replace(/\{pages\}/gi, totalPages.toString());
    },
    []
  );

  const findParagraphSplitPos = (node: any, nodeStartOffset: number, targetFraction = 0.5): number | null => {
    const totalTextLen = node.textContent?.length || 0;
    if (totalTextLen < 40) return null;

    const hardBreakPositions: number[] = [];
    node.forEach((child: any, childOffset: number) => {
      if (child.type?.name === 'hardBreak') {
        hardBreakPositions.push(nodeStartOffset + 1 + childOffset + child.nodeSize);
      }
    });
    if (hardBreakPositions.length >= 1) {
      const idx = Math.max(0, Math.min(hardBreakPositions.length - 1, Math.floor(hardBreakPositions.length * targetFraction)));
      return hardBreakPositions[idx];
    }

    const targetCharIdx = Math.max(15, Math.min(totalTextLen - 15, Math.floor(totalTextLen * targetFraction)));
    let accumulatedChars = 0;
    let bestSplitPos: number | null = null;
    let bestDistance = Infinity;

    node.forEach((child: any, childOffset: number) => {
      if (child.isText && typeof child.text === 'string') {
        const text = child.text;
        for (let i = 1; i < text.length - 1; i++) {
          if (text[i] === ' ') {
            const globalCharIdx = accumulatedChars + i;
            if (globalCharIdx < 14 || globalCharIdx > totalTextLen - 14) continue;
            const dist = Math.abs(globalCharIdx - targetCharIdx);
            if (dist < bestDistance) {
              bestDistance = dist;
              bestSplitPos = nodeStartOffset + 1 + childOffset + i + 1;
            }
          }
        }
        accumulatedChars += text.length;
      } else {
        accumulatedChars += child.textContent?.length || 0;
      }
    });

    return bestSplitPos;
  };

  const findParagraphBoundarySplitPos = (
    node: any,
    nodeOffset: number,
    domEl: HTMLElement,
    sheetEl: HTMLElement,
    elTopDocPx: number,
    elHeightDocPx: number,
    maxBottomDocPx: number,
    effScale: number
  ): number | null => {
    const minPos = nodeOffset + 1;
    const maxPos = nodeOffset + node.nodeSize - 1;
    const totalText = node.textContent || '';
    if (totalText.length < 40) return null;

    try {
      const sheetRect = sheetEl.getBoundingClientRect();
      const elRect = domEl.getBoundingClientRect();
      const targetViewportY = sheetRect.top + (maxBottomDocPx - 10) * effScale;
      const targetViewportX = elRect.right - 12;

      if (targetViewportY > elRect.top + 14 && targetViewportY < elRect.bottom - 12) {
        const coordsPos = editor?.view?.posAtCoords({
          left: targetViewportX,
          top: targetViewportY,
        });
        if (coordsPos && coordsPos.pos > minPos + 12 && coordsPos.pos < maxPos - 12) {
          let candidate = coordsPos.pos;
          const doc = editor!.state.doc;
          for (let step = 0; step < 35 && candidate > minPos + 10; step++) {
            const ch = doc.textBetween(candidate - 1, candidate);
            if (ch === ' ' || ch === '\n') {
              return candidate;
            }
            candidate--;
          }
          return coordsPos.pos;
        }
      }
    } catch {
      // Fallback to ratio calculation
    }

    const availableHeight = Math.max(20, maxBottomDocPx - elTopDocPx - 6);
    const fitRatio = Math.max(0.16, Math.min(0.88, availableHeight / Math.max(1, elHeightDocPx)));
    return findParagraphSplitPos(node, nodeOffset, fitRatio);
  };

  const collectPaginatableElements = (editorDom: HTMLElement): HTMLElement[] => {
    const units: HTMLElement[] = [];
    const topChildren = Array.from(editorDom.children) as HTMLElement[];

    for (const child of topChildren) {
      const tag = child.tagName;
      if (tag === 'UL' || tag === 'OL') {
        const listItems = Array.from(child.children).filter(
          (el) => el.tagName === 'LI'
        ) as HTMLElement[];
        if (listItems.length > 0) {
          units.push(...listItems);
        } else {
          units.push(child);
        }
      } else {
        units.push(child);
      }
    }
    return units;
  };

  const recalculatePagination = useCallback(() => {
    if (!editor || !editor.view || !contentWrapperRef.current || isMutatingPaginationRef.current) return;
    const wrapper = contentWrapperRef.current;
    const editorDom = (editor.view.dom as HTMLElement) || (wrapper.querySelector('.ProseMirror, .tiptap') as HTMLElement | null);
    if (!editorDom) return;

    isMutatingPaginationRef.current = true;
    const pmDomObserver = (editor.view as any).domObserver;

    try {
      pmDomObserver?.stop?.();

      const resetAllPaginationOffsets = () => {
        const previouslyPaginated = Array.from(
          editorDom.querySelectorAll('[data-docium-paginated="true"]')
        ) as HTMLElement[];

        for (const el of previouslyPaginated) {
          const origMarginTop = el.getAttribute('data-space-before') || el.getAttribute('data-orig-margin-top');
          if (origMarginTop !== null && origMarginTop !== '') {
            el.style.marginTop = origMarginTop;
          } else {
            el.style.removeProperty('margin-top');
          }
          el.removeAttribute('data-docium-paginated');
          el.removeAttribute('data-orig-margin-top');

          if (
            el.classList.contains('docium-page-break') ||
            el.classList.contains('docium-section-break') ||
            el.getAttribute('data-type') === 'page-break'
          ) {
            el.style.height = '0px';
            el.style.marginTop = '0px';
            el.style.marginBottom = '0px';
          }
        }
      };

      resetAllPaginationOffsets();

      if (!isPaginatedView) {
        setPageCount(1);
        return;
      }

      const sheetEl = sheetStackRef.current || wrapper;
      const effScale = scale > 0 ? scale : 1;

      const measureRelativeBox = (el: HTMLElement) => {
        const sTop = sheetEl.getBoundingClientRect().top;
        const r = el.getBoundingClientRect();
        const top = (r.top - sTop) / effScale;
        const height = r.height / effScale;
        return { top, height, bottom: top + height };
      };

      const applyExactPushToTarget = (targetEl: HTMLElement, targetPrintableStart: number) => {
        const { top: currentTop } = measureRelativeBox(targetEl);
        const compMarginTop = parseFloat(window.getComputedStyle(targetEl).marginTop) || 0;
        const pushMarginTop = Math.max(
          0,
          Math.ceil(compMarginTop + (targetPrintableStart - currentTop))
        );

        targetEl.setAttribute('data-orig-margin-top', targetEl.getAttribute('data-space-before') || '');
        targetEl.setAttribute('data-docium-paginated', 'true');
        targetEl.style.setProperty('margin-top', `${pushMarginTop}px`, 'important');

        const { top: actualTopAfter } = measureRelativeBox(targetEl);
        const drift = targetPrintableStart - actualTopAfter;
        if (Math.abs(drift) > 0.5) {
          targetEl.style.setProperty(
            'margin-top',
            `${Math.max(0, Math.ceil(pushMarginTop + drift))}px`,
            'important'
          );
        }
      };

      // Merge any previously split continuation tables back together before re-paginating
      // so edits/reflows never leave fragmented table rows with gaps on the same page.
      if (!isSplittingRef.current && editor.state.schema.nodes.table) {
        const { doc: curDoc, schema: curSchema } = editor.state;
        const tblType = curSchema.nodes.table;
        const mergeCandidates: Array<{ from: number; to: number; mergedNode: any }> = [];
        const topNodes: Array<{ node: any; pos: number }> = [];
        curDoc.forEach((n, off) => topNodes.push({ node: n, pos: off }));

        let idx = 0;
        while (idx < topNodes.length) {
          const cur = topNodes[idx];
          if (cur.node.type === tblType) {
            let endIdx = idx;
            const collectedRows: any[] = [];
            cur.node.forEach((r: any) => collectedRows.push(r));
            while (
              endIdx + 1 < topNodes.length &&
              topNodes[endIdx + 1].node.type === tblType &&
              topNodes[endIdx + 1].node.attrs?.isContinuation
            ) {
              endIdx++;
              topNodes[endIdx].node.forEach((r: any) => collectedRows.push(r));
            }
            if (endIdx > idx) {
              const lastNode = topNodes[endIdx];
              const mergedTable = tblType.create(
                { ...cur.node.attrs, isContinuation: false },
                collectedRows
              );
              mergeCandidates.push({
                from: cur.pos,
                to: lastNode.pos + lastNode.node.nodeSize,
                mergedNode: mergedTable,
              });
            }
            idx = endIdx + 1;
          } else {
            idx++;
          }
        }

        if (mergeCandidates.length > 0) {
          isSplittingRef.current = true;
          try {
            pmDomObserver?.start?.();
            const tr = editor.state.tr.setMeta('addToHistory', false);
            for (let m = mergeCandidates.length - 1; m >= 0; m--) {
              const mc = mergeCandidates[m];
              tr.replaceWith(mc.from, mc.to, mc.mergedNode);
            }
            editor.view.dispatch(tr);
          } finally {
            pmDomObserver?.stop?.();
            isSplittingRef.current = false;
          }
        }
      }

      // Up to 32 passes for long multi-page documents; the final pass (allowSplit=false) guarantees
      // every block is pushed cleanly past footers/headers and pageCount is always updated.
      const MAX_SPLIT_PASSES = 32;

      for (let splitPass = 0; splitPass <= MAX_SPLIT_PASSES; splitPass++) {
        if (splitPass > 0) {
          resetAllPaginationOffsets();
        }
        const allowSplit = splitPass < MAX_SPLIT_PASSES && !isSplittingRef.current;
        let splitDispatchedInPass = false;

        const { doc, schema } = editor.state;
        const tableType = schema.nodes.table;
        const codeBlockType = schema.nodes.codeBlock;

        const domToPmNode = new Map<HTMLElement, { node: any; offset: number }>();
        const topDomChildren = Array.from(editorDom.children) as HTMLElement[];
        let childIdx = 0;
        doc.forEach((node, offset) => {
          const viaView = editor.view.nodeDOM(offset) as HTMLElement | null;
          const domNode = viaView && editorDom.contains(viaView) ? viaView : topDomChildren[childIdx];
          if (domNode) {
            domToPmNode.set(domNode, { node, offset });
          }
          childIdx++;
        });

        const units = collectPaginatableElements(editorDom);
        let currentPage = 0;

        for (let i = 0; i < units.length; i++) {
          const el = units[i];
          const isExplicitBreak =
            el.classList.contains('docium-page-break') ||
            el.classList.contains('docium-section-break') ||
            el.getAttribute('data-type') === 'page-break';

          const { top: elTop, height: elHeight, bottom: elBottom } = measureRelativeBox(el);

          if (isExplicitBreak) {
            const nextPagePrintableStart = (currentPage + 1) * pageStridePx + headerHeightPx;
            const jumpHeight = Math.max(0, Math.ceil(nextPagePrintableStart - elTop));
            el.setAttribute('data-docium-paginated', 'true');
            el.style.setProperty('display', 'block', 'important');
            el.style.setProperty('height', `${jumpHeight}px`, 'important');
            el.style.setProperty('margin-top', '0px', 'important');
            el.style.setProperty('margin-bottom', '0px', 'important');
            currentPage += 1;
            continue;
          }

          while (elTop >= (currentPage + 1) * pageStridePx + headerHeightPx - 2) {
            currentPage += 1;
          }

          const pagePrintableStart = currentPage * pageStridePx + headerHeightPx;
          const pagePrintableEnd = pagePrintableStart + pageContentHeightPx;
          const isHeading = /^H[1-6]$/.test(el.tagName);

          // Word "Keep with next" for Headings: if heading + minimal 36px of next block doesn't fit, push heading to next page
          let headingKeepWithNextOverflow = false;
          if (isHeading && i + 1 < units.length && elTop > pagePrintableStart + 24) {
            const nextEl = units[i + 1];
            const isNextBreak =
              nextEl.classList.contains('docium-page-break') ||
              nextEl.getAttribute('data-type') === 'page-break';
            if (!isNextBreak && elBottom + 44 > pagePrintableEnd) {
              headingKeepWithNextOverflow = true;
            }
          }

          const maxAllowedBottom = isHeading ? pagePrintableEnd - 36 : pagePrintableEnd - 2;

          if (elBottom > maxAllowedBottom || headingKeepWithNextOverflow) {
            const pmInfo = domToPmNode.get(el);

            // A. TABLE ROW BOUNDARY SPLIT (Word / Google Docs multi-page table flow)
            if (allowSplit && pmInfo && pmInfo.node.type.name === 'table' && tableType && pmInfo.node.childCount >= 2) {
              const trElements = Array.from(el.querySelectorAll('tr')) as HTMLElement[];
              if (trElements.length === pmInfo.node.childCount && elTop < pagePrintableEnd - 44) {
                let splitRowIndex = -1;
                for (let rIdx = 0; rIdx < trElements.length; rIdx++) {
                  const { bottom: rowBottom } = measureRelativeBox(trElements[rIdx]);
                  if (rowBottom > pagePrintableEnd - 4) {
                    splitRowIndex = rIdx;
                    break;
                  }
                }

                if (splitRowIndex >= 1 && splitRowIndex < trElements.length) {
                  const rows: any[] = [];
                  pmInfo.node.forEach((r: any) => rows.push(r));
                  const firstRows = rows.slice(0, splitRowIndex);
                  const secondRows = rows.slice(splitRowIndex);

                  if (firstRows.length > 0 && secondRows.length > 0) {
                    const t1 = tableType.create(pmInfo.node.attrs, firstRows);
                    const t2Attrs = {
                      ...pmInfo.node.attrs,
                      ...(tableType.spec.attrs?.isContinuation ? { isContinuation: true } : {}),
                    };
                    const t2 = tableType.create(t2Attrs, secondRows);
                    isSplittingRef.current = true;
                    try {
                      pmDomObserver?.start?.();
                      const tr = editor.state.tr
                        .replaceWith(pmInfo.offset, pmInfo.offset + pmInfo.node.nodeSize, [t1, t2])
                        .setMeta('addToHistory', false);
                      editor.view.dispatch(tr);
                    } finally {
                      pmDomObserver?.stop?.();
                      isSplittingRef.current = false;
                    }
                    splitDispatchedInPass = true;
                    break;
                  }
                }
              }
            }

            // B. PARAGRAPH LINE BOUNDARY SPLIT
            if (
              allowSplit &&
              pmInfo &&
              pmInfo.node.type.name === 'paragraph' &&
              elTop < pagePrintableEnd - 38 &&
              elHeight >= 42
            ) {
              const splitPos = findParagraphBoundarySplitPos(
                pmInfo.node,
                pmInfo.offset,
                el,
                sheetEl,
                elTop,
                elHeight,
                pagePrintableEnd,
                effScale
              );
              if (
                splitPos !== null &&
                splitPos > pmInfo.offset + 12 &&
                splitPos < pmInfo.offset + pmInfo.node.nodeSize - 12
              ) {
                isSplittingRef.current = true;
                try {
                  pmDomObserver?.start?.();
                  const tr = editor.state.tr.split(splitPos).setMeta('addToHistory', false);
                  editor.view.dispatch(tr);
                  splitDispatchedInPass = true;
                } catch {
                  // Fall through to block push
                } finally {
                  pmDomObserver?.stop?.();
                  isSplittingRef.current = false;
                }
                if (splitDispatchedInPass) break;
              }
            }

            // C. CODE BLOCK LINE BOUNDARY SPLIT
            if (
              allowSplit &&
              pmInfo &&
              pmInfo.node.type.name === 'codeBlock' &&
              codeBlockType &&
              elTop < pagePrintableEnd - 48
            ) {
              const text = pmInfo.node.textContent || '';
              const lines = text.split(/\r?\n/);
              const availableHeight = pagePrintableEnd - elTop - 24;
              const linesThatFit = Math.floor(availableHeight / 19);
              if (linesThatFit >= 2 && linesThatFit < lines.length) {
                const part1 = lines.slice(0, linesThatFit).join('\n');
                const part2 = lines.slice(linesThatFit).join('\n');
                const attrs = pmInfo.node.attrs || { language: 'plaintext' };
                const cb1 = codeBlockType.create(attrs, part1 ? schema.text(part1) : undefined);
                const cb2 = codeBlockType.create(attrs, part2 ? schema.text(part2) : undefined);
                isSplittingRef.current = true;
                try {
                  pmDomObserver?.start?.();
                  const tr = editor.state.tr
                    .replaceWith(pmInfo.offset, pmInfo.offset + pmInfo.node.nodeSize, [cb1, cb2])
                    .setMeta('addToHistory', false);
                  editor.view.dispatch(tr);
                } finally {
                  pmDomObserver?.stop?.();
                  isSplittingRef.current = false;
                }
                splitDispatchedInPass = true;
                break;
              }
            }

            // D. PUSH BLOCK TO NEXT PAGE'S PRINTABLE AREA
            if (elTop > pagePrintableStart + 4) {
              const targetPage = currentPage + 1;
              const targetPrintableStart = targetPage * pageStridePx + headerHeightPx;

              let targetEl = el;
              if (
                el.tagName === 'LI' &&
                el.parentElement &&
                (el.parentElement.tagName === 'UL' || el.parentElement.tagName === 'OL') &&
                el.parentElement.firstElementChild === el
              ) {
                const parentList = el.parentElement as HTMLElement;
                const { top: listTop } = measureRelativeBox(parentList);
                if (listTop > pagePrintableStart + 4) {
                  targetEl = parentList;
                }
              }

              applyExactPushToTarget(targetEl, targetPrintableStart);
              currentPage = targetPage;

              const { bottom: finalBottom } = measureRelativeBox(targetEl);
              while (finalBottom > (currentPage + 1) * pageStridePx - footerHeightPx) {
                currentPage += 1;
              }
            } else {
              while (elBottom > (currentPage + 1) * pageStridePx - footerHeightPx) {
                currentPage += 1;
              }
            }
          }
        }

        if (!splitDispatchedInPass) {
          const calculatedPages = Math.max(1, currentPage + 1);
          setPageCount((prev) => (prev !== calculatedPages ? calculatedPages : prev));
          break;
        }
      }
    } finally {
      pmDomObserver?.start?.();
      mutationObserverRef.current?.takeRecords();
      isMutatingPaginationRef.current = false;
    }
  }, [
    editor,
    isPaginatedView,
    pageContentHeightPx,
    pageStridePx,
    headerHeightPx,
    footerHeightPx,
    scale,
  ]);

  useEffect(() => {
    if (!editor || !contentWrapperRef.current) return;

    let rafId: number | null = null;
    const schedulePagination = () => {
      if (isMutatingPaginationRef.current) return;
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        recalculatePagination();
      });
    };

    schedulePagination();

    editor.on('update', schedulePagination);
    editor.on('transaction', schedulePagination);
    editor.on('selectionUpdate', schedulePagination);

    const resizeObserver = new ResizeObserver(() => {
      schedulePagination();
    });
    resizeObserver.observe(contentWrapperRef.current);

    const mutationObserver = new MutationObserver((mutations) => {
      if (isMutatingPaginationRef.current) return;
      const hasContentMutation = mutations.some((m) => {
        const t = m.target as HTMLElement | null;
        if (!t || typeof t.closest !== 'function') return true;
        return !t.closest('[data-docium-ui-only="true"], [data-textbox-ui="true"], [data-codeblock-ui="true"]');
      });
      if (hasContentMutation) {
        schedulePagination();
      }
    });
    mutationObserverRef.current = mutationObserver;
    mutationObserver.observe(contentWrapperRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      editor.off('update', schedulePagination);
      editor.off('transaction', schedulePagination);
      editor.off('selectionUpdate', schedulePagination);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      mutationObserverRef.current = null;
    };
  }, [
    editor,
    recalculatePagination,
    widthPx,
    heightPx,
    marginsPx.top,
    marginsPx.bottom,
    marginsPx.left,
    marginsPx.right,
    columns,
  ]);

  const startEditingHeader = (pageNumber: number) => {
    const isFirstPage = pageNumber === 1;
    const initialText =
      isFirstPage && differentFirstPage ? firstPageHeaderText : headerText;
    setDraftText(initialText || '');
    setDraftAlign(headerAlign || 'left');
    setEditingSection({ type: 'header', pageNumber });
    setTimeout(() => headerInputRef.current?.focus(), 50);
  };

  const startEditingFooter = (pageNumber: number) => {
    const isFirstPage = pageNumber === 1;
    const initialText =
      isFirstPage && differentFirstPage ? firstPageFooterText : footerText;
    setDraftText(initialText || '');
    setDraftAlign(footerAlign || 'left');
    setEditingSection({ type: 'footer', pageNumber });
    setTimeout(() => footerInputRef.current?.focus(), 50);
  };

  const handleCommitHeader = () => {
    if (!editingSection || editingSection.type !== 'header') return;
    const isFirstPage = editingSection.pageNumber === 1;

    if (isFirstPage && differentFirstPage) {
      if (onUpdateFirstPageHeaderText) onUpdateFirstPageHeaderText(draftText);
    } else {
      if (onUpdateHeaderText) onUpdateHeaderText(draftText);
    }
    if (onUpdateHeaderAlign) onUpdateHeaderAlign(draftAlign);
    setEditingSection(null);
  };

  const handleCommitFooter = () => {
    if (!editingSection || editingSection.type !== 'footer') return;
    const isFirstPage = editingSection.pageNumber === 1;

    if (isFirstPage && differentFirstPage) {
      if (onUpdateFirstPageFooterText) onUpdateFirstPageFooterText(draftText);
    } else {
      if (onUpdateFooterText) onUpdateFooterText(draftText);
    }
    if (onUpdateFooterAlign) onUpdateFooterAlign(draftAlign);
    setEditingSection(null);
  };

  const handleInsertPageToken = (format: 'page' | 'pages' | 'both') => {
    let token = '{page}';
    if (format === 'pages') token = '{pages}';
    if (format === 'both') token = 'Page {page} of {pages}';

    setDraftText((prev) => (prev ? `${prev} • ${token}` : token));
  };

  const columnStyle: React.CSSProperties = {
    columnCount: columns > 1 ? columns : undefined,
    columnGap: columns > 1 ? '28px' : undefined,
    columnRule: columns > 1 ? '1px solid #d1d5db' : undefined,
  };

  const getPageBorderOverlayStyle = (): React.CSSProperties | null => {
    if (!pageBorder || pageBorder === 'none') return null;
    const color = pageBorderColor || '#1e293b';
    const w = Math.max(1, Math.min(6, pageBorderWidth || 1));

    const insetStyles: React.CSSProperties =
      pageBorderOffset === 'margin'
        ? {
            top: `${Math.max(14, marginsPx.top - 12)}px`,
            bottom: `${Math.max(14, marginsPx.bottom - 12)}px`,
            left: `${Math.max(14, marginsPx.left - 12)}px`,
            right: `${Math.max(14, marginsPx.right - 12)}px`,
          }
        : pageBorderOffset === 'wide'
        ? { top: '12px', left: '12px', right: '12px', bottom: '12px' }
        : { top: '20px', left: '20px', right: '20px', bottom: '20px' };

    const base: React.CSSProperties = {
      position: 'absolute',
      ...insetStyles,
      pointerEvents: 'none',
      boxSizing: 'border-box',
    };

    if (pageBorder === 'box') {
      return { ...base, border: `${w}px solid ${color}` };
    }
    if (pageBorder === 'shadow') {
      return { ...base, border: `${w}px solid ${color}`, boxShadow: '3px 3px 0px rgba(15,23,42,0.24)' };
    }
    if (pageBorder === 'double') {
      return { ...base, border: `${Math.max(3, w + 2)}px double ${color}` };
    }
    if (pageBorder === 'accent') {
      return { ...base, border: `${Math.max(2, w)}px solid ${color}`, borderRadius: '2px' };
    }
    return null;
  };

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
            backgroundColor: effectivePaperBg,
          }}
          className="w-full flex flex-col justify-end pb-2 border-b border-dashed border-[#245c45] text-xs shrink-0 transition-all select-none pointer-events-auto text-[#171c19]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center justify-between pb-1.5 mb-1 border-b border-gray-200"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#245c45] font-bold bg-[#eaf2ed] px-1.5 py-0.5 rounded">
                {isFirstPage && differentFirstPage ? 'Header (First Page)' : 'Header'}
              </span>

              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded border border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setDraftAlign('left');
                    onUpdateHeaderAlign?.('left');
                  }}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'left' ? 'bg-[#eaf2ed] text-[#245c45]' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftAlign('center');
                    onUpdateHeaderAlign?.('center');
                  }}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'center' ? 'bg-[#eaf2ed] text-[#245c45]' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title="Align Center"
                >
                  <AlignCenter className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftAlign('right');
                    onUpdateHeaderAlign?.('right');
                  }}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'right' ? 'bg-[#eaf2ed] text-[#245c45]' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="h-3 w-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleInsertPageToken('both')}
                className="flex items-center gap-1 text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-800 hover:bg-gray-50 cursor-pointer"
                title="Insert Page Number Placeholder"
              >
                <Hash className="h-3 w-3 text-[#245c45]" />
                <span>+ Page Number</span>
              </button>

              {onToggleDifferentFirstPage && (
                <button
                  type="button"
                  onClick={onToggleDifferentFirstPage}
                  className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                    differentFirstPage
                      ? 'bg-[#eaf2ed] border-[#245c45] text-[#245c45] font-medium'
                      : 'bg-white border-gray-200 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Different First Page
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCommitHeader}
              className="flex items-center gap-1 text-[11px] bg-[#245c45] text-white px-2.5 py-0.5 rounded hover:bg-[#1c4836] font-medium cursor-pointer shadow-2xs"
            >
              <Check className="h-3 w-3" />
              <span>Done (Esc)</span>
            </button>
          </div>

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
            placeholder="Type header text..."
            style={{ textAlign: draftAlign }}
            className="w-full bg-transparent text-xs text-[#171c19] outline-none font-medium placeholder:text-gray-400 px-1"
          />
        </div>
      );
    }

    return (
      <div
        style={{
          height: `${headerHeightPx}px`,
          paddingLeft: `${marginsPx.left}px`,
          paddingRight: `${marginsPx.right}px`,
          backgroundColor: effectivePaperBg,
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditingHeader(pageNumber);
        }}
        className={`w-full flex items-end pb-2.5 text-[9.5pt] text-[#6b7280] select-none shrink-0 cursor-text transition-colors pointer-events-auto ${
          hasHeaderContent ? 'border-b border-gray-200/80' : 'border-b border-transparent'
        }`}
      >
        <div
          style={{ textAlign: headerAlign }}
          className="w-full relative flex items-center"
        >
          {hasHeaderContent ? (
            <span
              style={{
                width: '100%',
                textAlign: headerAlign,
              }}
              className="truncate block"
            >
              {resolvedText}
            </span>
          ) : (
            <span className="w-full" />
          )}

          {isFirstPage && differentFirstPage && hasHeaderContent && (
            <span className="text-[8px] font-mono uppercase bg-gray-100 px-1 rounded text-gray-500 ml-2 shrink-0">
              First Page
            </span>
          )}
        </div>
      </div>
    );
  };

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
            backgroundColor: effectivePaperBg,
          }}
          className="w-full flex flex-col justify-start pt-2 border-t border-dashed border-[#245c45] text-xs shrink-0 transition-all select-none pointer-events-auto text-[#171c19]"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="flex items-center justify-between pb-1.5 mb-1 border-b border-gray-200"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#245c45] font-bold bg-[#eaf2ed] px-1.5 py-0.5 rounded">
                {isFirstPage && differentFirstPage ? 'Footer (First Page)' : 'Footer'}
              </span>

              <div className="flex items-center gap-0.5 bg-white p-0.5 rounded border border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setDraftAlign('left');
                    onUpdateFooterAlign?.('left');
                  }}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'left' ? 'bg-[#eaf2ed] text-[#245c45]' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title="Align Left"
                >
                  <AlignLeft className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftAlign('center');
                    onUpdateFooterAlign?.('center');
                  }}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'center' ? 'bg-[#eaf2ed] text-[#245c45]' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title="Align Center"
                >
                  <AlignCenter className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftAlign('right');
                    onUpdateFooterAlign?.('right');
                  }}
                  className={`p-1 rounded cursor-pointer ${
                    draftAlign === 'right' ? 'bg-[#eaf2ed] text-[#245c45]' : 'text-gray-500 hover:text-gray-900'
                  }`}
                  title="Align Right"
                >
                  <AlignRight className="h-3 w-3" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleInsertPageToken('both')}
                className="flex items-center gap-1 text-[10px] bg-white border border-gray-200 px-1.5 py-0.5 rounded text-gray-800 hover:bg-gray-50 cursor-pointer"
                title="Insert Page Number Placeholder"
              >
                <Hash className="h-3 w-3 text-[#245c45]" />
                <span>+ Page Number</span>
              </button>

              {onToggleDifferentFirstPage && (
                <button
                  type="button"
                  onClick={onToggleDifferentFirstPage}
                  className={`text-[10px] px-1.5 py-0.5 rounded border cursor-pointer transition-colors ${
                    differentFirstPage
                      ? 'bg-[#eaf2ed] border-[#245c45] text-[#245c45] font-medium'
                      : 'bg-white border-gray-200 text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Different First Page
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleCommitFooter}
              className="flex items-center gap-1 text-[11px] bg-[#245c45] text-white px-2.5 py-0.5 rounded hover:bg-[#1c4836] font-medium cursor-pointer shadow-2xs"
            >
              <Check className="h-3 w-3" />
              <span>Done (Esc)</span>
            </button>
          </div>

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
            placeholder="Type footer text..."
            style={{ textAlign: draftAlign }}
            className="w-full bg-transparent text-xs text-[#171c19] outline-none font-medium placeholder:text-gray-400 px-1"
          />
        </div>
      );
    }

    return (
      <div
        style={{
          height: `${footerHeightPx}px`,
          paddingLeft: `${marginsPx.left}px`,
          paddingRight: `${marginsPx.right}px`,
          backgroundColor: effectivePaperBg,
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditingFooter(pageNumber);
        }}
        className={`w-full flex items-start pt-2.5 text-[9.5pt] text-[#6b7280] select-none shrink-0 cursor-text transition-colors pointer-events-auto ${
          hasFooterContent || showPageNumbers ? 'border-t border-gray-200/80' : 'border-t border-transparent'
        }`}
      >
        <div className="w-full flex items-center justify-between gap-2">
          <div
            style={{ textAlign: footerAlign }}
            className="truncate flex-1 min-w-0"
          >
            {hasFooterContent ? <span>{resolvedText}</span> : null}
          </div>

          {showPageNumbers && !currentText.includes('{page}') && (
            <span className="font-sans text-[9.5pt] text-[#6b7280] shrink-0">
              Page {pageNumber} of {pageCount}
            </span>
          )}
        </div>
      </div>
    );
  };

  const totalPaginatedHeightPx =
    pageCount * heightPx + Math.max(0, pageCount - 1) * PAGE_GAP_PX;
  const pageBorderStyle = getPageBorderOverlayStyle();

  return (
    <div
      ref={containerRef}
      style={{ overflowAnchor: 'none' }}
      onContextMenu={onContextMenu}
      onClick={() => {
        if (editingSection) {
          if (editingSection.type === 'header') handleCommitHeader();
          if (editingSection.type === 'footer') handleCommitFooter();
        }
      }}
      className={`flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 bg-[var(--background)] transition-colors select-text ${
        showFormattingMarks ? 'show-formatting-marks' : ''
      }`}
    >
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
            <div
              id="docium-paginated-sheet"
              ref={sheetStackRef}
              style={{
                width: `${widthPx}px`,
                minHeight: `${totalPaginatedHeightPx}px`,
                overflowAnchor: 'none',
              }}
              className="relative"
            >
              {/* Layer 1 (z-0): Physical WYSIWYG Paper Sheets, Watermark, and Page Borders */}
              <div className="absolute inset-0 z-0 pointer-events-none">
                {Array.from({ length: pageCount }).map((_, idx) => {
                  const pageNumber = idx + 1;
                  const topPx = idx * pageStridePx;
                  return (
                    <div
                      key={`sheet-bg-${pageNumber}`}
                      id={pageNumber === 1 ? 'docium-page-1' : undefined}
                      data-page-number={pageNumber}
                      style={{
                        position: 'absolute',
                        top: `${topPx}px`,
                        left: 0,
                        width: `${widthPx}px`,
                        height: `${heightPx}px`,
                        backgroundColor: effectivePaperBg,
                      }}
                      className="page-sheet docium-paper-sheet border border-[#d4d8d2] rounded-[2px] shadow-[0_2px_12px_rgba(0,0,0,0.08)] overflow-hidden"
                    >
                      {watermarkText && watermarkText.trim() && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                          <span
                            style={{
                              transform: 'rotate(-38deg)',
                              fontSize: `${Math.max(42, Math.min(84, Math.floor(620 / Math.max(4, watermarkText.length))))}pt`,
                              fontWeight: 800,
                              letterSpacing: '0.12em',
                              color: 'rgba(36, 92, 69, 0.085)',
                              whiteSpace: 'nowrap',
                              textTransform: 'uppercase',
                            }}
                          >
                            {watermarkText}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Layer 2: Continuous ProseMirror Content Layer (no z-index stacking context so active node toolbars/borders sit above Header z-10) */}
              <div
                ref={contentWrapperRef}
                style={{
                  paddingTop: `${headerHeightPx}px`,
                  paddingBottom: `${footerHeightPx}px`,
                  paddingLeft: `${marginsPx.left}px`,
                  paddingRight: `${marginsPx.right}px`,
                  minHeight: `${totalPaginatedHeightPx}px`,
                  color: '#171c19',
                  ...columnStyle,
                }}
                className="relative docium-paper-content"
              >
                <EditorContent editor={editor} />
              </div>

              {/* Layer 3 (z-10): Physical Page Headers, Footers & Inter-Page Split Desk Masks */}
              <div className="absolute inset-0 z-10 pointer-events-none">
                {Array.from({ length: pageCount }).map((_, idx) => {
                  const pageNumber = idx + 1;
                  const pageTopPx = idx * pageStridePx;
                  const footerTopPx = pageTopPx + heightPx - footerHeightPx;
                  const gapTopPx = pageTopPx + heightPx;

                  return (
                    <React.Fragment key={`sheet-chrome-${pageNumber}`}>
                      <div
                        style={{
                          position: 'absolute',
                          top: `${pageTopPx}px`,
                          left: '1px',
                          width: `${widthPx - 2}px`,
                          height: `${headerHeightPx}px`,
                        }}
                        className="overflow-hidden"
                      >
                        {renderHeaderArea(pageNumber)}
                      </div>

                      <div
                        style={{
                          position: 'absolute',
                          top: `${footerTopPx}px`,
                          left: '1px',
                          width: `${widthPx - 2}px`,
                          height: `${footerHeightPx}px`,
                        }}
                        className="overflow-hidden"
                      >
                        {renderFooterArea(pageNumber)}
                      </div>

                      {pageBorderStyle && (
                        <div
                          style={{
                            position: 'absolute',
                            top: `${pageTopPx}px`,
                            left: 0,
                            width: `${widthPx}px`,
                            height: `${heightPx}px`,
                            pointerEvents: 'none',
                          }}
                        >
                          <div style={pageBorderStyle} />
                        </div>
                      )}

                      {idx < pageCount - 1 && (
                        <div
                          style={{
                            position: 'absolute',
                            top: `${gapTopPx - 1}px`,
                            left: '-16px',
                            width: `${widthPx + 32}px`,
                            height: `${PAGE_GAP_PX + 2}px`,
                          }}
                          className="bg-[var(--background)] flex flex-col justify-between pointer-events-none print:hidden"
                        >
                          <div
                            style={{ width: `${widthPx}px`, margin: '0 auto' }}
                            className="h-[1px] bg-[#d4d8d2] shadow-xs"
                          />
                          <div
                            style={{ width: `${widthPx}px`, margin: '0 auto' }}
                            className="h-[1px] bg-[#d4d8d2]"
                          />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              id="docium-page-1"
              style={{
                width: `${widthPx}px`,
                minHeight: '1000px',
                backgroundColor: effectivePaperBg,
              }}
              className="page-sheet docium-paper-sheet border border-[#d4d8d2] rounded-[2px] shadow-md flex flex-col justify-between overflow-hidden relative"
            >
              {watermarkText && watermarkText.trim() && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                  <span
                    style={{
                      transform: 'rotate(-38deg)',
                      fontSize: '64pt',
                      fontWeight: 800,
                      letterSpacing: '0.12em',
                      color: 'rgba(36, 92, 69, 0.085)',
                      whiteSpace: 'nowrap',
                      textTransform: 'uppercase',
                    }}
                  >
                    {watermarkText}
                  </span>
                </div>
              )}
              {renderHeaderArea(1)}

              <div
                ref={contentWrapperRef}
                style={{
                  paddingLeft: `${marginsPx.left}px`,
                  paddingRight: `${marginsPx.right}px`,
                  color: '#171c19',
                  ...columnStyle,
                }}
                className="flex-1 docium-paper-content relative"
              >
                <EditorContent editor={editor} />
              </div>

              {renderFooterArea(1)}
              {pageBorderStyle && <div style={pageBorderStyle} />}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        .show-formatting-marks p::after {
          content: ' ¶';
          color: #9ca3af;
          opacity: 0.6;
          font-family: monospace;
          font-size: 10pt;
        }
        .show-formatting-marks h1::after,
        .show-formatting-marks h2::after,
        .show-formatting-marks h3::after,
        .show-formatting-marks h4::after {
          content: ' ¶';
          color: #9ca3af;
          opacity: 0.5;
          font-family: monospace;
        }

        .docium-page-break {
          user-select: none;
          width: 100%;
          pointer-events: none;
          opacity: 0;
        }

        @media print {
          .docium-page-break {
            page-break-before: always;
            break-before: page;
            height: 0 !important;
            margin: 0 !important;
            overflow: hidden;
          }
        }
      `}</style>
    </div>
  );
}

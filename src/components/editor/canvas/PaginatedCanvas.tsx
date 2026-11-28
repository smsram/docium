'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { type Editor, EditorContent } from '@tiptap/react';
import { canJoin, canSplit } from '@tiptap/pm/transform';
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
  showHeaderLine?: boolean;
  showFooterLine?: boolean;
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
  showHeaderLine = false,
  showFooterLine = false,
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
  const [isPrinting, setIsPrinting] = useState(false);

  const [editingSection, setEditingSection] = useState<{
    type: 'header' | 'footer';
    pageNumber: number;
  } | null>(null);

  const [draftText, setDraftText] = useState('');
  const [draftAlign, setDraftAlign] = useState<'left' | 'center' | 'right'>('left');

  const { widthPx, heightPx, marginsPx } = pageDimensions;
  const scale = isPrinting ? 1 : zoomLevel / 100;

  const headerHeightPx = Math.max(36, marginsPx.top);
  const footerHeightPx = Math.max(36, marginsPx.bottom);

  const pageContentHeightPx = Math.max(
    260,
    heightPx - headerHeightPx - footerHeightPx
  );

  const activeGapPx = isPrinting ? 0 : PAGE_GAP_PX;
  const pageStridePx = heightPx + activeGapPx;
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
      // using structural tr.join() so prosemirror-history steps inside table cells remain intact for Undo/Redo.
      if (!isSplittingRef.current && editor.state.schema.nodes.table) {
        const { doc: curDoc, schema: curSchema } = editor.state;
        const tblType = curSchema.nodes.table;
        const joinPositions: number[] = [];
        const topNodes: Array<{ node: any; pos: number }> = [];
        curDoc.forEach((n, off) => topNodes.push({ node: n, pos: off }));

        for (let idx = 0; idx < topNodes.length - 1; idx++) {
          const cur = topNodes[idx];
          const next = topNodes[idx + 1];
          if (
            cur.node.type === tblType &&
            next.node.type === tblType &&
            next.node.attrs?.isContinuation
          ) {
            joinPositions.push(next.pos);
          }
        }

        if (joinPositions.length > 0) {
          isSplittingRef.current = true;
          try {
            pmDomObserver?.start?.();
            const tr = editor.state.tr.setMeta('addToHistory', false);
            let didJoin = false;
            for (let j = joinPositions.length - 1; j >= 0; j--) {
              const joinPos = joinPositions[j];
              if (canJoin(tr.doc, joinPos)) {
                tr.join(joinPos, 1);
                didJoin = true;
              }
            }
            if (didJoin) {
              editor.view.dispatch(tr);
            }
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
          const isHr = el.tagName === 'HR';

          // Word "Keep with next" for Headings and Horizontal Rules: if heading/hr + minimal 48px of next block doesn't fit, push to next page
          let headingKeepWithNextOverflow = false;
          if ((isHeading || isHr) && i + 1 < units.length && elTop > pagePrintableStart + 24) {
            const nextEl = units[i + 1];
            const isNextBreak =
              nextEl.classList.contains('docium-page-break') ||
              nextEl.getAttribute('data-type') === 'page-break';
            if (!isNextBreak && elBottom + 48 > pagePrintableEnd) {
              headingKeepWithNextOverflow = true;
            }
          }

          const maxAllowedBottom = isHeading || isHr ? pagePrintableEnd - 36 : pagePrintableEnd - 2;

          if (elBottom > maxAllowedBottom || headingKeepWithNextOverflow) {
            const pmInfo = domToPmNode.get(el);

            // A. TABLE ROW BOUNDARY SPLIT (Word / Google Docs multi-page table flow; reversibly rejoined at pass start)
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
                  let rowBoundaryOffset = 1;
                  let rCursor = 0;
                  pmInfo.node.forEach((r: any) => {
                    if (rCursor < splitRowIndex) {
                      rowBoundaryOffset += r.nodeSize;
                    }
                    rCursor++;
                  });
                  const rowBoundaryPos = pmInfo.offset + rowBoundaryOffset;
                  const t2Attrs = {
                    ...pmInfo.node.attrs,
                    ...(tableType.spec.attrs?.isContinuation ? { isContinuation: true } : {}),
                  };
                  const splitTypes = [{ type: tableType, attrs: t2Attrs }];
                  if (canSplit(editor.state.doc, rowBoundaryPos, 1, splitTypes)) {
                    isSplittingRef.current = true;
                    try {
                      pmDomObserver?.start?.();
                      const tr = editor.state.tr
                        .split(rowBoundaryPos, 1, splitTypes)
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

            // B. PUSH BLOCK TO NEXT PAGE'S PRINTABLE AREA (Non-destructive CSS margin push; preserves paragraph/codeBlock integrity)
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

  const printStateRef = useRef({
    isPaginatedView,
    pageCount,
    widthPx,
    heightPx,
    pageStridePx,
    headerHeightPx,
    footerHeightPx,
    pageContentHeightPx,
    effectivePaperBg,
    marginsLeftPx: marginsPx.left,
    marginsRightPx: marginsPx.right,
    columnCount: columns > 1 ? columns : 1,
    scale,
  });
  printStateRef.current = {
    isPaginatedView,
    pageCount,
    widthPx,
    heightPx,
    pageStridePx,
    headerHeightPx,
    footerHeightPx,
    pageContentHeightPx,
    effectivePaperBg,
    marginsLeftPx: marginsPx.left,
    marginsRightPx: marginsPx.right,
    columnCount: columns > 1 ? columns : 1,
    scale,
  };

  // Synchronously assemble clean, non-transformed per-page vector print sheets in document.body on Ctrl+P / window.print()
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const cleanupPrintPortal = () => {
      document.body.classList.remove('docium-printing');
      document.getElementById('docium-print-pages')?.remove();
    };

    const sanitizePrintSubtree = (srcEl: HTMLElement, cloneEl: HTMLElement, isFirstOnPage: boolean) => {
      cloneEl
        .querySelectorAll(
          '[data-docium-ui-only="true"], [data-codeblock-ui="true"], .docium-page-break, .docium-section-break, [data-type="page-break"], .ProseMirror-separator, .ProseMirror-trailingBreak'
        )
        .forEach((el) => el.remove());

      const clearPaginatedNode = (node: HTMLElement) => {
        if (node.getAttribute('data-docium-paginated') === 'true') {
          node.removeAttribute('data-docium-paginated');
          node.style.removeProperty('margin-top');
          node.style.removeProperty('margin-bottom');
          node.style.removeProperty('height');
          node.style.removeProperty('display');
        }
        node.removeAttribute('contenteditable');
        node.classList.remove('docium-find-match', 'docium-find-match-active', 'ProseMirror-selectednode');
      };

      clearPaginatedNode(cloneEl);
      cloneEl.querySelectorAll('*').forEach((child) => {
        if (child instanceof HTMLElement) {
          clearPaginatedNode(child);
        }
      });

      if (isFirstOnPage) {
        cloneEl.style.marginTop = '0px';
      }

      // Preserve canvas pixel drawings into <img> so printed charts/canvases never vanish
      const srcCanvases = srcEl.querySelectorAll('canvas');
      const dstCanvases = cloneEl.querySelectorAll('canvas');
      srcCanvases.forEach((srcCanvas, idx) => {
        const dstCanvas = dstCanvases[idx];
        if (!dstCanvas || !dstCanvas.parentNode) return;
        try {
          const dataUrl = srcCanvas.toDataURL('image/png');
          const img = document.createElement('img');
          img.src = dataUrl;
          img.className = dstCanvas.className;
          img.style.cssText = dstCanvas.style.cssText;
          const cr = srcCanvas.getBoundingClientRect();
          if (cr.width > 0) img.style.width = `${cr.width}px`;
          if (cr.height > 0) img.style.height = `${cr.height}px`;
          dstCanvas.parentNode.replaceChild(img, dstCanvas);
        } catch {
          // ignore tainted canvases
        }
      });

      return cloneEl;
    };

    const handleBeforePrint = () => {
      flushSync(() => {
        setEditingSection(null);
      });

      cleanupPrintPortal();
      const cfg = printStateRef.current;
      const contentEl = contentWrapperRef.current;
      if (!contentEl) return;

      const editorDom = (contentEl.querySelector('.tiptap') as HTMLElement | null) || contentEl;
      const effScale = cfg.scale || 1;
      const sheetStackEl = sheetStackRef.current;
      const refEl = cfg.isPaginatedView && sheetStackEl ? sheetStackEl : contentEl;
      const refRect = refEl.getBoundingClientRect();

      const getRelTop = (el: HTMLElement) => (el.getBoundingClientRect().top - refRect.top) / effScale;

      const totalPagesPrint =
        cfg.isPaginatedView && sheetStackEl
          ? cfg.pageCount
          : Math.max(1, Math.ceil(Math.max(editorDom.scrollHeight, cfg.pageContentHeightPx) / cfg.pageContentHeightPx));

      const pageBucketNodes: HTMLElement[][] = Array.from({ length: totalPagesPrint }, () => []);

      const resolvePageIndex = (relTop: number): number => {
        if (cfg.isPaginatedView) {
          return Math.max(0, Math.min(totalPagesPrint - 1, Math.floor((relTop + 6) / cfg.pageStridePx)));
        }
        return Math.max(0, Math.min(totalPagesPrint - 1, Math.floor((relTop + 6) / cfg.pageContentHeightPx)));
      };

      Array.from(editorDom.children).forEach((child) => {
        const el = child as HTMLElement;
        if (
          el.classList.contains('docium-page-break') ||
          el.classList.contains('docium-section-break') ||
          el.getAttribute('data-type') === 'page-break'
        ) {
          return;
        }

        if (el.tagName === 'UL' || el.tagName === 'OL') {
          const directLis = Array.from(el.children).filter((c) => c.tagName === 'LI') as HTMLElement[];
          if (directLis.length > 0) {
            const perPageLis = new Map<number, HTMLElement[]>();
            let firstListPage = totalPagesPrint;
            directLis.forEach((li) => {
              const pIdx = resolvePageIndex(getRelTop(li));
              if (pIdx < firstListPage) firstListPage = pIdx;
              const arr = perPageLis.get(pIdx) || [];
              arr.push(li);
              perPageLis.set(pIdx, arr);
            });

            if (perPageLis.size > 1) {
              const origStart = el.tagName === 'OL' ? parseInt(el.getAttribute('start') || '1', 10) || 1 : 1;
              let cumulativeOffset = 0;
              const sortedPages = Array.from(perPageLis.keys()).sort((a, b) => a - b);
              for (const pIdx of sortedPages) {
                const groupLis = perPageLis.get(pIdx) || [];
                const shell = el.cloneNode(false) as HTMLElement;
                if (el.tagName === 'OL' && cumulativeOffset > 0) {
                  shell.setAttribute('start', String(origStart + cumulativeOffset));
                }
                groupLis.forEach((li) => {
                  shell.appendChild(li.cloneNode(true));
                });
                const isFirstOnPage = pageBucketNodes[pIdx].length === 0;
                pageBucketNodes[pIdx].push(sanitizePrintSubtree(el, shell, isFirstOnPage));
                cumulativeOffset += groupLis.length;
              }
              return;
            }
          }
        }

        const pIdx = resolvePageIndex(getRelTop(el));
        const isFirstOnPage = pageBucketNodes[pIdx].length === 0;
        const clonedChild = el.cloneNode(true) as HTMLElement;
        pageBucketNodes[pIdx].push(sanitizePrintSubtree(el, clonedChild, isFirstOnPage));
      });

      const wMm = (cfg.widthPx * 25.4) / 96;
      const hMm = (cfg.heightPx * 25.4) / 96;

      let styleEl = document.getElementById('docium-print-page-styles') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'docium-print-page-styles';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `
        @media print {
          @page {
            size: ${wMm.toFixed(2)}mm ${hMm.toFixed(2)}mm;
            margin: 0 !important;
          }
        }
      `;

      const portal = document.createElement('div');
      portal.id = 'docium-print-pages';
      const contPage = document.getElementById('docium-page-1');

      for (let idx = 0; idx < totalPagesPrint; idx++) {
        const pageNumber = idx + 1;
        const pageDiv = document.createElement('div');
        pageDiv.className = 'docium-print-page';
        pageDiv.style.width = `${wMm.toFixed(2)}mm`;
        pageDiv.style.height = `${hMm.toFixed(2)}mm`;
        pageDiv.style.backgroundColor = cfg.effectivePaperBg;
        pageDiv.style.position = 'relative';
        pageDiv.style.overflow = 'hidden';
        pageDiv.style.display = 'flex';
        pageDiv.style.flexDirection = 'column';
        pageDiv.style.justifyContent = 'flex-start';

        // Layer 0 (behind text): Background & Watermark
        const srcSheet =
          cfg.isPaginatedView && sheetStackEl
            ? (sheetStackEl.querySelector(`[data-page-number="${pageNumber}"]`) as HTMLElement | null)
            : contPage;
        if (srcSheet) {
          const wmCloneRoot = document.createElement('div');
          wmCloneRoot.style.position = 'absolute';
          wmCloneRoot.style.inset = '0';
          wmCloneRoot.style.zIndex = '0';
          wmCloneRoot.style.pointerEvents = 'none';
          const wmSpan = srcSheet.querySelector('span[style*="rotate("]');
          if (wmSpan?.parentElement) {
            wmCloneRoot.appendChild(wmSpan.parentElement.cloneNode(true));
          }
          pageDiv.appendChild(wmCloneRoot);
        }

        // Layer 1 (behind selectable text): Page Border
        const srcBorder =
          cfg.isPaginatedView && sheetStackEl
            ? (sheetStackEl.querySelector(`[data-print-border="${pageNumber}"]`) as HTMLElement | null)
            : (contPage?.querySelector('[data-print-border="1"]') as HTMLElement | null);
        if (srcBorder) {
          const bClone = srcBorder.cloneNode(true) as HTMLElement;
          bClone.style.position = 'absolute';
          bClone.style.top = '0';
          bClone.style.left = '0';
          bClone.style.width = '100%';
          bClone.style.height = '100%';
          bClone.style.zIndex = '1';
          bClone.style.pointerEvents = 'none';
          pageDiv.appendChild(bClone);
        }

        // Normal-flow Header (zIndex 2)
        const srcHeader =
          cfg.isPaginatedView && sheetStackEl
            ? (sheetStackEl.querySelector(`[data-print-header="${pageNumber}"]`) as HTMLElement | null)
            : (contPage?.querySelector('[data-print-header="1"]') as HTMLElement | null);
        if (srcHeader) {
          const hClone = srcHeader.cloneNode(true) as HTMLElement;
          hClone.style.position = 'relative';
          hClone.style.top = '';
          hClone.style.left = '';
          hClone.style.width = '100%';
          hClone.style.height = `${cfg.headerHeightPx}px`;
          hClone.style.flex = '0 0 auto';
          hClone.style.zIndex = '2';
          pageDiv.appendChild(hClone);
        }

        // Normal-flow Vector Selectable Body (ZERO CSS transform, ZERO overlapping clip mask)
        const bodyWrap = document.createElement('div');
        bodyWrap.className = 'docium-paper-content docium-print-body';
        bodyWrap.style.flex = '1 1 auto';
        bodyWrap.style.minHeight = '0';
        bodyWrap.style.overflow = 'hidden';
        bodyWrap.style.position = 'relative';
        bodyWrap.style.zIndex = '2';
        bodyWrap.style.paddingLeft = `${cfg.marginsLeftPx}px`;
        bodyWrap.style.paddingRight = `${cfg.marginsRightPx}px`;
        bodyWrap.style.color = '#171c19';
        if (cfg.columnCount > 1) {
          bodyWrap.style.columnCount = String(cfg.columnCount);
          bodyWrap.style.columnGap = '28px';
          bodyWrap.style.columnRule = '1px solid #d1d5db';
        }

        const tiptapInner = document.createElement('div');
        tiptapInner.className = 'tiptap';
        for (const nodeEl of pageBucketNodes[idx]) {
          tiptapInner.appendChild(nodeEl);
        }
        bodyWrap.appendChild(tiptapInner);
        pageDiv.appendChild(bodyWrap);

        // Normal-flow Footer (zIndex 2)
        const srcFooter =
          cfg.isPaginatedView && sheetStackEl
            ? (sheetStackEl.querySelector(`[data-print-footer="${pageNumber}"]`) as HTMLElement | null)
            : (contPage?.querySelector('[data-print-footer="1"]') as HTMLElement | null);
        if (srcFooter) {
          const fClone = srcFooter.cloneNode(true) as HTMLElement;
          fClone.style.position = 'relative';
          fClone.style.top = '';
          fClone.style.left = '';
          fClone.style.width = '100%';
          fClone.style.height = `${cfg.footerHeightPx}px`;
          fClone.style.flex = '0 0 auto';
          fClone.style.zIndex = '2';
          pageDiv.appendChild(fClone);
        }

        portal.appendChild(pageDiv);
      }

      if (portal.childElementCount > 0) {
        document.body.appendChild(portal);
        document.body.classList.add('docium-printing');
      }
    };

    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', cleanupPrintPortal);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', cleanupPrintPortal);
      cleanupPrintPortal();
    };
  }, []);

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
        className="w-full flex items-end pb-1 text-[9.5pt] text-[#6b7280] select-none shrink-0 cursor-text transition-colors pointer-events-auto"
      >
        <div
          style={{ textAlign: headerAlign }}
          className={`w-full relative flex items-center pb-1.5 transition-colors ${
            showHeaderLine && hasHeaderContent ? 'border-b border-gray-200/80' : 'border-b border-transparent'
          }`}
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
        className="w-full flex items-start pt-1 text-[9.5pt] text-[#6b7280] select-none shrink-0 cursor-text transition-colors pointer-events-auto"
      >
        <div
          className={`w-full flex items-center justify-between gap-2 pt-1.5 transition-colors ${
            showFooterLine && (hasFooterContent || showPageNumbers) ? 'border-t border-gray-200/80' : 'border-t border-transparent'
          }`}
        >
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
    pageCount * heightPx + Math.max(0, pageCount - 1) * activeGapPx;
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
      className={`docium-canvas-scroller flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 bg-[var(--background)] transition-colors select-text ${
        showFormattingMarks ? 'show-formatting-marks' : ''
      }`}
    >
      <div
        style={{
          width: `${Math.round(widthPx * scale)}px`,
          minWidth: `${Math.round(widthPx * scale)}px`,
          margin: '0 auto',
          padding: isPrinting ? '0' : '16px 0',
        }}
        className="docium-zoom-frame flex flex-col items-center"
      >
        <div
          style={{
            width: `${widthPx}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            transition: 'transform 0.15s ease-out',
          }}
          className="docium-zoom-scaler flex flex-col items-center"
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
                        data-print-header={pageNumber}
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
                        data-print-footer={pageNumber}
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
                          data-print-border={pageNumber}
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

                      {!isPrinting && idx < pageCount - 1 && (
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
              <div data-print-header="1">{renderHeaderArea(1)}</div>

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

              <div data-print-footer="1">{renderFooterArea(1)}</div>
              {pageBorderStyle && <div data-print-border="1" style={pageBorderStyle} />}
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

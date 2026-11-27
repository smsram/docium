'use client';

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Minimize2 } from 'lucide-react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableRow } from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

import { useWorkspaceStore } from '@/lib/store';
import {
  DocumentPageSize,
  DocumentOrientation,
  MarginPreset,
  DocumentMargins,
  DocumentComment,
  DocumentVersionSnapshot,
  DocumentCitation,
  AiPanelMode,
  ActiveDocumentHeading,
  ActiveDocumentSelectionContext,
  ActiveDocumentContext,
} from '@/lib/types';

// Custom extensions
import {
  PageBreak,
  SectionBreak,
  Callout,
  FontSize,
  FontFamily,
  LineHeight,
  Subscript,
  Superscript,
  ShapeNode,
  ShapeType,
  TextBox,
  ResizableImage,
  CustomTable,
  CustomTableCell,
  CustomTableHeader,
  CustomBlockquote,
  CustomCodeBlock,
  Indent,
  EquationNode,
  InlineEquationNode,
} from './extensions';

// Subcomponents
import { DocumentTopBar } from './DocumentTopBar';
import { RibbonContainer } from './ribbon/RibbonContainer';
import { DocumentRuler, VerticalRuler } from './ruler/DocumentRuler';
import { PaginatedCanvas } from './canvas/PaginatedCanvas';
import { DocumentOutline } from './DocumentOutline';
import { CommentsSidebar } from './comments/CommentsSidebar';
import { WorkspaceAI } from '@/components/workspace/WorkspaceAI';
import { ContextMenu, ContextMenuState } from './context-menu/ContextMenu';

// Modals
import { PageSetupModal } from './modals/PageSetupModal';
import { DocumentStatsModal } from './modals/DocumentStatsModal';
import { CitationModal } from './modals/CitationModal';
import { LinkModal } from './modals/LinkModal';
import { VersionHistoryModal } from './modals/VersionHistoryModal';
import { ChartModal } from './modals/ChartModal';
import { DrawingModal } from './modals/DrawingModal';
import { EquationModal } from './modals/EquationModal';

// Utilities
import {
  calculatePageDimensions,
  getResolvedMargins,
} from './utils/pageMetrics';
import { convertMarkdownToDocumentHtml } from './utils/markdownToHtml';
import { editorRegistry } from '@/lib/editor/editorRegistry';
import {
  exportToDocx,
  exportToMarkdown,
  exportToHtml,
  exportToPlainText,
} from './utils/exportDocx';
import { exportToPdf, triggerPrintPdf } from './utils/exportPdf';
import { parseImportedFile } from './utils/importDocx';

interface DocumentEditorProps {
  documentId: string;
  showBackToHome?: boolean;
}

export function DocumentEditor({ documentId, showBackToHome = false }: DocumentEditorProps) {
  // Scoped store subscriptions to prevent re-renders on chat streaming
  const doc = useWorkspaceStore(
    useCallback((s) => s.documents.find((d) => d.id === documentId), [documentId])
  );
  const updateDocument = useWorkspaceStore((s) => s.updateDocument);
  const toggleStar = useWorkspaceStore((s) => s.toggleStar);
  const outlinePanelOpen = useWorkspaceStore((s) => s.outlinePanelOpen);
  const setOutlinePanelOpen = useWorkspaceStore((s) => s.setOutlinePanelOpen);
  const getAiPanelState = useWorkspaceStore((s) => s.getAiPanelState);
  const updateAiPanelState = useWorkspaceStore((s) => s.updateAiPanelState);
  const userProfile = useWorkspaceStore((s) => s.userProfile);

  // Document metadata state
  const [title, setTitle] = useState(doc?.title || 'Untitled Document');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Page layout state
  const [pageSize, setPageSize] = useState<DocumentPageSize>(doc?.pageSize || 'A4');
  const [orientation, setOrientation] = useState<DocumentOrientation>(doc?.orientation || 'portrait');
  const [marginPreset, setMarginPreset] = useState<MarginPreset>(doc?.marginPreset || 'normal');
  const [margins, setMargins] = useState<DocumentMargins>(
    getResolvedMargins(doc?.margins, doc?.marginPreset)
  );
  const [columns, setColumns] = useState<1 | 2 | 3>(doc?.columns || 1);
  const [headerText, setHeaderText] = useState(doc?.headerText || '');
  const [footerText, setFooterText] = useState(doc?.footerText || '');
  const [headerAlign, setHeaderAlign] = useState<'left' | 'center' | 'right'>(doc?.headerAlign || 'left');
  const [footerAlign, setFooterAlign] = useState<'left' | 'center' | 'right'>(doc?.footerAlign || 'left');
  const [firstPageHeaderText, setFirstPageHeaderText] = useState(doc?.firstPageHeaderText || '');
  const [firstPageFooterText, setFirstPageFooterText] = useState(doc?.firstPageFooterText || '');
  const [showPageNumbers, setShowPageNumbers] = useState(doc?.showPageNumbers ?? false);
  const [differentFirstPage, setDifferentFirstPage] = useState(doc?.differentFirstPage ?? false);
  const [watermarkText, setWatermarkText] = useState(doc?.watermarkText || '');
  const [pageColor, setPageColor] = useState(doc?.pageColor || '#FFFFFF');
  const [pageBorder, setPageBorder] = useState<'none' | 'box' | 'shadow' | 'double' | 'accent'>(
    doc?.pageBorder || 'none'
  );
  const [pageBorderColor, setPageBorderColor] = useState(doc?.pageBorderColor || '#1e293b');
  const [pageBorderWidth, setPageBorderWidth] = useState(doc?.pageBorderWidth || 1);
  const [pageBorderOffset, setPageBorderOffset] = useState<'edge' | 'margin' | 'wide'>(
    doc?.pageBorderOffset || 'edge'
  );

  // Review & Comments state
  const [comments, setComments] = useState<DocumentComment[]>(doc?.comments || []);
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);
  const [suggestingMode, setSuggestingMode] = useState(false);
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(true);

  // Version History & Citations state
  const [versionHistory, setVersionHistory] = useState<DocumentVersionSnapshot[]>(
    doc?.versionHistory || []
  );
  const [citations, setCitations] = useState<DocumentCitation[]>(doc?.citations || []);

  // View state
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isPaginatedView, setIsPaginatedView] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [showFormattingMarks, setShowFormattingMarks] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Focus Mode Memory and Toggling
  const savedStateBeforeFocusRef = useRef<{
    outline: boolean;
    comments: boolean;
    ai: AiPanelMode;
  } | null>(null);

  const handleToggleFocusMode = useCallback((target?: boolean) => {
    const next = target !== undefined ? target : !isFocusMode;
    if (next === isFocusMode) return;

    setIsFocusMode(next);

    if (next) {
      // Entering Focus Mode: remember states
      savedStateBeforeFocusRef.current = {
        outline: outlinePanelOpen,
        comments: commentsSidebarOpen,
        ai: getAiPanelState(documentId).mode,
      };
      // Close distractions outside render phase updater
      setOutlinePanelOpen(false);
      setCommentsSidebarOpen(false);
      updateAiPanelState(documentId, { mode: 'minimized' });
    } else {
      // Exiting Focus Mode: restore states
      if (savedStateBeforeFocusRef.current) {
        setOutlinePanelOpen(savedStateBeforeFocusRef.current.outline);
        setCommentsSidebarOpen(savedStateBeforeFocusRef.current.comments);
        updateAiPanelState(documentId, { mode: savedStateBeforeFocusRef.current.ai });
      }
    }
  }, [isFocusMode, documentId, getAiPanelState, outlinePanelOpen, commentsSidebarOpen, setOutlinePanelOpen, updateAiPanelState]);

  // Global keyboard shortcuts: Focus Mode, Find & Replace (Ctrl+F), Unified Undo/Redo
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const [copiedFormatting, setCopiedFormatting] = useState<{
    marks: Record<string, Record<string, unknown>>;
    blockAttrs?: { textAlign?: string | null; lineHeight?: string | null };
  } | null>(null);

  type LayoutSnapshot = {
    pageSize: DocumentPageSize;
    orientation: DocumentOrientation;
    marginPreset: MarginPreset;
    margins: DocumentMargins;
    columns: 1 | 2 | 3;
    headerText: string;
    footerText: string;
    headerAlign: 'left' | 'center' | 'right';
    footerAlign: 'left' | 'center' | 'right';
    firstPageHeaderText: string;
    firstPageFooterText: string;
    showPageNumbers: boolean;
    differentFirstPage: boolean;
    watermarkText: string;
    pageColor: string;
    pageBorder: 'none' | 'box' | 'shadow' | 'double' | 'accent';
    pageBorderColor: string;
    pageBorderWidth: number;
    pageBorderOffset: 'edge' | 'margin' | 'wide';
  };
  const layoutUndoRef = useRef<LayoutSnapshot[]>([]);
  const layoutRedoRef = useRef<LayoutSnapshot[]>([]);
  const [layoutHistoryTick, setLayoutHistoryTick] = useState(0);

  const captureLayoutSnapshot = useCallback(
    (): LayoutSnapshot => ({
      pageSize,
      orientation,
      marginPreset,
      margins,
      columns,
      headerText,
      footerText,
      headerAlign,
      footerAlign,
      firstPageHeaderText,
      firstPageFooterText,
      showPageNumbers,
      differentFirstPage,
      watermarkText,
      pageColor,
      pageBorder,
      pageBorderColor,
      pageBorderWidth,
      pageBorderOffset,
    }),
    [
      pageSize,
      orientation,
      marginPreset,
      margins,
      columns,
      headerText,
      footerText,
      headerAlign,
      footerAlign,
      firstPageHeaderText,
      firstPageFooterText,
      showPageNumbers,
      differentFirstPage,
      watermarkText,
      pageColor,
      pageBorder,
      pageBorderColor,
      pageBorderWidth,
      pageBorderOffset,
    ]
  );

  const applyLayoutSnapshot = useCallback(
    (snap: LayoutSnapshot) => {
      setPageSize(snap.pageSize);
      setOrientation(snap.orientation);
      setMarginPreset(snap.marginPreset);
      setMargins(snap.margins);
      setColumns(snap.columns);
      setHeaderText(snap.headerText);
      setFooterText(snap.footerText);
      setHeaderAlign(snap.headerAlign);
      setFooterAlign(snap.footerAlign);
      setFirstPageHeaderText(snap.firstPageHeaderText);
      setFirstPageFooterText(snap.firstPageFooterText);
      setShowPageNumbers(snap.showPageNumbers);
      setDifferentFirstPage(snap.differentFirstPage);
      setWatermarkText(snap.watermarkText);
      setPageColor(snap.pageColor);
      setPageBorder(snap.pageBorder);
      setPageBorderColor(snap.pageBorderColor);
      setPageBorderWidth(snap.pageBorderWidth);
      setPageBorderOffset(snap.pageBorderOffset);
      updateDocument(documentId, snap);
    },
    [documentId, updateDocument]
  );

  const recordLayoutUndoPoint = useCallback(() => {
    layoutUndoRef.current.push(captureLayoutSnapshot());
    if (layoutUndoRef.current.length > 40) layoutUndoRef.current.shift();
    layoutRedoRef.current = [];
    setLayoutHistoryTick((t) => t + 1);
  }, [captureLayoutSnapshot]);

  // Modals state
  const [pageSetupModalOpen, setPageSetupModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [citationModalOpen, setCitationModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [versionHistoryModalOpen, setVersionHistoryModalOpen] = useState(false);
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [drawingModalOpen, setDrawingModalOpen] = useState(false);
  const [equationModalOpen, setEquationModalOpen] = useState(false);

  // Context Menu State
  const [contextMenuState, setContextMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'canvas',
  });

  // Synchronize title if changed externally
  const [prevDocTitle, setPrevDocTitle] = useState(doc?.title);
  if (doc?.title && doc.title !== prevDocTitle) {
    setPrevDocTitle(doc.title);
    setTitle(doc.title);
  }

  // Tiptap Editor instance
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        link: {
          openOnClick: false,
        },
      }),
      CustomBlockquote,
      CustomCodeBlock,
      CustomTable.configure({
        resizable: true,
        handleWidth: 6,
        cellMinWidth: 40,
      }),
      TableRow,
      CustomTableHeader,
      CustomTableCell,
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({ multicolor: true }),
      ResizableImage.configure({
        allowBase64: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      // Custom Word / Google Docs extensions
      PageBreak,
      SectionBreak,
      Callout,
      FontSize,
      FontFamily,
      LineHeight,
      Indent,
      Subscript,
      Superscript,
      ShapeNode,
      TextBox,
      EquationNode,
      InlineEquationNode,
    ],
    content: doc?.contentJson || (doc?.content !== undefined ? doc.content : '<p></p>'),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[500px]',
        spellcheck: spellCheckEnabled ? 'true' : 'false',
      },
      handleDOMEvents: {
        mouseup: (view) => {
          if (!formatPainterActive || !copiedFormatting) return false;
          const { state, dispatch } = view;
          const { from, to, empty } = state.selection;
          let targetFrom = from;
          let targetTo = to;

          if (empty) {
            // Single click: find word boundaries around cursor
            const $pos = state.doc.resolve(from);
            const parentText = $pos.parent.textContent;
            const offsetInParent = $pos.parentOffset;
            let startWord = offsetInParent;
            let endWord = offsetInParent;
            while (startWord > 0 && !/\s/.test(parentText[startWord - 1])) startWord--;
            while (endWord < parentText.length && !/\s/.test(parentText[endWord])) endWord++;
            const blockStart = $pos.start();
            targetFrom = blockStart + startWord;
            targetTo = blockStart + endWord;
          }

          const tr = state.tr;
          if (targetTo > targetFrom) {
            // Clear all existing inline marks first so formatting matches cleanly
            Object.values(state.schema.marks).forEach((markType) => {
              tr.removeMark(targetFrom, targetTo, markType);
            });
            Object.entries(copiedFormatting.marks).forEach(([markName, markAttrs]) => {
              const markType = state.schema.marks[markName];
              if (markType) {
                tr.addMark(targetFrom, targetTo, markType.create(markAttrs));
              }
            });
          }

          if (copiedFormatting.blockAttrs) {
            const { textAlign, lineHeight } = copiedFormatting.blockAttrs;
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (node.type.name === 'paragraph' || node.type.name === 'heading') {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  ...(textAlign !== undefined ? { textAlign } : {}),
                  ...(lineHeight !== undefined ? { lineHeight } : {}),
                });
              }
            });
          }

          dispatch(tr);
          setFormatPainterActive(false);
          setCopiedFormatting(null);
          return false;
        },
      },
    },
    onUpdate: ({ editor: activeEd }) => {
      setSaveStatus('saving');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        if (!activeEd || activeEd.isDestroyed || !activeEd.view) return;
        let html = '';
        let json: Record<string, unknown> = {};
        let text = '';
        try {
          html = activeEd.getHTML();
          json = activeEd.getJSON() as Record<string, unknown>;
          text = activeEd.getText();
        } catch {
          return;
        }
        const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
        const characterCount = text.length;
        const readingTime = Math.max(1, Math.ceil(wordCount / 200));

        updateDocument(documentId, {
          content: html,
          contentJson: json,
          wordCount,
          characterCount,
          readingTime,
          pageSize,
          orientation,
          margins,
          marginPreset,
          columns,
          headerText,
          footerText,
          firstPageHeaderText,
          firstPageFooterText,
          showPageNumbers,
          differentFirstPage,
          watermarkText,
          pageColor,
          pageBorder,
          comments,
          citations,
          versionHistory,
        });

        setSaveStatus('saved');
      }, 700);
    },
  });

  // Clean up debounce timer on unmount to prevent null editor.view crash
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  const handleUnifiedUndo = useCallback(() => {
    if (editor && !editor.isDestroyed && editor.can().undo()) {
      editor.chain().focus().undo().run();
      return;
    }
    if (layoutUndoRef.current.length > 0) {
      const prev = layoutUndoRef.current.pop()!;
      layoutRedoRef.current.push(captureLayoutSnapshot());
      applyLayoutSnapshot(prev);
      setLayoutHistoryTick((t) => t + 1);
    }
  }, [editor, captureLayoutSnapshot, applyLayoutSnapshot]);

  const handleUnifiedRedo = useCallback(() => {
    if (editor && !editor.isDestroyed && editor.can().redo()) {
      editor.chain().focus().redo().run();
      return;
    }
    if (layoutRedoRef.current.length > 0) {
      const next = layoutRedoRef.current.pop()!;
      layoutUndoRef.current.push(captureLayoutSnapshot());
      applyLayoutSnapshot(next);
      setLayoutHistoryTick((t) => t + 1);
    }
  }, [editor, captureLayoutSnapshot, applyLayoutSnapshot]);

  // Global keyboard shortcuts: Escape Focus Mode, Ctrl+Shift+F, Ctrl+F Find & Replace, Ctrl+Z / Ctrl+Y Unified Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape' && isFocusMode) {
        e.preventDefault();
        handleToggleFocusMode(false);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        handleToggleFocusMode();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (isFocusMode) handleToggleFocusMode(false);
        window.dispatchEvent(new CustomEvent('docium:open-find-replace'));
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        if (!editor?.isFocused && layoutUndoRef.current.length > 0) {
          e.preventDefault();
          handleUnifiedUndo();
        }
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        if (!editor?.isFocused && layoutRedoRef.current.length > 0) {
          e.preventDefault();
          handleUnifiedRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode, handleToggleFocusMode, editor, handleUnifiedUndo, handleUnifiedRedo]);

  // Register editor in central EditorRegistry with StrictMode remount safety
  useEffect(() => {
    if (!editor || !documentId) return;
    editorRegistry.register(documentId, editor);
    return () => {
      editorRegistry.unregister(documentId, editor);
    };
  }, [editor, documentId]);

  // Calculate physical page dimensions
  const pageDimensions = useMemo(() => {
    return calculatePageDimensions(pageSize, orientation, margins);
  }, [pageSize, orientation, margins]);

  // Unresolved comments count
  const unresolvedCommentsCount = useMemo(() => {
    return comments.filter((c) => !c.resolved).length;
  }, [comments]);

  // Active selected text in editor
  const getSelectedText = useCallback(() => {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    if (from === to) return '';
    return editor.state.doc.textBetween(from, to, ' ');
  }, [editor]);

  // Context Menu Dispatcher
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!editor) return;

    const target = e.target as HTMLElement;
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    // 1. Vector Shape Node
    const shapeEl = target.closest('[data-type="docium-shape"]') as HTMLElement | null;
    if (shapeEl) {
      const shapeType = (shapeEl.getAttribute('data-shape-type') || 'rectangle') as ShapeType;
      const width = parseInt(shapeEl.getAttribute('data-width') || '160', 10);
      const height = parseInt(shapeEl.getAttribute('data-height') || '100', 10);
      const fill = shapeEl.getAttribute('data-fill') || '#E7EAE4';
      const stroke = shapeEl.getAttribute('data-stroke') || '#245C45';
      const strokeWidth = parseInt(shapeEl.getAttribute('data-stroke-width') || '2', 10);
      const rotation = parseInt(shapeEl.getAttribute('data-rotation') || '0', 10);
      const alignment = (shapeEl.getAttribute('data-alignment') || 'center') as 'left' | 'center' | 'right';
      const text = shapeEl.getAttribute('data-text') || '';

      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        type: 'shape',
        shapeAttrs: {
          shapeType,
          width,
          height,
          fill,
          stroke,
          strokeWidth,
          rotation,
          alignment,
          text,
        },
      });
      return;
    }

    // 2. Image Node
    const imgEl = target.closest('img') as HTMLImageElement | null;
    if (imgEl) {
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        type: 'image',
        imageSrc: imgEl.src,
      });
      return;
    }

    // 3. Hyperlink Mark
    const linkEl = target.closest('a') as HTMLAnchorElement | null;
    if (linkEl) {
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        type: 'link',
        linkHref: linkEl.href,
      });
      return;
    }

    // 4. Table Cell or Table
    const cellEl = target.closest('td, th');
    if (cellEl || editor.isActive('table')) {
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        type: 'table',
      });
      return;
    }

    // 5. Selected Text
    if (hasSelection) {
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        type: 'selection',
      });
      return;
    }

    // 6. Paragraph or Heading
    const paraEl = target.closest('p, h1, h2, h3, h4, h5, h6, blockquote, pre, li');
    if (paraEl) {
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        type: 'paragraph',
      });
      return;
    }

    // 7. Page Canvas
    setContextMenuState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      type: 'canvas',
    });
  };

  // Title change
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    updateDocument(documentId, { title: newTitle });
  };

  // Format painter toggle
  const handleToggleFormatPainter = () => {
    if (!editor) return;
    if (formatPainterActive) {
      setFormatPainterActive(false);
      setCopiedFormatting(null);
    } else {
      const { from, to, empty, $from } = editor.state.selection;
      const markMap: Record<string, Record<string, unknown>> = {};

      if (!empty) {
        editor.state.doc.nodesBetween(from, to, (node) => {
          if (node.isText && node.marks.length > 0 && Object.keys(markMap).length === 0) {
            node.marks.forEach((m) => {
              markMap[m.type.name] = { ...m.attrs };
            });
          }
        });
      }
      if (Object.keys(markMap).length === 0) {
        const activeMarks =
          editor.state.storedMarks ||
          ($from.marks().length > 0 ? $from.marks() : $from.nodeBefore?.marks || []);
        activeMarks.forEach((m) => {
          markMap[m.type.name] = { ...m.attrs };
        });
      }

      const parentAttrs = $from.parent.attrs || {};
      setCopiedFormatting({
        marks: markMap,
        blockAttrs: {
          textAlign: parentAttrs.textAlign ?? null,
          lineHeight: parentAttrs.lineHeight ?? null,
        },
      });
      setFormatPainterActive(true);
    }
  };

  // Comment Handlers
  const handleAddComment = (text: string, selectionText?: string) => {
    const newComment: DocumentComment = {
      id: `comment-${Date.now()}`,
      author: userProfile.name || 'Current User',
      authorAvatar: userProfile.avatar,
      createdAt: new Date().toISOString(),
      text,
      selectionText: selectionText || getSelectedText() || undefined,
      from: editor?.state.selection.from,
      to: editor?.state.selection.to,
      resolved: false,
      replies: [],
    };

    const updated = [newComment, ...comments];
    setComments(updated);
    updateDocument(documentId, { comments: updated });
  };

  const handleResolveComment = (commentId: string) => {
    const updated = comments.map((c) =>
      c.id === commentId ? { ...c, resolved: !c.resolved } : c
    );
    setComments(updated);
    updateDocument(documentId, { comments: updated });
  };

  const handleDeleteComment = (commentId: string) => {
    const updated = comments.filter((c) => c.id !== commentId);
    setComments(updated);
    updateDocument(documentId, { comments: updated });
  };

  const handleAddCommentReply = (commentId: string, replyText: string) => {
    const updated = comments.map((c) => {
      if (c.id === commentId) {
        const replies = c.replies || [];
        return {
          ...c,
          replies: [
            ...replies,
            {
              id: `rep-${Date.now()}`,
              author: userProfile.name || 'Current User',
              authorAvatar: userProfile.avatar,
              createdAt: new Date().toISOString(),
              text: replyText,
            },
          ],
        };
      }
      return c;
    });
    setComments(updated);
    updateDocument(documentId, { comments: updated });
  };

  // Version snapshot creation
  const handleSaveCurrentVersion = (snapshotTitle: string) => {
    if (!editor) return;
    const newSnapshot: DocumentVersionSnapshot = {
      id: `ver-${Date.now()}`,
      title: snapshotTitle,
      timestamp: new Date().toISOString(),
      wordCount: doc?.wordCount || 0,
      content: editor.getHTML(),
      contentJson: editor.getJSON(),
      isNamed: true,
    };
    const updated = [newSnapshot, ...versionHistory];
    setVersionHistory(updated);
    updateDocument(documentId, { versionHistory: updated });
  };

  const handleRestoreVersion = (snapshot: DocumentVersionSnapshot) => {
    if (!editor) return;
    if (snapshot.contentJson) {
      editor.commands.setContent(snapshot.contentJson);
    } else {
      editor.commands.setContent(snapshot.content);
    }
  };

  // Citation addition
  const handleAddCitation = (citation: DocumentCitation) => {
    const updated = [...citations, citation];
    setCitations(updated);
    updateDocument(documentId, { citations: updated });

    // Also insert inline citation marker at current cursor
    if (editor) {
      editor.chain().focus().insertContent(` [${citation.key}] `).run();
    }
  };

  // Link save handler
  const handleSaveLink = (url: string, text?: string) => {
    if (!editor) return;
    if (text && editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}">${text}</a>`)
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const handleRemoveLink = () => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  };

  // File import handler
  const handleImportFile = async (file: File) => {
    try {
      const result = await parseImportedFile(file);
      if (editor) {
        editor.commands.setContent(result.html);
      }
      if (result.title) {
        handleTitleChange(result.title);
      }
    } catch {
      alert('Failed to import file. Please check file format and try again.');
    }
  };

  // Apply page setup settings
  const handleSavePageSetup = (settings: {
    pageSize: DocumentPageSize;
    orientation: DocumentOrientation;
    margins: DocumentMargins;
    marginPreset: MarginPreset;
    columns: 1 | 2 | 3;
    headerText?: string;
    footerText?: string;
    firstPageHeaderText?: string;
    firstPageFooterText?: string;
    showPageNumbers?: boolean;
    differentFirstPage?: boolean;
  }) => {
    setPageSize(settings.pageSize);
    setOrientation(settings.orientation);
    setMargins(settings.margins);
    setMarginPreset(settings.marginPreset);
    setColumns(settings.columns);
    if (settings.headerText !== undefined) setHeaderText(settings.headerText);
    if (settings.footerText !== undefined) setFooterText(settings.footerText);
    if (settings.firstPageHeaderText !== undefined) setFirstPageHeaderText(settings.firstPageHeaderText);
    if (settings.firstPageFooterText !== undefined) setFirstPageFooterText(settings.firstPageFooterText);
    if (settings.showPageNumbers !== undefined) setShowPageNumbers(settings.showPageNumbers);
    if (settings.differentFirstPage !== undefined) setDifferentFirstPage(settings.differentFirstPage);

    updateDocument(documentId, {
      pageSize: settings.pageSize,
      orientation: settings.orientation,
      margins: settings.margins,
      marginPreset: settings.marginPreset,
      columns: settings.columns,
      headerText: settings.headerText,
      footerText: settings.footerText,
      firstPageHeaderText: settings.firstPageHeaderText,
      firstPageFooterText: settings.firstPageFooterText,
      showPageNumbers: settings.showPageNumbers,
      differentFirstPage: settings.differentFirstPage,
    });
  };

  // Document statistics
  const documentStats = useMemo(() => {
    if (!editor) {
      return {
        wordCount: doc?.wordCount || 0,
        characterCount: 0,
        characterCountNoSpaces: 0,
        paragraphCount: 1,
        pageCount: 1,
      };
    }
    const text = editor.getText();
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s+/g, '').length;
    const paragraphs = text.split(/\n+/).filter((p) => p.trim()).length || 1;
    const pageCount = Math.max(1, Math.ceil(editor.view.dom.scrollHeight / pageDimensions.printableHeightPx));

    return {
      wordCount: words,
      characterCount: chars,
      characterCountNoSpaces: charsNoSpaces,
      paragraphCount: paragraphs,
      pageCount,
    };
  }, [editor, doc?.wordCount, pageDimensions.printableHeightPx]);

  // AI Panel docked state
  const aiPanelMode = getAiPanelState(documentId).mode;
  const isAiDocked = aiPanelMode === 'docked';

  return (
    <div className="flex flex-col h-full bg-[var(--background)] overflow-hidden">
      {/* Floating Exit Focus Mode Pill */}
      {isFocusMode && (
        <div className="fixed top-4 right-6 z-[90] flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md px-3.5 py-1.5 shadow-xl text-xs font-medium text-[var(--text)] select-none animate-in fade-in slide-in-from-top-2 duration-150">
          <span className="flex items-center gap-1.5 text-[var(--text-muted)] text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Focus Mode
          </span>
          <div className="h-3.5 w-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={() => handleToggleFocusMode(false)}
            className="flex items-center gap-1.5 text-xs text-[var(--primary)] hover:text-[var(--primary-hover)] font-semibold transition-colors cursor-pointer"
            title="Exit Focus Mode (Esc or Ctrl+Shift+F)"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span>Exit (Esc)</span>
          </button>
        </div>
      )}

      {/* 1. Top Application Bar */}
      {!isFocusMode && (
        <DocumentTopBar
          editor={editor}
          title={title}
          onTitleChange={handleTitleChange}
          saveStatus={saveStatus}
          starred={doc?.starred}
          onToggleStar={() => doc && toggleStar(doc.id)}
          showBackToHome={showBackToHome}
          outlinePanelOpen={outlinePanelOpen}
          onToggleOutline={() => setOutlinePanelOpen(!outlinePanelOpen)}
          commentsSidebarOpen={commentsSidebarOpen}
          onToggleCommentsSidebar={() => setCommentsSidebarOpen(!commentsSidebarOpen)}
          unresolvedCommentsCount={unresolvedCommentsCount}
          aiDocked={isAiDocked}
          onToggleAiPanel={() => {
            updateAiPanelState(documentId, {
              mode: isAiDocked ? 'minimized' : 'docked',
            });
          }}
          onUndo={handleUnifiedUndo}
          onRedo={handleUnifiedRedo}
          canUndo={Boolean(editor?.can().undo()) || (layoutHistoryTick >= 0 && layoutUndoRef.current.length > 0)}
          canRedo={Boolean(editor?.can().redo()) || (layoutHistoryTick >= 0 && layoutRedoRef.current.length > 0)}
          onExportDocx={() =>
            editor &&
            exportToDocx(title, editor.getHTML(), {
              jsonContent: editor.getJSON(),
              pageSize,
              orientation,
              margins,
              columns,
              headerText,
              footerText,
              firstPageHeaderText,
              firstPageFooterText,
              showPageNumbers,
              differentFirstPage,
              watermarkText,
              pageColor,
              pageBorder,
            })
          }
          onExportPdf={() =>
            void exportToPdf(title, {
              pageSize,
              orientation,
              margins,
              pageColor,
            })
          }
          onPrint={() =>
            triggerPrintPdf({
              title,
              pageSize,
              orientation,
              margins,
            })
          }
          onExportMarkdown={() => editor && exportToMarkdown(title, editor.getHTML())}
          onExportHtml={() => editor && exportToHtml(title, editor.getHTML())}
          onExportPlainText={() => editor && exportToPlainText(title, editor.getHTML())}
          onImportFile={handleImportFile}
          onOpenVersionHistory={() => setVersionHistoryModalOpen(true)}
          onOpenStatsModal={() => setStatsModalOpen(true)}
          onOpenPageSetupModal={() => setPageSetupModalOpen(true)}
        />
      )}

      {/* 2. Ribbon Tabs Toolbar */}
      {!isFocusMode && (
        <RibbonContainer
          editor={editor}
          pageSize={pageSize}
          orientation={orientation}
          marginPreset={marginPreset}
          margins={margins}
          columns={columns}
          watermarkText={watermarkText}
          pageColor={pageColor}
          pageBorder={pageBorder}
          pageBorderColor={pageBorderColor}
          pageBorderWidth={pageBorderWidth}
          pageBorderOffset={pageBorderOffset}
          onChangePageSize={(sz) => {
            recordLayoutUndoPoint();
            setPageSize(sz);
            updateDocument(documentId, { pageSize: sz });
          }}
          onChangeOrientation={(ort) => {
            recordLayoutUndoPoint();
            setOrientation(ort);
            updateDocument(documentId, { orientation: ort });
          }}
          onChangeMarginPreset={(p) => {
            recordLayoutUndoPoint();
            setMarginPreset(p);
            const resolved = getResolvedMargins(p);
            setMargins(resolved);
            updateDocument(documentId, { marginPreset: p, margins: resolved });
          }}
          onChangeMargins={(m) => {
            recordLayoutUndoPoint();
            setMargins(m);
            setMarginPreset('custom');
            updateDocument(documentId, { margins: m, marginPreset: 'custom' });
          }}
          onChangeColumns={(col) => {
            recordLayoutUndoPoint();
            setColumns(col);
            updateDocument(documentId, { columns: col });
          }}
          onChangeWatermark={(wm) => {
            recordLayoutUndoPoint();
            setWatermarkText(wm);
            updateDocument(documentId, { watermarkText: wm });
          }}
          onChangePageColor={(pc) => {
            recordLayoutUndoPoint();
            setPageColor(pc);
            updateDocument(documentId, { pageColor: pc });
          }}
          onChangePageBorder={(pb) => {
            recordLayoutUndoPoint();
            setPageBorder(pb);
            updateDocument(documentId, { pageBorder: pb });
          }}
          onChangePageBorderColor={(pbc) => {
            recordLayoutUndoPoint();
            setPageBorderColor(pbc);
            updateDocument(documentId, { pageBorderColor: pbc });
          }}
          onChangePageBorderWidth={(pbw) => {
            recordLayoutUndoPoint();
            setPageBorderWidth(pbw);
            updateDocument(documentId, { pageBorderWidth: pbw });
          }}
          onChangePageBorderOffset={(pbo) => {
            recordLayoutUndoPoint();
            setPageBorderOffset(pbo);
            updateDocument(documentId, { pageBorderOffset: pbo });
          }}
          onOpenLinkModal={() => setLinkModalOpen(true)}
          onOpenCitationModal={() => setCitationModalOpen(true)}
          onOpenPageSetupModal={() => setPageSetupModalOpen(true)}
          onOpenStatsModal={() => setStatsModalOpen(true)}
          onOpenChartModal={() => setChartModalOpen(true)}
          onOpenDrawingModal={() => setDrawingModalOpen(true)}
          onOpenEquationModal={() => setEquationModalOpen(true)}
          onEnablePageNumbers={() => {
            const next = !showPageNumbers;
            setShowPageNumbers(next);
            updateDocument(documentId, { showPageNumbers: next });
          }}
          citations={citations}
          commentsCount={comments.length}
          unresolvedCount={unresolvedCommentsCount}
          commentsSidebarOpen={commentsSidebarOpen}
          onToggleCommentsSidebar={() => setCommentsSidebarOpen(!commentsSidebarOpen)}
          onAddCommentFromSelection={() => {
            setCommentsSidebarOpen(true);
          }}
          suggestingMode={suggestingMode}
          onToggleSuggestingMode={() => setSuggestingMode(!suggestingMode)}
          spellCheckEnabled={spellCheckEnabled}
          onToggleSpellCheck={() => setSpellCheckEnabled(!spellCheckEnabled)}
          zoomLevel={zoomLevel}
          onSetZoom={setZoomLevel}
          isPaginatedView={isPaginatedView}
          onTogglePaginatedView={() => setIsPaginatedView(!isPaginatedView)}
          showRuler={showRuler}
          onToggleRuler={() => setShowRuler(!showRuler)}
          showOutline={outlinePanelOpen}
          onToggleOutline={() => setOutlinePanelOpen(!outlinePanelOpen)}
          showFormattingMarks={showFormattingMarks}
          onToggleFormattingMarks={() => setShowFormattingMarks(!showFormattingMarks)}
          isFocusMode={isFocusMode}
          onToggleFocusMode={() => handleToggleFocusMode()}
          formatPainterActive={formatPainterActive}
          onToggleFormatPainter={handleToggleFormatPainter}
        />
      )}

      {/* 4. Main Workspace Editing Layout */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Navigation Outline */}
        <DocumentOutline
          editor={editor}
          isOpen={outlinePanelOpen && !isFocusMode}
          onClose={() => setOutlinePanelOpen(false)}
        />

        {/* Center Canvas Column with Synchronized Horizontal Top Ruler */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {showRuler && !isFocusMode && (
            <DocumentRuler
              pageDimensions={pageDimensions}
              zoomLevel={zoomLevel}
              onUpdateMargins={(newMargins) => {
                setMargins(newMargins);
                setMarginPreset('custom');
                updateDocument(documentId, { margins: newMargins, marginPreset: 'custom' });
              }}
            />
          )}

          {/* Document Workspace Row: Vertical Ruler + Paginated Document Sheet Canvas */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {showRuler && !isFocusMode && (
              <VerticalRuler
                pageDimensions={pageDimensions}
                zoomLevel={zoomLevel}
                onUpdateMargins={(newMargins) => {
                  recordLayoutUndoPoint();
                  setMargins(newMargins);
                  setMarginPreset('custom');
                  updateDocument(documentId, { margins: newMargins, marginPreset: 'custom' });
                }}
              />
            )}

            <PaginatedCanvas
            editor={editor}
            pageDimensions={pageDimensions}
            zoomLevel={zoomLevel}
            isPaginatedView={isPaginatedView}
            headerText={headerText}
            footerText={footerText}
            headerAlign={headerAlign}
            footerAlign={footerAlign}
            firstPageHeaderText={firstPageHeaderText}
            firstPageFooterText={firstPageFooterText}
            onUpdateHeaderText={(txt) => {
              setHeaderText(txt);
              updateDocument(documentId, { headerText: txt });
            }}
            onUpdateFooterText={(txt) => {
              setFooterText(txt);
              updateDocument(documentId, { footerText: txt });
            }}
            onUpdateHeaderAlign={(al) => {
              setHeaderAlign(al);
              updateDocument(documentId, { headerAlign: al });
            }}
            onUpdateFooterAlign={(al) => {
              setFooterAlign(al);
              updateDocument(documentId, { footerAlign: al });
            }}
            onUpdateFirstPageHeaderText={(txt) => {
              setFirstPageHeaderText(txt);
              updateDocument(documentId, { firstPageHeaderText: txt });
            }}
            onUpdateFirstPageFooterText={(txt) => {
              setFirstPageFooterText(txt);
              updateDocument(documentId, { firstPageFooterText: txt });
            }}
            showPageNumbers={showPageNumbers}
            differentFirstPage={differentFirstPage}
            onToggleDifferentFirstPage={() => {
              const next = !differentFirstPage;
              setDifferentFirstPage(next);
              updateDocument(documentId, { differentFirstPage: next });
            }}
            columns={columns}
            showFormattingMarks={showFormattingMarks}
            watermarkText={watermarkText}
            pageColor={pageColor}
            pageBorder={pageBorder}
            pageBorderColor={pageBorderColor}
            pageBorderWidth={pageBorderWidth}
            pageBorderOffset={pageBorderOffset}
            wordCount={doc?.wordCount || 0}
            readingTime={doc?.readingTime || 1}
            onContextMenu={handleContextMenu}
          />
          </div>
        </div>

        {/* Right Comments Sidebar */}
        <CommentsSidebar
          isOpen={commentsSidebarOpen && !isFocusMode}
          onClose={() => setCommentsSidebarOpen(false)}
          comments={comments}
          currentSelectionText={getSelectedText()}
          onAddComment={handleAddComment}
          onResolveComment={handleResolveComment}
          onDeleteComment={handleDeleteComment}
          onAddReply={handleAddCommentReply}
          onFocusSelection={(comment) => {
            if (editor && comment.from !== undefined && comment.to !== undefined) {
              editor.commands.setTextSelection({ from: comment.from, to: comment.to });
            }
          }}
        />

        {/* Unified Reusable Docium AI Panel with Live Document Integration */}
        <WorkspaceAI
          workspaceId={documentId}
          documentFormat="doc"
          availableEditorTools={[
            'read_active_document',
            'read_active_document_structure',
            'inspect_active_document_metadata',
            'read_active_document_selection',
            'search_document_text',
            'navigateToDocumentHeadingTool',
            'insert_structured_document',
            'insert_text_at_cursor',
            'replace_selected_text',
            'delete_selected_content',
            'append_or_insert_paragraph',
            'create_or_edit_heading',
            'create_document_list',
            'insert_document_table',
            'insert_hyperlink',
            'format_document_text',
            'change_document_alignment',
            'insert_document_page_break',
            'rename_current_document',
            'save_document_changes',
          ]}
          getActiveDocumentContext={() => {
            const headings: ActiveDocumentHeading[] = [];
            let selectionInfo: ActiveDocumentSelectionContext = { hasSelection: false };

            if (editor) {
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'heading') {
                  headings.push({
                    level: node.attrs.level || 1,
                    text: node.textContent,
                    pos,
                  });
                }
              });

              const { from, to, empty } = editor.state.selection;
              const selText = empty ? '' : editor.state.doc.textBetween(from, to, ' ');
              const $from = editor.state.selection.$from;
              const paragraph = $from?.parent?.textContent || '';
              selectionInfo = {
                hasSelection: !empty && Boolean(selText),
                selectedText: selText,
                from,
                to,
                cursorPos: from,
                surroundingParagraph: paragraph,
              };
            }

            return {
              id: documentId,
              title,
              format: 'doc',
              content: editor ? editor.getHTML() : doc?.content,
              headings,
              selection: selectionInfo,
              margins: {
                top: margins.top,
                bottom: margins.bottom,
                left: margins.left,
                right: margins.right,
                preset: marginPreset,
              },
              pageSize,
              orientation,
              columns,
              headerText,
              footerText,
              showPageNumbers,
              differentFirstPage,
              watermarkText,
              pageColor,
              pageBorder,
              wordCount: documentStats.wordCount,
              characterCount: documentStats.characterCount,
              readingTime: Math.max(1, Math.ceil(documentStats.wordCount / 200)),
              saveStatus,
              hasUnsavedChanges: saveStatus !== 'saved',
              editorMounted: Boolean(editor && !editor.isDestroyed),
              isEditable: Boolean(editor?.isEditable),
              lastModified: doc?.updatedAt || new Date().toISOString(),
            };
          }}
          onApplyEditorAction={async (action, payload) => {
            if (action === 'modify_page_layout') {
              if (payload.pageSize) setPageSize(payload.pageSize as DocumentPageSize);
              if (payload.orientation) setOrientation(payload.orientation as DocumentOrientation);
              if (payload.marginPreset) setMarginPreset(payload.marginPreset as MarginPreset);
              if (payload.margins) setMargins(payload.margins as DocumentMargins);
              if (payload.columns) setColumns(Number(payload.columns) as 1 | 2 | 3);
              if (payload.headerText !== undefined) setHeaderText(String(payload.headerText));
              if (payload.footerText !== undefined) setFooterText(String(payload.footerText));
              if (payload.showPageNumbers !== undefined) setShowPageNumbers(Boolean(payload.showPageNumbers));
              if (payload.differentFirstPage !== undefined) setDifferentFirstPage(Boolean(payload.differentFirstPage));
              if (payload.watermarkText !== undefined) setWatermarkText(String(payload.watermarkText));
              if (payload.pageColor !== undefined) setPageColor(String(payload.pageColor));
              if (payload.pageBorder !== undefined) setPageBorder(payload.pageBorder as any);
            }

            return editorRegistry.executeAction(
              action,
              payload,
              documentId,
              (id, updates) => {
                if (updates.title) setTitle(updates.title);
                if (updates.pageSize) setPageSize(updates.pageSize);
                if (updates.orientation) setOrientation(updates.orientation);
                if (updates.marginPreset) setMarginPreset(updates.marginPreset);
                if (updates.margins) setMargins(updates.margins);
                if (updates.columns) setColumns(updates.columns);
                if (updates.headerText !== undefined) setHeaderText(updates.headerText);
                if (updates.footerText !== undefined) setFooterText(updates.footerText);
                if (updates.showPageNumbers !== undefined) setShowPageNumbers(updates.showPageNumbers);
                if (updates.differentFirstPage !== undefined) setDifferentFirstPage(updates.differentFirstPage);
                if (updates.watermarkText !== undefined) setWatermarkText(updates.watermarkText);
                if (updates.pageColor !== undefined) setPageColor(updates.pageColor);
                if (updates.pageBorder !== undefined) setPageBorder(updates.pageBorder);
                updateDocument(id, updates);
                setSaveStatus('saved');
              }
            );
          }}
          onApplyAction={(actionType, payload) => {
            if (!editor) return;
            // Execute as proper undoable Tiptap transaction
            if (actionType === 'create_table') {
              editor.chain().focus().insertContent(payload).run();
            } else if (actionType === 'rewrite' || actionType === 'replace') {
              editor.chain().focus().deleteSelection().insertContent(payload).run();
            } else {
              editor.chain().focus().insertContent(payload).run();
            }
          }}
        />
      </div>

      {/* 5. Modals & Dialogs */}
      <PageSetupModal
        isOpen={pageSetupModalOpen}
        onClose={() => setPageSetupModalOpen(false)}
        pageSize={pageSize}
        orientation={orientation}
        margins={margins}
        marginPreset={marginPreset}
        columns={columns}
        headerText={headerText}
        footerText={footerText}
        firstPageHeaderText={firstPageHeaderText}
        firstPageFooterText={firstPageFooterText}
        showPageNumbers={showPageNumbers}
        differentFirstPage={differentFirstPage}
        onSave={handleSavePageSetup}
      />

      <DocumentStatsModal
        isOpen={statsModalOpen}
        onClose={() => setStatsModalOpen(false)}
        title={title}
        wordCount={documentStats.wordCount}
        characterCount={documentStats.characterCount}
        characterCountNoSpaces={documentStats.characterCountNoSpaces}
        paragraphCount={documentStats.paragraphCount}
        pageCount={documentStats.pageCount}
      />

      <CitationModal
        isOpen={citationModalOpen}
        onClose={() => setCitationModalOpen(false)}
        onAddCitation={handleAddCitation}
      />

      <LinkModal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        initialUrl={editor?.getAttributes('link').href || ''}
        initialText={getSelectedText()}
        onSave={handleSaveLink}
        onRemove={handleRemoveLink}
      />

      <VersionHistoryModal
        isOpen={versionHistoryModalOpen}
        onClose={() => setVersionHistoryModalOpen(false)}
        versions={versionHistory}
        currentWordCount={doc?.wordCount || 0}
        onSaveCurrentVersion={handleSaveCurrentVersion}
        onRestoreVersion={handleRestoreVersion}
      />

      <ChartModal
        isOpen={chartModalOpen}
        onClose={() => setChartModalOpen(false)}
        onInsertChartImage={(dataUrl, chartTitle, width, height) => {
          if (editor) {
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'image',
                attrs: {
                  src: dataUrl,
                  alt: chartTitle,
                  title: chartTitle,
                  width,
                  height,
                  alignment: 'center',
                  caption: `Chart: ${chartTitle}`,
                },
              })
              .run();
          }
        }}
      />

      <DrawingModal
        isOpen={drawingModalOpen}
        onClose={() => setDrawingModalOpen(false)}
        onInsertDrawing={(dataUrl, width, height) => {
          if (editor) {
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'image',
                attrs: {
                  src: dataUrl,
                  alt: 'Drawing',
                  width,
                  height,
                  alignment: 'center',
                },
              })
              .run();
          }
        }}
      />

      <EquationModal
        isOpen={equationModalOpen}
        onClose={() => setEquationModalOpen(false)}
        onInsertEquation={(latex, displayMode) => {
          if (editor) {
            editor.chain().focus().insertEquation({ latex, displayMode }).run();
          }
        }}
      />

      {/* 6. Context-Sensitive Right-Click Menu */}
      <ContextMenu
        state={contextMenuState}
        onClose={() => setContextMenuState((prev) => ({ ...prev, isOpen: false }))}
        editor={editor}
        onAddComment={() => setCommentsSidebarOpen(true)}
        onRewriteWithAi={() => {
          updateAiPanelState(documentId, { mode: 'docked' });
        }}
        onOpenLinkModal={() => {
          setLinkModalOpen(true);
        }}
        onOpenPageSetup={() => setPageSetupModalOpen(true)}
      />
    </div>
  );
}

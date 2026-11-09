'use client';

import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Minimize2 } from 'lucide-react';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Image from '@tiptap/extension-image';
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
} from './extensions';

// Subcomponents
import { DocumentTopBar } from './DocumentTopBar';
import { RibbonContainer } from './ribbon/RibbonContainer';
import { DocumentRuler } from './ruler/DocumentRuler';
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
import { triggerPrintPdf } from './utils/exportPdf';
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
  const [firstPageHeaderText, setFirstPageHeaderText] = useState(doc?.firstPageHeaderText || '');
  const [firstPageFooterText, setFirstPageFooterText] = useState(doc?.firstPageFooterText || '');
  const [showPageNumbers, setShowPageNumbers] = useState(doc?.showPageNumbers ?? true);
  const [differentFirstPage, setDifferentFirstPage] = useState(doc?.differentFirstPage ?? false);

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
    setIsFocusMode((prev) => {
      const next = target !== undefined ? target : !prev;
      if (next && !prev) {
        // Entering Focus Mode: remember states
        savedStateBeforeFocusRef.current = {
          outline: outlinePanelOpen,
          comments: commentsSidebarOpen,
          ai: getAiPanelState(documentId).mode,
        };
        // Close distractions
        setOutlinePanelOpen(false);
        setCommentsSidebarOpen(false);
        updateAiPanelState(documentId, { mode: 'minimized' });
      } else if (!next && prev) {
        // Exiting Focus Mode: restore states
        if (savedStateBeforeFocusRef.current) {
          setOutlinePanelOpen(savedStateBeforeFocusRef.current.outline);
          setCommentsSidebarOpen(savedStateBeforeFocusRef.current.comments);
          updateAiPanelState(documentId, { mode: savedStateBeforeFocusRef.current.ai });
        }
      }
      return next;
    });
  }, [documentId, getAiPanelState, outlinePanelOpen, commentsSidebarOpen, setOutlinePanelOpen, updateAiPanelState]);

  // Global keyboard shortcuts for focus mode: Escape exits, Mod+Shift+F toggles
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFocusMode) {
        e.preventDefault();
        handleToggleFocusMode(false);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleToggleFocusMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode, handleToggleFocusMode]);

  // Format painter state
  const [formatPainterActive, setFormatPainterActive] = useState(false);
  const [copiedMarks, setCopiedMarks] = useState<Record<string, Record<string, unknown>> | null>(null);

  // Modals state
  const [pageSetupModalOpen, setPageSetupModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [citationModalOpen, setCitationModalOpen] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [versionHistoryModalOpen, setVersionHistoryModalOpen] = useState(false);

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
        heading: { levels: [1, 2, 3, 4] },
        link: {
          openOnClick: false,
        },
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({ multicolor: true }),
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      // Custom extensions
      PageBreak,
  SectionBreak,
      Callout,
      FontSize,
      FontFamily,
      LineHeight,
      Subscript,
      Superscript,
      ShapeNode,
    ],
    content: doc?.contentJson || doc?.content || '<p>Start typing...</p>',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'tiptap focus:outline-none min-h-[500px] leading-relaxed',
        spellcheck: spellCheckEnabled ? 'true' : 'false',
      },
      handleClick: (view, pos) => {
        // If format painter is active, apply copied marks to clicked text
        if (formatPainterActive && copiedMarks) {
          const { state, dispatch } = view;
          const tr = state.tr;
          // Apply marks across the node or word at click position
          const resolvedPos = state.doc.resolve(pos);
          const range = { from: resolvedPos.start(), to: resolvedPos.end() };
          Object.entries(copiedMarks).forEach(([markName, markAttrs]) => {
            const markType = state.schema.marks[markName];
            if (markType) {
              tr.addMark(range.from, range.to, markType.create(markAttrs));
            }
          });
          dispatch(tr);
          setFormatPainterActive(false);
          setCopiedMarks(null);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      setSaveStatus('saving');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(() => {
        const html = editor.getHTML();
        const json = editor.getJSON();
        const text = editor.getText();
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
          comments,
          citations,
          versionHistory,
        });

        setSaveStatus('saved');
      }, 700);
    },
  });

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
      setCopiedMarks(null);
    } else {
      // Capture marks at current selection
      const marks = editor.state.selection.$from.marks();
      const markMap: Record<string, Record<string, unknown>> = {};
      marks.forEach((m) => {
        markMap[m.type.name] = m.attrs;
      });
      setCopiedMarks(markMap);
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
          onExportDocx={() => editor && exportToDocx(title, editor.getHTML())}
          onExportPdf={() =>
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
          onChangePageSize={(sz) => {
            setPageSize(sz);
            updateDocument(documentId, { pageSize: sz });
          }}
          onChangeOrientation={(ort) => {
            setOrientation(ort);
            updateDocument(documentId, { orientation: ort });
          }}
          onChangeMarginPreset={(p) => {
            setMarginPreset(p);
            const resolved = getResolvedMargins(p);
            setMargins(resolved);
            updateDocument(documentId, { marginPreset: p, margins: resolved });
          }}
          onChangeMargins={(m) => {
            setMargins(m);
            setMarginPreset('custom');
            updateDocument(documentId, { margins: m, marginPreset: 'custom' });
          }}
          onChangeColumns={(col) => {
            setColumns(col);
            updateDocument(documentId, { columns: col });
          }}
          onOpenLinkModal={() => setLinkModalOpen(true)}
          onOpenCitationModal={() => setCitationModalOpen(true)}
          onOpenPageSetupModal={() => setPageSetupModalOpen(true)}
          onOpenStatsModal={() => setStatsModalOpen(true)}
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

          {/* Paginated Document Sheet Canvas */}
          <PaginatedCanvas
            editor={editor}
            pageDimensions={pageDimensions}
            zoomLevel={zoomLevel}
            isPaginatedView={isPaginatedView}
            headerText={headerText}
            footerText={footerText}
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
            wordCount={doc?.wordCount || 0}
            readingTime={doc?.readingTime || 1}
            onContextMenu={handleContextMenu}
          />
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

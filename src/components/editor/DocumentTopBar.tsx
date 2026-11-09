'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import {
  FileText,
  ArrowLeft,
  Check,
  RefreshCw,
  Undo2,
  Redo2,
  Share2,
  Download,
  Upload,
  MoreVertical,
  Star,
  Sparkles,
  MessageSquare,
  FileDown,
  Printer,
  History,
  BarChart3,
  Sliders,
  ChevronDown,
  AlignLeft,
} from 'lucide-react';
import { type Editor } from '@tiptap/react';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';

interface DocumentTopBarProps {
  editor: Editor | null;
  title: string;
  onTitleChange: (newTitle: string) => void;
  saveStatus: 'saved' | 'saving' | 'error';
  starred?: boolean;
  onToggleStar: () => void;
  showBackToHome?: boolean;
  // Outline
  outlinePanelOpen: boolean;
  onToggleOutline: () => void;
  // Comments
  commentsSidebarOpen: boolean;
  onToggleCommentsSidebar: () => void;
  unresolvedCommentsCount: number;
  // AI Panel
  aiDocked: boolean;
  onToggleAiPanel: () => void;
  // Modals & Actions
  onExportDocx: () => void;
  onExportPdf: () => void;
  onExportMarkdown: () => void;
  onExportHtml: () => void;
  onExportPlainText: () => void;
  onImportFile: (file: File) => void;
  onOpenVersionHistory: () => void;
  onOpenStatsModal: () => void;
  onOpenPageSetupModal: () => void;
}

export function DocumentTopBar({
  editor,
  title,
  onTitleChange,
  saveStatus,
  starred = false,
  onToggleStar,
  showBackToHome = true,
  outlinePanelOpen,
  onToggleOutline,
  commentsSidebarOpen,
  onToggleCommentsSidebar,
  unresolvedCommentsCount,
  aiDocked,
  onToggleAiPanel,
  onExportDocx,
  onExportPdf,
  onExportMarkdown,
  onExportHtml,
  onExportPlainText,
  onImportFile,
  onOpenVersionHistory,
  onOpenStatsModal,
  onOpenPageSetupModal,
}: DocumentTopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    alert('Document share link copied to clipboard!');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
  };

  const exportDropdownItems: DropdownItem[] = [
    {
      id: 'export-docx',
      label: 'Word Document',
      sublabel: 'Standard Microsoft Word format',
      badge: 'DOCX',
      icon: FileDown,
      onClick: onExportDocx,
    },
    {
      id: 'export-pdf',
      label: 'Print / PDF Document',
      sublabel: 'Vector print preview format',
      badge: 'PDF',
      icon: Printer,
      onClick: onExportPdf,
    },
    {
      id: 'export-md',
      label: 'Markdown',
      sublabel: 'Plain text with markdown tags',
      badge: '.md',
      icon: FileText,
      onClick: onExportMarkdown,
    },
    {
      id: 'export-html',
      label: 'Web Page',
      sublabel: 'Rendered HTML markup',
      badge: '.html',
      icon: FileText,
      onClick: onExportHtml,
    },
    {
      id: 'export-txt',
      label: 'Plain Text',
      sublabel: 'Raw unformatted text',
      badge: '.txt',
      icon: FileText,
      onClick: onExportPlainText,
    },
  ];

  const moreDropdownItems: DropdownItem[] = [
    {
      id: 'import-file',
      label: 'Import File (.docx, .md, .txt)',
      icon: Upload,
      onClick: () => fileInputRef.current?.click(),
    },
    {
      id: 'version-history',
      label: 'Version History',
      icon: History,
      onClick: onOpenVersionHistory,
    },
    {
      id: 'stats',
      label: 'Word Count & Statistics',
      icon: BarChart3,
      onClick: onOpenStatsModal,
    },
    {
      id: 'page-setup',
      label: 'Page Setup',
      icon: Sliders,
      onClick: onOpenPageSetupModal,
    },
    {
      id: 'print-action',
      label: 'Print (Ctrl+P)',
      icon: Printer,
      separator: true,
      onClick: onExportPdf,
    },
  ];

  return (
    <div className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--text)] select-none shrink-0 docium-topbar">
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.doc,.md,.markdown,.html,.txt"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Left: Navigation, Title & Save Status */}
      <div className="flex items-center gap-2 min-w-0">
        {showBackToHome && (
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors mr-1 shrink-0"
            title="Back to home"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Home</span>
          </Link>
        )}

        <FileText className="h-4 w-4 text-[var(--primary)] shrink-0" />

        {/* Editable Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled Document"
          className="font-semibold text-sm text-[var(--text)] bg-transparent outline-none truncate hover:border-b hover:border-[var(--border)] focus:border-b focus:border-[var(--primary)] transition-all max-w-[200px] sm:max-w-xs md:max-w-sm"
        />

        {/* Save Status */}
        <div className="flex items-center gap-1 text-[11px] font-mono shrink-0 pl-1">
          {saveStatus === 'saving' ? (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span className="hidden sm:inline">Saving...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              <span className="hidden md:inline text-[10px]">Saved</span>
            </span>
          )}
        </div>

        {/* Undo / Redo in topbar */}
        <div className="hidden lg:flex items-center gap-0.5 ml-2 border-l border-[var(--border)] pl-2">
          <button
            type="button"
            onClick={() => editor?.chain().focus().undo().run()}
            disabled={!editor?.can().undo()}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30 cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor?.chain().focus().redo().run()}
            disabled={!editor?.can().redo()}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--accent)] disabled:opacity-30 cursor-pointer"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Right: Actions, Outline, Comments, Export, Share, AI */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Star Button */}
        <button
          type="button"
          onClick={onToggleStar}
          className={`rounded p-1.5 transition-colors cursor-pointer ${
            starred
              ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20'
              : 'text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
          }`}
          title={starred ? 'Starred' : 'Star document'}
        >
          <Star className={`h-4 w-4 ${starred ? 'fill-amber-500' : ''}`} />
        </button>

        {/* Outline Toggle */}
        <button
          type="button"
          onClick={onToggleOutline}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
            outlinePanelOpen
              ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-2xs'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
          title="Document Outline (Headings & Navigation)"
        >
          <AlignLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Outline</span>
        </button>

        {/* Comments Toggle */}
        <button
          type="button"
          onClick={onToggleCommentsSidebar}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
            commentsSidebarOpen
              ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-2xs'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
          title="Document Comments"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Comments</span>
          {unresolvedCommentsCount > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.2 font-mono text-[10px] text-white">
              {unresolvedCommentsCount}
            </span>
          )}
        </button>

        {/* Export / Download Menu with Portaled Dropdown */}
        <Dropdown
          align="right"
          menuWidth="w-56"
          items={exportDropdownItems}
          trigger={
            <div
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)] transition-colors shadow-2xs cursor-pointer"
              title="Export Document"
            >
              <Download className="h-3.5 w-3.5 text-[var(--primary)]" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </div>
          }
        />

        {/* Share Button */}
        <button
          type="button"
          onClick={handleShare}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)] transition-colors shadow-2xs cursor-pointer"
        >
          <Share2 className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Share</span>
        </button>

        {/* More Actions Menu with Portaled Dropdown */}
        <Dropdown
          align="right"
          menuWidth="w-56"
          items={moreDropdownItems}
          trigger={
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              title="More Actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </div>
          }
        />

        {/* Docium AI Action Button */}
        <button
          type="button"
          onClick={onToggleAiPanel}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
            aiDocked
              ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-2xs'
              : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
          title="Toggle Docium AI Workspace"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Docium AI</span>
        </button>
      </div>
    </div>
  );
}

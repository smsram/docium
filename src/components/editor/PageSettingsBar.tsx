'use client';

import React, { useState, useRef } from 'react';
import { type Editor } from '@tiptap/react';
import { useWorkspaceStore } from '@/lib/store';
import {
  FileText,
  Sliders,
  ZoomIn,
  ZoomOut,
  Download,
  Upload,
  AlignLeft,
  Sparkles,
  Printer,
  ChevronDown,
  Maximize2,
  FileDown,
  Code2,
} from 'lucide-react';

interface PageSettingsBarProps {
  editor: Editor | null;
  title: string;
  onImportMarkdown: (text: string) => void;
}

export function PageSettingsBar({ editor, title, onImportMarkdown }: PageSettingsBarProps) {
  const {
    zoomLevel,
    setZoomLevel,
    outlinePanelOpen,
    setOutlinePanelOpen,
    aiPanelOpen,
    setAiPanelOpen,
    activePageSize,
    setActivePageSize,
    activeOrientation,
    setActiveOrientation,
    activeMargins,
    setActiveMargins,
  } = useWorkspaceStore();

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleZoom = (delta: number) => {
    const next = Math.min(200, Math.max(50, zoomLevel + delta));
    setZoomLevel(next);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportMarkdown = () => {
    if (!editor) return;
    const html = editor.getHTML();
    // Simple HTML to Markdown conversion for export
    const md = html
      .replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em>(.*?)<\/em>/gi, '*$1*')
      .replace(/<code>(.*?)<\/code>/gi, '`$1`')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<[^>]+>/g, '');

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleExportHtml = () => {
    if (!editor) return;
    const html = editor.getHTML();
    const fullHtml = `<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:sans-serif;line-height:1.6;max-width:800px;margin:40px auto;padding:20px;color:#171c19;}table{border-collapse:collapse;width:100%;margin:20px 0;}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left;}</style></head><body>${html}</body></html>`;
    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) onImportMarkdown(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-1.5 text-xs text-[var(--text)] select-none">
      {/* Left: Outline & Page Setup */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOutlinePanelOpen(!outlinePanelOpen)}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
            outlinePanelOpen ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold' : 'hover:bg-[var(--accent)] text-[var(--text-muted)]'
          }`}
          title="Toggle Document Outline"
        >
          <AlignLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Outline</span>
        </button>

        {/* Page Setup Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPageMenu(!showPageMenu)}
            className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              Page: {activePageSize} ({activeOrientation})
            </span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {showPageMenu && (
            <div
              className="absolute left-0 top-full mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl z-50 text-xs space-y-2"
              onMouseLeave={() => setShowPageMenu(false)}
            >
              <div>
                <span className="font-semibold text-[10px] uppercase text-[var(--text-muted)]">Page Format</span>
                <div className="mt-1 flex gap-1">
                  {(['A4', 'Letter', 'Legal'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setActivePageSize(size)}
                      className={`flex-1 rounded py-1 text-center font-medium ${
                        activePageSize === size ? 'bg-[var(--primary)] text-white' : 'bg-[var(--accent)] text-[var(--text)]'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-semibold text-[10px] uppercase text-[var(--text-muted)]">Orientation</span>
                <div className="mt-1 flex gap-1">
                  {(['portrait', 'landscape'] as const).map((orient) => (
                    <button
                      key={orient}
                      onClick={() => setActiveOrientation(orient)}
                      className={`flex-1 rounded py-1 text-center capitalize font-medium ${
                        activeOrientation === orient ? 'bg-[var(--primary)] text-white' : 'bg-[var(--accent)] text-[var(--text)]'
                      }`}
                    >
                      {orient}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="font-semibold text-[10px] uppercase text-[var(--text-muted)]">Margins</span>
                <div className="mt-1 flex gap-1">
                  {(['normal', 'narrow', 'wide'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setActiveMargins(m)}
                      className={`flex-1 rounded py-1 text-center capitalize font-medium ${
                        activeMargins === m ? 'bg-[var(--primary)] text-white' : 'bg-[var(--accent)] text-[var(--text)]'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Zoom controls, Import/Export, AI Panel Toggle */}
      <div className="flex items-center gap-2">
        {/* Zoom controls */}
        <div className="hidden md:flex items-center gap-1 rounded bg-[var(--accent)] px-1.5 py-0.5 border border-[var(--border)]">
          <button
            onClick={() => handleZoom(-10)}
            className="p-1 hover:text-[var(--primary)]"
            title="Zoom out"
          >
            <ZoomOut className="h-3 w-3" />
          </button>
          <span className="w-10 text-center font-mono text-[11px] font-medium">{zoomLevel}%</span>
          <button
            onClick={() => handleZoom(10)}
            className="p-1 hover:text-[var(--primary)]"
            title="Zoom in"
          >
            <ZoomIn className="h-3 w-3" />
          </button>
        </div>

        {/* Markdown Import */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
          title="Import Markdown file"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Import</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".md,.txt,.markdown"
          className="hidden"
        />

        {/* Export Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[var(--text)] hover:bg-[var(--accent)] transition-colors shadow-2xs font-medium"
          >
            <Download className="h-3.5 w-3.5 text-[var(--primary)]" />
            <span>Export</span>
            <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" />
          </button>

          {showExportMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl z-50 text-xs"
              onMouseLeave={() => setShowExportMenu(false)}
            >
              <button
                onClick={handleExportMarkdown}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[var(--accent)]"
              >
                <FileDown className="h-3.5 w-3.5 text-[var(--primary)]" />
                <span>Markdown (.md)</span>
              </button>
              <button
                onClick={handleExportHtml}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[var(--accent)]"
              >
                <Code2 className="h-3.5 w-3.5 text-blue-500" />
                <span>Clean HTML (.html)</span>
              </button>
              <button
                onClick={handlePrint}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left hover:bg-[var(--accent)]"
              >
                <Printer className="h-3.5 w-3.5 text-emerald-600" />
                <span>Print / PDF Document</span>
              </button>
            </div>
          )}
        </div>

        {/* AI Assistant Toggle Button */}
        <button
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            aiPanelOpen
              ? 'bg-[var(--primary)] text-white'
              : 'bg-[var(--primary-light)] text-[var(--primary)] hover:bg-[var(--secondary-light)]'
          }`}
          title="Toggle AI Sidecar"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Assist</span>
        </button>
      </div>
    </div>
  );
}

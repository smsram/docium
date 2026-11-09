'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useWorkspaceStore } from '@/lib/store';
import { WorkspaceAI } from '@/components/workspace/WorkspaceAI';
import {
  ArrowLeft,
  FileCheck,
  ZoomIn,
  ZoomOut,
  Download,
  Share2,
  Star,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  MessageSquare,
} from 'lucide-react';

interface PdfViewerProps {
  pdfId: string;
  showBackToHome?: boolean;
}

export function PdfViewer({ pdfId, showBackToHome = true }: PdfViewerProps) {
  const { pdfs, toggleStar } = useWorkspaceStore();
  const pdf = pdfs.find((p) => p.id === pdfId);

  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);

  const totalPages = pdf?.pageCount || 12;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 15, 60));

  return (
    <div className="flex flex-col h-full bg-[var(--background)] text-[var(--text)]">
      {/* Top Header */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 shrink-0 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          {showBackToHome && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors mr-1 shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
          )}

          <FileCheck className="h-4 w-4 text-red-600 shrink-0" />
          <span className="font-semibold text-sm text-[var(--text)] truncate max-w-[220px] sm:max-w-md">
            {pdf?.title || 'Document.pdf'}
          </span>
          <span className="text-[10px] font-mono rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 px-1.5 py-0.2 border border-red-200 dark:border-red-900/40">
            PDF
          </span>
        </div>

        {/* Page navigation & Zoom controls */}
        <div className="flex items-center gap-2">
          {/* Page Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--text-muted)]">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage <= 1}
              className="hover:text-[var(--text)] disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="font-mono text-[11px] px-1">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage >= totalPages}
              className="hover:text-[var(--text)] disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="hidden sm:flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-1.5 py-1 text-xs text-[var(--text-muted)]">
            <button onClick={handleZoomOut} className="hover:text-[var(--text)] px-1">
              <ZoomOut className="h-3 w-3" />
            </button>
            <span className="font-mono text-[10px] w-8 text-center">{zoom}%</span>
            <button onClick={handleZoomIn} className="hover:text-[var(--text)] px-1">
              <ZoomIn className="h-3 w-3" />
            </button>
          </div>

          {/* Actions */}
          <button
            onClick={() => pdf && toggleStar(pdf.id)}
            className={`p-1.5 rounded transition-colors ${
              pdf?.starred ? 'text-amber-500' : 'text-[var(--text-muted)] hover:bg-[var(--accent)]'
            }`}
          >
            <Star className={`h-4 w-4 ${pdf?.starred ? 'fill-amber-500' : ''}`} />
          </button>

          <button
            onClick={() => alert('PDF export generated.')}
            className="flex items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--accent)] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Area: Canvas + Docked WorkspaceAI */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* PDF Document Canvas */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 flex justify-center bg-[var(--background)]">
          <div
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease-out',
            }}
            className="w-[816px] min-h-[1056px] bg-[var(--surface)] border border-[var(--border)] rounded-sm shadow-md flex flex-col justify-between p-12 my-2 relative"
          >
            {/* Rendered PDF Page Mock */}
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
                <span className="text-xs font-mono text-[var(--text-muted)] uppercase">
                  CONFIDENTIAL VENDOR AUDIT
                </span>
                <span className="text-xs font-mono text-[var(--text-muted)]">
                  PAGE {currentPage} OF {totalPages}
                </span>
              </div>

              <div className="space-y-4">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
                  {pdf?.title.replace('.pdf', '') || 'Compliance & Architecture Review'}
                </h1>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                  Evaluated security controls, data protection safeguards, and cryptographic resilience protocols for Docium multi-tenant infrastructure.
                </p>

                {/* Sample Highlight Annotation */}
                <div className="bg-amber-100/70 dark:bg-amber-950/40 border-l-2 border-amber-500 p-3 rounded-r text-xs leading-relaxed text-[var(--text)]">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    <Highlighter className="h-3 w-3" />
                    <span>Highlighted Finding — Section 3.2</span>
                  </div>
                  All client workspace data partitions enforce AES-256 GCM encryption at rest with tenant-isolated customer-managed keys. Audit observation verified without deviation.
                </div>

                <div className="space-y-2 pt-2">
                  <h3 className="text-sm font-semibold text-[var(--text)]">
                    3. Network Boundary &amp; Latency SLAs
                  </h3>
                  <p className="text-xs text-[var(--text)] leading-relaxed">
                    Zero-trust mutual TLS (mTLS) enforcement operates across all cluster gateways with sub-5ms packet inspection overhead.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-4 text-[10px] text-[var(--text-muted)]">
              <span>{pdf?.size || '2.8 MB'} • Verified Cryptographic Signature</span>
              <span className="font-mono">Page {currentPage}</span>
            </div>
          </div>
        </div>

        {/* Unified Reusable AI Component */}
        <WorkspaceAI
          workspaceId={pdfId}
          documentFormat="pdf"
          onApplyAction={(type, payload) => {
            alert(`AI Action executed on PDF: ${type}`);
          }}
        />
      </div>
    </div>
  );
}


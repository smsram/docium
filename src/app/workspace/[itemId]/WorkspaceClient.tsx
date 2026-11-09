'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspaceStore } from '@/lib/store';
import { DocumentEditor } from '@/components/editor/DocumentEditor';
import { SpreadsheetEditor } from '@/components/sheets/SpreadsheetEditor';
import { PresentationEditor } from '@/components/slides/PresentationEditor';
import { PdfViewer } from '@/components/pdf/PdfViewer';
import {
  FileText,
  AlertCircle,
  Home,
} from 'lucide-react';

interface WorkspaceClientProps {
  itemId: string;
}

export function WorkspaceClient({ itemId }: WorkspaceClientProps) {
  const [mounted, setMounted] = useState(false);
  const { getItemById } = useWorkspaceStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  const item = getItemById(itemId);

  // Sync document title with item title
  useEffect(() => {
    if (item?.title) {
      document.title = `${item.title} — Docium`;
    }
    return () => {
      document.title = 'Docium — AI Productivity Workspace';
    };
  }, [item?.title]);

  // Stable SSR & initial hydration skeleton (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div className="h-screen w-screen flex flex-col bg-[var(--background)] animate-pulse select-none overflow-hidden">
        {/* Top bar skeleton */}
        <div className="h-12 border-b border-[var(--border)] bg-[var(--surface)] px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-6 w-16 bg-[var(--accent)] rounded-lg" />
            <div className="h-4 w-4 bg-[var(--accent)] rounded" />
            <div className="h-5 w-44 bg-[var(--accent)] rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-20 bg-[var(--accent)] rounded-lg" />
            <div className="h-7 w-20 bg-[var(--accent)] rounded-lg" />
            <div className="h-7 w-24 bg-[var(--accent)] rounded-lg" />
          </div>
        </div>

        {/* Ribbon toolbar skeleton */}
        <div className="h-16 border-b border-[var(--border)] bg-[var(--surface)] px-4 flex items-center gap-3 shrink-0">
          <div className="h-7 w-32 bg-[var(--accent)] rounded-lg" />
          <div className="h-7 w-20 bg-[var(--accent)] rounded-lg" />
          <div className="h-7 w-28 bg-[var(--accent)] rounded-lg" />
          <div className="h-7 w-36 bg-[var(--accent)] rounded-lg" />
        </div>

        {/* Paper canvas skeleton */}
        <div className="flex-1 flex items-center justify-center p-8 bg-[var(--background)]">
          <div className="w-[816px] h-[950px] max-w-full bg-[var(--surface)] border border-[var(--border)] rounded-sm shadow-md opacity-60 flex flex-col p-12 space-y-4">
            <div className="h-8 w-2/5 bg-[var(--accent)] rounded" />
            <div className="h-4 w-full bg-[var(--accent)] rounded" />
            <div className="h-4 w-5/6 bg-[var(--accent)] rounded" />
            <div className="h-4 w-4/6 bg-[var(--accent)] rounded" />
            <div className="h-28 w-full bg-[var(--accent)] rounded mt-4" />
          </div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[var(--background)] p-6 text-center space-y-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--text-muted)] border border-[var(--border)]">
          <AlertCircle className="h-6 w-6 text-amber-500" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h1 className="text-base font-semibold text-[var(--text)]">Workspace Not Found</h1>
          <p className="text-xs text-[var(--text-muted)] leading-relaxed">
            The workspace item you are trying to access ({itemId}) could not be located in your local storage. It may have been deleted.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] text-white px-4 py-2 text-xs font-medium hover:bg-[var(--primary-hover)] transition-all shadow-xs"
        >
          <Home className="h-4 w-4" />
          <span>Return to Workspace Home</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[var(--background)] text-[var(--text)]">
      {item.type === 'doc' && (
        <DocumentEditor documentId={itemId} showBackToHome={true} />
      )}
      {item.type === 'sheet' && (
        <SpreadsheetEditor sheetDocId={itemId} showBackToHome={true} />
      )}
      {item.type === 'slide' && (
        <PresentationEditor presentationId={itemId} showBackToHome={true} />
      )}
      {item.type === 'pdf' && (
        <PdfViewer pdfId={itemId} showBackToHome={true} />
      )}
    </div>
  );
}

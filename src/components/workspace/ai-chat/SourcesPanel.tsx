'use client';

import React from 'react';
import { ResearchSource } from '@/lib/types';
import {
  FileText,
  Link2,
  Image as ImageIcon,
  Table,
  Presentation,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';

interface SourcesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sources: ResearchSource[];
  onRemoveSource: (sourceId: string) => void;
  onRetrySource?: (source: ResearchSource) => void;
}

export function SourcesPanel({
  isOpen,
  onClose,
  sources,
  onRemoveSource,
  onRetrySource,
}: SourcesPanelProps) {
  if (!isOpen) return null;

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'url':
        return Link2;
      case 'xlsx':
      case 'csv':
        return Table;
      case 'pptx':
        return Presentation;
      case 'image':
        return ImageIcon;
      default:
        return FileText;
    }
  };

  return (
    <div className="absolute top-12 right-0 bottom-0 z-40 w-80 max-w-[85vw] border-l border-[var(--border)] bg-[var(--surface)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 select-none text-xs">
      {/* Header */}
      <div className="flex h-11 items-center justify-between border-b border-[var(--border)] px-4 bg-[var(--surface-elevated)] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs text-[var(--text)]">Conversation Sources</span>
          <span className="rounded-full bg-[var(--primary-light)] text-[var(--primary)] px-2 py-0.5 text-[10px] font-mono font-bold">
            {sources.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer"
          title="Close Sources"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Source List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-[var(--text-muted)]">
            <FileText className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-xs font-medium">No sources attached</p>
            <p className="text-[10px] max-w-[200px] mt-1">
              Attach files or links using the Attach button in the composer below.
            </p>
          </div>
        ) : (
          sources.map((src) => {
            const Icon = getSourceIcon(src.type);
            const isReady = src.status === 'ready' || src.status === 'indexed';
            const isProcessing = src.status === 'processing' || src.status === 'syncing';
            const isError = src.status === 'error';

            return (
              <div
                key={src.id}
                className="group relative flex flex-col p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--primary)]/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="p-1.5 rounded-lg bg-[var(--surface)] text-[var(--primary)] border border-[var(--border-subtle)] shrink-0 mt-0.5">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-[var(--text)] truncate" title={src.title}>
                        {src.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-[var(--text-muted)] font-mono">
                        <span className="uppercase">{src.type}</span>
                        {src.fileSize && <span>• {src.fileSize}</span>}
                        {src.chunkCount !== undefined && <span>• {src.chunkCount} chunks</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {src.sourceUrl && (
                      <a
                        href={src.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]"
                        title="Open external link"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    {isError && onRetrySource && (
                      <button
                        type="button"
                        onClick={() => onRetrySource(src)}
                        className="p-1 rounded hover:bg-[var(--surface)] text-amber-500"
                        title="Retry processing"
                      >
                        <RefreshCw className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveSource(src.id)}
                      className="p-1 rounded hover:bg-[var(--surface)] text-rose-500 hover:text-rose-600 cursor-pointer"
                      title="Remove source"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-[var(--border-subtle)] text-[10px]">
                  {isReady && (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Ready for retrieval</span>
                    </span>
                  )}
                  {isProcessing && (
                    <span className="flex items-center gap-1 text-amber-600 font-medium animate-pulse">
                      <Clock className="h-3 w-3" />
                      <span>Indexing content...</span>
                    </span>
                  )}
                  {isError && (
                    <span className="flex items-center gap-1 text-rose-600 font-medium">
                      <AlertCircle className="h-3 w-3" />
                      <span>Processing failed</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}


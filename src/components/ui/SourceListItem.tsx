'use client';

import React from 'react';
import { ResearchSource } from '@/lib/types';
import { Checkbox } from './Checkbox';
import {
  FileText,
  Table,
  Presentation,
  FileCheck,
  Globe,
  Trash2,
  ExternalLink,
  Eye,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface SourceListItemProps {
  source: ResearchSource;
  onToggleInContext?: (inContext: boolean) => void;
  onRemove?: () => void;
  onPreview?: () => void;
  className?: string;
}

export function SourceListItem({
  source,
  onToggleInContext,
  onRemove,
  onPreview,
  className = '',
}: SourceListItemProps) {
  const getIcon = () => {
    switch (source.type) {
      case 'url':
        return <Globe className="h-4 w-4 text-[var(--primary)]" />;
      case 'pdf':
        return <FileCheck className="h-4 w-4 text-red-600" />;
      case 'xlsx':
        return <Table className="h-4 w-4 text-[var(--secondary)]" />;
      case 'pptx':
        return <Presentation className="h-4 w-4 text-amber-600" />;
      default:
        return <FileText className="h-4 w-4 text-[var(--primary)]" />;
    }
  };

  const isIncluded = source.isIncludedInContext !== false;

  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--primary)] transition-all flex flex-col gap-2.5 shadow-2xs ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] shrink-0 mt-0.5">
            {getIcon()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h4 className="text-xs font-semibold text-[var(--text)] truncate max-w-[200px] sm:max-w-xs">
                {source.title}
              </h4>
              <span className="text-[10px] font-mono uppercase rounded bg-[var(--accent)] px-1.5 py-0.2 text-[var(--text-muted)]">
                {source.type}
              </span>
              {source.scope === 'document' ? (
                <span className="text-[10px] rounded bg-[var(--primary-light)] text-[var(--primary)] font-semibold px-1.5 py-0.2">
                  Doc Source
                </span>
              ) : (
                <span className="text-[10px] rounded bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-300 font-medium px-1.5 py-0.2">
                  Chat Attachment
                </span>
              )}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
              {source.snippet || 'No text snippet available.'}
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-1 shrink-0">
          {source.status === 'indexed' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span className="hidden sm:inline">Indexed</span>
            </span>
          ) : source.status === 'processing' || source.status === 'syncing' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Indexing</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-500/20 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-400">
              <AlertCircle className="h-3 w-3" />
              <span>Error</span>
            </span>
          )}
        </div>
      </div>

      {/* Footer Controls: Include in Context Switch + Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] text-[11px]">
        {onToggleInContext ? (
          <Checkbox
            checked={isIncluded}
            onChange={(checked) => onToggleInContext(checked)}
            label="Include in AI context"
          />
        ) : (
          <span className="text-[10px] text-[var(--text-muted)]">
            {source.fileSize || 'Standard source'}
          </span>
        )}

        <div className="flex items-center gap-1 text-[var(--text-muted)]">
          {onPreview && (
            <button
              onClick={onPreview}
              className="p-1 rounded hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors"
              title="Preview source content"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          )}

          {source.sourceUrl && (
            <a
              href={source.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:text-[var(--primary)] hover:bg-[var(--accent)] transition-colors"
              title="Open external source URL"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded hover:text-rose-500 hover:bg-[var(--accent)] transition-colors ml-1"
              title="Remove source"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


'use client';

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AiAvatar } from './AiAvatar';

interface ChatEmptyStateProps {
  onSelectPrompt: (prompt: string) => void;
}

export function ChatEmptyState({ onSelectPrompt }: ChatEmptyStateProps) {
  const suggestions = [
    'Synthesize attached sources and outline key takeaways',
    'Compare quarterly performance trends with a bar chart',
    'Search the web for recent architectural specifications',
    'Calculate revenue projections and growth percentages',
  ];

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 text-center select-none my-auto">
      {/* Brand Identity */}
      <div className="mb-4">
        <AiAvatar size="lg" priority />
      </div>

      <h2 className="text-base font-bold text-[var(--text)] tracking-tight mb-1">
        Docium AI
      </h2>
      <p className="text-xs text-[var(--text-muted)] max-w-sm leading-relaxed mb-6">
        Your universal workspace intelligence partner. Ask questions, analyze attached files, research topics, or generate charts.
      </p>

      {/* Suggested prompts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
        {suggestions.map((prompt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onSelectPrompt(prompt)}
            className="group flex items-start justify-between p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--accent)] hover:border-[var(--primary)]/40 text-left transition-all cursor-pointer text-xs"
          >
            <span className="text-[11px] text-[var(--text)] group-hover:text-[var(--primary)] line-clamp-2 leading-snug">
              {prompt}
            </span>
            <ArrowUpRight className="h-3 w-3 text-[var(--text-muted)] group-hover:text-[var(--primary)] shrink-0 ml-1.5 opacity-60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}


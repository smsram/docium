'use client';

import React from 'react';
import Link from 'next/link';
import {
  Globe,
  Image as ImageIcon,
  Sparkles,
  BarChart2,
  FileEdit,
  AlertCircle,
} from 'lucide-react';

interface CapabilitySelectorProps {
  selectedTools: {
    internetSearch?: boolean;
    imageSearch?: boolean;
    imageGeneration?: boolean;
    diagramsAndGraphs?: boolean;
    documentOperations?: boolean;
  };
  onToggleTool: (toolKey: string, enabled: boolean) => void;
  availableTools?: {
    internetSearch?: boolean;
    imageSearch?: boolean;
    imageGeneration?: boolean;
    diagramsAndGraphs?: boolean;
    documentOperations?: boolean;
  };
  className?: string;
}

export function CapabilitySelector({
  selectedTools,
  onToggleTool,
  availableTools = {
    internetSearch: true,
    imageSearch: true,
    imageGeneration: true,
    diagramsAndGraphs: true,
    documentOperations: true,
  },
  className = '',
}: CapabilitySelectorProps) {
  const tools = [
    {
      key: 'internetSearch',
      label: 'Web Search',
      icon: Globe,
      available: availableTools.internetSearch ?? true,
      hint: 'Search internet for fresh facts',
    },
    {
      key: 'imageSearch',
      label: 'Image Search',
      icon: ImageIcon,
      available: availableTools.imageSearch ?? true,
      hint: 'Search & embed reference photos',
    },
    {
      key: 'imageGeneration',
      label: 'Image Gen',
      icon: Sparkles,
      available: availableTools.imageGeneration ?? true,
      hint: 'Synthesize illustrations & art',
    },
    {
      key: 'diagramsAndGraphs',
      label: 'Diagrams & Charts',
      icon: BarChart2,
      available: true, // Local engine always available
      hint: 'Mermaid diagrams & SVG charts (Local engine)',
    },
    {
      key: 'documentOperations',
      label: 'Doc Operations',
      icon: FileEdit,
      available: true,
      hint: 'Apply edits directly to canvas',
    },
  ];

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {tools.map((tool) => {
        const isSelected = selectedTools[tool.key as keyof typeof selectedTools];
        const Icon = tool.icon;

        if (!tool.available) {
          return (
            <Link
              key={tool.key}
              href="/settings/ai"
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--accent)]/40 px-2 py-1 text-[11px] text-[var(--text-muted)] opacity-60 hover:opacity-100 transition-opacity"
              title={`${tool.label} requires provider configuration. Click to configure.`}
            >
              <Icon className="h-3 w-3" />
              <span>{tool.label}</span>
              <AlertCircle className="h-2.5 w-2.5 text-amber-500" />
            </Link>
          );
        }

        return (
          <button
            key={tool.key}
            type="button"
            onClick={() => onToggleTool(tool.key, !isSelected)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all cursor-pointer ${
              isSelected
                ? 'bg-[var(--primary-light)] text-[var(--primary)] border border-[var(--primary)]/30 font-semibold shadow-2xs'
                : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
            title={tool.hint}
          >
            <Icon className={`h-3 w-3 ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}`} />
            <span>{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}


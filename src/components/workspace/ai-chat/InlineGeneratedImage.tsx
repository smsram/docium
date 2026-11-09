'use client';

import React from 'react';
import { GeneratedImageMetadata } from '@/lib/types';
import { ImageIcon, Download, Sparkles } from 'lucide-react';

interface InlineGeneratedImageProps {
  image: GeneratedImageMetadata;
  className?: string;
}

export function InlineGeneratedImage({ image, className = '' }: InlineGeneratedImageProps) {
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = image.url;
    a.download = `docium-ai-generated-${image.id}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={`my-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-xs ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5 text-xs bg-[var(--surface)]">
        <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--primary)]" />
          <span>Generated Illustration</span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">({image.aspectRatio})</span>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
          title="Download image"
        >
          <Download className="h-3 w-3" />
          <span>Save</span>
        </button>
      </div>

      {/* Image Preview */}
      <div className="relative w-full flex items-center justify-center bg-black/5 overflow-hidden">
        {image.url.startsWith('data:image/') || image.url.startsWith('blob:') || image.url.startsWith('http') ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.prompt}
            className="w-full max-h-[380px] object-contain transition-transform"
          />
        ) : (
          <div className="h-48 flex items-center justify-center text-xs text-[var(--text-muted)]">
            <ImageIcon className="h-6 w-6 mr-2 opacity-50" />
            <span>Image asset ready</span>
          </div>
        )}
      </div>

      {/* Caption & Prompt */}
      <div className="p-2.5 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] bg-[var(--surface)]">
        <span className="font-semibold text-[var(--text)] mr-1">Prompt:</span>
        <span className="italic">&ldquo;{image.prompt}&rdquo;</span>
      </div>
    </div>
  );
}


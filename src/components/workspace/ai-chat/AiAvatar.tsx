'use client';

import React from 'react';
import Image from 'next/image';

export interface AiAvatarProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | number;
  className?: string;
  isGenerating?: boolean;
  priority?: boolean;
}

/**
 * DOCIUM AI Avatar Component
 * Consistently renders the official AI identity image (/docium-ai.png)
 * across all AI chat interfaces, preserving aspect ratio and preventing 404s.
 */
export function AiAvatar({
  size = 'sm',
  className = '',
  isGenerating = false,
  priority = false,
}: AiAvatarProps) {
  let dimension = 20;
  if (typeof size === 'number') {
    dimension = size;
  } else if (size === 'xs') {
    dimension = 16;
  } else if (size === 'sm') {
    dimension = 20;
  } else if (size === 'md') {
    dimension = 28;
  } else if (size === 'lg') {
    dimension = 44;
  }

  return (
    <div
      className={`relative shrink-0 rounded-lg overflow-hidden flex items-center justify-center bg-[var(--surface-elevated)] border border-[var(--border-subtle)] shadow-2xs select-none ${className}`}
      style={{ width: dimension, height: dimension }}
      title="Docium AI"
    >
      <Image
        src="/docium-ai.png"
        alt="Docium AI"
        width={dimension}
        height={dimension}
        className="object-contain p-0.5"
        priority={priority}
      />
      {isGenerating && (
        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2 pointer-events-none">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--primary)]" />
        </span>
      )}
    </div>
  );
}


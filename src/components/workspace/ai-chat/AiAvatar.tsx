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
      className={`relative shrink-0 flex items-center justify-center select-none ${className}`}
      style={{ width: dimension, height: dimension }}
      title="Docium AI"
    >
      <Image
        src="/docium-ai.png"
        alt="Docium AI"
        width={dimension}
        height={dimension}
        className="w-full h-full object-contain"
        priority={priority}
      />
    </div>
  );
}


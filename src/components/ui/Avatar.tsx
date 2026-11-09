'use client';

import React, { useState } from 'react';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  // Compute initials (e.g. "Sarah Chen" -> "SC")
  const getInitials = (n: string) => {
    if (!n) return 'U';
    const parts = n.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const sizeClasses = {
    sm: 'h-6 w-6 text-[10px]',
    md: 'h-7 w-7 text-xs',
    lg: 'h-9 w-9 text-xs',
    xl: 'h-16 w-16 text-lg font-bold',
  };

  const initials = getInitials(name);

  // Consistent background color generation based on name
  const colors = [
    'bg-[#245C45] text-white',
    'bg-[#398568] text-white',
    'bg-[#1e3a2f] text-[#ebf3ef]',
    'bg-[#2e5241] text-white',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden border border-[var(--border)] font-semibold select-none ${
        sizeClasses[size]
      } ${className}`}
    >
      {src && !imageFailed ? (
        // Using standard img with error fallback for reliable offline & external compatibility
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          onError={() => setImageFailed(true)}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <span className={`h-full w-full flex items-center justify-center ${colorClass}`}>
          {initials}
        </span>
      )}
    </div>
  );
}

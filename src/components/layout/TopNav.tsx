'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import {
  Search,
  Command,
  ChevronRight,
  Menu,
} from 'lucide-react';

export function TopNav() {
  const pathname = usePathname();
  const { setCommandPaletteOpen, toggleSidebar } = useWorkspaceStore();

  // Helper to format clean page title
  const getPageTitle = () => {
    if (pathname === '/') {
      return (
        <span className="text-xs font-semibold text-[var(--text)] tracking-tight">
          Create
        </span>
      );
    }

    if (pathname === '/files') {
      return (
        <span className="text-xs font-semibold text-[var(--text)] tracking-tight">
          Library
        </span>
      );
    }

    if (pathname === '/chat') {
      return (
        <span className="text-xs font-semibold text-[var(--text)] tracking-tight">
          AI Chat
        </span>
      );
    }

    if (pathname === '/templates') {
      return (
        <span className="text-xs font-semibold text-[var(--text)] tracking-tight">
          Templates
        </span>
      );
    }

    if (pathname === '/trash') {
      return (
        <span className="text-xs font-semibold text-[var(--text)] tracking-tight">
          Trash
        </span>
      );
    }

    if (pathname.startsWith('/settings')) {
      const section = pathname.split('/')[2];
      const sectionLabel =
        section === 'ai'
          ? 'AI & Providers'
          : section === 'appearance'
          ? 'Appearance'
          : section === 'general'
          ? 'General'
          : section === 'integrations'
          ? 'Integrations'
          : 'Settings';

      return (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link href="/settings/ai" className="hover:text-[var(--text)] transition-colors">
            Settings
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--text)] font-semibold tracking-tight">
            {sectionLabel}
          </span>
        </div>
      );
    }

    const parts = pathname.split('/').filter(Boolean);
    if (parts.length === 0) return <span className="text-xs font-semibold text-[var(--text)]">Workspace</span>;

    const main = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    if (parts.length > 1) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Link href={`/${parts[0]}`} className="hover:text-[var(--text)] transition-colors">
            {main}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="text-[var(--text)] font-medium truncate max-w-[200px] sm:max-w-[320px]">
            {parts[1]}
          </span>
        </div>
      );
    }
    return <span className="text-xs font-semibold text-[var(--text)]">{main}</span>;
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 sm:px-6 select-none">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 md:hidden items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors"
          title="Toggle Navigation"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="flex items-center">{getPageTitle()}</div>
      </div>

      {/* Right: Minimal Command Palette Trigger */}
      <div className="w-full max-w-xs sm:max-w-sm">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="hidden sm:inline">Search or jump to...</span>
            <span className="sm:hidden">Search...</span>
          </div>
          <kbd className="flex items-center gap-0.5 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-mono border border-[var(--border)] text-[var(--text-muted)]">
            <Command className="h-2.5 w-2.5" /> K
          </kbd>
        </button>
      </div>
    </header>
  );
}

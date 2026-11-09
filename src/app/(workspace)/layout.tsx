'use client';

import React, { Suspense } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';
import { CommandPalette } from '@/components/layout/CommandPalette';

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--background)] text-[var(--text)]">
      {/* Collapsible Left Sidebar */}
      <Suspense fallback={<div className="w-64 border-r border-[var(--border)] bg-[var(--surface)]" />}>
        <Sidebar />
      </Suspense>

      {/* Main Workspace Column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Suspense fallback={<div className="h-14 border-b border-[var(--border)] bg-[var(--surface)]" />}>
          <TopNav />
        </Suspense>

        <main className="flex-1 overflow-y-auto min-w-0">
          <Suspense fallback={<div className="p-8 text-xs text-[var(--text-muted)]">Loading workspace...</div>}>
            {children}
          </Suspense>
        </main>
      </div>

      {/* Global Command Palette */}
      <Suspense fallback={null}>
        <CommandPalette />
      </Suspense>
    </div>
  );
}

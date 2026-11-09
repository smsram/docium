'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useWorkspaceStore } from '@/lib/store';
import {
  FolderOpen,
  FileText,
  Table,
  Presentation,
  Layers,
  MessageSquare,
  LayoutTemplate,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Laptop,
  Plus,
} from 'lucide-react';

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTypeFilter = searchParams.get('type') || 'all';

  const {
    sidebarCollapsed,
    toggleSidebar,
    theme,
    setTheme,
    documents,
    sheets,
    slides,
  } = useWorkspaceStore();

  const [libraryExpanded, setLibraryExpanded] = useState(true);

  // Active counts for non-trashed items
  const activeDocs = documents.filter((d) => !d.trashed).length;
  const activeSheets = sheets.filter((s) => !s.trashed).length;
  const activeSlides = slides.filter((s) => !s.trashed).length;
  const totalActiveFiles = activeDocs + activeSheets + activeSlides;

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const isLibraryActive = pathname === '/files';
  const isChatActive = pathname === '/chat';
  const isTemplatesActive = pathname === '/templates';
  const isTrashActive = pathname === '/trash';
  const isSettingsActive = pathname.startsWith('/settings');

  const librarySubItems = [
    { label: 'All Files', type: 'all', count: totalActiveFiles, icon: Layers },
    { label: 'Documents', type: 'doc', count: activeDocs, icon: FileText, color: 'text-[var(--primary)]' },
    { label: 'Spreadsheets', type: 'sheet', count: activeSheets, icon: Table, color: 'text-[var(--secondary)]' },
    { label: 'Presentations', type: 'slide', count: activeSlides, icon: Presentation, color: 'text-amber-600' },
  ];

  return (
    <aside
      className={`relative flex flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-all duration-200 z-30 shrink-0 select-none ${
        sidebarCollapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* ==================================================== */}
      {/* HEADER: LOGO WITH COLLAPSE / EXPAND OVERLAY CONTROL */}
      {/* ==================================================== */}
      {sidebarCollapsed ? (
        <div className="flex h-14 items-center justify-center border-b border-[var(--border)] px-2">
          {/* Collapsed state: Hovering over the logo reveals the expand chevron overlay */}
          <button
            onClick={toggleSidebar}
            title="Expand sidebar"
            className="group relative flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-1 hover:border-[var(--primary)] hover:bg-[var(--accent)] transition-all cursor-pointer"
          >
            {/* Logo */}
            <div className="relative h-6 w-6 transition-opacity duration-150 group-hover:opacity-20">
              <Image
                src="/docium.png"
                alt="Docium"
                fill
                sizes="24px"
                className="object-contain"
                priority
              />
            </div>
            {/* Hover overlay icon */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[var(--primary)]">
              <ChevronRight className="h-4 w-4" />
            </div>
          </button>
        </div>
      ) : (
        <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-3.5">
          {/* Expanded state: Logo and Workspace Title */}
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden group">
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5">
              <Image
                src="/docium.png"
                alt="Docium Logo"
                fill
                sizes="28px"
                className="object-contain"
                priority
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm tracking-tight text-[var(--text)] group-hover:text-[var(--primary)] transition-colors truncate">
                Docium
              </span>
              <span className="text-[10px] text-[var(--text-muted)] leading-none font-medium">
                Workspace
              </span>
            </div>
          </Link>

          {/* Normal collapse control beside logo */}
          <button
            onClick={toggleSidebar}
            title="Collapse sidebar"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* NEW COLLECTION BUTTON (Navigates to Creation Interface) */}
      {/* ==================================================== */}
      <div className="p-2.5">
        <Link
          href="/"
          className={`flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-all font-medium text-xs shadow-xs ${
            sidebarCollapsed ? 'h-9 w-full' : 'h-9 w-full px-3'
          }`}
          title="Create with AI"
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && <span>New Collection</span>}
        </Link>
      </div>

      {/* ==================================================== */}
      {/* NAVIGATION ITEMS */}
      {/* ==================================================== */}
      <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
        {/* 1. LIBRARY DROPDOWN ITEM */}
        <div>
          {sidebarCollapsed ? (
            <Link
              href="/files"
              title="Library"
              className={`flex h-9 w-full items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                isLibraryActive
                  ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                  : 'text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
              }`}
            >
              <FolderOpen
                className={`h-4 w-4 shrink-0 ${
                  isLibraryActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                }`}
              />
            </Link>
          ) : (
            <div>
              <div
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium transition-colors cursor-pointer ${
                  isLibraryActive
                    ? 'bg-[var(--primary-light)]/60 text-[var(--primary)] font-semibold'
                    : 'text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                }`}
                onClick={() => setLibraryExpanded(!libraryExpanded)}
              >
                <Link
                  href="/files"
                  className="flex items-center gap-2.5 min-w-0 flex-1"
                  onClick={(e) => {
                    // If already on /files, toggle dropdown instead of re-navigating
                    if (pathname === '/files') {
                      e.preventDefault();
                      setLibraryExpanded(!libraryExpanded);
                    }
                  }}
                >
                  <FolderOpen
                    className={`h-4 w-4 shrink-0 ${
                      isLibraryActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
                    }`}
                  />
                  <span className="truncate">Library</span>
                </Link>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-mono text-[var(--text-muted)] px-1.5 py-0.2 rounded bg-[var(--accent)]">
                    {totalActiveFiles}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLibraryExpanded(!libraryExpanded);
                    }}
                    className="p-0.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                    title={libraryExpanded ? 'Collapse Library' : 'Expand Library'}
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-150 ${
                        libraryExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Collapsible Sub-Items */}
              {libraryExpanded && (
                <div className="mt-1 ml-4 pl-2 border-l border-[var(--border)] space-y-0.5">
                  {librarySubItems.map((sub) => {
                    const SubIcon = sub.icon;
                    const isSubActive =
                      isLibraryActive &&
                      (sub.type === 'all'
                        ? currentTypeFilter === 'all'
                        : currentTypeFilter === sub.type);

                    const targetHref = sub.type === 'all' ? '/files' : `/files?type=${sub.type}`;

                    return (
                      <Link
                        key={sub.type}
                        href={targetHref}
                        className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                          isSubActive
                            ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                            : 'text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <SubIcon className={`h-3.5 w-3.5 shrink-0 ${sub.color || ''}`} />
                          <span className="truncate text-[11px]">{sub.label}</span>
                        </div>
                        {sub.count > 0 && (
                          <span className="text-[10px] font-mono opacity-70">
                            {sub.count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2. AI CHAT NAVIGATION ITEM */}
        <Link
          href="/chat"
          title={sidebarCollapsed ? 'AI Chat' : undefined}
          className={`flex items-center rounded-lg text-xs font-medium transition-colors ${
            sidebarCollapsed ? 'justify-center h-9 px-0' : 'justify-between px-2.5 py-2'
          } ${
            isChatActive
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
          }`}
        >
          <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-2.5'} min-w-0`}>
            <MessageSquare
              className={`h-4 w-4 shrink-0 ${
                isChatActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
              }`}
            />
            {!sidebarCollapsed && <span className="truncate">AI Chat</span>}
          </div>
        </Link>

        {/* 3. TEMPLATES */}
        <Link
          href="/templates"
          title={sidebarCollapsed ? 'Templates' : undefined}
          className={`flex items-center rounded-lg text-xs font-medium transition-colors ${
            sidebarCollapsed ? 'justify-center h-9 px-0' : 'justify-between px-2.5 py-2'
          } ${
            isTemplatesActive
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
          }`}
        >
          <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-2.5'} min-w-0`}>
            <LayoutTemplate
              className={`h-4 w-4 shrink-0 ${
                isTemplatesActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
              }`}
            />
            {!sidebarCollapsed && <span className="truncate">Templates</span>}
          </div>
        </Link>

        {/* 4. TRASH */}
        <Link
          href="/trash"
          title={sidebarCollapsed ? 'Trash' : undefined}
          className={`flex items-center rounded-lg text-xs font-medium transition-colors ${
            sidebarCollapsed ? 'justify-center h-9 px-0' : 'justify-between px-2.5 py-2'
          } ${
            isTrashActive
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
          }`}
        >
          <div className={`flex items-center ${sidebarCollapsed ? '' : 'gap-2.5'} min-w-0`}>
            <Trash2
              className={`h-4 w-4 shrink-0 ${
                isTrashActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
              }`}
            />
            {!sidebarCollapsed && <span className="truncate">Trash</span>}
          </div>
        </Link>
      </nav>

      {/* ==================================================== */}
      {/* FOOTER: THEME SWITCHER & SETTINGS LINK */}
      {/* ==================================================== */}
      <div className="mt-auto border-t border-[var(--border)] p-2 space-y-1">
        {/* Theme Quick Switcher */}
        <button
          onClick={cycleTheme}
          title={`Theme: ${theme} (Click to cycle Light / Dark / System)`}
          className={`flex w-full items-center rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors ${
            sidebarCollapsed ? 'justify-center px-0 h-9' : 'justify-between'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? (
              <Moon className="h-4 w-4 text-emerald-400 shrink-0" />
            ) : theme === 'light' ? (
              <Sun className="h-4 w-4 text-amber-500 shrink-0" />
            ) : (
              <Laptop className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
            )}
            {!sidebarCollapsed && (
              <span className="capitalize">{theme} Mode</span>
            )}
          </div>
          {!sidebarCollapsed && (
            <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">
              {theme}
            </span>
          )}
        </button>

        {/* Settings Navigation Link */}
        <Link
          href="/settings/ai"
          title={sidebarCollapsed ? 'Settings' : undefined}
          className={`flex items-center rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${
            isSettingsActive
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
              : 'text-[var(--text)] hover:bg-[var(--accent)] hover:text-[var(--text)]'
          } ${sidebarCollapsed ? 'justify-center px-0 h-9' : 'gap-2.5'}`}
        >
          <Settings
            className={`h-4 w-4 shrink-0 ${
              isSettingsActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'
            }`}
          />
          {!sidebarCollapsed && <span>Settings</span>}
        </Link>
      </div>
    </aside>
  );
}

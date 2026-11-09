'use client';

import React, { useState } from 'react';
import { type Editor } from '@tiptap/react';
import {
  DocumentPageSize,
  DocumentOrientation,
  MarginPreset,
  DocumentMargins,
  DocumentCitation,
} from '@/lib/types';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { HomeTab } from './HomeTab';
import { InsertTab } from './InsertTab';
import { LayoutTab } from './LayoutTab';
import { ReferencesTab } from './ReferencesTab';
import { ReviewTab } from './ReviewTab';
import { ViewTab } from './ViewTab';

export type RibbonTabKey = 'home' | 'insert' | 'layout' | 'references' | 'review' | 'view';

interface RibbonContainerProps {
  editor: Editor | null;
  // Layout states
  pageSize: DocumentPageSize;
  orientation: DocumentOrientation;
  marginPreset: MarginPreset;
  margins: DocumentMargins;
  columns: 1 | 2 | 3;
  onChangePageSize: (size: DocumentPageSize) => void;
  onChangeOrientation: (orientation: DocumentOrientation) => void;
  onChangeMarginPreset: (preset: MarginPreset) => void;
  onChangeMargins: (margins: DocumentMargins) => void;
  onChangeColumns: (cols: 1 | 2 | 3) => void;
  // Modals
  onOpenLinkModal: () => void;
  onOpenCitationModal: () => void;
  onOpenPageSetupModal: () => void;
  onOpenStatsModal: () => void;
  // Review & Comments
  citations: DocumentCitation[];
  commentsCount: number;
  unresolvedCount: number;
  commentsSidebarOpen: boolean;
  onToggleCommentsSidebar: () => void;
  onAddCommentFromSelection: () => void;
  suggestingMode: boolean;
  onToggleSuggestingMode: () => void;
  spellCheckEnabled: boolean;
  onToggleSpellCheck: () => void;
  // View states
  zoomLevel: number;
  onSetZoom: (zoom: number) => void;
  isPaginatedView: boolean;
  onTogglePaginatedView: () => void;
  showRuler: boolean;
  onToggleRuler: () => void;
  showOutline: boolean;
  onToggleOutline: () => void;
  showFormattingMarks: boolean;
  onToggleFormattingMarks: () => void;
  isFocusMode: boolean;
  onToggleFocusMode: () => void;
  // Format painter
  formatPainterActive: boolean;
  onToggleFormatPainter: () => void;
}

const TABS: { id: RibbonTabKey; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'insert', label: 'Insert' },
  { id: 'layout', label: 'Layout' },
  { id: 'references', label: 'References' },
  { id: 'review', label: 'Review' },
  { id: 'view', label: 'View' },
];

export function RibbonContainer({
  editor,
  pageSize,
  orientation,
  marginPreset,
  margins,
  columns,
  onChangePageSize,
  onChangeOrientation,
  onChangeMarginPreset,
  onChangeMargins,
  onChangeColumns,
  onOpenLinkModal,
  onOpenCitationModal,
  onOpenPageSetupModal,
  onOpenStatsModal,
  citations,
  commentsCount,
  unresolvedCount,
  commentsSidebarOpen,
  onToggleCommentsSidebar,
  onAddCommentFromSelection,
  suggestingMode,
  onToggleSuggestingMode,
  spellCheckEnabled,
  onToggleSpellCheck,
  zoomLevel,
  onSetZoom,
  isPaginatedView,
  onTogglePaginatedView,
  showRuler,
  onToggleRuler,
  showOutline,
  onToggleOutline,
  showFormattingMarks,
  onToggleFormattingMarks,
  isFocusMode,
  onToggleFocusMode,
  formatPainterActive,
  onToggleFormatPainter,
}: RibbonContainerProps) {
  const [activeTab, setActiveTab] = useState<RibbonTabKey>('home');
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isFocusMode) {
    return null; // Ribbon is hidden in focus mode
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)] shrink-0 docium-ribbon select-none">
      {/* Ribbon Tab Bar */}
      <div className="flex h-9 items-center justify-between border-b border-[var(--border-subtle)] px-3">
        <div className="flex items-center gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (isCollapsed) setIsCollapsed(false);
                }}
                className={`relative px-3 py-1 text-xs font-medium rounded-t transition-colors ${
                  isActive
                    ? 'text-[var(--primary)] font-semibold after:absolute after:bottom-0 after:left-1 after:right-1 after:h-[2px] after:bg-[var(--primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                }`}
              >
                {tab.label}
                {tab.id === 'review' && unresolvedCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1 py-0.2 text-[9px] font-mono text-white">
                    {unresolvedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Collapse / Expand Ribbon Button */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)] transition-colors"
          title={isCollapsed ? 'Expand Ribbon' : 'Collapse Ribbon'}
        >
          {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Ribbon Action Controls Bar */}
      {!isCollapsed && (
        <div className="bg-[var(--surface)] min-h-[42px] flex items-center overflow-x-auto">
          {activeTab === 'home' && (
            <HomeTab
              editor={editor}
              formatPainterActive={formatPainterActive}
              onToggleFormatPainter={onToggleFormatPainter}
            />
          )}

          {activeTab === 'insert' && (
            <InsertTab
              editor={editor}
              onOpenLinkModal={onOpenLinkModal}
              onOpenCitationModal={onOpenCitationModal}
              onOpenPageSetupModal={onOpenPageSetupModal}
            />
          )}

          {activeTab === 'layout' && (
            <LayoutTab
              pageSize={pageSize}
              orientation={orientation}
              marginPreset={marginPreset}
              margins={margins}
              columns={columns}
              onChangePageSize={onChangePageSize}
              onChangeOrientation={onChangeOrientation}
              onChangeMarginPreset={onChangeMarginPreset}
              onChangeMargins={onChangeMargins}
              onChangeColumns={onChangeColumns}
              onOpenPageSetupModal={onOpenPageSetupModal}
            />
          )}

          {activeTab === 'references' && (
            <ReferencesTab
              editor={editor}
              citations={citations}
              onOpenCitationModal={onOpenCitationModal}
            />
          )}

          {activeTab === 'review' && (
            <ReviewTab
              editor={editor}
              commentsCount={commentsCount}
              unresolvedCount={unresolvedCount}
              commentsSidebarOpen={commentsSidebarOpen}
              onToggleCommentsSidebar={onToggleCommentsSidebar}
              onAddCommentFromSelection={onAddCommentFromSelection}
              onOpenStatsModal={onOpenStatsModal}
              suggestingMode={suggestingMode}
              onToggleSuggestingMode={onToggleSuggestingMode}
              spellCheckEnabled={spellCheckEnabled}
              onToggleSpellCheck={onToggleSpellCheck}
            />
          )}

          {activeTab === 'view' && (
            <ViewTab
              zoomLevel={zoomLevel}
              onSetZoom={onSetZoom}
              isPaginatedView={isPaginatedView}
              onTogglePaginatedView={onTogglePaginatedView}
              showRuler={showRuler}
              onToggleRuler={onToggleRuler}
              showOutline={showOutline}
              onToggleOutline={onToggleOutline}
              showFormattingMarks={showFormattingMarks}
              onToggleFormattingMarks={onToggleFormattingMarks}
              isFocusMode={isFocusMode}
              onToggleFocusMode={onToggleFocusMode}
            />
          )}
        </div>
      )}
    </div>
  );
}


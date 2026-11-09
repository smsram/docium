'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspaceStore } from '@/lib/store';
import { WorkspaceAI } from '@/components/workspace/WorkspaceAI';
import {
  Presentation,
  Play,
  Plus,
  Trash2,
  Type,
  Image as ImageIcon,
  Square,
  Share2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
  Palette,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface PresentationEditorProps {
  presentationId: string;
  showBackToHome?: boolean;
}

export function PresentationEditor({ presentationId, showBackToHome = false }: PresentationEditorProps) {
  const { slides, updateSlideElement, addSlidePage, getAiPanelState, updateAiPanelState } = useWorkspaceStore();
  const doc = slides.find((s) => s.id === presentationId) || slides[0];

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [isPresenting, setIsPresenting] = useState(false);

  const activeSlide = doc?.slides[activeSlideIndex] || doc?.slides[0];

  // Presenter keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPresenting) {
        if (e.key === 'ArrowRight' || e.key === 'Space') {
          setActiveSlideIndex((prev) => Math.min(doc.slides.length - 1, prev + 1));
        } else if (e.key === 'ArrowLeft') {
          setActiveSlideIndex((prev) => Math.max(0, prev - 1));
        } else if (e.key === 'Escape') {
          setIsPresenting(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresenting, doc.slides.length]);

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      {/* Top Header */}
      <div className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <div className="flex items-center gap-2.5">
          {showBackToHome && (
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors mr-1 shrink-0"
              title="Back to home"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </Link>
          )}

          <Presentation className="h-4 w-4 text-[var(--primary)]" />
          <span className="font-semibold text-sm text-[var(--text)] truncate max-w-[200px] sm:max-w-md">{doc?.title}</span>
          <span className="hidden sm:inline text-[11px] text-[var(--text-muted)] font-mono">
            Slide {activeSlideIndex + 1} of {doc?.slides.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPresenting(true)}
            className="flex items-center gap-1.5 rounded bg-[var(--primary)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--primary-hover)] transition-colors shadow-2xs"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>Present</span>
          </button>

          <button
            onClick={() => {
              const currentMode = getAiPanelState(presentationId).mode;
              updateAiPanelState(presentationId, { mode: currentMode === 'docked' ? 'minimized' : 'docked' });
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              getAiPanelState(presentationId).mode === 'docked'
                ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold shadow-2xs'
                : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
            }`}
            title="Toggle Docium AI Panel"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Docium AI</span>
          </button>
        </div>
      </div>

      {/* Main Presentation Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Slide Thumbnails Panel */}
        <div className="w-56 border-r border-[var(--border)] bg-[var(--surface)] p-3 flex flex-col shrink-0 overflow-y-auto space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
            <span className="text-xs font-semibold text-[var(--text)]">Slides</span>
            <button
              onClick={() => addSlidePage(doc.id)}
              className="flex items-center gap-1 rounded bg-[var(--accent)] px-2 py-0.5 text-[11px] font-medium text-[var(--primary)] hover:bg-[var(--primary-light)]"
            >
              <Plus className="h-3 w-3" />
              Add
            </button>
          </div>

          {doc?.slides.map((s, idx) => {
            const isCurrent = idx === activeSlideIndex;
            return (
              <div
                key={s.id}
                onClick={() => setActiveSlideIndex(idx)}
                className={`group relative rounded-lg border-2 p-2 cursor-pointer transition-all aspect-video flex flex-col justify-between overflow-hidden ${
                  isCurrent
                    ? 'border-[var(--primary)] bg-[var(--surface)] shadow-sm'
                    : 'border-[var(--border)] bg-[var(--accent)] hover:border-[var(--text-muted)]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-[var(--text-muted)]">
                    {idx + 1}
                  </span>
                </div>
                <div className="text-center px-1">
                  <p className="text-[10px] font-medium text-[var(--text)] truncate">{s.title}</p>
                </div>
                <div className="h-1 w-full bg-[var(--border)] rounded" />
              </div>
            );
          })}
        </div>

        {/* Center: Slide Canvas */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center bg-[var(--background)]">
          <div className="relative w-full max-w-4xl aspect-video rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg p-8 sm:p-12 flex flex-col justify-between overflow-hidden">
            {activeSlide?.elements.map((el) => {
              const isSelected = selectedElementId === el.id;
              return (
                <div
                  key={el.id}
                  onClick={() => setSelectedElementId(el.id)}
                  className={`p-2 rounded cursor-text transition-all ${
                    isSelected ? 'ring-1 ring-[var(--primary)] bg-[var(--primary-light)]/20' : ''
                  }`}
                >
                  {el.type === 'title' ? (
                    <input
                      type="text"
                      value={el.content}
                      onChange={(e) =>
                        updateSlideElement(doc.id, activeSlideIndex, el.id, { content: e.target.value })
                      }
                      style={{ fontSize: `${el.fontSize || 32}px`, color: el.color || 'var(--text)' }}
                      className="w-full font-bold bg-transparent outline-none"
                    />
                  ) : (
                    <textarea
                      rows={4}
                      value={el.content}
                      onChange={(e) =>
                        updateSlideElement(doc.id, activeSlideIndex, el.id, { content: e.target.value })
                      }
                      style={{ fontSize: `${el.fontSize || 16}px`, color: el.color || 'var(--text)' }}
                      className="w-full font-normal leading-relaxed bg-transparent outline-none resize-none"
                    />
                  )}
                </div>
              );
            })}

            {/* Slide footer branding */}
            <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] border-t border-[var(--border-subtle)] pt-3">
              <span>DOCIUM SLIDES</span>
              <span>{activeSlideIndex + 1} / {doc?.slides.length}</span>
            </div>
          </div>
        </div>

        <WorkspaceAI
          workspaceId={presentationId}
          documentFormat="slide"
          onApplyAction={(actionType, payload) => {
            if (actionType === 'create_slide') {
              addSlidePage(doc.id);
            }
          }}
        />
      </div>

      {/* Fullscreen Presenter Mode Modal */}
      {isPresenting && (
        <div className="fixed inset-0 z-50 bg-[#0d100e] text-white flex flex-col justify-between p-8 sm:p-14 select-none animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-zinc-400">
              {doc.title} — Presenting
            </span>
            <button
              onClick={() => setIsPresenting(false)}
              className="rounded-full bg-zinc-800 p-2 text-zinc-300 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-w-4xl mx-auto w-full text-center space-y-6">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-emerald-400">
              {activeSlide?.elements.find((e) => e.type === 'title')?.content || activeSlide?.title}
            </h1>
            <p className="text-lg sm:text-2xl text-zinc-300 leading-relaxed whitespace-pre-line max-w-2xl mx-auto">
              {activeSlide?.elements.find((e) => e.type === 'text')?.content}
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Use Left / Right arrow keys or Spacebar</span>
            <span>Slide {activeSlideIndex + 1} of {doc.slides.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}

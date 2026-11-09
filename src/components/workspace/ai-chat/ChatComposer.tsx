'use client';

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowUp,
  Square,
  Paperclip,
  Wrench,
  X,
  FileText,
  Link2,
  Image as ImageIcon,
  FileSpreadsheet,
  Presentation,
  AtSign,
} from 'lucide-react';
import { ToolsPopover } from './ToolsPopover';
import { AttachMenu } from './AttachMenu';
import { ModelSelectorPopover } from './ModelSelectorPopover';
import { ProviderLogo } from '@/components/ai/ProviderLogos';
import { ProviderId } from '@/lib/types';
import { getModelById } from '@/lib/ai/providers';
import { useWorkspaceStore } from '@/lib/store';

export interface ComposerAttachmentItem {
  id: string;
  name: string;
  size: string;
  type: string;
  url?: string;
}

interface ChatComposerProps {
  input: string;
  onChangeInput: (val: string) => void;
  onSend: () => void;
  onStop: () => void;
  isGenerating: boolean;
  attachments: ComposerAttachmentItem[];
  onRemoveAttachment: (id: string) => void;
  onTriggerFileUpload: () => void;
  onAddUrlSource: (url: string) => Promise<void> | void;
  enabledTools: {
    internetSearch: boolean;
    imageGeneration: boolean;
    chartsAndData: boolean;
  };
  onToggleTool: (toolKey: 'internetSearch' | 'imageGeneration' | 'chartsAndData', val: boolean) => void;
  currentProviderId?: ProviderId;
  currentModelId?: string;
  onSelectModel?: (providerId: ProviderId, modelId: string) => void;
}

export function ChatComposer({
  input,
  onChangeInput,
  onSend,
  onStop,
  isGenerating,
  attachments,
  onRemoveAttachment,
  onTriggerFileUpload,
  onAddUrlSource,
  enabledTools,
  onToggleTool,
  currentProviderId,
  currentModelId,
  onSelectModel,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const attachButtonRef = useRef<HTMLButtonElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);

  const [toolsOpen, setToolsOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // @attach Autocomplete state
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const { sources, documents, sheets, slides, pdfs } = useWorkspaceStore();

  // Aggregate candidate sources for manual @attach mentions
  const candidateSources = useMemo(() => {
    const list: Array<{ id: string; title: string; type: string; size?: string }> = [];
    const seen = new Set<string>();

    // 1. Files currently attached to conversation
    for (const a of attachments) {
      if (!seen.has(a.name.toLowerCase())) {
        seen.add(a.name.toLowerCase());
        list.push({ id: a.id, title: a.name, type: a.type, size: a.size });
      }
    }

    // 2. Sources in the store
    for (const s of sources) {
      if (!seen.has(s.title.toLowerCase())) {
        seen.add(s.title.toLowerCase());
        list.push({ id: s.id, title: s.title, type: s.type, size: s.fileSize });
      }
    }

    // 3. Workspace documents, sheets, presentations, pdfs
    for (const d of documents) {
      const name = `${d.title}.docx`;
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({ id: d.id, title: name, type: 'docx', size: d.size });
      }
    }
    for (const s of sheets) {
      const name = `${s.title}.xlsx`;
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({ id: s.id, title: name, type: 'xlsx' });
      }
    }
    for (const sl of slides) {
      const name = `${sl.title}.pptx`;
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({ id: sl.id, title: name, type: 'pptx' });
      }
    }
    for (const p of pdfs) {
      const name = `${p.title}.pdf`;
      if (!seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        list.push({ id: p.id, title: name, type: 'pdf', size: p.size });
      }
    }

    return list;
  }, [attachments, sources, documents, sheets, slides, pdfs]);

  // Filter sources matching typed @attach query
  const filteredSources = useMemo(() => {
    if (!autocompleteQuery.trim()) return candidateSources.slice(0, 8);
    const q = autocompleteQuery.toLowerCase().trim();
    return candidateSources
      .filter((s) => s.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [candidateSources, autocompleteQuery]);

  // Auto-resize textarea height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 140);
    el.style.height = `${Math.max(newHeight, 38)}px`;
  }, [input]);

  const handleInputChange = (val: string) => {
    onChangeInput(val);
    const cursor = textareaRef.current ? textareaRef.current.selectionStart : val.length;
    const textBefore = val.slice(0, cursor);

    // Trigger autocomplete on @attach or @
    const match = textBefore.match(/(?:@attach\s*\(?"?|@)([a-zA-Z0-9_\-\.\s]*)$/i);
    if (match) {
      setAutocompleteQuery(match[1] || '');
      setAutocompleteOpen(true);
      setHighlightedIndex(0);
    } else {
      setAutocompleteOpen(false);
    }
  };

  const selectSource = useCallback(
    (src: { id: string; title: string }) => {
      const val = input;
      const cursor = textareaRef.current ? textareaRef.current.selectionStart : val.length;
      const textBefore = val.slice(0, cursor);
      const textAfter = val.slice(cursor);

      // Replace the matched @query with @attach("filename")
      const replacedBefore = textBefore.replace(
        /(?:@attach\s*\(?"?|@)([a-zA-Z0-9_\-\.\s]*)$/i,
        `@attach("${src.title}") `
      );
      const newVal = replacedBefore + textAfter;
      onChangeInput(newVal);
      setAutocompleteOpen(false);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newPos = replacedBefore.length;
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      }, 10);
    },
    [input, onChangeInput]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Autocomplete keyboard navigation
    if (autocompleteOpen && filteredSources.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredSources.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + filteredSources.length) % filteredSources.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSource(filteredSources[highlightedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocompleteOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isGenerating && (input.trim() || attachments.length > 0)) {
        onSend();
      }
    }
  };

  const activeToolsCount = [
    enabledTools.internetSearch,
    enabledTools.imageGeneration,
    enabledTools.chartsAndData,
  ].filter(Boolean).length;

  const currentModelMeta = currentModelId && currentProviderId
    ? getModelById(currentModelId, currentProviderId)
    : undefined;
  const modelDisplayName = currentModelMeta?.name || currentModelId?.replace(/^@cf\//, '').split('/').pop() || 'Select Model';

  const getSourceIcon = (type: string) => {
    if (type.startsWith('image/')) return ImageIcon;
    if (type === 'xlsx' || type.includes('spreadsheet')) return FileSpreadsheet;
    if (type === 'pptx' || type.includes('presentation')) return Presentation;
    if (type === 'url') return Link2;
    return FileText;
  };

  return (
    <div className="relative border-t border-[var(--border)] bg-[var(--surface)] p-3 shrink-0">
      {/* Attached Source Chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
          {attachments.map((att) => {
            const Icon = getSourceIcon(att.type);
            return (
              <div
                key={att.id}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--text)] animate-in fade-in duration-100 max-w-[200px]"
              >
                <Icon className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                <span className="truncate text-[11px] font-medium">{att.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="p-0.5 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--accent)] shrink-0 cursor-pointer"
                  title="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* @attach Source Mention Autocomplete Dropdown */}
      {autocompleteOpen && filteredSources.length > 0 && (
        <div className="absolute bottom-full left-3 mb-2 z-50 w-80 max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-100 select-none text-xs">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-subtle)] mb-1">
            <span className="flex items-center gap-1">
              <AtSign className="h-3 w-3 text-[var(--primary)]" />
              <span>Reference Source (@attach)</span>
            </span>
            <span className="text-[9px] opacity-70">↑↓ to navigate, Enter to select</span>
          </div>

          <div className="space-y-0.5">
            {filteredSources.map((src, index) => {
              const Icon = getSourceIcon(src.type);
              const isSelected = index === highlightedIndex;

              return (
                <button
                  key={`${src.id}-${index}`}
                  type="button"
                  onClick={() => selectSource(src)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer min-h-[32px] ${
                    isSelected
                      ? 'bg-[var(--accent)] text-[var(--primary)] font-medium'
                      : 'text-[var(--text)] hover:bg-[var(--accent)]/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                    <span className="truncate text-xs">{src.title}</span>
                  </div>
                  {src.size && (
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0 font-mono">
                      {src.size}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input Form Box */}
      <div className="relative flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/20 shadow-xs transition-all">
        {/* Multiline Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Docium AI anything or type @attach to reference a source..."
          rows={1}
          className="w-full resize-none bg-transparent px-3.5 pt-2.5 pb-1 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none leading-relaxed"
        />

        {/* Action Controls Bar */}
        <div className="flex items-center justify-between px-2.5 py-1.5">
          {/* Left Controls: Attach, Tools & Model Selector */}
          <div className="flex items-center gap-1 relative">
            {/* Attach Control */}
            <div className="relative">
              <button
                ref={attachButtonRef}
                type="button"
                onClick={() => {
                  setAttachOpen(!attachOpen);
                  setToolsOpen(false);
                  setModelSelectorOpen(false);
                }}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  attachOpen
                    ? 'bg-[var(--accent)] text-[var(--primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                }`}
                title="Attach files or links"
              >
                <Paperclip className="h-3.5 w-3.5" />
                <span className="text-[11px]">Attach</span>
              </button>

              <AttachMenu
                isOpen={attachOpen}
                onClose={() => setAttachOpen(false)}
                anchorRef={attachButtonRef}
                onTriggerFilePicker={onTriggerFileUpload}
                onAddUrlSource={onAddUrlSource}
              />
            </div>

            {/* Tools Menu Toggle Control */}
            <div className="relative">
              <button
                ref={toolsButtonRef}
                type="button"
                onClick={() => {
                  setToolsOpen(!toolsOpen);
                  setAttachOpen(false);
                  setModelSelectorOpen(false);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  toolsOpen || activeToolsCount > 0
                    ? 'bg-[var(--accent)] text-[var(--primary)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                }`}
                title="Manage AI capabilities"
              >
                <Wrench className="h-3.5 w-3.5" />
                <span className="text-[11px]">Tools</span>
                {activeToolsCount > 0 && (
                  <span className="rounded-full bg-[var(--primary)] text-white text-[9px] px-1 font-mono font-bold">
                    {activeToolsCount}
                  </span>
                )}
              </button>

              <ToolsPopover
                isOpen={toolsOpen}
                onClose={() => setToolsOpen(false)}
                anchorRef={toolsButtonRef}
                enabledTools={enabledTools}
                onToggleTool={onToggleTool}
              />
            </div>

            {/* Model Selector Control */}
            {currentProviderId && currentModelId && onSelectModel && (
              <div className="relative flex items-center">
                <button
                  ref={modelButtonRef}
                  type="button"
                  onClick={() => {
                    setModelSelectorOpen(!modelSelectorOpen);
                    setAttachOpen(false);
                    setToolsOpen(false);
                  }}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0 ${
                    modelSelectorOpen
                      ? 'bg-[var(--accent)] text-[var(--primary)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                  }`}
                  title={`AI Model: ${modelDisplayName} (${currentProviderId}) - Click to switch`}
                  aria-label={`Select AI Model: current model is ${modelDisplayName}`}
                >
                  <ProviderLogo providerId={currentProviderId} size={15} />
                </button>

                <ModelSelectorPopover
                  isOpen={modelSelectorOpen}
                  onClose={() => setModelSelectorOpen(false)}
                  anchorRef={modelButtonRef}
                  currentProviderId={currentProviderId}
                  currentModelId={currentModelId}
                  onSelectModel={onSelectModel}
                />
              </div>
            )}
          </div>

          {/* Right Control: Upward Arrow Send / Stop Button */}
          <div>
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors cursor-pointer shadow-xs"
                title="Stop generation"
              >
                <Square className="h-3 w-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim() && attachments.length === 0}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all shadow-xs cursor-pointer ${
                  input.trim() || attachments.length > 0
                    ? 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
                    : 'bg-[var(--border)] text-[var(--text-muted)] opacity-50 cursor-not-allowed'
                }`}
                title="Send message"
              >
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

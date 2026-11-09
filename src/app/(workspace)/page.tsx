'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useWorkspaceStore } from '@/lib/store';
import { OutputFormat, ComposerAttachment } from '@/lib/types';
import { Toggle } from '@/components/ui/Toggle';
import {
  Sparkles,
  FileText,
  Table,
  Presentation,
  Paperclip,
  Globe,
  RefreshCw,
  X,
  FileUp,
  ChevronRight,
  ChevronDown,
  Check,
  Wrench,
  RotateCcw,
  Search,
  Image as ImageIcon,
  BarChart2,
  AlertCircle,
  ExternalLink,
  Info,
} from 'lucide-react';

export default function AiCreationHomepage() {
  const router = useRouter();
  const {
    createFromPrompt,
    documents,
    sheets,
    slides,
    providers,
    defaultProvider,
    composerDraft,
    updateComposerDraft,
    resetComposerDraft,
  } = useWorkspaceStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('Analyzing prompt...');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const [showToolsPopover, setShowToolsPopover] = useState(false);
  const [activeInfoTooltip, setActiveInfoTooltip] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Group attachment popover states (desktop hover & mobile tap)
  const [filesOpenMobile, setFilesOpenMobile] = useState(false);
  const [filesHovered, setFilesHovered] = useState(false);
  const [urlsOpenMobile, setUrlsOpenMobile] = useState(false);
  const [urlsHovered, setUrlsHovered] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolsPopoverRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const filesPopoverRef = useRef<HTMLDivElement>(null);
  const urlsPopoverRef = useRef<HTMLDivElement>(null);

  // Global Escape & click outside handler
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowToolsPopover(false);
        setActiveInfoTooltip(null);
        setShowAttachMenu(false);
        setFilesOpenMobile(false);
        setUrlsOpenMobile(false);
        setShowResetConfirm(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (toolsPopoverRef.current && !toolsPopoverRef.current.contains(target)) {
        setShowToolsPopover(false);
        setActiveInfoTooltip(null);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(target)) {
        setShowAttachMenu(false);
      }
      if (filesPopoverRef.current && !filesPopoverRef.current.contains(target)) {
        setFilesOpenMobile(false);
      }
      if (urlsPopoverRef.current && !urlsPopoverRef.current.contains(target)) {
        setUrlsOpenMobile(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Provider Availability Checks
  const searchProvidersList = ['brave', 'tavily', 'serper', 'serpapi', 'searxng'] as const;
  const isSearchProviderConfigured = searchProvidersList.some((id) => {
    const p = providers[id];
    if (!p) return false;
    if (id === 'searxng') return p.enabled || (p.baseUrl && p.baseUrl.trim().length > 0);
    return (p.enabled || p.status === 'connected') && p.apiKey && p.apiKey.trim().length > 0;
  });

  const imageProvidersList = [
    'google-imagen',
    'cloudflare-flux',
    'stability',
    'fal',
    'replicate',
    'together',
  ] as const;

  const isImageGenProviderConfigured = imageProvidersList.some((id) => {
    const p = providers[id];
    if (!p) return false;
    return (p.enabled || p.status === 'connected') && p.apiKey && p.apiKey.trim().length > 0;
  });

  // Local open-source rendering engine for diagrams and charts (Mermaid & SVG) is always installed!
  const isDiagramsEngineAvailable = true;

  // Active tools count
  const activeToolsCount = [
    composerDraft.enabledTools.internetSearch && isSearchProviderConfigured,
    composerDraft.enabledTools.imageSearch && isSearchProviderConfigured,
    composerDraft.enabledTools.imageGeneration && isImageGenProviderConfigured,
    composerDraft.enabledTools.diagramsAndGraphs && isDiagramsEngineAvailable,
  ].filter(Boolean).length;

  // Tools configuration
  const toolsList = [
    {
      id: 'internetSearch' as const,
      name: 'Search Internet',
      icon: Search,
      isAvailable: isSearchProviderConfigured,
      isEnabled: composerDraft.enabledTools.internetSearch,
      description: isSearchProviderConfigured
        ? 'Searches the web in real time to enrich the workspace with current facts and references.'
        : 'Requires an active search provider. Configure in AI Settings.',
      onToggle: (checked: boolean) =>
        updateComposerDraft({
          enabledTools: { ...composerDraft.enabledTools, internetSearch: checked },
        }),
    },
    {
      id: 'imageSearch' as const,
      name: 'Images from Search',
      icon: ImageIcon,
      isAvailable: isSearchProviderConfigured,
      isEnabled: composerDraft.enabledTools.imageSearch,
      description: isSearchProviderConfigured
        ? 'Finds and embeds relevant web photo references directly from search results.'
        : 'Requires an active search provider. Configure in AI Settings.',
      onToggle: (checked: boolean) =>
        updateComposerDraft({
          enabledTools: { ...composerDraft.enabledTools, imageSearch: checked },
        }),
    },
    {
      id: 'imageGeneration' as const,
      name: 'Generate Images',
      icon: Sparkles,
      isAvailable: isImageGenProviderConfigured,
      isEnabled: composerDraft.enabledTools.imageGeneration,
      description: isImageGenProviderConfigured
        ? 'Synthesizes custom AI illustrations and visual assets for the workspace.'
        : 'Requires an image generation provider. Configure in AI Settings.',
      onToggle: (checked: boolean) =>
        updateComposerDraft({
          enabledTools: { ...composerDraft.enabledTools, imageGeneration: checked },
        }),
    },
    {
      id: 'diagramsAndGraphs' as const,
      name: 'Diagrams & Graphs',
      icon: BarChart2,
      isAvailable: isDiagramsEngineAvailable,
      isEnabled: composerDraft.enabledTools.diagramsAndGraphs,
      description: 'Generates Mermaid diagrams, flowcharts, and dynamic SVG charts locally.',
      onToggle: (checked: boolean) =>
        updateComposerDraft({
          enabledTools: { ...composerDraft.enabledTools, diagramsAndGraphs: checked },
        }),
    },
  ];

  // Keyword auto-detection for prompt capabilities
  const detectedSearch =
    /(search|browse|web|online|internet|latest|news|current events)/i.test(composerDraft.prompt) &&
    !composerDraft.enabledTools.internetSearch;

  const detectedImageGen =
    /(generate (an |a )?image|draw|illustration|photo|visualize art)/i.test(composerDraft.prompt) &&
    !composerDraft.enabledTools.imageGeneration;

  const detectedDiagram =
    /(diagram|flowchart|architecture chart|sequence diagram|graph)/i.test(composerDraft.prompt) &&
    !composerDraft.enabledTools.diagramsAndGraphs;

  // Suggested starter prompts
  const suggestions = [
    {
      label: 'Product Roadmap & Architecture',
      format: 'doc' as OutputFormat,
      prompt: 'Draft an architectural product specification for Q1 2026, outlining core user stories, engineering milestones, and non-functional latency requirements.',
    },
    {
      label: 'SaaS Financial Model',
      format: 'sheet' as OutputFormat,
      prompt: 'Build a financial projection model with quarterly revenue streams, direct expenses, operating margins, and headcount growth.',
    },
    {
      label: 'Executive Pitch Deck',
      format: 'slide' as OutputFormat,
      prompt: 'Synthesize an executive investor pitch deck highlighting market opportunity, architectural moats, and operational velocity.',
    },
    {
      label: 'API Security Protocol RFC',
      format: 'doc' as OutputFormat,
      prompt: 'Create a security compliance and authentication RFC covering zero-trust identity, key rotation, and audit log pipelines.',
    },
  ];

  // Combine and sort recent items
  const allItems = [
    ...documents.filter((d) => !d.trashed).map((d) => ({ ...d, itemType: 'doc' as const })),
    ...sheets.filter((s) => !s.trashed).map((s) => ({ ...s, itemType: 'sheet' as const })),
    ...slides.filter((s) => !s.trashed).map((s) => ({ ...s, itemType: 'slide' as const })),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const recentItems = allItems.slice(0, 6);

  const handleCreate = async () => {
    if (!composerDraft.prompt.trim() || isProcessing) return;

    setIsProcessing(true);
    setProcessingStep('Analyzing prompt & attached context...');

    setTimeout(() => {
      setProcessingStep('Structuring workspace canvas...');
    }, 450);

    setTimeout(() => {
      setProcessingStep('Generating initial content & AI sidecar...');
    }, 900);

    setTimeout(() => {
      const newId = createFromPrompt(
        composerDraft.prompt,
        composerDraft.format,
        composerDraft.attachments.map((a) => ({ name: a.name, size: a.size, type: a.type })),
        composerDraft.urls
      );
      router.push(`/workspace/${newId}`);
    }, 1350);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  };

  // Drag and drop file handling
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const processFiles = (files: FileList | File[]) => {
    const validFiles: ComposerAttachment[] = [];
    const maxSizeBytes = 25 * 1024 * 1024; // 25MB

    Array.from(files).forEach((file) => {
      if (file.size > maxSizeBytes) {
        alert(`File ${file.name} exceeds the 25MB limit.`);
        return;
      }

      let previewUrl: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }

      validFiles.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.type || 'document',
        previewUrl,
      });
    });

    if (validFiles.length > 0) {
      updateComposerDraft({
        attachments: [...composerDraft.attachments, ...validFiles],
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) => {
    updateComposerDraft({
      attachments: composerDraft.attachments.filter((a) => a.id !== id),
    });
  };

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInputValue.trim()) return;
    let formatted = urlInputValue.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = `https://${formatted}`;
    }
    updateComposerDraft({
      urls: [...composerDraft.urls, formatted],
    });
    setUrlInputValue('');
    setShowUrlInput(false);
  };

  const removeUrl = (index: number) => {
    updateComposerDraft({
      urls: composerDraft.urls.filter((_, i) => i !== index),
    });
  };

  const hasDraftContent =
    composerDraft.prompt.trim().length > 0 ||
    composerDraft.attachments.length > 0 ||
    composerDraft.urls.length > 0;

  return (
    <div className="min-h-full flex flex-col justify-between p-4 sm:p-8 max-w-4xl mx-auto space-y-10">
      {/* Top Creation Area */}
      <div className="w-full space-y-6 pt-4 sm:pt-8">
        {/* Title & Tagline */}
        <div className="text-center space-y-2 max-w-xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            What do you want to create?
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] leading-relaxed">
            Describe your project, drop reference documents, or choose an output format.
            Docium synthesizes a dedicated workspace with its own persistent AI intelligence.
          </p>
        </div>

        {/* Prompt Composer Box with Drag & Drop */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl border bg-[var(--surface)] p-4 sm:p-5 shadow-xs transition-all ${
            isDraggingOver
              ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30 bg-[var(--accent)]/40'
              : 'border-[var(--border)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/20'
          } space-y-3.5`}
        >
          {/* Reset / Discard Icon Button (shown when composer has content) */}
          {hasDraftContent && (
            <div className="absolute right-3.5 top-3.5 z-10">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                title="Discard draft and reset composer"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--accent)] transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>

              {/* Confirmation Popover */}
              {showResetConfirm && (
                <div className="absolute right-0 top-8 z-30 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 shadow-lg space-y-2 text-xs">
                  <p className="font-medium text-[var(--text)]">Discard current draft?</p>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    This will clear your prompt, attachments, and URLs.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(false)}
                      className="px-2.5 py-1 rounded-md text-[var(--text-muted)] hover:bg-[var(--accent)] hover:text-[var(--text)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetComposerDraft();
                        setShowResetConfirm(false);
                      }}
                      className="px-2.5 py-1 rounded-md bg-rose-600 text-white font-medium hover:bg-rose-700 shadow-2xs"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Prompt Textarea */}
          <textarea
            value={composerDraft.prompt}
            onChange={(e) => updateComposerDraft({ prompt: e.target.value })}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            rows={4}
            placeholder="Describe what you want to create..."
            className="w-full resize-none bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]/70 outline-none leading-relaxed disabled:opacity-50 pr-8"
          />

          {/* Visual Drop Zone Notification Overlay when dragging */}
          {isDraggingOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--surface)]/90 backdrop-blur-2xs z-20">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--primary)]">
                <FileUp className="h-5 w-5 animate-bounce" />
                <span>Drop files to attach to this workspace...</span>
              </div>
            </div>
          )}

          {/* Smart Tool Detection Pill */}
          {(detectedSearch || detectedImageGen || detectedDiagram) && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)] bg-[var(--accent)]/50 rounded-lg px-2.5 py-1 border border-[var(--border-subtle)]">
              <Sparkles className="h-3 w-3 text-[var(--primary)] shrink-0" />
              <span>Suggested capability:</span>
              {detectedSearch && (
                <button
                  type="button"
                  onClick={() =>
                    updateComposerDraft({
                      enabledTools: { ...composerDraft.enabledTools, internetSearch: true },
                    })
                  }
                  className="font-medium text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                >
                  Enable Internet Search
                </button>
              )}
              {detectedImageGen && (
                <button
                  type="button"
                  onClick={() =>
                    updateComposerDraft({
                      enabledTools: { ...composerDraft.enabledTools, imageGeneration: true },
                    })
                  }
                  className="font-medium text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                >
                  Enable Image Generation
                </button>
              )}
              {detectedDiagram && (
                <button
                  type="button"
                  onClick={() =>
                    updateComposerDraft({
                      enabledTools: { ...composerDraft.enabledTools, diagramsAndGraphs: true },
                    })
                  }
                  className="font-medium text-[var(--primary)] hover:underline inline-flex items-center gap-1"
                >
                  Enable Diagrams &amp; Graphs
                </button>
              )}
            </div>
          )}

          {/* Attached Files & URLs Display (Separately Grouped) */}
          {(composerDraft.attachments.length > 0 || composerDraft.urls.length > 0) && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[var(--border-subtle)] text-xs">
              {/* GROUP 1: FILES */}
              {composerDraft.attachments.length === 1 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text)] px-2.5 py-1 text-xs font-medium border border-[var(--border)] shadow-2xs">
                  {composerDraft.attachments[0].previewUrl ? (
                    <div className="relative h-4 w-4 rounded overflow-hidden shrink-0 border border-[var(--border)]">
                      <Image
                        src={composerDraft.attachments[0].previewUrl}
                        alt={composerDraft.attachments[0].name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <Paperclip className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                  )}
                  <span className="truncate max-w-[150px]">{composerDraft.attachments[0].name}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    ({composerDraft.attachments[0].size})
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(composerDraft.attachments[0].id)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors ml-0.5 cursor-pointer"
                    title="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {composerDraft.attachments.length > 1 && (
                <div
                  className="relative group/files"
                  ref={filesPopoverRef}
                  onMouseEnter={() => setFilesHovered(true)}
                  onMouseLeave={() => setFilesHovered(false)}
                >
                  <button
                    type="button"
                    onClick={() => setFilesOpenMobile(!filesOpenMobile)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text)] px-2.5 py-1 text-xs font-medium border border-[var(--border)] hover:border-[var(--primary)] transition-colors shadow-2xs cursor-pointer"
                    title="View attached files"
                  >
                    <Paperclip className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                    <span>{composerDraft.attachments.length} files</span>
                    <ChevronDown className={`h-3 w-3 text-[var(--text-muted)] transition-transform ${filesHovered || filesOpenMobile ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Floating popover with scrollable list of files */}
                  {(filesHovered || filesOpenMobile) && (
                    <div
                      role="dialog"
                      aria-label="Attached files"
                      className="absolute left-0 bottom-full mb-2 z-50 w-72 sm:w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-xl space-y-2 animate-in fade-in-50 zoom-in-95 duration-100"
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] px-1">
                        <span className="text-xs font-semibold text-[var(--text)]">
                          Attached Files ({composerDraft.attachments.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => updateComposerDraft({ attachments: [] })}
                          className="text-[10px] text-[var(--text-muted)] hover:text-rose-500 font-medium transition-colors cursor-pointer"
                        >
                          Clear all
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {composerDraft.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {att.previewUrl ? (
                                <div className="relative h-4 w-4 rounded overflow-hidden shrink-0 border border-[var(--border)]">
                                  <Image
                                    src={att.previewUrl}
                                    alt={att.name}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                              ) : (
                                <Paperclip className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                              )}
                              <span className="truncate max-w-[150px] text-[var(--text)] font-medium">
                                {att.name}
                              </span>
                              <span className="text-[10px] text-[var(--text-muted)] font-mono shrink-0">
                                {att.size}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAttachment(att.id);
                              }}
                              className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--accent)] transition-colors cursor-pointer shrink-0"
                              title="Remove file"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* GROUP 2: URLS */}
              {composerDraft.urls.length === 1 && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text)] px-2.5 py-1 text-xs font-medium border border-[var(--border)] shadow-2xs">
                  <Globe className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                  <span className="truncate max-w-[160px]">{composerDraft.urls[0]}</span>
                  <button
                    type="button"
                    onClick={() => removeUrl(0)}
                    className="text-[var(--text-muted)] hover:text-rose-500 transition-colors ml-0.5 cursor-pointer"
                    title="Remove URL"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}

              {composerDraft.urls.length > 1 && (
                <div
                  className="relative group/urls"
                  ref={urlsPopoverRef}
                  onMouseEnter={() => setUrlsHovered(true)}
                  onMouseLeave={() => setUrlsHovered(false)}
                >
                  <button
                    type="button"
                    onClick={() => setUrlsOpenMobile(!urlsOpenMobile)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text)] px-2.5 py-1 text-xs font-medium border border-[var(--border)] hover:border-[var(--primary)] transition-colors shadow-2xs cursor-pointer"
                    title="View attached URLs"
                  >
                    <Globe className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                    <span>{composerDraft.urls.length} URLs</span>
                    <ChevronDown className={`h-3 w-3 text-[var(--text-muted)] transition-transform ${urlsHovered || urlsOpenMobile ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Floating popover with scrollable list of URLs */}
                  {(urlsHovered || urlsOpenMobile) && (
                    <div
                      role="dialog"
                      aria-label="Attached URLs"
                      className="absolute left-0 bottom-full mb-2 z-50 w-72 sm:w-80 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-xl space-y-2 animate-in fade-in-50 zoom-in-95 duration-100"
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-subtle)] px-1">
                        <span className="text-xs font-semibold text-[var(--text)]">
                          Attached URLs ({composerDraft.urls.length})
                        </span>
                        <button
                          type="button"
                          onClick={() => updateComposerDraft({ urls: [] })}
                          className="text-[10px] text-[var(--text-muted)] hover:text-rose-500 font-medium transition-colors cursor-pointer"
                        >
                          Clear all
                        </button>
                      </div>

                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {composerDraft.urls.map((u, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Globe className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                              <span className="truncate max-w-[200px] text-[var(--text)] font-medium">
                                {u}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeUrl(i);
                              }}
                              className="p-1 rounded text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--accent)] transition-colors cursor-pointer shrink-0"
                              title="Remove URL"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Composer Footer Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[var(--border-subtle)]">
            {/* Left Options: Attachments, URL, Tools Popover & Format Selector */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* File upload hidden input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.md,image/*"
                onChange={handleFileInputChange}
                className="hidden"
              />

              {/* Attach Dropdown Menu (Upload Files & Web URL) */}
              <div className="relative" ref={attachMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowAttachMenu(!showAttachMenu)}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                  title="Attach files or add web URLs"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  <span>Attach</span>
                  <ChevronDown
                    className={`h-3 w-3 text-[var(--text-muted)] transition-transform duration-150 ${
                      showAttachMenu ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showAttachMenu && (
                  <div className="absolute left-0 bottom-full mb-2 sm:bottom-auto sm:top-full sm:mt-2 z-50 w-44 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl text-xs space-y-0.5 animate-in fade-in-50 zoom-in-95 duration-100">
                    <button
                      type="button"
                      onClick={() => {
                        fileInputRef.current?.click();
                        setShowAttachMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <FileUp className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>Upload Files</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowUrlInput(true);
                        setShowAttachMenu(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <Globe className="h-3.5 w-3.5 text-[var(--primary)]" />
                      <span>Add Web URL</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Quick URL Button */}
              <button
                type="button"
                onClick={() => setShowUrlInput(!showUrlInput)}
                disabled={isProcessing}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  showUrlInput || composerDraft.urls.length > 0
                    ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                    : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                }`}
                title="Add reference URL source"
              >
                <Globe className="h-3.5 w-3.5" />
                <span>URL</span>
              </button>

              {/* Tools / Capabilities Popover Trigger */}
              <div className="relative" ref={toolsPopoverRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowToolsPopover(!showToolsPopover);
                    setActiveInfoTooltip(null);
                  }}
                  aria-expanded={showToolsPopover}
                  aria-haspopup="dialog"
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    activeToolsCount > 0
                      ? 'border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] font-semibold'
                      : 'border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
                  }`}
                  title="Configure creation tools & capabilities"
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>Tools</span>
                  {activeToolsCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--primary)] text-white text-[10px] font-mono leading-none">
                      {activeToolsCount}
                    </span>
                  )}
                </button>

                {/* Compact Floating Tools Popover */}
                {showToolsPopover && (
                  <div
                    role="dialog"
                    aria-label="Creation tools"
                    className="absolute left-0 bottom-full mb-2 sm:bottom-auto sm:top-full sm:mt-2 z-50 w-72 sm:w-80 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-xl space-y-3 animate-in fade-in-50 zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
                      <span className="text-xs font-semibold text-[var(--text)]">
                        Creation Tools
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] font-mono">
                        {activeToolsCount} active
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {toolsList.map((tool) => (
                        <div
                          key={tool.id}
                          className={`flex items-center justify-between gap-3 p-2 rounded-xl transition-colors ${
                            !tool.isAvailable
                              ? 'opacity-60 bg-[var(--accent)]/30'
                              : tool.isEnabled
                              ? 'bg-[var(--accent)]/50'
                              : 'hover:bg-[var(--accent)]/30'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <tool.icon className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                            <span className="text-xs font-medium text-[var(--text)] truncate">
                              {tool.name}
                            </span>

                            {/* Information (i) Icon with Hover & Focus Tooltip */}
                            <div className="relative group/info inline-flex items-center">
                              <button
                                type="button"
                                aria-label={`Information about ${tool.name}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveInfoTooltip(
                                    activeInfoTooltip === tool.id ? null : tool.id
                                  );
                                }}
                                className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text)] focus-visible:text-[var(--text)] focus-visible:outline-none transition-colors cursor-pointer"
                              >
                                <Info className="h-3.5 w-3.5" />
                              </button>

                              {/* Tooltip on hover / focus / tap */}
                              <div
                                role="tooltip"
                                className={`pointer-events-none absolute left-0 sm:left-1/2 sm:-translate-x-1/2 bottom-full mb-2 z-50 w-56 p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] text-[11px] text-[var(--text)] leading-snug shadow-xl transition-all ${
                                  activeInfoTooltip === tool.id
                                    ? 'block pointer-events-auto'
                                    : 'hidden group-hover/info:block group-focus-within/info:block'
                                }`}
                              >
                                <p>{tool.description}</p>
                                {!tool.isAvailable && (
                                  <Link
                                    href="/settings/ai"
                                    className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium hover:underline mt-1.5"
                                  >
                                    <span>Configure in Settings</span>
                                    <ExternalLink className="h-2.5 w-2.5" />
                                  </Link>
                                )}
                              </div>
                            </div>
                          </div>

                          <Toggle
                            checked={tool.isAvailable && tool.isEnabled}
                            disabled={!tool.isAvailable}
                            onChange={tool.onToggle}
                            size="sm"
                            aria-label={`Enable ${tool.name}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Format Selector Pills */}
              <div className="inline-flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => updateComposerDraft({ format: 'auto' })}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors cursor-pointer ${
                    composerDraft.format === 'auto'
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="AI automatically determines best format"
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => updateComposerDraft({ format: 'doc' })}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors cursor-pointer ${
                    composerDraft.format === 'doc'
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Document format"
                >
                  <FileText className="h-3 w-3" />
                  <span>Doc</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateComposerDraft({ format: 'sheet' })}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors cursor-pointer ${
                    composerDraft.format === 'sheet'
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Spreadsheet format"
                >
                  <Table className="h-3 w-3" />
                  <span>Sheet</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateComposerDraft({ format: 'slide' })}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors cursor-pointer ${
                    composerDraft.format === 'slide'
                      ? 'bg-[var(--primary)] text-white shadow-2xs'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                  title="Presentation slide format"
                >
                  <Presentation className="h-3 w-3" />
                  <span>Slides</span>
                </button>
              </div>
            </div>

            {/* Right: Send / Create Button with Hover & Focus Tooltip */}
            <div className="relative group/send self-end sm:self-auto">
              <button
                type="button"
                onClick={handleCreate}
                disabled={!composerDraft.prompt.trim() || isProcessing}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] text-white px-4 py-2 text-xs font-semibold hover:bg-[var(--primary-hover)] transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--primary)]/40 outline-none"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>{processingStep}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Create Workspace</span>
                  </>
                )}
              </button>

              {/* Keyboard shortcut tooltip on hover / keyboard focus */}
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full mb-1.5 right-0 hidden group-hover/send:block group-focus-within/send:block z-50 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[10px] font-mono text-[var(--text-muted)] shadow-md animate-in fade-in-50 duration-100"
              >
                <span>⌘ + Enter</span>
              </div>
            </div>
          </div>

          {/* URL Input Form */}
          {showUrlInput && (
            <form onSubmit={handleAddUrl} className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={urlInputValue}
                onChange={(e) => setUrlInputValue(e.target.value)}
                placeholder="https://example.com/research-paper or documentation link..."
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                autoFocus
              />
              <button
                type="submit"
                className="rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-medium hover:bg-[var(--primary-hover)] transition-colors"
              >
                Add URL
              </button>
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                Cancel
              </button>
            </form>
          )}
        </div>

        {/* Suggested Prompts Grid */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] px-1">
            <span className="font-medium">Quick Starters</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {suggestions.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  updateComposerDraft({
                    prompt: item.prompt,
                    format: item.format,
                  });
                }}
                className="group flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left hover:border-[var(--primary)] hover:bg-[var(--accent)]/40 transition-all shadow-2xs"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-[var(--text)] group-hover:text-[var(--primary)] transition-colors">
                    {item.label}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase bg-[var(--accent)] px-1.5 py-0.5 rounded">
                    {item.format}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-2 leading-relaxed">
                  {item.prompt}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Subtle Recent Items Below */}
      {recentItems.length > 0 && (
        <div className="border-t border-[var(--border)] pt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Recent Workspaces
            </h2>
            <Link
              href="/files"
              className="text-xs text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors inline-flex items-center gap-1 font-medium"
            >
              <span>View Library</span>
              <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {recentItems.map((item) => (
              <Link
                key={item.id}
                href={`/workspace/${item.id}`}
                className="group flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--primary)] hover:shadow-2xs transition-all"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] shrink-0 group-hover:bg-[var(--primary-light)] transition-colors">
                  {item.itemType === 'doc' ? (
                    <FileText className="h-4 w-4 text-[var(--primary)]" />
                  ) : item.itemType === 'sheet' ? (
                    <Table className="h-4 w-4 text-[var(--secondary)]" />
                  ) : (
                    <Presentation className="h-4 w-4 text-amber-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-semibold text-[var(--text)] truncate group-hover:text-[var(--primary)] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                    Updated {new Date(item.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useWorkspaceStore } from '@/lib/store';
import {
  AiChatMessage,
  ResearchSource,
  StructuredContentBlock,
  AgentActivityEvent,
  ProviderId,
  WorkspaceFileRecord,
  ActiveDocumentContext,
  EditorActionResult,
} from '@/lib/types';
import { AgentSSEEvent } from '@/lib/ai/agent/orchestrator';
import { editorRegistry } from '@/lib/editor/editorRegistry';
import { ChatHeader } from './ai-chat/ChatHeader';
import { ChatEmptyState } from './ai-chat/ChatEmptyState';
import { ChatMessageList } from './ai-chat/ChatMessageList';
import { ChatComposer, ComposerAttachmentItem } from './ai-chat/ChatComposer';
import { SourcesPanel } from './ai-chat/SourcesPanel';
import { ingestSource } from '@/lib/ai/ingestion';
import { streamingSessionManager, useStreamingStatus } from '@/lib/ai/streamingSession';
import { AiAvatar } from './ai-chat/AiAvatar';
import { Maximize2, X, Send } from 'lucide-react';

function createMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type { EditorActionResult };

interface WorkspaceAiProps {
  workspaceId: string;
  documentFormat: 'doc' | 'sheet' | 'slide' | 'pdf';
  availableEditorTools?: string[];
  onApplyAction?: (actionType: string, payload: any) => void;
  onApplyEditorAction?: (action: string, payload: Record<string, unknown>) => EditorActionResult | Promise<EditorActionResult> | void;
  getActiveDocumentContext?: () => Partial<ActiveDocumentContext>;
  fullWidth?: boolean;
}

export function WorkspaceAI({
  workspaceId,
  documentFormat,
  fullWidth = false,
  onApplyAction,
  onApplyEditorAction,
  getActiveDocumentContext,
}: WorkspaceAiProps) {
  const {
    ensureDocumentConversation,
    getActiveConversation,
    getConversationsForDocument,
    setActiveConversation,
    createNewDocumentConversation,
    addMessageToConversation,
    updateMessageInConversation,
    replaceAndTruncateFromMessage,
    truncateConversationFromMessage,
    setConversationRunStatus,
    setConversationModel,
    getDocumentSources,
    addDocumentSource,
    removeDocumentSource,
    documentSources,
    itemSources,
    sources: workspaceSources,
    getAiPanelState,
    updateAiPanelState,
    embeddingConfig,
    providers,
    defaultProvider,
    apiKeys,
    activeModel,
    cloudflareConfig,
    specializedModels,
    documents,
    sheets,
    slides,
    pdfs,
    createDocument,
    updateDocument,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [composerAttachments, setComposerAttachments] = useState<ComposerAttachmentItem[]>([]);
  const [isResizing, setIsResizing] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const triggeredInitialPromptRef = useRef<string | null>(null);

  // Idempotent initialization of workspace conversation
  useEffect(() => {
    if (workspaceId) {
      ensureDocumentConversation(workspaceId);
    }
  }, [workspaceId, ensureDocumentConversation]);

  // Retrieve active conversation strictly for this workspace
  const activeConversation = getActiveConversation(workspaceId);
  const workspaceConversations = getConversationsForDocument(workspaceId);
  const panelState = getAiPanelState(workspaceId);

  // Subscribe to isolated streaming status (zero re-renders on token deltas)
  const streamStatus = useStreamingStatus(activeConversation?.id);

  const convProviderId = (activeConversation?.selectedProvider || defaultProvider) as ProviderId;
  const currentProviderConfig = providers[convProviderId];
  const convModelId =
    activeConversation?.selectedModel ||
    currentProviderConfig?.selectedModel ||
    activeModel;

  const handleSelectModel = (providerId: ProviderId, modelId: string) => {
    if (activeConversation) {
      setConversationModel(workspaceId, activeConversation.id, providerId, modelId);
    }
  };

  // Active generation status per conversation (isolated from token-by-token state churn)
  const isGenerating =
    streamStatus.isGenerating ||
    activeConversation?.runStatus === 'preparing' ||
    activeConversation?.runStatus === 'executing_tool' ||
    activeConversation?.runStatus === 'generating';

  // Active sources: merge conversation-specific sources and reactive workspace document sources (deduped by id, contentHash, and title+size)
  const wsDocSources = documentSources?.[workspaceId];
  const wsItemSources = itemSources?.[workspaceId];
  const activeSources = React.useMemo(() => {
    const merged: ResearchSource[] = [];
    const byId = new Map<string, number>();
    const byHash = new Map<string, number>();
    const byTitleSize = new Map<string, number>();

    const combined = [
      ...(wsDocSources || []),
      ...(wsItemSources || []),
      ...workspaceSources.filter((s) => s.workspaceId === workspaceId),
      ...(activeConversation?.sources || []),
    ];

    for (const s of combined) {
      if (!s || !s.id) continue;
      const hashKey = s.contentHash ? s.contentHash.toLowerCase() : '';
      const titleKey = s.title ? `${s.title.toLowerCase()}::${(s.fileSize || '').toLowerCase()}` : '';
      const titleOnly = s.title ? s.title.toLowerCase() : '';

      const existingIdx =
        byId.get(s.id) ??
        (hashKey ? byHash.get(hashKey) : undefined) ??
        (titleKey ? byTitleSize.get(titleKey) : undefined) ??
        (titleOnly && !s.fileSize ? byTitleSize.get(`${titleOnly}::`) : undefined);

      if (existingIdx !== undefined) {
        const existing = merged[existingIdx];
        // Prefer richer server-indexed record over lightweight placeholder
        if (!existing.extractedText && s.extractedText) {
          merged[existingIdx] = { ...existing, ...s };
        }
        continue;
      }

      const idx = merged.length;
      merged.push(s);
      byId.set(s.id, idx);
      if (hashKey) byHash.set(hashKey, idx);
      if (titleKey) byTitleSize.set(titleKey, idx);
    }
    return merged;
  }, [activeConversation?.sources, wsDocSources, wsItemSources, workspaceSources, workspaceId]);

  const isSearchConfigured = Boolean(
    providers.brave?.apiKey ||
    providers.tavily?.apiKey ||
    providers.serper?.apiKey ||
    providers.searxng?.baseUrl ||
    providers.serpapi?.apiKey
  );

  const sessionToolsKey = `docium:session-tools:${workspaceId || 'global'}`;

  const readSessionTools = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(sessionToolsKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          return {
            internetSearch: Boolean(parsed.internetSearch),
            imageGeneration: Boolean(parsed.imageGeneration),
            chartsAndData: parsed.chartsAndData !== undefined ? Boolean(parsed.chartsAndData) : true,
          };
        }
      } catch {
        // Ignore storage read errors
      }
    }
    return {
      internetSearch: activeConversation?.selectedTools?.internetSearch ?? isSearchConfigured,
      imageGeneration: activeConversation?.selectedTools?.imageGeneration ?? false,
      chartsAndData: activeConversation?.selectedTools?.chartsAndData ?? true,
    };
  }, [sessionToolsKey, activeConversation?.selectedTools, isSearchConfigured]);

  // Enabled tools state (persisted in sessionStorage and conversation store across page refreshes)
  const [enabledTools, setEnabledTools] = useState(readSessionTools);

  // Sync tools when active conversation or workspace changes
  const [prevConversationId, setPrevConversationId] = useState(activeConversation?.id);
  if (prevConversationId !== activeConversation?.id) {
    setPrevConversationId(activeConversation?.id);
    setEnabledTools(readSessionTools());
  }

  const handleToggleTool = (toolKey: 'internetSearch' | 'imageGeneration' | 'chartsAndData', val: boolean) => {
    const next = { ...enabledTools, [toolKey]: val };
    setEnabledTools(next);
    if (typeof window !== 'undefined') {
      try {
        window.sessionStorage.setItem(sessionToolsKey, JSON.stringify(next));
      } catch {
        // Ignore storage write errors
      }
    }
    if (activeConversation && workspaceId) {
      useWorkspaceStore.setState((state) => {
        const list = state.documentConversations?.[workspaceId];
        if (!Array.isArray(list)) return state;
        return {
          documentConversations: {
            ...state.documentConversations,
            [workspaceId]: list.map((c) =>
              c.id === activeConversation.id
                ? { ...c, selectedTools: { ...c.selectedTools, [toolKey]: val } }
                : c
            ),
          },
        };
      });
    }
  };

  // Automatically trigger live AI generation when workspace was created with an initialPrompt from the main page
  useEffect(() => {
    if (!workspaceId || !activeConversation) return;
    if (triggeredInitialPromptRef.current === workspaceId) return;

    const currentItem =
      documents.find((d) => d.id === workspaceId) ||
      sheets.find((s) => s.id === workspaceId) ||
      slides.find((sl) => sl.id === workspaceId);

    const pendingPrompt = currentItem?.initialPrompt?.trim();
    if (!pendingPrompt) return;
    if (activeConversation.messages && activeConversation.messages.length > 0) return;

    triggeredInitialPromptRef.current = workspaceId;

    // Clear initialPrompt from store so refreshing the page does not re-run it
    if (documentFormat === 'doc') {
      updateDocument(workspaceId, { initialPrompt: undefined });
    }

    // Ensure AI panel is docked and visible while it works
    updateAiPanelState(workspaceId, { mode: 'docked' });

    let cancelled = false;
    const startLiveWork = async () => {
      if (documentFormat === 'doc') {
        await editorRegistry.waitForEditor(workspaceId, 2000);
      }
      if (!cancelled) {
        handleSendMessage(pendingPrompt);
      }
    };

    const timer = setTimeout(startLiveWork, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    workspaceId,
    activeConversation?.id,
    activeConversation?.messages?.length,
    documents,
    sheets,
    slides,
    documentFormat,
    updateDocument,
    updateAiPanelState,
  ]);

  // ==========================================
  // SEND MESSAGE & ORCHESTRATION STREAMING
  // ==========================================
  const executeAssistantTurn = async (params: {
    promptText: string;
    targetConversationId: string;
    currentAttachments: Array<{ id?: string; name: string; size?: string; type: string; url?: string }>;
    conversationHistoryOverride?: AiChatMessage[];
  }) => {
    const { promptText, targetConversationId, currentAttachments, conversationHistoryOverride } = params;

    // Add Assistant Streaming Placeholder
    const assistantMessageId = createMessageId('msg-assistant');
    const generationStartTime = Date.now();
    const assistantPlaceholder: AiChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      runStatus: 'preparing',
      activityEvents: [{
        id: createMessageId('act-init'),
        eventType: 'preparing_response',
        label: 'Preparing response',
        status: 'running',
        safeSummary: 'Analyzing request',
        timestamp: new Date().toISOString(),
      }],
      contentBlocks: [],
      citations: [],
      generationStartTime,
    };

    addMessageToConversation(workspaceId, targetConversationId, assistantPlaceholder);
    setConversationRunStatus(workspaceId, targetConversationId, 'preparing');
    setStreamingMessageId(assistantMessageId);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const { requestId } = streamingSessionManager.startSession({
      workspaceId,
      conversationId: targetConversationId,
      assistantMessageId,
      abortController,
      initialEvents: assistantPlaceholder.activityEvents,
    });

    // Resolve active provider credentials securely
    const activeProviderId: ProviderId = (activeConversation.selectedProvider || defaultProvider) as ProviderId;
    const currentProviderConfig = providers[activeProviderId];
    const resolvedApiKey =
      currentProviderConfig?.apiKey ||
      (apiKeys as Record<string, string>)?.[activeProviderId] ||
      (activeProviderId === 'cloudflare' ? cloudflareConfig?.apiToken : '') ||
      '';

    const resolvedBaseUrl = currentProviderConfig?.baseUrl;
    const resolvedAccountId =
      currentProviderConfig?.accountId ||
      (activeProviderId === 'cloudflare' ? cloudflareConfig?.accountId : undefined);
    const resolvedModel =
      activeConversation.selectedModel ||
      currentProviderConfig?.selectedModel ||
      activeModel ||
      (activeProviderId === 'cloudflare' ? '@cf/meta/llama-3.1-70b-instruct' : 'gpt-4o');

    const accumulatedEvents: AgentActivityEvent[] = [...(assistantPlaceholder.activityEvents || [])];

    // Transparent credential verification without silent cross-provider substitution
    if (!resolvedApiKey && activeProviderId !== 'ollama' && activeProviderId !== 'custom') {
      const providerName = currentProviderConfig?.name || activeProviderId;
      const errorMsg = `API credentials for ${providerName} are not configured. Please enter your API key in Settings → AI Providers or switch models.`;

      updateMessageInConversation(workspaceId, targetConversationId, assistantPlaceholder.id, {
        content: errorMsg,
        runStatus: 'failed',
        error: errorMsg,
        generationEndTime: Date.now(),
        activityEvents: [
          ...accumulatedEvents.map((e) =>
            e.status === 'running' ? { ...e, status: 'failed' as const, safeSummary: errorMsg } : e
          ),
          {
            id: createMessageId('act-err'),
            eventType: 'error',
            label: 'Configuration Required',
            status: 'failed',
            safeSummary: errorMsg,
            timestamp: new Date().toISOString(),
          },
        ],
      });
      setConversationRunStatus(workspaceId, targetConversationId, 'failed');
      setStreamingMessageId(null);
      return;
    }

    // Snapshot authoritative current-workspace sources directly from store + activeSources (deduped by id & hash)
    const latestState = useWorkspaceStore.getState();
    const authoritativeSources: ResearchSource[] = [];
    const seenAuthIds = new Set<string>();
    const seenAuthHashes = new Set<string>();
    const seenAuthNames = new Set<string>();
    for (const s of [
      ...activeSources,
      ...(latestState.documentSources?.[workspaceId] || []),
      ...(latestState.itemSources?.[workspaceId] || []),
      ...(latestState.sources || []).filter((s) => s.workspaceId === workspaceId),
    ]) {
      if (!s || !s.id) continue;
      const hashK = s.contentHash?.toLowerCase() || '';
      const nameK = `${s.title.toLowerCase()}::${(s.fileSize || '').toLowerCase()}`;
      if (seenAuthIds.has(s.id) || (hashK && seenAuthHashes.has(hashK)) || seenAuthNames.has(nameK)) {
        continue;
      }
      seenAuthIds.add(s.id);
      if (hashK) seenAuthHashes.add(hashK);
      seenAuthNames.add(nameK);
      authoritativeSources.push(s);
    }

    // Resolve @file mentions and manual @attach source references strictly from current workspace document sources
    const mentionMatches = Array.from(
      promptText.matchAll(
        /(?:^|\s)@(?:attach\s*\(\s*["']?([^"')]+)["']?\s*\)|([a-zA-Z0-9_\-\.\s()]+\.[a-zA-Z0-9]{2,5})|([^@\s,;:!?()]+))/gi
      )
    );
    const explicitFilenames = mentionMatches.map((m) => (m[1] || m[2] || m[3] || '').trim()).filter(Boolean);

    const resolvedExplicitSources: ResearchSource[] = [];
    for (const name of explicitFilenames) {
      const lowerName = name.toLowerCase();
      const match = authoritativeSources.find(
        (s: ResearchSource) =>
          s.title.toLowerCase() === lowerName ||
          s.id.toLowerCase() === lowerName ||
          s.title.toLowerCase().startsWith(lowerName) ||
          s.title.toLowerCase().replace(/\.[^/.]+$/, '') === lowerName.replace(/\.[^/.]+$/, '')
      );
      if (match && !resolvedExplicitSources.some((r) => r.id === match.id)) {
        resolvedExplicitSources.push(match);
      }
    }

    for (const att of currentAttachments) {
      const match = authoritativeSources.find(
        (s: ResearchSource) => s.id === att.id || s.title.toLowerCase() === att.name.toLowerCase()
      );
      if (match && !resolvedExplicitSources.some((r) => r.id === match.id)) {
        resolvedExplicitSources.push(match);
      }
    }

    const prioritizedSources = [...resolvedExplicitSources];
    for (const s of authoritativeSources) {
      if (!prioritizedSources.some((c) => c.id === s.id)) {
        prioritizedSources.push(s);
      }
    }

    const configuredSearchProvider = (['tavily', 'brave', 'serper', 'searxng', 'serpapi'] as const).find(
      (pId) => Boolean(providers[pId]?.apiKey) || (providers[pId]?.isAdded && providers[pId]?.status === 'connected')
    );
    const searchConfig = configuredSearchProvider
      ? {
          provider: configuredSearchProvider,
          apiKey: providers[configuredSearchProvider]?.apiKey,
          baseUrl: providers[configuredSearchProvider]?.baseUrl,
        }
      : undefined;

    const currentActiveDoc =
      documents.find((d) => d.id === workspaceId) ||
      sheets.find((s) => s.id === workspaceId) ||
      slides.find((sl) => sl.id === workspaceId) ||
      pdfs.find((p) => p.id === workspaceId);

    const workspaceFiles: WorkspaceFileRecord[] = currentActiveDoc
      ? [
          {
            id: currentActiveDoc.id,
            title: currentActiveDoc.title,
            type: ((currentActiveDoc as any).type || documentFormat || 'doc') as 'doc' | 'sheet' | 'slide' | 'pdf',
            content: 'content' in currentActiveDoc ? (currentActiveDoc as { content?: string }).content : undefined,
            updatedAt: currentActiveDoc.updatedAt ? String(currentActiveDoc.updatedAt) : undefined,
            wordCount: (currentActiveDoc as any).wordCount,
          },
        ]
      : [];

    let activeDocument: ActiveDocumentContext | undefined = undefined;
    const isEditorRegistered = editorRegistry.hasActiveEditor(workspaceId);

    if (getActiveDocumentContext) {
      const dynamicCtx = getActiveDocumentContext();
      activeDocument = {
        id: currentActiveDoc?.id || workspaceId,
        title: currentActiveDoc?.title || 'Untitled',
        format: documentFormat,
        content: 'content' in (currentActiveDoc || {}) ? (currentActiveDoc as { content?: string }).content : undefined,
        editorMounted: dynamicCtx?.editorMounted !== undefined ? dynamicCtx.editorMounted : isEditorRegistered,
        isEditable: dynamicCtx?.isEditable !== undefined ? dynamicCtx.isEditable : true,
        ...dynamicCtx,
      };
    } else if (currentActiveDoc) {
      activeDocument = {
        id: currentActiveDoc.id,
        title: currentActiveDoc.title,
        format: documentFormat,
        content: 'content' in currentActiveDoc ? (currentActiveDoc as { content?: string }).content : undefined,
        editorMounted: isEditorRegistered,
        isEditable: true,
      };
    }

    const userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const historyToSend =
      conversationHistoryOverride ||
      useWorkspaceStore.getState().documentConversations?.[workspaceId]?.find((c) => c.id === targetConversationId)?.messages ||
      activeConversation.messages ||
      [];

    const accumulatedBlocks: StructuredContentBlock[] = [];
    const accumulatedCitations: Array<{ sourceId: string; sourceTitle: string; page?: number; snippet: string; url?: string }> = [];
    const processedActionIds = new Set<string>();

    try {
      const response = await fetch('/api/ai/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          workspaceId,
          workspaceType: documentFormat,
          conversationId: targetConversationId,
          userPrompt: promptText,
          attachments: currentAttachments,
          attachedSources: prioritizedSources,
          explicitSourceIds: resolvedExplicitSources.map((s) => s.id),
          conversationHistory: historyToSend,
          scratchpad: activeConversation.scratchpad || '',
          providerId: activeProviderId,
          modelId: resolvedModel,
          apiKey: resolvedApiKey,
          baseUrl: resolvedBaseUrl,
          accountId: resolvedAccountId,
          searchConfig,
          enabledTools,
          workspaceFiles,
          activeDocument,
          timeZone: userTimeZone,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errText = '';
        try {
          const errJson = await response.json();
          errText = errJson.error || errJson.message || JSON.stringify(errJson);
        } catch {
          errText = await response.text();
        }
        throw new Error(`Agent request failed (${response.status}): ${errText || 'Network error'}`);
      }

      await streamingSessionManager.consumeResponseStream({
        conversationId: targetConversationId,
        requestId,
        response,
        callbacks: {
          onActivity: (evt) => {
            const existingIdx = accumulatedEvents.findIndex(
              (e) => (evt.id && e.id === evt.id) || (evt.stepId && e.stepId === evt.stepId)
            );
            if (existingIdx !== -1) {
              const prev = accumulatedEvents[existingIdx];
              const mergedUpdates = [...(prev.updates || [])];
              if (evt.updates && evt.updates.length > 0) {
                for (const u of evt.updates) {
                  const uTrim = (u.content || '').trim();
                  const uIdx = mergedUpdates.findIndex(
                    (x) => x.id === u.id || (uTrim && (x.content || '').trim() === uTrim)
                  );
                  if (uIdx !== -1) {
                    mergedUpdates[uIdx] = { ...mergedUpdates[uIdx], ...u };
                  } else {
                    mergedUpdates.push(u);
                  }
                }
                mergedUpdates.sort((a, b) => a.sequence - b.sequence);
              }
              accumulatedEvents[existingIdx] = {
                ...prev,
                ...evt,
                updates: mergedUpdates.length > 0 ? mergedUpdates : prev.updates,
              };
            } else {
              accumulatedEvents.push(evt);
            }
          },
          onWorkingProgressUpdate: (stepId, update) => {
            const existingIdx = accumulatedEvents.findIndex(
              (e) => (stepId && e.id === stepId) || (stepId && e.stepId === stepId)
            );
            if (existingIdx !== -1) {
              const prev = accumulatedEvents[existingIdx];
              const mergedUpdates = [...(prev.updates || [])];
              const uTrim = (update.content || '').trim();
              const uIdx = mergedUpdates.findIndex(
                (x) => x.id === update.id || (uTrim && (x.content || '').trim() === uTrim)
              );
              if (uIdx !== -1) {
                mergedUpdates[uIdx] = update;
              } else {
                mergedUpdates.push(update);
              }
              mergedUpdates.sort((a, b) => a.sequence - b.sequence);
              accumulatedEvents[existingIdx] = {
                ...prev,
                updates: mergedUpdates,
                safeSummary: update.content || prev.safeSummary,
              };
            }
          },
          onFinalResponseStarted: () => {
            for (let i = 0; i < accumulatedEvents.length; i++) {
              if (accumulatedEvents[i].status === 'running') {
                accumulatedEvents[i] = {
                  ...accumulatedEvents[i],
                  status: 'completed',
                  safeSummary: accumulatedEvents[i].safeSummary || 'Completed',
                };
              }
            }
          },
          onBlock: (block) => {
            accumulatedBlocks.push(block);
          },
          onCitation: (citation) => {
            const key = citation.url
              ? `url:${citation.url}`
              : `src:${(citation.sourceId || citation.sourceTitle || '').toLowerCase()}`;
            const existingIdx = accumulatedCitations.findIndex((c) => {
              const cKey = c.url
                ? `url:${c.url}`
                : `src:${(c.sourceId || c.sourceTitle || '').toLowerCase()}`;
              return cKey === key;
            });
            if (existingIdx === -1) {
              accumulatedCitations.push(citation);
            } else if (citation.page && !accumulatedCitations[existingIdx].page) {
              accumulatedCitations[existingIdx] = {
                ...accumulatedCitations[existingIdx],
                page: citation.page,
              };
            }
          },
          onStatus: (status) => {
            setConversationRunStatus(workspaceId, targetConversationId, status);
          },
          onScratchpad: (notes) => {
            useWorkspaceStore.setState((s) => {
              const convs = s.documentConversations[workspaceId] || [];
              const updated = convs.map((c) =>
                c.id === targetConversationId ? { ...c, scratchpad: notes } : c
              );
              return {
                documentConversations: {
                  ...s.documentConversations,
                  [workspaceId]: updated,
                },
              };
            });
          },
          onFileOp: (op) => {
            if (op.operation === 'update') {
              updateDocument(op.itemId, {
                title: op.title,
                content: op.content,
                updatedAt: new Date().toISOString(),
              });
              if (op.itemId === workspaceId && onApplyAction) {
                onApplyAction('insert_doc', op.content);
              }
            } else if (op.operation === 'create') {
              createDocument('doc', op.title, op.content);
            }
          },
          onEditorAction: async (event) => {
            const actionKey = event.actionId || `${event.action}-${JSON.stringify(event.payload)}`;
            if (processedActionIds.has(actionKey)) {
              console.log('[DOCIUM Editor Bridge] Ignoring duplicate action dispatch in browser:', actionKey);
              return;
            }
            processedActionIds.add(actionKey);

            let actionResult: EditorActionResult | undefined;
            if (onApplyEditorAction) {
              const res = await onApplyEditorAction(event.action, event.payload);
              if (res) actionResult = res;
            }

            if (!actionResult) {
              const targetDoc = (event.payload?.documentId as string) || workspaceId;
              const regResult = await editorRegistry.executeAction(
                event.action,
                event.payload,
                targetDoc,
                (id, updates) => {
                  updateDocument(id, updates);
                }
              );
              if (regResult) {
                actionResult = regResult;
              }
            }

            if (!actionResult && onApplyAction) {
              onApplyAction(event.action, event.payload as any);
            }

            if (actionResult) {
              const actId = `act-edit-${event.actionId || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
              const act: AgentActivityEvent = actionResult.success
                ? {
                    id: actId,
                    eventType: 'editor_action_verified',
                    label: 'Verifying the changes',
                    status: 'completed',
                    safeSummary: actionResult.summary || 'The document changes have been verified and applied to the active page.',
                    timestamp: new Date().toISOString(),
                  }
                : {
                    id: actId,
                    eventType: 'editor_action_failed',
                    label: 'Verifying the changes',
                    status: 'failed',
                    safeSummary: actionResult.error || 'Failed to apply document changes.',
                    timestamp: new Date().toISOString(),
                  };

              const existingIdx = accumulatedEvents.findIndex(
                (e) => (event.actionId && e.id === event.actionId) || e.id === actId
              );
              if (existingIdx !== -1) {
                accumulatedEvents[existingIdx] = act;
              } else {
                accumulatedEvents.push(act);
              }

              if (!actionResult.success) {
                const failNotice = `\n\n> ⚠️ **Document Edit Failed**: ${actionResult.error || 'Failed to modify document'}`;
                const currentSessionContent = streamingSessionManager.getSnapshot(targetConversationId).content;
                if (!currentSessionContent.includes(failNotice)) {
                  streamingSessionManager.appendDelta(targetConversationId, requestId, failNotice);
                }
              }

              streamingSessionManager.upsertActivityEvent(targetConversationId, requestId, act);
            }
          },
          onDone: async (finalContent) => {
            const hasCompletedToolsOrActions =
              accumulatedBlocks.length > 0 ||
              accumulatedEvents.some(
                (e) =>
                  e.status === 'completed' &&
                  e.eventType !== 'phase'
              );

            let contentToCommit = finalContent;
            if (!contentToCommit.trim() && hasCompletedToolsOrActions) {
              const isDocEdit = accumulatedEvents.some(
                (e) =>
                  e.eventType.startsWith('editor_action') ||
                  e.eventType.startsWith('file_op') ||
                  e.label.toLowerCase().includes('document') ||
                  e.label.toLowerCase().includes('file')
              );
              contentToCommit = isDocEdit
                ? 'Applied updates directly to the active document.'
                : 'Completed the requested operations.';
            }

            const finalEvents = accumulatedEvents.map((e) =>
              e.status === 'running' ? { ...e, status: 'completed' as const, safeSummary: e.safeSummary || 'Completed' } : e
            );

            setConversationRunStatus(workspaceId, targetConversationId, 'completed');
            updateMessageInConversation(workspaceId, targetConversationId, assistantMessageId, {
              content: contentToCommit,
              status: 'completed',
              runStatus: 'completed',
              activityEvents: finalEvents,
              contentBlocks: accumulatedBlocks,
              citations: accumulatedCitations,
              generationStartTime,
              generationEndTime: Date.now(),
            });
          },
          onError: async (errorMsg) => {
            const finalEvents = accumulatedEvents.map((e) =>
              e.status === 'running' ? { ...e, status: 'failed' as const, safeSummary: errorMsg } : e
            );
            const sessionContent = streamingSessionManager.getSnapshot(targetConversationId).content;
            setConversationRunStatus(workspaceId, targetConversationId, 'failed');
            updateMessageInConversation(workspaceId, targetConversationId, assistantMessageId, {
              content: sessionContent || errorMsg,
              status: 'failed',
              runStatus: 'failed',
              error: errorMsg,
              activityEvents: finalEvents,
              generationEndTime: Date.now(),
            });
          },
        },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Generation interrupted';
      const isAbort = (err instanceof Error && err.name === 'AbortError') || abortController.signal.aborted;
      const finalStatus = isAbort ? 'cancelled' : 'failed';
      const snap = streamingSessionManager.getSnapshot(targetConversationId);
      const sourceEvents = (snap.activityEvents && snap.activityEvents.length > 0 ? snap.activityEvents : accumulatedEvents);
      const finalEvents: AgentActivityEvent[] = sourceEvents.map((e) =>
        e.status === 'running'
          ? { ...e, status: (isAbort ? 'completed' : 'failed') as 'completed' | 'failed', safeSummary: isAbort ? 'Stopped' : errorMsg }
          : e
      );
      setConversationRunStatus(workspaceId, targetConversationId, finalStatus);
      updateMessageInConversation(workspaceId, targetConversationId, assistantMessageId, {
        content: snap.content || (isAbort ? 'Generation stopped.' : errorMsg),
        status: isAbort ? 'completed' : 'failed',
        runStatus: finalStatus,
        error: isAbort ? undefined : errorMsg,
        activityEvents: finalEvents,
        contentBlocks: accumulatedBlocks,
        citations: accumulatedCitations,
        generationEndTime: Date.now(),
      });
    } finally {
      abortControllerRef.current = null;
      setStreamingMessageId(null);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const promptText = (textToSend || input).trim();
    if (!promptText && composerAttachments.length === 0) return;
    if (isGenerating) return;

    setInput('');
    const currentAttachments = [...composerAttachments];
    setComposerAttachments([]);

    // Auto-generate conversation title from first prompt if default title
    if (
      promptText &&
      (activeConversation.messages.length === 0 ||
        activeConversation.title.startsWith('Chat ') ||
        activeConversation.title === 'Workspace Conversation' ||
        activeConversation.title.startsWith('Conversation '))
    ) {
      const autoTitle = promptText.length > 28 ? promptText.slice(0, 28).trim() + '...' : promptText;
      handleRenameConversation(activeConversation.id, autoTitle);
    }

    const targetConversationId = activeConversation.id;

    // 1. Add User Message with real ISO timestamp
    const userMessageId = createMessageId('msg-user');
    const userMessage: AiChatMessage = {
      id: userMessageId,
      role: 'user',
      content: promptText,
      timestamp: new Date().toISOString(),
      attachments: currentAttachments.map((a) => ({
        name: a.name,
        size: a.size,
        type: a.type,
        url: a.url,
      })),
    };

    addMessageToConversation(workspaceId, targetConversationId, userMessage);

    await executeAssistantTurn({
      promptText,
      targetConversationId,
      currentAttachments: userMessage.attachments || [],
    });
  };

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (activeConversation) {
      const stopResult = streamingSessionManager.stopSession(activeConversation.id);
      setConversationRunStatus(workspaceId, activeConversation.id, 'cancelled');
      const lastMsg = [...(activeConversation.messages || [])].reverse().find((m) => m.role === 'assistant');
      if (lastMsg && (lastMsg.runStatus === 'preparing' || lastMsg.runStatus === 'generating' || lastMsg.runStatus === 'executing_tool')) {
        const finalizedEvents = (stopResult?.activityEvents || lastMsg.activityEvents || []).map((e) =>
          e.status === 'running' ? { ...e, status: 'completed' as const, safeSummary: e.safeSummary || 'Stopped' } : e
        );
        updateMessageInConversation(workspaceId, activeConversation.id, lastMsg.id, {
          content: stopResult?.content || lastMsg.content || 'Generation stopped.',
          activityEvents: finalizedEvents,
          runStatus: 'cancelled',
          status: 'completed',
          generationEndTime: Date.now(),
        });
      }
    }
    setStreamingMessageId(null);
  }, [activeConversation, workspaceId, setConversationRunStatus, updateMessageInConversation]);

  const handleEditMessage = async (messageId: string, newContent: string) => {
    const trimmed = newContent.trim();
    if (!trimmed || !activeConversation || isGenerating) return;

    const targetConversationId = activeConversation.id;
    const editedMsg = replaceAndTruncateFromMessage(workspaceId, targetConversationId, messageId, trimmed);
    if (!editedMsg) return;

    const updatedMsgs =
      useWorkspaceStore.getState().documentConversations?.[workspaceId]?.find((c) => c.id === targetConversationId)?.messages || [];

    await executeAssistantTurn({
      promptText: trimmed,
      targetConversationId,
      currentAttachments: editedMsg.attachments || [],
      conversationHistoryOverride: updatedMsgs,
    });
  };

  const handleRegenerate = async (messageId?: string) => {
    if (!activeConversation || isGenerating) return;
    const targetConversationId = activeConversation.id;
    const msgs = activeConversation.messages || [];

    const assistantIdx = messageId
      ? msgs.findIndex((m) => m.id === messageId)
      : (() => {
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].role === 'assistant') return i;
          }
          return -1;
        })();

    if (assistantIdx === -1) return;
    const targetAssistantMsg = msgs[assistantIdx];

    // Find the user message immediately preceding this assistant response
    let userMsg: AiChatMessage | undefined;
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        userMsg = msgs[i];
        break;
      }
    }
    if (!userMsg || (!userMsg.content?.trim() && (!userMsg.attachments || userMsg.attachments.length === 0))) {
      return;
    }

    truncateConversationFromMessage(workspaceId, targetConversationId, targetAssistantMsg.id);
    const updatedMsgs =
      useWorkspaceStore.getState().documentConversations?.[workspaceId]?.find((c) => c.id === targetConversationId)?.messages || [];

    await executeAssistantTurn({
      promptText: userMsg.content,
      targetConversationId,
      currentAttachments: userMsg.attachments || [],
      conversationHistoryOverride: updatedMsgs,
    });
  };

  const handleRetry = () => {
    void handleRegenerate();
  };

  // Safe cleanup of streams and operations on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // ==========================================
  // ATTACHMENT HANDLERS (FILES & URLS)
  // ==========================================
  const handleTriggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const targetConvId = activeConversation?.id || `conv-${workspaceId}-init`;
    const formData = new FormData();
    formData.append('workspaceId', workspaceId);
    formData.append('conversationId', targetConvId);
    if (embeddingConfig) {
      formData.append('embeddingConfig', JSON.stringify(embeddingConfig));
    }

    // Pass configured vision captioning provider/credentials when available so uploaded images can be summarized once upfront
    const visProviderId = (specializedModels?.vision?.providerId || convProviderId) as ProviderId;
    const visModelId = specializedModels?.vision?.modelId || convModelId;
    const visProviderCfg = providers[visProviderId];
    const visApiKey =
      visProviderCfg?.apiKey ||
      (apiKeys as Record<string, string>)?.[visProviderId] ||
      (visProviderId === 'cloudflare' ? cloudflareConfig?.apiToken : '') ||
      '';
    const visAccountId =
      visProviderCfg?.accountId ||
      (visProviderId === 'cloudflare' ? cloudflareConfig?.accountId : undefined);
    if (visProviderId && (visApiKey || visProviderId === 'ollama' || visProviderId === 'custom')) {
      formData.append(
        'visionConfig',
        JSON.stringify({
          providerId: visProviderId,
          modelId: visModelId,
          apiKey: visApiKey,
          baseUrl: visProviderCfg?.baseUrl,
          accountId: visAccountId,
        })
      );
    }

    Array.from(files).forEach((f) => formData.append('files', f));

    try {
      const res = await fetch('/api/ai/sources/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        const sources: ResearchSource[] = json.sources || [];

        for (const src of sources) {
          addDocumentSource(workspaceId, src);
          setComposerAttachments((prev) => {
            if (prev.some((a) => a.id === src.id || a.name.toLowerCase() === src.title.toLowerCase())) {
              return prev;
            }
            return [
              ...prev,
              {
                id: src.id,
                name: src.title,
                size: src.fileSize || 'File',
                type: src.mimeType || 'document',
                url: (src as any).extractedImages?.[0]?.url,
              },
            ];
          });
          // Ingest into semantic vector index safely without breaking upload
          try {
            ingestSource(src, workspaceId, embeddingConfig);
          } catch (ingestErr) {
            console.warn('[DOCIUM] Semantic vector indexing warning (original source preserved):', ingestErr);
          }
        }
      } else {
        const errJson = await res.json().catch(() => ({}));
        const errorMsg = errJson.error || `Upload failed with status ${res.status}`;
        alert(`Upload error: ${errorMsg}`);
      }
    } catch (uploadErr: any) {
      const message = uploadErr?.message || 'Failed to upload and index file.';
      alert(`Upload error: ${message}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddUrlSource = async (url: string) => {
    try {
      const res = await fetch('/api/ai/sources/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          workspaceId,
          conversationId: activeConversation?.id || `conv-${workspaceId}-init`,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const src: ResearchSource = json.source;
        addDocumentSource(workspaceId, src);
        setComposerAttachments((prev) => [
          ...prev,
          {
            id: src.id,
            name: src.title,
            size: src.fileSize || 'Link',
            type: 'url',
            url: src.sourceUrl,
          },
        ]);
        // Ingest into vector index
        ingestSource(src, workspaceId, embeddingConfig);
      } else {
        const errJson = await res.json();
        alert(errJson.error || 'Failed to attach URL.');
      }
    } catch {
      alert('Error fetching URL source.');
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setComposerAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleMentionSelect = useCallback(
    (src: { id: string; title: string; type: string; size?: string }) => {
      setComposerAttachments((prev) => {
        if (prev.some((a) => a.id === src.id || a.name.toLowerCase() === src.title.toLowerCase())) {
          return prev;
        }
        return [
          ...prev,
          {
            id: src.id,
            name: src.title,
            size: src.size || 'Workspace File',
            type: src.type || 'document',
          },
        ];
      });
    },
    []
  );

  // Conversation Management Handlers
  const handleSelectConversation = (convId: string) => {
    setActiveConversation(workspaceId, convId);
  };

  const handleCreateNewConversation = () => {
    createNewDocumentConversation(workspaceId);
  };

  const handleRenameConversation = (convId: string, newTitle: string) => {
    useWorkspaceStore.setState((s) => {
      const convs = s.documentConversations[workspaceId] || [];
      const updated = convs.map((c) => (c.id === convId ? { ...c, title: newTitle } : c));
      return {
        documentConversations: {
          ...s.documentConversations,
          [workspaceId]: updated,
        },
      };
    });
  };

  const handleDeleteConversation = (convId: string) => {
    useWorkspaceStore.setState((s) => {
      const convs = s.documentConversations[workspaceId] || [];
      const updated = convs.filter((c) => c.id !== convId);
      const nextActiveId = updated[0]?.id || '';
      return {
        documentConversations: {
          ...s.documentConversations,
          [workspaceId]: updated,
        },
        lastSelectedChatId: {
          ...s.lastSelectedChatId,
          [workspaceId]: nextActiveId,
        },
      };
    });
  };

  // Resizing logic for docked panel
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = panelState.preferredWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, 320), 650);
      updateAiPanelState(workspaceId, { preferredWidth: newWidth });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // ==========================================
  // 0. HIDDEN MODE
  // ==========================================
  if (panelState.mode === 'hidden' && !fullWidth) {
    return null;
  }

  // ==========================================
  // 1. MINIMIZED MODE: FLOATING BRAND ICON
  // ==========================================
  if (panelState.mode === 'minimized' && !fullWidth) {
    return (
      <div className="workspace-ai-panel print:hidden fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => updateAiPanelState(workspaceId, { mode: 'compact' })}
          className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface)] text-white shadow-2xl hover:scale-105 transition-all cursor-pointer border border-[var(--border)] p-2.5 overflow-hidden"
          title="Open Docium AI"
        >
          <AiAvatar size="md" isGenerating={isGenerating} />
        </button>
      </div>
    );
  }

  // ==========================================
  // 2. COMPACT MODE: FLOATING QUICK PROMPT
  // ==========================================
  if (panelState.mode === 'compact' && !fullWidth) {
    return (
      <div className="workspace-ai-panel print:hidden fixed bottom-5 right-5 z-40 w-96 max-w-[92vw] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-2xl space-y-2.5 animate-in slide-in-from-bottom-4 duration-150">
        <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2 min-w-0">
            <AiAvatar size="xs" isGenerating={isGenerating} />
            <span className="text-xs font-semibold text-[var(--text)] truncate">
              {activeConversation?.title || 'Docium AI'}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateAiPanelState(workspaceId, { mode: 'docked' })}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]"
              title="Maximize to docked panel"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => updateAiPanelState(workspaceId, { mode: 'minimized' })}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]"
              title="Minimize to icon"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateAiPanelState(workspaceId, { mode: 'docked' });
                handleSendMessage();
              }
            }}
            placeholder="Ask Docium AI..."
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs text-[var(--text)] outline-none focus:border-[var(--primary)]"
          />
          <button
            type="button"
            onClick={() => {
              updateAiPanelState(workspaceId, { mode: 'docked' });
              handleSendMessage();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] shrink-0 cursor-pointer shadow-xs"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // 3. DOCKED / FULL-WIDTH MODE
  // ==========================================
  const messages = activeConversation?.messages || [];
  const hasMessages = messages.length > 0;

  return (
    <div
      style={fullWidth ? undefined : { width: `${panelState.preferredWidth}px` }}
      className={`workspace-ai-panel print:hidden relative flex flex-col h-full bg-[var(--surface)] shrink-0 transition-[width] duration-75 ${
        fullWidth
          ? 'w-full rounded-2xl border border-[var(--border)] shadow-xs overflow-hidden'
          : 'border-l border-[var(--border)]'
      }`}
    >
      {/* Resizing Handle (only in side docked mode) */}
      {!fullWidth && (
        <div
          onMouseDown={handleMouseDownResize}
          className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[var(--primary)]/40 transition-colors z-30 ${
            isResizing ? 'bg-[var(--primary)]' : ''
          }`}
          title="Drag to resize panel"
        />
      )}

      {/* Hidden File Picker Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Header */}
      <ChatHeader
        currentConversation={activeConversation}
        workspaceConversations={workspaceConversations}
        onSelectConversation={handleSelectConversation}
        onCreateNewConversation={handleCreateNewConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        attachedSourcesCount={activeSources.length}
        sourcesOpen={sourcesOpen}
        onToggleSources={() => setSourcesOpen(!sourcesOpen)}
        onMinimize={() => updateAiPanelState(workspaceId, { mode: 'minimized' })}
      />

      {/* Sources Side Panel (Direct child of root container, flush below ChatHeader) */}
      <SourcesPanel
        isOpen={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        sources={activeSources}
        onRemoveSource={(id) => removeDocumentSource(workspaceId, id)}
      />

      {/* Main Conversation Body */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {!hasMessages ? (
          <ChatEmptyState onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
        ) : (
          <ChatMessageList
            messages={messages}
            conversationId={activeConversation?.id}
            isGenerating={isGenerating}
            streamingMessageId={streamingMessageId}
            onRegenerate={handleRegenerate}
            onEditMessage={handleEditMessage}
            onRetry={handleRetry}
            messagesEndRef={messagesEndRef}
          />
        )}
      </div>

      {/* Bottom Composer */}
      <ChatComposer
        input={input}
        onChangeInput={setInput}
        onSend={() => handleSendMessage()}
        onStop={handleStopGeneration}
        isGenerating={isGenerating}
        attachments={composerAttachments}
        onRemoveAttachment={handleRemoveAttachment}
        onTriggerFileUpload={handleTriggerFileUpload}
        onAddUrlSource={handleAddUrlSource}
        enabledTools={enabledTools}
        onToggleTool={handleToggleTool}
        currentProviderId={convProviderId}
        currentModelId={convModelId}
        onSelectModel={handleSelectModel}
        workspaceId={workspaceId}
        workspaceSources={activeSources}
        onMentionSelect={handleMentionSelect}
      />
    </div>
  );
}

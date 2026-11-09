import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DocumentItem,
  SpreadsheetItem,
  PresentationItem,
  PdfItem,
  ProjectItem,
  ResearchSource,
  NotificationItem,
  AiChatMessage,
  PdfAnnotation,
  CellData,
  SlideElement,
  ProviderId,
  ProviderConfig,
  ModelOption,
  OutputFormat,
  AnyWorkspaceItem,
  ComposerDraft,
  WorkspaceConversation,
  EmbeddingConfig,
  SpecializedTaskModels,
  AiPanelState,
} from './types';
import { INITIAL_PROVIDER_CONFIGS, getChatVisionModels } from './ai/providers';
import { normalizeWorkspaceItem, normalizeWorkspaceItems } from './itemNormalization';
import {
  SAMPLE_DOCUMENTS,
  SAMPLE_SHEETS,
  SAMPLE_SLIDES,
  SAMPLE_PDFS,
  SAMPLE_PROJECTS,
  SAMPLE_SOURCES,
  SAMPLE_NOTIFICATIONS,
} from './sampleData';

interface WorkspaceState {
  // Data
  documents: DocumentItem[];
  sheets: SpreadsheetItem[];
  slides: PresentationItem[];
  pdfs: PdfItem[];
  projects: ProjectItem[];
  sources: ResearchSource[];
  notifications: NotificationItem[];
  aiMessages: AiChatMessage[];
  itemConversations: Record<string, AiChatMessage[]>;
  itemSources: Record<string, ResearchSource[]>;

  // Unified Multi-Conversation Workspace State
  documentConversations: Record<string, WorkspaceConversation[]>;
  generalConversations: WorkspaceConversation[];
  lastSelectedChatId: Record<string, string>;
  documentSources: Record<string, ResearchSource[]>;
  aiPanelState: Record<string, AiPanelState>;

  // Specialized Models, Cloudflare & Embedding Architecture
  embeddingConfig: EmbeddingConfig;
  specializedModels: SpecializedTaskModels;
  cloudflareConfig: {
    accountId: string;
    apiToken: string;
    selectedModel: string;
  };
  ollamaInstalledModels: {
    name: string;
    size: string;
    hasVision: boolean;
    hasTools: boolean;
  }[];

  // UI state
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark' | 'system';
  activeTheme: 'light' | 'dark';
  commandPaletteOpen: boolean;
  outlinePanelOpen: boolean;
  aiPanelOpen: boolean;
  zoomLevel: number;
  activeModel: string;
  activePageSize: 'A4' | 'Letter' | 'Legal';
  activeOrientation: 'portrait' | 'landscape';
  activeMargins: 'normal' | 'narrow' | 'wide';

  // AI BYOK Providers & Usage Tracking
  providers: Record<ProviderId, ProviderConfig>;
  defaultProvider: ProviderId;
  tokensUsedTotal: number;

  // User & Settings
  userProfile: {
    name: string;
    email: string;
    avatar: string;
    title: string;
    bio: string;
  };
  apiKeys: {
    openai: string;
    anthropic: string;
    gemini: string;
    groq: string;
    ollamaUrl: string;
  };
  appearanceSettings: {
    fontFamily: 'geist' | 'inter' | 'system';
    compactMode: boolean;
    autoSaveInterval: number; // in seconds
  };

  // Composer Draft State (Preserved across navigation & page reloads)
  composerDraft: ComposerDraft;

  // Actions - AI Providers & Integrations
  updateProviderConfig: (id: ProviderId, updates: Partial<ProviderConfig>) => void;
  setDefaultProvider: (id: ProviderId) => void;
  addProviderToConfigured: (id: ProviderId) => void;
  removeProviderFromConfigured: (id: ProviderId) => void;
  disconnectProvider: (id: ProviderId) => void;
  addCustomModel: (id: ProviderId, model: ModelOption) => void;
  setDiscoveredModels: (id: ProviderId, models: ModelOption[]) => void;
  addTokensUsed: (tokens: number) => void;
  testProviderConnection: (id: ProviderId) => Promise<{ success: boolean; message?: string; error?: string }>;

  // Actions - Composer Draft
  updateComposerDraft: (updates: Partial<ComposerDraft>) => void;
  resetComposerDraft: () => void;

  // Actions - UI
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setOutlinePanelOpen: (open: boolean) => void;
  setAiPanelOpen: (open: boolean) => void;
  setZoomLevel: (zoom: number) => void;
  setActivePageSize: (size: 'A4' | 'Letter' | 'Legal') => void;
  setActiveOrientation: (orient: 'portrait' | 'landscape') => void;
  setActiveMargins: (margins: 'normal' | 'narrow' | 'wide') => void;
  setActiveModel: (model: string) => void;

  // Actions - Documents
  createDocument: (type: 'doc' | 'sheet' | 'slide' | 'pdf' | 'project', title?: string, templateContent?: string) => string;
  updateDocument: (id: string, updates: Partial<DocumentItem>) => void;
  deleteDocument: (id: string, permanent?: boolean) => void;
  restoreDocument: (id: string) => void;
  toggleStar: (id: string) => void;

  // Actions - Sheets
  updateSheetCell: (sheetDocId: string, sheetId: string, cellCoord: string, cellData: Partial<CellData>) => void;
  addSheetTab: (sheetDocId: string, name: string) => void;

  // Actions - Slides
  updateSlideElement: (slideDocId: string, slideIndex: number, elementId: string, updates: Partial<SlideElement>) => void;
  addSlidePage: (slideDocId: string) => void;

  // Actions - PDFs
  addPdfAnnotation: (pdfDocId: string, annotation: Omit<PdfAnnotation, 'id' | 'createdAt'>) => void;
  removePdfAnnotation: (pdfDocId: string, annotationId: string) => void;

  // Actions - Sources
  addSource: (source: Omit<ResearchSource, 'id' | 'addedAt'>) => void;
  deleteSource: (id: string) => void;

  // Actions - AI Chat
  addAiMessage: (message: Omit<AiChatMessage, 'id' | 'timestamp'>) => void;
  clearAiMessages: () => void;

  // Actions - Per-Item Independent Project & AI Conversation
  getItemMessages: (itemId: string) => AiChatMessage[];
  addItemMessage: (itemId: string, message: Omit<AiChatMessage, 'id' | 'timestamp'>) => void;
  clearItemMessages: (itemId: string) => void;
  getItemSources: (itemId: string) => ResearchSource[];
  addItemSource: (itemId: string, source: Omit<ResearchSource, 'id' | 'addedAt'>) => void;
  removeItemSource: (itemId: string, sourceId: string) => void;

  // Actions - Unified Conversations & Document Intelligence
  ensureDocumentConversation: (documentId: string) => void;
  getConversationsForDocument: (documentId: string) => WorkspaceConversation[];
  getActiveConversation: (documentId: string) => WorkspaceConversation;
  setActiveConversation: (documentId: string, conversationId: string) => void;
  createNewDocumentConversation: (documentId: string, initialTitle?: string) => WorkspaceConversation;
  createNewGeneralConversation: (initialTitle?: string) => WorkspaceConversation;
  addMessageToConversation: (
    documentId: string,
    conversationId: string,
    message: Omit<AiChatMessage, 'id' | 'timestamp'> & { id?: string; timestamp?: string }
  ) => void;
  updateMessageInConversation: (
    documentId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<AiChatMessage>
  ) => void;
  setConversationRunStatus: (
    documentId: string,
    conversationId: string,
    runStatus: 'idle' | 'preparing' | 'executing_tool' | 'generating' | 'completed' | 'cancelled' | 'failed'
  ) => void;
  clearConversationMessages: (documentId: string, conversationId: string) => void;
  setConversationModel: (
    documentId: string,
    conversationId: string,
    providerId: ProviderId,
    modelId: string
  ) => void;

  // Actions - Document Sources Management
  getDocumentSources: (documentId: string) => ResearchSource[];
  addDocumentSource: (documentId: string, source: Omit<ResearchSource, 'id' | 'addedAt'>) => void;
  updateDocumentSource: (documentId: string, sourceId: string, updates: Partial<ResearchSource>) => void;
  removeDocumentSource: (documentId: string, sourceId: string) => void;
  toggleSourceInContext: (documentId: string, sourceId: string, inContext: boolean) => void;

  // Actions - AI Panel Mode & State
  updateAiPanelState: (workspaceId: string, updates: Partial<AiPanelState>) => void;
  getAiPanelState: (workspaceId: string) => AiPanelState;

  // Actions - Specialized AI & Embeddings
  updateEmbeddingConfig: (updates: Partial<EmbeddingConfig>) => void;
  updateSpecializedModels: (updates: Partial<SpecializedTaskModels>) => void;
  updateCloudflareConfig: (updates: { accountId?: string; apiToken?: string; selectedModel?: string }) => void;
  setOllamaInstalledModels: (models: { name: string; size: string; hasVision: boolean; hasTools: boolean }[]) => void;
  getItemById: (id: string) => AnyWorkspaceItem | undefined;
  createFromPrompt: (
    prompt: string,
    format?: OutputFormat,
    attachments?: { name: string; size: string; type: string }[],
    urls?: string[]
  ) => string;

  // Actions - Notifications
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Actions - Settings
  updateUserProfile: (profile: Partial<WorkspaceState['userProfile']>) => void;
  updateApiKeys: (keys: Partial<WorkspaceState['apiKeys']>) => void;
  updateAppearanceSettings: (settings: Partial<WorkspaceState['appearanceSettings']>) => void;
  resetToSampleData: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      // Initial Data
      documents: SAMPLE_DOCUMENTS,
      sheets: SAMPLE_SHEETS,
      slides: SAMPLE_SLIDES,
      pdfs: SAMPLE_PDFS,
      projects: SAMPLE_PROJECTS,
      sources: SAMPLE_SOURCES,
      notifications: SAMPLE_NOTIFICATIONS,
      aiMessages: [
        {
          id: 'msg-init-1',
          role: 'assistant',
          content: 'Hello! I am your Docium intelligence partner. I can help synthesize research, formulate financial tables, draft architectural documents, or adjust your tone and phrasing. How can I assist you today?',
          timestamp: 'Just now',
        },
      ],
      itemConversations: {
        'doc-1': [
          {
            id: 'doc1-msg-1',
            role: 'user',
            content: 'Generate an executive architectural specification for Docium 2026, including performance benchmarks and unified data pillars.',
            timestamp: '3 days ago',
          },
          {
            id: 'doc1-msg-2',
            role: 'assistant',
            content: "I've drafted the complete specification with executive summary, three core architectural pillars, and comparative benchmarks against legacy productivity suites.",
            timestamp: '3 days ago',
            suggestedAction: {
              label: 'Append High-Availability Topology',
              type: 'insert_doc',
              payload: '### 4. High-Availability & Disaster Recovery\nData replication across geographically isolated zones with sub-50ms failover guarantees.',
            },
          },
        ],
        'sheet-1': [
          {
            id: 'sheet1-msg-1',
            role: 'user',
            content: 'Create a SaaS financial projection model for Q1-Q4 with MRR, ARR, churn rate, and gross margin calculations.',
            timestamp: '1 day ago',
          },
          {
            id: 'sheet1-msg-2',
            role: 'assistant',
            content: "I've generated the tabular model with SUM and growth projections across all four quarters.",
            timestamp: '1 day ago',
            suggestedAction: {
              label: 'Calculate Net Burn Rate',
              type: 'create_table',
              payload: 'burn_rate',
            },
          },
        ],
        'slide-1': [
          {
            id: 'slide1-msg-1',
            role: 'user',
            content: 'Draft an investor pitch deck outlining Docium market opportunity, product vision, and traction.',
            timestamp: '2 days ago',
          },
          {
            id: 'slide1-msg-2',
            role: 'assistant',
            content: "I've created the introductory slide deck structure covering problem space, technical differentiation, and team velocity.",
            timestamp: '2 days ago',
            suggestedAction: {
              label: 'Add Traction & Milestones Slide',
              type: 'create_chart',
              payload: 'traction',
            },
          },
        ],
      },
      itemSources: {
        'doc-1': [
          {
            id: 'src-doc1-1',
            title: 'Linear Method Philosophy.pdf',
            type: 'pdf',
            snippet: 'Productivity principles focused on high momentum, streamlined workflows, and craft.',
            addedAt: '2026-10-28T10:00:00Z',
            status: 'indexed',
            tags: ['Architecture', 'Design'],
            isIncludedInContext: true,
            scope: 'document',
            fileSize: '420 KB',
          },
        ],
      },

      // Unified Multi-Conversation Workspace Initial Data
      documentConversations: {
        'doc-1': [
          {
            id: 'conv-doc1-1',
            title: 'Executive Architecture Specification',
            category: 'document',
            documentId: 'doc-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
            messages: [
              {
                id: 'doc1-msg-1',
                role: 'user',
                content: 'Generate an executive architectural specification for Docium 2026, including performance benchmarks and unified data pillars.',
                timestamp: '3 days ago',
              },
              {
                id: 'doc1-msg-2',
                role: 'assistant',
                content: "I've drafted the complete specification with executive summary, three core architectural pillars, and comparative benchmarks against legacy productivity suites.",
                timestamp: '3 days ago',
                suggestedAction: {
                  label: 'Append High-Availability Topology',
                  type: 'insert_doc',
                  payload: '### 4. High-Availability & Disaster Recovery\nData replication across geographically isolated zones with sub-50ms failover guarantees.',
                },
              },
            ],
            sources: [],
            selectedTools: {
              internetSearch: false,
              imageSearch: false,
              imageGeneration: false,
              diagramsAndGraphs: true,
              documentOperations: true,
            },
          },
        ],
        'sheet-1': [
          {
            id: 'conv-sheet1-1',
            title: 'SaaS Financial Forecast',
            category: 'document',
            documentId: 'sheet-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            messages: [
              {
                id: 'sheet1-msg-1',
                role: 'user',
                content: 'Create a SaaS financial projection model for Q1-Q4 with MRR, ARR, churn rate, and gross margin calculations.',
                timestamp: '1 day ago',
              },
              {
                id: 'sheet1-msg-2',
                role: 'assistant',
                content: "I've generated the tabular model with SUM and growth projections across all four quarters.",
                timestamp: '1 day ago',
                suggestedAction: {
                  label: 'Calculate Net Burn Rate',
                  type: 'create_table',
                  payload: 'burn_rate',
                },
              },
            ],
            sources: [],
            selectedTools: {
              internetSearch: false,
              imageSearch: false,
              imageGeneration: false,
              diagramsAndGraphs: true,
              documentOperations: true,
            },
          },
        ],
        'slide-1': [
          {
            id: 'conv-slide1-1',
            title: 'Pitch Deck Structure',
            category: 'document',
            documentId: 'slide-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
            messages: [
              {
                id: 'slide1-msg-1',
                role: 'user',
                content: 'Draft an investor pitch deck outlining Docium market opportunity, product vision, and traction.',
                timestamp: '2 days ago',
              },
              {
                id: 'slide1-msg-2',
                role: 'assistant',
                content: "I've created the introductory slide deck structure covering problem space, technical differentiation, and team velocity.",
                timestamp: '2 days ago',
                suggestedAction: {
                  label: 'Add Traction & Milestones Slide',
                  type: 'create_chart',
                  payload: 'traction',
                },
              },
            ],
            sources: [],
            selectedTools: {
              internetSearch: false,
              imageSearch: false,
              imageGeneration: false,
              diagramsAndGraphs: true,
              documentOperations: true,
            },
          },
        ],
        'pdf-1': [
          {
            id: 'conv-pdf1-1',
            title: 'Security Compliance Audit',
            category: 'document',
            documentId: 'pdf-1',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
            updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
            messages: [
              {
                id: 'pdf1-msg-1',
                role: 'user',
                content: 'Summarize key observations and cryptographic standards in section 3.',
                timestamp: '12 hours ago',
              },
              {
                id: 'pdf1-msg-2',
                role: 'assistant',
                content: 'Section 3 outlines AES-256 encryption at rest, TLS 1.3 in transit, and quarterly penetration audits with zero high-severity findings.',
                timestamp: '12 hours ago',
              },
            ],
            sources: [],
            selectedTools: {
              internetSearch: false,
              imageSearch: false,
              imageGeneration: false,
              diagramsAndGraphs: true,
              documentOperations: true,
            },
          },
        ],
      },

      generalConversations: [
        {
          id: 'conv-gen-1',
          title: 'General Assistant',
          category: 'general',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: 'msg-init-1',
              role: 'assistant',
              content: 'Hello! I am your Docium intelligence partner. I can help synthesize research, formulate financial tables, draft architectural documents, or adjust your tone and phrasing. How can I assist you today?',
              timestamp: 'Just now',
            },
          ],
          sources: [],
          selectedTools: {
            internetSearch: false,
            imageSearch: false,
            imageGeneration: false,
            diagramsAndGraphs: true,
            documentOperations: false,
          },
        },
      ],

      lastSelectedChatId: {
        'doc-1': 'conv-doc1-1',
        'sheet-1': 'conv-sheet1-1',
        'slide-1': 'conv-slide1-1',
        'pdf-1': 'conv-pdf1-1',
      },

      documentSources: {
        'doc-1': [
          {
            id: 'src-doc1-1',
            title: 'Linear Method Philosophy.pdf',
            type: 'pdf',
            snippet: 'Productivity principles focused on high momentum, streamlined workflows, and craft.',
            addedAt: '2026-10-28T10:00:00Z',
            status: 'indexed',
            tags: ['Architecture', 'Design'],
            isIncludedInContext: true,
            scope: 'document',
            fileSize: '420 KB',
          },
        ],
      },

      aiPanelState: {
        default: { mode: 'docked', preferredWidth: 380, isOpen: true },
      },

      embeddingConfig: {
        provider: 'local',
        model: 'multilingual-e5-small-quantized',
        dimensions: 384,
        localOnlyPrivacy: false,
        fallbackToLocal: true,
      },

      specializedModels: {
        mainAi: { providerId: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' },
        vision: { providerId: 'ollama', modelId: 'qwen3-vl:2b' },
        embeddings: { providerId: 'local', modelId: 'multilingual-e5-small-quantized' },
      },

      cloudflareConfig: {
        accountId: '',
        apiToken: '',
        selectedModel: '@cf/qwen/qwen3.8-27b',
      },

      ollamaInstalledModels: [
        { name: 'llama3.2:latest', size: '2.0 GB', hasVision: true, hasTools: true },
        { name: 'qwen3-vl:2b', size: '1.8 GB', hasVision: true, hasTools: true },
        { name: 'nomic-embed-text:latest', size: '274 MB', hasVision: false, hasTools: false },
      ],

      // UI
      sidebarCollapsed: false,
      theme: 'light',
      activeTheme: 'light',
      commandPaletteOpen: false,
      outlinePanelOpen: true,
      aiPanelOpen: false,
      zoomLevel: 100,
      activeModel: 'claude-3-5-sonnet-20241022',
      activePageSize: 'A4',
      activeOrientation: 'portrait',
      activeMargins: 'normal',

      // AI BYOK Providers & Usage Tracking
      providers: INITIAL_PROVIDER_CONFIGS,
      defaultProvider: 'anthropic',
      tokensUsedTotal: 142500,

      // User & Settings (Local Workspace)
      userProfile: {
        name: 'Sarah Chen',
        email: 'sarah.chen@docium.workspace',
        avatar: '',
        title: 'Principal Product Architect',
        bio: 'Designing high-velocity collaborative knowledge systems and intelligent workspace runtimes.',
      },
      apiKeys: {
        openai: '',
        anthropic: '',
        gemini: '',
        groq: '',
        ollamaUrl: 'http://localhost:11434',
      },
      appearanceSettings: {
        fontFamily: 'geist',
        compactMode: false,
        autoSaveInterval: 2,
      },

      // Initial Composer Draft
      composerDraft: {
        prompt: '',
        format: 'auto',
        attachments: [],
        urls: [],
        enabledTools: {
          internetSearch: false,
          imageSearch: false,
          imageGeneration: false,
          diagramsAndGraphs: true, // Local Mermaid and Chart rendering engine
        },
      },

      // Actions - AI Providers
      updateProviderConfig: (id, updates) => {
        set((state) => {
          const updated = {
            ...state.providers,
            [id]: { ...state.providers[id], ...updates },
          };
          return {
            providers: updated,
            activeModel:
              id === state.defaultProvider && updates.selectedModel
                ? updates.selectedModel
                : state.activeModel,
            apiKeys: {
              ...state.apiKeys,
              openai: updated.openai?.apiKey || state.apiKeys.openai,
              anthropic: updated.anthropic?.apiKey || state.apiKeys.anthropic,
              gemini: updated.gemini?.apiKey || state.apiKeys.gemini,
              groq: updated.groq?.apiKey || state.apiKeys.groq,
              ollamaUrl: updated.ollama?.baseUrl || state.apiKeys.ollamaUrl,
            },
          };
        });
      },

      addProviderToConfigured: (id) => {
        set((state) => ({
          providers: {
            ...state.providers,
            [id]: {
              ...state.providers[id],
              isAdded: true,
              enabled: true,
            },
          },
        }));
      },

      removeProviderFromConfigured: (id) => {
        set((state) => ({
          providers: {
            ...state.providers,
            [id]: {
              ...state.providers[id],
              isAdded: false,
              enabled: false,
              status: 'unconfigured',
            },
          },
        }));
      },

      disconnectProvider: (id) => {
        set((state) => {
          const current = state.providers[id];
          if (!current) return state;
          const updated = {
            ...state.providers,
            [id]: {
              ...current,
              apiKey: '',
              accountId: '',
              status: 'unconfigured' as const,
              errorMessage: undefined,
              lastTested: undefined,
              isAdded: false,
            },
          };
          return {
            providers: updated,
            ...(id === 'cloudflare'
              ? {
                  cloudflareConfig: {
                    ...state.cloudflareConfig,
                    accountId: '',
                    apiToken: '',
                  },
                }
              : {}),
          };
        });
      },

      addCustomModel: (id, model) => {
        set((state) => {
          const current = state.providers[id];
          if (!current) return state;
          const existing = current.customModels || [];
          if (existing.some((m) => m.id === model.id)) return state;
          return {
            providers: {
              ...state.providers,
              [id]: {
                ...current,
                customModels: [...existing, { ...model, isCustom: true }],
                selectedModel: model.id,
              },
            },
          };
        });
      },

      setDiscoveredModels: (id, models) => {
        set((state) => {
          const current = state.providers[id];
          if (!current) return state;
          return {
            providers: {
              ...state.providers,
              [id]: {
                ...current,
                discoveredModels: models,
              },
            },
          };
        });
      },

      updateComposerDraft: (updates) => {
        set((state) => ({
          composerDraft: {
            ...state.composerDraft,
            ...updates,
            enabledTools: updates.enabledTools
              ? { ...state.composerDraft.enabledTools, ...updates.enabledTools }
              : state.composerDraft.enabledTools,
          },
        }));
      },

      resetComposerDraft: () => {
        set({
          composerDraft: {
            prompt: '',
            format: 'auto',
            attachments: [],
            urls: [],
            enabledTools: {
              internetSearch: false,
              imageSearch: false,
              imageGeneration: false,
              diagramsAndGraphs: true,
            },
          },
        });
      },

      setDefaultProvider: (id) => {
        set((state) => ({
          defaultProvider: id,
          activeModel: state.providers[id]?.selectedModel || state.activeModel,
        }));
      },

      addTokensUsed: (tokens) => {
        set((state) => ({ tokensUsedTotal: state.tokensUsedTotal + tokens }));
      },

      testProviderConnection: async (id) => {
        const config = get().providers[id];
        if (!config) return { success: false, error: 'Provider not found' };

        get().updateProviderConfig(id, { status: 'testing' });

        try {
          const res = await fetch('/api/ai/test-connection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              providerId: id,
              apiKey: config.apiKey,
              baseUrl: config.baseUrl,
              model: config.selectedModel,
              accountId: config.accountId || (id === 'cloudflare' ? get().cloudflareConfig?.accountId : undefined),
              apiToken: config.apiKey || (id === 'cloudflare' ? get().cloudflareConfig?.apiToken : undefined),
            }),
          });
          const data = await res.json();
          if (data.success) {
            if (id === 'ollama' && Array.isArray(data.models) && data.models.length > 0) {
              const mapped = data.models.map((name: string) => ({
                name,
                size: name.includes('vl') ? '2.1 GB' : '3.8 GB',
                hasVision: name.includes('vl') || name.includes('vision') || name.includes('llava'),
                hasTools: true,
              }));
              get().setOllamaInstalledModels(mapped);
            }
            get().updateProviderConfig(id, {
              status: 'connected',
              lastTested: new Date().toISOString(),
              errorMessage: undefined,
            });
            return { success: true, message: data.message };
          } else {
            get().updateProviderConfig(id, {
              status: 'error',
              lastTested: new Date().toISOString(),
              errorMessage: data.error,
            });
            return { success: false, error: data.error };
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Connection test failed';
          get().updateProviderConfig(id, {
            status: 'error',
            lastTested: new Date().toISOString(),
            errorMessage: errMsg,
          });
          return { success: false, error: errMsg };
        }
      },

      // UI Actions
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setTheme: (theme) => {
        const root = document.documentElement;
        let isDark = false;
        if (theme === 'system') {
          isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else {
          isDark = theme === 'dark';
        }
        if (isDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
        set({ theme, activeTheme: isDark ? 'dark' : 'light' });
      },
      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
      setOutlinePanelOpen: (open) => set({ outlinePanelOpen: open }),
      setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
      setZoomLevel: (zoomLevel) => set({ zoomLevel }),
      setActivePageSize: (activePageSize) => set({ activePageSize }),
      setActiveOrientation: (activeOrientation) => set({ activeOrientation }),
      setActiveMargins: (activeMargins) => set({ activeMargins }),
      setActiveModel: (activeModel) => set({ activeModel }),

      // Document Actions
      createDocument: (type, title, templateContent) => {
        const id = `${type}-${Date.now()}`;
        const now = new Date().toISOString();
        const base = {
          id,
          title: (typeof title === 'string' && title.trim()) ? title.trim() : `Untitled ${type.toUpperCase()}`,
          createdAt: now,
          updatedAt: now,
          starred: false,
          trashed: false,
          owner: get().userProfile,
          tags: ['Draft'],
          size: '12 KB',
        };

        if (type === 'doc') {
          const newDoc: DocumentItem = {
            ...base,
            type: 'doc',
            content: templateContent || `<h1>${title || 'Untitled Document'}</h1><p>Start writing your thoughts or ask AI to generate an outline...</p>`,
            wordCount: 12,
            readingTime: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            margins: 'normal',
          };
          set((state) => ({ documents: [newDoc, ...state.documents] }));
        } else if (type === 'sheet') {
          const newSheet: SpreadsheetItem = {
            ...base,
            type: 'sheet',
            activeSheetId: 's1',
            sheets: [
              {
                id: 's1',
                name: 'Sheet 1',
                rowCount: 20,
                colCount: 8,
                cells: {
                  A1: { value: 'Item', bold: true },
                  B1: { value: 'Amount', bold: true },
                  A2: { value: 'Sample' },
                  B2: { value: '100', format: 'number' },
                },
              },
            ],
          };
          set((state) => ({ sheets: [newSheet, ...state.sheets] }));
        } else if (type === 'slide') {
          const newSlide: PresentationItem = {
            ...base,
            type: 'slide',
            slides: [
              {
                id: `sp-${Date.now()}`,
                title: 'Welcome Slide',
                elements: [
                  { id: 'el-1', type: 'title', content: title || 'New Presentation', x: 10, y: 30, width: 80, height: 20, fontSize: 36, color: '#245C45' },
                  { id: 'el-2', type: 'text', content: 'Subtitle or presenter name', x: 10, y: 55, width: 80, height: 10, fontSize: 18, color: '#929B91' },
                ],
              },
            ],
          };
          set((state) => ({ slides: [newSlide, ...state.slides] }));
        } else if (type === 'pdf') {
          const newPdf: PdfItem = {
            ...base,
            type: 'pdf',
            pageCount: 1,
            fileUrl: '/sample-security.pdf',
            annotations: [],
          };
          set((state) => ({ pdfs: [newPdf, ...state.pdfs] }));
        } else if (type === 'project') {
          const newProject: ProjectItem = {
            ...base,
            type: 'project',
            progress: 0,
            tasks: [],
            documentIds: [],
          };
          set((state) => ({ projects: [newProject, ...state.projects] }));
        }

        return id;
      },

      updateDocument: (id, updates) => {
        set((state) => ({
          documents: state.documents.map((doc) =>
            doc.id === id ? { ...doc, ...updates, updatedAt: new Date().toISOString() } : doc
          ),
        }));
      },

      deleteDocument: (id, permanent = false) => {
        set((state) => {
          if (permanent) {
            return {
              documents: state.documents.filter((d) => d.id !== id),
              sheets: state.sheets.filter((s) => s.id !== id),
              slides: state.slides.filter((sl) => sl.id !== id),
              pdfs: state.pdfs.filter((p) => p.id !== id),
              projects: state.projects.filter((pr) => pr.id !== id),
            };
          }
          return {
            documents: state.documents.map((d) => (d.id === id ? { ...d, trashed: true } : d)),
            sheets: state.sheets.map((s) => (s.id === id ? { ...s, trashed: true } : s)),
            slides: state.slides.map((sl) => (sl.id === id ? { ...sl, trashed: true } : sl)),
            pdfs: state.pdfs.map((p) => (p.id === id ? { ...p, trashed: true } : p)),
            projects: state.projects.map((pr) => (pr.id === id ? { ...pr, trashed: true } : pr)),
          };
        });
      },

      restoreDocument: (id) => {
        set((state) => ({
          documents: state.documents.map((d) => (d.id === id ? { ...d, trashed: false } : d)),
          sheets: state.sheets.map((s) => (s.id === id ? { ...s, trashed: false } : s)),
          slides: state.slides.map((sl) => (sl.id === id ? { ...sl, trashed: false } : sl)),
          pdfs: state.pdfs.map((p) => (p.id === id ? { ...p, trashed: false } : p)),
          projects: state.projects.map((pr) => (pr.id === id ? { ...pr, trashed: false } : pr)),
        }));
      },

      toggleStar: (id) => {
        set((state) => ({
          documents: state.documents.map((d) => (d.id === id ? { ...d, starred: !d.starred } : d)),
          sheets: state.sheets.map((s) => (s.id === id ? { ...s, starred: !s.starred } : s)),
          slides: state.slides.map((sl) => (sl.id === id ? { ...sl, starred: !sl.starred } : sl)),
          pdfs: state.pdfs.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)),
          projects: state.projects.map((pr) => (pr.id === id ? { ...pr, starred: !pr.starred } : pr)),
        }));
      },

      updateSheetCell: (sheetDocId, sheetId, cellCoord, cellData) => {
        set((state) => ({
          sheets: state.sheets.map((doc) => {
            if (doc.id !== sheetDocId) return doc;
            return {
              ...doc,
              updatedAt: new Date().toISOString(),
              sheets: doc.sheets.map((sheet) => {
                if (sheet.id !== sheetId) return sheet;
                const existing = sheet.cells[cellCoord] || { value: '' };
                return {
                  ...sheet,
                  cells: {
                    ...sheet.cells,
                    [cellCoord]: { ...existing, ...cellData },
                  },
                };
              }),
            };
          }),
        }));
      },

      addSheetTab: (sheetDocId, name) => {
        set((state) => ({
          sheets: state.sheets.map((doc) => {
            if (doc.id !== sheetDocId) return doc;
            const newTabId = `tab-${Date.now()}`;
            return {
              ...doc,
              sheets: [
                ...doc.sheets,
                { id: newTabId, name, rowCount: 20, colCount: 8, cells: {} },
              ],
              activeSheetId: newTabId,
            };
          }),
        }));
      },

      updateSlideElement: (slideDocId, slideIndex, elementId, updates) => {
        set((state) => ({
          slides: state.slides.map((doc) => {
            if (doc.id !== slideDocId) return doc;
            const targetSlide = doc.slides[slideIndex];
            if (!targetSlide) return doc;
            const newSlides = [...doc.slides];
            newSlides[slideIndex] = {
              ...targetSlide,
              elements: targetSlide.elements.map((el) => (el.id === elementId ? { ...el, ...updates } : el)),
            };
            return { ...doc, slides: newSlides, updatedAt: new Date().toISOString() };
          }),
        }));
      },

      addSlidePage: (slideDocId) => {
        set((state) => ({
          slides: state.slides.map((doc) => {
            if (doc.id !== slideDocId) return doc;
            const newPage = {
              id: `slide-${Date.now()}`,
              title: `Slide ${doc.slides.length + 1}`,
              elements: [
                {
                  id: `el-${Date.now()}`,
                  type: 'title' as const,
                  content: `Slide ${doc.slides.length + 1} Title`,
                  x: 10,
                  y: 15,
                  width: 80,
                  height: 15,
                  fontSize: 32,
                  color: '#245C45',
                },
                {
                  id: `el-body-${Date.now()}`,
                  type: 'text' as const,
                  content: 'Click here to edit slide content or insert bullet points.',
                  x: 10,
                  y: 35,
                  width: 80,
                  height: 40,
                  fontSize: 18,
                  color: '#171C19',
                },
              ],
            };
            return { ...doc, slides: [...doc.slides, newPage], updatedAt: new Date().toISOString() };
          }),
        }));
      },

      addPdfAnnotation: (pdfDocId, annotation) => {
        const newAnnotation: PdfAnnotation = {
          ...annotation,
          id: `ann-${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          pdfs: state.pdfs.map((pdf) =>
            pdf.id === pdfDocId
              ? { ...pdf, annotations: [...pdf.annotations, newAnnotation], updatedAt: new Date().toISOString() }
              : pdf
          ),
        }));
      },

      removePdfAnnotation: (pdfDocId, annotationId) => {
        set((state) => ({
          pdfs: state.pdfs.map((pdf) =>
            pdf.id === pdfDocId
              ? {
                  ...pdf,
                  annotations: pdf.annotations.filter((a) => a.id !== annotationId),
                  updatedAt: new Date().toISOString(),
                }
              : pdf
          ),
        }));
      },

      addSource: (source) => {
        const newSource: ResearchSource = {
          ...source,
          id: `src-${Date.now()}`,
          addedAt: new Date().toISOString(),
        };
        set((state) => ({ sources: [newSource, ...state.sources] }));
      },

      deleteSource: (id) => {
        set((state) => ({ sources: state.sources.filter((s) => s.id !== id) }));
      },

      addAiMessage: (message) => {
        const newMsg: AiChatMessage = {
          ...message,
          id: `msg-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        set((state) => ({ aiMessages: [...state.aiMessages, newMsg] }));
      },

      clearAiMessages: () => {
        set({
          aiMessages: [
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: 'Chat history cleared. How can I assist with your workspace today?',
              timestamp: 'Just now',
            },
          ],
        });
      },

      // Per-Item Independent Project & AI Conversation
      getItemMessages: (itemId) => {
        return get().itemConversations?.[itemId] || [];
      },

      addItemMessage: (itemId, message) => {
        const newMsg: AiChatMessage = {
          ...message,
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: 'Just now',
        };
        set((state) => ({
          itemConversations: {
            ...state.itemConversations,
            [itemId]: [...(state.itemConversations?.[itemId] || []), newMsg],
          },
        }));
      },

      clearItemMessages: (itemId) => {
        set((state) => ({
          itemConversations: {
            ...state.itemConversations,
            [itemId]: [],
          },
        }));
      },

      getItemSources: (itemId) => {
        return get().itemSources?.[itemId] || [];
      },

      addItemSource: (itemId, source) => {
        const newSource: ResearchSource = {
          ...source,
          id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          addedAt: new Date().toISOString(),
        };
        set((state) => ({
          itemSources: {
            ...state.itemSources,
            [itemId]: [...(state.itemSources?.[itemId] || []), newSource],
          },
        }));
      },

      removeItemSource: (itemId, sourceId) => {
        set((state) => ({
          itemSources: {
            ...state.itemSources,
            [itemId]: (state.itemSources?.[itemId] || []).filter((s) => s.id !== sourceId),
          },
          documentSources: {
            ...state.documentSources,
            [itemId]: (state.documentSources?.[itemId] || []).filter((s) => s.id !== sourceId),
          },
        }));
      },

      // Actions - Unified Conversations & Document Intelligence
      ensureDocumentConversation: (documentId: string) => {
        if (!documentId) return;
        const state = get();
        const existing = state.documentConversations?.[documentId];
        if (existing && existing.length > 0) {
          return; // Idempotent: already initialized, do not overwrite or duplicate
        }

        const providerId = state.defaultProvider;
        const visionModels = getChatVisionModels(providerId, state.providers[providerId]);
        const configuredModel = state.providers[providerId]?.selectedModel;
        const modelId = (configuredModel && visionModels.some((m) => m.id === configuredModel))
          ? configuredModel
          : (visionModels[0]?.id || configuredModel || state.activeModel);

        const initialConv: WorkspaceConversation = {
          id: `conv-${documentId}-1`,
          title: 'Workspace Conversation',
          category: 'document',
          documentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          selectedProvider: providerId,
          selectedModel: modelId,
          modelConfig: { providerId, modelId },
          messages: state.itemConversations?.[documentId]?.length
            ? state.itemConversations[documentId]
            : [],
          sources: [],
          selectedTools: {
            internetSearch: Boolean(
              state.providers?.brave?.apiKey ||
              state.providers?.tavily?.apiKey ||
              state.providers?.serper?.apiKey ||
              state.providers?.searxng?.baseUrl
            ),
            imageSearch: false,
            imageGeneration: false,
            diagramsAndGraphs: true,
            documentOperations: true,
          },
        };

        set((s) => ({
          documentConversations: {
            ...s.documentConversations,
            [documentId]: [initialConv],
          },
          lastSelectedChatId: {
            ...s.lastSelectedChatId,
            [documentId]: initialConv.id,
          },
        }));
      },

      getConversationsForDocument: (documentId: string) => {
        const state = get();
        return state.documentConversations?.[documentId] || [];
      },

      getActiveConversation: (documentId: string) => {
        const state = get();
        const convs = state.documentConversations?.[documentId] || [];
        const lastId = state.lastSelectedChatId?.[documentId];
        if (lastId) {
          const found = convs.find((c) => c.id === lastId);
          if (found) return found;
        }
        if (convs.length > 0) return convs[0];

        // Pure fallback object without mutating store state during render
        return {
          id: `conv-${documentId}-default`,
          title: 'Workspace Conversation',
          category: 'document',
          documentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: state.itemConversations?.[documentId] || [],
          sources: [],
          selectedTools: {
            internetSearch: Boolean(
              state.providers?.brave?.apiKey ||
              state.providers?.tavily?.apiKey ||
              state.providers?.serper?.apiKey ||
              state.providers?.searxng?.baseUrl
            ),
            imageSearch: false,
            imageGeneration: false,
            diagramsAndGraphs: true,
            documentOperations: true,
          },
        };
      },

      setActiveConversation: (documentId: string, conversationId: string) => {
        set((state) => ({
          lastSelectedChatId: {
            ...state.lastSelectedChatId,
            [documentId]: conversationId,
          },
        }));
      },

      createNewDocumentConversation: (documentId: string, initialTitle?: string) => {
        const state = get();
        const existing = state.documentConversations?.[documentId] || [];
        const docSources = state.getDocumentSources(documentId);
        const lastConv = state.getActiveConversation(documentId);

        const currentProviderId = state.defaultProvider;
        const visionModels = getChatVisionModels(currentProviderId, state.providers[currentProviderId]);
        const configuredModel = state.providers[currentProviderId]?.selectedModel;
        const currentModelId = (configuredModel && visionModels.some((m) => m.id === configuredModel))
          ? configuredModel
          : (visionModels[0]?.id || configuredModel || state.activeModel);

        const newId = `conv-${documentId}-${Date.now()}`;
        const newConv: WorkspaceConversation = {
          id: newId,
          title: initialTitle || `Chat ${existing.length + 1}`,
          category: 'document',
          documentId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
          sources: docSources,
          selectedProvider: currentProviderId,
          selectedModel: currentModelId,
          modelConfig: {
            providerId: currentProviderId,
            modelId: currentModelId,
          },
          selectedTools: lastConv ? { ...lastConv.selectedTools } : {
            internetSearch: Boolean(
              state.providers?.brave?.apiKey ||
              state.providers?.tavily?.apiKey ||
              state.providers?.serper?.apiKey ||
              state.providers?.searxng?.baseUrl
            ),
            imageSearch: false,
            imageGeneration: false,
            diagramsAndGraphs: true,
            documentOperations: true,
          },
        };

        set((s) => ({
          documentConversations: {
            ...s.documentConversations,
            [documentId]: [...(s.documentConversations?.[documentId] || []), newConv],
          },
          lastSelectedChatId: {
            ...s.lastSelectedChatId,
            [documentId]: newId,
          },
        }));

        return newConv;
      },

      createNewGeneralConversation: (initialTitle?: string) => {
        const state = get();
        const existing = state.generalConversations || [];
        const currentProviderId = state.defaultProvider;
        const visionModels = getChatVisionModels(currentProviderId, state.providers[currentProviderId]);
        const configuredModel = state.providers[currentProviderId]?.selectedModel;
        const currentModelId = (configuredModel && visionModels.some((m) => m.id === configuredModel))
          ? configuredModel
          : (visionModels[0]?.id || configuredModel || state.activeModel);
        const newId = `conv-gen-${Date.now()}`;
        const newConv: WorkspaceConversation = {
          id: newId,
          title: initialTitle || `General Chat ${existing.length + 1}`,
          category: 'general',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          selectedProvider: currentProviderId,
          selectedModel: currentModelId,
          modelConfig: {
            providerId: currentProviderId,
            modelId: currentModelId,
          },
          messages: [
            {
              id: `msg-${Date.now()}-gen`,
              role: 'assistant',
              content: `Hello! This is a general AI discussion. General chats do not have document context or document editing permissions.`,
              timestamp: 'Just now',
            },
          ],
          sources: [],
          selectedTools: {
            internetSearch: false,
            imageSearch: false,
            imageGeneration: false,
            diagramsAndGraphs: true,
            documentOperations: false,
          },
        };

        set((s) => ({
          generalConversations: [...s.generalConversations, newConv],
        }));

        return newConv;
      },

      addMessageToConversation: (documentId, conversationId, message) => {
        const newMsg: AiChatMessage = {
          ...message,
          id: message.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: message.timestamp || 'Just now',
        };

        set((state) => {
          if (documentId === 'general') {
            return {
              generalConversations: state.generalConversations.map((c) =>
                c.id === conversationId
                  ? { ...c, messages: [...c.messages, newMsg], updatedAt: new Date().toISOString() }
                  : c
              ),
              aiMessages: [...state.aiMessages, newMsg],
            };
          }

          const existingConvs = state.documentConversations?.[documentId] || [];
          const updatedConvs = existingConvs.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                messages: [...conv.messages, newMsg],
                updatedAt: new Date().toISOString(),
              };
            }
            return conv;
          });

          return {
            documentConversations: {
              ...state.documentConversations,
              [documentId]: updatedConvs,
            },
            itemConversations: {
              ...state.itemConversations,
              [documentId]: [...(state.itemConversations?.[documentId] || []), newMsg],
            },
          };
        });
      },

      updateMessageInConversation: (documentId, conversationId, messageId, updates) => {
        set((state) => {
          if (documentId === 'general') {
            return {
              generalConversations: state.generalConversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
                      updatedAt: new Date().toISOString(),
                    }
                  : c
              ),
            };
          }

          const existingConvs = state.documentConversations?.[documentId] || [];
          const updatedConvs = existingConvs.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                messages: conv.messages.map((m) => (m.id === messageId ? { ...m, ...updates } : m)),
                updatedAt: new Date().toISOString(),
              };
            }
            return conv;
          });

          return {
            documentConversations: {
              ...state.documentConversations,
              [documentId]: updatedConvs,
            },
          };
        });
      },

      setConversationRunStatus: (documentId, conversationId, runStatus) => {
        set((state) => {
          if (documentId === 'general') {
            return {
              generalConversations: state.generalConversations.map((c) =>
                c.id === conversationId ? { ...c, runStatus, updatedAt: new Date().toISOString() } : c
              ),
            };
          }

          const existingConvs = state.documentConversations?.[documentId] || [];
          const updatedConvs = existingConvs.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                runStatus,
                updatedAt: new Date().toISOString(),
              };
            }
            return conv;
          });

          return {
            documentConversations: {
              ...state.documentConversations,
              [documentId]: updatedConvs,
            },
          };
        });
      },

      clearConversationMessages: (documentId, conversationId) => {
        set((state) => {
          if (documentId === 'general') {
            return {
              generalConversations: state.generalConversations.map((c) =>
                c.id === conversationId ? { ...c, messages: [] } : c
              ),
            };
          }
          const existingConvs = state.documentConversations?.[documentId] || [];
          return {
            documentConversations: {
              ...state.documentConversations,
              [documentId]: existingConvs.map((c) =>
                c.id === conversationId ? { ...c, messages: [] } : c
              ),
            },
          };
        });
      },

      setConversationModel: (documentId, conversationId, providerId, modelId) => {
        set((state) => {
          if (documentId === 'general') {
            return {
              generalConversations: state.generalConversations.map((c) =>
                c.id === conversationId
                  ? {
                      ...c,
                      selectedProvider: providerId,
                      selectedModel: modelId,
                      modelConfig: { providerId, modelId },
                      updatedAt: new Date().toISOString(),
                    }
                  : c
              ),
            };
          }

          const existingConvs = state.documentConversations?.[documentId] || [];
          const updatedConvs = existingConvs.map((conv) => {
            if (conv.id === conversationId) {
              return {
                ...conv,
                selectedProvider: providerId,
                selectedModel: modelId,
                modelConfig: { providerId, modelId },
                updatedAt: new Date().toISOString(),
              };
            }
            return conv;
          });

          return {
            documentConversations: {
              ...state.documentConversations,
              [documentId]: updatedConvs,
            },
          };
        });
      },

      // Actions - Document Sources Management
      getDocumentSources: (documentId) => {
        const state = get();
        return state.documentSources?.[documentId] || state.itemSources?.[documentId] || [];
      },

      addDocumentSource: (documentId, source) => {
        const newSource: ResearchSource = {
          ...source,
          id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          addedAt: new Date().toISOString(),
          isIncludedInContext: source.isIncludedInContext !== false,
          scope: 'document',
        };

        set((state) => ({
          documentSources: {
            ...state.documentSources,
            [documentId]: [...(state.documentSources?.[documentId] || []), newSource],
          },
          itemSources: {
            ...state.itemSources,
            [documentId]: [...(state.itemSources?.[documentId] || []), newSource],
          },
        }));
      },

      updateDocumentSource: (documentId, sourceId, updates) => {
        set((state) => ({
          documentSources: {
            ...state.documentSources,
            [documentId]: (state.documentSources?.[documentId] || []).map((s) =>
              s.id === sourceId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
            ),
          },
          itemSources: {
            ...state.itemSources,
            [documentId]: (state.itemSources?.[documentId] || []).map((s) =>
              s.id === sourceId ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s
            ),
          },
        }));
      },

      removeDocumentSource: (documentId, sourceId) => {
        set((state) => ({
          documentSources: {
            ...state.documentSources,
            [documentId]: (state.documentSources?.[documentId] || []).filter((s) => s.id !== sourceId),
          },
          itemSources: {
            ...state.itemSources,
            [documentId]: (state.itemSources?.[documentId] || []).filter((s) => s.id !== sourceId),
          },
        }));
      },

      toggleSourceInContext: (documentId, sourceId, inContext) => {
        get().updateDocumentSource(documentId, sourceId, { isIncludedInContext: inContext });
      },

      // Actions - AI Panel State
      updateAiPanelState: (workspaceId, updates) => {
        set((state) => {
          const current = state.aiPanelState?.[workspaceId] || state.aiPanelState?.['default'] || {
            mode: 'docked',
            preferredWidth: 380,
            isOpen: true,
          };
          return {
            aiPanelState: {
              ...state.aiPanelState,
              [workspaceId]: { ...current, ...updates },
            },
          };
        });
      },

      getAiPanelState: (workspaceId) => {
        const state = get();
        return (
          state.aiPanelState?.[workspaceId] ||
          state.aiPanelState?.['default'] || {
            mode: 'docked',
            preferredWidth: 380,
            isOpen: true,
          }
        );
      },

      // Actions - Specialized AI & Embeddings
      updateEmbeddingConfig: (updates) => {
        set((state) => ({
          embeddingConfig: { ...state.embeddingConfig, ...updates },
        }));
      },

      updateSpecializedModels: (updates) => {
        set((state) => ({
          specializedModels: { ...state.specializedModels, ...updates },
        }));
      },

      updateCloudflareConfig: (updates) => {
        set((state) => ({
          cloudflareConfig: { ...state.cloudflareConfig, ...updates },
        }));
      },

      setOllamaInstalledModels: (models) => {
        set({ ollamaInstalledModels: models });
      },

      getItemById: (id) => {
        const { documents, sheets, slides, pdfs } = get();
        return (
          documents.find((d) => d.id === id) ||
          sheets.find((s) => s.id === id) ||
          slides.find((s) => s.id === id) ||
          pdfs.find((p) => p.id === id)
        );
      },

      createFromPrompt: (prompt, format = 'auto', attachments = [], urls = []) => {
        let determinedType: 'doc' | 'sheet' | 'slide' = 'doc';
        const lower = prompt.toLowerCase();

        if (format && format !== 'auto') {
          determinedType = format;
        } else {
          // Automatic detection based on intent and keywords
          const isSheet = /\b(sheet|spreadsheet|table|financial|budget|revenue|p&l|calculation|mrr|arr|accounting|metrics|balance|forecast|numbers|costs|salaries|projection)\b/.test(lower);
          const isSlide = /\b(slide|presentation|pitch deck|deck|keynote|slideshow|pitch|slides)\b/.test(lower);
          if (isSheet) {
            determinedType = 'sheet';
          } else if (isSlide) {
            determinedType = 'slide';
          } else {
            determinedType = 'doc';
          }
        }

        const id = `${determinedType}-${Date.now()}`;
        const now = new Date().toISOString();
        const firstLine = prompt.trim().split('\n')[0].replace(/^[#*-]\s*/, '').trim();
        const cleanTitle = firstLine.length > 55 ? firstLine.slice(0, 52) + '...' : firstLine || `New ${determinedType.toUpperCase()}`;

        const attachedSources: ResearchSource[] = [
          ...attachments.map((a, i) => ({
            id: `src-${Date.now()}-${i}`,
            title: a.name,
            type: (a.name.endsWith('.pdf') ? 'pdf' : a.name.endsWith('.docx') ? 'docx' : 'note') as ResearchSource['type'],
            snippet: `Uploaded file (${a.size}) indexed as context.`,
            addedAt: now,
            status: 'indexed' as const,
            tags: ['Upload'],
          })),
          ...urls.map((u, i) => ({
            id: `url-${Date.now()}-${i}`,
            title: u.replace(/^https?:\/\//, ''),
            type: 'url' as const,
            sourceUrl: u,
            snippet: `Web resource extracted for reference.`,
            addedAt: now,
            status: 'indexed' as const,
            tags: ['Web'],
          })),
        ];

        const base = {
          id,
          title: cleanTitle,
          createdAt: now,
          updatedAt: now,
          starred: false,
          trashed: false,
          owner: get().userProfile,
          tags: ['AI Generated'],
          size: '14 KB',
          initialPrompt: prompt,
          attachedSources,
        };

        if (determinedType === 'doc') {
          const newDoc: DocumentItem = {
            ...base,
            type: 'doc',
            content: `<h1>${cleanTitle}</h1><p><em>Generated from prompt: "${prompt}"</em></p><h2>1. Executive Overview</h2><p>This document synthesizes the strategic requirements, operational considerations, and key deliverables for: ${prompt}.</p><h2>2. Scope & Core Objectives</h2><ul><li><strong>Strategic Alignment:</strong> Establish baseline criteria and core success parameters.</li><li><strong>Execution Plan:</strong> Milestone breakdown and resource requirements.</li><li><strong>Quality Verification:</strong> Contingency planning and performance targets.</li></ul><h2>3. Detailed Specifications</h2><p>Collaborate with the AI assistant in the right panel to append sections, generate diagrams, or format data tables.</p>`,
            wordCount: 110,
            readingTime: 1,
            pageSize: 'A4',
            orientation: 'portrait',
            margins: 'normal',
          };
          set((state) => ({ documents: [newDoc, ...state.documents] }));
        } else if (determinedType === 'sheet') {
          const newSheet: SpreadsheetItem = {
            ...base,
            type: 'sheet',
            activeSheetId: 's1',
            sheets: [
              {
                id: 's1',
                name: 'Financial Overview',
                rowCount: 25,
                colCount: 8,
                cells: {
                  A1: { value: 'Metric / Line Item', bold: true, align: 'left' },
                  B1: { value: 'Q1', bold: true, align: 'right' },
                  C1: { value: 'Q2', bold: true, align: 'right' },
                  D1: { value: 'Q3', bold: true, align: 'right' },
                  E1: { value: 'Q4', bold: true, align: 'right' },
                  F1: { value: 'Total / Growth', bold: true, align: 'right' },

                  A2: { value: 'Gross Revenue' },
                  B2: { value: '125000', format: 'currency', align: 'right' },
                  C2: { value: '155000', format: 'currency', align: 'right' },
                  D2: { value: '190000', format: 'currency', align: 'right' },
                  E2: { value: '240000', format: 'currency', align: 'right' },
                  F2: { value: '=SUM(B2:E2)', bold: true, align: 'right' },

                  A3: { value: 'Direct Expenses' },
                  B3: { value: '45000', format: 'currency', align: 'right' },
                  C3: { value: '52000', format: 'currency', align: 'right' },
                  D3: { value: '61000', format: 'currency', align: 'right' },
                  E3: { value: '72000', format: 'currency', align: 'right' },
                  F2_sub: { value: '=SUM(B3:E3)', bold: true, align: 'right' },

                  A4: { value: 'Net Operating Profit', bold: true },
                  B4: { value: '80000', format: 'currency', align: 'right', bold: true },
                  C4: { value: '103000', format: 'currency', align: 'right', bold: true },
                  D4: { value: '129000', format: 'currency', align: 'right', bold: true },
                  E4: { value: '168000', format: 'currency', align: 'right', bold: true },
                  F4: { value: '=SUM(B4:E4)', bold: true, align: 'right' },
                },
              },
            ],
          };
          set((state) => ({ sheets: [newSheet, ...state.sheets] }));
        } else if (determinedType === 'slide') {
          const newSlide: PresentationItem = {
            ...base,
            type: 'slide',
            slides: [
              {
                id: `sp-${Date.now()}-1`,
                title: 'Title Slide',
                notes: 'Welcome stakeholders and introduce the project scope.',
                elements: [
                  { id: 'el-1', type: 'title', content: cleanTitle, x: 10, y: 30, width: 80, height: 20, fontSize: 34, color: '#245C45' },
                  { id: 'el-2', type: 'text', content: prompt, x: 10, y: 55, width: 80, height: 12, fontSize: 16, color: '#8C9B92' },
                ],
              },
              {
                id: `sp-${Date.now()}-2`,
                title: 'Executive Vision & Strategy',
                notes: 'Detail core strategic objectives and alignment.',
                elements: [
                  { id: 'el-3', type: 'title', content: 'Key Deliverables & Roadmap', x: 10, y: 15, width: 80, height: 15, fontSize: 28, color: '#245C45' },
                  { id: 'el-4', type: 'text', content: '• Market opportunity and competitive differentiation\n• High-velocity product development roadmap\n• Scalable architecture and operational resilience', x: 10, y: 35, width: 80, height: 40, fontSize: 18, color: '#151A17' },
                ],
              },
            ],
          };
          set((state) => ({ slides: [newSlide, ...state.slides] }));
        }

        // Initialize dedicated AI conversation for this item
        const initialAiMessages: AiChatMessage[] = [
          {
            id: `msg-${Date.now()}-1`,
            role: 'user',
            content: prompt,
            timestamp: 'Just now',
            attachments: attachments.map(a => ({ name: a.name, size: a.size, type: a.type })),
            sources: urls,
          },
          {
            id: `msg-${Date.now()}-2`,
            role: 'assistant',
            content: `I've created your **${determinedType === 'doc' ? 'Document' : determinedType === 'sheet' ? 'Spreadsheet' : 'Presentation'}** workspace based on your instructions.\n\nI structured the initial canvas and linked your ${attachedSources.length} attached source${attachedSources.length === 1 ? '' : 's'}. You can ask me to expand any section, recalculate formulas, add slides, or refine phrasing at any time.`,
            timestamp: 'Just now',
            suggestedAction: determinedType === 'doc'
              ? { label: 'Generate Methodology Section', type: 'insert_doc', payload: '### Methodology\nWe adopted a disciplined iterative approach combining qualitative benchmarks with empirical throughput analysis.' }
              : determinedType === 'sheet'
              ? { label: 'Calculate Operating Margins', type: 'create_table', payload: 'margins' }
              : { label: 'Add Roadmap Slide', type: 'create_chart', payload: 'roadmap' },
          },
        ];

        const initialConvId = `conv-${id}-1`;
        const initialConversation: WorkspaceConversation = {
          id: initialConvId,
          title: cleanTitle || 'Initial Creation Chat',
          category: 'document',
          documentId: id,
          createdAt: now,
          updatedAt: now,
          messages: initialAiMessages,
          sources: [],
          selectedTools: {
            internetSearch:
              get().composerDraft?.enabledTools?.internetSearch ??
              Boolean(
                get().providers?.brave?.apiKey ||
                get().providers?.tavily?.apiKey ||
                get().providers?.serper?.apiKey ||
                get().providers?.searxng?.baseUrl
              ),
            imageSearch: get().composerDraft?.enabledTools?.imageSearch || false,
            imageGeneration: get().composerDraft?.enabledTools?.imageGeneration || false,
            diagramsAndGraphs: get().composerDraft?.enabledTools?.diagramsAndGraphs || true,
            documentOperations: true,
          },
        };

        set((state) => ({
          itemConversations: {
            ...state.itemConversations,
            [id]: initialAiMessages,
          },
          itemSources: {
            ...state.itemSources,
            [id]: attachedSources,
          },
          documentConversations: {
            ...state.documentConversations,
            [id]: [initialConversation],
          },
          lastSelectedChatId: {
            ...state.lastSelectedChatId,
            [id]: initialConvId,
          },
          documentSources: {
            ...state.documentSources,
            [id]: attachedSources,
          },
        }));

        // Reset composer draft only after successful creation
        get().resetComposerDraft();

        return id;
      },

      markNotificationRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
      },

      markAllNotificationsRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, read: true })),
        }));
      },

      updateUserProfile: (profile) => {
        set((state) => ({ userProfile: { ...state.userProfile, ...profile } }));
      },

      updateApiKeys: (keys) => {
        set((state) => ({ apiKeys: { ...state.apiKeys, ...keys } }));
      },

      updateAppearanceSettings: (settings) => {
        set((state) => ({ appearanceSettings: { ...state.appearanceSettings, ...settings } }));
      },

      resetToSampleData: () => {
        set({
          documents: SAMPLE_DOCUMENTS,
          sheets: SAMPLE_SHEETS,
          slides: SAMPLE_SLIDES,
          pdfs: SAMPLE_PDFS,
          projects: SAMPLE_PROJECTS,
          sources: SAMPLE_SOURCES,
          notifications: SAMPLE_NOTIFICATIONS,
        });
      },
    }),
    {
      name: 'docium-workspace-storage-v1',
      partialize: (state) => ({
        documents: state.documents,
        sheets: state.sheets,
        slides: state.slides,
        pdfs: state.pdfs,
        projects: state.projects,
        sources: state.sources,
        notifications: state.notifications,
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        userProfile: state.userProfile,
        apiKeys: state.apiKeys,
        providers: state.providers,
        defaultProvider: state.defaultProvider,
        tokensUsedTotal: state.tokensUsedTotal,
        appearanceSettings: state.appearanceSettings,
        itemConversations: state.itemConversations,
        itemSources: state.itemSources,
        composerDraft: state.composerDraft,
        documentConversations: state.documentConversations,
        generalConversations: state.generalConversations,
        lastSelectedChatId: state.lastSelectedChatId,
        documentSources: state.documentSources,
        aiPanelState: state.aiPanelState,
        embeddingConfig: state.embeddingConfig,
        specializedModels: state.specializedModels,
        cloudflareConfig: state.cloudflareConfig,
        ollamaInstalledModels: state.ollamaInstalledModels,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // 1. Normalize all persisted workspace item records at data boundary
        if (Array.isArray(state.documents)) {
          state.documents = normalizeWorkspaceItems(state.documents, 'doc');
        }
        if (Array.isArray(state.sheets)) {
          state.sheets = normalizeWorkspaceItems(state.sheets, 'sheet');
        }
        if (Array.isArray(state.slides)) {
          state.slides = normalizeWorkspaceItems(state.slides, 'slide');
        }
        if (Array.isArray(state.pdfs)) {
          state.pdfs = normalizeWorkspaceItems(state.pdfs, 'pdf');
        }

        // 2. Clear any stuck zombie generation status across conversations after crashes or reloads
        if (state.documentConversations) {
          for (const docId of Object.keys(state.documentConversations)) {
            const convs = state.documentConversations[docId];
            if (Array.isArray(convs)) {
              for (const c of convs) {
                if (c.runStatus === 'preparing' || c.runStatus === 'generating' || c.runStatus === 'executing_tool') {
                  c.runStatus = 'completed';
                }
                if (Array.isArray(c.messages)) {
                  for (const m of c.messages) {
                    if (m.runStatus === 'preparing' || m.runStatus === 'generating' || m.runStatus === 'executing_tool') {
                      m.runStatus = 'completed';
                    }
                  }
                }
              }
            }
          }
        }

        if (Array.isArray(state.generalConversations)) {
          for (const c of state.generalConversations) {
            if (c.runStatus === 'preparing' || c.runStatus === 'generating' || c.runStatus === 'executing_tool') {
              c.runStatus = 'completed';
            }
            if (Array.isArray(c.messages)) {
              for (const m of c.messages) {
                if (m.runStatus === 'preparing' || m.runStatus === 'generating' || m.runStatus === 'executing_tool') {
                  m.runStatus = 'completed';
                }
              }
            }
          }
        }
      },
    }
  )
);

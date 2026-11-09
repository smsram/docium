'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useWorkspaceStore } from '@/lib/store';
import { PROVIDER_CATALOG } from '@/lib/ai/providers';
import { ProviderId, IntegrationCategory } from '@/lib/types';
import { ProviderLogo } from '@/components/ai/ProviderLogos';
import { Select, SelectOption } from '@/components/ui/Select';
import {
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Plus,
  Trash2,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Globe,
  ImageIcon,
} from 'lucide-react';

export default function AiSettingsPage() {
  const {
    providers,
    updateProviderConfig,
    defaultProvider,
    setDefaultProvider,
    testProviderConnection,
    addProviderToConfigured,
    removeProviderFromConfigured,
    cloudflareConfig,
    updateCloudflareConfig,
    ollamaInstalledModels,
  } = useWorkspaceStore();

  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>('ai');
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [testingId, setTestingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { success: boolean; message: string }>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAdvanced = (id: string) => {
    setExpandedAdvanced((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleTest = async (id: ProviderId) => {
    // If Cloudflare, validate count match before testing
    if (id === 'cloudflare') {
      const cfg = providers.cloudflare || { apiKey: '', accountId: '' };
      const accs = (cfg.accountId || cloudflareConfig.accountId || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const tokens = (cfg.apiKey || cloudflareConfig.apiToken || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (accs.length > 0 && tokens.length > 0 && accs.length !== tokens.length) {
        setFeedback((prev) => ({
          ...prev,
          cloudflare: {
            success: false,
            message: `Count mismatch: ${accs.length} Account ID(s) vs ${tokens.length} API Token(s). Cloudflare credentials must be strictly paired 1:1.`,
          },
        }));
        return;
      }
    }

    setTestingId(id);
    const result = await testProviderConnection(id);
    setTestingId(null);
    if (result.success) {
      setFeedback((prev) => ({
        ...prev,
        [id]: { success: true, message: result.message || 'Connected successfully' },
      }));
    } else {
      setFeedback((prev) => ({
        ...prev,
        [id]: { success: false, message: result.error || 'Connection failed' },
      }));
    }
  };

  // Filter catalog items for active category
  const categoryCatalog = useMemo(() => {
    return PROVIDER_CATALOG.filter((p) => p.category === activeCategory);
  }, [activeCategory]);

  // Configured providers (isAdded: true)
  const configuredCategoryProviders = useMemo(() => {
    return categoryCatalog.filter((item) => {
      const config = providers[item.id];
      return config && config.isAdded;
    });
  }, [categoryCatalog, providers]);

  // Filter AI providers that are both configured (isAdded) and successfully connected
  const connectedAiProviders = useMemo(() => {
    return PROVIDER_CATALOG.filter((item) => {
      if (item.category !== 'ai') return false;
      const config = providers[item.id];
      return config && config.isAdded && config.status === 'connected';
    });
  }, [providers]);

  // When only one AI provider is configured and connected, automatically use that provider
  useEffect(() => {
    if (connectedAiProviders.length === 1) {
      const onlyProvider = connectedAiProviders[0];
      if (defaultProvider !== onlyProvider.id) {
        setDefaultProvider(onlyProvider.id);
      }
    }
  }, [connectedAiProviders, defaultProvider, setDefaultProvider]);

  const defaultProviderConfig = providers[defaultProvider];
  const isDefaultProviderConnected =
    defaultProviderConfig &&
    defaultProviderConfig.isAdded &&
    defaultProviderConfig.status === 'connected';

  // Catalog items for the "Add Provider" modal
  const addableCatalog = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    return PROVIDER_CATALOG.filter((item) => {
      const config = providers[item.id];
      const isAlreadyAdded = config && config.isAdded;
      if (isAlreadyAdded) return false;

      const matchesQuery =
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchesQuery;
    });
  }, [catalogSearch, providers]);

  const handleAddFromModal = (id: ProviderId, category: IntegrationCategory) => {
    addProviderToConfigured(id);
    setActiveCategory(category);
    setIsAddModalOpen(false);
    setCatalogSearch('');
  };

  return (
    <div className="max-w-4xl space-y-6 pb-12">
      {/* ==================================================== */}
      {/* 1. SETTINGS HEADER                                   */}
      {/* ==================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div>
          <h2 className="text-base font-semibold text-[var(--text)] tracking-tight">
            AI &amp; Tool Integrations
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Configure your Bring Your Own Key (BYOK) AI providers, local intelligence, and external tools.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-hover)] transition-all shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Provider</span>
        </button>
      </div>

      {/* ==================================================== */}
      {/* 2. CATEGORY SWITCHER TABS                            */}
      {/* ==================================================== */}
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] pb-2 text-xs">
        <button
          onClick={() => setActiveCategory('ai')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeCategory === 'ai'
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>AI Reasoning</span>
        </button>
        <button
          onClick={() => setActiveCategory('search')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeCategory === 'search'
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
        >
          <Globe className="h-3.5 w-3.5" />
          <span>Search Providers</span>
        </button>
        <button
          onClick={() => setActiveCategory('image')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors cursor-pointer ${
            activeCategory === 'image'
              ? 'bg-[var(--primary)] text-white shadow-2xs'
              : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)]'
          }`}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          <span>Image Generation</span>
        </button>
      </div>

      {/* ==================================================== */}
      {/* 3. DEFAULT AI PROVIDER SELECTION (AI TAB ONLY)       */}
      {/* ==================================================== */}
      {activeCategory === 'ai' && (
        <div className="space-y-3">
          {/* Warning if current default provider is disconnected or unavailable */}
          {!isDefaultProviderConnected && connectedAiProviders.length > 0 && (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                <span className="truncate">
                  Default provider <strong className="font-semibold">{defaultProviderConfig?.name || defaultProvider}</strong> is disconnected. Please choose a connected provider.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDefaultProvider(connectedAiProviders[0].id)}
                className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-medium text-[11px] shrink-0 hover:bg-amber-700 transition-colors cursor-pointer"
              >
                Set {connectedAiProviders[0].name}
              </button>
            </div>
          )}

          {/* When two or more providers are configured and connected: compact dropdown */}
          {connectedAiProviders.length >= 2 ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-[var(--text)]">Default AI Provider</span>
                  <span className="text-[10px] rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium px-1.5 py-0.2">
                    {connectedAiProviders.length} connected
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Determines which provider is automatically selected for new conversations.
                </p>
              </div>

              <div className="w-full sm:w-60 shrink-0">
                <Select
                  value={defaultProvider}
                  onChange={(val) => setDefaultProvider(val as ProviderId)}
                  options={connectedAiProviders.map((p) => ({
                    value: p.id,
                    label: p.name,
                    sublabel: defaultProvider === p.id ? 'Active Default' : undefined,
                  }))}
                  placeholder="Select default provider..."
                />
              </div>
            </div>
          ) : connectedAiProviders.length === 1 ? (
            /* When only one provider is configured and connected, automatic indicator */
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/60 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="text-[var(--text-muted)]">
                  Default AI Provider: <strong className="font-medium text-[var(--text)]">{connectedAiProviders[0].name}</strong> (automatically selected for new chats)
                </span>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* ==================================================== */}
      {/* 4. CONFIGURED PROVIDER CARDS                         */}
      {/* ==================================================== */}
      {configuredCategoryProviders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] p-12 text-center bg-[var(--surface)] space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent)] text-[var(--text-muted)]">
            {activeCategory === 'ai' ? (
              <Sparkles className="h-6 w-6 text-[var(--primary)]" />
            ) : activeCategory === 'search' ? (
              <Globe className="h-6 w-6 text-[var(--primary)]" />
            ) : (
              <ImageIcon className="h-6 w-6 text-[var(--primary)]" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">
              No {activeCategory === 'ai' ? 'AI' : activeCategory === 'search' ? 'Search' : 'Image Generation'} providers configured
            </h3>
            <p className="text-xs text-[var(--text-muted)] max-w-sm mt-1">
              Add a provider from the catalog to configure its API key or local endpoint.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] text-white px-3.5 py-1.5 text-xs font-semibold hover:bg-[var(--primary-hover)] transition-all shadow-xs cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Provider</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {configuredCategoryProviders.map((provider) => {
            const config = providers[provider.id] || {
              id: provider.id,
              name: provider.name,
              category: provider.category,
              enabled: true,
              apiKey: '',
              selectedModel: provider.models[0]?.id || '',
              status: 'unconfigured',
              isAdded: true,
            };

            const isDefault = defaultProvider === provider.id && provider.category === 'ai';
            const isShown = showKeys[provider.id];
            const isAdvancedOpen = expandedAdvanced[provider.id];
            const isTesting = testingId === provider.id;
            const fb = feedback[provider.id];
            const isConnected = config.status === 'connected';
            const hasError = config.status === 'error';

            const isOllama = provider.id === 'ollama';
            const isCloudflare = provider.id === 'cloudflare';

            // Model dropdown options
            const modelOptions: SelectOption[] = isOllama && ollamaInstalledModels.length > 0
              ? ollamaInstalledModels.map((m) => ({
                  value: m.name,
                  label: m.name,
                  sublabel: `${m.size}${m.hasVision ? ' • Vision' : ''}`,
                }))
              : provider.models.map((m) => ({
                  value: m.id,
                  label: m.name,
                  sublabel: m.description,
                }));

            // Cloudflare auto-constructed endpoint preview
            const currentAccountId = config.accountId || cloudflareConfig.accountId || '';
            const cfConstructedEndpoint = `https://api.cloudflare.com/client/v4/accounts/${currentAccountId || '{account_id}'}/ai/run/${config.selectedModel || '@cf/meta/llama-3.1-70b-instruct'}`;

            return (
              <div
                key={provider.id}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isDefault
                    ? 'border-[var(--primary)] bg-[var(--surface)] shadow-xs ring-1 ring-[var(--primary)]/20'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-subtle)]'
                }`}
              >
                {/* ------------------------------------------------ */}
                {/* Provider Card Header                             */}
                {/* ------------------------------------------------ */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] border border-[var(--border)] shrink-0">
                      <ProviderLogo providerId={provider.id} size={22} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-xs text-[var(--text)]">
                          {provider.name}
                        </h3>
                        {isDefault && (
                          <span className="text-[10px] rounded-md bg-[var(--primary-light)] text-[var(--primary)] px-2 py-0.5 font-semibold">
                            Default AI
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 line-clamp-1">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  {/* Actions & Status Badge */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Connected</span>
                      </span>
                    ) : hasError ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-500/20 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>Error</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
                        Unconfigured
                      </span>
                    )}

                    {provider.category === 'ai' && !isDefault && (
                      <button
                        onClick={() => setDefaultProvider(provider.id)}
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] transition-colors cursor-pointer"
                      >
                        Set Default
                      </button>
                    )}

                    <button
                      onClick={() => removeProviderFromConfigured(provider.id)}
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--accent)] transition-colors cursor-pointer"
                      title="Remove provider from active view"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* ------------------------------------------------ */}
                {/* Provider Card Body                               */}
                {/* ------------------------------------------------ */}
                <div className="p-4 sm:p-5 space-y-4 text-xs bg-[var(--surface-elevated)]/30">
                  {/* ============================================== */}
                  {/* CASE 1: LOCAL AI (OLLAMA)                      */}
                  {/* ============================================== */}
                  {isOllama ? (
                    <div className="space-y-4">
                      {/* Ollama Server URL */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            Ollama Server URL
                          </label>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            Default: http://localhost:11434
                          </span>
                        </div>
                        <input
                          type="text"
                          value={config.baseUrl ?? 'http://localhost:11434'}
                          onChange={(e) =>
                            updateProviderConfig('ollama', {
                              baseUrl: e.target.value,
                              status: 'unconfigured',
                            })
                          }
                          placeholder="http://localhost:11434"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                        />
                      </div>

                      {/* Ollama Model Selection */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            Selected Model
                          </label>
                          {isConnected && ollamaInstalledModels.length > 0 && (
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                              {ollamaInstalledModels.length} local models detected
                            </span>
                          )}
                        </div>
                        <Select
                          value={config.selectedModel}
                          onChange={(val) =>
                            updateProviderConfig('ollama', { selectedModel: val })
                          }
                          options={modelOptions}
                          placeholder="Select an Ollama model..."
                        />
                      </div>
                    </div>
                  ) : isCloudflare ? (
                    /* ============================================== */
                    /* CASE 2: CLOUDFLARE WORKERS AI                  */
                    /* ============================================== */
                    <div className="space-y-4">
                      {/* Cloudflare Account ID */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            Cloudflare Account ID
                          </label>
                          <a
                            href="https://dash.cloudflare.com/?to=/:account/ai/workers-ai"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <span>Find in Cloudflare dashboard</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <input
                          type="text"
                          value={config.accountId || cloudflareConfig.accountId || ''}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            updateProviderConfig('cloudflare', { accountId: val, status: 'unconfigured' });
                            updateCloudflareConfig({ accountId: val });
                          }}
                          placeholder="accountid1, accountid2, accountid3, ..."
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                        />
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Multiple comma-separated Account IDs must be paired 1:1 by position with the API Tokens below.
                        </p>
                      </div>

                      {/* Cloudflare API Token */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            API Token
                          </label>
                          <a
                            href={provider.docsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-1 font-medium"
                          >
                            <span>Create token</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                        <div className="relative">
                          <input
                            type={isShown ? 'text' : 'password'}
                            value={config.apiKey || cloudflareConfig.apiToken || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              updateProviderConfig('cloudflare', { apiKey: val, status: 'unconfigured' });
                              updateCloudflareConfig({ apiToken: val });
                            }}
                            placeholder="key1, key2, key3, ..."
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-10 py-1.5 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                          />
                          <button
                            type="button"
                            onClick={() => toggleShowKey(provider.id)}
                            className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                            title={isShown ? 'Hide key' : 'Show key'}
                          >
                            {isShown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Multiple comma-separated API Tokens will be automatically rotated on rate limits or quota errors.
                        </p>
                      </div>

                      {/* Cloudflare pairing count mismatch warning */}
                      {(() => {
                        const cfAccCount = (config.accountId || cloudflareConfig.accountId || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean).length;
                        const cfTokCount = (config.apiKey || cloudflareConfig.apiToken || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean).length;
                        if (cfAccCount > 0 && cfTokCount > 0 && cfAccCount !== cfTokCount) {
                          return (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-[11px]">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Count mismatch: {cfAccCount} Account ID(s) vs {cfTokCount} API Token(s). Cloudflare credentials must be strictly paired 1:1 by position.
                              </span>
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Cloudflare Model Selection */}
                      <div className="space-y-1.5">
                        <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                          Model
                        </label>
                        <Select
                          value={config.selectedModel}
                          onChange={(val) => {
                            updateProviderConfig('cloudflare', { selectedModel: val });
                            updateCloudflareConfig({ selectedModel: val });
                          }}
                          options={modelOptions}
                          placeholder="Select Cloudflare edge model..."
                        />
                      </div>

                      {/* Collapsible Advanced Options for Cloudflare */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => toggleAdvanced(provider.id)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer select-none"
                        >
                          {isAdvancedOpen ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                          <span>Advanced Options</span>
                        </button>

                        {isAdvancedOpen && (
                          <div className="mt-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] space-y-2">
                            <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider block">
                              API URL / Base URL Override
                            </label>
                            <input
                              type="text"
                              value={config.baseUrl || ''}
                              onChange={(e) =>
                                updateProviderConfig(provider.id, {
                                  baseUrl: e.target.value,
                                  status: 'unconfigured',
                                })
                              }
                              placeholder={cfConstructedEndpoint}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                            />
                            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                              Official Cloudflare API endpoint is automatically constructed using your Account ID. Custom base URL is optional.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* ============================================== */
                    /* CASE 3: STANDARD API-BASED PROVIDERS           */
                    /* ============================================== */
                    <div className="space-y-4">
                      {/* API Key Input */}
                      {provider.requiresApiKey && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                              API Key
                            </label>
                            <a
                              href={provider.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-1 font-medium"
                            >
                              <span>Get key</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          <div className="relative">
                            <input
                              type={isShown ? 'text' : 'password'}
                              value={config.apiKey || ''}
                              onChange={(e) =>
                                updateProviderConfig(provider.id, {
                                  apiKey: e.target.value,
                                  status: 'unconfigured',
                                })
                              }
                              placeholder="key1, key2, key3, ..."
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-3 pr-10 py-1.5 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                            />
                            <button
                              type="button"
                              onClick={() => toggleShowKey(provider.id)}
                              className="absolute right-2.5 top-2 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                              title={isShown ? 'Hide key' : 'Show key'}
                            >
                              {isShown ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)]">
                            Multiple comma-separated keys will be automatically rotated on rate limits or quota errors.
                          </p>
                        </div>
                      )}

                      {/* Model Selection Dropdown */}
                      {modelOptions.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider">
                            Model
                          </label>
                          <Select
                            value={config.selectedModel}
                            onChange={(val) =>
                              updateProviderConfig(provider.id, { selectedModel: val })
                            }
                            options={modelOptions}
                            placeholder="Select model..."
                          />
                        </div>
                      )}

                      {/* Collapsible Advanced Options for Base URL */}
                      {provider.supportsCustomBaseUrl && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleAdvanced(provider.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer select-none"
                          >
                            {isAdvancedOpen ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            <span>Advanced Options</span>
                          </button>

                          {isAdvancedOpen && (
                            <div className="mt-2.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] space-y-2">
                              <label className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider block">
                                API URL / Base URL Override
                              </label>
                              <input
                                type="text"
                                value={config.baseUrl || ''}
                                onChange={(e) =>
                                  updateProviderConfig(provider.id, {
                                    baseUrl: e.target.value,
                                    status: 'unconfigured',
                                  })
                                }
                                placeholder={provider.defaultBaseUrl || 'Default provider endpoint'}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                              />
                              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                                Optional. Uses the provider&apos;s official default endpoint automatically when left empty.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ---------------------------------------------- */}
                  {/* Test Connection Button & Status Feedback       */}
                  {/* ---------------------------------------------- */}
                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
                    {(() => {
                      const isCfMismatch = isCloudflare && (() => {
                        const accs = (config.accountId || cloudflareConfig.accountId || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        const toks = (config.apiKey || cloudflareConfig.apiToken || '')
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        return accs.length > 0 && toks.length > 0 && accs.length !== toks.length;
                      })();

                      return (
                        <button
                          onClick={() => handleTest(provider.id)}
                          disabled={isTesting || Boolean(isCfMismatch)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)] hover:border-[var(--primary)] transition-all disabled:opacity-50 cursor-pointer shadow-2xs self-start"
                        >
                          {isTesting ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              <span>Testing...</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>Test Connection</span>
                            </>
                          )}
                        </button>
                      );
                    })()}

                    {fb && (
                      <span
                        className={`text-xs ${
                          fb.success
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {fb.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================================================== */}
      {/* 5. SEARCHABLE "ADD PROVIDER" MODAL DIALOG            */}
      {/* ==================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-2xs">
          <div className="w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)] shrink-0">
              <div>
                <h3 className="font-semibold text-sm text-[var(--text)]">
                  Add Provider to Workspace
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Select an AI model, search index, or image generator to configure.
                </p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--accent)] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative shrink-0">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search providers by name or model..."
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-bg)] pl-9 pr-3 py-2 text-xs text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--primary)]"
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {addableCatalog.length === 0 ? (
                <div className="text-center py-8 text-xs text-[var(--text-muted)]">
                  {catalogSearch
                    ? `No providers found matching "${catalogSearch}".`
                    : 'All catalog providers are already added to your workspace.'}
                </div>
              ) : (
                addableCatalog.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 hover:border-[var(--primary)] transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)] shrink-0">
                        <ProviderLogo providerId={item.id} size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-xs text-[var(--text)]">
                            {item.name}
                          </span>
                          <span className="text-[10px] font-mono rounded px-1.5 py-0.2 bg-[var(--accent)] text-[var(--text-muted)] border border-[var(--border)]">
                            {item.category === 'ai' ? 'AI' : item.category === 'search' ? 'Search' : 'Image'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--text-muted)] line-clamp-1 mt-0.5">
                          {item.description}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddFromModal(item.id, item.category)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--primary)] text-white px-3 py-1.5 text-xs font-semibold hover:bg-[var(--primary-hover)] transition-all shrink-0 cursor-pointer shadow-2xs"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useRef, useEffect, useLayoutEffect, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Check, Settings, AlertCircle } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/store';
import { ProviderId, ModelOption } from '@/lib/types';
import { PROVIDER_CATALOG, getChatVisionModels } from '@/lib/ai/providers';
import { ProviderLogo } from '@/components/ai/ProviderLogos';

interface ModelSelectorPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  currentProviderId: ProviderId;
  currentModelId: string;
  onSelectModel: (providerId: ProviderId, modelId: string) => void;
}

interface PopoverCoords {
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  placement: 'top' | 'bottom';
}

const POPOVER_WIDTH = 288; // w-72 (18rem)
const VIEWPORT_PADDING = 8;
const GAP = 6;

const emptySubscribe = () => () => {};

export function ModelSelectorPopover({
  isOpen,
  onClose,
  anchorRef,
  currentProviderId,
  currentModelId,
  onSelectModel,
}: ModelSelectorPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [coords, setCoords] = React.useState<PopoverCoords | null>(null);
  const { providers, ollamaInstalledModels } = useWorkspaceStore();

  // Calculate dynamic viewport-aware position (prevents overflow and clipping)
  const updatePosition = useCallback(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    const roomAbove = rect.top;
    const roomBelow = window.innerHeight - rect.bottom;

    // Prefer placing above if space below is limited
    const placeAbove = roomBelow < 280 && roomAbove > roomBelow;

    let left = rect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - VIEWPORT_PADDING) {
      left = Math.max(VIEWPORT_PADDING, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
    }
    if (left < VIEWPORT_PADDING) {
      left = VIEWPORT_PADDING;
    }

    if (placeAbove) {
      const maxHeight = Math.max(120, Math.min(380, roomAbove - VIEWPORT_PADDING - GAP));
      const bottom = window.innerHeight - rect.top + GAP;
      setCoords({
        bottom,
        left,
        maxHeight,
        placement: 'top',
      });
    } else {
      const maxHeight = Math.max(120, Math.min(380, roomBelow - VIEWPORT_PADDING - GAP));
      const top = rect.bottom + GAP;
      setCoords({
        top,
        left,
        maxHeight,
        placement: 'bottom',
      });
    }
  }, [anchorRef]);

  // Position recalculation on open before paint
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition]);

  // Handle position tracking, outside click, and Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (
        popover &&
        !popover.contains(e.target as Node) &&
        anchor &&
        !anchor.contains(e.target as Node)
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, anchorRef, updatePosition]);

  // Connected providers with valid configurations and status === 'connected'
  const connectedProviders = useMemo(() => {
    const aiCatalog = PROVIDER_CATALOG.filter((p) => p.category === 'ai');

    return aiCatalog.filter((item) => {
      const config = providers[item.id];
      return config && config.isAdded && config.status === 'connected';
    });
  }, [providers]);

  // Check if active model's provider is currently connected
  const isCurrentProviderConnected = useMemo(() => {
    const cfg = providers[currentProviderId];
    return cfg && cfg.isAdded && cfg.status === 'connected';
  }, [providers, currentProviderId]);

  // Models grouped by connected provider
  const groupedModels = useMemo(() => {
    const result: Array<{
      providerId: ProviderId;
      providerName: string;
      models: ModelOption[];
    }> = [];

    for (const provider of connectedProviders) {
      const cfg = providers[provider.id];
      let availableModels: ModelOption[] = [];

      if (provider.id === 'ollama' && ollamaInstalledModels.length > 0) {
        availableModels = ollamaInstalledModels
          .filter((m) => m.hasVision)
          .map((m) => ({
            id: m.name,
            name: m.name,
            capabilities: {
              contextWindow: '128k',
              supportsVision: true,
              supportsTools: m.hasTools,
              supportsStreaming: true,
              reasoning: m.name.includes('r1'),
              supportsText: true,
            },
          }));
      } else {
        availableModels = getChatVisionModels(provider.id, cfg);
      }

      if (availableModels.length > 0) {
        result.push({
          providerId: provider.id,
          providerName: provider.name,
          models: availableModels,
        });
      }
    }

    return result;
  }, [connectedProviders, providers, ollamaInstalledModels]);

  if (!isOpen || !mounted || !coords) return null;

  const content = (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Select AI Model"
      style={{
        position: 'fixed',
        left: coords?.left ?? VIEWPORT_PADDING,
        top: coords?.top !== undefined ? coords.top : undefined,
        bottom: coords?.bottom !== undefined ? coords.bottom : undefined,
        maxHeight: coords?.maxHeight ?? 360,
        width: POPOVER_WIDTH,
      }}
      className="z-[9999] flex flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] py-1.5 shadow-2xl select-none text-xs animate-in fade-in duration-100"
    >
      {/* Warning if current conversation model provider is not connected */}
      {!isCurrentProviderConnected && (
        <div className="mx-2 mb-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[11px] flex flex-col gap-1.5 shrink-0">
          <div className="flex items-start gap-1.5 leading-tight">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-500 mt-0.5" />
            <span>
              Selected model&apos;s provider is not connected or configured. Choose a connected model below.
            </span>
          </div>
          {groupedModels.length > 0 && groupedModels[0]?.models[0] && (
            <button
              type="button"
              onClick={() => {
                const targetGroup = groupedModels[0];
                const targetModel = targetGroup.models[0];
                onSelectModel(targetGroup.providerId, targetModel.id);
                onClose();
              }}
              className="self-start text-[10px] font-semibold text-[var(--primary)] hover:underline cursor-pointer"
            >
              Switch to {groupedModels[0].providerName} ({groupedModels[0].models[0].name})
            </button>
          )}
        </div>
      )}

      {/* Model List */}
      <div className="flex-1 overflow-y-auto px-1.5 space-y-2.5">
        {groupedModels.length === 0 ? (
          <div className="py-4 px-3 text-center space-y-2">
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              No AI providers are connected. Connect and verify a provider in Settings.
            </p>
            <Link
              href="/settings/ai"
              onClick={onClose}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--primary)] font-medium hover:underline"
            >
              <Settings className="h-3 w-3" />
              <span>Configure AI Providers</span>
            </Link>
          </div>
        ) : (
          groupedModels.map((group) => (
            <div key={group.providerId} className="space-y-0.5">
              {/* Provider Group Heading */}
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                <ProviderLogo providerId={group.providerId} size={12} />
                <span className="truncate">{group.providerName}</span>
              </div>

              {/* Models for this provider */}
              {group.models.map((model) => {
                const isSelected =
                  currentProviderId === group.providerId && currentModelId === model.id;

                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => {
                      onSelectModel(group.providerId, model.id);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer min-h-[32px] ${
                      isSelected
                        ? 'bg-[var(--accent)] text-[var(--primary)] font-medium'
                        : 'text-[var(--text)] hover:bg-[var(--accent)]/60'
                    }`}
                  >
                    <span className="truncate text-xs">{model.name}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-[var(--primary)] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Subtle Settings Footer */}
      {groupedModels.length > 0 && (
        <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)] px-2.5 shrink-0 flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">
            Chat model
          </span>
          <Link
            href="/settings/ai"
            onClick={onClose}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
          >
            <Settings className="h-2.5 w-2.5" />
            <span>Manage Providers</span>
          </Link>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
}

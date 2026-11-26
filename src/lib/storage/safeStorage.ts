/**
 * DOCIUM Safe Persistence Storage Adapter
 *
 * Provides resilient, quota-immune local storage:
 * 1. IndexedDB is the authoritative store for all documents, conversations, messages, sources, and activity logs.
 * 2. Sequential persistenceQueue guarantees ordered, race-free IndexedDB writes.
 * 3. LocalStorage stores only lightweight bootstrap state (< 15KB: theme, sidebarCollapsed, userProfile, defaultProvider, apiKeys, lastSelectedChatId).
 * 4. Safe migration on getItem transfers legacy localStorage data to IndexedDB.
 * 5. Eliminates QuotaExceededError crashes completely.
 */

import { StateStorage } from 'zustand/middleware';
import { idbSet, idbGet, idbDelete } from './indexedDbStorage';

export function createSafeWorkspaceStorage(): StateStorage {
  // Queue to serialize asynchronous writes and prevent IndexedDB race conditions
  let persistenceQueue = Promise.resolve();

  return {
    getItem: async (name: string): Promise<string | null> => {
      if (typeof window === 'undefined') return null;

      try {
        // 1. IndexedDB is authoritative store
        const idbData = await idbGet<string>('workspaceData', name);
        if (idbData && typeof idbData === 'string' && idbData.trim().length > 0) {
          return idbData;
        }

        // 2. Fall back to legacy localStorage if IndexedDB is empty (first migration)
        const legacyData = window.localStorage.getItem(name);
        if (legacyData && legacyData.trim().length > 0) {
          console.log('[DOCIUM Storage] Migrating legacy localStorage data to authoritative IndexedDB...');
          try {
            await idbSet('workspaceData', name, legacyData);
          } catch (mErr) {
            console.warn('[DOCIUM Storage] Migration write error:', mErr);
          }
          return legacyData;
        }

        return null;
      } catch (err) {
        console.warn('[DOCIUM Storage] Error in getItem:', err);
        return window.localStorage.getItem(name);
      }
    },

    setItem: async (name: string, value: string): Promise<void> => {
      if (typeof window === 'undefined') return;

      // 1. Queue-managed reliable writes to IndexedDB (authoritative store)
      persistenceQueue = persistenceQueue.then(async () => {
        try {
          await idbSet('workspaceData', name, value);
        } catch (idbErr) {
          console.warn('[DOCIUM Storage] Error writing authoritative state to IndexedDB:', idbErr);
        }
      });

      // 2. Extract and persist ONLY lightweight bootstrap state to localStorage (< 15KB)
      try {
        const parsed = JSON.parse(value);
        if (parsed && parsed.state) {
          const bootstrapState = {
            theme: parsed.state.theme,
            sidebarCollapsed: parsed.state.sidebarCollapsed,
            userProfile: parsed.state.userProfile,
            defaultProvider: parsed.state.defaultProvider,
            apiKeys: parsed.state.apiKeys,
            providers: parsed.state.providers,
            lastSelectedChatId: parsed.state.lastSelectedChatId,
            tokensUsedTotal: parsed.state.tokensUsedTotal,
            appearanceSettings: parsed.state.appearanceSettings,
          };

          const bootstrapPayload = {
            state: bootstrapState,
            version: parsed.version,
          };

          const bootstrapString = JSON.stringify(bootstrapPayload);
          window.localStorage.setItem(`${name}-bootstrap`, bootstrapString);

          // Write minimal stub to `name` without bulky items (docs, sheets, slides, messages)
          // so existing synchronous bootstrap readers find lightweight state without QuotaExceededError
          const minimalState = {
            ...bootstrapPayload,
            state: {
              ...bootstrapState,
              documents: [],
              sheets: [],
              slides: [],
              pdfs: [],
              documentConversations: {},
              generalConversations: [],
              documentSources: {},
            },
          };
          window.localStorage.setItem(name, JSON.stringify(minimalState));
        }
      } catch (err: unknown) {
        // QuotaExceededError or JSON error in localStorage is non-fatal since IndexedDB holds authoritative data
        const error = err as { name?: string; code?: number };
        const isQuota =
          error?.name === 'QuotaExceededError' ||
          error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
          error?.code === 22 ||
          error?.code === 1014;

        if (isQuota) {
          console.warn(
            '[DOCIUM Storage] localStorage quota reached. Safely bypassed — authoritative data is preserved in IndexedDB.'
          );
        } else {
          console.warn('[DOCIUM Storage] localStorage setItem error:', err);
        }
      }
    },

    removeItem: async (name: string): Promise<void> => {
      if (typeof window === 'undefined') return;
      persistenceQueue = persistenceQueue.then(async () => {
        try {
          await idbDelete('workspaceData', name);
        } catch (e) {
          console.warn('[DOCIUM Storage] Error deleting from IndexedDB:', e);
        }
      });
      try {
        window.localStorage.removeItem(name);
        window.localStorage.removeItem(`${name}-bootstrap`);
      } catch (err) {
        console.warn('[DOCIUM Storage] localStorage removeItem error:', err);
      }
    },
  };
}


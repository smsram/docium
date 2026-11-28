/**
 * DOCIUM Server-Side Index & Vision Bridge
 * Coordinates disk-backed chunk/image hydration, persistence, and upload-time
 * vision captioning across API routes and the agent orchestrator.
 * (Server-only module — never import from client components.)
 */

import { ProviderId } from '@/lib/types';
import {
  loadPersistedWorkspaceChunks,
  savePersistedWorkspaceChunks,
  loadPersistedWorkspaceImageCards,
  savePersistedImageCard,
  loadPersistedImageCardByHash,
  PersistedChunkRecord,
} from '@/lib/storage/sourceStorage';
import { registerChunks, SemanticChunk } from './embeddings';
import {
  IndexedImageRecord,
  registerImageRecordOnly,
  ImageToProcess,
  ImageAnalysisPayload,
} from './images/imageUnderstanding';
import { isVisionCapableModel } from './providers';
import { captionImageForIndex, VisionRunnerOptions } from './vision/visionRunner';
import { parseCloudflarePairs } from './credentials';

const hydratedWorkspaces = new Set<string>();

/**
 * Loads persisted vector chunks and image cards for a workspace into memory on cold start / cache miss.
 */
export function hydrateWorkspaceIndexes(workspaceId: string): void {
  if (!workspaceId || hydratedWorkspaces.has(workspaceId)) return;
  hydratedWorkspaces.add(workspaceId);

  try {
    const chunks = loadPersistedWorkspaceChunks(workspaceId);
    if (chunks.length > 0) {
      registerChunks(workspaceId, chunks as SemanticChunk[]);
    }

    const imageCards = loadPersistedWorkspaceImageCards(workspaceId);
    for (const card of imageCards) {
      registerImageRecordOnly({
        ...card,
        analysisStatus: card.analysisStatus || 'pending_vision',
      });
    }
  } catch (err) {
    console.warn(`[DOCIUM Server Index] Hydration warning for workspace "${workspaceId}":`, err);
  }
}

/**
 * Forces re-reading workspace indexes from disk (used when source list changes).
 */
export function invalidateWorkspaceHydration(workspaceId: string): void {
  hydratedWorkspaces.delete(workspaceId);
}

/**
 * Persists newly ingested semantic chunks and analyzed image cards to disk.
 */
export function persistWorkspaceIngestion(
  workspaceId: string,
  chunks: SemanticChunk[],
  imageRecords: IndexedImageRecord[] = []
): void {
  if (chunks.length > 0) {
    savePersistedWorkspaceChunks(workspaceId, chunks as PersistedChunkRecord[]);
  }
  for (const rec of imageRecords) {
    savePersistedImageCard({
      id: rec.id,
      sourceId: rec.sourceId,
      workspaceId: rec.workspaceId || workspaceId,
      filename: rec.filename,
      mimeType: rec.mimeType,
      page: rec.page,
      slide: rec.slide,
      contentHash: rec.contentHash,
      perceptualHash: rec.perceptualHash,
      analysisStatus: rec.analysisStatus,
      analysisModel: rec.analysisModel,
      analyzedAt: rec.analyzedAt,
      mainSubjects: rec.mainSubjects,
      objectsAndDetails: rec.objectsAndDetails,
      ocrText: rec.ocrText,
      hasChartsOrDiagrams: rec.hasChartsOrDiagrams,
      chartOrTableData: rec.chartOrTableData,
      keywords: rec.keywords,
      semanticTags: rec.semanticTags,
      aiGeneratedDescription: rec.aiGeneratedDescription,
    });
  }
  hydratedWorkspaces.add(workspaceId);
}

function resolveDefaultVisionModelForProvider(providerId: ProviderId): string {
  switch (providerId) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'cloudflare':
      return '@cf/meta/llama-3.2-11b-vision-instruct';
    case 'groq':
      return 'llama-3.2-11b-vision-preview';
    case 'openrouter':
      return 'meta-llama/llama-3.2-11b-vision-instruct';
    case 'ollama':
      return 'llama3.2-vision';
    default:
      return 'gpt-4o-mini';
  }
}

/**
 * Resolves a valid VisionRunnerOptions from client upload payload or server environment variables.
 * Automatically substitutes the provider's fast vision model if the active chat model is text-only.
 */
export function resolveServerVisionOptions(rawVisionConfigJson?: string | null): VisionRunnerOptions | null {
  if (rawVisionConfigJson) {
    try {
      const parsed = JSON.parse(rawVisionConfigJson) as {
        providerId?: ProviderId;
        modelId?: string;
        apiKey?: string;
        baseUrl?: string;
        accountId?: string;
      };
      const pid = parsed.providerId;
      if (pid) {
        let mid = parsed.modelId || resolveDefaultVisionModelForProvider(pid);
        if (!isVisionCapableModel(mid, pid)) {
          mid = resolveDefaultVisionModelForProvider(pid);
        }

        if (pid === 'cloudflare') {
          const acc = parsed.accountId || process.env.CLOUDFLARE_ACCOUNT_ID || '';
          const tok = parsed.apiKey || process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY || '';
          const pairCheck = parseCloudflarePairs(acc, tok);
          if (pairCheck.valid && pairCheck.pairs.length > 0) {
            return {
              providerId: 'cloudflare',
              modelId: mid,
              apiKey: tok,
              accountId: acc,
              baseUrl: parsed.baseUrl,
            };
          }
        } else if (parsed.apiKey || pid === 'ollama' || pid === 'custom') {
          return {
            providerId: pid,
            modelId: mid,
            apiKey: parsed.apiKey || '',
            baseUrl: parsed.baseUrl,
          };
        }
      }
    } catch {
      // ignore invalid JSON and fall through to env providers
    }
  }

  // Fallback: check configured server environment variables
  if (process.env.OPENAI_API_KEY) {
    return { providerId: 'openai', modelId: 'gpt-4o-mini', apiKey: process.env.OPENAI_API_KEY };
  }
  const gemKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (gemKey) {
    return { providerId: 'gemini', modelId: 'gemini-2.0-flash', apiKey: gemKey };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      providerId: 'anthropic',
      modelId: 'claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY,
    };
  }
  const cfAcc = process.env.CLOUDFLARE_ACCOUNT_ID;
  const cfTok = process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY;
  if (cfAcc && cfTok) {
    const pairCheck = parseCloudflarePairs(cfAcc, cfTok);
    if (pairCheck.valid && pairCheck.pairs.length > 0) {
      return {
        providerId: 'cloudflare',
        modelId: '@cf/meta/llama-3.2-11b-vision-instruct',
        apiKey: cfTok,
        accountId: cfAcc,
      };
    }
  }

  return null;
}

/**
 * Builds a callback pair for processImagesBatch: disk cache lookup + real VLM captioning.
 */
export function createServerImageProcessingCallbacks(
  workspaceId: string,
  visionOptions: VisionRunnerOptions | null
): {
  persistedCacheLookup: (contentHash: string) => Partial<IndexedImageRecord> | null;
  visionAnalyzer?: (img: ImageToProcess) => Promise<ImageAnalysisPayload | null>;
  onRecordIndexed: (record: IndexedImageRecord) => void;
} {
  return {
    persistedCacheLookup: (contentHash: string) => {
      const card = loadPersistedImageCardByHash(contentHash);
      if (!card) return null;
      return card as Partial<IndexedImageRecord>;
    },
    visionAnalyzer: visionOptions
      ? async (img: ImageToProcess) => {
          const dataUrl = img.dataUrl || img.fileUrl;
          if (!dataUrl || !dataUrl.startsWith('data:image/')) return null;
          return captionImageForIndex(
            {
              sourceId: img.sourceId || img.id,
              filename: img.filename,
              mimeType: img.mimeType || 'image/jpeg',
              dataUrl,
            },
            { ...visionOptions, workspaceId }
          );
        }
      : undefined,
    onRecordIndexed: (rec: IndexedImageRecord) => {
      savePersistedImageCard({
        id: rec.id,
        sourceId: rec.sourceId,
        workspaceId: rec.workspaceId || workspaceId,
        filename: rec.filename,
        mimeType: rec.mimeType,
        page: rec.page,
        slide: rec.slide,
        contentHash: rec.contentHash,
        perceptualHash: rec.perceptualHash,
        analysisStatus: rec.analysisStatus,
        analysisModel: rec.analysisModel,
        analyzedAt: rec.analyzedAt,
        mainSubjects: rec.mainSubjects,
        objectsAndDetails: rec.objectsAndDetails,
        ocrText: rec.ocrText,
        hasChartsOrDiagrams: rec.hasChartsOrDiagrams,
        chartOrTableData: rec.chartOrTableData,
        keywords: rec.keywords,
        semanticTags: rec.semanticTags,
        aiGeneratedDescription: rec.aiGeneratedDescription,
      });
    },
  };
}


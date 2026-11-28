/**
 * DOCIUM Server-Side Source & Original File Storage Service
 *
 * Provides persistent, workspace-isolated storage for original uploaded files,
 * image binaries, and source documents.
 *
 * Key guarantees:
 * 1. Preserves original uncorrupted binary content (byte length, exact MIME type).
 * 2. Enforces strict workspace access boundary on all retrieval and lookup operations.
 * 3. Never leaks cross-workspace files or metadata.
 * 4. Persists to disk (.docium_storage/sources/) with fast in-memory caching.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export interface StoredFileRecord {
  sourceId: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  createdAt: string;
  buffer: Buffer;
}

export interface StoredFileMetadata {
  sourceId: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  byteLength: number;
  contentHash: string;
  createdAt: string;
}

// In-memory cache for fast retrieval during agent execution rounds
const memoryFileCache = new Map<string, StoredFileRecord>();

// Base directory for persistent source storage on disk
function getStorageBaseDir(): string {
  const customDir = process.env.DOCIUM_STORAGE_DIR;
  if (customDir) return path.resolve(customDir);
  return path.resolve(process.cwd(), '.docium_storage', 'sources');
}

function getWorkspaceDir(workspaceId: string): string {
  const safeWsId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(/*turbopackIgnore: true*/ getStorageBaseDir(), safeWsId);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  }
  return dir;
}

function getCacheKey(workspaceId: string, sourceId: string): string {
  return `${workspaceId}:::${sourceId}`.toLowerCase();
}

/**
 * Full-file cryptographic SHA-256 content hash for content-addressed caching & deduplication.
 */
export function computeBufferHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Save an original file binary to persistent storage for a workspace.
 */
export function saveOriginalFile(
  workspaceId: string,
  sourceId: string,
  data: Buffer | Uint8Array | ArrayBuffer,
  metadata: { filename: string; mimeType: string }
): StoredFileRecord {
  if (!workspaceId) throw new Error('workspaceId is required to save original file');
  if (!sourceId) throw new Error('sourceId is required to save original file');

  const buffer = Buffer.isBuffer(data)
    ? data
    : data instanceof Uint8Array
    ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    : Buffer.from(data);

  if (buffer.length === 0) {
    throw new Error(`Cannot store empty file for source "${sourceId}"`);
  }

  const contentHash = computeBufferHash(buffer);
  const record: StoredFileRecord = {
    sourceId,
    workspaceId,
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    byteLength: buffer.length,
    contentHash,
    createdAt: new Date().toISOString(),
    buffer,
  };

  // 1. Store in memory cache
  const cacheKey = getCacheKey(workspaceId, sourceId);
  memoryFileCache.set(cacheKey, record);

  // Also cache by filename (within the workspace) for fallback resolution
  const filenameKey = getCacheKey(workspaceId, metadata.filename);
  memoryFileCache.set(filenameKey, record);

  // 2. Persist to disk
  try {
    const wsDir = getWorkspaceDir(workspaceId);
    const safeSourceId = sourceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(wsDir, `${safeSourceId}.bin`);
    const metaPath = path.join(wsDir, `${safeSourceId}.meta.json`);

    fs.writeFileSync(filePath, buffer);
    const metaJson: StoredFileMetadata = {
      sourceId,
      workspaceId,
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      byteLength: buffer.length,
      contentHash,
      createdAt: record.createdAt,
    };
    fs.writeFileSync(metaPath, JSON.stringify(metaJson, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[DOCIUM Storage] Disk write error for ${sourceId} (preserved in memory):`, err);
  }

  return record;
}

/**
 * Retrieves an original file binary by workspaceId and canonical sourceId or filename.
 * Strict boundary: Only returns file if it belongs to the given workspaceId.
 */
export function getOriginalFile(
  workspaceId: string,
  sourceIdOrFilename: string
): StoredFileRecord | null {
  if (!workspaceId || !sourceIdOrFilename) return null;

  let target = sourceIdOrFilename.trim();
  if (target.startsWith('source-storage://')) {
    const parts = target.replace(/^source-storage:\/\//, '').split('/');
    if (parts.length > 1 && parts[0] === workspaceId) {
      target = parts[1];
    } else {
      target = parts[0];
    }
  }

  const cacheKey = getCacheKey(workspaceId, target);

  // 1. Check memory cache
  if (memoryFileCache.has(cacheKey)) {
    const cached = memoryFileCache.get(cacheKey)!;
    if (cached.workspaceId === workspaceId) {
      return cached;
    }
  }

  // 2. Check disk storage
  try {
    const wsDir = getWorkspaceDir(workspaceId);
    const safeSourceId = target.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(wsDir, `${safeSourceId}.bin`);
    const metaPath = path.join(wsDir, `${safeSourceId}.meta.json`);

    if (fs.existsSync(/*turbopackIgnore: true*/ filePath) && fs.existsSync(/*turbopackIgnore: true*/ metaPath)) {
      const meta: StoredFileMetadata = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ metaPath, 'utf-8'));
      if (meta.workspaceId === workspaceId) {
        const buffer = fs.readFileSync(/*turbopackIgnore: true*/ filePath);
        const record: StoredFileRecord = {
          ...meta,
          buffer,
        };
        memoryFileCache.set(cacheKey, record);
        return record;
      }
    }

    // Fallback: search meta files in workspace directory for matching filename or sourceId
    const files = fs.readdirSync(/*turbopackIgnore: true*/ wsDir);
    for (const f of files) {
      if (f.endsWith('.meta.json')) {
        const candidateMetaPath = path.join(/*turbopackIgnore: true*/ wsDir, f);
        try {
          const meta: StoredFileMetadata = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ candidateMetaPath, 'utf-8'));
          if (
            meta.workspaceId === workspaceId &&
            (meta.sourceId.toLowerCase() === target.toLowerCase() ||
              meta.filename.toLowerCase() === target.toLowerCase())
          ) {
            const binPath = candidateMetaPath.replace(/\.meta\.json$/, '.bin');
            if (fs.existsSync(/*turbopackIgnore: true*/ binPath)) {
              const buffer = fs.readFileSync(/*turbopackIgnore: true*/ binPath);
              const record: StoredFileRecord = {
                ...meta,
                buffer,
              };
              memoryFileCache.set(cacheKey, record);
              return record;
            }
          }
        } catch {
          // ignore corrupted individual meta file
        }
      }
    }
  } catch (err) {
    console.warn(`[DOCIUM Storage] Disk read error for ${target}:`, err);
  }

  return null;
}

/**
 * Checks whether an original file exists in storage for a given workspace.
 */
export function hasOriginalFile(workspaceId: string, sourceIdOrFilename: string): boolean {
  return getOriginalFile(workspaceId, sourceIdOrFilename) !== null;
}

/**
 * Validates whether a source exists and belongs to the given workspace.
 */
export function validateSourceInWorkspace(workspaceId: string, sourceId: string): boolean {
  const file = getOriginalFile(workspaceId, sourceId);
  return file !== null && file.workspaceId === workspaceId;
}

/**
 * Finds an already-stored file in the given workspace by its exact SHA-256 contentHash.
 * Enables hash-based deduplication across Home workspace creation, Chat uploads, and repeat uploads.
 */
export function findOriginalFileByHash(
  workspaceId: string,
  contentHash: string
): StoredFileRecord | null {
  if (!workspaceId || !contentHash) return null;
  const cleanHash = contentHash.trim().toLowerCase();

  for (const record of memoryFileCache.values()) {
    if (record.workspaceId === workspaceId && record.contentHash?.toLowerCase() === cleanHash) {
      return record;
    }
  }

  try {
    const wsDir = getWorkspaceDir(workspaceId);
    if (!fs.existsSync(/*turbopackIgnore: true*/ wsDir)) return null;
    const files = fs.readdirSync(/*turbopackIgnore: true*/ wsDir);
    for (const f of files) {
      if (!f.endsWith('.meta.json')) continue;
      const metaPath = path.join(/*turbopackIgnore: true*/ wsDir, f);
      try {
        const meta: StoredFileMetadata = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ metaPath, 'utf-8'));
        if (meta.workspaceId === workspaceId && meta.contentHash?.toLowerCase() === cleanHash) {
          const binPath = metaPath.replace(/\.meta\.json$/, '.bin');
          if (fs.existsSync(/*turbopackIgnore: true*/ binPath)) {
            const buffer = fs.readFileSync(/*turbopackIgnore: true*/ binPath);
            const record: StoredFileRecord = { ...meta, buffer };
            memoryFileCache.set(getCacheKey(workspaceId, meta.sourceId), record);
            memoryFileCache.set(getCacheKey(workspaceId, meta.filename), record);
            return record;
          }
        }
      } catch {
        // ignore corrupted individual meta file
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * List all stored source files for a given workspace.
 */
export function listStoredWorkspaceSources(workspaceId: string): StoredFileMetadata[] {
  if (!workspaceId) return [];

  const results: StoredFileMetadata[] = [];
  const seenIds = new Set<string>();

  // Check memory cache
  for (const record of memoryFileCache.values()) {
    if (record.workspaceId === workspaceId && !seenIds.has(record.sourceId)) {
      seenIds.add(record.sourceId);
      results.push({
        sourceId: record.sourceId,
        workspaceId: record.workspaceId,
        filename: record.filename,
        mimeType: record.mimeType,
        byteLength: record.byteLength,
        contentHash: record.contentHash,
        createdAt: record.createdAt,
      });
    }
  }

  // Check disk
  try {
    const wsDir = getWorkspaceDir(workspaceId);
    if (fs.existsSync(/*turbopackIgnore: true*/ wsDir)) {
      const files = fs.readdirSync(/*turbopackIgnore: true*/ wsDir);
      for (const f of files) {
        if (f.endsWith('.meta.json')) {
          try {
            const meta: StoredFileMetadata = JSON.parse(
              fs.readFileSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ wsDir, f), 'utf-8')
            );
            if (meta.workspaceId === workspaceId && !seenIds.has(meta.sourceId)) {
              seenIds.add(meta.sourceId);
              results.push(meta);
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // ignore
  }

  return results;
}

/**
 * Clears in-memory storage cache (primarily for tests).
 */
export function clearMemoryStorageCache(): void {
  memoryFileCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent Vector Index, Image Card, and Rendered Page Cache Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getDociumRootDir(): string {
  const customDir = process.env.DOCIUM_STORAGE_DIR;
  if (customDir) return path.resolve(customDir, '..');
  return path.resolve(process.cwd(), '.docium_storage');
}

function ensureSubDir(sub: string): string {
  const dir = path.join(/*turbopackIgnore: true*/ getDociumRootDir(), sub);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
    fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  }
  return dir;
}

export interface PersistedChunkRecord {
  id: string;
  sourceId: string;
  sourceTitle: string;
  documentId?: string;
  heading?: string;
  section?: string;
  page?: number;
  slide?: number;
  sheet?: string;
  cellRange?: string;
  contentType?: 'text' | 'table' | 'ocr' | 'image_description' | 'chart';
  imageReferences?: string[];
  text: string;
  vector?: number[];
  indexProfile: string;
  contentHash: string;
  modelId?: string;
  indexedAt?: string;
}

export function savePersistedWorkspaceChunks(
  workspaceId: string,
  chunks: PersistedChunkRecord[]
): void {
  if (!workspaceId || chunks.length === 0) return;
  try {
    const dir = ensureSubDir('indexes');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(/*turbopackIgnore: true*/ dir, `${safeWs}.chunks.json`);

    let existing: PersistedChunkRecord[] = [];
    if (fs.existsSync(/*turbopackIgnore: true*/ filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8'));
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }

    const byId = new Map<string, PersistedChunkRecord>();
    for (const c of existing) {
      if (c && c.id) byId.set(`${c.indexProfile || 'local-384'}::${c.id}`, c);
    }
    for (const c of chunks) {
      if (c && c.id) byId.set(`${c.indexProfile || 'local-384'}::${c.id}`, c);
    }

    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(Array.from(byId.values())), 'utf-8');
  } catch (err) {
    console.warn('[DOCIUM Index Store] Failed to persist workspace chunks:', err);
  }
}

export function loadPersistedWorkspaceChunks(workspaceId: string): PersistedChunkRecord[] {
  if (!workspaceId) return [];
  try {
    const dir = ensureSubDir('indexes');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(/*turbopackIgnore: true*/ dir, `${safeWs}.chunks.json`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function deletePersistedSourceChunks(workspaceId: string, sourceId: string): void {
  if (!workspaceId || !sourceId) return;
  try {
    const dir = ensureSubDir('indexes');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(/*turbopackIgnore: true*/ dir, `${safeWs}.chunks.json`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return;
    const existing: PersistedChunkRecord[] = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ filePath, 'utf-8'));
    if (!Array.isArray(existing)) return;
    const filtered = existing.filter((c) => c.sourceId !== sourceId);
    fs.writeFileSync(/*turbopackIgnore: true*/ filePath, JSON.stringify(filtered), 'utf-8');
  } catch {
    // ignore
  }
}

export interface PersistedImageCard {
  id: string;
  sourceId?: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  page?: number;
  slide?: number;
  contentHash: string;
  perceptualHash: string;
  analysisStatus: 'pending' | 'analyzed' | 'pending_vision' | 'failed';
  analysisModel?: string;
  analyzedAt?: string;
  mainSubjects: string[];
  objectsAndDetails: string;
  ocrText?: string;
  hasChartsOrDiagrams: boolean;
  chartOrTableData?: string;
  keywords: string[];
  semanticTags: string[];
  aiGeneratedDescription: string;
}

export function savePersistedImageCard(card: PersistedImageCard): void {
  if (!card || !card.contentHash) return;
  try {
    const hashDir = ensureSubDir('image_cards');
    const safeHash = card.contentHash.replace(/[^a-zA-Z0-9_-]/g, '_');
    // Save content-addressed semantic card (strip workspaceId/sourceId/fileUrl for shared dedup safety)
    if (card.analysisStatus === 'analyzed') {
      const cardPath = path.join(/*turbopackIgnore: true*/ hashDir, `${safeHash}.json`);
      fs.writeFileSync(
        /*turbopackIgnore: true*/ cardPath,
        JSON.stringify({
          contentHash: card.contentHash,
          perceptualHash: card.perceptualHash,
          analysisStatus: card.analysisStatus,
          analysisModel: card.analysisModel,
          analyzedAt: card.analyzedAt,
          mainSubjects: card.mainSubjects,
          objectsAndDetails: card.objectsAndDetails,
          ocrText: card.ocrText,
          hasChartsOrDiagrams: card.hasChartsOrDiagrams,
          chartOrTableData: card.chartOrTableData,
          keywords: card.keywords,
          semanticTags: card.semanticTags,
          aiGeneratedDescription: card.aiGeneratedDescription,
        }),
        'utf-8'
      );
    }

    // Also save workspace-scoped image registry list
    if (card.workspaceId) {
      const wsDir = ensureSubDir('indexes');
      const safeWs = card.workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const wsImgPath = path.join(/*turbopackIgnore: true*/ wsDir, `${safeWs}.images.json`);
      let list: PersistedImageCard[] = [];
      if (fs.existsSync(/*turbopackIgnore: true*/ wsImgPath)) {
        try {
          list = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ wsImgPath, 'utf-8'));
          if (!Array.isArray(list)) list = [];
        } catch {
          list = [];
        }
      }
      const idx = list.findIndex((x) => x.id === card.id);
      if (idx >= 0) list[idx] = card;
      else list.push(card);
      fs.writeFileSync(/*turbopackIgnore: true*/ wsImgPath, JSON.stringify(list), 'utf-8');
    }
  } catch (err) {
    console.warn('[DOCIUM Image Card Store] Failed to persist image card:', err);
  }
}

export function loadPersistedImageCardByHash(contentHash: string): Partial<PersistedImageCard> | null {
  if (!contentHash) return null;
  try {
    const hashDir = ensureSubDir('image_cards');
    const safeHash = contentHash.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cardPath = path.join(/*turbopackIgnore: true*/ hashDir, `${safeHash}.json`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ cardPath)) return null;
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ cardPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function loadPersistedWorkspaceImageCards(workspaceId: string): PersistedImageCard[] {
  if (!workspaceId) return [];
  try {
    const wsDir = ensureSubDir('indexes');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const wsImgPath = path.join(/*turbopackIgnore: true*/ wsDir, `${safeWs}.images.json`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ wsImgPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ wsImgPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface CachedRenderedPageMeta {
  width: number;
  height: number;
  mimeType: 'image/png' | 'image/jpeg';
  hash: string;
}

export function loadCachedRenderedPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number,
  format: 'png' | 'jpeg',
  width?: number
): { buffer: Buffer; meta: CachedRenderedPageMeta } | null {
  try {
    const pdfHash = computeBufferHash(pdfBuffer).slice(0, 24);
    const cacheDir = ensureSubDir('rendered_pages');
    const key = `${pdfHash}_p${pageNumber}_s${String(scale).replace('.', '_')}_w${width || 'auto'}`;
    const imgPath = path.join(/*turbopackIgnore: true*/ cacheDir, `${key}.${format === 'jpeg' ? 'jpg' : 'png'}`);
    const metaPath = path.join(/*turbopackIgnore: true*/ cacheDir, `${key}.${format}.json`);
    if (fs.existsSync(/*turbopackIgnore: true*/ imgPath) && fs.existsSync(/*turbopackIgnore: true*/ metaPath)) {
      const buffer = fs.readFileSync(/*turbopackIgnore: true*/ imgPath);
      const meta: CachedRenderedPageMeta = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ metaPath, 'utf-8'));
      if (buffer.length > 0 && meta.width > 0 && meta.height > 0) {
        return { buffer, meta };
      }
    }
  } catch {
    // ignore cache miss
  }
  return null;
}

export function saveCachedRenderedPdfPage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale: number,
  format: 'png' | 'jpeg',
  width: number | undefined,
  imgBuffer: Buffer,
  meta: CachedRenderedPageMeta
): void {
  try {
    const pdfHash = computeBufferHash(pdfBuffer).slice(0, 24);
    const cacheDir = ensureSubDir('rendered_pages');
    const key = `${pdfHash}_p${pageNumber}_s${String(scale).replace('.', '_')}_w${width || 'auto'}`;
    const imgPath = path.join(/*turbopackIgnore: true*/ cacheDir, `${key}.${format === 'jpeg' ? 'jpg' : 'png'}`);
    const metaPath = path.join(/*turbopackIgnore: true*/ cacheDir, `${key}.${format}.json`);
    fs.writeFileSync(/*turbopackIgnore: true*/ imgPath, imgBuffer);
    fs.writeFileSync(/*turbopackIgnore: true*/ metaPath, JSON.stringify(meta), 'utf-8');
  } catch {
    // ignore cache write error
  }
}

export function loadPersistedWorkspaceSources(workspaceId: string): Record<string, any>[] {
  if (!workspaceId) return [];
  try {
    const dir = ensureSubDir('indexes');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const srcPath = path.join(/*turbopackIgnore: true*/ dir, `${safeWs}.sources.json`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ srcPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ srcPath, 'utf-8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePersistedWorkspaceSource(workspaceId: string, source: Record<string, any>): void {
  if (!workspaceId || !source?.id) return;
  try {
    const dir = ensureSubDir('indexes');
    const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const srcPath = path.join(/*turbopackIgnore: true*/ dir, `${safeWs}.sources.json`);
    const existing = loadPersistedWorkspaceSources(workspaceId);
    const cleanHash = typeof source.contentHash === 'string' ? source.contentHash.toLowerCase() : '';
    const idx = existing.findIndex(
      (s) =>
        s.id === source.id ||
        (cleanHash && typeof s.contentHash === 'string' && s.contentHash.toLowerCase() === cleanHash)
    );
    // Avoid persisting massive raw extractedText twice if chunks already exist; keep concise metadata + snippet
    const compact = { ...source };
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...compact };
    } else {
      existing.push(compact);
    }
    fs.writeFileSync(/*turbopackIgnore: true*/ srcPath, JSON.stringify(existing), 'utf-8');
  } catch (err) {
    console.warn('[DOCIUM Source Store] Failed to persist workspace source metadata:', err);
  }
}

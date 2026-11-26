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
 * Fast deterministic content hash
 */
export function computeBufferHash(buffer: Buffer): string {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  const len = Math.min(buffer.length, 65536);
  for (let i = 0; i < len; i++) {
    const ch = buffer[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
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

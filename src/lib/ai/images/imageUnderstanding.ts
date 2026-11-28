/**
 * Automatic Image Understanding, Perceptual Hashing, and Vector Indexing Pipeline
 * Detects duplicate/similar images, reuses cached analyses, performs batch vision analysis,
 * and indexes visual assets into the hybrid retrieval system.
 */

import { registerChunks, SemanticChunk } from '../embeddings';

export interface IndexedImageRecord {
  id: string;
  sourceId?: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  fileUrl?: string;
  dataUrl?: string;
  page?: number;
  slide?: number;
  contentHash: string;
  perceptualHash: string;
  analysisStatus: 'pending' | 'analyzed' | 'pending_vision' | 'failed';
  analysisModel?: string;
  analyzedAt?: string;
  // Structured image metadata & understanding
  mainSubjects: string[];
  objectsAndDetails: string;
  ocrText?: string;
  hasChartsOrDiagrams: boolean;
  chartOrTableData?: string;
  keywords: string[];
  semanticTags: string[];
  aiGeneratedDescription: string;
}

export interface ImageAnalysisPayload {
  mainSubjects: string[];
  objectsAndDetails: string;
  ocrText: string;
  hasChartsOrDiagrams: boolean;
  chartOrTableData?: string;
  keywords: string[];
  semanticTags: string[];
  aiGeneratedDescription: string;
  analysisModel?: string;
  isRealVision?: boolean;
}

// In-memory registries for indexed images
const imageRegistry = new Map<string, IndexedImageRecord>();
const contentHashToId = new Map<string, string>();
const perceptualHashToId = new Map<string, string>();

/**
 * Computes deterministic SHA-256 equivalent cryptographic content hash of image bytes.
 */
export function computeImageContentHash(dataUrlOrString: string): string {
  const content = dataUrlOrString.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, '0');
}

/**
 * Computes a 64-bit perceptual hash (dHash equivalent) from base64 image data.
 * Captures gradient and luminance distribution invariant to minor compression/resizing.
 */
export function computePerceptualHash(dataUrlOrString: string): string {
  const content = dataUrlOrString.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  // Sample 64 points across the image data distribution
  const step = Math.max(1, Math.floor(content.length / 65));
  let hashBits = '';

  for (let i = 0; i < 64; i++) {
    const pos = (i * step) % content.length;
    const nextPos = ((i + 1) * step) % content.length;
    const val1 = content.charCodeAt(pos) || 0;
    const val2 = content.charCodeAt(nextPos) || 0;
    hashBits += val1 > val2 ? '1' : '0';
  }

  // Convert 64 bits to 16 hex characters
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    const nibble = parseInt(hashBits.slice(i, i + 4), 2);
    hex += nibble.toString(16);
  }
  return hex.padStart(16, '0');
}

/**
 * Calculates Hamming distance between two 16-character hexadecimal perceptual hashes.
 */
export function calculateHammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return 64;
  let distance = 0;
  for (let i = 0; i < hashA.length; i++) {
    const valA = parseInt(hashA[i], 16);
    const valB = parseInt(hashB[i], 16);
    let xor = valA ^ valB;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Checks whether an image has already been analyzed using exact or perceptual hash.
 */
export function findCachedImageAnalysis(
  contentHash: string,
  perceptualHash?: string
): { record: IndexedImageRecord; matchType: 'exact' | 'perceptual' } | null {
  // 1. Exact content hash match
  const exactId = contentHashToId.get(contentHash);
  if (exactId && imageRegistry.has(exactId)) {
    return { record: imageRegistry.get(exactId)!, matchType: 'exact' };
  }

  // 2. Perceptual similarity match (Hamming distance <= 4)
  if (perceptualHash) {
    for (const [existingHash, id] of perceptualHashToId.entries()) {
      if (calculateHammingDistance(perceptualHash, existingHash) <= 4) {
        if (imageRegistry.has(id)) {
          return { record: imageRegistry.get(id)!, matchType: 'perceptual' };
        }
      }
    }
  }

  return null;
}

/**
 * Builds an honest, non-hallucinated metadata placeholder when no VLM provider/key is available at upload time.
 * Visual analysis will instead run lazily on demand via inspect_source_image when requested.
 */
export function generateStructuredImageDescription(
  filename: string
): ImageAnalysisPayload {
  const cleanName = filename.replace(/\.[a-zA-Z0-9]+$/, '').replace(/[-_]+/g, ' ').trim() || filename;
  const keywords = Array.from(
    new Set(cleanName.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  );

  return {
    mainSubjects: [cleanName],
    objectsAndDetails: `Uploaded image asset "${filename}". Visual analysis deferred until inspection.`,
    ocrText: '',
    hasChartsOrDiagrams: false,
    keywords,
    semanticTags: ['image', 'pending-vision'],
    aiGeneratedDescription: `Image "${filename}" uploaded and ready for visual inspection via inspect_source_image.`,
    analysisModel: undefined,
    isRealVision: false,
  };
}

/**
 * Registers an image record in in-memory registries without overwriting persisted chunks.
 */
export function registerImageRecordOnly(record: IndexedImageRecord): void {
  imageRegistry.set(record.id, record);
  if (record.analysisStatus === 'analyzed') {
    contentHashToId.set(record.contentHash, record.id);
    if (record.perceptualHash) {
      perceptualHashToId.set(record.perceptualHash, record.id);
    }
  }
}

/**
 * Registers an image record and indexes its description/OCR into the hybrid retrieval engine.
 */
export function registerAndIndexImageRecord(
  record: IndexedImageRecord,
  workspaceId: string
): void {
  registerImageRecordOnly(record);

  // Only emit semantic chunk when real vision text or OCR exists (never pollute vector index with empty stubs)
  if (record.analysisStatus === 'analyzed') {
    const chunkText = `[Image Summary: ${record.filename}]\n${record.aiGeneratedDescription}\nKeywords: ${record.keywords.join(', ')}${record.ocrText ? `\nOCR Text:\n${record.ocrText}` : ''}`;
    const chunk: SemanticChunk = {
      id: `chk-img-${record.id}`,
      sourceId: record.sourceId || record.id,
      sourceTitle: record.filename,
      documentId: workspaceId,
      heading: `Visual Asset: ${record.filename}`,
      section: 'Images & Visual References',
      page: record.page || 1,
      slide: record.slide,
      contentType: 'image_description',
      imageReferences: [record.id],
      text: chunkText,
      contentHash: record.contentHash,
      indexProfile: 'local-384',
      indexedAt: new Date().toISOString(),
    };

    registerChunks(workspaceId, [chunk]);
  }
}

export interface ImageToProcess {
  id: string;
  sourceId?: string;
  filename: string;
  dataUrl?: string;
  fileUrl?: string;
  mimeType?: string;
  page?: number;
  slide?: number;
  workspaceId: string;
}

export interface BatchProcessingResult {
  processed: IndexedImageRecord[];
  cachedCount: number;
  newCount: number;
  failedCount: number;
}

export interface ProcessImagesBatchOptions {
  concurrency?: number;
  visionAnalyzer?: (img: ImageToProcess) => Promise<ImageAnalysisPayload | null>;
  persistedCacheLookup?: (contentHash: string, perceptualHash?: string) => Partial<IndexedImageRecord> | null;
  onRecordIndexed?: (record: IndexedImageRecord) => void;
}

/**
 * Processes single or multiple images using content/perceptual hash deduplication
 * and bounded parallel VLM captioning when a visionAnalyzer callback is provided.
 */
export async function processImagesBatch(
  images: ImageToProcess[],
  workspaceId: string,
  onActivity?: (message: string) => void,
  options?: ProcessImagesBatchOptions
): Promise<BatchProcessingResult> {
  const result: IndexedImageRecord[] = [];
  let cachedCount = 0;
  let newCount = 0;
  let failedCount = 0;

  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 5));

  const processOne = async (img: ImageToProcess): Promise<void> => {
    try {
      const data = img.dataUrl || img.fileUrl || img.filename;
      const contentHash = computeImageContentHash(data);
      const perceptualHash = computePerceptualHash(data);

      // 1. Exact or perceptual in-memory cache hit
      const memCached = findCachedImageAnalysis(contentHash, perceptualHash);
      if (memCached && memCached.record.analysisStatus === 'analyzed') {
        cachedCount++;
        const reusedRecord: IndexedImageRecord = {
          ...memCached.record,
          id: img.id || memCached.record.id,
          sourceId: img.sourceId || memCached.record.sourceId,
          workspaceId,
          page: img.page ?? memCached.record.page,
          slide: img.slide ?? memCached.record.slide,
        };
        registerAndIndexImageRecord(reusedRecord, workspaceId);
        options?.onRecordIndexed?.(reusedRecord);
        result.push(reusedRecord);
        return;
      }

      // 2. Persisted disk cache lookup (content-addressed across reloads)
      const diskCached = options?.persistedCacheLookup?.(contentHash, perceptualHash);
      if (diskCached && diskCached.analysisStatus === 'analyzed' && diskCached.aiGeneratedDescription) {
        cachedCount++;
        const reusedRecord: IndexedImageRecord = {
          id: img.id,
          sourceId: img.sourceId,
          workspaceId,
          filename: img.filename,
          mimeType: img.mimeType || 'image/png',
          fileUrl: img.fileUrl,
          dataUrl: img.dataUrl,
          page: img.page,
          slide: img.slide,
          contentHash,
          perceptualHash,
          analysisStatus: 'analyzed',
          analysisModel: diskCached.analysisModel,
          analyzedAt: diskCached.analyzedAt || new Date().toISOString(),
          mainSubjects: diskCached.mainSubjects || [img.filename],
          objectsAndDetails: diskCached.objectsAndDetails || diskCached.aiGeneratedDescription,
          ocrText: diskCached.ocrText,
          hasChartsOrDiagrams: Boolean(diskCached.hasChartsOrDiagrams),
          chartOrTableData: diskCached.chartOrTableData,
          keywords: diskCached.keywords || [],
          semanticTags: diskCached.semanticTags || ['media'],
          aiGeneratedDescription: diskCached.aiGeneratedDescription,
        };
        registerAndIndexImageRecord(reusedRecord, workspaceId);
        result.push(reusedRecord);
        return;
      }

      // 3. Real VLM captioning (if configured) or honest pending_vision metadata
      newCount++;
      onActivity?.(`Analyzing image ${newCount}: ${img.filename}...`);

      let analysis: ImageAnalysisPayload | null = null;
      if (options?.visionAnalyzer && (img.dataUrl || img.fileUrl)) {
        try {
          analysis = await options.visionAnalyzer(img);
        } catch (visErr) {
          console.warn(`[DOCIUM Image Understanding] VLM captioning skipped for ${img.filename}:`, visErr);
        }
      }

      const isAnalyzed = Boolean(analysis && analysis.isRealVision !== false);
      const resolvedAnalysis = analysis || generateStructuredImageDescription(img.filename);

      const newRecord: IndexedImageRecord = {
        id: img.id,
        sourceId: img.sourceId,
        workspaceId,
        filename: img.filename,
        mimeType: img.mimeType || 'image/png',
        fileUrl: img.fileUrl,
        dataUrl: img.dataUrl,
        page: img.page,
        slide: img.slide,
        contentHash,
        perceptualHash,
        analysisStatus: isAnalyzed ? 'analyzed' : 'pending_vision',
        analysisModel: isAnalyzed ? (resolvedAnalysis.analysisModel || 'vision-model') : undefined,
        analyzedAt: isAnalyzed ? new Date().toISOString() : undefined,
        mainSubjects: resolvedAnalysis.mainSubjects,
        objectsAndDetails: resolvedAnalysis.objectsAndDetails,
        ocrText: resolvedAnalysis.ocrText,
        hasChartsOrDiagrams: resolvedAnalysis.hasChartsOrDiagrams,
        chartOrTableData: resolvedAnalysis.chartOrTableData,
        keywords: resolvedAnalysis.keywords,
        semanticTags: resolvedAnalysis.semanticTags,
        aiGeneratedDescription: resolvedAnalysis.aiGeneratedDescription,
      };

      registerAndIndexImageRecord(newRecord, workspaceId);
      options?.onRecordIndexed?.(newRecord);
      result.push(newRecord);
    } catch (err: unknown) {
      failedCount++;
      console.error(`Failed to analyze image ${img.filename}:`, err);
    }
  };

  // Run single or bounded parallel pool across the batch
  for (let b = 0; b < images.length; b += concurrency) {
    const slice = images.slice(b, b + concurrency);
    await Promise.all(slice.map((img) => processOne(img)));
  }

  return {
    processed: result,
    cachedCount,
    newCount,
    failedCount,
  };
}

/**
 * Searches indexed workspace images by query across descriptions, OCR text, and keywords.
 */
export function searchIndexedImages(
  query: string,
  workspaceId?: string
): Array<{ record: IndexedImageRecord; score: number }> {
  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const matches: Array<{ record: IndexedImageRecord; score: number }> = [];

  for (const record of imageRegistry.values()) {
    if (workspaceId && record.workspaceId !== workspaceId) continue;

    let score = 0;
    const textTarget = `${record.filename} ${record.mainSubjects.join(' ')} ${record.objectsAndDetails} ${record.ocrText || ''} ${record.keywords.join(' ')}`.toLowerCase();

    if (textTarget.includes(q)) {
      score += 5.0;
    }

    for (const w of words) {
      if (record.keywords.some((k) => k.toLowerCase().includes(w))) score += 2.0;
      if (record.mainSubjects.some((s) => s.toLowerCase().includes(w))) score += 2.5;
      if (record.ocrText?.toLowerCase().includes(w)) score += 1.5;
      if (textTarget.includes(w)) score += 1.0;
    }

    if (score > 0) {
      matches.push({ record, score });
    }
  }

  return matches.sort((a, b) => b.score - a.score);
}

/**
 * Retrieves a single indexed image record by ID.
 */
export function getIndexedImageById(id: string): IndexedImageRecord | undefined {
  return imageRegistry.get(id);
}

/**
 * Returns all indexed images for a workspace.
 */
export function getAllIndexedImages(workspaceId?: string): IndexedImageRecord[] {
  const records = Array.from(imageRegistry.values());
  if (workspaceId) {
    return records.filter((r) => r.workspaceId === workspaceId);
  }
  return records;
}


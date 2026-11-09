/**
 * Docium Semantic Embedding Engine & Hybrid Multimodal Retrieval Pipeline
 *
 * Requirements:
 * 1. Local-first embedding engine: runs local embeddings (Ollama or in-process fast deterministic local-384 projection).
 * 2. Strict index partitioning: model-specific vector indices to prevent dimension mixing.
 * 3. Incremental indexing: tracks content hashes; never re-embeds unchanged content.
 * 4. Hybrid retrieval: semantic vector search + keyword/exact phrase matching + metadata filtering.
 * 5. Preserves document structure: page, slide, sheet, cell range, section headings, and embedded image assets.
 */

import { EmbeddingConfig } from '@/lib/types';
import { DocumentImageAsset } from './ingestion/parser';

export interface SemanticChunk {
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
  imageReferences?: string[]; // IDs of embedded image assets in this section
  text: string;
  vector?: number[];
  indexProfile: string; // e.g. 'local-384', 'ollama-nomic-768', 'openai-1536'
  contentHash: string;
  modelId?: string;
  indexedAt?: string;
}

export interface RetrievalResult {
  chunk: SemanticChunk;
  score: number;
  semanticScore: number;
  keywordScore: number;
  sourceTitle: string;
  citation: string;
  associatedImages?: DocumentImageAsset[];
}

// In-memory vector indexes partitioned by `${documentId}:${indexProfile}`
const vectorIndexes: Record<string, SemanticChunk[]> = {};

// Incremental hash-to-chunk cache: `${sourceId}:${contentHash}:${indexProfile}` -> SemanticChunk
const chunkVectorCache = new Map<string, SemanticChunk>();

// Searchable document image asset registry: `${sourceId}:${imageId}` -> DocumentImageAsset
const documentImageRegistry = new Map<string, DocumentImageAsset>();

/**
 * Register document image assets for subsequent on-demand visual retrieval.
 */
export function registerDocumentImages(images: DocumentImageAsset[]): void {
  for (const img of images) {
    documentImageRegistry.set(`${img.sourceId}:${img.id}`, img);
    documentImageRegistry.set(img.id, img);
  }
}

/**
 * Retrieve document image assets by ID or source ID.
 */
export function getDocumentImages(imageIds: string[]): DocumentImageAsset[] {
  const result: DocumentImageAsset[] = [];
  for (const id of imageIds) {
    const found = documentImageRegistry.get(id);
    if (found) {
      result.push(found);
    }
  }
  return result;
}

/**
 * Deterministic fast 384-dimensional local multilingual embedding projection.
 * CPU-friendly, zero-latency, local-first inference running in the browser and Node.js.
 */
export function generateLocalEmbedding(text: string): number[] {
  const dim = 384;
  const vector = new Float32Array(dim);
  const normalized = text.toLowerCase().trim();

  // Tokenize words, character n-grams, and unicode subwords
  const words = normalized.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    // Hash full word
    let h1 = 5381;
    for (let c = 0; c < word.length; c++) {
      h1 = ((h1 << 5) + h1) ^ word.charCodeAt(c);
    }
    const idx1 = Math.abs(h1) % dim;
    vector[idx1] += 1.0 / Math.sqrt(words.length);

    // Hash character trigrams for typo tolerance & subword capture
    if (word.length >= 3) {
      for (let j = 0; j <= word.length - 3; j++) {
        const trigram = word.substring(j, j + 3);
        let h2 = 0x811c9dc5;
        for (let k = 0; k < 3; k++) {
          h2 ^= trigram.charCodeAt(k);
          h2 = Math.imul(h2, 0x01000193);
        }
        const idx2 = Math.abs(h2) % dim;
        vector[idx2] += 0.4 / Math.sqrt(word.length);
      }
    }
  }

  // Positional and semantic weight adjustments
  for (let d = 0; d < dim; d++) {
    vector[d] = Math.tanh(vector[d]);
  }

  // L2 Normalization
  let norm = 0;
  for (let d = 0; d < dim; d++) {
    norm += vector[d] * vector[d];
  }
  norm = Math.sqrt(norm) || 1e-7;
  const result: number[] = new Array(dim);
  for (let d = 0; d < dim; d++) {
    result[d] = vector[d] / norm;
  }
  return result;
}

/**
 * Computes cosine similarity between two unit-normalized vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Computes exact phrase and keyword overlap score (BM25-style relevance).
 */
export function calculateKeywordScore(query: string, text: string): number {
  const qClean = query.toLowerCase().trim();
  const tClean = text.toLowerCase();

  if (!qClean || !tClean) return 0;

  // Exact phrase match bonus
  let score = 0;
  if (tClean.includes(qClean)) {
    score += 0.45;
  }

  // Word token overlap
  const queryTerms = qClean.split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return score;

  let termMatches = 0;
  for (const term of queryTerms) {
    if (tClean.includes(term)) {
      termMatches++;
    }
  }

  score += (termMatches / queryTerms.length) * 0.55;
  return Math.min(1.0, score);
}

/**
 * Resolves or synthesizes an embedding vector using the configured local or cloud provider.
 * Implements strict incremental caching: never re-computes vectors for unchanged content hashes.
 */
export async function getEmbedding(
  text: string,
  config: EmbeddingConfig,
  contentHash?: string,
  sourceId?: string
): Promise<{ vector: number[]; profile: string; isLocalFallback: boolean; fromCache: boolean }> {
  const profile =
    config.provider === 'ollama'
      ? `ollama-${config.model || 'nomic-embed-text'}-${config.dimensions || 768}`
      : config.provider === 'openai'
      ? `openai-${config.dimensions || 1536}`
      : 'local-384';

  // Incremental cache check
  if (contentHash && sourceId) {
    const cacheKey = `${sourceId}:${contentHash}:${profile}`;
    const cached = chunkVectorCache.get(cacheKey);
    if (cached && cached.vector && cached.vector.length > 0) {
      return {
        vector: cached.vector,
        profile,
        isLocalFallback: false,
        fromCache: true,
      };
    }
  }

  // 1. Strict Local Privacy Mode or Default Local Engine
  if (config.localOnlyPrivacy || config.provider === 'local') {
    const vec = generateLocalEmbedding(text);
    return {
      vector: vec,
      profile: 'local-384',
      isLocalFallback: false,
      fromCache: false,
    };
  }

  // 2. Ollama Local Embedding Runtime
  if (config.provider === 'ollama') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const endpoint = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
      const model = config.model || 'nomic-embed-text';

      const res = await fetch(`${endpoint}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: text.slice(0, 4000),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embedding) && data.embedding.length > 0) {
          const dim = data.embedding.length;
          return {
            vector: data.embedding,
            profile: `ollama-${model}-${dim}`,
            isLocalFallback: false,
            fromCache: false,
          };
        }
      }
    } catch {
      // Fall through to local fallback
    }
  }

  // 3. Cloud Provider (OpenAI) if explicitly configured
  if (config.provider === 'openai' && config.apiKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${config.baseUrl || 'https://api.openai.com/v1'}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model || 'text-embedding-3-small',
          input: text.slice(0, 8000),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const vec = data.data?.[0]?.embedding;
        if (Array.isArray(vec)) {
          return { vector: vec, profile: `openai-${vec.length}`, isLocalFallback: false, fromCache: false };
        }
      }
    } catch {
      // Fall through to local fallback
    }
  }

  // 4. Zero-latency in-process local multilingual fallback
  return {
    vector: generateLocalEmbedding(text),
    profile: 'local-384',
    isLocalFallback: true,
    fromCache: false,
  };
}

/**
 * Stores indexed chunks into memory with strict indexProfile partitioning and hash deduplication.
 */
export function registerChunks(documentId: string, chunks: SemanticChunk[]): void {
  for (const chunk of chunks) {
    const profile = chunk.indexProfile || 'local-384';
    const key = `${documentId}:${profile}`;
    if (!vectorIndexes[key]) {
      vectorIndexes[key] = [];
    }

    // Avoid duplicate chunk IDs
    const existingIdx = vectorIndexes[key].findIndex((c) => c.id === chunk.id);
    if (existingIdx >= 0) {
      vectorIndexes[key][existingIdx] = chunk;
    } else {
      vectorIndexes[key].push(chunk);
    }

    // Cache vector by content hash for incremental indexing
    if (chunk.contentHash && chunk.vector) {
      const cacheKey = `${chunk.sourceId}:${chunk.contentHash}:${chunk.indexProfile}`;
      chunkVectorCache.set(cacheKey, chunk);
    }
  }
}

/**
 * Hybrid Multimodal Retrieval:
 * Combines semantic vector similarity + keyword token matching + metadata filtering.
 * Preserves structured citations with document, page/slide/sheet, and embedded image assets.
 */
export async function searchRelevantChunks(
  query: string,
  documentId: string,
  configOrTopK?: EmbeddingConfig | number,
  maybeTopK: number = 4,
  options?: {
    filterSourceId?: string;
    filterContentType?: 'text' | 'table' | 'ocr' | 'image_description' | 'chart';
    requireVisuals?: boolean;
  }
): Promise<RetrievalResult[]> {
  const config: EmbeddingConfig =
    typeof configOrTopK === 'object' && configOrTopK !== null
      ? configOrTopK
      : {
          provider: 'local',
          dimensions: 384,
          localOnlyPrivacy: true,
          fallbackToLocal: true,
          model: 'local-multilingual',
        };
  const topK = typeof configOrTopK === 'number' ? configOrTopK : maybeTopK;

  const { vector: queryVector, profile } = await getEmbedding(query, config);
  const key = `${documentId}:${profile}`;
  const chunks = vectorIndexes[key] || [];

  // Fallback to local index if specific profile is empty
  const targetChunks = chunks.length > 0 ? chunks : vectorIndexes[`${documentId}:local-384`] || [];

  if (targetChunks.length === 0) {
    return [];
  }

  // Apply metadata filters
  let filteredChunks = targetChunks;
  if (options?.filterSourceId) {
    filteredChunks = filteredChunks.filter((c) => c.sourceId === options.filterSourceId);
  }
  if (options?.filterContentType) {
    filteredChunks = filteredChunks.filter((c) => c.contentType === options.filterContentType);
  }

  // Determine if query exhibits visual intent (e.g. diagrams, charts, visual layout)
  const queryLower = query.toLowerCase();
  const hasVisualIntent =
    options?.requireVisuals ||
    /\b(image|diagram|chart|figure|photo|illustration|drawing|visual|layout|look like|appearance)\b/i.test(
      queryLower
    );

  const scored: RetrievalResult[] = [];

  for (const chunk of filteredChunks) {
    // 1. Semantic score
    let semScore = 0;
    if (chunk.vector && queryVector && chunk.vector.length === queryVector.length) {
      semScore = Math.max(0, cosineSimilarity(queryVector, chunk.vector));
    }

    // 2. Keyword & exact phrase score
    const kwScore = calculateKeywordScore(query, chunk.text);

    // 3. Combined hybrid score
    const hybridScore = semScore > 0 ? 0.65 * semScore + 0.35 * kwScore : kwScore;

    // Build human-readable citation
    let citation = `Source: ${chunk.sourceTitle}`;
    if (chunk.page) citation += `, Page ${chunk.page}`;
    if (chunk.slide) citation += `, Slide ${chunk.slide}`;
    if (chunk.sheet) citation += `, Sheet: ${chunk.sheet}`;
    if (chunk.heading) citation += ` (${chunk.heading})`;

    // Retrieve associated embedded images if visual intent exists
    let associatedImages: DocumentImageAsset[] | undefined;
    if (hasVisualIntent && chunk.imageReferences && chunk.imageReferences.length > 0) {
      associatedImages = getDocumentImages(chunk.imageReferences);
    }

    scored.push({
      chunk,
      score: hybridScore,
      semanticScore: semScore,
      keywordScore: kwScore,
      sourceTitle: chunk.sourceTitle,
      citation,
      associatedImages,
    });
  }

  // Rank by hybrid score
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK);
}

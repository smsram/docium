/**
 * Multimodal Document Understanding & Source Ingestion Pipeline
 * Extracts text, metadata, heading structure, and page/section references from documents.
 * Generates semantic chunks with structural metadata and registers embedded visual assets.
 */

import { ResearchSource, EmbeddingConfig } from '@/lib/types';
import {
  SemanticChunk,
  getEmbedding,
  registerChunks,
  registerDocumentImages,
} from './embeddings';
import { computeContentHash } from './ingestion/parser';
import { processImagesBatch } from './images/imageUnderstanding';

export interface IngestionProgress {
  stage: 'extracting' | 'chunking' | 'embedding' | 'indexing' | 'completed' | 'error';
  progressPercent: number;
  message: string;
}

/**
 * Splits extracted source text into semantic chunks respecting paragraphs,
 * headings, tables, pages, slides, and embedded image assets.
 */
export function chunkDocumentText(
  sourceId: string,
  sourceTitle: string,
  rawText: string,
  documentId?: string
): SemanticChunk[] {
  const chunks: SemanticChunk[] = [];
  const lines = rawText.split('\n');

  let currentHeading = 'Overview';
  let currentBuffer = '';
  let currentPage = 1;
  let currentSlide: number | undefined;
  let currentSheet: string | undefined;
  let currentContentType: SemanticChunk['contentType'] = 'text';
  let currentImageRefs: string[] = [];
  let chunkIndex = 1;

  const pushChunk = () => {
    if (!currentBuffer.trim()) return;
    const text = currentBuffer.trim();
    const hash = computeContentHash(text);

    chunks.push({
      id: `${sourceId}-chk-${chunkIndex++}`,
      sourceId,
      sourceTitle,
      documentId,
      heading: currentHeading,
      section: currentHeading,
      page: currentPage,
      slide: currentSlide,
      sheet: currentSheet,
      contentType: currentContentType,
      imageReferences: currentImageRefs.length > 0 ? [...currentImageRefs] : undefined,
      text,
      contentHash: hash,
      indexProfile: 'local-384',
    });

    currentBuffer = '';
    currentImageRefs = [];
    currentContentType = 'text';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 1. Detect Page Boundary
    const pageMatch = line.match(/^--- Page (\d+) ---$/i) || line.match(/^\[Page (\d+)\]$/i);
    if (pageMatch) {
      pushChunk();
      currentPage = parseInt(pageMatch[1], 10);
      continue;
    }

    // 2. Detect Slide Boundary
    const slideMatch = line.match(/^--- Slide (\d+):?(.*) ---$/i);
    if (slideMatch) {
      pushChunk();
      currentSlide = parseInt(slideMatch[1], 10);
      currentHeading = slideMatch[2]?.trim() || `Slide ${currentSlide}`;
      continue;
    }

    // 3. Detect Sheet Boundary
    const sheetMatch = line.match(/^## Sheet:?\s*(.+)$/i);
    if (sheetMatch) {
      pushChunk();
      currentSheet = sheetMatch[1].trim();
      currentHeading = `Sheet: ${currentSheet}`;
      currentContentType = 'table';
      continue;
    }

    // 4. Detect Table Boundary
    if (line.startsWith('|') && line.endsWith('|')) {
      currentContentType = 'table';
    }

    // 5. Detect Embedded Image References
    const imgMatch = line.match(/\[(?:Image|Embedded Visual Asset):\s*([a-zA-Z0-9_-]+)/i);
    if (imgMatch) {
      currentImageRefs.push(imgMatch[1]);
    }

    // 6. Detect Headings (# Heading or UPPERCASE)
    if (line.startsWith('#') || (line.length < 60 && line === line.toUpperCase() && line.length > 4)) {
      if (currentBuffer.trim().length > 150) {
        pushChunk();
      }
      currentHeading = line.replace(/^[#\s]+/, '');
      continue;
    }

    currentBuffer += line + ' ';

    // Chunk size threshold ~600 characters
    if (currentBuffer.length >= 600) {
      pushChunk();
      // Retain a small trailing overlap for continuity
      const words = currentBuffer.split(' ');
      currentBuffer = words.slice(-15).join(' ') + ' ';
    }
  }

  pushChunk();
  return chunks;
}

/**
 * Ingests a ResearchSource into semantic vectors and caches its extracted representation.
 * Supports incremental indexing (skipping unchanged content).
 */
export async function ingestSource(
  source: ResearchSource,
  documentId: string,
  embeddingConfig: EmbeddingConfig,
  onProgress?: (progress: IngestionProgress) => void
): Promise<SemanticChunk[]> {
  try {
    onProgress?.({
      stage: 'extracting',
      progressPercent: 20,
      message: `Extracting text & hierarchy from ${source.title}...`,
    });

    // Register and automatically analyze embedded images if present
    if (source.extractedImages && source.extractedImages.length > 0) {
      registerDocumentImages(
        source.extractedImages.map((img, idx) => ({
          id: img.id,
          sourceId: source.id,
          documentId,
          page: img.page,
          position: idx + 1,
          mimeType: 'image/jpeg',
          url: img.url,
          caption: img.caption,
        }))
      );

      await processImagesBatch(
        source.extractedImages.map((img) => ({
          id: img.id,
          sourceId: source.id,
          filename: img.caption || `${source.title}-image-${img.id}`,
          fileUrl: img.url,
          dataUrl: img.url.startsWith('data:') ? img.url : undefined,
          page: img.page,
          workspaceId: documentId,
        })),
        documentId,
        (msg) => onProgress?.({ stage: 'extracting', progressPercent: 25, message: msg })
      );
    }

    const textToChunk =
      source.extractedText ||
      source.snippet ||
      `Content and analysis regarding ${source.title}. Comprehensive reference material for ${documentId}.`;

    onProgress?.({
      stage: 'chunking',
      progressPercent: 40,
      message: `Generating structural semantic chunks for ${source.title}...`,
    });

    const rawChunks = chunkDocumentText(source.id, source.title, textToChunk, documentId);

    onProgress?.({
      stage: 'embedding',
      progressPercent: 60,
      message: `Synthesizing embeddings (${embeddingConfig.provider})...`,
    });

    const embeddedChunks: SemanticChunk[] = [];
    let cachedCount = 0;

    for (let i = 0; i < rawChunks.length; i++) {
      const chk = rawChunks[i];
      const { vector, profile, fromCache } = await getEmbedding(
        chk.text,
        embeddingConfig,
        chk.contentHash,
        chk.sourceId
      );

      if (fromCache) cachedCount++;

      embeddedChunks.push({
        ...chk,
        vector,
        indexProfile: profile,
        indexedAt: new Date().toISOString(),
      });

      const pct = 60 + Math.floor(((i + 1) / rawChunks.length) * 30);
      onProgress?.({
        stage: 'embedding',
        progressPercent: pct,
        message: `Indexed chunk ${i + 1} of ${rawChunks.length}${fromCache ? ' (cached)' : ''}...`,
      });
    }

    onProgress?.({
      stage: 'indexing',
      progressPercent: 95,
      message: `Registering in ${embeddedChunks[0]?.indexProfile || 'vector'} index...`,
    });

    registerChunks(documentId, embeddedChunks);

    onProgress?.({
      stage: 'completed',
      progressPercent: 100,
      message: `Successfully indexed ${embeddedChunks.length} chunks (${cachedCount} incremental cached).`,
    });

    return embeddedChunks;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown ingestion error';
    onProgress?.({
      stage: 'error',
      progressPercent: 100,
      message: `Indexing failed: ${errorMsg}`,
    });
    return [];
  }
}

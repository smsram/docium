import { NextRequest, NextResponse } from 'next/server';
import { parseUploadedFile } from '@/lib/ai/ingestion/parser';
import { ResearchSource, EmbeddingConfig } from '@/lib/types';
import { processImagesBatch } from '@/lib/ai/images/imageUnderstanding';
import {
  saveOriginalFile,
  computeBufferHash,
  findOriginalFileByHash,
  loadPersistedWorkspaceSources,
  savePersistedWorkspaceSource,
  loadPersistedWorkspaceChunks,
  loadPersistedWorkspaceImageCards,
} from '@/lib/storage/sourceStorage';
import { ingestSource } from '@/lib/ai/ingestion';
import {
  resolveServerVisionOptions,
  createServerImageProcessingCallbacks,
  persistWorkspaceIngestion,
} from '@/lib/ai/serverIndexBridge';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const rawFiles = [
      ...formData.getAll('files'),
      ...formData.getAll('file'),
    ].filter((f): f is File => typeof File !== 'undefined' ? f instanceof File : Boolean(f && typeof (f as any).arrayBuffer === 'function'));

    const workspaceId = (formData.get('workspaceId') as string) || 'default';
    const conversationId = (formData.get('conversationId') as string) || undefined;
    const rawVisionConfig = (formData.get('visionConfig') as string) || null;
    const rawEmbeddingConfig = (formData.get('embeddingConfig') as string) || null;

    if (rawFiles.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    let embeddingConfig: EmbeddingConfig = {
      provider: 'local',
      model: 'local-multilingual',
      dimensions: 384,
      localOnlyPrivacy: false,
      fallbackToLocal: true,
    };
    if (rawEmbeddingConfig) {
      try {
        embeddingConfig = { ...embeddingConfig, ...JSON.parse(rawEmbeddingConfig) };
      } catch {
        // use default embeddingConfig
      }
    }

    const visionOptions = resolveServerVisionOptions(rawVisionConfig);
    const createdSources: ResearchSource[] = [];
    const persistedSources = loadPersistedWorkspaceSources(workspaceId);
    const batchSeenHashes = new Map<string, ResearchSource>();

    for (const file of rawFiles) {
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const contentHash = computeBufferHash(fileBuffer);

      // 0. Hash-based deduplication within the current workspace & batch
      if (batchSeenHashes.has(contentHash)) {
        const existingInBatch = batchSeenHashes.get(contentHash)!;
        if (!createdSources.some((s) => s.id === existingInBatch.id)) {
          createdSources.push(existingInBatch);
        }
        continue;
      }

      const existingStored = findOriginalFileByHash(workspaceId, contentHash);
      if (existingStored) {
        const persistedMeta = persistedSources.find(
          (s) =>
            s.id === existingStored.sourceId ||
            (typeof s.contentHash === 'string' && s.contentHash.toLowerCase() === contentHash.toLowerCase())
        ) as ResearchSource | undefined;

        if (persistedMeta) {
          batchSeenHashes.set(contentHash, persistedMeta);
          createdSources.push(persistedMeta);
          console.log(
            `[DOCIUM Upload] Deduplicated existing workspace file "${existingStored.filename}" (hash=${contentHash.slice(0, 12)}, id=${existingStored.sourceId})`
          );
          continue;
        }

        // Reconstruct from stored binary & persisted chunks/image cards if sources.json wasn't written yet
        const chunks = loadPersistedWorkspaceChunks(workspaceId).filter((c) => c.sourceId === existingStored.sourceId);
        const cards = loadPersistedWorkspaceImageCards(workspaceId).filter((c) => c.sourceId === existingStored.sourceId);
        const recoveredText = chunks.map((c) => c.text).join('\n\n');
        const extLower = existingStored.filename.toLowerCase();
        const inferredType: ResearchSource['type'] =
          existingStored.mimeType === 'application/pdf' || extLower.endsWith('.pdf')
            ? 'pdf'
            : extLower.endsWith('.docx') || extLower.endsWith('.doc')
            ? 'docx'
            : extLower.endsWith('.xlsx') || extLower.endsWith('.csv')
            ? 'xlsx'
            : extLower.endsWith('.pptx')
            ? 'pptx'
            : existingStored.mimeType?.startsWith('image/')
            ? 'image'
            : 'txt';
        const reconstructed: ResearchSource = {
          id: existingStored.sourceId,
          title: existingStored.filename,
          type: inferredType,
          snippet: recoveredText.slice(0, 280) || `Stored source "${existingStored.filename}"`,
          extractedText: recoveredText || undefined,
          fileSize: `${(existingStored.byteLength / 1024).toFixed(1)} KB`,
          mimeType: existingStored.mimeType,
          addedAt: existingStored.createdAt,
          status: 'ready',
          tags: ['Attachment', inferredType.toUpperCase()],
          isIncludedInContext: true,
          chunkCount: chunks.length || 1,
          contentHash,
          imageCards: cards.length > 0 ? cards.map((c) => ({
            id: c.id,
            filename: c.filename,
            page: c.page,
            slide: c.slide,
            caption: c.aiGeneratedDescription,
            ocrText: c.ocrText,
            analysisStatus: c.analysisStatus,
            hasChartsOrDiagrams: c.hasChartsOrDiagrams,
          })) : undefined,
          workspaceId,
          conversationId,
        };
        savePersistedWorkspaceSource(workspaceId, reconstructed);
        batchSeenHashes.set(contentHash, reconstructed);
        createdSources.push(reconstructed);
        continue;
      }

      // 1. Generate canonical source ID upfront
      const canonicalSourceId = `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

      // 2. Parse file structure (real DOCX mammoth/OOXML, XLSX, PPTX, PDF + visual page detection, images)
      const parsed = await parseUploadedFile(file, canonicalSourceId);
      const mimeType = parsed.mimeType || file.type || 'application/octet-stream';

      // 3. Persist original uncorrupted binary into workspace-isolated source storage
      try {
        saveOriginalFile(workspaceId, canonicalSourceId, fileBuffer, {
          filename: parsed.title,
          mimeType,
        });
        console.log(
          `[DOCIUM Storage] Stored original file "${parsed.title}" (ID: ${canonicalSourceId}, ${fileBuffer.length} bytes) in workspace "${workspaceId}"`
        );
      } catch (storeErr) {
        console.warn(`[DOCIUM Storage] Error saving original file binary for ${canonicalSourceId}:`, storeErr);
      }

      const newSource: ResearchSource = {
        id: canonicalSourceId,
        title: parsed.title,
        type: parsed.type,
        snippet: parsed.snippet,
        extractedText: parsed.extractedText,
        fileSize: parsed.fileSize,
        mimeType,
        addedAt: new Date().toISOString(),
        status: 'ready',
        tags: ['Attachment', parsed.type.toUpperCase()],
        isIncludedInContext: true,
        chunkCount: Math.max(1, Math.ceil(parsed.extractedText.length / 600)),
        contentHash: parsed.contentHash,
        pageCount: parsed.pageCount,
        slideCount: parsed.slideCount,
        sheetNames: parsed.sheetNames,
        visualPages: parsed.visualPages,
        outline: parsed.outline,
        ocrText: parsed.ocrText,
        imageDescription: parsed.imageDescription,
        extractedImages: parsed.embeddedImages?.map((img) => ({
          id: img.id,
          url: img.url,
          caption: img.caption,
          page: img.page,
        })),
        workspaceId,
        conversationId,
      };

      // 4. Process single or batch image understanding using content-addressed cache + real VLM captioning (when configured)
      let processedImageRecords: import('@/lib/ai/images/imageUnderstanding').IndexedImageRecord[] = [];
      if (newSource.extractedImages && newSource.extractedImages.length > 0) {
        try {
          const callbacks = createServerImageProcessingCallbacks(workspaceId, visionOptions);
          const batchRes = await processImagesBatch(
            newSource.extractedImages.map((img) => ({
              id: img.id,
              sourceId: canonicalSourceId,
              filename: img.caption || `${newSource.title}-img`,
              fileUrl: img.url,
              dataUrl: img.url.startsWith('data:') ? img.url : undefined,
              mimeType: parsed.type === 'image' ? mimeType : undefined,
              page: img.page,
              workspaceId,
            })),
            workspaceId,
            undefined,
            {
              concurrency: 3,
              persistedCacheLookup: callbacks.persistedCacheLookup,
              visionAnalyzer: callbacks.visionAnalyzer,
              onRecordIndexed: callbacks.onRecordIndexed,
            }
          );

          processedImageRecords = batchRes.processed;
          if (processedImageRecords.length > 0) {
            newSource.imageCards = processedImageRecords.map((rec) => ({
              id: rec.id,
              filename: rec.filename,
              page: rec.page,
              slide: rec.slide,
              caption: rec.aiGeneratedDescription,
              ocrText: rec.ocrText,
              analysisStatus: rec.analysisStatus,
              hasChartsOrDiagrams: rec.hasChartsOrDiagrams,
            }));

            const analyzedCards = processedImageRecords.filter((r) => r.analysisStatus === 'analyzed');
            if (analyzedCards.length > 0) {
              const primaryDesc = analyzedCards.map((c) => c.aiGeneratedDescription).join('\n');
              const primaryOcr = analyzedCards.map((c) => c.ocrText).filter(Boolean).join('\n---\n');
              newSource.imageDescription = primaryDesc;
              if (primaryOcr) newSource.ocrText = primaryOcr;
              if (newSource.type === 'image') {
                newSource.snippet = analyzedCards[0].aiGeneratedDescription.slice(0, 280);
                newSource.extractedText = `[Image: ${newSource.title}]\nSummary: ${primaryDesc}${
                  primaryOcr ? `\n\n### OCR Text:\n${primaryOcr}` : ''
                }`;
              } else {
                newSource.extractedText += `\n\n### Embedded Visual Assets Summary\n${analyzedCards
                  .map(
                    (c) =>
                      `- [Image: ${c.id}] (${c.filename}): ${c.aiGeneratedDescription}${
                        c.ocrText ? ` | OCR: ${c.ocrText.slice(0, 300)}` : ''
                      }`
                  )
                  .join('\n')}`;
              }
            }
          }
        } catch (indexErr) {
          console.warn(`[DOCIUM Upload] Non-fatal image indexing notice for source ${canonicalSourceId}:`, indexErr);
        }
      }

      // 5. Execute server-side chunking & vector embedding, and persist index to disk
      try {
        const chunks = await ingestSource(newSource, workspaceId, embeddingConfig);
        if (chunks.length > 0) {
          newSource.chunkCount = chunks.length;
          newSource.indexedAt = new Date().toISOString();
          persistWorkspaceIngestion(workspaceId, chunks, processedImageRecords);
        }
      } catch (ragErr) {
        console.warn(`[DOCIUM Upload] Server RAG indexing notice for source ${canonicalSourceId}:`, ragErr);
      }

      savePersistedWorkspaceSource(workspaceId, newSource);
      batchSeenHashes.set(contentHash, newSource);
      createdSources.push(newSource);
    }

    return NextResponse.json({
      success: true,
      sources: createdSources,
      source: createdSources[0],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload processing failed';
    console.error('[DOCIUM Upload API] Upload failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { parseUploadedFile } from '@/lib/ai/ingestion/parser';
import { ResearchSource } from '@/lib/types';
import { processImagesBatch } from '@/lib/ai/images/imageUnderstanding';
import { saveOriginalFile } from '@/lib/storage/sourceStorage';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const workspaceId = (formData.get('workspaceId') as string) || 'default';
    const conversationId = (formData.get('conversationId') as string) || undefined;

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const createdSources: ResearchSource[] = [];

    for (const file of files) {
      // 1. Generate canonical source ID upfront
      const canonicalSourceId = `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      // 2. Parse file structure and extract initial metadata
      const parsed = await parseUploadedFile(file, canonicalSourceId);
      const mimeType = parsed.mimeType || file.type || 'application/octet-stream';

      // 3. Persist original binary into workspace-isolated source storage
      try {
        saveOriginalFile(workspaceId, canonicalSourceId, fileBuffer, {
          filename: parsed.title,
          mimeType,
        });
        console.log(`[DOCIUM Storage] Successfully stored original file "${parsed.title}" (ID: ${canonicalSourceId}, ${fileBuffer.length} bytes) for workspace "${workspaceId}"`);
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
        extractedImages: parsed.embeddedImages?.map((img) => ({
          id: img.id,
          url: img.url,
          caption: img.caption,
          page: img.page,
        })),
        workspaceId,
        conversationId,
      };

      // 4. Index image assets resiliently without failing the upload if OCR/indexing errors occur
      if (newSource.extractedImages && newSource.extractedImages.length > 0) {
        try {
          await processImagesBatch(
            newSource.extractedImages.map((img) => ({
              id: img.id,
              sourceId: canonicalSourceId,
              filename: img.caption || `${newSource.title}-img`,
              fileUrl: img.url,
              dataUrl: img.url.startsWith('data:') ? img.url : undefined,
              page: img.page,
              workspaceId,
            })),
            workspaceId
          );
        } catch (indexErr) {
          console.warn(`[DOCIUM Upload] Non-fatal image indexing notice for source ${canonicalSourceId}:`, indexErr);
        }
      }

      createdSources.push(newSource);
    }

    return NextResponse.json({
      success: true,
      sources: createdSources,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload processing failed';
    console.error('[DOCIUM Upload API] Upload failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

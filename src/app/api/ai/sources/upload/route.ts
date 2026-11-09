import { NextRequest, NextResponse } from 'next/server';
import { parseUploadedFile } from '@/lib/ai/ingestion/parser';
import { ResearchSource } from '@/lib/types';
import { processImagesBatch } from '@/lib/ai/images/imageUnderstanding';

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
      const parsed = await parseUploadedFile(file);

      const newSource: ResearchSource = {
        id: `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: parsed.title,
        type: parsed.type,
        snippet: parsed.snippet,
        extractedText: parsed.extractedText,
        fileSize: parsed.fileSize,
        mimeType: parsed.mimeType,
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

      if (newSource.extractedImages && newSource.extractedImages.length > 0) {
        await processImagesBatch(
          newSource.extractedImages.map((img) => ({
            id: img.id,
            sourceId: newSource.id,
            filename: img.caption || `${newSource.title}-img`,
            fileUrl: img.url,
            dataUrl: img.url.startsWith('data:') ? img.url : undefined,
            page: img.page,
            workspaceId,
          })),
          workspaceId
        );
      }

      createdSources.push(newSource);
    }

    return NextResponse.json({
      success: true,
      sources: createdSources,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload processing failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

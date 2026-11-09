import { NextRequest, NextResponse } from 'next/server';
import { safeFetch, validateUrl } from '@/lib/ai/security/ssrfGuard';
import { ResearchSource } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { url, workspaceId = 'default', conversationId } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    const validation = validateUrl(url);
    if (!validation.valid || !validation.sanitizedUrl) {
      return NextResponse.json({ error: validation.reason || 'Invalid or blocked URL' }, { status: 400 });
    }

    const fetchResult = await safeFetch(validation.sanitizedUrl, {
      timeoutMs: 8000,
      maxSizeBytes: 1024 * 1024,
    });

    if (!fetchResult.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL. Server responded with HTTP ${fetchResult.status}` },
        { status: 400 }
      );
    }

    // Strip HTML scripts, styles, and markup
    let text = fetchResult.text;
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
    text = text.replace(/<[^>]+>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();

    // Extract page title from raw text if present
    const titleMatch = fetchResult.text.match(/<title\b[^>]*>(.*?)<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].trim() : new URL(validation.sanitizedUrl).hostname;

    const newSource: ResearchSource = {
      id: `src-url-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: pageTitle,
      type: 'url',
      sourceUrl: validation.sanitizedUrl,
      snippet: text.slice(0, 300) || `Web content from ${validation.sanitizedUrl}`,
      extractedText: text.slice(0, 8000),
      addedAt: new Date().toISOString(),
      status: 'ready',
      tags: ['URL', 'Web'],
      isIncludedInContext: true,
      fileSize: `${(text.length / 1024).toFixed(1)} KB`,
      mimeType: fetchResult.contentType,
      chunkCount: Math.max(1, Math.ceil(text.length / 600)),
      workspaceId,
      conversationId,
    };

    return NextResponse.json({
      success: true,
      source: newSource,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'URL processing error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

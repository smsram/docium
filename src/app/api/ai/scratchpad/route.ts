import { NextRequest, NextResponse } from 'next/server';

const serverScratchpads: Record<string, string> = {};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
  }

  const notes = serverScratchpads[conversationId] || '';
  return NextResponse.json({ success: true, notes });
}

export async function PUT(req: NextRequest) {
  try {
    const { conversationId, notes } = await req.json();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    serverScratchpads[conversationId] = String(notes || '').slice(0, 2500);

    return NextResponse.json({
      success: true,
      notes: serverScratchpads[conversationId],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update scratchpad';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

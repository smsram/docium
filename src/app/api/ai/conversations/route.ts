import { NextRequest, NextResponse } from 'next/server';
import { WorkspaceConversation } from '@/lib/types';

// In-memory conversation store on server, synchronized with client-side state
const serverConversations: Record<string, WorkspaceConversation[]> = {};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');

  if (!workspaceId) {
    return NextResponse.json({ error: 'workspaceId query parameter is required' }, { status: 400 });
  }

  const list = serverConversations[workspaceId] || [];
  return NextResponse.json({
    success: true,
    conversations: list,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, title, workspaceType = 'doc', initialTools } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 });
    }

    const existing = serverConversations[workspaceId] || [];
    const newConv: WorkspaceConversation = {
      id: `conv-${workspaceId}-${Date.now()}`,
      title: title || `Conversation ${existing.length + 1}`,
      category: 'document',
      workspaceId,
      workspaceType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
      sources: [],
      selectedTools: initialTools || {
        internetSearch: false,
        imageGeneration: false,
        chartsAndData: true,
      },
    };

    serverConversations[workspaceId] = [...existing, newConv];

    return NextResponse.json({
      success: true,
      conversation: newConv,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create conversation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const workspaceId = searchParams.get('workspaceId');
  const conversationId = searchParams.get('conversationId');

  if (!workspaceId || !conversationId) {
    return NextResponse.json({ error: 'workspaceId and conversationId are required' }, { status: 400 });
  }

  const existing = serverConversations[workspaceId] || [];
  serverConversations[workspaceId] = existing.filter((c) => c.id !== conversationId);

  return NextResponse.json({ success: true });
}

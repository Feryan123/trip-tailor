import { NextRequest, NextResponse } from 'next/server';
import { conversations } from '@/lib/travel-agent';

export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { conversationId } = params;
  const conversation = conversations.get(conversationId);
  
  if (!conversation) {
    return NextResponse.json({ 
      error: 'Conversation not found',
      conversationId 
    }, { status: 404 });
  }
  
  return NextResponse.json({ 
    conversation: conversation,
    conversationId: conversationId
  });
}
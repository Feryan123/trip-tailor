import { NextRequest, NextResponse } from 'next/server';
import { agentStates } from '@/lib/travel-agent';

export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  const { conversationId } = params;
  const state = agentStates.get(conversationId);
  
  if (!state) {
    return NextResponse.json({ error: 'Agent state not found' }, { status: 404 });
  }
  
  return NextResponse.json(state);
}

import { NextRequest, NextResponse } from 'next/server';
import { 
  createTravelAgent, 
  conversations, 
  agentStates,
  type ConversationMessage,
  type TravelDetails,
  type ToolResults
} from '@/lib/travel-agent';

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId }: { message: string; conversationId: string } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let conversation: ConversationMessage[] = conversations.get(conversationId) || [];
    
    conversation.push({ role: 'user', content: message });

    const initialState = {
      messages: [{ role: 'user', content: message }],
      travelDetails: {} as TravelDetails,
      toolResults: {} as ToolResults,
      currentStep: 'analyzing',
      finalResponse: ''
    };

    agentStates.set(conversationId, initialState);

    const agent = createTravelAgent();
    const finalState = await agent.invoke(initialState);

    conversation.push({ role: 'assistant', content: finalState.finalResponse });

    conversations.set(conversationId, conversation);

    if (conversation.length > 40) {
      conversation = conversation.slice(-40);
      conversations.set(conversationId, conversation);
    }

    return NextResponse.json({ 
      response: finalState.finalResponse,
      conversationId: conversationId,
      travelDetails: finalState.travelDetails,
      toolsUsed: Object.keys(finalState.toolResults),
      agentWorkflow: {
        stepsCompleted: ['analyze', 'gather_data', 'create_itinerary'],
        dataGathered: finalState.toolResults
      }
    });

  } catch (error: any) {
    console.error('Chat error:', error);
    return NextResponse.json({ 
      error: 'Sorry, I encountered an error while planning your trip. Please try again!',
      details: error.message 
    }, { status: 500 });
  }
}

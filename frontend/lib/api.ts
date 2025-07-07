interface ChatResponse {
  response: string;
  conversationId: string;
  travelDetails?: any;
  toolsUsed?: string[];
  agentWorkflow?: {
    stepsCompleted: string[];
    dataGathered: any;
  };
  enrichedWithRealData?: boolean;
}

interface ConversationResponse {
  conversation: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  conversationId: string;
}

interface NewConversationResponse {
  conversationId: string;
}

export const chatAPI = {
  async sendMessage({ message, conversationId }: { message: string; conversationId: string }): Promise<ChatResponse> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },

  async createConversation(): Promise<NewConversationResponse> {
    const response = await fetch('/api/new-conversation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },

  async getConversation(conversationId: string): Promise<ConversationResponse> {
    const response = await fetch(`/api/conversation/${conversationId}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },

  async getAgentState(conversationId: string) {
    const response = await fetch(`/api/agent-state/${conversationId}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  },

  async getHealth() {
    const response = await fetch('/api/health');

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }
};

export function handleAPIError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}
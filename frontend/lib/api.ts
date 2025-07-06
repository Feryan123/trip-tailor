// lib/api.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface ChatResponse {
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

export interface SendMessageRequest {
  message: string;
  conversationId?: string;
}

export interface ConversationResponse {
  conversationId: string;
}

export interface ConversationHistoryResponse {
  conversation: Array<{
    role: string;
    content: string;
  }>;
}

class ChatAPI {
  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          errorData
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      
      // Network or other errors
      throw new APIError(
        'Unable to connect to TripTailor. Please check your internet connection.',
        0,
        { originalError: error }
      );
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<ChatResponse> {
    return this.makeRequest<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async createConversation(): Promise<ConversationResponse> {
    return this.makeRequest<ConversationResponse>('/api/new-conversation', {
      method: 'POST',
    });
  }

  async getConversation(conversationId: string): Promise<ConversationHistoryResponse> {
    return this.makeRequest<ConversationHistoryResponse>(`/api/conversation/${conversationId}`);
  }

  async healthCheck(): Promise<any> {
    return this.makeRequest<any>('/health');
  }
}

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export const chatAPI = new ChatAPI();

export function handleAPIError(error: unknown): string {
  if (error instanceof APIError) {
    // Handle specific API errors
    switch (error.status) {
      case 0:
        return 'Unable to connect to TripTailor. Please check your internet connection.';
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'TripTailor is experiencing issues. Please try again in a moment.';
      default:
        return error.message || 'Something went wrong. Please try again.';
    }
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unexpected error occurred. Please try again.';
}
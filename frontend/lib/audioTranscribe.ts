import Groq from 'groq-sdk';

export interface VoiceProcessorConfig {
  apiKey: string;
  whisperModel?: string;
  chatModel?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface VoiceProcessorResponse {
  userMessage: string;
  botResponse: string;
  success: boolean;
  error?: string;
}

export class VoiceMessageProcessor {
  private groq: Groq;
  private config: Required<VoiceProcessorConfig>;

  constructor(config: VoiceProcessorConfig) {
    this.groq = new Groq({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true // Allow browser usage
    });

    this.config = {
      apiKey: config.apiKey,
      whisperModel: config.whisperModel || "whisper-large-v3",
      chatModel: config.chatModel || "llama-3.1-8b-instant",
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 1000,
      systemPrompt: config.systemPrompt || "You are a helpful assistant. Keep responses concise and conversational."
    };
  }

  /**
   * Process voice message from URL
   */
  async processVoiceFromUrl(audioUrl: string): Promise<VoiceProcessorResponse> {
    try {
      // Step 1: Convert speech to text using URL directly
      const transcription = await this.groq.audio.transcriptions.create({
        url: audioUrl,
        model: this.config.whisperModel
      });

      const userMessage = transcription.text;
      console.log('User said:', userMessage);

      // Step 2: Process the text with chatbot logic
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: this.config.systemPrompt
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        model: this.config.chatModel,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      });

      const botResponse = chatCompletion.choices[0]?.message?.content || '';

      return {
        userMessage,
        botResponse,
        success: true
      };

    } catch (error) {
      console.error('Voice processing error:', error);
      return {
        userMessage: '',
        botResponse: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Process voice message from File object (for direct file uploads)
   */
  async processVoiceFromFile(audioFile: File): Promise<VoiceProcessorResponse> {
    try {
      // Step 1: Convert speech to text
      const transcription = await this.groq.audio.transcriptions.create({
        file: audioFile,
        model: this.config.whisperModel
      });

      const userMessage = transcription.text;
      console.log('User said:', userMessage);

      // Step 2: Process the text with chatbot logic
      const chatCompletion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: this.config.systemPrompt
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        model: this.config.chatModel,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens
      });

      const botResponse = chatCompletion.choices[0]?.message?.content || '';

      return {
        userMessage,
        botResponse,
        success: true
      };

    } catch (error) {
      console.error('Voice processing error:', error);
      return {
        userMessage: '',
        botResponse: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VoiceProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.apiKey) {
      this.groq = new Groq({
        apiKey: newConfig.apiKey
      });
    }
  }
}

// Convenience function for quick usage with URL
export const processVoiceMessage = async (
  audioUrl: string, 
  config: VoiceProcessorConfig
): Promise<VoiceProcessorResponse> => {
  const processor = new VoiceMessageProcessor(config);
  return processor.processVoiceFromUrl(audioUrl);
};

export default VoiceMessageProcessor;
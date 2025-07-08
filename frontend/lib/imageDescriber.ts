// lib/imageDescriber.ts
import { Groq } from 'groq-sdk';

const groq = new Groq({
  apiKey: process.env.NEXT_GROQ_API_KEY // Set to true for browser usage
});

export async function describeImage(imageUrl: string): Promise<string> {
  try {
    console.log('Starting image description for:', imageUrl);
    
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are TripTailor Image Describer--a tool that describes images of certain places and landmarks. Please describe the image in detail. It should be a location-based description, including landmarks, scenery, and any notable features. Perhaps you can also make a guess where it is located. Keep it concise but informative.",
            },
            {
              type: "image_url",
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      model: "meta-llama/llama-4-scout-17b-16e-instruct", // Updated model
      temperature: 0.7,
      max_tokens: 512,
      stream: false // Non-streaming for simplicity
    });

    const description = chatCompletion.choices[0]?.message?.content || 'Could not describe image';
    console.log('Image description completed:', description);
    return description;

  } catch (error) {
    console.error('Error describing image:', error);
    
    // Return a more specific error message
    if (error instanceof Error) {
      return `Error describing image: ${error.message}`;
    }
    return 'Could not describe image due to an unknown error';
  }
}
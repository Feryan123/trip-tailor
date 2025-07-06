const Groq = require('groq-sdk');
const fs = require('fs');

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

const processVoiceMessage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Step 1: Convert speech to text
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: "whisper-large-v3"
    });

    const userMessage = transcription.text;
    console.log('User said:', userMessage);

    // Step 2: Process the text with your chatbot logic
    const botResponse = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Keep responses concise and conversational."
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      model: "llama-3.1-8b-instant", // or your preferred model
      temperature: 0.7,
      max_tokens: 1000
    });

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
      userMessage: userMessage,
      botResponse: botResponse.choices[0].message.content,
      success: true
    });

  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ error: 'Failed to process voice message' });
  }
};

module.exports = {
  processVoiceMessage
};
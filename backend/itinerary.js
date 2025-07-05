const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Set EJS as the template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store conversation history in memory (for demo purposes)
const conversations = new Map();

// Groq API configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// System prompt for TripTailor
const SYSTEM_PROMPT = `You are TripTailor, a personal travel guide AI assistant that specializes in creating detailed, down-to-the-hour travel schedules and itineraries. Your expertise includes:

CORE RESPONSIBILITIES:
- Create comprehensive hour-by-hour travel schedules
- Provide detailed day-by-day itineraries with specific timing
- Suggest activities, restaurants, and attractions with exact time slots
- Offer budget-conscious and luxury travel options
- Provide local transportation guidance and timing
- Recommend cultural experiences and hidden gems
- Share practical travel tips and logistics

RESPONSE STYLE:
- Always respond in conversational, helpful chunks rather than overwhelming paragraphs
- Break down complex itineraries into digestible messages
- Ask follow-up questions to better understand preferences
- Be enthusiastic and personable while remaining practical
- Provide specific times, locations, and durations for activities
- Include estimated costs when relevant

ITINERARY FORMAT:
When creating schedules, use clear time blocks:
- Morning (8:00 AM - 12:00 PM)
- Afternoon (12:00 PM - 6:00 PM)  
- Evening (6:00 PM - 10:00 PM)
- Night (10:00 PM onwards)

Always include:
- Exact timing for each activity
- Transportation details and duration
- Budget estimates
- Alternative options for different preferences
- Local tips and cultural insights

Keep responses focused on travel planning. If users ask about non-travel topics, politely redirect them back to travel planning while staying helpful and friendly.

Remember: You're not just planning trips, you're crafting experiences that create lasting memories.`;

// Function to call Groq API
async function callGroqAPI(messages) {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: messages,
        max_tokens: 800,
        temperature: 0.7,
        top_p: 0.9,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Error calling Groq API:', error);
    throw error;
  }
}

// Routes
app.get('/', (req, res) => {
  const pageData = {
    title: 'TripTailor - Your Personal Travel Guide',
    appName: 'TripTailor',
    description: 'Your AI-powered personal travel guide',
    welcomeTitle: 'Welcome to TripTailor! ✈️',
    welcomeMessage: 'I\'m your personal travel guide, here to create detailed down-to-the-hour schedules for your perfect trip.',
    welcomeSubMessage: 'Tell me about your travel plans, and I\'ll craft a personalized itinerary just for you!',
    samplePrompts: [
      'Plan my trip to Bali on the tenth of July with a budget of $3000. Make it fun as I\'m playing with 3 of my friends.',
      'Create a romantic 4-day Paris itinerary for under $2000',
      'Plan a family-friendly Tokyo adventure for 6 days',
      'Design a luxury weekend in Dubai with fine dining'
    ]
  };
  
  res.render('iti', pageData);
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create conversation history
    let conversation = conversations.get(conversationId) || [];
    
    // Add user message to conversation
    conversation.push({ role: 'user', content: message });

    // Prepare messages for API (include system prompt)
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversation
    ];

    // Call Groq API
    const response = await callGroqAPI(messages);

    // Add assistant response to conversation
    conversation.push({ role: 'assistant', content: response });

    // Store updated conversation
    conversations.set(conversationId, conversation);

    // Keep only last 20 exchanges to manage memory
    if (conversation.length > 40) {
      conversation = conversation.slice(-40);
      conversations.set(conversationId, conversation);
    }

    res.json({ 
      response: response,
      conversationId: conversationId 
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Sorry, I encountered an error while planning your trip. Please try again!' 
    });
  }
});

// New conversation endpoint
app.post('/api/new-conversation', (req, res) => {
  const conversationId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  res.json({ conversationId });
});

// Get conversation history
app.get('/api/conversation/:id', (req, res) => {
  const { id } = req.params;
  const conversation = conversations.get(id) || [];
  res.json({ conversation });
});

// Share conversation endpoint
app.get('/api/share/:id', (req, res) => {
  const { id } = req.params;
  const conversation = conversations.get(id) || [];
  
  if (conversation.length === 0) {
    return res.status(404).json({ error: 'Conversation not found' });
  }

  // Create a shareable summary
  const summary = {
    id: id,
    createdAt: new Date().toISOString(),
    messages: conversation.map(msg => ({
      role: msg.role,
      content: msg.content.substring(0, 500) + (msg.content.length > 500 ? '...' : '')
    }))
  };

  res.json({ conversation: summary });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'TripTailor',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong with TripTailor. Please try again!' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found' 
  });
});

app.listen(PORT, () => {
  console.log(`🌍 TripTailor server running on http://localhost:${PORT}`);
  console.log(`📝 Make sure to set your GROQ_API_KEY in .env file`);
  console.log(`✈️  Ready to help plan amazing trips!`);
});
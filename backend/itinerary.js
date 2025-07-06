const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
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

// API Keys
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search';

// SerpAPI Service Functions
async function searchPlaces(query, location) {
  try {
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google_maps',
        q: `${query} in ${location}`,
        api_key: SERPAPI_KEY
      }
    });
    
    return response.data.local_results || [];
  } catch (error) {
    console.error('Error searching places:', error.message);
    return [];
  }
}

async function searchHotels(location, checkIn, checkOut, adults = 2) {
  try {
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google_hotels',
        q: `hotels in ${location}`,
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults: adults,
        api_key: SERPAPI_KEY
      }
    });
    
    return response.data.properties || [];
  } catch (error) {
    console.error('Error searching hotels:', error.message);
    return [];
  }
}

async function searchFlights(departure, arrival, departureDate, adults = 1) {
  try {
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google_flights',
        departure_id: departure,
        arrival_id: arrival,
        outbound_date: departureDate,
        adults: adults,
        api_key: SERPAPI_KEY
      }
    });
    
    return response.data.best_flights || [];
  } catch (error) {
    console.error('Error searching flights:', error.message);
    return [];
  }
}

async function searchRestaurants(location, cuisine = '') {
  try {
    const query = cuisine ? `${cuisine} restaurants in ${location}` : `restaurants in ${location}`;
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google_maps',
        q: query,
        api_key: SERPAPI_KEY
      }
    });
    
    return response.data.local_results || [];
  } catch (error) {
    console.error('Error searching restaurants:', error.message);
    return [];
  }
}

// Enhanced function to extract location and travel details from user message
function extractTravelDetails(message) {
  const details = {
    location: null,
    checkIn: null,
    checkOut: null,
    adults: 2,
    budget: null,
    interests: []
  };

  // Extract location (basic pattern matching)
  const locationMatch = message.match(/(?:to|in|visit)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
  if (locationMatch) {
    details.location = locationMatch[1];
  }

  // Extract dates
  const datePatterns = [
    /(\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December))/gi,
    /(\d{1,2}\/\d{1,2}\/\d{4})/g,
    /(\d{4}-\d{2}-\d{2})/g
  ];

  for (const pattern of datePatterns) {
    const matches = message.match(pattern);
    if (matches && matches.length > 0) {
      details.checkIn = matches[0];
      if (matches.length > 1) {
        details.checkOut = matches[1];
      }
      break;
    }
  }

  // Extract budget
  const budgetMatch = message.match(/\$(\d+(?:,\d+)*)/);
  if (budgetMatch) {
    details.budget = budgetMatch[1];
  }

  // Extract number of people
  const peopleMatch = message.match(/(\d+)\s+(?:people|friends|persons|adults)/i);
  if (peopleMatch) {
    details.adults = parseInt(peopleMatch[1]);
  }

  // Extract interests
  const interestKeywords = ['restaurant', 'food', 'museum', 'beach', 'shopping', 'nightlife', 'culture', 'adventure', 'relaxation'];
  details.interests = interestKeywords.filter(keyword => 
    message.toLowerCase().includes(keyword)
  );

  return details;
}

// Enhanced function to enrich itinerary with real data
async function enrichItineraryWithData(itinerary, travelDetails) {
  if (!travelDetails.location || !SERPAPI_KEY) {
    return itinerary;
  }

  try {
    // Get attractions
    const attractions = await searchPlaces('tourist attractions', travelDetails.location);
    
    // Get restaurants
    const restaurants = await searchRestaurants(travelDetails.location);
    
    // Get hotels if dates are available
    let hotels = [];
    if (travelDetails.checkIn && travelDetails.checkOut) {
      hotels = await searchHotels(travelDetails.location, travelDetails.checkIn, travelDetails.checkOut, travelDetails.adults);
    }

    // Create enriched content
    let enrichedContent = itinerary + '\n\n';

    // Add real attraction recommendations
    if (attractions.length > 0) {
      enrichedContent += '\n🏛️ **VERIFIED ATTRACTIONS & PLACES TO VISIT:**\n';
      attractions.slice(0, 5).forEach(attraction => {
        enrichedContent += `\n• **${attraction.title}** ${attraction.rating ? `(${attraction.rating}⭐)` : ''}\n`;
        if (attraction.address) enrichedContent += `  📍 ${attraction.address}\n`;
        if (attraction.website) enrichedContent += `  🌐 [Website](${attraction.website})\n`;
        if (attraction.phone) enrichedContent += `  📞 ${attraction.phone}\n`;
      });
    }

    // Add real restaurant recommendations
    if (restaurants.length > 0) {
      enrichedContent += '\n🍽️ **VERIFIED RESTAURANTS & DINING:**\n';
      restaurants.slice(0, 5).forEach(restaurant => {
        enrichedContent += `\n• **${restaurant.title}** ${restaurant.rating ? `(${restaurant.rating}⭐)` : ''}\n`;
        if (restaurant.address) enrichedContent += `  📍 ${restaurant.address}\n`;
        if (restaurant.website) enrichedContent += `  🌐 [Website](${restaurant.website})\n`;
        if (restaurant.phone) enrichedContent += `  📞 ${restaurant.phone}\n`;
      });
    }

    // Add real hotel recommendations
    if (hotels.length > 0) {
      enrichedContent += '\n🏨 **VERIFIED ACCOMMODATION OPTIONS:**\n';
      hotels.slice(0, 3).forEach(hotel => {
        enrichedContent += `\n• **${hotel.name}** ${hotel.overall_rating ? `(${hotel.overall_rating}⭐)` : ''}\n`;
        if (hotel.rate_per_night) enrichedContent += `  💰 From ${hotel.rate_per_night.lowest} per night\n`;
        if (hotel.link) enrichedContent += `  🌐 [Book Here](${hotel.link})\n`;
      });
    }

    return enrichedContent;
  } catch (error) {
    console.error('Error enriching itinerary:', error.message);
    return itinerary;
  }
}

// Enhanced System prompt for TripTailor
const SYSTEM_PROMPT = `You are TripTailor, a personal travel guide AI assistant that specializes in creating detailed, down-to-the-hour travel schedules and itineraries. Your expertise includes:

CORE RESPONSIBILITIES:
- Create comprehensive hour-by-hour travel schedules with EXACT times
- Provide detailed day-by-day itineraries with specific timing and locations
- Suggest activities, restaurants, and attractions with precise time slots
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

DETAILED ITINERARY FORMAT:
When creating schedules, ALWAYS use this exact format with specific times:

**DAY 1: [Date]**
🌅 **MORNING (6:00 AM - 12:00 PM)**
- 6:00 AM: Wake up, hotel breakfast
- 8:00 AM: [Specific Activity] at [Exact Location]
- 10:30 AM: [Next Activity] - Duration: 1.5 hours
- 12:00 PM: Lunch at [Restaurant Name]

🌞 **AFTERNOON (12:00 PM - 6:00 PM)**  
- 1:00 PM: [Activity] at [Location]
- 3:30 PM: [Next Activity] - Budget: $XX
- 5:00 PM: [Activity] + transportation details

🌆 **EVENING (6:00 PM - 10:00 PM)**
- 6:00 PM: Dinner at [Restaurant]
- 8:00 PM: [Evening Activity]
- 10:00 PM: Return to hotel

🌙 **NIGHT (10:00 PM onwards)**
- Optional nightlife or rest recommendations

ALWAYS include:
- Exact timing for each activity (not ranges like "morning" but "9:00 AM")
- Specific location names and addresses when possible
- Transportation details and duration between locations
- Budget estimates for each activity
- Alternative options for different weather/preferences
- Local tips and cultural insights
- Total daily budget breakdown

IMPORTANT: Make every itinerary complete and actionable. Someone should be able to follow it exactly without needing to research anything else.

Keep responses focused on travel planning. If users ask about non-travel topics, politely redirect them back to travel planning while staying helpful and friendly.

Remember: You're not just planning trips, you're crafting detailed, minute-by-minute experiences that create lasting memories.`;

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
        max_tokens: 1200,
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
    description: 'Your AI-powered personal travel guide with real-time data',
    welcomeTitle: 'Welcome to TripTailor! ✈️',
    welcomeMessage: 'I\'m your personal travel guide, here to create detailed hour-by-hour schedules with real-time data for your perfect trip.',
    welcomeSubMessage: 'Tell me about your travel plans, and I\'ll craft a personalized itinerary with verified attractions, restaurants, and hotels!',
    samplePrompts: [
      'Plan my trip to Bali on July 15th with a budget of $3000. Make it fun as I\'m traveling with 3 friends.',
      'Create a romantic 4-day Paris itinerary for under $2000 starting August 1st',
      'Plan a family-friendly Tokyo adventure for 6 days beginning September 10th',
      'Design a luxury weekend in Dubai with fine dining from December 5th to 7th'
    ]
  };
  
  res.render('iti', pageData);
});

// Enhanced Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Extract travel details from user message
    const travelDetails = extractTravelDetails(message);
    
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
    let response = await callGroqAPI(messages);

    // Enrich response with real data from SerpAPI if location is detected
    if (travelDetails.location) {
      console.log(`Enriching itinerary for ${travelDetails.location}...`);
      response = await enrichItineraryWithData(response, travelDetails);
    }

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
      conversationId: conversationId,
      enrichedWithRealData: !!travelDetails.location
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Sorry, I encountered an error while planning your trip. Please try again!' 
    });
  }
});

// New endpoint to get specific place information
app.post('/api/place-info', async (req, res) => {
  try {
    const { placeName, location } = req.body;
    
    if (!placeName || !location) {
      return res.status(400).json({ error: 'Place name and location are required' });
    }

    const places = await searchPlaces(placeName, location);
    
    res.json({ 
      places: places.slice(0, 3), // Return top 3 results
      found: places.length > 0
    });

  } catch (error) {
    console.error('Place info error:', error);
    res.status(500).json({ 
      error: 'Failed to get place information' 
    });
  }
});

// New endpoint to get hotel recommendations
app.post('/api/hotels', async (req, res) => {
  try {
    const { location, checkIn, checkOut, adults } = req.body;
    
    if (!location) {
      return res.status(400).json({ error: 'Location is required' });
    }

    const hotels = await searchHotels(location, checkIn, checkOut, adults);
    
    res.json({ 
      hotels: hotels.slice(0, 5), // Return top 5 results
      found: hotels.length > 0
    });

  } catch (error) {
    console.error('Hotels error:', error);
    res.status(500).json({ 
      error: 'Failed to get hotel recommendations' 
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
    service: 'TripTailor Enhanced',
    version: '2.0.0',
    serpApiEnabled: !!SERPAPI_KEY,
    groqApiEnabled: !!GROQ_API_KEY
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
  console.log(`🌍 TripTailor Enhanced server running on http://localhost:${PORT}`);
  console.log(`📝 Make sure to set your GROQ_API_KEY and SERPAPI_API_KEY in .env file`);
  console.log(`✈️  Ready to help plan amazing trips with real-time data!`);
  console.log(`🔗 SerpAPI integration: ${SERPAPI_KEY ? 'ENABLED' : 'DISABLED'}`);
});
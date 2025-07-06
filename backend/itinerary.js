const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { StateGraph, END, START, Annotation } = require('@langchain/langgraph');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { ChatGroq } = require('@langchain/groq');
const { DynamicTool } = require('@langchain/core/tools');
const { z } = require('zod');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const conversations = new Map();
const agentStates = new Map();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_URL = 'https://serpapi.com/search';

const llm = new ChatGroq({
  apiKey: GROQ_API_KEY,
  model: 'llama-3.1-8b-instant',
  temperature: 0.7,
  maxTokens: 2000,
});

// SerpAPI Tool Functions
const searchPlacesTool = new DynamicTool({
  name: 'search_places',
  description: 'Search for tourist attractions, landmarks, and places of interest in a specific location',
  schema: z.object({
    query: z.string().describe('What to search for (e.g., "tourist attractions", "museums", "parks")'),
    location: z.string().describe('The city or location to search in'),
  }),
  func: async ({ query, location }) => {
    try {
      const response = await axios.get(SERPAPI_URL, {
        params: {
          engine: 'google_maps',
          q: `${query} in ${location}`,
          api_key: SERPAPI_KEY
        }
      });
      
      const results = response.data.local_results || [];
      return JSON.stringify(results.slice(0, 8).map(place => ({
        name: place.title,
        rating: place.rating,
        address: place.address,
        website: place.website,
        phone: place.phone,
        type: place.type,
        description: place.description || place.snippet
      })));
    } catch (error) {
      console.error('Error searching places:', error.message);
      return JSON.stringify({ error: 'Failed to search places' });
    }
  }
});

const searchHotelsTool = new DynamicTool({
  name: 'search_hotels',
  description: 'Search for hotels and accommodations in a specific location with dates',
  schema: z.object({
    location: z.string().describe('The city or location to search for hotels'),
    checkIn: z.string().optional().describe('Check-in date in YYYY-MM-DD format'),
    checkOut: z.string().optional().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().optional().describe('Number of adults (default: 2)'),
  }),
  func: async ({ location, checkIn, checkOut, adults = 2 }) => {
    try {
      const params = {
        engine: 'google_hotels',
        q: `hotels in ${location}`,
        adults: adults,
        api_key: SERPAPI_KEY
      };
      
      if (checkIn) params.check_in_date = checkIn;
      if (checkOut) params.check_out_date = checkOut;
      
      const response = await axios.get(SERPAPI_URL, { params });
      
      const results = response.data.properties || [];
      return JSON.stringify(results.slice(0, 6).map(hotel => ({
        name: hotel.name,
        rating: hotel.overall_rating,
        pricePerNight: hotel.rate_per_night,
        link: hotel.link,
        amenities: hotel.amenities,
        description: hotel.description
      })));
    } catch (error) {
      console.error('Error searching hotels:', error.message);
      return JSON.stringify({ error: 'Failed to search hotels' });
    }
  }
});

const searchRestaurantsTool = new DynamicTool({
  name: 'search_restaurants',
  description: 'Search for restaurants and dining options in a specific location',
  schema: z.object({
    location: z.string().describe('The city or location to search for restaurants'),
    cuisine: z.string().optional().describe('Specific cuisine type (e.g., "Italian", "Japanese", "local")'),
    priceRange: z.string().optional().describe('Price range preference (e.g., "budget", "mid-range", "luxury")'),
  }),
  func: async ({ location, cuisine = '', priceRange = '' }) => {
    try {
      let query = `restaurants in ${location}`;
      if (cuisine) query = `${cuisine} restaurants in ${location}`;
      if (priceRange) query += ` ${priceRange}`;
      
      const response = await axios.get(SERPAPI_URL, {
        params: {
          engine: 'google_maps',
          q: query,
          api_key: SERPAPI_KEY
        }
      });
      
      const results = response.data.local_results || [];
      return JSON.stringify(results.slice(0, 8).map(restaurant => ({
        name: restaurant.title,
        rating: restaurant.rating,
        address: restaurant.address,
        website: restaurant.website,
        phone: restaurant.phone,
        cuisine: restaurant.type,
        priceLevel: restaurant.price,
        description: restaurant.description || restaurant.snippet
      })));
    } catch (error) {
      console.error('Error searching restaurants:', error.message);
      return JSON.stringify({ error: 'Failed to search restaurants' });
    }
  }
});

const searchFlightsTool = new DynamicTool({
  name: 'search_flights',
  description: 'Search for flights between two locations',
  schema: z.object({
    fromLocation: z.string().describe('Departure city or airport code'),
    toLocation: z.string().describe('Arrival city or airport code'),
    departureDate: z.string().describe('Departure date in YYYY-MM-DD format'),
    returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format for round trip'),
    adults: z.number().optional().describe('Number of adult passengers (default: 1)'),
  }),
  func: async ({ fromLocation, toLocation, departureDate, returnDate, adults = 1 }) => {
    try {
      const params = {
        engine: 'google_flights',
        departure_id: fromLocation,
        arrival_id: toLocation,
        outbound_date: departureDate,
        adults: adults,
        api_key: SERPAPI_KEY
      };
      
      if (returnDate) params.return_date = returnDate;
      
      const response = await axios.get(SERPAPI_URL, { params });
      
      const results = response.data.best_flights || [];
      return JSON.stringify(results.slice(0, 5).map(flight => ({
        airline: flight.flights?.[0]?.airline,
        price: flight.price,
        duration: flight.total_duration,
        departure: flight.flights?.[0]?.departure_airport,
        arrival: flight.flights?.[0]?.arrival_airport,
        departureTime: flight.flights?.[0]?.departure_time,
        arrivalTime: flight.flights?.[0]?.arrival_time,
        stops: flight.flights?.[0]?.airplane ? 0 : 'Multiple stops'
      })));
    } catch (error) {
      console.error('Error searching flights:', error.message);
      return JSON.stringify({ error: 'Failed to search flights' });
    }
  }
});

const searchWeatherTool = new DynamicTool({
  name: 'search_weather',
  description: 'Get weather information for a specific location and date range',
  schema: z.object({
    location: z.string().describe('The city or location to get weather for'),
    date: z.string().optional().describe('Specific date in YYYY-MM-DD format'),
  }),
  func: async ({ location, date }) => {
    try {
      let query = `weather in ${location}`;
      if (date) query += ` ${date}`;
      
      const response = await axios.get(SERPAPI_URL, {
        params: {
          engine: 'google',
          q: query,
          api_key: SERPAPI_KEY
        }
      });
      
      const weatherInfo = response.data.answer_box || response.data.organic_results?.[0] || {};
      return JSON.stringify({
        location: location,
        current: weatherInfo.temperature || 'N/A',
        condition: weatherInfo.weather || 'N/A',
        forecast: weatherInfo.forecast || 'Check local weather services for detailed forecast'
      });
    } catch (error) {
      console.error('Error searching weather:', error.message);
      return JSON.stringify({ error: 'Failed to get weather information' });
    }
  }
});

const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => []
  }),
  travelDetails: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({})
  }),
  toolResults: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({})
  }),
  currentStep: Annotation({
    reducer: (x, y) => y,
    default: () => 'analyzing'
  }),
  finalResponse: Annotation({
    reducer: (x, y) => y,
    default: () => ''
  })
});

const SYSTEM_PROMPT = `You are TripTailor, an advanced AI travel planning assistant with access to real-time data through various search tools. Your mission is to create detailed, personalized travel itineraries with exact timing and verified information.

CORE CAPABILITIES:
- Extract travel details from natural language (locations, dates, budget, preferences)
- Search for real-time information using available tools
- Create hour-by-hour detailed itineraries
- Provide verified recommendations with contact details
- Suggest alternatives based on weather, budget, and preferences

INTELLIGENCE FEATURES:
- Automatically detect FROM and TO locations from user messages
- Parse dates in various formats (natural language, ISO, etc.)
- Understand budget constraints and preferences
- Identify travel party size and special requirements
- Recognize activity preferences and interests

AVAILABLE TOOLS:
- search_places: Find attractions, landmarks, and points of interest
- search_hotels: Get accommodation options with pricing
- search_restaurants: Find dining options by cuisine and price range
- search_flights: Compare flight options between locations
- search_weather: Get weather information for travel dates

RESPONSE FORMAT:
Create detailed day-by-day itineraries with:
- Exact times for each activity (e.g., "9:00 AM - 10:30 AM")
- Specific locations with addresses
- Transportation details between locations
- Budget estimates for each activity
- Alternative options for different weather/preferences
- Local tips and cultural insights

TRAVEL DETAIL EXTRACTION:
When a user mentions travel plans, intelligently extract:
- Origin city/location (where they're traveling FROM)
- Destination city/location (where they're traveling TO)
- Travel dates (departure and return)
- Duration of stay
- Number of travelers
- Budget constraints
- Activity preferences
- Special requirements (family-friendly, romantic, adventure, etc.)

TOOL USAGE STRATEGY:
1. First, analyze the user's message to extract travel details
2. Use search_weather to check conditions for travel dates
3. Use search_flights to find transportation options
4. Use search_hotels to find accommodation
5. Use search_places to find attractions and activities
6. Use search_restaurants to find dining options
7. Synthesize all information into a comprehensive itinerary

Always provide actionable, detailed responses that someone can follow step-by-step. Include backup plans and local insights to enhance the travel experience.

Remember: You're not just planning trips, you're crafting detailed experiences with real-time verified information.`;

async function analyzeUserRequest(state) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  
  const extractionPrompt = `
  You MUST respond with ONLY a valid JSON object. No other text before or after.
  
  Extract travel details from this message: "${lastMessage.content}"
  
  Return ONLY this JSON format (replace values with extracted information):
  {
    "fromLocation": "departure city or not specified",
    "toLocation": "destination city or not specified", 
    "departureDate": "YYYY-MM-DD or not specified",
    "returnDate": "YYYY-MM-DD or not specified",
    "travelers": 1,
    "budget": "amount or not specified",
    "preferences": [],
    "duration": "X days or not specified",
    "specialRequirements": "any special needs or not specified"
  }
  
  IMPORTANT: 
  - Respond with ONLY the JSON object
  - Use "not specified" for missing information
  - Use reasonable defaults for numbers (travelers: 1 if not mentioned)
  - Do not include any explanatory text
  `;
  
  const extractionMessage = [
    new SystemMessage(extractionPrompt),
    new HumanMessage(lastMessage.content)
  ];
  
  try {
    const result = await llm.invoke(extractionMessage);
    console.log('Raw LLM response:', result.content);
    
    let cleanedContent = result.content.trim();
    
    const firstBrace = cleanedContent.indexOf('{');
    const lastBrace = cleanedContent.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
    }
    
    console.log('Cleaned JSON:', cleanedContent);
    
    const travelDetails = JSON.parse(cleanedContent);
    
    return {
      travelDetails,
      currentStep: 'gathering_data'
    };
  } catch (error) {
    console.error('Error parsing travel details:', error);
    console.error('LLM response was:', result?.content);
    
    const fallbackDetails = extractBasicTravelInfo(lastMessage.content);
    
    return {
      travelDetails: fallbackDetails,
      currentStep: 'gathering_data'
    };
  }
}

function extractBasicTravelInfo(message) {
  const basicInfo = {
    fromLocation: "not specified",
    toLocation: "not specified",
    departureDate: "not specified",
    returnDate: "not specified",
    travelers: 1,
    budget: "not specified",
    preferences: [],
    duration: "not specified",
    specialRequirements: "not specified"
  };
  
  const lowerMessage = message.toLowerCase();
  

  const fromToMatch = message.match(/from\s+([^,\s]+(?:\s+[^,\s]+)*)\s+to\s+([^,\s]+(?:\s+[^,\s]+)*)/i);
  if (fromToMatch) {
    basicInfo.fromLocation = fromToMatch[1].trim();
    basicInfo.toLocation = fromToMatch[2].trim();
  }
  
  const destinationMatch = message.match(/(?:going to|visit|traveling to|trip to)\s+([^,\.\!]+)/i);
  if (destinationMatch && basicInfo.toLocation === "not specified") {
    basicInfo.toLocation = destinationMatch[1].trim();
  }
  
  const travelersMatch = message.match(/(\d+)\s+(?:people|travelers|adults|persons)/i);
  if (travelersMatch) {
    basicInfo.travelers = parseInt(travelersMatch[1]);
  }
  
  const budgetMatch = message.match(/\$(\d+(?:,\d+)*)/);
  if (budgetMatch) {
    basicInfo.budget = budgetMatch[1];
  }
  
  const durationMatch = message.match(/(\d+)\s+days?/i);
  if (durationMatch) {
    basicInfo.duration = `${durationMatch[1]} days`;
  }
  
  if (lowerMessage.includes('romantic')) {
    basicInfo.specialRequirements = 'romantic trip';
  } else if (lowerMessage.includes('family') || lowerMessage.includes('kids')) {
    basicInfo.specialRequirements = 'family trip';
  } else if (lowerMessage.includes('business')) {
    basicInfo.specialRequirements = 'business trip';
  }
  
  console.log('Fallback extraction result:', basicInfo);
  return basicInfo;
}

async function gatherTravelData(state) {
  const { travelDetails } = state;
  const toolResults = {};
  
  try {
    if (travelDetails.toLocation) {
      const weatherResult = await searchWeatherTool.func({
        location: travelDetails.toLocation,
        date: travelDetails.departureDate
      });
      toolResults.weather = JSON.parse(weatherResult);
    }
    
    if (travelDetails.fromLocation && travelDetails.toLocation && travelDetails.departureDate) {
      const flightResult = await searchFlightsTool.func({
        fromLocation: travelDetails.fromLocation,
        toLocation: travelDetails.toLocation,
        departureDate: travelDetails.departureDate,
        returnDate: travelDetails.returnDate,
        adults: travelDetails.travelers || 1
      });
      toolResults.flights = JSON.parse(flightResult);
    }
    
    // Search for hotels if destination is available
    if (travelDetails.toLocation) {
      const hotelResult = await searchHotelsTool.func({
        location: travelDetails.toLocation,
        checkIn: travelDetails.departureDate,
        checkOut: travelDetails.returnDate,
        adults: travelDetails.travelers || 2
      });
      toolResults.hotels = JSON.parse(hotelResult);
    }
    
    // Search for attractions
    if (travelDetails.toLocation) {
      const attractionsResult = await searchPlacesTool.func({
        query: 'tourist attractions museums landmarks',
        location: travelDetails.toLocation
      });
      toolResults.attractions = JSON.parse(attractionsResult);
    }
    
    // Search for restaurants
    if (travelDetails.toLocation) {
      const restaurantsResult = await searchRestaurantsTool.func({
        location: travelDetails.toLocation,
        cuisine: travelDetails.preferences?.includes('food') ? 'local' : '',
        priceRange: travelDetails.budget ? (parseInt(travelDetails.budget) > 2000 ? 'luxury' : 'mid-range') : 'mid-range'
      });
      toolResults.restaurants = JSON.parse(restaurantsResult);
    }
    
    return {
      toolResults,
      currentStep: 'creating_itinerary'
    };
  } catch (error) {
    console.error('Error gathering travel data:', error);
    return {
      toolResults: { error: 'Failed to gather travel data' },
      currentStep: 'creating_itinerary'
    };
  }
}

async function createItinerary(state) {
  const { messages, travelDetails, toolResults } = state;
  const lastMessage = messages[messages.length - 1];
  
  const itineraryPrompt = `
  Create a detailed travel itinerary based on this request: "${lastMessage.content}"
  
  EXTRACTED TRAVEL DETAILS:
  ${JSON.stringify(travelDetails, null, 2)}
  
  REAL-TIME DATA GATHERED:
  Weather: ${JSON.stringify(toolResults.weather || {}, null, 2)}
  Flights: ${JSON.stringify(toolResults.flights || {}, null, 2)}
  Hotels: ${JSON.stringify(toolResults.hotels || {}, null, 2)}
  Attractions: ${JSON.stringify(toolResults.attractions || {}, null, 2)}
  Restaurants: ${JSON.stringify(toolResults.restaurants || {}, null, 2)}
  
  Create a comprehensive hour-by-hour itinerary using the real data above. Include:
  - Flight information with exact times and prices
  - Hotel recommendations with real ratings and prices
  - Verified attractions with addresses and contact info
  - Restaurant suggestions with cuisine types and ratings
  - Weather considerations for activities
  - Transportation between locations
  - Budget breakdown using real prices
  - Alternative options for different weather conditions
  
  Format the response as a detailed day-by-day schedule with exact timing, locations, and practical information. Make sure it outputs a nice tailored markdown as I'm going to display it with react-markdown.
  `;
  
  const itineraryMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    new SystemMessage(itineraryPrompt),
    new HumanMessage(lastMessage.content)
  ];
  
  const result = await llm.invoke(itineraryMessages);
  
  return {
    finalResponse: result.content,
    currentStep: 'complete'
  };
}

const workflow = new StateGraph(AgentState);

workflow.addNode('analyze', analyzeUserRequest);
workflow.addNode('gather_data', gatherTravelData);
workflow.addNode('create_itinerary', createItinerary);

workflow.addEdge(START, 'analyze');
workflow.addEdge('analyze', 'gather_data');
workflow.addEdge('gather_data', 'create_itinerary');
workflow.addEdge('create_itinerary', END);

const agent = workflow.compile();

// Routes
app.get('/', (req, res) => {
  const pageData = {
    title: 'TripTailor - AI Travel Agent with Real-Time Data',
    appName: 'TripTailor',
    description: 'Your AI-powered travel agent with intelligent tool usage and real-time data',
    welcomeTitle: 'Welcome to TripTailor AI Agent! 🤖✈️',
    welcomeMessage: 'I\'m your intelligent travel agent powered by LangGraph. I can automatically detect your travel details and use real-time tools to create perfect itineraries.',
    welcomeSubMessage: 'Just tell me about your travel plans in natural language - I\'ll figure out the details and find the best options for you!',
    samplePrompts: [
      'I want to go from New York to Tokyo next month for 5 days with a $4000 budget',
      'Plan a romantic trip from London to Paris for July 15-20, looking for luxury experiences',
      'Family trip from Los Angeles to Orlando for Disney World, traveling with 2 kids in August',
      'Business trip from San Francisco to Singapore, need good hotels and restaurants'
    ]
  };
  
  res.render('index', pageData);
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let conversation = conversations.get(conversationId) || [];
    
    conversation.push({ role: 'user', content: message });

    const initialState = {
      messages: [{ role: 'user', content: message }],
      travelDetails: {},
      toolResults: {},
      currentStep: 'analyzing',
      finalResponse: ''
    };

    agentStates.set(conversationId, initialState);

    const finalState = await agent.invoke(initialState);

    conversation.push({ role: 'assistant', content: finalState.finalResponse });

    conversations.set(conversationId, conversation);

    if (conversation.length > 40) {
      conversation = conversation.slice(-40);
      conversations.set(conversationId, conversation);
    }

    res.json({ 
      response: finalState.finalResponse,
      conversationId: conversationId,
      travelDetails: finalState.travelDetails,
      toolsUsed: Object.keys(finalState.toolResults),
      agentWorkflow: {
        stepsCompleted: ['analyze', 'gather_data', 'create_itinerary'],
        dataGathered: finalState.toolResults
      }
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Sorry, I encountered an error while planning your trip. Please try again!',
      details: error.message 
    });
  }
});

app.get('/api/agent-state/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const state = agentStates.get(conversationId);
  
  if (!state) {
    return res.status(404).json({ error: 'Agent state not found' });
  }
  
  res.json(state);
});

app.post('/api/new-conversation', (req, res) => {
  const conversationId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
  res.json({ conversationId });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'TripTailor LangGraph Agent',
    version: '3.0.0',
    features: {
      serpApiEnabled: !!SERPAPI_KEY,
      groqApiEnabled: !!GROQ_API_KEY,
      langGraphEnabled: true,
      toolsAvailable: ['search_places', 'search_hotels', 'search_restaurants', 'search_flights', 'search_weather']
    }
  });
});

app.get('/api/conversation/:conversationId', (req, res) => {
  const { conversationId } = req.params;
  const conversation = conversations.get(conversationId);
  
  if (!conversation) {
    return res.status(404).json({ 
      error: 'Conversation not found',
      conversationId 
    });
  }
  
  res.json({ 
    conversation: conversation,
    conversationId: conversationId
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong with TripTailor Agent. Please try again!' 
  });
});

app.listen(PORT, () => {
  console.log(`🤖 TripTailor LangGraph Agent running on http://localhost:${PORT}`);
  console.log(`📝 Features enabled:`);
  console.log(`   - LangGraph workflow: ✅`);
  console.log(`   - Groq LLM: ${GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`   - SerpAPI tools: ${SERPAPI_KEY ? '✅' : '❌'}`);
  console.log(`   - Intelligent travel detail extraction: ✅`);
  console.log(`   - Real-time data gathering: ✅`);
  console.log(`🚀 Ready to create intelligent travel plans!`);
});
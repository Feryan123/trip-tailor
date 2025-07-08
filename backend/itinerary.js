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
const PORT = process.env.PORT || 8000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
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

function logSerpAPIError(toolName, error, params) {
  console.error(`❌ ${toolName} Error:`, {
    message: error.message,
    status: error.response?.status,
    statusText: error.response?.statusText,
    data: error.response?.data,
    params: params
  });
}

async function validateSerpAPI() {
  if (!SERPAPI_KEY) {
    console.warn('⚠️ SERPAPI_KEY not found - using fallback mode');
    return false;
  }
  
  try {
    console.log('🔑 Validating SerpAPI...');
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google',
        q: 'test',
        api_key: SERPAPI_KEY
      },
      timeout: 5000
    });
    console.log('✅ SerpAPI validation successful');
    return true;
  } catch (error) {
    console.error('❌ SerpAPI validation failed:', error.response?.data?.error || error.message);
    return false;
  }
}

const searchPlacesTool = new DynamicTool({
  name: 'search_places',
  description: 'Search for tourist attractions, landmarks, and places of interest in a specific location',
  schema: z.object({
    query: z.string().describe('What to search for (e.g., "tourist attractions", "museums", "parks")'),
    location: z.string().describe('The city or location to search in'),
  }),
  func: async ({ query, location }) => {
    const params = {
      engine: 'google',
      q: `${query} ${location} tourist attractions landmarks`,
      api_key: SERPAPI_KEY
    };
    
    try {
      console.log(`🔍 Searching places: ${query} in ${location}`);
      
      if (!SERPAPI_KEY) {
        throw new Error('No API key available');
      }
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 10000
      });
      
      const organicResults = response.data.organic_results || [];
      const places = organicResults.slice(0, 6).map((result, index) => ({
        name: result.title,
        description: result.snippet,
        website: result.link,
        source: result.displayed_link,
        rating: 'Check reviews online',
        address: 'See website for details',
        rank: index + 1
      }));
      
      console.log(`✅ Found ${places.length} places for ${location}`);
      
      return JSON.stringify({
        location: location,
        searchType: 'Tourist Attractions & Places',
        results: places,
        totalFound: organicResults.length,
        dataSource: 'SerpAPI Google Search'
      });
      
    } catch (error) {
      logSerpAPIError('Places Search', error, params);
      
      // Fallback with mock data
      const mockPlaces = [
        {
          name: `Popular Attraction in ${location}`,
          description: `A must-visit destination in ${location} featuring local culture and history`,
          website: 'https://tripadvisor.com',
          source: 'Visit local tourism websites',
          rating: 'Check TripAdvisor for ratings',
          address: `Central ${location}`,
          rank: 1
        },
        {
          name: `${location} Historic Center`,
          description: `Historic district with traditional architecture and local attractions`,
          website: 'https://google.com/maps',
          source: 'Use Google Maps for navigation',
          rating: 'Highly rated on travel sites',
          address: `Downtown ${location}`,
          rank: 2
        }
      ];
      
      return JSON.stringify({
        location: location,
        searchType: 'Tourist Attractions & Places',
        results: mockPlaces,
        totalFound: 2,
        dataSource: 'Fallback recommendations',
        note: 'API temporarily unavailable - showing popular recommendations'
      });
    }
  }
});

const searchHotelsTool = new DynamicTool({
  name: 'search_hotels',
  description: 'Search for hotels and accommodations in a specific location',
  schema: z.object({
    location: z.string().describe('The city or location to search for hotels'),
    checkIn: z.string().optional().describe('Check-in date in YYYY-MM-DD format'),
    checkOut: z.string().optional().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().optional().describe('Number of adults (default: 2)'),
  }),
  func: async ({ location, checkIn, checkOut, adults = 2 }) => {
    const searchQuery = `best hotels ${location} booking accommodation`;
    const params = {
      engine: 'google',
      q: searchQuery,
      api_key: SERPAPI_KEY
    };
    
    try {
      console.log(`🏨 Searching hotels in ${location}`);
      
      if (!SERPAPI_KEY) {
        throw new Error('No API key available');
      }
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 10000
      });
      
      const organicResults = response.data.organic_results || [];
      const hotelResults = organicResults
        .filter(result => 
          result.title.toLowerCase().includes('hotel') || 
          result.snippet.toLowerCase().includes('hotel') ||
          result.link.includes('booking.com') ||
          result.link.includes('hotels.com') ||
          result.link.includes('expedia.com')
        )
        .slice(0, 5)
        .map((result, index) => ({
          name: result.title,
          description: result.snippet,
          bookingLink: result.link,
          source: result.displayed_link,
          rating: 'Check booking site for ratings',
          priceRange: 'See booking sites for current prices',
          amenities: 'View details on booking platform'
        }));
      
      console.log(`✅ Found ${hotelResults.length} hotel options for ${location}`);
      
      return JSON.stringify({
        location: location,
        checkIn: checkIn || 'Flexible dates',
        checkOut: checkOut || 'Flexible dates',
        adults: adults,
        hotels: hotelResults,
        bookingSites: ['Booking.com', 'Hotels.com', 'Expedia.com'],
        recommendation: 'Compare prices across multiple booking platforms',
        dataSource: 'SerpAPI Google Search'
      });
      
    } catch (error) {
      logSerpAPIError('Hotels Search', error, params);
      
      const fallbackHotels = [
        {
          name: `${location} Central Hotel`,
          description: `Well-located hotel in central ${location} with modern amenities`,
          bookingLink: 'https://booking.com',
          source: 'booking.com',
          rating: 'Check Booking.com for current ratings',
          priceRange: 'Mid-range to luxury options available',
          amenities: 'Standard hotel amenities expected'
        },
        {
          name: `${location} Business Hotel`,
          description: `Business-friendly accommodation near ${location} city center`,
          bookingLink: 'https://hotels.com',
          source: 'hotels.com',
          rating: 'See Hotels.com for reviews',
          priceRange: 'Competitive business rates',
          amenities: 'Business center, wifi, fitness'
        }
      ];
      
      return JSON.stringify({
        location: location,
        checkIn: checkIn || 'Flexible dates',
        checkOut: checkOut || 'Flexible dates',
        adults: adults,
        hotels: fallbackHotels,
        bookingSites: ['Booking.com', 'Hotels.com', 'Expedia.com'],
        recommendation: 'Check major booking sites for availability and rates',
        dataSource: 'Fallback recommendations',
        note: 'API temporarily unavailable - showing general recommendations'
      });
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
    let searchQuery = `best restaurants ${location}`;
    if (cuisine) searchQuery = `best ${cuisine} restaurants ${location}`;
    if (priceRange) searchQuery += ` ${priceRange}`;
    
    const params = {
      engine: 'google',
      q: searchQuery,
      api_key: SERPAPI_KEY
    };
    
    try {
      console.log(`🍽️ Searching restaurants: ${searchQuery}`);
      
      if (!SERPAPI_KEY) {
        throw new Error('No API key available');
      }
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 10000
      });
      
      const organicResults = response.data.organic_results || [];
      const restaurants = organicResults
        .filter(result => 
          result.title.toLowerCase().includes('restaurant') || 
          result.snippet.toLowerCase().includes('restaurant') ||
          result.snippet.toLowerCase().includes('dining') ||
          result.link.includes('tripadvisor') ||
          result.link.includes('yelp') ||
          result.link.includes('opentable')
        )
        .slice(0, 6)
        .map((result, index) => ({
          name: result.title,
          description: result.snippet,
          website: result.link,
          source: result.displayed_link,
          cuisine: cuisine || 'Various',
          rating: 'Check TripAdvisor or Yelp for ratings',
          priceLevel: priceRange || 'Various price ranges'
        }));
      
      console.log(`✅ Found ${restaurants.length} restaurants for ${location}`);
      
      return JSON.stringify({
        location: location,
        cuisine: cuisine || 'All cuisines',
        priceRange: priceRange || 'All price ranges',
        restaurants: restaurants,
        reviewSites: ['TripAdvisor', 'Yelp', 'Google Reviews'],
        recommendation: 'Check reviews and make reservations through OpenTable',
        dataSource: 'SerpAPI Google Search'
      });
      
    } catch (error) {
      logSerpAPIError('Restaurants Search', error, params);
      
      // Fallback recommendations
      const fallbackRestaurants = [
        {
          name: `${location} Local Cuisine Restaurant`,
          description: `Authentic local dining experience featuring traditional ${location} cuisine`,
          website: 'https://tripadvisor.com',
          source: 'tripadvisor.com',
          cuisine: cuisine || 'Local',
          rating: 'Check TripAdvisor for reviews',
          priceLevel: priceRange || 'Mid-range'
        },
        {
          name: `Popular ${cuisine || 'International'} Restaurant in ${location}`,
          description: `Well-reviewed ${cuisine || 'international'} restaurant popular with locals and tourists`,
          website: 'https://yelp.com',
          source: 'yelp.com',
          cuisine: cuisine || 'International',
          rating: 'See Yelp for ratings and reviews',
          priceLevel: priceRange || 'Mid-range'
        }
      ];
      
      return JSON.stringify({
        location: location,
        cuisine: cuisine || 'All cuisines',
        priceRange: priceRange || 'All price ranges',
        restaurants: fallbackRestaurants,
        reviewSites: ['TripAdvisor', 'Yelp', 'Google Reviews'],
        recommendation: 'Search TripAdvisor, Yelp, or Google for local restaurant reviews',
        dataSource: 'Fallback recommendations',
        note: 'API temporarily unavailable - showing general recommendations'
      });
    }
  }
});

const searchFlightsTool = new DynamicTool({
  name: 'search_flights',
  description: 'Search for flight information between two locations',
  schema: z.object({
    fromLocation: z.string().describe('Departure city or airport code'),
    toLocation: z.string().describe('Arrival city or airport code'),
    departureDate: z.string().describe('Departure date in YYYY-MM-DD format'),
    returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format for round trip'),
    adults: z.number().optional().describe('Number of adult passengers (default: 1)'),
  }),
  func: async ({ fromLocation, toLocation, departureDate, returnDate, adults = 1 }) => {
    const searchQuery = `flights ${fromLocation} to ${toLocation} ${departureDate}`;
    const params = {
      engine: 'google',
      q: searchQuery,
      api_key: SERPAPI_KEY
    };
    
    try {
      console.log(`✈️ Searching flights: ${fromLocation} → ${toLocation}`);
      
      if (!SERPAPI_KEY) {
        throw new Error('No API key available');
      }
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 10000
      });
      
      const organicResults = response.data.organic_results || [];
      const flightSources = organicResults
        .filter(result => 
          result.link.includes('kayak') || 
          result.link.includes('expedia') ||
          result.link.includes('skyscanner') ||
          result.link.includes('momondo') ||
          result.link.includes('google.com/flights') ||
          result.snippet.toLowerCase().includes('flight')
        )
        .slice(0, 4)
        .map(result => ({
          site: result.displayed_link,
          title: result.title,
          description: result.snippet,
          link: result.link
        }));
      
      console.log(`✅ Found ${flightSources.length} flight booking sources`);
      
      return JSON.stringify({
        route: `${fromLocation} → ${toLocation}`,
        departureDate: departureDate,
        returnDate: returnDate || 'One way',
        passengers: adults,
        bookingSources: flightSources,
        majorSites: ['Google Flights', 'Kayak', 'Expedia', 'Skyscanner'],
        recommendation: 'Compare prices across multiple booking platforms',
        tips: 'Book 6-8 weeks in advance for best domestic prices, 2-3 months for international',
        dataSource: 'SerpAPI Google Search'
      });
      
    } catch (error) {
      logSerpAPIError('Flights Search', error, params);
      
      return JSON.stringify({
        route: `${fromLocation} → ${toLocation}`,
        departureDate: departureDate,
        returnDate: returnDate || 'One way',
        passengers: adults,
        bookingSources: [],
        majorSites: ['Google Flights', 'Kayak', 'Expedia', 'Skyscanner'],
        recommendation: 'Visit Google Flights, Kayak, or Expedia to search for flights',
        tips: 'Compare prices across multiple sites and consider flexible dates',
        dataSource: 'Fallback recommendations',
        note: 'API temporarily unavailable - use major booking sites directly'
      });
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
    let searchQuery = `weather ${location}`;
    if (date) {
      const dateObj = new Date(date);
      const formattedDate = dateObj.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric' 
      });
      searchQuery += ` ${formattedDate}`;
    }
    
    const params = {
      engine: 'google',
      q: searchQuery,
      api_key: SERPAPI_KEY
    };
    
    try {
      console.log(`🌤️ Searching weather for ${location}`);
      
      if (!SERPAPI_KEY) {
        throw new Error('No API key available');
      }
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 10000
      });
      
      const answerBox = response.data.answer_box || {};
      const organicResults = response.data.organic_results || [];
      const weatherSources = organicResults
        .filter(result => 
          result.link.includes('weather.com') ||
          result.link.includes('accuweather.com') ||
          result.snippet.toLowerCase().includes('weather')
        )
        .slice(0, 2);
      
      console.log(`✅ Retrieved weather info for ${location}`);
      
      return JSON.stringify({
        location: location,
        date: date || 'Current',
        temperature: answerBox.temperature || 'Check weather services',
        condition: answerBox.weather || answerBox.description || 'See weather sources',
        forecast: answerBox.forecast || 'Check weather.com for detailed forecast',
        sources: weatherSources.map(result => ({
          title: result.title,
          link: result.link,
          snippet: result.snippet
        })),
        recommendation: `Check Weather.com or AccuWeather for detailed ${location} forecast`,
        dataSource: 'SerpAPI Google Search'
      });
      
    } catch (error) {
      logSerpAPIError('Weather Search', error, params);
      
      return JSON.stringify({
        location: location,
        date: date || 'Current',
        temperature: 'Check weather.com',
        condition: 'Variable conditions expected',
        forecast: 'See weather services for current forecast',
        sources: [],
        recommendation: `Visit Weather.com or AccuWeather for ${location} weather details`,
        dataSource: 'Fallback recommendations',
        note: 'API temporarily unavailable - check weather sites directly'
      });
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

const SYSTEM_PROMPT = `You are TripTailor, an advanced AI travel planning assistant with access to real-time data through various search tools. Your mission is to create detailed, personalized travel itineraries with practical information.

CORE CAPABILITIES:
- Extract travel details from natural language (locations, dates, budget, preferences)
- Search for real-time information using available tools
- Create detailed day-by-day itineraries
- Provide verified recommendations with booking information
- Suggest alternatives based on weather, budget, and preferences
- Use memory passed to the prompt

INTELLIGENCE FEATURES:
- Automatically detect FROM and TO locations from user messages
- Parse dates in various formats (natural language, ISO, etc.)
- Understand budget constraints and preferences
- Identify travel party size and special requirements
- Recognize activity preferences and interests

AVAILABLE TOOLS:
- search_places: Find attractions, landmarks, and points of interest
- search_hotels: Get accommodation options and booking sites
- search_restaurants: Find dining options by cuisine and price range
- search_flights: Get flight booking information between locations
- search_weather: Get weather information for travel dates

RESPONSE FORMAT:
Create detailed day-by-day itineraries in Markdown format with:
- Suggested times for each activity (e.g., "Morning: 9:00 AM - 12:00 PM")
- Specific locations with booking information
- Use bullet points for clarity. 
- Include links to booking sites and resources
- Don't use too much whitespace; keep it concise
- Transportation suggestions between locations
- Budget considerations for each activity
- Alternative options for different weather/preferences
- Local tips and cultural insights
- Specific booking recommendations and websites

IMPORTANT NOTES:
- When API data is limited, acknowledge this and provide general recommendations
- Always include booking websites and travel resources
- Focus on practical, actionable advice
- Provide backup plans and alternatives
- Format responses in clear, easy-to-follow markdown
- You will also be inputted memory from the frontend, which will be passed to the prompt

TOOL USAGE STRATEGY:
1. First, analyze the user's message to extract travel details
2. Use search_weather to check conditions for travel dates
3. Use search_flights to find booking options
4. Use search_hotels to find accommodation options
5. Use search_places to find attractions and activities
6. Use search_restaurants to find dining options
7. Synthesize all information into a comprehensive itinerary

Always provide actionable, detailed responses that someone can follow step-by-step. Include booking information and practical travel tips.`;

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
    console.log('🧠 Raw LLM response:', result.content);
    
    let cleanedContent = result.content.trim();
    
    const firstBrace = cleanedContent.indexOf('{');
    const lastBrace = cleanedContent.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
    }
    
    console.log('🧹 Cleaned JSON:', cleanedContent);
    
    const travelDetails = JSON.parse(cleanedContent);
    console.log('✅ Extracted travel details:', travelDetails);
    
    return {
      travelDetails,
      currentStep: 'gathering_data'
    };
  } catch (error) {
    console.error('❌ Error parsing travel details:', error);
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
    basicInfo.budget = budgetMatch[1]; // This will be a string like "4000" or "2,500"
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
  
  console.log('Starting data gathering phase...');
  console.log('Travel details received:', JSON.stringify(travelDetails, null, 2));
  
  try {
    // Always search for weather if destination is specified
    if (travelDetails.toLocation && travelDetails.toLocation !== "not specified") {
      console.log(`Getting weather for ${travelDetails.toLocation}`);
      try {
        const weatherResult = await searchWeatherTool.func({
          location: travelDetails.toLocation,
          date: travelDetails.departureDate !== "not specified" ? travelDetails.departureDate : undefined
        });
        toolResults.weather = JSON.parse(weatherResult);
      } catch (error) {
        console.error('Weather search failed:', error.message);
        toolResults.weather = { error: 'Weather data unavailable' };
      }
    }
    
    // Search for flights if both locations are specified
    if (travelDetails.fromLocation !== "not specified" && 
        travelDetails.toLocation !== "not specified" && 
        travelDetails.departureDate !== "not specified") {
      console.log(`✈️ Getting flights from ${travelDetails.fromLocation} to ${travelDetails.toLocation}`);
      try {
        const flightResult = await searchFlightsTool.func({
          fromLocation: travelDetails.fromLocation,
          toLocation: travelDetails.toLocation,
          departureDate: travelDetails.departureDate,
          returnDate: travelDetails.returnDate !== "not specified" ? travelDetails.returnDate : undefined,
          adults: travelDetails.travelers || 1
        });
        toolResults.flights = JSON.parse(flightResult);
      } catch (error) {
        console.error('Flight search failed:', error.message);
        toolResults.flights = { error: 'Flight data unavailable' };
      }
    }
    
    // Search for hotels if destination is available
    if (travelDetails.toLocation && travelDetails.toLocation !== "not specified") {
      console.log(`🏨 Getting hotels for ${travelDetails.toLocation}`);
      try {
        const hotelResult = await searchHotelsTool.func({
          location: travelDetails.toLocation,
          checkIn: travelDetails.departureDate !== "not specified" ? travelDetails.departureDate : undefined,
          checkOut: travelDetails.returnDate !== "not specified" ? travelDetails.returnDate : undefined,
          adults: travelDetails.travelers || 2
        });
        toolResults.hotels = JSON.parse(hotelResult);
      } catch (error) {
        console.error('❌ Hotel search failed:', error.message);
        toolResults.hotels = { error: 'Hotel data unavailable' };
      }
    }
    
    // Search for attractions
    if (travelDetails.toLocation && travelDetails.toLocation !== "not specified") {
      console.log(`Getting attractions for ${travelDetails.toLocation}`);
      try {
        const attractionsResult = await searchPlacesTool.func({
          query: 'tourist attractions museums landmarks',
          location: travelDetails.toLocation
        });
        toolResults.attractions = JSON.parse(attractionsResult);
      } catch (error) {
        console.error('❌ Attractions search failed:', error.message);
        toolResults.attractions = { error: 'Attractions data unavailable' };
      }
    }
    
    // Search for restaurants
    if (travelDetails.toLocation && travelDetails.toLocation !== "not specified") {
      console.log(`Getting restaurants for ${travelDetails.toLocation}`);
      
      // Safe budget parsing
      let priceRange = '';
      if (travelDetails.budget && travelDetails.budget !== "not specified") {
        try {
          // Convert budget to string and remove commas, then parse as integer
          const budgetStr = String(travelDetails.budget).replace(/[,$]/g, '');
          const budgetNum = parseInt(budgetStr);
          if (!isNaN(budgetNum)) {
            priceRange = budgetNum > 2000 ? 'luxury' : 'mid-range';
            console.log(`Budget parsed: ${budgetNum} → ${priceRange} price range`);
          }
        } catch (error) {
          console.warn('Could not parse budget:', travelDetails.budget);
          priceRange = 'mid-range'; // Default fallback
        }
      }
      
      try {
        const restaurantsResult = await searchRestaurantsTool.func({
          location: travelDetails.toLocation,
          cuisine: travelDetails.preferences?.includes('food') ? 'local' : '',
          priceRange: priceRange
        });
        toolResults.restaurants = JSON.parse(restaurantsResult);
      } catch (error) {
        console.error('Restaurant search failed:', error.message);
        toolResults.restaurants = { error: 'Restaurant data unavailable' };
      }
    }
    
    console.log('✅ Data gathering complete');
    
    return {
      toolResults,
      currentStep: 'creating_itinerary'
    };
  } catch (error) {
    console.error('Error gathering travel data:', error);
    return {
      toolResults: { error: 'Failed to gather travel data', details: error.message },
      currentStep: 'creating_itinerary'
    };
  }
}

async function createItinerary(state) {
  const { messages, travelDetails, toolResults } = state;
  const lastMessage = messages[messages.length - 1];
  
  console.log('Creating itinerary...');
  
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
  
  Create a comprehensive itinerary using the real data above. Include:
  - Flight booking information and recommended sites. Must be specific like what flight number, airline, and booking links.
  - Hotel recommendations with booking platforms. Must be specific like hotel names, locations, and booking links.
  - Verified attractions with website links
  - Restaurant suggestions with review sites
  - Weather considerations for activities
  - Transportation suggestions between locations
  - Budget considerations using available pricing info
  - Alternative options for different weather conditions
  - Practical booking tips and recommendations
  
  IMPORTANT:
  - If data shows "API temporarily unavailable" or fallback recommendations, acknowledge this
  - Focus on actionable advice with specific booking websites
  - Include backup plans and alternatives
  - Format as detailed markdown for easy reading
  - Provide realistic timing suggestions
  - Include local tips and cultural insights
  
  Format the response as a detailed day-by-day schedule with practical information and booking guidance.
  `;
  
  const itineraryMessages = [
    new SystemMessage(SYSTEM_PROMPT),
    new SystemMessage(itineraryPrompt),
    new HumanMessage(lastMessage.content)
  ];
  
  try {
    const result = await llm.invoke(itineraryMessages);
    console.log('✅ Itinerary created successfully');
    
    return {
      finalResponse: result.content,
      currentStep: 'complete'
    };
  } catch (error) {
    console.error('❌ Error creating itinerary:', error);
    
    // Fallback response if LLM fails
    const fallbackResponse = `# Travel Planning Assistant

I encountered an issue creating your detailed itinerary, but I can still help you plan your trip!

## Based on your request:
${travelDetails.toLocation !== "not specified" ? `**Destination:** ${travelDetails.toLocation}` : ""}
${travelDetails.fromLocation !== "not specified" ? `**From:** ${travelDetails.fromLocation}` : ""}
${travelDetails.departureDate !== "not specified" ? `**Departure:** ${travelDetails.departureDate}` : ""}
${travelDetails.travelers > 1 ? `**Travelers:** ${travelDetails.travelers} people` : ""}

## General Recommendations:

### Booking Resources:
- **Flights:** Google Flights, Kayak, Expedia
- **Hotels:** Booking.com, Hotels.com, Airbnb
- **Restaurants:** TripAdvisor, Yelp, OpenTable
- **Attractions:** TripAdvisor, Viator, GetYourGuide

### Planning Tips:
1. Book flights 6-8 weeks in advance for domestic, 2-3 months for international
2. Compare hotel prices across multiple booking sites
3. Check weather forecasts closer to your travel date
4. Research local transportation options
5. Make restaurant reservations in advance for popular places

Please try asking again with your specific travel details, and I'll do my best to create a detailed itinerary for you!`;

    return {
      finalResponse: fallbackResponse,
      currentStep: 'complete'
    };
  }
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

// Initialize API validation on startup
let serpApiValid = false;
validateSerpAPI().then(isValid => {
  serpApiValid = isValid;
});

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

    console.log(`💬 New chat message from ${conversationId}: ${message.substring(0, 100)}...`);

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

    console.log('🤖 Starting agent workflow...');
    const finalState = await agent.invoke(initialState);

    conversation.push({ role: 'assistant', content: finalState.finalResponse });

    conversations.set(conversationId, conversation);

    // Keep conversation history manageable
    if (conversation.length > 40) {
      conversation = conversation.slice(-40);
      conversations.set(conversationId, conversation);
    }

    console.log('✅ Agent workflow completed successfully');

    res.json({ 
      response: finalState.finalResponse,
      conversationId: conversationId,
      travelDetails: finalState.travelDetails,
      toolsUsed: Object.keys(finalState.toolResults),
      agentWorkflow: {
        stepsCompleted: ['analyze', 'gather_data', 'create_itinerary'],
        dataGathered: finalState.toolResults
      },
      apiStatus: {
        serpApiEnabled: serpApiValid,
        dataQuality: serpApiValid ? 'Real-time' : 'Fallback recommendations'
      }
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
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
  console.log(`🆕 New conversation created: ${conversationId}`);
  res.json({ conversationId });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'TripTailor LangGraph Agent',
    version: '4.0.0',
    features: {
      serpApiEnabled: !!SERPAPI_KEY,
      serpApiValid: serpApiValid,
      groqApiEnabled: !!GROQ_API_KEY,
      langGraphEnabled: true,
      toolsAvailable: ['search_places', 'search_hotels', 'search_restaurants', 'search_flights', 'search_weather']
    },
    performance: {
      conversations: conversations.size,
      agentStates: agentStates.size
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

// Test endpoint for debugging SerpAPI
app.get('/api/test-serpapi', async (req, res) => {
  try {
    const isValid = await validateSerpAPI();
    res.json({
      serpApiValid: isValid,
      hasApiKey: !!SERPAPI_KEY,
      message: isValid ? 'SerpAPI is working correctly' : 'SerpAPI validation failed - using fallback mode'
    });
  } catch (error) {
    res.status(500).json({
      error: 'SerpAPI test failed',
      details: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error('💥 Server error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong with TripTailor Agent. Please try again!' 
  });
});

app.listen(PORT, async () => {
  console.log(`🤖 TripTailor LangGraph Agent running on http://localhost:${PORT}`);
  console.log(`📝 Features enabled:`);
  console.log(`   - LangGraph workflow: ✅`);
  console.log(`   - Groq LLM: ${GROQ_API_KEY ? '✅' : '❌'}`);
  console.log(`   - SerpAPI tools: ${SERPAPI_KEY ? '✅' : '❌'}`);
  
  // Validate SerpAPI on startup
  if (SERPAPI_KEY) {
    console.log('🔍 Validating SerpAPI...');
    serpApiValid = await validateSerpAPI();
    console.log(`   - SerpAPI status: ${serpApiValid ? '✅ Valid' : '⚠️ Using fallback mode'}`);
  }
  
  console.log(`   - Intelligent travel detail extraction: ✅`);
  console.log(`   - Real-time data gathering: ✅`);
  console.log(`   - Enhanced error handling: ✅`);
  console.log(`   - Fallback mechanisms: ✅`);
  console.log(`🚀 Ready to create intelligent travel plans!`);
  console.log(`📍 Visit http://localhost:${PORT}/health for status check`);
  console.log(`🧪 Visit http://localhost:${PORT}/api/test-serpapi for API testing`);
});
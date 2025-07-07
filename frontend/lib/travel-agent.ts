// lib/travel-agent.ts - Fixed version with better error handling and parameter validation

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGroq } from '@langchain/groq';
import { DynamicTool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

// Types
export interface TravelDetails {
  fromLocation: string;
  toLocation: string;
  departureDate: string;
  returnDate: string;
  travelers: number;
  budget: string;
  preferences: string[];
  duration: string;
  specialRequirements: string;
}

export interface ToolResults {
  weather?: any;
  flights?: any;
  hotels?: any;
  attractions?: any;
  restaurants?: any;
  error?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Initialize LLM with fallback
const createLLM = () => {
  if (!process.env.GROQ_API_KEY) {
    console.warn('GROQ_API_KEY not found. LLM features will be limited.');
    return null;
  }
  
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: 'llama-3.1-8b-instant',
    temperature: 0.7,
    maxTokens: 2000,
  });
};

const llm = createLLM();

const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
const SERPAPI_URL = 'https://serpapi.com/search';

// Helper function to check if SerpAPI is available
const isSerpAPIAvailable = () => {
  if (!SERPAPI_KEY) {
    console.warn('SERPAPI_API_KEY not found. Using mock data.');
    return false;
  }
  return true;
};

// Helper function to validate date format
const isValidDate = (dateString: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

// Helper function to format location for API calls
const formatLocationForAPI = (location: string): string => {
  return location.trim().replace(/\s+/g, ' ');
};

// Enhanced tool definitions with better error handling and parameter validation
export const searchPlacesTool = new DynamicTool({
  name: 'search_places',
  description: 'Search for tourist attractions, landmarks, and places of interest in a specific location',
  schema: z.object({
    query: z.string().describe('What to search for (e.g., "tourist attractions", "museums", "parks")'),
    location: z.string().describe('The city or location to search in'),
  }),
  func: async ({ query, location }: { query: string; location: string }) => {
    if (!isSerpAPIAvailable()) {
      return JSON.stringify([
        {
          name: `Sample Attraction in ${location}`,
          rating: 4.5,
          address: `123 Main St, ${location}`,
          type: 'Tourist Attraction',
          description: 'A popular local attraction worth visiting'
        },
        {
          name: `${location} Museum`,
          rating: 4.2,
          address: `456 Culture Ave, ${location}`,
          type: 'Museum',
          description: 'Learn about local history and culture'
        }
      ]);
    }

    try {
      const formattedLocation = formatLocationForAPI(location);
      const response = await axios.get(SERPAPI_URL, {
        params: {
          engine: 'google_maps',
          q: `${query} in ${formattedLocation}`,
          api_key: SERPAPI_KEY,
          hl: 'en'
        },
        timeout: 10000
      });
      
      if (!response.data || !response.data.local_results) {
        throw new Error('No results found');
      }
      
      const results = response.data.local_results || [];
      return JSON.stringify(results.slice(0, 8).map((place: any) => ({
        name: place.title || 'Unknown',
        rating: place.rating || 'N/A',
        address: place.address || 'Address not available',
        website: place.website || null,
        phone: place.phone || null,
        type: place.type || 'Attraction',
        description: place.description || place.snippet || 'No description available'
      })));
    } catch (error: any) {
      console.error('Error searching places:', error.message);
      return JSON.stringify([{
        name: `Popular attractions in ${location}`,
        rating: 4.0,
        address: location,
        type: 'Mixed',
        description: 'Unable to fetch real-time data. Please check popular travel sites for current attractions.',
        error: 'API temporarily unavailable'
      }]);
    }
  }
});

export const searchHotelsTool = new DynamicTool({
  name: 'search_hotels',
  description: 'Search for hotels and accommodations in a specific location with dates',
  schema: z.object({
    location: z.string().describe('The city or location to search for hotels'),
    checkIn: z.string().optional().describe('Check-in date in YYYY-MM-DD format'),
    checkOut: z.string().optional().describe('Check-out date in YYYY-MM-DD format'),
    adults: z.number().optional().describe('Number of adults (default: 2)'),
  }),
  func: async ({ location, checkIn, checkOut, adults = 2 }: { 
    location: string; 
    checkIn?: string; 
    checkOut?: string; 
    adults?: number; 
  }) => {
    if (!isSerpAPIAvailable()) {
      return JSON.stringify([
        {
          name: `Grand Hotel ${location}`,
          rating: 4.3,
          pricePerNight: '$120-180',
          amenities: ['WiFi', 'Pool', 'Gym'],
          description: 'Comfortable hotel in the city center'
        },
        {
          name: `Budget Inn ${location}`,
          rating: 3.8,
          pricePerNight: '$60-90',
          amenities: ['WiFi', 'Parking'],
          description: 'Affordable accommodation with basic amenities'
        }
      ]);
    }

    try {
      const formattedLocation = formatLocationForAPI(location);
      
      // Build parameters more carefully
      const params: any = {
        engine: 'google_hotels',
        q: formattedLocation,
        api_key: SERPAPI_KEY,
        hl: 'en',
        gl: 'us',
        currency: 'USD'
      };
      
      // Only add date parameters if they are valid
      if (checkIn && isValidDate(checkIn)) {
        params.check_in_date = checkIn;
      }
      if (checkOut && isValidDate(checkOut)) {
        params.check_out_date = checkOut;
      }
      
      // Validate adults parameter
      if (adults && adults > 0 && adults <= 10) {
        params.adults = adults;
      }
      
      console.log('Hotel search params:', params);
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 15000
      });
      
      console.log('Hotel search response status:', response.status);
      
      if (response.data.error) {
        throw new Error(`API Error: ${response.data.error}`);
      }
      
      const results = response.data.properties || [];
      
      if (results.length === 0) {
        // Return fallback data if no results
        return JSON.stringify([{
          name: `Hotels in ${location}`,
          rating: 'Various',
          pricePerNight: 'Check booking sites',
          description: 'No specific hotel data available. Please check major booking sites like Booking.com, Hotels.com, or Expedia.',
          error: 'No results found'
        }]);
      }
      
      return JSON.stringify(results.slice(0, 6).map((hotel: any) => ({
        name: hotel.name || 'Hotel',
        rating: hotel.overall_rating || 'N/A',
        pricePerNight: hotel.rate_per_night || 'Check availability',
        link: hotel.link || null,
        amenities: hotel.amenities || [],
        description: hotel.description || 'Hotel accommodation'
      })));
      
    } catch (error: any) {
      console.error('Error searching hotels:', error.message);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
      
      return JSON.stringify([{
        name: `Hotels in ${location}`,
        rating: 'Various',
        pricePerNight: 'Check booking sites',
        description: 'Unable to fetch hotel data at this time. Please check major booking sites for availability and pricing.',
        error: `API Error: ${error.message}`
      }]);
    }
  }
});

export const searchRestaurantsTool = new DynamicTool({
  name: 'search_restaurants',
  description: 'Search for restaurants and dining options in a specific location',
  schema: z.object({
    location: z.string().describe('The city or location to search for restaurants'),
    cuisine: z.string().optional().describe('Specific cuisine type'),
    priceRange: z.string().optional().describe('Price range preference'),
  }),
  func: async ({ location, cuisine = '', priceRange = '' }: { 
    location: string; 
    cuisine?: string; 
    priceRange?: string; 
  }) => {
    if (!isSerpAPIAvailable()) {
      return JSON.stringify([
        {
          name: `Local Bistro ${location}`,
          rating: 4.4,
          cuisine: cuisine || 'International',
          priceLevel: priceRange || 'Mid-range',
          description: 'Popular local restaurant with great reviews'
        },
        {
          name: `Traditional ${location} Kitchen`,
          rating: 4.1,
          cuisine: 'Local',
          priceLevel: 'Budget-friendly',
          description: 'Authentic local cuisine experience'
        }
      ]);
    }

    try {
      const formattedLocation = formatLocationForAPI(location);
      let query = `restaurants in ${formattedLocation}`;
      if (cuisine) query = `${cuisine} restaurants in ${formattedLocation}`;
      if (priceRange) query += ` ${priceRange}`;
      
      const response = await axios.get(SERPAPI_URL, {
        params: {
          engine: 'google_maps',
          q: query,
          api_key: SERPAPI_KEY,
          hl: 'en'
        },
        timeout: 10000
      });
      
      const results = response.data.local_results || [];
      return JSON.stringify(results.slice(0, 8).map((restaurant: any) => ({
        name: restaurant.title || 'Restaurant',
        rating: restaurant.rating || 'N/A',
        address: restaurant.address || location,
        website: restaurant.website || null,
        phone: restaurant.phone || null,
        cuisine: restaurant.type || cuisine || 'Various',
        priceLevel: restaurant.price || priceRange || 'N/A',
        description: restaurant.description || restaurant.snippet || 'Local dining option'
      })));
    } catch (error: any) {
      console.error('Error searching restaurants:', error.message);
      return JSON.stringify([{
        name: `Restaurants in ${location}`,
        rating: 'Various',
        cuisine: cuisine || 'Mixed',
        description: 'Unable to fetch real-time restaurant data. Please check Google Maps or Yelp for current restaurant listings.',
        error: 'API temporarily unavailable'
      }]);
    }
  }
});

export const searchFlightsTool = new DynamicTool({
  name: 'search_flights',
  description: 'Search for flights between two locations',
  schema: z.object({
    fromLocation: z.string().describe('Departure city or airport code'),
    toLocation: z.string().describe('Arrival city or airport code'),
    departureDate: z.string().describe('Departure date in YYYY-MM-DD format'),
    returnDate: z.string().optional().describe('Return date in YYYY-MM-DD format for round trip'),
    adults: z.number().optional().describe('Number of adult passengers (default: 1)'),
  }),
  func: async ({ fromLocation, toLocation, departureDate, returnDate, adults = 1 }: {
    fromLocation: string;
    toLocation: string;
    departureDate: string;
    returnDate?: string;
    adults?: number;
  }) => {
    if (!isSerpAPIAvailable()) {
      return JSON.stringify([
        {
          airline: 'Major Airline',
          price: '$400-800',
          duration: '4-8 hours',
          departure: fromLocation,
          arrival: toLocation,
          flightType: returnDate ? 'Round trip' : 'One way',
          note: 'Prices vary by date and availability'
        }
      ]);
    }

    try {
      const formattedFrom = formatLocationForAPI(fromLocation);
      const formattedTo = formatLocationForAPI(toLocation);
      
      // Validate dates
      if (!isValidDate(departureDate)) {
        throw new Error('Invalid departure date format. Use YYYY-MM-DD');
      }
      
      if (returnDate && !isValidDate(returnDate)) {
        throw new Error('Invalid return date format. Use YYYY-MM-DD');
      }
      
      // Build parameters carefully for Google Flights
      const params: any = {
        engine: 'google_flights',
        departure_id: formattedFrom,
        arrival_id: formattedTo,
        outbound_date: departureDate,
        api_key: SERPAPI_KEY,
        hl: 'en',
        gl: 'us',
        currency: 'USD'
      };
      
      if (returnDate) {
        params.return_date = returnDate;
      }
      
      if (adults && adults > 0 && adults <= 9) {
        params.adults = adults;
      }
      
      console.log('Flight search params:', params);
      
      const response = await axios.get(SERPAPI_URL, { 
        params,
        timeout: 15000
      });
      
      console.log('Flight search response status:', response.status);
      
      if (response.data.error) {
        throw new Error(`API Error: ${response.data.error}`);
      }
      
      const results = response.data.best_flights || response.data.other_flights || [];
      
      if (results.length === 0) {
        return JSON.stringify([{
          airline: 'Flight Search',
          price: 'Check airline websites',
          duration: 'Varies',
          departure: fromLocation,
          arrival: toLocation,
          description: 'No specific flight data available. Please check airline websites or travel booking sites.',
          error: 'No results found'
        }]);
      }
      
      return JSON.stringify(results.slice(0, 5).map((flight: any) => ({
        airline: flight.flights?.[0]?.airline || 'Various Airlines',
        price: flight.price || 'Check availability',
        duration: flight.total_duration || 'N/A',
        departure: flight.flights?.[0]?.departure_airport?.name || fromLocation,
        arrival: flight.flights?.[0]?.arrival_airport?.name || toLocation,
        departureTime: flight.flights?.[0]?.departure_time || 'N/A',
        arrivalTime: flight.flights?.[0]?.arrival_time || 'N/A',
        stops: flight.flights?.[0]?.airplane ? 0 : 'Check details',
        booking_token: flight.booking_token || null
      })));
      
    } catch (error: any) {
      console.error('Error searching flights:', error.message);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
      
      return JSON.stringify([{
        airline: 'Flight Search',
        price: 'Check airline websites',
        duration: 'Varies',
        departure: fromLocation,
        arrival: toLocation,
        description: 'Unable to fetch flight data at this time. Please check airline websites or travel booking sites for current prices and availability.',
        error: `API Error: ${error.message}`
      }]);
    }
  }
});

export const searchWeatherTool = new DynamicTool({
  name: 'search_weather',
  description: 'Get weather information for a specific location and date range',
  schema: z.object({
    location: z.string().describe('The city or location to get weather for'),
    date: z.string().optional().describe('Specific date in YYYY-MM-DD format'),
  }),
  func: async ({ location, date }: { location: string; date?: string }) => {
    if (!isSerpAPIAvailable()) {
      return JSON.stringify({
        location: location,
        current: '20-25°C',
        condition: 'Pleasant',
        forecast: 'Check local weather services for accurate forecasts',
        note: 'Weather data unavailable - using sample data'
      });
    }

    try {
      const formattedLocation = formatLocationForAPI(location);
      let query = `weather in ${formattedLocation}`;
      if (date) query += ` ${date}`;
      
      const response = await axios.get(SERPAPI_URL, {
        params: {
          engine: 'google',
          q: query,
          api_key: SERPAPI_KEY,
          hl: 'en'
        },
        timeout: 10000
      });
      
      const weatherInfo = response.data.answer_box || {};
      return JSON.stringify({
        location: location,
        current: weatherInfo.temperature || 'Check weather.com',
        condition: weatherInfo.weather || 'Variable',
        forecast: weatherInfo.forecast || 'Check local weather services for detailed forecast',
        date: date || 'Current'
      });
    } catch (error: any) {
      console.error('Error searching weather:', error.message);
      return JSON.stringify({
        location: location,
        error: 'Unable to fetch weather data',
        recommendation: 'Please check weather.com or local weather services for current conditions and forecasts'
      });
    }
  }
});

// Agent State Definition
export const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x: any[], y: any[]) => x.concat(y),
    default: () => []
  }),
  travelDetails: Annotation({
    reducer: (x: TravelDetails, y: Partial<TravelDetails>) => ({ ...x, ...y }),
    default: () => ({} as TravelDetails)
  }),
  toolResults: Annotation({
    reducer: (x: ToolResults, y: ToolResults) => ({ ...x, ...y }),
    default: () => ({} as ToolResults)
  }),
  currentStep: Annotation({
    reducer: (x: string, y: string) => y,
    default: () => 'analyzing'
  }),
  finalResponse: Annotation({
    reducer: (x: string, y: string) => y,
    default: () => ''
  })
});

export const SYSTEM_PROMPT = `You are TripTailor, an intelligent travel planning assistant. Create detailed, helpful travel itineraries using the available data.

When tools return mock data or errors, acknowledge this gracefully and provide helpful alternative suggestions.

Always create comprehensive itineraries with:
- Day-by-day schedules with specific times
- Practical travel advice
- Budget considerations
- Alternative options
- Local insights and tips

Format responses in clear, readable markdown suitable for travelers to follow.`;

// Workflow functions with better error handling
export async function analyzeUserRequest(state: any) {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  
  if (!llm) {
    // Fallback extraction without LLM
    const travelDetails = extractBasicTravelInfo(lastMessage.content);
    return {
      travelDetails,
      currentStep: 'gathering_data'
    };
  }

  const extractionPrompt = `Extract travel details from: "${lastMessage.content}"
  
  Return only JSON:
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
  }`;
  
  try {
    const extractionMessage = [
      new SystemMessage(extractionPrompt),
      new HumanMessage(lastMessage.content)
    ];
    
    const result = await llm.invoke(extractionMessage);
    let cleanedContent = result.content.trim();
    
    const firstBrace = cleanedContent.indexOf('{');
    const lastBrace = cleanedContent.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanedContent = cleanedContent.substring(firstBrace, lastBrace + 1);
    }
    
    const travelDetails = JSON.parse(cleanedContent);
    
    return {
      travelDetails,
      currentStep: 'gathering_data'
    };
  } catch (error) {
    console.error('Error parsing travel details:', error);
    
    const fallbackDetails = extractBasicTravelInfo(lastMessage.content);
    
    return {
      travelDetails: fallbackDetails,
      currentStep: 'gathering_data'
    };
  }
}

export function extractBasicTravelInfo(message: string): TravelDetails {
  const basicInfo: TravelDetails = {
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
  
  // Extract from/to pattern
  const fromToMatch = message.match(/from\s+([^,\s]+(?:\s+[^,\s]+)*)\s+to\s+([^,\s]+(?:\s+[^,\s]+)*)/i);
  if (fromToMatch) {
    basicInfo.fromLocation = fromToMatch[1].trim();
    basicInfo.toLocation = fromToMatch[2].trim();
  }
  
  // Extract destination
  const destinationMatch = message.match(/(?:going to|visit|traveling to|trip to)\s+([^,\.\!]+)/i);
  if (destinationMatch && basicInfo.toLocation === "not specified") {
    basicInfo.toLocation = destinationMatch[1].trim();
  }
  
  // Extract travelers
  const travelersMatch = message.match(/(\d+)\s+(?:people|travelers|adults|persons)/i);
  if (travelersMatch) {
    basicInfo.travelers = parseInt(travelersMatch[1]);
  }
  
  // Extract budget
  const budgetMatch = message.match(/\$(\d+(?:,\d+)*)/);
  if (budgetMatch) {
    basicInfo.budget = budgetMatch[1];
  }
  
  // Extract duration
  const durationMatch = message.match(/(\d+)\s+days?/i);
  if (durationMatch) {
    basicInfo.duration = `${durationMatch[1]} days`;
  }
  
  // Extract special requirements
  if (lowerMessage.includes('romantic')) {
    basicInfo.specialRequirements = 'romantic trip';
  } else if (lowerMessage.includes('family') || lowerMessage.includes('kids')) {
    basicInfo.specialRequirements = 'family trip';
  } else if (lowerMessage.includes('business')) {
    basicInfo.specialRequirements = 'business trip';
  }
  
  return basicInfo;
}

export async function gatherTravelData(state: any) {
  const { travelDetails } = state;
  const toolResults: ToolResults = {};
  
  // Helper function for safe budget parsing
  const getBudgetRange = (budget: any): string => {
    if (!budget || budget === "not specified") return 'mid-range';
    
    try {
      const budgetStr = String(budget);
      const budgetNum = parseInt(budgetStr.replace(/[,$]/g, ''));
      return budgetNum > 2000 ? 'luxury' : budgetNum < 500 ? 'budget' : 'mid-range';
    } catch (error) {
      return 'mid-range';
    }
  };

  // Helper function for safe data access
  const getStringValue = (value: any, fallback: string = "not specified"): string => {
    return value && value !== "not specified" ? String(value) : fallback;
  };

  try {
    // Gather data using tools (with proper error handling built into each tool)
    const destination = getStringValue(travelDetails.toLocation);
    const departure = getStringValue(travelDetails.fromLocation);
    const departureDate = getStringValue(travelDetails.departureDate);
    const returnDate = getStringValue(travelDetails.returnDate);
    
    console.log('Gathering travel data for:', { destination, departure, departureDate, returnDate });
    
    if (destination !== "not specified") {
      // Weather search
      const weatherResult = await searchWeatherTool.func({
        location: destination,
        date: departureDate !== "not specified" ? departureDate : undefined
      });
      toolResults.weather = JSON.parse(weatherResult);

      // Attractions search
      const attractionsResult = await searchPlacesTool.func({
        query: 'tourist attractions landmarks',
        location: destination
      });
      toolResults.attractions = JSON.parse(attractionsResult);

      // Restaurants search
      const restaurantsResult = await searchRestaurantsTool.func({
        location: destination,
        cuisine: Array.isArray(travelDetails.preferences) && travelDetails.preferences.includes('food') ? 'local' : '',
        priceRange: getBudgetRange(travelDetails.budget)
      });
      toolResults.restaurants = JSON.parse(restaurantsResult);

      // Hotels search
      const hotelResult = await searchHotelsTool.func({
        location: destination,
        checkIn: departureDate !== "not specified" ? departureDate : undefined,
        checkOut: returnDate !== "not specified" ? returnDate : undefined,
        adults: typeof travelDetails.travelers === 'number' ? travelDetails.travelers : 2
      });
      toolResults.hotels = JSON.parse(hotelResult);
    }
    
    // Flights search
    if (departure !== "not specified" && 
        destination !== "not specified" && 
        departureDate !== "not specified") {
      const flightResult = await searchFlightsTool.func({
        fromLocation: departure,
        toLocation: destination,
        departureDate: departureDate,
        returnDate: returnDate !== "not specified" ? returnDate : undefined,
        adults: typeof travelDetails.travelers === 'number' ? travelDetails.travelers : 1
      });
      toolResults.flights = JSON.parse(flightResult);
    }
    
    console.log('Travel data gathered successfully');
    
    return {
      toolResults,
      currentStep: 'creating_itinerary'
    };
  } catch (error) {
    console.error('Error gathering travel data:', error);
    return {
      toolResults: { error: 'Some travel data could not be retrieved, but I can still help plan your trip!' },
      currentStep: 'creating_itinerary'
    };
  }
}

export async function createItinerary(state: any) {
  const { messages, travelDetails, toolResults } = state;
  const lastMessage = messages[messages.length - 1];
  
  if (!llm) {
    // Fallback response without LLM
    const destination = travelDetails.toLocation !== "not specified" ? travelDetails.toLocation : "your destination";
    const duration = travelDetails.duration !== "not specified" ? travelDetails.duration : "your trip";
    
    const fallbackResponse = `# Travel Itinerary for ${destination}

Thank you for choosing TripTailor! Based on your request: "${lastMessage.content}"

## Trip Overview
- **Destination**: ${destination}
- **Duration**: ${duration}
- **Travelers**: ${travelDetails.travelers || 1} person(s)
${travelDetails.budget !== "not specified" ? `- **Budget**: $${travelDetails.budget}` : ''}

## Recommendations

### Accommodations
${toolResults.hotels ? '- ' + toolResults.hotels.map((h: any) => h.name).slice(0, 2).join('\n- ') : '- Check popular booking sites for hotels in the area'}

### Attractions
${toolResults.attractions ? '- ' + toolResults.attractions.map((a: any) => a.name).slice(0, 3).join('\n- ') : '- Research popular tourist attractions in the destination'}

### Dining
${toolResults.restaurants ? '- ' + toolResults.restaurants.map((r: any) => r.name).slice(0, 3).join('\n- ') : '- Look for highly-rated local restaurants'}

## Travel Tips
- Book accommodations in advance for better rates
- Check local weather before packing
- Research local customs and etiquette
- Consider purchasing travel insurance
- Keep digital and physical copies of important documents

*This itinerary was created with available data. For the most current information, please verify details directly with service providers.*`;

    return {
      finalResponse: fallbackResponse,
      currentStep: 'complete'
    };
  }

  const itineraryPrompt = `Create a detailed travel itinerary based on: "${lastMessage.content}"
  
  Travel Details: ${JSON.stringify(travelDetails, null, 2)}
  Available Data: ${JSON.stringify(toolResults, null, 2)}
  
  Create a comprehensive itinerary with:
  - Day-by-day schedule with times
  - Specific recommendations from the data
  - Practical travel advice
  - Budget considerations
  - Alternative options
  
  Format as clear markdown for easy reading.`;
  
  try {
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
  } catch (error) {
    console.error('Error creating itinerary:', error);
    
    // Fallback to basic itinerary
    return {
      finalResponse: `# Travel Planning Assistant

I'd be happy to help plan your trip! However, I'm currently experiencing some technical difficulties with the advanced planning features.

**Your Request**: ${lastMessage.content}

**What I can suggest**:
1. Research your destination thoroughly
2. Book flights and accommodations in advance
3. Check visa and documentation requirements
4. Look into local attractions and activities
5. Consider travel insurance

For detailed, real-time travel planning, I recommend checking:
- Google Travel
- TripAdvisor
- Booking.com
- Local tourism websites

I apologize for the technical issue and appreciate your understanding!`,
      currentStep: 'complete'
    };
  }
}

// Create and export the agent
export function createTravelAgent() {
  const workflow = new StateGraph(AgentState);
  
  workflow.addNode('analyze', analyzeUserRequest);
  workflow.addNode('gather_data', gatherTravelData);
  workflow.addNode('create_itinerary', createItinerary);
  
  workflow.addEdge(START, 'analyze');
  workflow.addEdge('analyze', 'gather_data');
  workflow.addEdge('gather_data', 'create_itinerary');
  workflow.addEdge('create_itinerary', END);
  
  return workflow.compile();
}

// In-memory storage
export const conversations = new Map<string, ConversationMessage[]>();
export const agentStates = new Map<string, any>();

// Additional debugging utilities
export function debugSerpAPI() {
  console.log('SerpAPI Configuration:');
  console.log('- API Key present:', !!SERPAPI_KEY);
  console.log('- API URL:', SERPAPI_URL);
  
  if (!SERPAPI_KEY) {
    console.log('⚠️  SERPAPI_API_KEY environment variable is not set');
    console.log('To fix this, add SERPAPI_API_KEY=your_key_here to your .env file');
  }
}

export async function testSerpAPIConnection() {
  if (!isSerpAPIAvailable()) {
    console.log('❌ SerpAPI not available - API key missing');
    return false;
  }
  
  try {
    const response = await axios.get(SERPAPI_URL, {
      params: {
        engine: 'google',
        q: 'test',
        api_key: SERPAPI_KEY
      },
      timeout: 5000
    });
    
    console.log('✅ SerpAPI connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ SerpAPI connection failed:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return false;
  }
}
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'TripTailor LangGraph Agent',
    version: '3.0.0',
    features: {
      serpApiEnabled: !!process.env.SERPAPI_API_KEY,
      groqApiEnabled: !!process.env.GROQ_API_KEY,
      langGraphEnabled: true,
      toolsAvailable: ['search_places', 'search_hotels', 'search_restaurants', 'search_flights', 'search_weather']
    }
  });
}
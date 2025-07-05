require('dotenv').config();
const serpAPI = require('../src/services/serpapi');

async function debugFlights() {
  try {
    
    // Sekarang test Google Flights
    console.log('\nTesting Google Flights...');
    
    const flightParams = {
      engine: 'google_flights',
      departure_id: 'JFK',
      arrival_id: 'LAX',
      outbound_date: '2025-08-15',
      adults: 1
    };
    
    console.log('Flight parameters:', flightParams);
    
    const flightResult = await serpAPI.search(flightParams);
    
    console.log('✓ Google Flights works!');
    console.log('Response keys:', Object.keys(flightResult));
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error('Error response:', error.response?.data);
  }
}

debugFlights();
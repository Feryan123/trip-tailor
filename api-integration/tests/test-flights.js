require('dotenv').config();
const flightsService = require('../src/services/flights');

async function testFlights() {
  try {
    console.log('Testing flights search...');
    
    // Test dengan parameter minimal dulu
    const result = await flightsService.searchFlights({
      departure_id: 'LAX',   
      arrival_id: 'JFK',    
      outbound_date: '2025-08-15',  // Future date
      adults: 1
    });
    
    console.log('✓ Flights search successful!');
    console.log('Found flights:', result.flights.length);
    if (result.flights.length > 0) {
      console.log('Sample flight:', {
        price: result.flights[0].price,
        airline: result.flights[0].airline,
        duration: result.flights[0].duration
      });
    }
  } catch (error) {
    console.error('✗ Flights search failed:', error.message);
  }
}

testFlights();
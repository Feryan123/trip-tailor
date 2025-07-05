// tests/test-maps-service.js
require('dotenv').config();
const mapsService = require('../src/services/maps');

async function testMapsService() {
  try {
    console.log('Testing maps service...');
    
    const result = await mapsService.searchPlaces({
      query: 'tourist attractions',
      location: 'bali'
    });
    
    console.log('✓ Maps service successful!');
    console.log('Found places:', result.places.length);
    if (result.places.length > 0) {
      console.log('Sample place:', {
        name: result.places[0].name,
        rating: result.places[0].rating,
        address: result.places[0].address
      });
    }
  } catch (error) {
    console.error('✗ Maps service failed:', error.message);
  }
}

testMapsService();
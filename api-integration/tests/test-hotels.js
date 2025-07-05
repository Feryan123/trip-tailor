require('dotenv').config();
const hotelsService = require('../src/services/hotels');

async function testHotels() {
  try {
    console.log('Testing hotels search...');
    
    const result = await hotelsService.searchHotels({
      location: 'Bali',
      check_in_date: '2025-08-15',
      check_out_date: '2025-08-17',
      adults: 2
    });
    
    console.log('✓ Hotels search successful!');
    console.log('Found hotels:', result.hotels.length);
    if (result.hotels.length > 0) {
      console.log('Sample hotel:', {
        name: result.hotels[0].name,
        price: result.hotels[0].price,
        rating: result.hotels[0].rating
      });
    }
  } catch (error) {
    console.error('✗ Hotels search failed:', error.message);
  }
}

testHotels();
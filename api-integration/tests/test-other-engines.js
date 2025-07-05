require('dotenv').config();
const serpAPI = require('../src/services/serpapi');

async function testOtherEngines() {
  try {
    // Test Google Hotels
    console.log('Testing Google Hotels...');
    const hotelResult = await serpAPI.search({
      engine: 'google_hotels',
      q: 'hotels in bali',
      check_in_date: '2025-08-15',
      check_out_date: '2025-08-16'
    });
    console.log('✓ Google Hotels works!');
    console.log('Found hotels:', hotelResult.properties?.length || 0);
    
    // Test Google Maps
    console.log('\nTesting Google Maps...');
    const mapResult = await serpAPI.search({
      engine: 'google_maps',
      q: 'tourist attractions in bali'
    });
    console.log('✓ Google Maps works!');
    console.log('Found places:', mapResult.local_results?.length || 0);
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    console.error('Error response:', error.response?.data);
  }
}

testOtherEngines();
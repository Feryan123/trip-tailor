require('dotenv').config();
const serpAPI = require('../src/services/serpapi');

async function testConnection() {
  try {
    console.log('Testing SERP API connection...');
    
    const result = await serpAPI.search({
      engine: 'google',
      q: 'coffee',
      location: 'Austin, Texas'
    });
    
    console.log('✓ Connection successful!');
    console.log('Sample result:', result.organic_results?.[0]?.title);
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
  }
}

testConnection();
const axios = require('axios');

class SerpAPI {
  constructor() {
    this.apiKey = process.env.SERPAPI_KEY;
    this.baseURL = 'https://serpapi.com/search';
  }

  async search(params) {
    try {
      const response = await axios.get(this.baseURL, {
        params: {
          ...params,
          api_key: this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error('SERP API Error:', error.message);
      // if (error.response) {
      //   console.error('Error response:', error.response.data);
      //   console.error('Status:', error.response.status);
      // }
      throw error;
    }
  }
}

module.exports = new SerpAPI();
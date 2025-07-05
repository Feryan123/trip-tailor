const serpAPI = require('./serpapi');

class MapsService {
  async searchPlaces(params) {
    try {
      const { query, location } = params;

      // Keep it simple - cuma engine sama query
      const searchParams = {
        engine: 'google_maps',
        q: location ? `${query} in ${location}` : query
      };

      const result = await serpAPI.search(searchParams);
      return this.formatPlacesResults(result);
    } catch (error) {
      console.error('Maps search error:', error.message);
      throw error;
    }
  }

  formatPlacesResults(data) {
    if (!data.local_results || data.local_results.length === 0) {
      return {
        success: false,
        message: 'No places found',
        places: []
      };
    }

    const places = data.local_results.map(place => ({
      name: place.title,
      address: place.address,
      rating: place.rating,
      reviews: place.reviews,
      type: place.type,
      hours: place.hours,
      phone: place.phone,
      website: place.website,
      coordinates: place.gps_coordinates,
      thumbnail: place.thumbnail,
      description: place.description
    }));

    return {
      success: true,
      places: places,
      search_metadata: data.search_metadata
    };
  }
}

module.exports = new MapsService();
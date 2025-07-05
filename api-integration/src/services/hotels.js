const serpAPI = require('./serpapi');

class HotelsService {
  async searchHotels(params) {
    try {
      const {
        location,
        check_in_date,
        check_out_date,
        adults = 2
      } = params;

      // Keep it simple
      const searchParams = {
        engine: 'google_hotels',
        q: `hotels in ${location}`,
        check_in_date,
        check_out_date,
        adults
      };

      const result = await serpAPI.search(searchParams);
      return this.formatHotelResults(result);
    } catch (error) {
      console.error('Hotels search error:', error.message);
      throw error;
    }
  }

  formatHotelResults(data) {
    if (!data.properties || data.properties.length === 0) {
      return {
        success: false,
        message: 'No hotels found',
        hotels: []
      };
    }

    const hotels = data.properties.map(hotel => ({
      name: hotel.name,
      price: hotel.rate_per_night?.lowest,
      currency: hotel.rate_per_night?.currency,
      rating: hotel.overall_rating,
      reviews: hotel.reviews,
      amenities: hotel.amenities,
      images: hotel.images,
      location: hotel.gps_coordinates,
      description: hotel.description
    }));

    return {
      success: true,
      hotels: hotels,
      search_metadata: data.search_metadata
    };
  }
}

module.exports = new HotelsService();
const serpAPI = require('./serpapi');

class FlightsService {
  async searchFlights(params) {
    try {
      const {
        departure_id,
        arrival_id,
        outbound_date,
        return_date,
        adults = 1,
        children = 0,
        infants = 0,
        travel_class = 'Economy'
      } = params;

      const searchParams = {
        engine: 'google_flights',
        departure_id,
        arrival_id,
        outbound_date,
        return_date,
        adults,
        children,
        infants,
        currency: 'USD'
      };

      // Tambah return_date kalo round trip
      if (return_date) {
        searchParams.return_date = return_date;
        searchParams.type = 1; // round trip
      } else {
        searchParams.type = 2; // one way
      }
      const result = await serpAPI.search(searchParams);
      return this.formatFlightResults(result);
    } catch (error) {
      console.error('Flights search error:', error.message);
      throw error;
    }
  }

  formatFlightResults(data) {
    if (!data.best_flights || data.best_flights.length === 0) {
      return {
        success: false,
        message: 'No flights found',
        flights: []
      };
    }

    const flights = data.best_flights.map(flight => ({
      price: flight.price,
      airline: flight.flights[0]?.airline,
      departure_airport: flight.flights[0]?.departure_airport?.name,
      arrival_airport: flight.flights[0]?.arrival_airport?.name,
      departure_time: flight.flights[0]?.departure_airport?.time,
      arrival_time: flight.flights[0]?.arrival_airport?.time,
      duration: flight.total_duration,
      stops: flight.flights.length - 1,
      booking_token: flight.booking_token
    }));

    return {
      success: true,
      flights: flights,
      search_metadata: data.search_metadata
    };
  }
}

module.exports = new FlightsService();
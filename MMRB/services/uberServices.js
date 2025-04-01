const axios = require('axios');
const querystring = require('querystring');

const clientId = process.env.UBER_CLIENT_ID || 'W1i9cllNPKp3FoakuUDPXjNse0EYvD8m';
const clientSecret = process.env.UBER_CLIENT_SECRET || 'AlLDYcv2M7KItHqHtN0HMPp_aMBfXj6R8npcxTQ3';
const scope = process.env.UBER_SCOPE || '3p.trips.safety';

// Token management code as before...
async function getAccessToken() {
  // Same implementation as before
}

// Get price estimates for a ride
async function getPriceEstimates(startLat, startLng, endLat, endLng) {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      'https://sandbox-api.uber.com/v1.2/estimates/price',
      {
        params: {
          start_latitude: startLat,
          start_longitude: startLng,
          end_latitude: endLat,
          end_longitude: endLng
        },
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching Uber price estimates:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  getAccessToken,
  getPriceEstimates
};
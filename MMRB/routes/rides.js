// routes/rides.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Ride = require('../models/Ride');

// Find active rides near a location
router.get('/nearby', verifyToken, async (req, res) => {
  try {
    const { longitude, latitude, maxDistance = 5000 } = req.query; // maxDistance in meters
    
    if (!longitude || !latitude) {
      return res.status(400).json({ message: 'Location coordinates required' });
    }
    
    // Find active rides within radius with looking for partners
    const nearbyRides = await Ride.find({
      status: { $in: ['scheduled', 'active'] },
      lookingForPartners: true,
      'pickup.location.coordinates': {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).populate('user', 'name rating gender languages profileImage');
    
    // Format response
    const formattedRides = nearbyRides.map(ride => ({
      id: ride._id,
      driver: {
        id: ride.user._id,
        name: ride.user.name,
        rating: ride.user.rating,
        gender: ride.user.gender,
        languages: ride.user.languages,
        profileImage: ride.user.profileImage
      },
      provider: ride.provider,
      pickup: {
        address: ride.pickup.address,
        coordinates: ride.pickup.location.coordinates
      },
      destination: {
        address: ride.destination.address,
        coordinates: ride.destination.location.coordinates
      },
      fare: ride.fare,
      startTime: ride.startTime,
      status: ride.status,
      distance: ride.route?.distance ? `${(ride.route.distance / 1000).toFixed(1)} km` : 'Unknown',
      duration: ride.route?.duration ? `${Math.round(ride.route.duration / 60)} mins` : 'Unknown'
    }));
    
    res.json({ rides: formattedRides });
  } catch (error) {
    console.error('Error finding nearby rides:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new ride
router.post('/create', verifyToken, async (req, res) => {
  try {
    const { 
      provider,
      pickupAddress,
      pickupCoordinates,
      destinationAddress,
      destinationCoordinates,
      fare,
      lookingForPartners = true
    } = req.body;
    
    // Validate required fields
    if (!provider || !pickupAddress || !pickupCoordinates || 
        !destinationAddress || !destinationCoordinates || !fare) {
      return res.status(400).json({ message: 'Missing required ride information' });
    }
    
    // Normalize provider name (capitalize first letter)
    const normalizedProvider = provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
    
    // Create new ride
    const newRide = new Ride({
      user: req.user.id,
      provider: normalizedProvider, // Use normalized provider name
      pickup: {
        address: pickupAddress,
        location: {
          type: 'Point',
          coordinates: pickupCoordinates // [longitude, latitude]
        }
      },
      destination: {
        address: destinationAddress,
        location: {
          type: 'Point',
          coordinates: destinationCoordinates // [longitude, latitude]
        }
      },
      fare,
      lookingForPartners
    });
    
    await newRide.save();
    
    // Update user's current ride
    await User.findByIdAndUpdate(req.user.id, {
      currentRide: newRide._id
    });
    
    res.status(201).json({ 
      message: 'Ride created successfully',
      ride: newRide
    });
  } catch (error) {
    console.error('Error creating ride:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update ride status
router.put('/update-status/:rideId', verifyToken, async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status, lookingForPartners } = req.body;
    
    // Find the ride
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Verify ride belongs to user
    if (ride.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this ride' });
    }
    
    // Update fields
    if (status) ride.status = status;
    if (lookingForPartners !== undefined) ride.lookingForPartners = lookingForPartners;
    
    // If ride is completed, set end time
    if (status === 'completed') {
      ride.endTime = new Date();
    }
    
    await ride.save();
    
    res.json({ 
      message: 'Ride updated successfully',
      ride
    });
  } catch (error) {
    console.error('Error updating ride:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ride by ID
router.get('/:rideId', verifyToken, async (req, res) => {
  try {
    const { rideId } = req.params;
    
    const ride = await Ride.findById(rideId)
      .populate('user', 'name rating gender languages profileImage')
      .populate('partners.user', 'name rating gender languages profileImage');
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    res.json({ ride });
  } catch (error) {
    console.error('Error getting ride:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send ride join request
router.post('/join-request/:rideId', verifyToken, async (req, res) => {
  try {
    const { rideId } = req.params;
    
    // Find the ride
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Check if ride is open for partners
    if (!ride.lookingForPartners) {
      return res.status(400).json({ message: 'This ride is not accepting partners' });
    }
    
    // Check if user already requested to join
    const existingRequest = ride.partners.find(p => p.user.toString() === req.user.id);
    if (existingRequest) {
      return res.status(400).json({ message: 'You have already requested to join this ride' });
    }
    
    // Add user as a pending partner
    ride.partners.push({
      user: req.user.id,
      status: 'pending'
    });
    
    await ride.save();
    
    res.status(201).json({ 
      message: 'Join request sent successfully',
      requestId: ride.partners[ride.partners.length - 1]._id
    });
  } catch (error) {
    console.error('Error sending join request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Handle join request (accept/reject)
router.put('/join-request/:rideId/:userId', verifyToken, async (req, res) => {
  try {
    const { rideId, userId } = req.params;
    const { status } = req.body;
    
    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    // Find the ride
    const ride = await Ride.findById(rideId);
    
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }
    
    // Verify ride belongs to user
    if (ride.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to update this ride' });
    }
    
    // Find and update the partner status
    const partnerIndex = ride.partners.findIndex(p => p.user.toString() === userId);
    
    if (partnerIndex === -1) {
      return res.status(404).json({ message: 'User not found in ride partners' });
    }
    
    ride.partners[partnerIndex].status = status;
    await ride.save();
    
    res.json({ 
      message: `Request ${status}`,
      ride
    });
  } catch (error) {
    console.error('Error handling join request:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get current user's active ride
router.get('/user/active', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('currentRide');
    
    if (!user.currentRide) {
      return res.json({ hasActiveRide: false });
    }
    
    const ride = await Ride.findById(user.currentRide)
      .populate('user', 'name rating gender languages profileImage')
      .populate('partners.user', 'name rating gender languages profileImage');
    
    if (!ride || ['completed', 'cancelled'].includes(ride.status)) {
      // Ride is no longer active, update user
      await User.findByIdAndUpdate(req.user.id, {
        $unset: { currentRide: "" }
      });
      
      return res.json({ hasActiveRide: false });
    }
    
    res.json({ 
      hasActiveRide: true,
      ride
    });
  } catch (error) {
    console.error('Error getting active ride:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get nearby ride partners based on geospatial location
router.get('/partners', verifyToken, async (req, res) => {
  try {
    const { pickupLat, pickupLng, destLat, destLng, maxDistance = 5000, rideId } = req.query;
    
    // If rideId is provided, find partners for a specific ride
    if (rideId) {
      const ride = await Ride.findById(rideId)
        .populate('user', 'name rating gender languages profileImage');
      
      if (!ride) {
        return res.status(404).json({ message: 'Ride not found' });
      }
      
      // Check if user is authorized to view this ride
      if (ride.user._id.toString() !== req.user.id && 
          !ride.partners.some(p => p.user.toString() === req.user.id)) {
        return res.status(403).json({ message: 'Not authorized to view this ride' });
      }
      
      // Get the partners for this ride
      const ridePartners = await User.find({
        _id: { $in: ride.partners.map(p => p.user) }
      }).select('name rating gender languages profileImage locationCoords');
      
      // Format partners
      const formattedPartners = ridePartners.map(partner => ({
        id: partner._id,
        user: {
          id: partner._id,
          name: partner.name,
          rating: partner.rating,
          gender: partner.gender,
          languages: partner.languages,
          distance: '< 1 km away' // Placeholder
        },
        pickup: {
          address: ride.pickup.address,
          coordinates: ride.pickup.location.coordinates
        },
        destination: {
          address: ride.destination.address,
          coordinates: ride.destination.location.coordinates
        },
        eta: '5-10 mins', // Placeholder
        fare: ride.fare
      }));
      
      return res.json({ partners: formattedPartners });
    }
    
    // If coordinates are provided, find partners near those locations
    if (pickupLat && pickupLng) {
      const userLocation = [parseFloat(pickupLng), parseFloat(pickupLat)];
      let userDestination = null;
      
      if (destLat && destLng) {
        userDestination = [parseFloat(destLng), parseFloat(destLat)];
      }
      
      // Find users who are seeking rides near the user's location
      const nearbyUsers = await User.find({
        _id: { $ne: req.user.id }, // Exclude current user
        mode: 'seeking',          // Only users seeking a ride
        'locationCoords.coordinates': {
          $nearSphere: {
            $geometry: {
              type: 'Point',
              coordinates: userLocation
            },
            $maxDistance: parseInt(maxDistance)
          }
        }
      }).select('_id name rating gender languages profileImage seekingDestination');
      
      // Format for response
      const formattedPartners = nearbyUsers.map(user => {
        // Calculate rough distance (this would be better with a proper distance calculation)
        const userCoords = user.locationCoords?.coordinates || [0, 0];
        const distance = Math.sqrt(
          Math.pow(userCoords[0] - userLocation[0], 2) + 
          Math.pow(userCoords[1] - userLocation[1], 2)
        ) * 111000; // Rough conversion to meters
        
        const distanceText = distance < 1000 ? 
          `${Math.round(distance)} m away` : 
          `${(distance / 1000).toFixed(1)} km away`;
        
        return {
          id: user._id,
          user: {
            id: user._id,
            name: user.name,
            rating: user.rating,
            gender: user.gender,
            languages: user.languages || ['English'],
            distance: distanceText
          },
          pickup: {
            address: 'Near your pickup point',
            coordinates: user.locationCoords?.coordinates || userLocation
          },
          destination: {
            address: user.seekingDestination?.address || 'Unknown destination',
            coordinates: user.seekingDestination?.location?.coordinates || userDestination || userLocation
          },
          eta: '5-10 mins', // Placeholder
          fare: '₹150-200'  // Placeholder
        };
      });
      
      return res.json({ partners: formattedPartners });
    }
    
    // If neither ride ID nor coordinates provided
    res.status(400).json({ message: 'Missing required parameters (rideId or coordinates)' });
  } catch (error) {
    console.error('Error finding ride partners:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 
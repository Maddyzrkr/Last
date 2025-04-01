const mongoose = require("mongoose");

const RideSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  provider: {
    type: String,
    enum: ['Uber', 'Ola', 'Other', 'uber', 'ola', 'other'],
    required: true
  },
  status: {
    type: String,
    enum: ['scheduled', 'active', 'completed', 'cancelled'],
    default: 'scheduled'
  },
  pickup: {
    address: { type: String, required: true },
    location: {
      type: {
        type: String,
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        index: "2dsphere"
      }
    }
  },
  destination: {
    address: { type: String, required: true },
    location: {
      type: {
        type: String,
        default: "Point"
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true
      }
    }
  },
  fare: {
    type: String,
    required: true
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  lookingForPartners: {
    type: Boolean,
    default: true
  },
  partners: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  route: {
    distance: Number, // in meters
    duration: Number, // in seconds
    polyline: String  // encoded polyline
  }
}, 
{
  timestamps: true // Adds createdAt and updatedAt fields
});

module.exports = mongoose.model("Ride", RideSchema); 
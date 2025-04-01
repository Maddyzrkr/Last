const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  // New fields for profile information
  phone: {
    type: String,
    trim: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other']
  },
  languages: {
    type: [String],
    default: []
  },
  location: {
    type: String,
    trim: true
  },
  locationCoords: {
    type: {
      type: String,
      default: "Point"
    },
    coordinates: {
      type: [Number],
      index: "2dsphere"
    }
  },
  profileImage: {
    type: String  // Storing base64 encoded string
  },
  isOnboarded: {
    type: Boolean,
    default: false
  },
  // New fields for ride-sharing
  mode: {
    type: String,
    enum: ['booking', 'seeking'],
    default: 'booking'
  },
  // Reference to current ride if user has booked one
  currentRide: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ride'
  },
  // For users seeking rides - their destination
  seekingDestination: {
    address: { type: String },
    location: {
      type: {
        type: String,
        default: "Point"
      },
      coordinates: [Number] // [longitude, latitude]
    }
  },
  // User ride preferences
  preferences: {
    gender: { type: String, enum: ['Male', 'Female', 'No Preference'] },
    maxDistance: { type: Number, default: 5000 }, // in meters
    maxFare: { type: Number }
  },
  // User's rating
  rating: {
    type: Number,
    default: 5.0,
    min: 1.0,
    max: 5.0
  },
  // User's ride history
  rideHistory: [{
    ride: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ride'
    },
    role: {
      type: String,
      enum: ['driver', 'passenger']
    },
    rating: Number
  }]
},
{
  timestamps: true // Adds createdAt and updatedAt fields
});

// Add a 2dsphere index on locationCoords for geospatial queries
UserSchema.index({ 'locationCoords.coordinates': '2dsphere' });

module.exports = mongoose.model("User", UserSchema);
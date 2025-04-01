require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const connectDB = require("./config/db");
const rideRoutes = require("./routes/rides");
const authRoutes = require("./routes/auth");
const http = require("http");
const socketIo = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Ride = require("./models/Ride");
const Message = require("./models/Message");

// Initialize Express App
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with more permissive CORS
const io = socketIo(server, {
  cors: {
    origin: "*", // More permissive for mobile clients
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
  },
  pingTimeout: 60000, // Increased timeout for mobile clients with unstable connections
  pingInterval: 25000, // More frequent pings to keep connection alive
  connectTimeout: 45000, // Longer connect timeout
  maxHttpBufferSize: 1e8, // Larger buffer size
  transports: ['websocket', 'polling'], // Specify available transports
  allowUpgrades: true, // Allow transport upgrades
  path: '/socket.io', // Standard path
  serveClient: false // Do not serve client files
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Handle form-data
app.use(cookieParser());
app.use(helmet());
app.use('/api/rides', rideRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/messages', require('./routes/messages'));

// CORS Configuration - More permissive for development
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:3000", // Default frontend URL
  "http://192.168.0.105:8081", // Mobile device IP
  "http://192.168.0.106:8081", // Add more potential IPs
  "http://192.168.0.107:8081",
  "http://localhost:8081",
  "http://localhost:19000", // Expo development server
  "http://localhost:19001",
  "http://localhost:19002",
  "exp://localhost:19000", // Expo URLs
  "exp://127.0.0.1:19000",
  "exp://192.168.0.106:19000", // Add your actual IP if using Expo
];

// Apply more permissive CORS for development
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin 
      // (like mobile apps or curl requests)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`Origin: ${origin} not allowed by CORS`);
        callback(null, true); // Allow all origins in development
      }
    },
    credentials: true, // Allows cookies & authentication headers
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed request types
    allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
  })
);

// Connect to Database
(async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB Connected Successfully");
  } catch (error) {
    console.error("❌ MongoDB Connection Error:", error);
    process.exit(1); // Exit if DB connection fails
  }
})();

// Store active users for matchmaking
const activeUsers = new Map();

// Matchmaking storage - Enhanced with location information
const matchmakingUsers = new Map();

// Socket.io Authentication Middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error("Authentication error: Token missing"));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return next(new Error("User not found"));
    }
    
    // Attach user to socket
    socket.user = user;
    console.log(`✅ Socket authenticated for user: ${user._id} (${user.name})`);
    next();
  } catch (error) {
    console.error("❌ Socket authentication error:", error.message);
    next(new Error("Authentication error: " + error.message));
  }
});

// Socket.io Connection Handler
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user._id}`);
  
  // Add user to their own room for private messages
  socket.join(socket.user._id.toString());
  
  // Add a ping handler for connection testing
  socket.on("ping_server", (data) => {
    console.log(`Ping received from ${socket.id}:`, data);
    socket.emit("pong_server", {
      ...data,
      received: Date.now(),
      serverTime: new Date().toISOString(),
      userId: socket.user._id.toString()
    });
  });
  
  // Handle room joining
  socket.on("join_ride_channel", async (data) => {
    try {
      if (!data || !data.rideId) {
        return socket.emit("error", { message: "Ride ID is required to join a channel" });
      }
      
      const { rideId } = data;
      
      console.log(`User ${socket.user._id} joining ride channel: ${rideId}`);
      
      // Join the socket to the room
      socket.join(rideId);
      
      // Notify the user they've joined the channel
      socket.emit("channel_joined", { 
        rideId, 
        message: 'You have joined the ride channel'
      });
      
      console.log(`✅ User ${socket.user._id} successfully joined channel ${rideId}`);
    } catch (error) {
      console.error("❌ Error joining ride channel:", error);
      socket.emit("error", { message: "Failed to join ride channel" });
    }
  });
  
  // Handle private chat
  socket.on("joinChat", async (data) => {
    try {
      const { partnerId } = data;
      
      if (!partnerId) {
        return socket.emit("error", { message: "Partner ID is required to join chat" });
      }
      
      console.log(`User ${socket.user._id} joining chat with partner: ${partnerId}`);
      
      // Create a unique room ID for these two users (sorted to ensure consistency)
      const participants = [socket.user._id.toString(), partnerId].sort();
      const chatRoomId = `chat_${participants.join('_')}`;
      
      // Join the socket to the chat room
      socket.join(chatRoomId);
      
      console.log(`✅ User ${socket.user._id} joined chat room: ${chatRoomId}`);
      
      // Send notification to the partner if they're online
      const partnerSocket = findSocketByUserId(partnerId);
      if (partnerSocket) {
        partnerSocket.join(chatRoomId);
        partnerSocket.emit("chatJoined", {
          partnerId: socket.user._id.toString(),
          name: socket.user.name,
          message: `${socket.user.name} has joined the chat`
        });
      }
    } catch (error) {
      console.error("❌ Error joining chat:", error);
      socket.emit("error", { message: "Failed to join chat" });
    }
  });
  
  // Handle sending messages
  socket.on("sendMessage", async (message) => {
    try {
      const { receiverId, text, timestamp } = message;
      
      if (!receiverId || !text) {
        return socket.emit("error", { message: "Receiver ID and message text are required" });
      }
      
      console.log(`User ${socket.user._id} sending message to ${receiverId}: ${text.substring(0, 20)}...`);
      
      // Create unique chat room ID
      const chatRoomId = Message.getChatRoomId(socket.user._id.toString(), receiverId);
      
      // Create a new message object
      const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: socket.user._id.toString(),
        senderName: socket.user.name,
        receiverId,
        text,
        timestamp: timestamp || Date.now()
      };
      
      // Store message in database
      const messageDoc = new Message({
        sender: socket.user._id,
        receiver: receiverId,
        text,
        chatRoomId
      });
      await messageDoc.save();
      
      // Update message ID with database ID
      newMessage.id = messageDoc._id.toString();
      
      // Broadcast to the chat room
      io.to(chatRoomId).emit("chatMessage", newMessage);
      
      console.log(`✅ Message sent to room ${chatRoomId}`);
    } catch (error) {
      console.error("❌ Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });
  
  // Helper function to find a socket by user ID
  function findSocketByUserId(userId) {
    let foundSocket = null;
    // Search through all sockets
    for (const [socketId, socketObj] of io.of("/").sockets) {
      if (socketObj.user && socketObj.user._id.toString() === userId) {
        foundSocket = socketObj;
        break;
      }
    }
    return foundSocket;
  }
  
  // Handle joinMatchmaking event - enhanced for better user visibility
  socket.on("joinMatchmaking", async (userData) => {
    try {
      console.log(`User ${socket.user._id} joining matchmaking with data:`, userData);
      
      // Create a geoJSON location object for MongoDB storage
      const userLocation = userData.location ? {
        type: "Point",
        coordinates: [
          userData.location.coordinates[0], // longitude
          userData.location.coordinates[1]  // latitude
        ]
      } : null;
      
      // Create a geoJSON destination object
      const userDestination = userData.destination ? {
        type: "Point",
        coordinates: [
          userData.destination.coordinates[0], // longitude
          userData.destination.coordinates[1]  // latitude
        ]
      } : null;
      
      // Update user location in MongoDB for persistent storage and geospatial queries
      await User.findByIdAndUpdate(
        socket.user._id,
        { 
          $set: {
            locationCoords: userLocation,
            'seekingDestination.location': userDestination,
            'seekingDestination.address': userData.destination ? userData.destination.address : '',
            'preferences.gender': userData.preferences ? userData.preferences.gender : 'No Preference',
            mode: 'seeking'  // Mark user as actively seeking a ride partner
          }
        },
        { new: true }
      );
      
      // Store user in active matchmaking with enhanced data
      const matchmakingData = {
        user: socket.user,
        socket: socket.id,
        preferences: userData.preferences || {},
        location: userLocation,
        destination: userDestination ? {
          coordinates: userDestination.coordinates,
          address: userData.destination.address
        } : null,
        joinedAt: new Date()
      };
      
      // Check if user is already in activeUsers - if so, update their data
      if (activeUsers.has(socket.user._id.toString())) {
        console.log(`🔄 User ${socket.user._id} is already in matchmaking - updating data`);
        activeUsers.set(socket.user._id.toString(), matchmakingData);
      } else {
        // Add new user to active matchmaking
        activeUsers.set(socket.user._id.toString(), matchmakingData);
      }
      
      // DEBUG: Log active users for troubleshooting
      console.log(`🔍 ACTIVE USERS DEBUG: Total Count: ${activeUsers.size}`);
      activeUsers.forEach((userData, userId) => {
        console.log(`🔍 Active User: ${userId} | Name: ${userData.user.name} | Gender: ${userData.user.gender || 'Unknown'}`);
      });
      
      // Find users who are actively seeking rides
      const activeMatchmakingUsers = await User.find({
        _id: { $ne: socket.user._id }, // Exclude current user
        mode: 'seeking',               // Only users seeking a ride
      }).select('_id name gender rating locationCoords seekingDestination preferences');
      
      console.log(`📊 Found ${activeMatchmakingUsers.length} active users in database`);
      
      // Broadcast updated users count to all clients
      io.emit("updateUsers", {
        count: activeUsers.size,
        timestamp: new Date()
      });
      
      // Notify the user they've joined matchmaking
      socket.emit("matchmakingJoined", { 
        status: "joined",
        usersCount: activeUsers.size
      });
      
      // Send the current matching users to this user
      const matchingUsers = [];
      
      // Add users from database to matches
      for (const otherUser of activeMatchmakingUsers) {
        // Add to matches list
        matchingUsers.push({
          id: otherUser._id.toString(),
          name: otherUser.name,
          gender: otherUser.gender || 'Unknown',
          rating: otherUser.rating || 5,
          destination: otherUser.seekingDestination ? {
            address: otherUser.seekingDestination.address,
            coordinates: otherUser.seekingDestination.location ? 
              otherUser.seekingDestination.location.coordinates : null
          } : null
        });
        
        // Also notify the other user about this new user (if they're online)
        if (activeUsers.has(otherUser._id.toString())) {
          const otherUserSocketId = activeUsers.get(otherUser._id.toString()).socket;
          
          // Send this user's info to the other user
          io.to(otherUserSocketId).emit("matchingUsers", {
            matches: [{
              id: socket.user._id.toString(),
              name: socket.user.name,
              gender: socket.user.gender || 'Unknown',
              rating: socket.user.rating || 5,
              destination: userData.destination || null
            }],
            count: 1,
            newUser: true
          });
        }
      }
      
      if (matchingUsers.length > 0) {
        console.log(`🔍 Sending ${matchingUsers.length} matching users to new user`);
        socket.emit("matchingUsers", { 
          matches: matchingUsers,
          count: matchingUsers.length
        });
      } else {
        console.log('No matching users found for this user');
        socket.emit("matchingUsers", { 
          matches: [],
          count: 0,
          message: "No matching users found yet. Please wait for others to join."
        });
      }
      
      console.log(`✅ User ${socket.user._id} successfully joined matchmaking. Active users: ${activeUsers.size}`);
    } catch (error) {
      console.error("❌ Error joining matchmaking:", error);
      socket.emit("error", { message: "Failed to join matchmaking: " + error.message });
    }
  });
  
  // Handle findPartner event with enhanced Google API integration for locations
  socket.on("findPartner", async (criteria) => {
    try {
      console.log(`User ${socket.user._id} searching for partner with criteria:`, criteria);
      console.log(`🔍 Total active users available for matching: ${activeUsers.size}`);
      
      // Convert destination to geoJSON for MongoDB query
      let destinationGeoJSON = null;
      if (criteria.destination && criteria.destination.coordinates) {
        destinationGeoJSON = {
          type: "Point",
          coordinates: [
            criteria.destination.coordinates[0], // longitude
            criteria.destination.coordinates[1]  // latitude
          ]
        };
      }
      
      // Find matching users using MongoDB geospatial queries
      const query = {
        _id: { $ne: socket.user._id }, // Exclude current user
        mode: 'seeking'                // Only users seeking a ride
      };
      
      // Add gender preference if specified
      if (criteria.gender && criteria.gender !== 'Any') {
        query.gender = criteria.gender;
      }
      
      // Find matching users from MongoDB
      const nearbyUsers = await User.find(query).select('_id name gender rating seekingDestination preferences locationCoords');
      
      console.log(`Found ${nearbyUsers.length} potential matches from database`);
      
      const matchingUsers = [];
      
      // Process matching users
      for (const otherUser of nearbyUsers) {
        console.log(`🔍 Evaluating match with user: ${otherUser._id} | Name: ${otherUser.name}`);
        
        // Basic matching - we're now doing the filtering in the MongoDB query
        const match = {
          id: otherUser._id.toString(),
          name: otherUser.name,
          gender: otherUser.gender || 'Unknown',
          rating: otherUser.rating || 5,
          destination: otherUser.seekingDestination ? {
            address: otherUser.seekingDestination.address,
            coordinates: otherUser.seekingDestination.location ? 
              otherUser.seekingDestination.location.coordinates : null
          } : null
        };
        
        matchingUsers.push(match);
      }
      
      console.log(`🔍 Found ${matchingUsers.length} matching users after filtering`);
      
      // Send to the user who requested matches
      socket.emit("matchingUsers", { 
        matches: matchingUsers,
        count: matchingUsers.length
      });
    } catch (error) {
      console.error("❌ Error finding partners:", error);
      socket.emit("error", { message: "Failed to find partners: " + error.message });
    }
  });
  
  // Handle ride join request
  socket.on("request_to_join", async (data) => {
    try {
      const { rideId } = data;
      console.log(`User ${socket.user._id} requesting to join ride: ${rideId}`);
      
      // Find the ride
      const ride = await Ride.findById(rideId).populate("user", "name _id");
      
      if (!ride) {
        return socket.emit("error", { message: "Ride not found" });
      }
      
      // Add user as pending partner
      ride.partners.push({
        user: socket.user._id,
        status: "pending"
      });
      
      await ride.save();
      
      // Notify ride owner about join request
      io.to(ride.user._id.toString()).emit("join_request", {
        ride: rideId,
        user: {
          id: socket.user._id,
          name: socket.user.name,
          rating: socket.user.rating
        }
      });
      
      socket.emit("request_sent", { rideId });
      console.log(`✅ Join request sent from ${socket.user._id} to ${ride.user._id} for ride ${rideId}`);
    } catch (error) {
      console.error("❌ Error requesting to join ride:", error);
      socket.emit("error", { message: "Failed to send join request" });
    }
  });
  
  // Handle accept/reject ride request
  socket.on("respond_to_request", async (data) => {
    try {
      const { rideId, userId, status } = data;
      console.log(`User ${socket.user._id} responding to request from ${userId} with status: ${status}`);
      
      // Update the ride
      const ride = await Ride.findOneAndUpdate(
        { 
          _id: rideId,
          "partners.user": userId
        },
        {
          $set: { "partners.$.status": status }
        },
        { new: true }
      );
      
      if (!ride) {
        return socket.emit("error", { message: "Ride or partner not found" });
      }
      
      // Notify the user who requested to join
      io.to(userId).emit("request_response", {
        rideId,
        status,
        ride: {
          provider: ride.provider,
          destination: ride.destination.address,
          fare: ride.fare
        }
      });
      
      console.log(`✅ Request response sent to ${userId} with status: ${status}`);
    } catch (error) {
      console.error("❌ Error responding to join request:", error);
      socket.emit("error", { message: "Failed to respond to request" });
    }
  });
  
  // Handle ride cancellation
  socket.on("cancel_ride", async (data) => {
    try {
      const { rideId } = data;
      
      // Find and update ride
      const ride = await Ride.findByIdAndUpdate(rideId, 
        { status: "cancelled" },
        { new: true }
      );
      
      if (!ride) {
        return socket.emit("error", { message: "Ride not found" });
      }
      
      // Notify all partners
      ride.partners.forEach(partner => {
        if (partner.status === "accepted") {
          io.to(partner.user.toString()).emit("ride_cancelled", { rideId });
        }
      });
      
      // Update user's current ride
      await User.findByIdAndUpdate(socket.user._id, {
        $unset: { currentRide: "" }
      });
      
      socket.emit("ride_cancelled_confirmation");
    } catch (error) {
      console.error("Error cancelling ride:", error);
      socket.emit("error", { message: "Failed to cancel ride" });
    }
  });
  
  // Handle acceptMatch event - for matchmaking
  socket.on("acceptMatch", async (data) => {
    try {
      const { partnerId } = data;
      console.log(`User ${socket.user._id} accepted match with ${partnerId}`);
      
      // Check if partner is still active
      if (!activeUsers.has(partnerId)) {
        return socket.emit("error", { message: "Partner is no longer available" });
      }
      
      // Get partner data
      const partnerData = activeUsers.get(partnerId);
      
      // Notify the partner
      io.to(partnerData.socket).emit("matchAccepted", {
        partner: {
          id: socket.user._id,
          name: socket.user.name,
          rating: socket.user.rating || 5
        }
      });
      
      // Notify current user
      socket.emit("matchConfirmed", {
        partner: {
          id: partnerId,
          name: partnerData.user.name,
          rating: partnerData.user.rating || 5
        }
      });
      
      console.log(`✅ Match confirmed between ${socket.user._id} and ${partnerId}`);
    } catch (error) {
      console.error("❌ Error accepting match:", error);
      socket.emit("error", { message: "Failed to accept match" });
    }
  });
  
  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user._id}`);
    
    // Remove from active users if in matchmaking
    if (activeUsers.has(socket.user._id.toString())) {
      activeUsers.delete(socket.user._id.toString());
      
      // Update user mode in database
      User.findByIdAndUpdate(
        socket.user._id,
        { $set: { mode: 'booking' } },  // Reset to booking mode
        { new: false }
      ).catch(err => console.error("Error updating user mode on disconnect:", err));
      
      // Broadcast updated users count
      io.emit("updateUsers", {
        count: activeUsers.size,
        timestamp: new Date()
      });
      
      console.log(`User ${socket.user._id} removed from matchmaking. Active users: ${activeUsers.size}`);
    }
  });
});

// Default Route
app.get("/", (req, res) => res.send("🔥 Backend is running!"));

// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

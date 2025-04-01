const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

// Explicitly set the URL
const SOCKET_URL = process.env.SOCKET_URL || "http://192.168.0.106:5000";

console.log(`Attempting to connect to socket server at ${SOCKET_URL}`);

// Try to read token from file or environment variable
let token = process.env.AUTH_TOKEN;

// If not in environment, try to read from token file
if (!token) {
  try {
    const tokenPath = path.join(__dirname, '.auth_token');
    if (fs.existsSync(tokenPath)) {
      token = fs.readFileSync(tokenPath, 'utf8').trim();
      console.log('✅ Read authentication token from file.');
    }
  } catch (error) {
    console.error('❌ Error reading token file:', error.message);
  }
}

// If still no token, use a mock token (will likely fail)
if (!token) {
  token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVmOWIzYjJiNmIyYjRjMjNkNmRhNTJhNyIsImlhdCI6MTY4NDkzNDc2MCwiZXhwIjoxNjg1NTM5NTYwfQ.NMHt7UfCl9Drn4lm8X-8EJFzOWR9XK-1wQ5fS-jfnCE";
  console.log('⚠️ Using mock token - authentication will likely fail.');
  console.log('To test with a real token:');
  console.log('1. Set AUTH_TOKEN environment variable, or');
  console.log('2. Create a .auth_token file with your JWT token');
}

// Create a socket connection
const socket = io(SOCKET_URL, {
  transports: ['websocket', 'polling'], // Try both transports
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 10,
  timeout: 15000,
  auth: { token } // Add token authentication
});

// Connection events
socket.on('connect', () => {
  console.log(`✅ Socket connected with ID: ${socket.id}`);
  
  // Send a ping immediately
  socket.emit('ping_server', { 
    timestamp: Date.now(),
    clientId: socket.id
  });
  
  console.log('Ping sent to server');
  
  // Join a test channel
  socket.emit('join_ride_channel', {
    rideId: 'test_channel_123',
    context: {
      device: 'test-client',
      platform: 'node'
    }
  });
  
  console.log('Joined test ride channel');

  // Try the joinMatchmaking event
  socket.emit('joinMatchmaking', { 
    preferences: {
      gender: 'Female'
    },
    destination: {
      address: 'Mumbai Central',
      coordinates: [72.8254, 18.9712]
    }
  });
  
  console.log('Sent joinMatchmaking request');
  
  // Try the findPartner event
  setTimeout(() => {
    if (socket.connected) {
      socket.emit('findPartner', {
        gender: 'Female',
        destination: {
          address: 'Mumbai Central',
          coordinates: [72.8254, 18.9712]
        }
      });
      console.log('Sent findPartner request');
    }
  }, 2000); // Wait 2 seconds before finding partners
});

// Add authentication error handling
socket.on('connect_error', (error) => {
  console.error('❌ Connection error:', error.message);
  // Try to determine if it's an authentication error
  if (error.message.includes('Authentication')) {
    console.error('🔑 This appears to be an authentication error. The token may be invalid or expired.');
  }
});

socket.on('pong_server', (data) => {
  console.log('✅ Received pong from server:', data);
  const roundTripTime = Date.now() - data.timestamp;
  console.log(`Round-trip time: ${roundTripTime}ms`);
});

socket.on('channel_joined', (data) => {
  console.log('✅ Successfully joined channel:', data);
});

socket.on('matchmakingJoined', (data) => {
  console.log('✅ Successfully joined matchmaking:', data);
});

socket.on('updateUsers', (data) => {
  console.log('📊 Active users updated:', data);
});

socket.on('matchingUsers', (data) => {
  console.log('👥 Received matching users:', data);
});

socket.on('error', (error) => {
  console.error('❌ Socket error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('❌ Socket disconnected, reason:', reason);
});

// Connection timeout
setTimeout(() => {
  if (!socket.connected) {
    console.error('❌ Failed to connect to server within timeout period');
  } else {
    console.log('✅ Socket test completed successfully - connection works!');
  }
  
  // Clean up
  socket.disconnect();
  process.exit(0);
}, 15000);

console.log('Socket client initialized and waiting for connection...'); 
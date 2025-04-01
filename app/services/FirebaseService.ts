import { initializeApp } from 'firebase/app';
import { 
  getDatabase, 
  ref, 
  set, 
  onValue, 
  push, 
  update, 
  remove, 
  get, 
  child, 
  query, 
  orderByChild, 
  equalTo,
  onChildAdded,
  onChildChanged,
  off
} from 'firebase/database';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAQ0ibqGHFYwY3c1j8ObGgX-BmVKM47cGI",
  authDomain: "matchmyride-37a78.firebaseapp.com",
  databaseURL: "https://matchmyride-37a78-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "matchmyride-37a78",
  storageBucket: "matchmyride-37a78.firebasestorage.app",
  messagingSenderId: "931010530268",
  appId: "1:931010530268:android:b8fa9fd2b6b6454e96dd19"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Helper to get current user
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// Listen for authentication state changes
export const listenForAuthChanges = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// =================== USER PROFILE MANAGEMENT ===================

// Save or update complete user profile
export const updateUserProfile = async (
  userId: string,
  data: {
    name?: string;
    email?: string;
    phone?: string;
    gender?: string;
    profileImage?: string;
    languages?: string[];
    rating?: number;
  }
) => {
  try {
    const userRef = ref(database, `users/${userId}/profile`);
    await update(userRef, {
      ...data,
      lastUpdated: new Date().toISOString()
    });
    return true;
  } catch (error) {
    console.error('Error updating user profile:', error);
    return false;
  }
};

// Get user profile by ID
export const getUserProfile = async (userId: string) => {
  try {
    const userRef = ref(database, `users/${userId}/profile`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
};

// =================== RIDE MATCHING FUNCTIONALITY ===================

// Update user's ride information (when they want to find a ride or a partner)
export const updateUserRideInfo = async (
  userId: string, 
  data: {
    rideType: 'bookingRide' | 'findingPartner'; // First or second option
    pickup: {
      address: string;
      coordinates: {
        lat: number;
        lng: number;
      }
    };
    destination: {
      address: string;
      coordinates: {
        lat: number;
        lng: number;
      }
    };
    timestamp: string; // When the ride is needed
    status: 'searching' | 'matched' | 'completed' | 'cancelled';
    preferences?: {
      gender?: string;
      maxSharedDistance?: number;
      maxWaitTime?: number;
      otherPreferences?: string[];
    };
    providerDetails?: {  // If they've already booked a ride
      provider: string;
      rideId: string;
      fare: number;
      eta: string;
    };
  }
) => {
  try {
    const rideRef = ref(database, `users/${userId}/rideInfo`);
    await set(rideRef, {
      ...data,
      lastUpdated: new Date().toISOString()
    });
    
    // If they're searching, also add them to the active searches for faster matching
    if (data.status === 'searching') {
      const searchType = data.rideType === 'bookingRide' ? 'activeRideBookers' : 'activePartnerSeekers';
      const searchRef = ref(database, `searches/${searchType}/${userId}`);
      await set(searchRef, {
        userId,
        pickupCoordinates: data.pickup.coordinates,
        destinationCoordinates: data.destination.coordinates,
        timestamp: data.timestamp,
        lastUpdated: new Date().toISOString()
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating user ride info:', error);
    return false;
  }
};

// Find potential ride matches based on location and direction
export const findPotentialRideMatches = async (
  userId: string,
  searchType: 'findPartners' | 'findRides',
  maxDistance: number = 5 // km for pickup point
) => {
  try {
    // Get current user's ride info
    const userRideRef = ref(database, `users/${userId}/rideInfo`);
    const userSnapshot = await get(userRideRef);
    
    if (!userSnapshot.exists()) {
      console.error('No ride info found for user:', userId);
      return [];
    }
    
    const userRideInfo = userSnapshot.val();
    
    // Determine which search group to look in
    // If user is booking a ride, look for partner seekers
    // If user is seeking a partner, look for ride bookers
    const matchType = searchType === 'findPartners' ? 'activeRideBookers' : 'activePartnerSeekers';
    const searchRef = ref(database, `searches/${matchType}`);
    const searchSnapshot = await get(searchRef);
    
    if (!searchSnapshot.exists()) {
      return [];
    }
    
    // Get all potential matches
    const allPotentialMatches = searchSnapshot.val();
    
    // Filter matches based on:
    // 1. Distance between pickup points
    // 2. Distance between destinations
    // 3. Timestamp proximity
    const matches = await Promise.all(
      Object.entries(allPotentialMatches)
        .filter(([matchUserId, matchData]: [string, any]) => {
          // Skip checking yourself
          if (matchUserId === userId) return false;
          
          // Calculate distance between pickup points
          const pickupDistance = calculateDistance(
            userRideInfo.pickup.coordinates.lat,
            userRideInfo.pickup.coordinates.lng,
            matchData.pickupCoordinates.lat,
            matchData.pickupCoordinates.lng
          );
          
          // If pickup is too far, skip this match
          if (pickupDistance > maxDistance) return false;
          
          // Calculate distance between destinations
          const destinationDistance = calculateDistance(
            userRideInfo.destination.coordinates.lat,
            userRideInfo.destination.coordinates.lng,
            matchData.destinationCoordinates.lat,
            matchData.destinationCoordinates.lng
          );
          
          // For destination, allow more flexibility with a larger radius
          // but check if destination is on the way (for more advanced cases)
          return destinationDistance < maxDistance * 2;
        })
        .map(async ([matchUserId, matchData]: [string, any]) => {
          // Get user profile to display user details
          const userProfileRef = ref(database, `users/${matchUserId}/profile`);
          const profileSnapshot = await get(userProfileRef);
          const profile = profileSnapshot.exists() ? profileSnapshot.val() : {};
          
          // Get complete ride info
          const rideInfoRef = ref(database, `users/${matchUserId}/rideInfo`);
          const rideInfoSnapshot = await get(rideInfoRef);
          const rideInfo = rideInfoSnapshot.exists() ? rideInfoSnapshot.val() : {};
          
          // Calculate distances
          const pickupDistance = calculateDistance(
            userRideInfo.pickup.coordinates.lat,
            userRideInfo.pickup.coordinates.lng,
            matchData.pickupCoordinates.lat,
            matchData.pickupCoordinates.lng
          );
          
          const destinationDistance = calculateDistance(
            userRideInfo.destination.coordinates.lat,
            userRideInfo.destination.coordinates.lng,
            matchData.destinationCoordinates.lat,
            matchData.destinationCoordinates.lng
          );
          
          return {
            id: matchUserId,
            name: profile.name || `User ${matchUserId.substring(0, 8)}`,
            profileImage: profile.profileImage,
            gender: profile.gender,
            languages: profile.languages || ['English'],
            rating: profile.rating || 4.5,
            pickupDistance: pickupDistance.toFixed(2),
            destinationDistance: destinationDistance.toFixed(2),
            pickup: rideInfo.pickup,
            destination: rideInfo.destination,
            timestamp: rideInfo.timestamp,
            providerDetails: rideInfo.providerDetails,
            preferences: rideInfo.preferences
          };
        })
    );
    
    // Sort by pickup distance
    return matches.sort((a, b) => parseFloat(a.pickupDistance) - parseFloat(b.pickupDistance));
  } catch (error) {
    console.error('Error finding potential ride matches:', error);
    return [];
  }
};

// Listen for new ride matches in real-time
export const listenForRideMatches = (
  userId: string,
  searchType: 'findPartners' | 'findRides',
  maxDistance: number = 5,
  callback: (matches: any[]) => void
) => {
  try {
    // Determine which search group to look in
    const matchType = searchType === 'findPartners' ? 'activeRideBookers' : 'activePartnerSeekers';
    const searchRef = ref(database, `searches/${matchType}`);
    
    // Get user's ride info for comparison
    const userRideRef = ref(database, `users/${userId}/rideInfo`);
    
    // First get the current user's ride info
    get(userRideRef).then(userSnapshot => {
      if (!userSnapshot.exists()) {
        console.error('No ride info found for user:', userId);
        return;
      }
      
      const userRideInfo = userSnapshot.val();
      
      // Set up listener for changes
      onChildAdded(searchRef, async (childSnapshot) => {
        const matchUserId = childSnapshot.key;
        const matchData = childSnapshot.val();
        
        // Skip if it's the current user
        if (matchUserId === userId) return;
        
        // Perform the same distance checks
        const pickupDistance = calculateDistance(
          userRideInfo.pickup.coordinates.lat,
          userRideInfo.pickup.coordinates.lng,
          matchData.pickupCoordinates.lat, 
          matchData.pickupCoordinates.lng
        );
        
        if (pickupDistance <= maxDistance) {
          // Get user details
          try {
            const userProfileRef = ref(database, `users/${matchUserId}/profile`);
            const profileSnapshot = await get(userProfileRef);
            const profile = profileSnapshot.exists() ? profileSnapshot.val() : {};
            
            const rideInfoRef = ref(database, `users/${matchUserId}/rideInfo`);
            const rideInfoSnapshot = await get(rideInfoRef);
            const rideInfo = rideInfoSnapshot.exists() ? rideInfoSnapshot.val() : {};
            
            const destinationDistance = calculateDistance(
              userRideInfo.destination.coordinates.lat,
              userRideInfo.destination.coordinates.lng,
              rideInfo.destination.coordinates.lat,
              rideInfo.destination.coordinates.lng
            );
            
            // If it's a valid match, call the callback with the new match data
            if (destinationDistance < maxDistance * 2 && matchUserId) {
              callback([{
                id: matchUserId,
                name: profile.name || `User ${matchUserId.substring(0, 8)}`,
                profileImage: profile.profileImage,
                gender: profile.gender,
                languages: profile.languages || ['English'],
                rating: profile.rating || 4.5,
                pickupDistance: pickupDistance.toFixed(2),
                destinationDistance: destinationDistance.toFixed(2),
                pickup: rideInfo.pickup,
                destination: rideInfo.destination,
                timestamp: rideInfo.timestamp,
                providerDetails: rideInfo.providerDetails,
                preferences: rideInfo.preferences
              }]);
            }
          } catch (error) {
            console.error('Error processing new match:', error);
          }
        }
      });
    }).catch(error => {
      console.error('Error getting user ride info:', error);
    });
    
    // Return a function to unsubscribe from the listener
    return () => off(searchRef);
  } catch (error) {
    console.error('Error setting up ride matches listener:', error);
    return () => {};
  }
};

// =================== RIDE INVITES AND MATCHING ===================

// Send a ride invite to another user
export const sendRideInvite = async (
  senderId: string,
  receiverId: string,
  details: {
    pickup: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    destination: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    timestamp: string;
    message?: string;
    providerDetails?: {
      provider: string;
      rideId: string;
      fare: number;
      eta: string;
    };
    fareShare?: {
      totalFare: number;
      senderShare: number;
      receiverShare: number;
      calculationMethod: 'equal' | 'distance-based'
    };
  }
) => {
  try {
    const inviteRef = ref(database, `invites/${receiverId}/${senderId}`);
    await set(inviteRef, {
      ...details,
      senderId,
      status: 'pending', // pending, accepted, declined
      createdAt: new Date().toISOString()
    });
    
    // Also track sent invites for the sender
    const sentInviteRef = ref(database, `invites/${senderId}/sent/${receiverId}`);
    await set(sentInviteRef, {
      ...details,
      receiverId,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Error sending ride invite:', error);
    return false;
  }
};

// Get all pending invites for a user
export const getUserInvites = async (userId: string) => {
  try {
    const invitesRef = ref(database, `invites/${userId}`);
    const snapshot = await get(invitesRef);
    
    if (!snapshot.exists()) {
      return [];
    }
    
    const invitesData = snapshot.val();
    
    // Filter out "sent" invites and map to array
    const pendingInvites = Object.entries(invitesData)
      .filter(([key]) => key !== 'sent')
      .map(async ([senderId, inviteData]: [string, any]) => {
        // Get sender profile for display
        const senderProfileRef = ref(database, `users/${senderId}/profile`);
        const profileSnapshot = await get(senderProfileRef);
        const profile = profileSnapshot.exists() ? profileSnapshot.val() : {};
        
        return {
          id: senderId,
          senderId,
          senderName: profile.name || `User ${senderId.substring(0, 8)}`,
          senderProfile: profile,
          ...inviteData
        };
      });
    
    return Promise.all(pendingInvites);
  } catch (error) {
    console.error('Error getting user invites:', error);
    return [];
  }
};

// Update invite status
export const updateInviteStatus = async (
  userId: string,
  senderId: string,
  status: 'accepted' | 'declined'
) => {
  try {
    // Update for receiver
    const inviteRef = ref(database, `invites/${userId}/${senderId}`);
    await update(inviteRef, { 
      status,
      respondedAt: new Date().toISOString()
    });
    
    // Update for sender
    const sentInviteRef = ref(database, `invites/${senderId}/sent/${userId}`);
    await update(sentInviteRef, {
      status,
      respondedAt: new Date().toISOString()
    });
    
    // If accepted, create a match between the users
    if (status === 'accepted') {
      const inviteSnapshot = await get(inviteRef);
      if (inviteSnapshot.exists()) {
        const inviteData = inviteSnapshot.val();
        
        // Create a match
        await createRideMatch(senderId, userId, {
          pickup: inviteData.pickup,
          destination: inviteData.destination,
          timestamp: inviteData.timestamp,
          providerDetails: inviteData.providerDetails,
          fareShare: inviteData.fareShare
        });
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error updating invite status:', error);
    return false;
  }
};

// =================== CHAT FUNCTIONALITY ===================

// Send message to another user
export const sendMessage = async (
  senderId: string,
  receiverId: string,
  message: string
) => {
  try {
    // Create a chat room ID that's the same regardless of who's sending
    const chatRoomId = [senderId, receiverId].sort().join('_');
    const messagesRef = ref(database, `chats/${chatRoomId}/messages`);
    const newMessageRef = push(messagesRef);
    
    await set(newMessageRef, {
      senderId,
      text: message,
      timestamp: new Date().toISOString()
    });
    
    // Update last message for quick access
    const chatRoomRef = ref(database, `chats/${chatRoomId}`);
    await update(chatRoomRef, {
      lastMessage: message,
      lastMessageTime: new Date().toISOString(),
      lastMessageSenderId: senderId
    });
    
    // Update chat list for both users
    const senderChatsRef = ref(database, `users/${senderId}/chats/${chatRoomId}`);
    const receiverChatsRef = ref(database, `users/${receiverId}/chats/${chatRoomId}`);
    
    const chatInfo = {
      lastMessage: message,
      lastMessageTime: new Date().toISOString(),
      unread: 0
    };
    
    await update(senderChatsRef, chatInfo);
    
    // For receiver, mark as unread
    await update(receiverChatsRef, {
      ...chatInfo,
      unread: 1
    });
    
    return newMessageRef.key;
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
};

// Get chat history
export const getChatHistory = async (userId1: string, userId2: string, limit: number = 50) => {
  try {
    const chatRoomId = [userId1, userId2].sort().join('_');
    const messagesRef = ref(database, `chats/${chatRoomId}/messages`);
    const snapshot = await get(messagesRef);
    
    if (!snapshot.exists()) {
      return [];
    }
    
    // Convert to array and sort by timestamp
    const messages = Object.entries(snapshot.val()).map(([id, message]: [string, any]) => ({
      id,
      ...message,
      isFromCurrentUser: message.senderId === userId1
    }));
    
    // Sort by timestamp and limit
    return messages
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-limit);
  } catch (error) {
    console.error('Error getting chat history:', error);
    return [];
  }
};

// Listen for new messages in real-time
export const listenForNewMessages = (
  userId1: string,
  userId2: string,
  callback: (message: any) => void
) => {
  try {
    const chatRoomId = [userId1, userId2].sort().join('_');
    const messagesRef = ref(database, `chats/${chatRoomId}/messages`);
    
    // Listen for new messages
    const unsubscribe = onChildAdded(messagesRef, (snapshot) => {
      const message = snapshot.val();
      callback({
        id: snapshot.key,
        ...message,
        isFromCurrentUser: message.senderId === userId1
      });
    });
    
    // Mark messages as read when user opens the chat
    const userChatRef = ref(database, `users/${userId1}/chats/${chatRoomId}`);
    update(userChatRef, { unread: 0 })
      .catch(error => console.error('Error marking messages as read:', error));
    
    // Return function to unsubscribe
    return unsubscribe;
  } catch (error) {
    console.error('Error setting up messages listener:', error);
    return () => {};
  }
};

// =================== RIDE MATCH MANAGEMENT ===================

// Create a ride match between two users
export const createRideMatch = async (
  userId1: string,
  userId2: string,
  details: {
    pickup: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    destination: {
      address: string;
      coordinates: { lat: number; lng: number };
    };
    timestamp: string;
    providerDetails?: {
      provider: string;
      rideId: string;
      fare: number;
      eta: string;
    };
    fareShare?: {
      totalFare: number;
      user1Share: number;
      user2Share: number;
      calculationMethod: 'equal' | 'distance-based'
    };
  }
) => {
  try {
    const matchesRef = ref(database, 'matches');
    const newMatchRef = push(matchesRef);
    
    // Create match data
    const match = {
      users: {
        [userId1]: {
          status: 'confirmed'
        },
        [userId2]: {
          status: 'confirmed'
        }
      },
      details,
      status: 'matched', // matched, in_progress, completed, cancelled
      createdAt: new Date().toISOString(),
      paymentStatus: details.providerDetails ? {
        totalFare: details.fareShare?.totalFare || details.providerDetails.fare,
        paidByUser: userId1, // Assume the ride booker paid initially
        pendingPayment: {
          userId: userId2,
          amount: details.fareShare?.user2Share || Math.round(details.providerDetails.fare / 2)
        }
      } : null
    };
    
    await set(newMatchRef, match);
    
    // Update both users' ride info
    const user1Ref = ref(database, `users/${userId1}/rideInfo`);
    const user2Ref = ref(database, `users/${userId2}/rideInfo`);
    
    await update(user1Ref, {
      status: 'matched',
      currentMatchId: newMatchRef.key
    });
    
    await update(user2Ref, {
      status: 'matched',
      currentMatchId: newMatchRef.key
    });
    
    // Remove users from active searches
    const user1SearchRef = ref(database, `searches/activeRideBookers/${userId1}`);
    const user2SearchRef = ref(database, `searches/activePartnerSeekers/${userId2}`);
    
    await remove(user1SearchRef);
    await remove(user2SearchRef);
    
    return newMatchRef.key;
  } catch (error) {
    console.error('Error creating ride match:', error);
    return null;
  }
};

// Get current active match for a user
export const getCurrentMatch = async (userId: string) => {
  try {
    const userRideRef = ref(database, `users/${userId}/rideInfo`);
    const userSnapshot = await get(userRideRef);
    
    if (!userSnapshot.exists()) {
      return null;
    }
    
    const userRideInfo = userSnapshot.val();
    
    if (!userRideInfo.currentMatchId) {
      return null;
    }
    
    const matchRef = ref(database, `matches/${userRideInfo.currentMatchId}`);
    const matchSnapshot = await get(matchRef);
    
    if (!matchSnapshot.exists()) {
      return null;
    }
    
    const matchData = matchSnapshot.val();
    
    // Get the other user's ID
    const otherUserId = Object.keys(matchData.users).find(id => id !== userId);
    
    if (!otherUserId) {
      return { ...matchData, id: userRideInfo.currentMatchId };
    }
    
    // Get other user's profile
    const otherUserProfileRef = ref(database, `users/${otherUserId}/profile`);
    const profileSnapshot = await get(otherUserProfileRef);
    const otherUserProfile = profileSnapshot.exists() ? profileSnapshot.val() : {};
    
    return {
      ...matchData,
      id: userRideInfo.currentMatchId,
      otherUser: {
        id: otherUserId,
        ...otherUserProfile
      }
    };
  } catch (error) {
    console.error('Error getting current match:', error);
    return null;
  }
};

// =================== PAYMENT HANDLING ===================

// Record a payment for a ride match
export const recordPayment = async (
  matchId: string,
  payerId: string,
  recipientId: string,
  amount: number,
  method: 'cash' | 'online' | 'other'
) => {
  try {
    const paymentRef = ref(database, `matches/${matchId}/payments`);
    const newPaymentRef = push(paymentRef);
    
    await set(newPaymentRef, {
      payerId,
      recipientId,
      amount,
      method,
      status: 'completed',
      timestamp: new Date().toISOString()
    });
    
    // Update match payment status
    const matchRef = ref(database, `matches/${matchId}`);
    await update(matchRef, {
      'paymentStatus.pendingPayment': null,
      'paymentStatus.completed': true,
      'paymentStatus.lastPayment': {
        payerId,
        recipientId,
        amount,
        method,
        timestamp: new Date().toISOString()
      }
    });
    
    return true;
  } catch (error) {
    console.error('Error recording payment:', error);
    return false;
  }
};

// Calculate fare split based on distances
export const calculateFareSplit = (
  totalFare: number,
  userPickupDist: number,
  userDestDist: number,
  partnerPickupDist: number,
  partnerDestDist: number
) => {
  // Total distance for each user
  const userTotalDist = userPickupDist + userDestDist;
  const partnerTotalDist = partnerPickupDist + partnerDestDist;
  const combinedDist = userTotalDist + partnerTotalDist;
  
  // Calculate proportional split
  const userShare = Math.round((userTotalDist / combinedDist) * totalFare);
  const partnerShare = totalFare - userShare; // Ensures the total is exactly the fare
  
  return {
    userShare,
    partnerShare,
    calculationMethod: 'distance-based'
  };
};

// Simple distance calculation using Haversine formula
const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
};

const deg2rad = (deg: number): number => {
  return deg * (Math.PI / 180);
};

export default {
  app,
  database,
  auth,
  getCurrentUser,
  listenForAuthChanges,
  updateUserProfile,
  getUserProfile,
  updateUserRideInfo,
  findPotentialRideMatches,
  listenForRideMatches,
  sendRideInvite,
  getUserInvites,
  updateInviteStatus,
  sendMessage,
  getChatHistory,
  listenForNewMessages,
  createRideMatch,
  getCurrentMatch,
  recordPayment,
  calculateFareSplit
}; 
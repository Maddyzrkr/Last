import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
// @ts-ignore
import { Ionicons } from '../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from '../services/FirebaseService';

// Define interface for ride partners
interface RidePartner {
  id: string;
  name: string;
  profileImage?: string;
  gender?: string;
  languages?: string[];
  rating: number;
  pickupDistance: string;
  destinationDistance: string;
  pickup: {
    address: string;
    coordinates: { lat: number; lng: number };
  };
  destination: {
    address: string;
    coordinates: { lat: number; lng: number };
  };
  timestamp?: string;
  providerDetails?: {
    provider: string;
    rideId: string;
    fare: number;
    eta: string;
  };
}

// Fix for TypeScript error: Make properties required but allow empty strings to satisfy Record<string, string>
interface FindPartnersScreenParams extends Record<string, string> {
  rideId: string;
  pickup: string;
  destination: string;
  pickupAddress: string;
  destinationAddress: string;
}

// Define proper types for fareShare
interface FareShare {
  userShare: number;
  partnerShare: number;
  calculationMethod: string;
}

export default function FindPartnersScreen() {
  const params = useLocalSearchParams<FindPartnersScreenParams>();
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<RidePartner[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [destinationAddress, setDestinationAddress] = useState<string>('');
  const [searchRadius, setSearchRadius] = useState(5); // 5km default
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);

  // Parse coordinates on component mount
  useEffect(() => {
    parseCoordinates();
  }, [params]);

  // Parse coordinates from URL parameters
  const parseCoordinates = () => {
    try {
      // Parse pickup coordinates
      if (params.pickup && params.pickup !== '') {
        const [lat, lng] = params.pickup.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          setPickupCoords({ lat, lng });
        }
      }

      // Parse destination coordinates
      if (params.destination && params.destination !== '') {
        const [lat, lng] = params.destination.split(',').map(Number);
        if (!isNaN(lat) && !isNaN(lng)) {
          setDestinationCoords({ lat, lng });
        }
      }

      // Set addresses
      if (params.pickupAddress) {
        setPickupAddress(params.pickupAddress);
      }
      
      if (params.destinationAddress) {
        setDestinationAddress(params.destinationAddress);
      }

      // Debug
      console.log('Parsed pickup:', params.pickup);
      console.log('Parsed destination:', params.destination);
    } catch (error) {
      console.error('Error parsing coordinates:', error);
    }
  };

  // Setup Firebase and user data
  useEffect(() => {
    const setupUserAndRideData = async () => {
      try {
        setLoading(true);
        
        // Get or create user ID
        const storedUserId = await AsyncStorage.getItem('userId');
        const currentUser = FirebaseService.getCurrentUser();
        const userIdToUse = currentUser?.uid || storedUserId || `temp-user-${Date.now()}`;
        
        // Store user ID for later use
        if (!storedUserId) {
          await AsyncStorage.setItem('userId', userIdToUse);
        }
        
        setUserId(userIdToUse);
        
        // Ensure we have coordinates
        if (!pickupCoords || !destinationCoords) {
          console.error('Missing coordinates for ride');
          Alert.alert('Error', 'Missing pickup or destination location information.');
          setLoading(false);
          return;
        }
        
        // Update user ride info in Firebase
        await FirebaseService.updateUserRideInfo(userIdToUse, {
          rideType: 'bookingRide', // User is booking a ride and looking for partners
          pickup: {
            address: pickupAddress || 'Selected pickup location',
            coordinates: pickupCoords
          },
          destination: {
            address: destinationAddress || 'Selected destination',
            coordinates: destinationCoords
          },
          timestamp: new Date().toISOString(),
          status: 'searching',
          providerDetails: params.rideId ? {
            provider: 'unknown', // This would be filled in with actual provider data
            rideId: params.rideId,
            fare: 300, // Example fare
            eta: '10 mins'
          } : undefined
        });
        
        // Fetch initial matches
        fetchRidePartners();
        
        // Set up real-time listener for new matches if enabled
        if (isRealTimeEnabled) {
          setupRealTimeMatching(userIdToUse);
        }
      } catch (error) {
        console.error('Error setting up user and ride data:', error);
        Alert.alert('Error', 'Failed to initialize ride partner search.');
      } finally {
        setLoading(false);
      }
    };
    
    if (pickupCoords && destinationCoords) {
      setupUserAndRideData();
    }
    
    // Cleanup function
    return () => {
      // If we have a userId, update status when component unmounts
      if (userId) {
        FirebaseService.updateUserRideInfo(userId, {
          rideType: 'bookingRide',
          pickup: {
            address: pickupAddress || 'Selected pickup location',
            coordinates: pickupCoords || { lat: 0, lng: 0 }
          },
          destination: {
            address: destinationAddress || 'Selected destination',
            coordinates: destinationCoords || { lat: 0, lng: 0 }
          },
          timestamp: new Date().toISOString(),
          status: 'cancelled'
        }).catch(err => console.error('Error updating user status on unmount:', err));
      }
    };
  }, [pickupCoords, destinationCoords]);
  
  // Set up real-time matching listener
  const setupRealTimeMatching = (userIdToUse: string) => {
    const unsubscribe = FirebaseService.listenForRideMatches(
      userIdToUse,
      'findPartners',
      searchRadius,
      (newMatches) => {
        console.log('Real-time matches update:', newMatches);
        
        if (newMatches && newMatches.length > 0) {
          setPartners(prevPartners => {
            // Filter out duplicates
            const newPartnersList = [...prevPartners];
            
            newMatches.forEach(newMatch => {
              // Check if partner already exists
              const existingIndex = newPartnersList.findIndex(p => p.id === newMatch.id);
              
              if (existingIndex >= 0) {
                // Update existing partner
                newPartnersList[existingIndex] = newMatch;
              } else {
                // Add new partner
                newPartnersList.push(newMatch);
              }
            });
            
            return newPartnersList;
          });
        }
      }
    );
    
    // Return unsubscribe function
    return unsubscribe;
  };

  // Fetch ride partners from Firebase
  const fetchRidePartners = useCallback(async () => {
    if (!userId || !pickupCoords || !destinationCoords) {
      console.error('Missing required data for fetching ride partners');
      return;
    }
    
    try {
      setLoading(true);
      
      const matches = await FirebaseService.findPotentialRideMatches(
        userId,
        'findPartners',
        searchRadius
      );
      
      console.log('Found matches:', matches);
      
      setPartners(matches);
    } catch (error) {
      console.error('Error fetching ride partners:', error);
      Alert.alert('Error', 'Failed to find ride partners. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, pickupCoords, destinationCoords, searchRadius]);
  
  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRidePartners();
  }, [fetchRidePartners]);
  
  // Handle sending invite to a partner
  const handleSendInvite = async (partner: RidePartner) => {
    try {
      if (!userId) {
        Alert.alert('Error', 'User not logged in.');
        return;
      }

      // Calculate fare share if provider details are available
      let fareShare: FareShare | undefined = undefined;
      if (partner.providerDetails && partner.providerDetails.fare) {
        const totalFare = partner.providerDetails.fare;
        
        // For simplicity, using just the direct distance calculation
        // In a real app, this would be more sophisticated
        const userPickupDist = 0; // Current user's pickup distance (would calculate from current location)
        const userDestDist = parseFloat(partner.destinationDistance);
        const partnerPickupDist = parseFloat(partner.pickupDistance);
        const partnerDestDist = 0; // Destination distance for the ride provider is 0
        
        fareShare = FirebaseService.calculateFareSplit(
          totalFare,
          userPickupDist,
          userDestDist,
          partnerPickupDist,
          partnerDestDist
        );
      }
      
      // Send invite
      const success = await FirebaseService.sendRideInvite(
        userId,
        partner.id,
        {
          pickup: partner.pickup,
          destination: partner.destination,
          timestamp: partner.timestamp || new Date().toISOString(),
          message: `I'd like to share this ride with you!`,
          providerDetails: partner.providerDetails,
          fareShare: fareShare ? {
            totalFare: partner.providerDetails?.fare || 0,
            senderShare: fareShare.userShare,
            receiverShare: fareShare.partnerShare,
            calculationMethod: fareShare.calculationMethod as 'equal' | 'distance-based'
          } : undefined
        }
      );
      
      if (success) {
        Alert.alert('Invite Sent', `Invite sent to ${partner.name}!`);
      } else {
        throw new Error('Failed to send invite');
      }
    } catch (error) {
      console.error('Error sending invite:', error);
      Alert.alert('Error', 'Failed to send invite. Please try again.');
    }
  };
  
  // Start a chat with a partner
  const handleStartChat = (partner: RidePartner) => {
    if (!userId) {
      Alert.alert('Error', 'User not logged in.');
      return;
    }
    
    // Navigate to chat screen with partner ID
    router.push({
      pathname: `/chat/${partner.id}`,
      params: {
        partnerId: partner.id,
        partnerName: partner.name
      }
    });
  };
  
  // Render a potential partner item
  const renderPartnerItem = ({ item }: { item: RidePartner }) => (
    <View style={styles.partnerItem}>
      <View style={styles.partnerHeader}>
        <View style={styles.partnerInfo}>
          {item.profileImage ? (
            <Image source={{ uri: item.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.profileImagePlaceholder}>
              <Text style={styles.profileImageInitial}>{item.name.charAt(0)}</Text>
            </View>
          )}
          <View>
            <Text style={styles.partnerName}>{item.name}</Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      </View>
      
      <View style={styles.partnerDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="location" size={16} color="#666" />
          <Text style={styles.detailText}>{item.pickup.address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="navigate" size={16} color="#666" />
          <Text style={styles.detailText}>{item.destination.address}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="resize" size={16} color="#666" />
          <Text style={styles.detailText}>
            {item.pickupDistance} km from your pickup, {item.destinationDistance} km from your destination
          </Text>
        </View>
        
        {item.providerDetails && (
          <View style={styles.fareContainer}>
            <Text style={styles.fareText}>
              Ride fare: ₹{item.providerDetails.fare} • ETA: {item.providerDetails.eta}
            </Text>
          </View>
        )}
      </View>
      
      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.inviteButton]}
          onPress={() => handleSendInvite(item)}
        >
          <Ionicons name="paper-plane" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Send Invite</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.chatButton]}
          onPress={() => handleStartChat(item)}
        >
          <Ionicons name="chatbubble" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Start Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  // Empty list component
  const EmptyListComponent = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="search-outline" size={50} color="#ccc" />
      <Text style={styles.emptyTitle}>No Partners Found</Text>
      <Text style={styles.emptyText}>
        We couldn't find any ride partners nearby. Try increasing your search radius or check again later.
      </Text>
    </View>
  );
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find Ride Partners</Text>
      </View>
      
      <View style={styles.searchInfo}>
        <Text style={styles.infoTitle}>Your Ride Details</Text>
        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, styles.pickupDot]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {pickupAddress || 'Selected pickup location'}
            </Text>
          </View>
          <View style={styles.locationRow}>
            <View style={[styles.locationDot, styles.dropoffDot]} />
            <Text style={styles.locationText} numberOfLines={1}>
              {destinationAddress || 'Selected destination'}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.filtersContainer}>
        <Text style={styles.sectionTitle}>
          {loading ? 'Finding partners...' : `Available Partners (${partners.length})`}
        </Text>
        
        <TouchableOpacity 
          style={styles.radiusSelector}
          onPress={() => {
            const newRadius = searchRadius === 5 ? 10 : 5;
            setSearchRadius(newRadius);
            Alert.alert('Search Radius Updated', `Now searching within ${newRadius}km`);
            fetchRidePartners();
          }}
        >
          <Text style={styles.radiusText}>{searchRadius}km</Text>
          <Ionicons name="options-outline" size={16} color="#666" />
        </TouchableOpacity>
      </View>
      
      {loading && partners.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
          <Text style={styles.loadingText}>Finding ride partners nearby...</Text>
        </View>
      ) : (
        <FlatList
          data={partners}
          renderItem={renderPartnerItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#5C6BC0']}
            />
          }
          ListEmptyComponent={EmptyListComponent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  searchInfo: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  locationInfo: {
    marginTop: 8,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  pickupDot: {
    backgroundColor: '#4CAF50',
  },
  dropoffDot: {
    backgroundColor: '#F44336',
  },
  locationText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  filtersContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  radiusSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  radiusText: {
    fontSize: 14,
    marginRight: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginHorizontal: 24,
  },
  partnerItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  partnerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  profileImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#5C6BC0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileImageInitial: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  partnerName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  rating: {
    marginLeft: 4,
    fontSize: 14,
    color: '#666',
  },
  partnerDetails: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  fareContainer: {
    backgroundColor: '#f0f7ff',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  fareText: {
    fontSize: 14,
    color: '#0066cc',
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  inviteButton: {
    backgroundColor: '#5C6BC0',
  },
  chatButton: {
    backgroundColor: '#26A69A',
  },
  actionButtonText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '500',
  },
}); 
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '../components/icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from '../services/FirebaseService';

// Define ride partner interface
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

export default function PartnerSearchScreen() {
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [partners, setPartners] = useState<RidePartner[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [pickupLocation, setPickupLocation] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchRadius, setSearchRadius] = useState(5); // 5km default
  const [isRealTimeEnabled, setIsRealTimeEnabled] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  
  // Initialize user
  useEffect(() => {
    const setupUser = async () => {
      try {
        // Get current user ID
        const storedUserId = await AsyncStorage.getItem('userId');
        const currentUser = FirebaseService.getCurrentUser();
        const userIdToUse = currentUser?.uid || storedUserId || `temp-user-${Date.now()}`;
        
        // Store user ID for later use
        if (!storedUserId) {
          await AsyncStorage.setItem('userId', userIdToUse);
        }
        
        setUserId(userIdToUse);
        
        // Get device location
        const { status } = await Location.requestForegroundPermissionsAsync();
        
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Location permission is required for finding nearby ride partners.');
        } else {
          // Get current location
          const location = await Location.getCurrentPositionAsync({});
          const currentLocation = {
            lat: location.coords.latitude,
            lng: location.coords.longitude
          };
          
          // Set initial pickup location (user's current location)
          setPickupCoords(currentLocation);
          
          // Get address for current location
          const addresses = await Location.reverseGeocodeAsync({
            latitude: currentLocation.lat,
            longitude: currentLocation.lng
          });
          
          if (addresses && addresses.length > 0) {
            const address = addresses[0];
            const formattedAddress = [
              address.name, 
              address.street, 
              address.city, 
              address.region
            ].filter(Boolean).join(', ');
            
            setPickupLocation(formattedAddress);
          }
        }
      } catch (error) {
        console.error('Error setting up user:', error);
      } finally {
        setInitializing(false);
      }
    };
    
    setupUser();
  }, []);
  
  // Update coordinates when locations change
  useEffect(() => {
    const geocodeLocations = async () => {
      try {
        // Geocode pickup location
        if (pickupLocation && !pickupCoords) {
          const pickupResults = await Location.geocodeAsync(pickupLocation);
          
          if (pickupResults && pickupResults.length > 0) {
            setPickupCoords({
              lat: pickupResults[0].latitude,
              lng: pickupResults[0].longitude
            });
          }
        }
        
        // Geocode destination
        if (destination && !destinationCoords) {
          const destResults = await Location.geocodeAsync(destination);
          
          if (destResults && destResults.length > 0) {
            setDestinationCoords({
              lat: destResults[0].latitude,
              lng: destResults[0].longitude
            });
          }
        }
      } catch (error) {
        console.error('Error geocoding locations:', error);
      }
    };
    
    geocodeLocations();
  }, [pickupLocation, destination]);
  
  // Search for ride partners
  const findRidePartners = async () => {
    if (!userId || !pickupCoords || !destinationCoords) {
      Alert.alert('Missing Information', 'Please enter both pickup and destination locations.');
      return;
    }
    
    try {
      setLoading(true);
      setIsSearching(true);
      
      // Update user's ride info in Firebase
      await FirebaseService.updateUserRideInfo(userId, {
        rideType: 'findingPartner', // User is looking to join someone else's ride
        pickup: {
          address: pickupLocation,
          coordinates: pickupCoords
        },
        destination: {
          address: destination,
          coordinates: destinationCoords
        },
        timestamp: new Date().toISOString(),
        status: 'searching'
      });
      
      // Fetch available rides
      const availableRides = await FirebaseService.findPotentialRideMatches(
        userId,
        'findRides',
        searchRadius
      );
      
      console.log('Found available rides:', availableRides);
      
      setPartners(availableRides);
      
      // Set up real-time listener if enabled
      if (isRealTimeEnabled) {
        setupRealTimeMatching(userId);
      }
    } catch (error) {
      console.error('Error finding ride partners:', error);
      Alert.alert('Error', 'Failed to find ride partners. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Set up real-time matching listener
  const setupRealTimeMatching = (userIdToUse: string) => {
    const unsubscribe = FirebaseService.listenForRideMatches(
      userIdToUse,
      'findRides',
      searchRadius,
      (newMatches) => {
        console.log('Real-time rides update:', newMatches);
        
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
  
  // Pull-to-refresh handler
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    findRidePartners().finally(() => setRefreshing(false));
  }, [userId, pickupCoords, destinationCoords, searchRadius]);
  
  // Handle sending invite to a partner
  const handleSendInvite = async (partner: RidePartner) => {
    if (!userId) {
      Alert.alert('Error', 'User not logged in.');
      return;
    }
    
    try {
      // Send invite
      const success = await FirebaseService.sendRideInvite(
        userId,
        partner.id,
        {
          pickup: partner.pickup,
          destination: partner.destination,
          timestamp: partner.timestamp || new Date().toISOString(),
          message: `I'd like to join your ride!`,
          providerDetails: partner.providerDetails
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
  
  // Render a ride option item
  const renderRideItem = ({ item }: { item: RidePartner }) => (
    <View style={styles.rideItem}>
      <View style={styles.rideHeader}>
        <View style={styles.riderInfo}>
          {item.profileImage ? (
            <Image source={{ uri: item.profileImage }} style={styles.profileImage} />
          ) : (
            <View style={styles.profileImagePlaceholder}>
              <Text style={styles.profileImageInitial}>{item.name.charAt(0)}</Text>
            </View>
          )}
          <View>
            <Text style={styles.riderName}>{item.name}</Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={16} color="#FFD700" />
              <Text style={styles.rating}>{item.rating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
        
        {item.providerDetails && (
          <View style={styles.providerTag}>
            <Text style={styles.providerText}>{item.providerDetails.provider || 'Taxi'}</Text>
          </View>
        )}
      </View>
      
      <View style={styles.rideDetails}>
        <View style={styles.locationItem}>
          <View style={[styles.locationDot, styles.pickupDot]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.pickup.address}
          </Text>
        </View>
        <View style={styles.locationDivider} />
        <View style={styles.locationItem}>
          <View style={[styles.locationDot, styles.destinationDot]} />
          <Text style={styles.locationText} numberOfLines={1}>
            {item.destination.address}
          </Text>
        </View>
      </View>
      
      <View style={styles.rideInfo}>
        <View style={styles.infoItem}>
          <Ionicons name="resize" size={16} color="#666" />
          <Text style={styles.infoText}>
            {item.pickupDistance} km from your pickup
          </Text>
        </View>
        
        {item.providerDetails && (
          <View style={styles.infoItem}>
            <Ionicons name="cash-outline" size={16} color="#666" />
            <Text style={styles.infoText}>
              Est. fare: ₹{item.providerDetails.fare}
            </Text>
          </View>
        )}
        
        {item.providerDetails && (
          <View style={styles.infoItem}>
            <Ionicons name="time-outline" size={16} color="#666" />
            <Text style={styles.infoText}>
              ETA: {item.providerDetails.eta}
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
          <Text style={styles.actionButtonText}>Request to Join</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.chatButton]}
          onPress={() => handleStartChat(item)}
        >
          <Ionicons name="chatbubble" size={16} color="#fff" />
          <Text style={styles.actionButtonText}>Chat</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  // Empty list component
  const EmptyListComponent = () => (
    <View style={styles.emptyContainer}>
      {isSearching ? (
        <>
          <Ionicons name="search-outline" size={50} color="#ccc" />
          <Text style={styles.emptyTitle}>No Rides Found</Text>
          <Text style={styles.emptyText}>
            We couldn't find any rides matching your route. Try adjusting your search or check again later.
          </Text>
        </>
      ) : (
        <>
          <Ionicons name="car-outline" size={50} color="#ccc" />
          <Text style={styles.emptyTitle}>Find Available Rides</Text>
          <Text style={styles.emptyText}>
            Enter your pickup and destination locations to find people who have booked rides and are looking for partners.
          </Text>
        </>
      )}
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
        <Text style={styles.headerTitle}>Find Available Rides</Text>
      </View>
      
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <View style={styles.searchContainer}>
          <View style={styles.inputContainer}>
            <Ionicons name="location-outline" size={20} color="#5C6BC0" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Your pickup location"
              value={pickupLocation}
              onChangeText={setPickupLocation}
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Ionicons name="navigate-outline" size={20} color="#F44336" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Where are you going?"
              value={destination}
              onChangeText={setDestination}
            />
          </View>
          
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={findRidePartners}
            disabled={!pickupLocation || !destination || loading}
          >
            <Text style={styles.searchButtonText}>Find Partners</Text>
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={18} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        
        {initializing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#5C6BC0" />
            <Text style={styles.loadingText}>Setting up...</Text>
          </View>
        ) : (
          <>
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsTitle}>
                {isSearching ? 
                  `Available Rides (${partners.length})` : 
                  'Enter locations to find rides'}
              </Text>
              
              {isSearching && (
                <TouchableOpacity 
                  style={styles.radiusSelector}
                  onPress={() => {
                    const newRadius = searchRadius === 5 ? 10 : 5;
                    setSearchRadius(newRadius);
                    Alert.alert('Search Radius Updated', `Now searching within ${newRadius}km`);
                    findRidePartners();
                  }}
                >
                  <Text style={styles.radiusText}>{searchRadius}km</Text>
                  <Ionicons name="options-outline" size={16} color="#666" />
                </TouchableOpacity>
              )}
            </View>
            
            <FlatList
              data={partners}
              renderItem={renderRideItem}
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
          </>
        )}
      </KeyboardAvoidingView>
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
  searchContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C6BC0',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 8,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
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
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  resultsTitle: {
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
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    marginTop: 48,
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
  rideItem: {
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
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  riderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
  },
  profileImagePlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#5C6BC0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profileImageInitial: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  riderName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  rating: {
    marginLeft: 4,
    fontSize: 14,
    color: '#666',
  },
  providerTag: {
    backgroundColor: '#e0f2f1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  providerText: {
    color: '#00796b',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rideDetails: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  locationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  pickupDot: {
    backgroundColor: '#4CAF50',
  },
  destinationDot: {
    backgroundColor: '#F44336',
  },
  locationText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  locationDivider: {
    height: 14,
    width: 1,
    backgroundColor: '#ddd',
    marginLeft: 4,
  },
  rideInfo: {
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
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
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialIcons } from '../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from '../services/FirebaseService';

export default function BookRideScreen() {
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [pickupCoordinates, setPickupCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [destinationCoordinates, setDestinationCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [fare, setFare] = useState<number | null>(null);
  const [eta, setEta] = useState<string | null>(null);
  const [providers, setProviders] = useState<{name: string, fare: number, eta: string}[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<number | null>(null);
  
  // Initialize user
  useEffect(() => {
    const setupUser = async () => {
      try {
        // Get current user ID
        const storedUserId = await AsyncStorage.getItem('userId');
        const currentUser = FirebaseService.getCurrentUser();
        const userIdToUse = currentUser?.uid || storedUserId;
        
        if (!userIdToUse) {
          console.error('No user ID available');
          Alert.alert('Authentication Error', 'Please sign in to book a ride.');
          router.replace('/');
          return;
        }
        
        setCurrentUserId(userIdToUse);
        
        // Attempt to get user's current location
        try {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              // Use reverse geocoding to get address from coordinates
              const { latitude, longitude } = position.coords;
              reverseGeocode(latitude, longitude);
            },
            (error) => {
              console.error("Error getting location:", error);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
          );
        } catch (error) {
          console.error("Geolocation error:", error);
        }
      } catch (error) {
        console.error('Error setting up user:', error);
      }
    };
    
    setupUser();
  }, []);
  
  // Reverse geocode coordinates to address
  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      // This would typically use a mapping API like Google Maps
      // For now, just set coordinates and a placeholder address
      setPickupCoordinates({ lat: latitude, lng: longitude });
      setPickup("Current Location");
    } catch (error) {
      console.error('Error reverse geocoding:', error);
    }
  };
  
  // Forward geocode address to coordinates
  const geocodeLocations = async () => {
    if (!pickup || !destination) {
      Alert.alert('Missing Information', 'Please enter both pickup and destination locations.');
      return false;
    }
    
    try {
      setLoading(true);
      
      // This would typically use a mapping API like Google Maps
      // For now, just simulate with mock coordinates
      
      // Mock pickup coordinates if not already set
      if (!pickupCoordinates) {
        // Use some default coordinates (this is just a placeholder)
        setPickupCoordinates({ lat: 19.0760, lng: 72.8777 }); // Mumbai coordinates
      }
      
      // Mock destination coordinates
      setDestinationCoordinates({ lat: 19.1136, lng: 72.8697 }); // Another location in Mumbai
      
      // Generate mock ride providers with fares and ETAs
      const mockProviders = [
        { name: 'Economy', fare: 150, eta: '10 mins' },
        { name: 'Premier', fare: 220, eta: '8 mins' },
        { name: 'SUV', fare: 350, eta: '15 mins' }
      ];
      
      setProviders(mockProviders);
      
      setLoading(false);
      return true;
    } catch (error) {
      console.error('Error geocoding locations:', error);
      setLoading(false);
      return false;
    }
  };
  
  // Book the ride
  const bookRide = async () => {
    if (!currentUserId || !pickupCoordinates || !destinationCoordinates) {
      Alert.alert('Missing Information', 'Please enter both pickup and destination locations.');
      return;
    }
    
    if (selectedProvider === null) {
      Alert.alert('Select Ride Type', 'Please select a ride type to continue.');
      return;
    }
    
    try {
      setLoading(true);
      
      const selectedRide = providers[selectedProvider];
      
      // Save ride info to Firebase
      const success = await FirebaseService.updateUserRideInfo(
        currentUserId,
        {
          rideType: 'bookingRide',
          pickup: {
            address: pickup,
            coordinates: pickupCoordinates
          },
          destination: {
            address: destination,
            coordinates: destinationCoordinates
          },
          timestamp: new Date().toISOString(),
          status: 'searching',
          providerDetails: {
            provider: selectedRide.name,
            rideId: `ride-${Date.now()}`,
            fare: selectedRide.fare,
            eta: selectedRide.eta
          }
        }
      );
      
      if (success) {
        // Store ride info locally for easy access
        await AsyncStorage.setItem('currentRideInfo', JSON.stringify({
          pickup: {
            address: pickup,
            coordinates: pickupCoordinates
          },
          destination: {
            address: destination,
            coordinates: destinationCoordinates
          },
          providerDetails: {
            provider: selectedRide.name,
            rideId: `ride-${Date.now()}`,
            fare: selectedRide.fare,
            eta: selectedRide.eta
          }
        }));
        
        // Navigate to find partners screen
        router.push('/partner-search');
      } else {
        throw new Error('Failed to update ride info');
      }
    } catch (error) {
      console.error('Error booking ride:', error);
      Alert.alert('Booking Error', 'There was a problem booking your ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle searching for rides
  const handleSearchRides = async () => {
    const success = await geocodeLocations();
    if (success) {
      // Locations geocoded successfully, show ride options
      // (providers state will be populated)
    }
  };
  
  // Render a provider option
  const renderProviderOption = (provider: {name: string, fare: number, eta: string}, index: number) => (
    <TouchableOpacity
      key={index}
      style={[
        styles.providerOption,
        selectedProvider === index && styles.selectedProvider
      ]}
      onPress={() => setSelectedProvider(index)}
    >
      <View style={styles.providerIconContainer}>
        {provider.name === 'Economy' && (
          <Ionicons name="car-outline" size={24} color="#4CAF50" />
        )}
        {provider.name === 'Premier' && (
          <Ionicons name="car-sport-outline" size={24} color="#2196F3" />
        )}
        {provider.name === 'SUV' && (
          <MaterialIcons name="airport-shuttle" size={24} color="#9C27B0" />
        )}
      </View>
      <View style={styles.providerDetails}>
        <Text style={styles.providerName}>{provider.name}</Text>
        <Text style={styles.providerEta}>{provider.eta}</Text>
      </View>
      <Text style={styles.providerFare}>₹{provider.fare}</Text>
    </TouchableOpacity>
  );
  
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book a Ride</Text>
        </View>
        
        <ScrollView contentContainerStyle={styles.contentContainer}>
          <View style={styles.locationInputsContainer}>
            <View style={styles.inputContainer}>
              <View style={[styles.locationDot, styles.pickupDot]} />
              <TextInput
                style={styles.locationInput}
                placeholder="Pickup location"
                value={pickup}
                onChangeText={setPickup}
              />
            </View>
            
            <View style={styles.locationDivider} />
            
            <View style={styles.inputContainer}>
              <View style={[styles.locationDot, styles.destinationDot]} />
              <TextInput
                style={styles.locationInput}
                placeholder="Destination"
                value={destination}
                onChangeText={setDestination}
              />
            </View>
          </View>
          
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={handleSearchRides}
            disabled={!pickup || !destination || loading}
          >
            <Text style={styles.searchButtonText}>Find Rides</Text>
          </TouchableOpacity>
          
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#5C6BC0" />
              <Text style={styles.loadingText}>Finding rides...</Text>
            </View>
          )}
          
          {providers.length > 0 && (
            <View style={styles.providersContainer}>
              <Text style={styles.providersTitle}>Available Ride Options</Text>
              {providers.map((provider, index) => renderProviderOption(provider, index))}
            </View>
          )}
          
          {selectedProvider !== null && (
            <View style={styles.bookingContainer}>
              <TouchableOpacity 
                style={styles.bookButton}
                onPress={bookRide}
                disabled={loading}
              >
                <Text style={styles.bookButtonText}>Book & Find Partners</Text>
              </TouchableOpacity>
              <Text style={styles.bookingHint}>
                This will book your ride and help you find partners to share it with
              </Text>
            </View>
          )}
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>How it works</Text>
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>1</Text>
              </View>
              <Text style={styles.infoText}>
                Enter your pickup and destination to see available ride options
              </Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>2</Text>
              </View>
              <Text style={styles.infoText}>
                Select your ride type and book
              </Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>3</Text>
              </View>
              <Text style={styles.infoText}>
                Find partners to share your ride and split the fare
              </Text>
            </View>
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>4</Text>
              </View>
              <Text style={styles.infoText}>
                Enjoy your ride and save money!
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardAvoidingView: {
    flex: 1,
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
  contentContainer: {
    padding: 16,
  },
  locationInputsContainer: {
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
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  pickupDot: {
    backgroundColor: '#4CAF50',
  },
  destinationDot: {
    backgroundColor: '#F44336',
  },
  locationInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  locationDivider: {
    height: 24,
    width: 1,
    backgroundColor: '#e0e0e0',
    marginLeft: 5,
  },
  searchButton: {
    backgroundColor: '#5C6BC0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  providersContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  providersTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedProvider: {
    backgroundColor: 'rgba(92, 107, 192, 0.1)',
    borderRadius: 8,
    borderBottomWidth: 0,
    padding: 8,
    marginVertical: 4,
  },
  providerIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  providerDetails: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  providerEta: {
    fontSize: 14,
    color: '#666',
  },
  providerFare: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#5C6BC0',
  },
  bookingContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  bookButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  bookButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bookingHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  infoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoNumberContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#5C6BC0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
}); 
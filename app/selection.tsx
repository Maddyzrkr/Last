import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from './components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from './services/FirebaseService';

export default function SelectionScreen() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [hasPendingInvites, setHasPendingInvites] = useState(false);
  
  // Check for user and pending invites
  useEffect(() => {
    const checkUserAndInvites = async () => {
      try {
        // Get current user ID
        const storedUserId = await AsyncStorage.getItem('userId');
        const currentUser = FirebaseService.getCurrentUser();
        const userIdToUse = currentUser?.uid || storedUserId;
        
        if (!userIdToUse) {
          console.error('No user ID available');
          // Redirect to login (you may need to implement this)
          router.replace('/');
          return;
        }
        
        setUserId(userIdToUse);
        
        // Check for pending invites
        const invites = await FirebaseService.getUserInvites(userIdToUse);
        setHasPendingInvites(invites.length > 0);
      } catch (error) {
        console.error('Error checking user and invites:', error);
      } finally {
        setLoading(false);
      }
    };
    
    checkUserAndInvites();
  }, []);
  
  // Handle booking a ride
  const handleBookRide = () => {
    router.push('/book-ride');
  };
  
  // Handle finding a partner
  const handleFindPartner = () => {
    router.push('/partner-search');
  };
  
  // Handle viewing invites
  const handleViewInvites = () => {
    router.push('/invites');
  };
  
  return (
    <SafeAreaView style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <View style={styles.contentContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>MatchMyRide</Text>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
              <Ionicons name="person-circle-outline" size={30} color="#5C6BC0" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.welcomeText}>What would you like to do?</Text>
          
          {hasPendingInvites && (
            <TouchableOpacity 
              style={styles.invitesButton}
              onPress={handleViewInvites}
            >
              <Ionicons name="mail-unread-outline" size={24} color="#fff" />
              <Text style={styles.invitesButtonText}>
                You have pending ride invites!
              </Text>
            </TouchableOpacity>
          )}
          
          <View style={styles.optionsContainer}>
            <TouchableOpacity 
              style={styles.optionCard}
              onPress={handleBookRide}
            >
              <View style={styles.optionIconContainer}>
                <Ionicons name="car-sport-outline" size={40} color="#5C6BC0" />
              </View>
              <Text style={styles.optionTitle}>Book a Ride</Text>
              <Text style={styles.optionDescription}>
                Book a ride and find partners to share it with
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.optionCard}
              onPress={handleFindPartner}
            >
              <View style={styles.optionIconContainer}>
                <Ionicons name="people-outline" size={40} color="#4CAF50" />
              </View>
              <Text style={styles.optionTitle}>Find a Partner</Text>
              <Text style={styles.optionDescription}>
                Join someone who has already booked a ride
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>How it Works</Text>
            
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>1</Text>
              </View>
              <Text style={styles.infoText}>
                Choose to book a ride or find a partner
              </Text>
            </View>
            
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>2</Text>
              </View>
              <Text style={styles.infoText}>
                Get matched with riders based on your route
              </Text>
            </View>
            
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>3</Text>
              </View>
              <Text style={styles.infoText}>
                Chat with potential partners and coordinate your ride
              </Text>
            </View>
            
            <View style={styles.infoStep}>
              <View style={styles.infoNumberContainer}>
                <Text style={styles.infoNumber}>4</Text>
              </View>
              <Text style={styles.infoText}>
                Ride together and split the cost
              </Text>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  contentContainer: {
    flex: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#5C6BC0',
  },
  profileButton: {
    padding: 8,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  invitesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  invitesButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  optionIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(92, 107, 192, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  optionDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  infoContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoNumberContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
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
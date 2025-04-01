import React, { useState, useEffect } from 'react';
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
import { router } from 'expo-router';
// @ts-ignore
import { Ionicons } from '../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from '../services/FirebaseService';

// Define invite interface
interface RideInvite {
  id: string;
  senderId: string;
  senderName: string;
  senderProfile: {
    name?: string;
    profileImage?: string;
    gender?: string;
    rating?: number;
  };
  pickup: {
    address: string;
    coordinates: { lat: number; lng: number };
  };
  destination: {
    address: string;
    coordinates: { lat: number; lng: number };
  };
  timestamp: string;
  status: 'pending' | 'accepted' | 'declined';
  fareShare?: {
    totalFare: number;
    senderShare: number;
    receiverShare: number;
    calculationMethod: 'equal' | 'distance-based';
  };
  providerDetails?: {
    provider: string;
    rideId: string;
    fare: number;
    eta: string;
  };
}

export default function InvitesScreen() {
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<RideInvite[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  
  // Initialize invites
  useEffect(() => {
    const fetchUserAndInvites = async () => {
      try {
        // Get current user ID
        const storedUserId = await AsyncStorage.getItem('userId');
        const currentUser = FirebaseService.getCurrentUser();
        const userIdToUse = currentUser?.uid || storedUserId;
        
        if (!userIdToUse) {
          console.error('No user ID available');
          Alert.alert('Authentication Error', 'Please sign in to view invites.');
          router.replace('/');
          return;
        }
        
        setUserId(userIdToUse);
        
        // Fetch invites
        await fetchInvites(userIdToUse);
      } catch (error) {
        console.error('Error fetching user and invites:', error);
        Alert.alert('Error', 'Failed to load ride invites.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchUserAndInvites();
  }, []);
  
  // Fetch invites from Firebase
  const fetchInvites = async (userIdToUse: string) => {
    try {
      setLoading(true);
      
      const userInvites = await FirebaseService.getUserInvites(userIdToUse);
      console.log('Fetched invites:', userInvites);
      
      // Sort by timestamp (newest first)
      const sortedInvites = userInvites.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setInvites(sortedInvites);
    } catch (error) {
      console.error('Error fetching invites:', error);
      Alert.alert('Error', 'Failed to load ride invites.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  
  // Handle pull-to-refresh
  const onRefresh = async () => {
    if (!userId) return;
    
    setRefreshing(true);
    await fetchInvites(userId);
  };
  
  // Handle accepting an invite
  const handleAcceptInvite = async (invite: RideInvite) => {
    if (!userId) return;
    
    try {
      setLoading(true);
      
      // Update invite status in Firebase
      const success = await FirebaseService.updateInviteStatus(
        userId,
        invite.senderId,
        'accepted'
      );
      
      if (success) {
        Alert.alert(
          'Invite Accepted',
          'You have accepted the ride invite! You can now chat with your ride partner.',
          [
            {
              text: 'Chat Now',
              onPress: () => {
                router.push({
                  pathname: `/chat/${invite.senderId}`,
                  params: {
                    partnerId: invite.senderId,
                    partnerName: invite.senderName
                  }
                });
              }
            },
            {
              text: 'Later',
              style: 'cancel',
              onPress: () => {
                // Refresh invites list
                fetchInvites(userId);
              }
            }
          ]
        );
      } else {
        throw new Error('Failed to accept invite');
      }
    } catch (error) {
      console.error('Error accepting invite:', error);
      Alert.alert('Error', 'Failed to accept invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Handle declining an invite
  const handleDeclineInvite = async (invite: RideInvite) => {
    if (!userId) return;
    
    try {
      setLoading(true);
      
      // Update invite status in Firebase
      const success = await FirebaseService.updateInviteStatus(
        userId,
        invite.senderId,
        'declined'
      );
      
      if (success) {
        Alert.alert(
          'Invite Declined',
          'You have declined the ride invite.',
          [
            {
              text: 'OK',
              onPress: () => {
                // Refresh invites list
                fetchInvites(userId);
              }
            }
          ]
        );
      } else {
        throw new Error('Failed to decline invite');
      }
    } catch (error) {
      console.error('Error declining invite:', error);
      Alert.alert('Error', 'Failed to decline invite. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // View invite details
  const viewInviteDetails = (invite: RideInvite) => {
    Alert.alert(
      'Ride Details',
      `From: ${invite.pickup.address}\nTo: ${invite.destination.address}\n\n${
        invite.fareShare ? 
        `Your share: ₹${invite.fareShare.receiverShare}\nTotal fare: ₹${invite.fareShare.totalFare}` : 
        'No fare details available'
      }`,
      [
        {
          text: 'Accept',
          onPress: () => handleAcceptInvite(invite),
        },
        {
          text: 'Decline',
          style: 'cancel',
          onPress: () => handleDeclineInvite(invite),
        },
        {
          text: 'Close',
          style: 'cancel',
        }
      ]
    );
  };
  
  // Render an invite item
  const renderInviteItem = ({ item }: { item: RideInvite }) => (
    <View style={styles.inviteItem}>
      <View style={styles.inviteHeader}>
        <View style={styles.senderInfo}>
          {item.senderProfile?.profileImage ? (
            <Image 
              source={{ uri: item.senderProfile.profileImage }} 
              style={styles.profileImage} 
            />
          ) : (
            <View style={styles.profileImagePlaceholder}>
              <Text style={styles.profileImageInitial}>
                {item.senderName?.charAt(0) || 'U'}
              </Text>
            </View>
          )}
          <View>
            <Text style={styles.senderName}>{item.senderName}</Text>
            {item.senderProfile?.rating && (
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={14} color="#FFD700" />
                <Text style={styles.ratingText}>{item.senderProfile.rating.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
        <Text style={styles.inviteTime}>
          {new Date(item.timestamp).toLocaleDateString()}
        </Text>
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
      
      {item.fareShare && (
        <View style={styles.fareContainer}>
          <Text style={styles.fareText}>
            Your share: ₹{item.fareShare.receiverShare} • Total: ₹{item.fareShare.totalFare}
          </Text>
        </View>
      )}
      
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.detailsButton]}
          onPress={() => viewInviteDetails(item)}
        >
          <Ionicons name="information-circle-outline" size={16} color="#5C6BC0" />
          <Text style={styles.detailsButtonText}>Details</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.declineButton]}
          onPress={() => handleDeclineInvite(item)}
        >
          <Ionicons name="close-circle-outline" size={16} color="#F44336" />
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.acceptButton]}
          onPress={() => handleAcceptInvite(item)}
        >
          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
  
  // Empty list component
  const EmptyListComponent = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="mail-outline" size={60} color="#ccc" />
      <Text style={styles.emptyTitle}>No Invites</Text>
      <Text style={styles.emptyText}>
        You don't have any ride invites at the moment.
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
        <Text style={styles.headerTitle}>Ride Invites</Text>
      </View>
      
      {loading && invites.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
          <Text style={styles.loadingText}>Loading invites...</Text>
        </View>
      ) : (
        <FlatList
          data={invites}
          renderItem={renderInviteItem}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
  },
  inviteItem: {
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
  inviteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  senderInfo: {
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
  senderName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ratingText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 2,
  },
  inviteTime: {
    fontSize: 12,
    color: '#666',
  },
  rideDetails: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
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
  fareContainer: {
    backgroundColor: '#f0f7ff',
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  detailsButton: {
    borderWidth: 1,
    borderColor: '#5C6BC0',
  },
  declineButton: {
    borderWidth: 1,
    borderColor: '#F44336',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  detailsButtonText: {
    marginLeft: 4,
    color: '#5C6BC0',
    fontWeight: '500',
  },
  declineButtonText: {
    marginLeft: 4,
    color: '#F44336',
    fontWeight: '500',
  },
  acceptButtonText: {
    marginLeft: 4,
    color: '#fff',
    fontWeight: '500',
  },
}); 
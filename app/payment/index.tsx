import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from '../services/FirebaseService';

// Type definitions
type PaymentParams = {
  matchId?: string;
  recipientId?: string;
  amount?: string;
}

export default function PaymentScreen() {
  // Get params from URL
  const params = useLocalSearchParams<PaymentParams>();
  
  // State management
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<any>(null);
  const [matchDetails, setMatchDetails] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  const [processingPayment, setProcessingPayment] = useState(false);
  
  // Amount from params
  const amount = parseFloat(params.amount || '0');
  
  // Initialize payment with parameters
  useEffect(() => {
    initializePayment();
  }, []);
  
  // Initialize payment details
  const initializePayment = async () => {
    try {
      setIsLoading(true);
      
      // Get current user ID
      const storedUserId = await AsyncStorage.getItem('userId');
      const currentUser = FirebaseService.getCurrentUser();
      const userIdToUse = currentUser?.uid || storedUserId;
      
      if (!userIdToUse) {
        console.error('No user ID available');
        router.replace('/');
        return;
      }
      
      setCurrentUserId(userIdToUse);
      
      // Get recipient profile
      if (params.recipientId) {
        const recipientProfile = await FirebaseService.getUserProfile(params.recipientId);
        if (recipientProfile) {
          setRecipient(recipientProfile);
        }
      }
      
      // Get match details
      if (params.matchId) {
        const match = await FirebaseService.getCurrentMatch(userIdToUse);
        if (match && match.id === params.matchId) {
          setMatchDetails(match);
        }
      }
    } catch (error) {
      console.error('Error initializing payment:', error);
      Alert.alert('Error', 'Failed to load payment details.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle payment process
  const processPayment = async () => {
    if (!currentUserId || !params.matchId || !params.recipientId) {
      Alert.alert('Error', 'Missing required information for payment.');
      return;
    }
    
    try {
      setProcessingPayment(true);
      
      // Record payment in Firebase
      const success = await FirebaseService.recordPayment(
        params.matchId,
        currentUserId,
        params.recipientId,
        amount,
        paymentMethod
      );
      
      if (success) {
        Alert.alert(
          'Payment Successful',
          `You have successfully paid ₹${amount} to ${recipient?.name || 'your ride partner'}.`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Navigate back to chat or ride details
                router.replace(`/chat/${params.recipientId}`);
              }
            }
          ]
        );
      } else {
        throw new Error('Payment recording failed');
      }
    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('Payment Failed', 'There was an issue processing your payment. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };
  
  // Handle back navigation
  const handleBack = () => {
    router.back();
  };
  
  const renderPaymentMethods = () => (
    <View style={styles.methodsContainer}>
      <Text style={styles.sectionTitle}>Select Payment Method</Text>
      
      <TouchableOpacity
        style={[
          styles.methodOption,
          paymentMethod === 'online' && styles.selectedMethod
        ]}
        onPress={() => setPaymentMethod('online')}
      >
        <View style={styles.methodIcon}>
          <Ionicons name="card-outline" size={24} color="#5C6BC0" />
        </View>
        <View style={styles.methodDetails}>
          <Text style={styles.methodTitle}>Online Payment</Text>
          <Text style={styles.methodDescription}>Pay using UPI, cards, or net banking</Text>
        </View>
        {paymentMethod === 'online' && (
          <Ionicons name="checkmark-circle" size={24} color="#5C6BC0" />
        )}
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[
          styles.methodOption,
          paymentMethod === 'cash' && styles.selectedMethod
        ]}
        onPress={() => setPaymentMethod('cash')}
      >
        <View style={styles.methodIcon}>
          <Ionicons name="cash-outline" size={24} color="#4CAF50" />
        </View>
        <View style={styles.methodDetails}>
          <Text style={styles.methodTitle}>Cash Payment</Text>
          <Text style={styles.methodDescription}>Pay directly to your ride partner</Text>
        </View>
        {paymentMethod === 'cash' && (
          <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
        )}
      </TouchableOpacity>
    </View>
  );
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
      </View>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
          <Text style={styles.loadingText}>Loading payment details...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.paymentCard}>
            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Amount to Pay</Text>
              <Text style={styles.amount}>₹{amount.toFixed(2)}</Text>
              <Text style={styles.amountDescription}>
                Your share of the ride fare
              </Text>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.recipientContainer}>
              <Text style={styles.sectionTitle}>Paying To</Text>
              <View style={styles.recipientInfo}>
                {recipient?.profileImage ? (
                  <Image 
                    source={{ uri: recipient.profileImage }} 
                    style={styles.recipientImage} 
                  />
                ) : (
                  <View style={styles.recipientImagePlaceholder}>
                    <Text style={styles.recipientInitial}>
                      {recipient?.name?.charAt(0) || 'U'}
                    </Text>
                  </View>
                )}
                <View style={styles.recipientDetails}>
                  <Text style={styles.recipientName}>
                    {recipient?.name || 'Ride Partner'}
                  </Text>
                  <Text style={styles.recipientSubtext}>
                    For shared ride on {matchDetails?.createdAt ? 
                      new Date(matchDetails.createdAt).toLocaleDateString() : 
                      new Date().toLocaleDateString()}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          
          {renderPaymentMethods()}
          
          <View style={styles.rideDetailsCard}>
            <Text style={styles.sectionTitle}>Ride Details</Text>
            {matchDetails ? (
              <>
                <View style={styles.rideDetail}>
                  <Ionicons name="location-outline" size={18} color="#666" />
                  <Text style={styles.rideDetailText}>
                    From: {matchDetails.details.pickup.address}
                  </Text>
                </View>
                <View style={styles.rideDetail}>
                  <Ionicons name="navigate-outline" size={18} color="#666" />
                  <Text style={styles.rideDetailText}>
                    To: {matchDetails.details.destination.address}
                  </Text>
                </View>
                {matchDetails.details.providerDetails && (
                  <View style={styles.rideDetail}>
                    <Ionicons name="car-outline" size={18} color="#666" />
                    <Text style={styles.rideDetailText}>
                      Provider: {matchDetails.details.providerDetails.provider || 'Taxi Service'}
                    </Text>
                  </View>
                )}
                <View style={styles.fareBreakdown}>
                  <Text style={styles.fareTitle}>Fare Breakdown</Text>
                  <View style={styles.fareItem}>
                    <Text style={styles.fareItemText}>Total Fare</Text>
                    <Text style={styles.fareItemValue}>
                      ₹{matchDetails.paymentStatus?.totalFare || '0.00'}
                    </Text>
                  </View>
                  <View style={styles.fareItem}>
                    <Text style={styles.fareItemText}>Your Share</Text>
                    <Text style={styles.fareItemValue}>₹{amount.toFixed(2)}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.noDetailsText}>
                Ride details not available
              </Text>
            )}
          </View>
          
          <TouchableOpacity 
            style={styles.payButton}
            onPress={processPayment}
            disabled={processingPayment}
          >
            <Text style={styles.payButtonText}>
              {paymentMethod === 'cash' ? 'Confirm Cash Payment' : 'Pay Now'}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.secureText}>
            <Ionicons name="lock-closed" size={12} color="#666" /> Secure payment process
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
  scrollContent: {
    padding: 16,
  },
  paymentCard: {
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
  amountContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  amountLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  amount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#5C6BC0',
    marginBottom: 8,
  },
  amountDescription: {
    fontSize: 14,
    color: '#666',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  recipientContainer: {
    
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  recipientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipientImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  recipientImagePlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#5C6BC0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recipientInitial: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  recipientDetails: {
    flex: 1,
  },
  recipientName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  recipientSubtext: {
    fontSize: 14,
    color: '#666',
  },
  methodsContainer: {
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
  methodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 12,
  },
  selectedMethod: {
    borderColor: '#5C6BC0',
    backgroundColor: 'rgba(92, 107, 192, 0.05)',
  },
  methodIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  methodDetails: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 14,
    color: '#666',
  },
  rideDetailsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  rideDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideDetailText: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  noDetailsText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 16,
  },
  fareBreakdown: {
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  fareTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  fareItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fareItemText: {
    fontSize: 14,
    color: '#666',
  },
  fareItemValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  payButton: {
    backgroundColor: '#5C6BC0',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secureText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
}); 
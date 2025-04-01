import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  SafeAreaView,
  Image,
  Alert
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '../components/icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirebaseService from '../services/FirebaseService';

// Define message type
interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  isFromCurrentUser: boolean;
}

type ChatParams = {
  id: string; // Partner ID
  matchId?: string; // Optional match ID if coming from a matched ride
  partnerName?: string; // Optional partner name
}

export default function ChatScreen() {
  const params = useLocalSearchParams<ChatParams>();
  const partnerId = params.id;
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState(params.partnerName || 'Chat Partner');
  const [partnerProfile, setPartnerProfile] = useState<any>(null);
  const [isInviteSent, setIsInviteSent] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<any>(null);
  const flatListRef = useRef<FlatList>(null);

  // Initialize chat
  useEffect(() => {
    const initChat = async () => {
      try {
        setIsLoading(true);
        
        // Get user ID (from AsyncStorage or Firebase Auth)
        const storedUserId = await AsyncStorage.getItem('userId');
        const currentUser = FirebaseService.getCurrentUser();
        const userIdToUse = currentUser?.uid || storedUserId;
        
        if (!userIdToUse) {
          console.error('No user ID available');
          router.replace('/');
          return;
        }
        
        setCurrentUserId(userIdToUse);
        
        // Get partner profile
        const profile = await FirebaseService.getUserProfile(partnerId);
        if (profile) {
          setPartnerProfile(profile);
          setPartnerName(profile.name || partnerName);
        }
        
        // Check if there's a current match between the users
        const match = await FirebaseService.getCurrentMatch(userIdToUse);
        if (match && Object.keys(match.users).includes(partnerId)) {
          setCurrentMatch(match);
        }
        
        // Load chat history
        const chatHistory = await FirebaseService.getChatHistory(userIdToUse, partnerId);
        setMessages(chatHistory);
        
        // Set up real-time listener for new messages
        const unsubscribe = FirebaseService.listenForNewMessages(
          userIdToUse,
          partnerId,
          (newMessage) => {
            // Add message to state
            setMessages(prevMessages => {
              // Check if message is already in the list
              const messageExists = prevMessages.some(msg => msg.id === newMessage.id);
              
              if (!messageExists) {
                return [...prevMessages, newMessage];
              }
              
              return prevMessages;
            });
            
            // Scroll to bottom when new message arrives
            setTimeout(() => {
              if (flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
              }
            }, 100);
          }
        );
        
        // Clean up listener on unmount
        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Error initializing chat:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initChat();
  }, [partnerId]);
  
  // Handle sending a message
  const sendMessage = async () => {
    if (!messageText.trim() || !currentUserId) return;
    
    try {
      // Send message through Firebase
      const msgId = await FirebaseService.sendMessage(
        currentUserId,
        partnerId,
        messageText.trim()
      );
      
      // Clear input
      setMessageText('');
      
      // Scroll to bottom
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };
  
  // Send a ride invite
  const sendRideInvite = async () => {
    if (!currentUserId) return;
    
    try {
      // Get current user's ride info
      const userRideRef = await AsyncStorage.getItem('currentRideInfo');
      
      if (!userRideRef) {
        Alert.alert('No Ride Information', 'Please set up your ride before sending an invite.');
        return;
      }
      
      const userRideInfo = JSON.parse(userRideRef);
      
      // Send invite
      const success = await FirebaseService.sendRideInvite(
        currentUserId,
        partnerId,
        {
          pickup: userRideInfo.pickup,
          destination: userRideInfo.destination,
          timestamp: new Date().toISOString(),
          message: 'Would you like to share this ride with me?',
          providerDetails: userRideInfo.providerDetails
        }
      );
      
      if (success) {
        setIsInviteSent(true);
        Alert.alert('Invite Sent', `Ride invite sent to ${partnerName}!`);
        
        // Send a message about the invite
        await FirebaseService.sendMessage(
          currentUserId,
          partnerId,
          'I sent you a ride invite! You can check your invites in the app.'
        );
      }
    } catch (error) {
      console.error('Error sending ride invite:', error);
      Alert.alert('Error', 'Failed to send ride invite. Please try again.');
    }
  };
  
  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  // Render message item
  const renderMessageItem = ({ item }: { item: Message }) => (
    <View 
      style={[
        styles.messageContainer, 
        item.isFromCurrentUser ? styles.sentMessage : styles.receivedMessage
      ]}
    >
      <View style={styles.messageContent}>
        <Text style={styles.messageText}>{item.text}</Text>
        <Text style={[
          styles.messageTime,
          { color: item.isFromCurrentUser ? 'rgba(255,255,255,0.7)' : '#999' }
        ]}>
          {formatTime(item.timestamp)}
        </Text>
      </View>
    </View>
  );
  
  // Handle back navigation
  const handleBack = () => {
    router.back();
  };
  
  // Payment prompt if there's a match with pending payment
  const renderPaymentPrompt = () => {
    if (!currentMatch || !currentMatch.paymentStatus || !currentMatch.paymentStatus.pendingPayment) {
      return null;
    }
    
    // Only show payment prompt if the current user is the one who needs to pay
    if (currentMatch.paymentStatus.pendingPayment.userId !== currentUserId) {
      return null;
    }
    
    const amount = currentMatch.paymentStatus.pendingPayment.amount;
    
    return (
      <View style={styles.paymentPrompt}>
        <Text style={styles.paymentTitle}>Payment Required</Text>
        <Text style={styles.paymentText}>
          You need to pay ₹{amount} for your share of the ride.
        </Text>
        <TouchableOpacity 
          style={styles.payButton}
          onPress={() => {
            // Navigate to payment screen
            router.push({
              pathname: '/payment',
              params: {
                matchId: currentMatch.id,
                amount: amount.toString(),
                recipientId: partnerId
              }
            });
          }}
        >
          <Text style={styles.payButtonText}>Pay Now</Text>
        </TouchableOpacity>
      </View>
    );
  };
  
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        
        <View style={styles.headerProfile}>
          {partnerProfile && partnerProfile.profileImage ? (
            <Image 
              source={{ uri: partnerProfile.profileImage }} 
              style={styles.profileImage} 
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{partnerName.charAt(0)}</Text>
            </View>
          )}
          <Text style={styles.headerTitle}>{partnerName}</Text>
        </View>
        
        {!isInviteSent && !currentMatch && (
          <TouchableOpacity style={styles.inviteButton} onPress={sendRideInvite}>
            <Ionicons name="paper-plane-outline" size={20} color="#5C6BC0" />
          </TouchableOpacity>
        )}
      </View>
      
      {/* Render payment prompt if applicable */}
      {renderPaymentPrompt()}
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessageItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            onLayout={() => {
              if (flatListRef.current && messages.length > 0) {
                flatListRef.current.scrollToEnd({ animated: false });
              }
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubble-ellipses-outline" size={50} color="#ccc" />
                <Text style={styles.emptyText}>
                  No messages yet. Start the conversation!
                </Text>
              </View>
            }
          />
          
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={messageText}
              onChangeText={setMessageText}
              multiline
            />
            <TouchableOpacity 
              style={[
                styles.sendButton,
                !messageText.trim() && styles.sendButtonDisabled
              ]}
              onPress={sendMessage}
              disabled={!messageText.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    marginRight: 10,
  },
  headerProfile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#5C6BC0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  inviteButton: {
    padding: 8,
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
  keyboardAvoidingView: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    marginTop: 12,
    color: '#666',
    textAlign: 'center',
  },
  messageContainer: {
    maxWidth: '80%',
    marginVertical: 4,
    borderRadius: 16,
  },
  sentMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#5C6BC0',
  },
  receivedMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EAF6',
  },
  messageContent: {
    padding: 12,
  },
  messageText: {
    fontSize: 16,
    color: '#fff',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: '#5C6BC0',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#bdbdbd',
  },
  paymentPrompt: {
    backgroundColor: '#FFF8E1',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE082',
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  paymentText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  payButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  messageTime: {
    fontSize: 12,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
}); 
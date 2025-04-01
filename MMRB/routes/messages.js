// routes/messages.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const Message = require('../models/Message');
const User = require('../models/User');

// Get messages with a specific user
router.get('/:partnerId', verifyToken, async (req, res) => {
  try {
    const { partnerId } = req.params;
    const userId = req.user.id;
    
    // Validate partner exists
    const partner = await User.findById(partnerId);
    if (!partner) {
      return res.status(404).json({ message: 'Partner not found' });
    }
    
    // Generate chat room ID
    const chatRoomId = Message.getChatRoomId(userId, partnerId);
    
    // Get messages between these users, sorted by timestamp
    const messages = await Message.find({ chatRoomId })
      .sort({ createdAt: 1 })
      .limit(100); // Limit to latest 100 messages
    
    // Mark unread messages as read
    await Message.updateMany(
      { 
        chatRoomId,
        receiver: userId,
        isRead: false
      },
      { 
        $set: { 
          isRead: true,
          readAt: new Date()
        }
      }
    );
    
    // Return messages
    res.json({ messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a message via REST API (backup for socket.io)
router.post('/send', verifyToken, async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    const senderId = req.user.id;
    
    if (!receiverId || !text) {
      return res.status(400).json({ message: 'Receiver ID and message text are required' });
    }
    
    // Validate receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver not found' });
    }
    
    // Generate chat room ID
    const chatRoomId = Message.getChatRoomId(senderId, receiverId);
    
    // Create new message
    const newMessage = new Message({
      sender: senderId,
      receiver: receiverId,
      text,
      chatRoomId
    });
    
    // Save to database
    await newMessage.save();
    
    // Return the created message
    res.status(201).json({ message: newMessage });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get unread message count
router.get('/unread/count', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Count unread messages for this user
    const unreadCount = await Message.countDocuments({
      receiver: userId,
      isRead: false
    });
    
    // Group by sender to show how many unread messages from each user
    const unreadByUser = await Message.aggregate([
      {
        $match: {
          receiver: mongoose.Types.ObjectId(userId),
          isRead: false
        }
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 },
          lastMessage: { $last: '$text' },
          lastMessageAt: { $last: '$createdAt' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'senderDetails'
        }
      },
      {
        $unwind: '$senderDetails'
      },
      {
        $project: {
          sender: '$_id',
          senderName: '$senderDetails.name',
          count: 1,
          lastMessage: 1,
          lastMessageAt: 1
        }
      },
      {
        $sort: { lastMessageAt: -1 }
      }
    ]);
    
    res.json({
      total: unreadCount,
      messages: unreadByUser
    });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
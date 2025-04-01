const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  // Create a chat room ID - to easily find all messages between two users
  chatRoomId: {
    type: String,
    required: true
  }
}, 
{
  timestamps: true // Adds createdAt and updatedAt fields
});

// Index to optimize queries
MessageSchema.index({ chatRoomId: 1, createdAt: -1 });
MessageSchema.index({ sender: 1, receiver: 1 });

// Static method to find or create a chat room ID
MessageSchema.statics.getChatRoomId = function(userId1, userId2) {
  // Sort IDs to ensure consistency regardless of who initiates the chat
  const participants = [userId1.toString(), userId2.toString()].sort();
  return `chat_${participants.join('_')}`;
};

module.exports = mongoose.model("Message", MessageSchema); 
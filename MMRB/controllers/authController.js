const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const registerUser = async (req, res) => {
  try {
    console.log("🛠 Received Data:", req.body);

    const { 
      username, 
      email, 
      password,
      phone,
      gender,
      languages,
      location,
      locationCoords,
      profileImage
    } = req.body; 
    
    // Validate all required fields
    if (!username || !email || !password || !phone || !gender || !languages || !location) {
      return res.status(400).json({ 
        message: "All fields are required!",
        missingFields: {
          username: !username,
          email: !email,
          password: !password,
          phone: !phone,
          gender: !gender,
          languages: !languages,
          location: !location
        }
      });
    }

    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ message: "User already exists!" });
      }
      if (existingUser.username === username) {
        return res.status(400).json({ message: "Username already taken!" });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with all profile details
    const newUser = new User({ 
      username,  
      name: username, 
      email, 
      password: hashedPassword,
      phone,
      gender,
      languages,
      location,
      locationCoords: locationCoords ? {
        type: "Point",
        coordinates: [locationCoords.longitude, locationCoords.latitude]
      } : undefined,
      profileImage,
      isOnboarded: true // Set to true since we're collecting all details during registration
    });
    
    console.log("New user:", newUser);
    const savedUser = await newUser.save();

    // Generate token for immediate login
    const token = jwt.sign({ id: savedUser._id }, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.status(201).json({ 
      message: "User registered successfully!",
      token,
      userId: savedUser._id,
      username: savedUser.username,
      isOnboarded: true
    });
  } catch (error) {
    console.error("❌ Error in Registration:", error);
    res.status(500).json({ error: error.message });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required!" });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found!" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials!" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.status(200).json({ 
      token, 
      userId: user._id, 
      username: user.username,
      isOnboarded: user.isOnboarded,
      message: "Login successful!" 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Add this to your existing authController.js file

// Update/save user profile
const updateProfile = async (req, res) => {
  try {
    const { phone, gender, languages, location, locationCoords, profileImage } = req.body;
    const userId = req.body.userId; 
    console.log("Profile update request received for userId:", userId);
    console.log("Profile data:", req.body);
    
    // Validate required fields
    if (!phone || !gender || !languages || !location) {
      return res.status(400).json({ 
        success: false, 
        message: "Missing required fields" 
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Update user profile
    user.phone = phone;
    user.gender = gender;
    user.languages = languages;
    user.location = location;
    
    // Only update optional fields if provided
    if (locationCoords) {
      user.locationCoords = {
        type: "Point",
        coordinates: [locationCoords.longitude, locationCoords.latitude]
      };
    }

    if (profileImage) {
      user.profileImage = profileImage;
    }

    // Set onboarded status to true
    user.isOnboarded = true;
    console.log("Setting isOnboarded to true for user:", userId);

    // Save the updated user
    const updatedUser = await user.save();
    console.log("User updated successfully, onboarding status:", updatedUser.isOnboarded);
    
    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        phone: user.phone,
        gender: user.gender,
        languages: user.languages,
        location: user.location,
        isOnboarded: user.isOnboarded
      }
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message
    });
  }
};

const checkOnboardingStatus = async (req, res) => {
  try {
    const userId = req.params.userId;
    console.log("Checking onboarding status for userId:", userId);
    
    const user = await User.findById(userId);
    if (!user) {
      console.log("User not found for userId:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("User found, onboarding status:", user.isOnboarded);
    res.status(200).json({ isOnboarded: user.isOnboarded });
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    res.status(500).json({ error: error.message });
  }
};

const getMatchingUsers = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = await User.findById(userId);

    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // If current user is in booking mode, find seekers
    // If current user is in seeking mode, find bookers
    const matchingUsers = await User.find({
      _id: { $ne: userId }, // Exclude current user
      mode: currentUser.mode === 'booking' ? 'seeking' : 'booking',
      isOnboarded: true,
      location: { $exists: true }
    }).select('username name profileImage location languages gender mode');

    res.status(200).json({
      users: matchingUsers,
      currentMode: currentUser.mode
    });
  } catch (error) {
    console.error("Error fetching matching users:", error);
    res.status(500).json({ message: "Error fetching users" });
  }
};

module.exports = { registerUser, loginUser, updateProfile, checkOnboardingStatus, getMatchingUsers };
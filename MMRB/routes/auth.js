// const express = require("express");
// const { registerUser, loginUser } = require("../controllers/authController");
// const { verifyToken } = require("../middleware/authMiddleware");

// const router = express.Router();

// router.post("/register", registerUser);
// router.post("/login", loginUser);
// router.get("/protected", verifyToken, (req, res) => {
//   res.json({ message: "This is a protected route!", user: req.user });
// });

// module.exports = router;

const express = require("express");
const router = express.Router();
const User = require('../models/User');

const { registerUser, loginUser, updateProfile, checkOnboardingStatus, getMatchingUsers } = require("../controllers/authController");
const { verifyToken } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);
// New route for updating user profile
router.post("/profile", updateProfile);
router.get("/check-onboarding/:userId", verifyToken, checkOnboardingStatus);
router.get("/matching-users/:userId", verifyToken, getMatchingUsers);

router.get("/protected", verifyToken, (req, res) => {
  res.json({ message: "This is a protected route!", user: req.user });
});

// routes/auth.js
// Add this endpoint to update user mode
router.post('/update-mode', verifyToken, async (req, res) => {
  const { mode } = req.body;
  
  try {
    if (!['booking', 'seeking'].includes(mode)) {
      return res.status(400).json({ message: 'Invalid mode' });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.id, 
      { mode }, 
      { new: true }
    );
    
    res.json({ user });
  } catch (error) {
    console.error('Error updating user mode:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
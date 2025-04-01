// import jwt from "jsonwebtoken";

// const authMiddleware = (req, res, next) => {
//   const token = req.header("Authorization");
//   if (!token) return res.status(401).json({ message: "Access Denied" });

//   try {
//     const verified = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = verified;
//     next();
//   } catch (error) {
//     res.status(400).json({ message: "Invalid Token" });
//   }
// };

// export default authMiddleware;

// const jwt = require("jsonwebtoken");

// const verifyToken = (req, res, next) => {
//   const token = req.header("Authorization");
//   if (!token) return res.status(401).json({ message: "Access Denied" });

//   try {
//     const verified = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = verified;
//     next();
//   } catch (error) {
//     res.status(400).json({ message: "Invalid Token" });
//   }
// };

// module.exports = { verifyToken };

const jwt = require("jsonwebtoken");
const User = require("../models/User");

const verifyToken = (req, res, next) => {
  console.log("verifyToken middleware reached");
  console.log("All headers:", req.headers);
  
  const authHeader = req.header("Authorization");
  console.log("Auth header received:", authHeader);
  
  const token = authHeader?.split(" ")[1] || authHeader;
  console.log("Token extracted:", token);
  
  if (!token) {
    console.log("No token found, returning 401");
    return res.status(401).json({ message: "Access Denied" });
  }
  
  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Token verified successfully:", verified);
    req.user = verified;
    next();
  } catch (error) {
    console.error("Token verification error:", error);
    console.error(error.message);
    res.status(400).json({ message: "Invalid Token", details: error.message });
  }
};

module.exports = { verifyToken };
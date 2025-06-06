// middleware/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");
    if (!authHeader) {
      throw new Error("Token tidak ditemukan");
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) throw new Error("User tidak ditemukan");

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ message: "Autentikasi gagal", error: err.message });
  }
};

module.exports = auth;

const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../utils/nodemailer");
const bcrypt = require("bcryptjs");

// Registrasi User
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Nama wajib diisi"),
    body("phoneNumber").notEmpty().withMessage("Nomor telepon wajib diisi"),
    body("email").isEmail().withMessage("Email tidak valid"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password minimal 6 karakter"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, phoneNumber, email, password } = req.body;

      // Cek apakah email sudah terdaftar
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email sudah terdaftar" });
      }

      // Cek apakah nomor telepon sudah terdaftar
      const existingPhoneNumber = await User.findOne({ phoneNumber });
      if (existingPhoneNumber) {
        return res
          .status(400)
          .json({ message: "Nomor telepon sudah terdaftar" });
      }

      // Buat user baru
      const user = new User({ name, phoneNumber, email, password });
      await user.save();

      // Generate token JWT
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.status(201).json({ user, token });
    } catch (err) {
      res.status(500).json({ message: "Registrasi gagal", error: err.message });
    }
  }
);

// Login User
router.post(
  "/login",
  [
    body("email").isEmail().withMessage("Email tidak valid"),
    body("password").notEmpty().withMessage("Password wajib diisi"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email, password } = req.body;
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(401).json({ message: "Email atau password salah" });
      }

      // Bandingkan password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: "Email atau password salah" });
      }

      // Generate token JWT
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });

      res.json({ user, token });
    } catch (err) {
      res.status(500).json({ message: "Login gagal", error: err.message });
    }
  }
);

// Lupa Password - Kirim Email Reset
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Email tidak valid")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ message: "User tidak ditemukan" });
      }

      // Generate token reset password
      const resetToken = crypto.randomBytes(20).toString("hex");
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpire = Date.now() + 3600000; // Token expired in 1 hour
      await user.save();

      // Buat URL reset password
      const resetUrl = `http://localhost:5000/reset-password/${resetToken}`;

      // Kirim email
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Reset Password - Marketplace",
        html: `
          <h3>Reset Password</h3>
          <p>Klik link berikut untuk reset password:</p>
          <a href="${resetUrl}">${resetUrl}</a>
          <p>Link ini berlaku selama 1 jam</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      res.json({ message: "Email reset telah dikirim" });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Gagal mengirim email", error: err.message });
    }
  }
);

// Reset Password dengan Token
router.post(
  "/reset-password/:token",
  [
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password minimal 6 karakter"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { token } = req.params;
      const { password } = req.body;

      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpire: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({ message: "Token invalid atau expired" });
      }

      // Update password
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();
      res.json({ message: "Password berhasil direset" });
    } catch (err) {
      res
        .status(500)
        .json({ message: "Gagal reset password", error: err.message });
    }
  }
);

// Dapatkan profil user (terproteksi)
router.get("/profile", auth, async (req, res) => {
  res.json(req.user);
});

// Update profil user (terproteksi)
router.put("/profile", auth, async (req, res) => {
  try {
    // Ambil update dari body
    const updates = { ...req.body };

    // Jika terdapat perubahan password, hash terlebih dahulu
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }

    // Update user dan kembalikan user yang sudah diupdate
    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
    });
    res.json(user);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Gagal update profil", error: err.message });
  }
});

// Hapus akun user (terproteksi)
router.delete("/profile", auth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.json({ message: "Akun berhasil dihapus" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Gagal menghapus akun", error: err.message });
  }
});

module.exports = router;

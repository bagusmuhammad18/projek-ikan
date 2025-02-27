const express = require("express");
const router = express.Router();
const User = require("../models/User");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../utils/nodemailer");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const bcrypt = require("bcryptjs");

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: "Terlalu banyak percobaan, coba lagi nanti." },
});

// Sanitize query
router.use(mongoSanitize());

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Manajemen pengguna
 */

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Registrasi pengguna baru
 *     tags: [Users]
 *     security: []  # Tidak memerlukan autentikasi
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               phoneNumber:
 *                 type: string
 *                 example: "08123456789"
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       201:
 *         description: Registrasi berhasil
 *       400:
 *         description: Data tidak valid atau email sudah terdaftar
 *       500:
 *         description: Kesalahan server
 */
router.post(
  "/register",
  limiter,
  [
    body("name").trim().notEmpty().withMessage("Nama wajib diisi").escape(),
    body("phoneNumber")
      .trim()
      .notEmpty()
      .withMessage("Nomor telepon wajib diisi")
      .escape(),
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email tidak valid")
      .normalizeEmail(),
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
      const existingUser = await User.findOne({ email });
      if (existingUser)
        return res.status(400).json({ message: "Email sudah terdaftar" });

      const user = new User({ name, phoneNumber, email, password });
      await user.save();

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.status(201).json({ user, token });
    } catch (err) {
      res.status(500).json({ message: "Registrasi gagal", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login pengguna
 *     tags: [Users]
 *     security: []  # Tidak memerlukan autentikasi
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Login berhasil
 *       401:
 *         description: Email atau password salah
 *       500:
 *         description: Kesalahan server
 */
router.post(
  "/login",
  limiter,
  [
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email tidak valid")
      .normalizeEmail(),
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

      if (!user)
        return res.status(401).json({ message: "Email atau password salah" });

      const isMatch = await user.comparePassword(password);
      if (!isMatch)
        return res.status(401).json({ message: "Email atau password salah" });

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      res.json({ user, token });
    } catch (err) {
      res.status(500).json({ message: "Login gagal", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Dapatkan profil pengguna
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     responses:
 *       200:
 *         description: Profil pengguna
 *       401:
 *         description: Tidak terautentikasi
 */
router.get("/profile", auth, async (req, res) => {
  res.json(req.user);
});

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update profil pengguna
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profil berhasil diupdate
 *       401:
 *         description: Tidak terautentikasi
 *       500:
 *         description: Gagal update profil
 */
router.put("/profile", auth, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.password) {
      const user = await User.findById(req.user.id);
      user.password = updates.password;
      await user.save();
      delete updates.password;
    }
    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
    });
    res.json(updatedUser);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Gagal update profil", error: err.message });
  }
});

/**
 * @swagger
 * /api/users/profile:
 *   delete:
 *     summary: Hapus akun pengguna
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     responses:
 *       200:
 *         description: Akun berhasil dihapus
 *       500:
 *         description: Gagal menghapus akun
 */
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

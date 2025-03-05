const express = require("express");
const router = express.Router();
const User = require("../models/User"); // Sudah ada
const Order = require("../models/Order"); // Tambahkan ini
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../utils/nodemailer");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose"); // Pastikan ini ada

// Middleware Rate Limiting untuk mencegah brute-force attack
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // Maksimal 100 request dalam 15 menit
  message: { message: "Terlalu banyak percobaan, coba lagi nanti." },
});

// Middleware untuk sanitasi query MongoDB (mencegah NoSQL Injection)
router.use(mongoSanitize());

// Registrasi User
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

      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone)
        return res
          .status(400)
          .json({ message: "Nomor telepon sudah terdaftar" });

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

// Login User
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
        return res쉬.status(401).json({ message: "Email atau password salah" });

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

// Lupa Password - Kirim Email Reset
router.post(
  "/forgot-password",
  limiter,
  [
    body("email")
      .trim()
      .isEmail()
      .withMessage("Email tidak valid")
      .normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      const user = await User.findOne({ email });

      if (!user)
        return res.status(404).json({ message: "User tidak ditemukan" });

      const resetToken = user.generateResetPasswordToken();
      await user.save();

      const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Reset Password - Marketplace",
        html: `<h3>Reset Password</h3><p>Klik link berikut:</p><a href="${resetUrl}">${resetUrl}</a><p>Link ini berlaku selama 1 jam.</p>`,
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

// Reset Password
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

      const hashedToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
      const user = await User.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { $gt: Date.now() },
      });

      if (!user)
        return res.status(400).json({ message: "Token invalid atau expired" });

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
// Hapus Pengguna Berdasarkan ID (Hanya Admin)
router.delete("/customers/:id", auth, async (req, res) => {
  try {
    // Cek jika user adalah admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak. Hanya admin yang dapat menghapus pengguna.",
      });
    }

    const { id } = req.params;

    // Cari dan hapus pengguna berdasarkan ID
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

    // Pastikan pengguna yang dihapus adalah customer (opsional)
    if (deletedUser.role !== "customer") {
      return res.status(400).json({
        success: false,
        message: "Hanya pengguna dengan peran 'customer' yang dapat dihapus",
      });
    }

    res.status(200).json({
      success: true,
      message: `Pengguna ${deletedUser.name} berhasil dihapus`,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal menghapus pengguna",
      error: err.message,
    });
  }
});

// Profil User
router.get("/profile", auth, async (req, res) => {
  res.json(req.user);
});

// Update Profil User
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

// Hapus Akun User
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

// Get Semua Customer dengan Pagination dan Sorting
router.get("/customers", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak. Hanya admin yang dapat mengakses data ini.",
      });
    }

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Sorting parameters
    const sortBy = req.query.sortBy || "createdAt"; // Default sort by createdAt
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1; // asc = 1, desc = -1

    // Validasi sortBy agar hanya menerima field yang diizinkan
    const allowedSortFields = ["name", "createdAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

    // Hitung total dokumen
    const totalCustomers = await User.countDocuments({ role: "customer" });

    // Ambil data dengan sorting dinamis dan case-insensitive untuk field name
    const query = User.find({ role: "customer" })
      .select("name email phoneNumber createdAt _id")
      .skip(skip)
      .limit(limit)
      .sort({ [sortField]: sortOrder });

    // Tambahkan collation untuk case-insensitive sorting pada field name
    if (sortField === "name") {
      query.collation({ locale: "en", strength: 2 }); // Case-insensitive
    }

    const customers = await query.lean();

    // Format data untuk frontend
    const formattedCustomers = customers.map((customer) => ({
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      registrationDate: customer.createdAt, // Konsisten dengan frontend
    }));

    res.status(200).json({
      success: true,
      total: totalCustomers,
      page,
      limit,
      totalPages: Math.ceil(totalCustomers / limit),
      data: formattedCustomers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil data customer",
      error: err.message,
    });
  }
});

// Get Detail Customer Berdasarkan ID (Hanya Admin)
router.get("/customers/:id/summary", auth, async (req, res) => {
  try {
    console.log("Request received for ID:", req.params.id);
    console.log("User role from token:", req.user.role);

    if (req.user.role !== "admin") {
      console.log("Access denied: User is not admin");
      return res.status(403).json({
        success: false,
        message: "Akses ditolak. Hanya admin yang dapat mengakses data ini.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log("Invalid ID format:", id);
      return res.status(400).json({
        success: false,
        message: "ID customer tidak valid",
      });
    }

    const customer = await User.findById(id)
      .select("name email phoneNumber gender addresses role")
      .lean();
    console.log("Customer found:", customer);

    if (!customer || customer.role !== "customer") {
      console.log("Customer not found or not a customer:", customer);
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    // Agregasi order berdasarkan user
    const orders = await Order.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    console.log("Orders aggregated:", orders);

    // Inisialisasi orderSummary
    const orderSummary = {
      totalOrders: 0,
      completed: 0,
      processing: 0,
      canceled: 0,
    };

    // Hitung total dan kelompokkan status
    orders.forEach((order) => {
      orderSummary.totalOrders += order.count;
      if (order._id === "Delivered") {
        orderSummary.completed = order.count; // Completed = Delivered
      } else if (
        ["Pending", "Paid", "Processing", "Shipped"].includes(order._id)
      ) {
        orderSummary.processing += order.count; // Processing = Pending, Paid, Processing, Shipped
      } else if (order._id === "Cancelled") {
        orderSummary.canceled = order.count; // Canceled = Cancelled
      }
    });

    const response = {
      success: true,
      data: {
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        gender: customer.gender,
        address: customer.addresses.length > 0 ? customer.addresses[0] : null,
        orderSummary,
      },
    };
    res.status(200).json(response);
  } catch (err) {
    console.error("Error fetching customer summary:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil detail customer",
      error: err.message,
    });
  }
});

// Get Transaction History Berdasarkan ID Customer (Hanya Admin)
router.get("/customers/:id/orders", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak. Hanya admin yang dapat mengakses data ini.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "ID customer tidak valid",
      });
    }

    // Cari customer untuk memastikan ada
    const customer = await User.findById(id).lean();
    if (!customer || customer.role !== "customer") {
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    // Ambil semua order untuk user ini dengan populate data user dan product
    const orders = await Order.find({ user: id })
      .populate("user", "name phoneNumber") // Populate nama dan nomor telepon user
      .populate("items.product", "name images") // Populate nama dan gambar produk
      .lean();

    res.status(200).json({
      success: true,
      data: orders,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({
      success: false,
      message: "Gagal mengambil riwayat transaksi",
      error: err.message,
    });
  }
});

module.exports = router;

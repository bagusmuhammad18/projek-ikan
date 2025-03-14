const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Order = require("../models/Order");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../utils/nodemailer");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

// Middleware Rate Limiting untuk mencegah brute-force attack
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 100, // Maksimal 100 request dalam 15 menit
  message: { message: "Terlalu banyak percobaan, coba lagi nanti." },
});

// Konfigurasi Multer untuk menyimpan file di memory dengan filter gambar
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Hanya file gambar yang diizinkan (jpeg, png, gif, webp, bmp)"),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Batas ukuran file 5MB sebelum kompresi
});

// Middleware untuk menangani error Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Middleware untuk sanitasi query MongoDB (mencegah NoSQL Injection)
router.use(mongoSanitize());

// Helper untuk kompresi gambar
async function compressImage(fileBuffer) {
  try {
    let quality = 80;
    let compressedBuffer = fileBuffer;
    let fileSize = fileBuffer.length;

    while (fileSize > 1048576 && quality > 10) {
      // Batas 1MB
      compressedBuffer = await sharp(fileBuffer).jpeg({ quality }).toBuffer();
      fileSize = compressedBuffer.length;
      quality -= 10;
    }

    if (fileSize > 1048576) {
      throw new Error(
        "Gambar tidak bisa dikompresi di bawah 1MB dengan kualitas yang wajar"
      );
    }

    return compressedBuffer;
  } catch (err) {
    throw new Error("Gagal mengompresi gambar: " + err.message);
  }
}

// Helper untuk upload gambar ke Uploadcare
async function uploadToUploadcare(fileBuffer, fileName) {
  const compressedBuffer = await compressImage(fileBuffer);
  const formData = new FormData();
  formData.append("UPLOADCARE_PUB_KEY", process.env.UPLOADCARE_PUBLIC_KEY);
  formData.append("UPLOADCARE_STORE", "auto");
  formData.append("file", compressedBuffer, fileName);

  const response = await axios.post(
    "https://upload.uploadcare.com/base/",
    formData,
    {
      headers: formData.getHeaders(),
    }
  );

  return response.data.file;
}

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
      .isLength({ min: 8 })
      .withMessage("Password minimal 8 karakter")
      .matches(/[A-Z]/)
      .withMessage("Password harus mengandung minimal 1 huruf kapital")
      .matches(/[a-z]/)
      .withMessage("Password harus mengandung minimal 1 huruf kecil")
      .matches(/[0-9]/)
      .withMessage("Password harus mengandung minimal 1 angka")
      .matches(/[!@#$%^&*(),.?":{}|<>]/)
      .withMessage("Password harus mengandung minimal 1 simbol khusus")
      .not()
      .matches(/\s/)
      .withMessage("Password tidak boleh mengandung spasi"),
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
      console.log("Login attempt:", { email, password });

      const user = await User.findOne({ email }).select(
        "name email phoneNumber role password"
      );
      console.log("User found:", user);

      if (!user) {
        return res.status(401).json({ message: "Email atau password salah" });
      }

      const isMatch = await user.comparePassword(password);
      console.log("Password match:", isMatch);

      if (!isMatch) {
        return res.status(401).json({ message: "Email atau password salah" });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
        },
        token,
      });
    } catch (err) {
      console.error("Login error:", err);
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
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Akses ditolak. Hanya admin yang dapat menghapus pengguna.",
      });
    }

    const { id } = req.params;

    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        message: "Pengguna tidak ditemukan",
      });
    }

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
  try {
    const user = await User.findById(req.user.id)
      .select("name email phoneNumber role addresses gender avatar")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal mengambil profil",
      error: err.message,
    });
  }
});

// Upload Avatar
router.post(
  "/profile/avatar",
  auth,
  upload.single("avatar"),
  handleMulterError,
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "Tidak ada file yang diupload" });
      }

      const user = await User.findById(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User tidak ditemukan" });
      }

      const fileId = await uploadToUploadcare(
        req.file.buffer,
        req.file.originalname
      );
      const avatarUrl = `https://ucarecdn.com/${fileId}/`;

      user.avatar = avatarUrl;
      await user.save();

      res.json({
        success: true,
        avatar: user.avatar,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: "Gagal upload avatar",
        error: err.message,
      });
    }
  }
);

// Update Profil User (Admin atau User Sendiri)
router.put("/profile/:id?", auth, async (req, res) => {
  try {
    const targetId = req.params.id || req.user.id;

    if (req.params.id && !mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({
        success: false,
        message: "ID user tidak valid",
      });
    }

    if (req.user.role !== "admin" && req.user.id !== targetId) {
      return res.status(403).json({
        success: false,
        message:
          "Akses ditolak. Anda tidak memiliki izin untuk mengedit profil ini.",
      });
    }

    const updates = { ...req.body };

    const validGenders = ["Laki-laki", "Perempuan", "Lainnya"];
    if (updates.gender && !validGenders.includes(updates.gender)) {
      return res.status(400).json({
        success: false,
        message: `Gender harus salah satu dari: ${validGenders.join(", ")}`,
      });
    }

    if (updates.password) {
      const user = await User.findById(targetId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }
      user.password = updates.password;
      await user.save();
      delete updates.password;
    }

    if (updates.addresses && Array.isArray(updates.addresses)) {
      for (const addr of updates.addresses) {
        if (!addr.streetAddress || !addr.recipientName || !addr.phoneNumber) {
          return res.status(400).json({
            success: false,
            message: "Semua field wajib di addresses harus diisi",
          });
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(targetId, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    res.json(updatedUser);
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({
      success: false,
      message: "Gagal update profil",
      error: err.message,
    });
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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const allowedSortFields = ["name", "createdAt"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

    const totalCustomers = await User.countDocuments({ role: "customer" });

    const query = User.find({ role: "customer" })
      .select("name email phoneNumber createdAt _id avatar")
      .skip(skip)
      .limit(limit)
      .sort({ [sortField]: sortOrder });

    if (sortField === "name") {
      query.collation({ locale: "en", strength: 2 });
    }

    const customers = await query.lean();

    const formattedCustomers = customers.map((customer) => ({
      _id: customer._id,
      name: customer.name,
      email: customer.email,
      phoneNumber: customer.phoneNumber,
      avatar: customer.avatar,
      registrationDate: customer.createdAt,
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

    const customer = await User.findById(id)
      .select("name email phoneNumber gender addresses role avatar")
      .lean();

    if (!customer || customer.role !== "customer") {
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    const orders = await Order.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const orderSummary = {
      totalOrders: 0,
      completed: 0,
      processing: 0,
      canceled: 0,
    };

    orders.forEach((order) => {
      orderSummary.totalOrders += order.count;
      if (order._id === "Delivered") orderSummary.completed = order.count;
      else if (["Pending", "Paid", "Processing", "Shipped"].includes(order._id))
        orderSummary.processing += order.count;
      else if (order._id === "Cancelled") orderSummary.canceled = order.count;
    });

    const response = {
      success: true,
      data: {
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        gender: customer.gender,
        avatar: customer.avatar,
        address: customer.addresses.length > 0 ? customer.addresses[0] : null,
        orderSummary,
      },
    };
    res.status(200).json(response);
  } catch (err) {
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

    const customer = await User.findById(id).lean();
    if (!customer || customer.role !== "customer") {
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    const orders = await Order.find({ user: id })
      .populate("user", "name phoneNumber avatar")
      .populate("items.product", "name images")
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

// Tambah Alamat Baru
router.post("/address", auth, async (req, res) => {
  try {
    const {
      recipientName,
      phoneNumber,
      streetAddress,
      postalCode,
      province,
      city,
      isPrimary,
    } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const newAddress = {
      recipientName,
      phoneNumber,
      streetAddress,
      postalCode,
      province,
      city,
      isPrimary,
    };

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({
      success: true,
      data: newAddress,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal menambah alamat",
      error: err.message,
    });
  }
});

// Update Alamat
router.put("/address/:addressId", auth, async (req, res) => {
  try {
    const { addressId } = req.params;
    const {
      recipientName,
      phoneNumber,
      streetAddress,
      postalCode,
      province,
      city,
      isPrimary,
    } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const address = user.addresses.id(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Alamat tidak ditemukan",
      });
    }

    address.recipientName = recipientName;
    address.phoneNumber = phoneNumber;
    address.streetAddress = streetAddress;
    address.postalCode = postalCode;
    address.province = province;
    address.city = city;
    address.isPrimary = isPrimary;

    await user.save();

    res.status(200).json({
      success: true,
      data: address,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Gagal memperbarui alamat",
      error: err.message,
    });
  }
});

// Hapus Alamat
router.delete("/address/:addressId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    user.addresses = user.addresses.filter(
      (address) => address._id.toString() !== req.params.addressId
    );

    await user.save();

    res.status(200).json({ message: "Alamat berhasil dihapus" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Gagal menghapus alamat", error: err.message });
  }
});

module.exports = router;

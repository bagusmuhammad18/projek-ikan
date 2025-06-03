// PROJEK-IKAN/models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const addressSchema = new mongoose.Schema({
  recipientName: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true, trim: true },
  streetAddress: { type: String, required: true, trim: true },
  postalCode: { type: String, required: true, trim: true },
  province: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true },
  isPrimary: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema( // Tambahkan opsi timestamps di sini jika belum ada
  {
    name: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    gender: {
      type: String,
      enum: ["Laki-laki", "Perempuan", "Lainnya"],
      default: "Lainnya",
    },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    avatar: { type: String, default: null },
    // createdAt akan otomatis ditambahkan oleh timestamps: true
    orders: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: [] },
    ],
    addresses: { type: [addressSchema], default: [] },

    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    verificationTokenExpire: Date,

    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // ==== TAMBAHKAN FIELD INI ====
    lastPasswordChangeAt: {
      type: Date,
    },
  },
  { timestamps: true } // Ini akan otomatis menambah createdAt dan updatedAt
);

// Set lastPasswordChangeAt ke createdAt saat dokumen baru dibuat
// Hook ini akan berjalan sebelum hook hash password jika didefinisikan lebih dulu,
// atau setelah jika didefinisikan setelah. Urutan tidak terlalu kritikal di sini.
userSchema.pre("save", function (next) {
  if (this.isNew && !this.lastPasswordChangeAt) {
    // createdAt akan diisi oleh Mongoose karena timestamps: true
    // kita bisa mengandalkannya atau menggunakan Date.now() sebagai fallback
    this.lastPasswordChangeAt = this.createdAt || new Date();
  }
  next();
});

// Hash password sebelum menyimpan user (hook ini sudah ada, pastikan tetap ada)
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method untuk membandingkan password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) {
    console.error(
      "Kesalahan internal: Mencoba membandingkan password, tetapi field password tidak dipilih dari database."
    );
    throw new Error("Terjadi kesalahan saat memverifikasi password.");
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method untuk generate token reset password
userSchema.methods.generateResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 3600000; // 1 jam
  return resetToken;
};

// Method untuk generate token verifikasi email
userSchema.methods.generateVerificationToken = function () {
  const verificationToken = crypto.randomBytes(20).toString("hex");
  this.verificationToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");
  this.verificationTokenExpire = Date.now() + 24 * 3600000; // 24 jam
  return verificationToken;
};

const User = mongoose.model("User", userSchema);
module.exports = User;

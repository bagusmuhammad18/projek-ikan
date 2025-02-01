const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

// Skema alamat sesuai permintaan
const addressSchema = new mongoose.Schema({
  recipientName: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
  streetAddress: {
    // Nama jalan, gedung, no. rumah
    type: String,
    required: true,
    trim: true,
  },
  postalCode: {
    type: String,
    required: true,
    trim: true,
  },
  province: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    required: true,
    trim: true,
  },
  isPrimary: {
    // Checkbox "Atur sebagai alamat utama"
    type: Boolean,
    default: false,
  },
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    trim: true,
  },
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
    minlength: 6,
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  // Order (opsional): daftar pesanan yang dimiliki user
  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: [],
    },
  ],
  // Addresses: array of alamat sesuai skema addressSchema
  addresses: {
    type: [addressSchema],
    default: [],
  },
});

// Middleware: Hash password sebelum menyimpan user
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Method untuk membandingkan password
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Method untuk generate token reset password
userSchema.methods.generateResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");

  // Hash token sebelum menyimpannya ke database
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  // Token berlaku selama 1 jam
  this.resetPasswordExpire = Date.now() + 3600000;

  return resetToken; // Kirim token asli ke email
};

const User = mongoose.model("User", userSchema);
module.exports = User;

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

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phoneNumber: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: { type: String, required: true, minlength: 6 },
  gender: {
    type: String,
    enum: ["Laki-laki", "Perempuan", "Lainnya"],
    default: "Lainnya",
  },
  role: { type: String, enum: ["customer", "admin"], default: "customer" },
  avatar: { type: String, default: null }, // Tambahkan field avatar
  createdAt: { type: Date, default: Date.now },
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order", default: [] }],
  addresses: { type: [addressSchema], default: [] },
});

// Hash password sebelum menyimpan user
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
    throw new Error("Password not set for this user");
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

const User = mongoose.model("User", userSchema);
module.exports = User;

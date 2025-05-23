// userRoutes.js
// ... (impor lain tetap sama)
const winston = require("winston");
const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Order = require("../models/Order");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../utils/nodemailer"); // Pastikan nodemailer sudah ada dan dikonfigurasi
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

// Logger configuration
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/user-auth.log" }), // Ganti nama file log jika perlu
    new winston.transports.Console(),
  ],
});

// ... (middleware lain tetap sama: limiter, storage, fileFilter, handleMulterError, mongoSanitize, compressImage, uploadToUploadcare)
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

// Middleware Rate Limiting untuk mencegah brute-force attack
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Maksimal 5 percobaan GAGAL per akun dalam 15 menit (atau per IP untuk register)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req, res) => {
    // Gunakan email untuk login/forgot-password, IP untuk register/verify
    return req.body.email || req.ip;
  },
  handler: (req, res, next, options) => {
    logger.warn(
      `Rate limit exceeded for ${req.ip} or ${req.body.email} on ${req.path}`
    );
    res
      .status(options.statusCode)
      .json({ message: "Terlalu banyak percobaan, coba lagi nanti." });
  },
  skipSuccessfulRequests: true,
});

// Registrasi User (MODIFIED)
router.post(
  "/register",
  limiter, // Terapkan rate limiter
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

      let existingUser = await User.findOne({ email });
      if (existingUser) {
        // Jika user sudah ada dan belum terverifikasi, kirim ulang email verifikasi
        if (!existingUser.isVerified) {
          const verificationToken = existingUser.generateVerificationToken();
          await existingUser.save();

          const verificationUrl = `${process.env.BACKEND_URL}/api/users/verify-email/${verificationToken}`;
          const appName = "Marketplace Siphiko";

          const mailOptions = {
            from: `"${appName}" <noreply.marketplaceiwak@gmail.com>`,
            to: existingUser.email,
            subject: `Verifikasi Akun ${appName} Anda`,
            html: `
              <p>Halo ${existingUser.name},</p>
              <p>Email ini sudah terdaftar namun belum diverifikasi. Silakan klik link di bawah ini untuk memverifikasi email Anda:</p>
              <a href="${verificationUrl}">Verifikasi Email Saya</a>
              <p>Link ini akan kedaluwarsa dalam 24 jam.</p>
              <p>Jika Anda tidak mendaftar, abaikan email ini.</p>
            `,
          };
          await transporter.sendMail(mailOptions);
          logger.info(
            `Resent verification email to existing unverified user: ${email}`
          );
          return res.status(200).json({
            // Beri status 200 agar frontend bisa menangani pesan ini
            message:
              "Email sudah terdaftar namun belum diverifikasi. Kami telah mengirim ulang email verifikasi. Silakan periksa email Anda.",
          });
        }
        return res
          .status(400)
          .json({ message: "Email sudah terdaftar dan terverifikasi." });
      }

      const existingPhone = await User.findOne({ phoneNumber });
      if (existingPhone) {
        return res
          .status(400)
          .json({ message: "Nomor telepon sudah terdaftar" });
      }

      const user = new User({ name, phoneNumber, email, password });
      const verificationToken = user.generateVerificationToken(); // Generate token
      await user.save(); // Simpan user dengan isVerified: false dan token

      // Kirim email verifikasi
      const verificationUrl = `${process.env.BACKEND_URL}/api/users/verify-email/${verificationToken}`;
      const appName = "Marketplace Siphiko";

      const mailOptions = {
        from: `"${appName}" <noreply.marketplaceiwak@gmail.com>`,
        to: user.email,
        subject: `Verifikasi Akun ${appName} Anda`,
        html: `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verifikasi Email</title>
            <style>
              body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
              .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee; }
              .content { padding: 20px 0; text-align: left; line-height: 1.6; color: #333333; }
              .content h1 { color: #003D47; font-size: 24px; margin-bottom: 15px; }
              .button-container { text-align: center; margin: 20px 0; }
              .button {
                background-color: #003D47;
                color: #ffffff !important;
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                display: inline-block;
              }
              .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #777777; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="content">
                <h1>Selamat Datang di ${appName}!</h1>
                <p>Halo ${user.name},</p>
                <p>Terima kasih telah mendaftar. Untuk menyelesaikan proses pendaftaran, silakan verifikasi alamat email Anda dengan mengklik tombol di bawah ini:</p>
                <div class="button-container">
                  <a href="${verificationUrl}" target="_blank" class="button">Verifikasi Email Saya</a>
                </div>
                <p>Link verifikasi ini akan kedaluwarsa dalam 24 jam.</p>
                <p>Jika Anda tidak merasa mendaftar, Anda bisa mengabaikan email ini.</p>
                <p>Jika tombol tidak berfungsi, salin dan tempel URL berikut ke browser Anda:</p>
                <p><a href="${verificationUrl}" target="_blank" style="color: #003D47; text-decoration: underline;">${verificationUrl}</a></p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} ${appName}. Semua hak dilindungi.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      };

      await transporter.sendMail(mailOptions);
      logger.info(`Verification email sent to ${user.email}`);

      res.status(201).json({
        message:
          "Registrasi berhasil. Silakan periksa email Anda untuk verifikasi akun.",
      });
    } catch (err) {
      logger.error("Registration failed", {
        error: err.message,
        stack: err.stack,
      });
      res.status(500).json({ message: "Registrasi gagal", error: err.message });
    }
  }
);

// Verifikasi Email (NEW ROUTE)
router.get("/verify-email/:token", async (req, res) => {
  const { token: rawTokenFromParams } = req.params;

  // Ambil logger dari app jika sudah di-set, atau default ke console
  // Ini berguna jika Anda menggunakan app.set('logger', winstonInstance); di file server utama Anda
  const appLogger = req.app.get("logger") || logger;

  appLogger.info(
    `========= VERIFY EMAIL ATTEMPT - Raw Token Received: ${rawTokenFromParams} =========`
  );

  if (!process.env.CLIENT_URL) {
    appLogger.error(
      "CRITICAL: process.env.CLIENT_URL is not defined. Cannot perform redirects."
    );
    // Respon darurat jika CLIENT_URL tidak ada, meskipun idealnya aplikasi tidak boleh start tanpa ini.
    return res
      .status(500)
      .send("Konfigurasi server error: URL Klien tidak diatur.");
  }

  if (
    !rawTokenFromParams ||
    typeof rawTokenFromParams !== "string" ||
    rawTokenFromParams.trim() === ""
  ) {
    appLogger.warn(
      "No token or invalid token format provided in verification link."
    );
    return res.redirect(
      `${process.env.CLIENT_URL}/auth-message?status=invalid_link&message=Link verifikasi tidak valid atau tidak lengkap.`
    );
  }

  let hashedToken;
  try {
    hashedToken = crypto
      .createHash("sha256")
      .update(rawTokenFromParams)
      .digest("hex");
  } catch (hashError) {
    appLogger.error("Error hashing token:", hashError);
    return res.redirect(
      `${process.env.CLIENT_URL}/auth-message?status=error&message=Terjadi kesalahan internal saat memproses token.`
    );
  }

  appLogger.info(`Hashed token for DB query: ${hashedToken}`);

  try {
    // Cari user berdasarkan token yang sudah di-hash.
    // Kita tidak mengecek expiry di sini dulu, agar bisa memberi pesan yang lebih spesifik.
    const userWithToken = await User.findOne({
      verificationToken: hashedToken,
    });

    if (!userWithToken) {
      appLogger.warn(
        `No user found with hashed token: ${hashedToken}. This token may be incorrect, already used and cleared, or never existed.`
      );
      return res.redirect(
        `${process.env.CLIENT_URL}/auth-message?status=invalid_token&message=Token verifikasi tidak ditemukan, salah, atau sudah digunakan.`
      );
    }

    appLogger.info(
      `User found: ${userWithToken.email}, Current isVerified status: ${userWithToken.isVerified}, Token Expires At: ${userWithToken.verificationTokenExpire}`
    );

    // KASUS 1: User SUDAH terverifikasi
    // Ini bisa terjadi jika user mengklik link lagi setelah berhasil verifikasi,
    // atau jika user diverifikasi melalui cara lain/migrasi.
    if (userWithToken.isVerified) {
      appLogger.info(`User ${userWithToken.email} is ALREADY verified.`);
      // Idealnya, token seharusnya sudah dihapus saat verifikasi pertama.
      // Kita bersihkan lagi di sini jika karena suatu hal tokennya masih ada.
      if (userWithToken.verificationToken) {
        userWithToken.verificationToken = undefined;
        userWithToken.verificationTokenExpire = undefined;
        try {
          await userWithToken.save();
          appLogger.info(
            `Cleaned up (redundant) verification token for already verified user ${userWithToken.email}.`
          );
        } catch (saveErr) {
          appLogger.error(
            `Error saving user after cleaning token for already verified user ${userWithToken.email}:`,
            saveErr
          );
          // Lanjutkan redirect meskipun save gagal, karena user sudah verified.
        }
      }
      return res.redirect(
        `${
          process.env.CLIENT_URL
        }/login?verified_status=already&message=Email Anda (${encodeURIComponent(
          userWithToken.email
        )}) sudah terverifikasi. Silakan login.`
      );
    }

    // KASUS 2: User BELUM terverifikasi, cek apakah token sudah kedaluwarsa
    if (
      !userWithToken.verificationTokenExpire ||
      userWithToken.verificationTokenExpire < Date.now()
    ) {
      appLogger.warn(
        `Verification token EXPIRED for user ${userWithToken.email}. Expired at: ${userWithToken.verificationTokenExpire}. Raw token used: ${rawTokenFromParams}`
      );
      // Jangan hapus token yang kedaluwarsa di sini, biarkan proses resend yang membuat token baru.
      return res.redirect(
        `${
          process.env.CLIENT_URL
        }/auth-message?status=expired_token&email=${encodeURIComponent(
          userWithToken.email
        )}&message=Token verifikasi sudah kedaluwarsa. Silakan minta token baru jika perlu.`
      );
    }

    // KASUS 3: User BELUM terverifikasi, dan token VALID -> Lakukan verifikasi
    appLogger.info(
      `Token is VALID for user ${userWithToken.email}. Proceeding with verification.`
    );
    userWithToken.isVerified = true;
    userWithToken.verificationToken = undefined; // Hapus token setelah digunakan
    userWithToken.verificationTokenExpire = undefined; // Hapus expiry setelah digunakan

    try {
      await userWithToken.save();
      appLogger.info(
        `Email successfully verified and user record updated for: ${userWithToken.email}`
      );
      return res.redirect(
        `${
          process.env.CLIENT_URL
        }/login?verified_status=success&message=Email Anda (${encodeURIComponent(
          userWithToken.email
        )}) berhasil diverifikasi. Silakan login.`
      );
    } catch (saveErr) {
      appLogger.error(
        `Error saving user after successful verification for ${userWithToken.email}:`,
        saveErr
      );
      // Ini adalah error server yang kritis. User seharusnya sudah verified di memori, tapi DB gagal save.
      // Mungkin perlu mekanisme retry atau notifikasi admin.
      // Untuk user, tampilkan pesan error umum.
      return res.redirect(
        `${process.env.CLIENT_URL}/auth-message?status=error&message=Verifikasi berhasil, tetapi terjadi masalah saat menyimpan data. Silakan coba login atau hubungi dukungan.`
      );
    }
  } catch (err) {
    appLogger.error("General error during email verification process:", {
      rawToken: rawTokenFromParams,
      errorMessage: err.message,
      stack: err.stack,
    });
    return res.redirect(
      `${process.env.CLIENT_URL}/auth-message?status=error&message=Terjadi kesalahan tidak terduga saat proses verifikasi email. Silakan coba lagi nanti.`
    );
  } finally {
    appLogger.info(
      `========= END VERIFY EMAIL ATTEMPT - Raw Token: ${rawTokenFromParams} =========`
    );
  }
});

// Login User (MODIFIED)
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
      const user = await User.findOne({ email }).select("+password"); // Select password for comparison

      if (!user) {
        logger.warn(`Login failed: User not found for email ${email}`);
        return res.status(401).json({ message: "Email atau password salah" });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        logger.warn(`Login failed: Incorrect password for email ${email}`);
        return res.status(401).json({ message: "Email atau password salah" });
      }

      // CHECK JIKA USER BELUM VERIFIKASI
      if (!user.isVerified) {
        logger.warn(`Login failed: Email not verified for ${email}`);
        // Pertimbangkan untuk menawarkan pengiriman ulang email verifikasi di sini
        return res.status(403).json({
          message:
            "Akun Anda belum diverifikasi. Silakan periksa email Anda untuk link verifikasi.",
          action: "resend_verification_required", // Flag untuk frontend
        });
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );

      logger.info(`User logged in successfully: ${email}`);
      res.json({
        user: {
          // Kirim data user yang relevan, jangan kirim password
          _id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          avatar: user.avatar,
          isVerified: user.isVerified,
        },
        token,
      });
    } catch (err) {
      logger.error("Login error", { error: err.message, stack: err.stack });
      res.status(500).json({ message: "Login gagal", error: err.message });
    }
  }
);

// (OPSIONAL) Resend Verification Email
router.post(
  "/resend-verification-email",
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

      if (!user) {
        // Untuk keamanan, jangan beri tahu apakah email ada atau tidak.
        logger.warn(
          `Resend verification attempt for non-existent email: ${email}`
        );
        return res.json({
          message:
            "Jika email terdaftar dan belum diverifikasi, email verifikasi akan dikirim.",
        });
      }

      if (user.isVerified) {
        logger.info(
          `Resend verification attempt for already verified email: ${email}`
        );
        return res
          .status(400)
          .json({ message: "Email ini sudah diverifikasi." });
      }

      // Generate token baru dan kirim email
      const verificationToken = user.generateVerificationToken();
      await user.save();

      const verificationUrl = `${process.env.BACKEND_URL}/api/users/verify-email/${verificationToken}`;
      const appName = "Marketplace Siphiko";

      const mailOptions = {
        from: `"${appName}" <noreply.marketplaceiwak@gmail.com>`,
        to: user.email,
        subject: `Verifikasi Ulang Akun ${appName} Anda`,
        html: `
        <p>Halo ${user.name},</p>
        <p>Anda meminta untuk mengirim ulang email verifikasi. Silakan klik link di bawah ini:</p>
        <a href="${verificationUrl}">Verifikasi Email Saya</a>
        <p>Link ini akan kedaluwarsa dalam 24 jam.</p>
      `,
      };
      await transporter.sendMail(mailOptions);
      logger.info(`Resent verification email to ${user.email}`);

      res.json({
        message:
          "Email verifikasi telah dikirim ulang. Silakan periksa inbox Anda.",
      });
    } catch (err) {
      logger.error("Resend verification email failed", {
        email: req.body.email,
        error: err.message,
        stack: err.stack,
      });
      res.status(500).json({
        message: "Gagal mengirim ulang email verifikasi.",
        error: err.message,
      });
    }
  }
);

// ... (Rute lain: forgot-password, reset-password, profile, dll. tetap sama)
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
      logger.warn("Validasi email gagal", {
        errors: errors.array(),
        email: req.body.email,
      });
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { email } = req.body;
      logger.info("Permintaan reset password diterima", { email });

      const user = await User.findOne({ email });
      if (!user) {
        logger.warn("User tidak ditemukan untuk reset password", { email });
        return res.json({
          message:
            "Jika email terdaftar, instruksi reset password akan dikirim. Periksa email dan spam anda",
        });
      }

      // Tambahan: Cek apakah user sudah terverifikasi sebelum reset password
      if (!user.isVerified) {
        logger.warn(`Forgot password attempt for unverified user: ${email}`);
        return res.status(403).json({
          message:
            "Akun Anda belum diverifikasi. Silakan verifikasi email Anda terlebih dahulu.",
        });
      }

      const resetToken = user.generateResetPasswordToken();
      await user.save();
      logger.info("Token reset password dibuat", {
        email,
        user: user.name,
        resetToken, // Sebaiknya jangan log token asli, cukup konfirmasi pembuatan
      });

      const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
      const appName = "Marketplace Siphiko";
      const supportEmail = "dukungan@marketplaceiwak.com";

      const mailOptions = {
        from: `"${appName}" <noreply.marketplaceiwak@gmail.com>`,
        to: user.email,
        subject: `Reset Password Akun ${appName} Anda`,
        html: `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Password</title>
            <style>
              body { margin: 0; padding: 0; background-color: #f4f4f4; font-family: Arial, sans-serif; }
              .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
              .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee; }
              .header img { max-width: 150px; }
              .content { padding: 20px 0; text-align: left; line-height: 1.6; color: #333333; }
              .content h1 { color: #003D47; font-size: 24px; margin-bottom: 15px; }
              .content p { margin-bottom: 15px; }
              .button-container { text-align: center; margin: 20px 0; }
              .button {
                background-color: #003D47; 
                color: #ffffff !important; 
                padding: 12px 25px;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                display: inline-block;
              }
              .footer { text-align: center; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 12px; color: #777777; }
              .footer p { margin-bottom: 5px; }
            </style>
          </head>
          <body>
            <div class="container">
              
              <div class="content">
                <h1>Permintaan Reset Password</h1>
                <p>Halo ${user.name || "Pengguna"},</p>
                <p>Kami menerima permintaan untuk mengatur ulang kata sandi akun ${appName} Anda. Klik tombol di bawah ini untuk melanjutkan:</p>
                <div class="button-container">
                  <a href="${resetUrl}" target="_blank" class="button">Reset Password Saya</a>
                </div>
                <p>Link ini akan kedaluwarsa dalam 1 jam. Jika Anda tidak meminta reset password, Anda bisa mengabaikan email ini dengan aman.</p>
                <p>Jika tombol di atas tidak berfungsi, salin dan tempel URL berikut ke browser Anda:</p>
                <p><a href="${resetUrl}" target="_blank" style="color: #003D47; text-decoration: underline;">${resetUrl}</a></p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} ${appName}. Semua hak dilindungi.</p>
                <p>Jika Anda memiliki pertanyaan, hubungi kami di WhatsApp: 085713561686.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Halo ${user.name || "Pengguna"},
          Kami menerima permintaan untuk mengatur ulang kata sandi akun ${appName} Anda.
          Silakan kunjungi link berikut untuk mengatur ulang kata sandi Anda:
          ${resetUrl}
          Link ini akan kedaluwarsa dalam 1 jam. Jika Anda tidak meminta reset password, Anda bisa mengabaikan email ini dengan aman.
          Jika Anda memiliki pertanyaan, hubungi kami di ${supportEmail}.
          Terima kasih,
          Tim ${appName}
        `,
      };

      await transporter.sendMail(mailOptions);
      logger.info("Email reset password berhasil dikirim", { email, resetUrl });
      res.json({
        message:
          "Jika email terdaftar dan terverifikasi, instruksi reset password akan dikirim. Periksa email dan spam anda.",
      });
    } catch (err) {
      logger.error("Gagal mengirim email reset password", {
        email: req.body.email,
        error: err.message,
        stack: err.stack,
      });
      res.status(500).json({
        message: "Gagal mengirim email. Silakan coba lagi nanti.",
        error: err.message,
      });
    }
  }
);

// Reset Password
router.post(
  "/reset-password/:token",
  [
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

      if (!user) {
        return res
          .status(400)
          .json({ message: "Token invalid atau kedaluwarsa" });
      }

      // Pastikan user sudah terverifikasi
      if (!user.isVerified) {
        return res.status(403).json({
          message:
            "Akun Anda belum diverifikasi. Tidak dapat mereset password.",
        });
      }

      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;

      await user.save();
      logger.info(`Password berhasil direset untuk user: ${user.email}`);
      res.json({
        message:
          "Password berhasil direset. Silakan login dengan password baru Anda.",
      });
    } catch (err) {
      logger.error("Gagal reset password", {
        token, // Jangan log token asli di production
        error: err.message,
        stack: err.stack,
      });
      res.status(500).json({
        message: "Gagal reset password internal. Silakan coba lagi nanti.",
        error: err.message,
      });
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
      .select("name email phoneNumber role addresses gender avatar isVerified") // Tambahkan isVerified
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

    // Hapus field yang tidak boleh diubah langsung oleh user biasa / admin melalui endpoint ini
    delete updates.email; // Email tidak boleh diubah sembarangan, perlu proses verifikasi ulang
    delete updates.role; // Role hanya boleh diubah oleh admin melalui endpoint khusus jika ada
    delete updates.isVerified; // isVerified diatur oleh sistem
    delete updates.verificationToken;
    delete updates.verificationTokenExpire;
    delete updates.resetPasswordToken;
    delete updates.resetPasswordExpire;

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
      user.password = updates.password; // Hook pre-save akan hash password
      await user.save(); // Simpan untuk trigger hook
      delete updates.password; // Hapus dari object updates agar tidak di-set lagi di bawah
    }

    if (updates.addresses && Array.isArray(updates.addresses)) {
      for (const addr of updates.addresses) {
        if (
          !addr.recipientName ||
          !addr.phoneNumber ||
          !addr.streetAddress ||
          !addr.postalCode ||
          !addr.province ||
          !addr.city
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Semua field wajib di addresses (recipientName, phoneNumber, streetAddress, postalCode, province, city) harus diisi",
          });
        }
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetId,
      { $set: updates },
      {
        // Gunakan $set
        new: true,
        runValidators: true,
      }
    ).select("-password"); // Jangan kirim password kembali

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    res.json({
      success: true,
      data: updatedUser,
    });
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

    const allowedSortFields = ["name", "createdAt", "email"]; // Tambahkan email
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

    const totalCustomers = await User.countDocuments({ role: "customer" });

    const query = User.find({ role: "customer" })
      .select("name email phoneNumber createdAt _id avatar isVerified") // Tambahkan isVerified
      .skip(skip)
      .limit(limit)
      .sort({ [sortField]: sortOrder });

    if (sortField === "name" || sortField === "email") {
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
      isVerified: customer.isVerified, // Tambahkan
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
      .select(
        "name email phoneNumber gender addresses role avatar isVerified createdAt"
      ) // Tambahkan isVerified, createdAt
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

    const primaryAddress =
      customer.addresses.find((addr) => addr.isPrimary) ||
      customer.addresses[0] ||
      null;

    const response = {
      success: true,
      data: {
        _id: customer._id,
        name: customer.name,
        email: customer.email,
        phoneNumber: customer.phoneNumber,
        gender: customer.gender,
        avatar: customer.avatar,
        isVerified: customer.isVerified,
        registrationDate: customer.createdAt,
        address: primaryAddress
          ? {
              recipientName: primaryAddress.recipientName,
              phoneNumber: primaryAddress.phoneNumber,
              streetAddress: primaryAddress.streetAddress,
              postalCode: primaryAddress.postalCode,
              province: primaryAddress.province,
              city: primaryAddress.city,
            }
          : null,
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
      .populate("items.product", "name images price") // Tambahkan price jika perlu
      .sort({ createdAt: -1 }) // Urutkan berdasarkan terbaru
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

    if (
      !recipientName ||
      !phoneNumber ||
      !streetAddress ||
      !postalCode ||
      !province ||
      !city
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Semua field alamat wajib diisi." });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Jika isPrimary true, set semua alamat lain menjadi false
    if (isPrimary === true) {
      user.addresses.forEach((addr) => (addr.isPrimary = false));
    } else if (user.addresses.length === 0) {
      // Jika ini alamat pertama dan isPrimary tidak diset true, otomatis jadikan primary
      req.body.isPrimary = true;
    }

    const newAddress = {
      recipientName,
      phoneNumber,
      streetAddress,
      postalCode,
      province,
      city,
      isPrimary: req.body.isPrimary, // Gunakan nilai yang sudah disesuaikan
    };

    user.addresses.push(newAddress);
    await user.save();

    res.status(201).json({
      success: true,
      message: "Alamat berhasil ditambahkan.",
      data: user.addresses, // Kembalikan semua alamat atau alamat baru saja
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

    if (
      !recipientName ||
      !phoneNumber ||
      !streetAddress ||
      !postalCode ||
      !province ||
      !city
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Semua field alamat wajib diisi." });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const addressIndex = user.addresses.findIndex(
      (addr) => addr._id.toString() === addressId
    );
    if (addressIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Alamat tidak ditemukan",
      });
    }

    // Jika isPrimary true, set semua alamat lain menjadi false
    if (isPrimary === true) {
      user.addresses.forEach((addr, index) => {
        if (index !== addressIndex) {
          addr.isPrimary = false;
        }
      });
    } else {
      // Jika user mencoba mengubah alamat primary menjadi non-primary,
      // dan tidak ada alamat primary lain, maka operasi ini tidak valid
      // atau harus ada logika untuk menunjuk alamat lain sebagai primary.
      // Untuk simplisitas, jika hanya ada satu alamat, ia harus primary.
      const primaryAddressesCount = user.addresses.filter(
        (addr) => addr.isPrimary
      ).length;
      if (
        user.addresses[addressIndex].isPrimary &&
        isPrimary === false &&
        primaryAddressesCount <= 1 &&
        user.addresses.length > 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Anda harus memiliki setidaknya satu alamat utama.",
        });
      }
    }

    user.addresses[addressIndex] = {
      ...user.addresses[addressIndex].toObject(), // Spread existing fields, _id will be preserved
      recipientName,
      phoneNumber,
      streetAddress,
      postalCode,
      province,
      city,
      isPrimary,
    };

    await user.save();

    res.status(200).json({
      success: true,
      message: "Alamat berhasil diperbarui.",
      data: user.addresses, // Kembalikan semua alamat atau alamat yang diupdate
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

    const addressToDelete = user.addresses.find(
      (addr) => addr._id.toString() === req.params.addressId
    );
    if (!addressToDelete) {
      return res.status(404).json({ message: "Alamat tidak ditemukan" });
    }

    // Jika alamat yang dihapus adalah primary dan ada alamat lain, jadikan alamat lain primary
    if (addressToDelete.isPrimary && user.addresses.length > 1) {
      const nextPrimaryAddress = user.addresses.find(
        (addr) => addr._id.toString() !== req.params.addressId
      );
      if (nextPrimaryAddress) {
        nextPrimaryAddress.isPrimary = true;
      }
    }

    user.addresses = user.addresses.filter(
      (address) => address._id.toString() !== req.params.addressId
    );

    await user.save();

    res.status(200).json({
      success: true,
      message: "Alamat berhasil dihapus",
      data: user.addresses,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Gagal menghapus alamat", error: err.message });
  }
});

module.exports = router;

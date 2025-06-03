const jwt = require("jsonwebtoken");

const checkAdmin = (req, res, next) => {
  // Middleware 'auth' harus dijalankan sebelum ini dan sudah mengisi req.user
  if (req.user && req.user.role === "admin") {
    next(); // Lanjutkan jika user adalah admin
  } else {
    // Jika req.user tidak ada atau role bukan admin
    res
      .status(403)
      .json({ message: "Akses ditolak. Hanya admin yang diizinkan." });
  }
};

module.exports = checkAdmin;

const jwt = require("jsonwebtoken");

const checkAdmin = (req, res, next) => {
  try {
    // Pastikan token ada dan valid (dari middleware auth sebelumnya)
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Periksa apakah pengguna memiliki peran admin
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can perform this action" });
    }

    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = checkAdmin;

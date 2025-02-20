const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

// Konfigurasi Storage Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "ikan", // Nama folder di Cloudinary
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

// Middleware Upload
const upload = multer({ storage });

module.exports = upload;

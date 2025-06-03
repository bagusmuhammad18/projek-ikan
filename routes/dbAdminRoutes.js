// PROYEK-IKAN/routes/dbAdminRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const dbAdminController = require("../controllers/dbAdminController");

// Impor middleware autentikasi dan otorisasi Anda
// KARENA auth.js dan checkAdmin.js mengekspor fungsi secara langsung (module.exports = namaFungsi),
// kita impor tanpa kurung kurawal.
const authMiddleware = require("../middleware/auth"); // Mengimpor fungsi 'auth' dari auth.js
const checkAdminMiddleware = require("../middleware/checkAdmin"); // Mengimpor fungsi 'checkAdmin' dari checkAdmin.js

// Konfigurasi Multer untuk upload file
const UPLOAD_DIR = path.join(__dirname, "..", "uploads"); // PROYEK-IKAN/uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Gunakan nama file yang aman dan unik
    cb(null, `restore-${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/zip",
      "application/gzip",
      "application/octet-stream",
    ]; // application/octet-stream sering muncul untuk .archive atau .gz
    const allowedExtensions = [".zip", ".gz", ".archive"];

    const fileExtension = path.extname(file.originalname).toLowerCase();

    console.log(
      `File Upload Attempt: name='${file.originalname}', mimetype='${file.mimetype}', extension='${fileExtension}'`
    );

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(fileExtension)
    ) {
      console.log("File type accepted by filter.");
      cb(null, true);
    } else {
      console.log("File type rejected by filter.");
      cb(
        new Error(
          `Format file tidak didukung (${
            file.originalname
          }). Hanya ${allowedExtensions.join(", ")} yang diizinkan.`
        ),
        false
      );
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // Batas ukuran file 100MB (sesuaikan)
  },
}).single("backupFile");

// Rute ini harus dilindungi!
// Gunakan middleware yang sudah diimpor dengan benar
router.get(
  "/backup",
  authMiddleware, // Gunakan nama variabel yang benar
  checkAdminMiddleware, // Gunakan nama variabel yang benar
  dbAdminController.backupDatabase
);

// Middleware untuk upload file harus sebelum controller
router.post(
  "/restore",
  authMiddleware, // Gunakan nama variabel yang benar
  checkAdminMiddleware, // Gunakan nama variabel yang benar
  (req, res, next) => {
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        // A Multer error occurred when uploading.
        return res
          .status(400)
          .json({ message: `Multer error: ${err.message}` });
      } else if (err) {
        // An unknown error occurred when uploading (misal dari fileFilter).
        return res
          .status(400)
          .json({ message: `Upload error: ${err.message}` });
      }
      // Everything went fine with upload.
      next();
    });
  },
  dbAdminController.restoreDatabase
);

module.exports = router;

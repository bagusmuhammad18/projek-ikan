const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const checkAdmin = require("../middleware/checkAdmin");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

// Middleware to parse JSON strings in req.body
const parseJSONFields = (req, res, next) => {
  try {
    const fieldsToParse = [
      "stocks",
      "type",
      "dimensions",
      "existingImages",
      "removedImages",
    ];
    fieldsToParse.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === "string") {
        req.body[field] = JSON.parse(req.body[field]);
      }
    });
    next();
  } catch (err) {
    console.error("Error parsing JSON fields:", err);
    return res.status(400).json({
      message: "Invalid JSON format in one of the request body fields.",
    });
  }
};

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

// Mengubah batas ukuran file menjadi 150 KB
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 150 * 1024 }, // Batas ukuran file 150 KB
});

// Middleware untuk menangani error Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Ukuran file tidak boleh melebihi 150 KB." });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Middleware untuk validasi input
const validateProduct = [
  body("name").notEmpty().withMessage("Name is required"),
  body("description").notEmpty().withMessage("Description is required"),
  body("weight").optional().isNumeric().withMessage("Weight must be a number"),
  body("dimensions.height")
    .optional()
    .isNumeric()
    .withMessage("Height must be a number"),
  body("dimensions.length")
    .optional()
    .isNumeric()
    .withMessage("Length must be a number"),
  body("type.jenis")
    .optional()
    .isArray()
    .withMessage("Type jenis must be an array"),
  body("type.size")
    .optional()
    .isArray()
    .withMessage("Type size must be an array"),
  body("stocks")
    .optional()
    .isArray()
    .withMessage("Stocks must be an array")
    .custom((stocks) => {
      if (!stocks) return true;
      for (const stock of stocks) {
        if (!stock.jenis || typeof stock.jenis !== "string") {
          throw new Error("Each stock entry must have a valid jenis");
        }
        if (!stock.size || typeof stock.size !== "string") {
          throw new Error("Each stock entry must have a valid size");
        }
        if (typeof stock.stock !== "number" || stock.stock < 0) {
          throw new Error(
            "Each stock entry must have a valid stock (number >= 0)"
          );
        }
        if (typeof stock.price !== "number" || stock.price < 0) {
          throw new Error(
            "Each stock entry must have a valid price (number >= 0)"
          );
        }
        if (
          stock.discount !== undefined &&
          (typeof stock.discount !== "number" ||
            stock.discount < 0 ||
            stock.discount > 100)
        ) {
          throw new Error(
            "Each stock entry must have a valid discount (number between 0 and 100)"
          );
        }
        if (!stock.satuan || typeof stock.satuan !== "string") {
          throw new Error("Each stock entry must have a valid satuan (unit)");
        }
        if (!["kg", "ekor"].includes(stock.satuan)) {
          throw new Error("Satuan must be either 'kg' or 'ekor'");
        }
      }
      return true;
    }),
  body("isPublished")
    .optional()
    .isBoolean()
    .withMessage("isPublished must be a boolean"),
];

// Helper untuk optimasi gambar
async function optimizeImage(fileBuffer) {
  try {
    const optimizedBuffer = await sharp(fileBuffer)
      .webp({ quality: 75 })
      .toBuffer();
    return optimizedBuffer.length < fileBuffer.length
      ? optimizedBuffer
      : fileBuffer;
  } catch (err) {
    console.error(
      "Gagal mengoptimasi gambar, menggunakan file asli:",
      err.message
    );
    return fileBuffer;
  }
}

// Helper untuk upload gambar ke Uploadcare
async function uploadToUploadcare(fileBuffer, fileName) {
  const optimizedBuffer = await optimizeImage(fileBuffer);
  const formData = new FormData();
  formData.append("UPLOADCARE_PUB_KEY", process.env.UPLOADCARE_PUBLIC_KEY);
  formData.append("UPLOADCARE_STORE", "auto");
  formData.append("file", optimizedBuffer, fileName);

  const response = await axios.post(
    "https://upload.uploadcare.com/base/",
    formData,
    { headers: formData.getHeaders() }
  );
  return response.data.file;
}

// --- INI ADALAH SATU-SATUNYA BLOK DEFINISI ROUTE YANG DIPERLUKAN ---

// Get semua produk dengan filter, sorting, dan pagination (tanpa admin)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      jenis,
      size,
    } = req.query;
    const query = { isPublished: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "type.jenis": { $regex: search, $options: "i" } },
      ];
    }
    if (jenis) query["type.jenis"] = jenis;
    if (size) query["type.size"] = size;

    const products = await Product.find(query)
      .populate("seller", "name storeName")
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 });

    const total = await Product.countDocuments(query);
    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
    };
    res.json({ products, pagination });
  } catch (err) {
    console.error("Error fetching products:", err);
    res
      .status(500)
      .json({ message: "Gagal mengambil produk", error: err.message });
  }
});

// Get semua produk (internal)
router.get("/all", async (req, res) => {
  try {
    const products = await Product.find().populate("seller", "name storeName");
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get satu produk by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "seller",
      "name storeName"
    );
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Buat produk baru
router.post(
  "/",
  auth,
  checkAdmin,
  upload.array("images", 5),
  handleMulterError,
  parseJSONFields,
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileId = await uploadToUploadcare(
            file.buffer,
            file.originalname
          );
          imageUrls.push(`https://ucarecdn.com/${fileId}/`);
        }
      }
      const newProduct = new Product({
        ...req.body,
        seller: req.user.id,
        images: imageUrls,
        dimensions: req.body.dimensions || { height: null, length: null },
        type: req.body.type || { jenis: [], size: [] },
        stocks: (req.body.stocks || []).map((stock) => ({
          ...stock,
          satuan: stock.satuan || "kg",
        })),
        isPublished:
          req.body.isPublished !== undefined ? req.body.isPublished : true,
      });
      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (err) {
      console.error("Error creating product:", err);
      res
        .status(500)
        .json({ message: "Failed to create product", error: err.message });
    }
  }
);

// Update produk
router.put(
  "/:id",
  auth,
  checkAdmin,
  upload.array("images", 5), // Tangani file upload
  handleMulterError, // Tangani error upload
  parseJSONFields, // Parse string JSON menjadi objek/array JS
  validateProduct, // Validasi data yang sudah di-parse
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // --- PERBAIKAN DIMULAI DI SINI ---

      // 1. Ambil gambar yang sudah ada langsung dari req.body. Sudah di-parse oleh middleware.
      // Beri nilai default array kosong jika tidak ada.
      let existingImages = req.body.existingImages || [];

      // 2. Upload file gambar baru (jika ada) ke Uploadcare
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToUploadcare(file.buffer, file.originalname)
        );
        const newFileIds = await Promise.all(uploadPromises);
        const newImageUrls = newFileIds.map(
          (fileId) => `https://ucarecdn.com/${fileId}/`
        );
        // Gabungkan gambar lama dengan gambar baru
        existingImages.push(...newImageUrls);
      }

      // 3. Buat array gambar final dengan memastikan tidak ada duplikat
      const finalImageUrls = [...new Set(existingImages)];

      // 4. Siapkan data untuk diupdate
      const fieldsToUpdate = {
        ...req.body,
        images: finalImageUrls, // Gunakan array gambar yang sudah final
      };

      // 5. Hapus field yang tidak perlu disimpan langsung ke model Product
      delete fieldsToUpdate.seller;
      delete fieldsToUpdate.existingImages;
      delete fieldsToUpdate.removedImages; // Anda belum menggunakan ini, tapi sebaiknya tetap dihapus
      // `seller` tidak perlu dihapus karena findByIdAndUpdate tidak akan mengubahnya
      // jika tidak ada di dalam $set, dan Anda juga tidak menyertakan `seller` di body form.

      // Opsional: Pastikan struktur stocks sudah benar sebelum update
      if (fieldsToUpdate.stocks) {
        fieldsToUpdate.stocks = fieldsToUpdate.stocks.map((stock) => ({
          ...stock,
          _id: stock._id ? String(stock._id) : undefined, // Pastikan _id adalah string jika ada
          satuan: stock.satuan || "kg",
        }));
      }

      // --- PERBAIKAN SELESAI ---

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: fieldsToUpdate },
        { new: true, runValidators: true } // new: true mengembalikan dokumen yang sudah di-update
      );

      if (!updatedProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      res.json(updatedProduct);
    } catch (err) {
      // Tambahkan log yang lebih detail untuk debugging di masa depan
      console.error("Error updating product:", {
        productId: req.params.id,
        requestBody: req.body,
        error: err.stack, // .stack memberikan trace lengkap
      });
      res
        .status(500)
        .json({ message: "Failed to update product", error: err.message });
    }
  }
);

// Delete produk
router.delete("/:id", auth, checkAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res
      .status(500)
      .json({ message: "Failed to delete product", error: err.message });
  }
});

module.exports = router;

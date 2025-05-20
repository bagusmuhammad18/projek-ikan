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
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          // console.error(`Error parsing field ${field}:`, e.message);
          // throw new Error(`Invalid JSON format for field: ${field}`);
          // Or handle more gracefully, for now, let the generic catch handle it.
          // For simplicity, the original catch will handle it.
        }
      }
    });
    // Original individual parsing (keep if preferred, but the loop is cleaner)
    // if (req.body.stocks && typeof req.body.stocks === 'string') {
    //   req.body.stocks = JSON.parse(req.body.stocks);
    // }
    // if (req.body.type && typeof req.body.type === 'string') {
    //   req.body.type = JSON.parse(req.body.type);
    // }
    // if (req.body.dimensions && typeof req.body.dimensions === 'string') {
    //   req.body.dimensions = JSON.parse(req.body.dimensions);
    // }
    // if (req.body.existingImages && typeof req.body.existingImages === 'string') {
    //    req.body.existingImages = JSON.parse(req.body.existingImages);
    // }
    // if (req.body.removedImages && typeof req.body.removedImages === 'string') {
    //    req.body.removedImages = JSON.parse(req.body.removedImages);
    // }
    next();
  } catch (err) {
    console.error("Error parsing JSON fields:", err);
    return res.status(400).json({
      message:
        "Invalid JSON format in one of the request body fields (e.g., stocks, type, dimensions, existingImages, removedImages)",
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
      if (!stocks) return true; // Allow empty stocks
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
        // VALIDASI UNTUK SATUAN <-- DITAMBAHKAN
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

// Helper untuk kompresi gambar
async function compressImage(fileBuffer) {
  try {
    let quality = 80;
    let compressedBuffer = fileBuffer;
    let fileSize = fileBuffer.length;

    // Kompresi hingga di bawah 1MB (1024*1024 bytes)
    while (fileSize > 1048576 && quality > 10) {
      compressedBuffer = await sharp(fileBuffer).jpeg({ quality }).toBuffer();
      fileSize = compressedBuffer.length;
      quality -= 10;
    }

    if (fileSize > 1048576) {
      // Jika masih di atas 1MB setelah kompresi minimum, coba format webp
      quality = 80;
      while (fileSize > 1048576 && quality > 10) {
        compressedBuffer = await sharp(fileBuffer).webp({ quality }).toBuffer();
        fileSize = compressedBuffer.length;
        quality -= 10;
      }
    }

    if (fileSize > 1048576) {
      console.warn(
        "Gambar tidak bisa dikompresi di bawah 1MB dengan kualitas yang wajar, ukuran akhir:",
        fileSize
      );
      // throw new Error( // Komentari error agar tetap bisa upload jika kompresi gagal
      //   "Gambar tidak bisa dikompresi di bawah 1MB dengan kualitas yang wajar"
      // );
    }

    return compressedBuffer;
  } catch (err) {
    console.error("Error compressing image:", err.message);
    // return fileBuffer; // Kembalikan buffer asli jika ada error kompresi
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

// Helper untuk menghitung harga setelah diskon
const calculateDiscountedPrice = (price, discount) => {
  if (!discount || discount <= 0 || discount > 100) return price;
  const discountAmount = (price * discount) / 100;
  return price - discountAmount;
};

// Get semua produk dengan filter, sorting, dan pagination (tanpa admin)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
      search,
      jenis, // Filter by product type (jenis ikan)
      size, // Filter by product size
    } = req.query;
    const query = { isPublished: true }; // Hanya tampilkan produk yang published

    // Tambahkan pencarian jika ada
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "type.jenis": { $regex: search, $options: "i" } }, // Cari juga di jenis ikan
      ];
    }

    // Filter berdasarkan jenis ikan
    if (jenis) {
      query["type.jenis"] = jenis;
    }

    // Filter berdasarkan ukuran (jika diperlukan lebih spesifik, mungkin perlu $elemMatch untuk stocks)
    if (size) {
      query["type.size"] = size; // Ini akan mencari jika 'size' ada di array type.size
    }

    const products = await Product.find(query)
      .populate("seller", "name storeName") // Populate seller info
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

// Get semua produk (tanpa admin, untuk keperluan internal mungkin)
router.get("/all", async (req, res) => {
  try {
    const products = await Product.find().populate("seller", "name storeName");
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get satu produk by ID (tanpa admin)
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

// Buat produk baru (hanya admin)
router.post(
  "/",
  auth, // Menggunakan auth biasa dulu, checkAdmin akan ada di dalam
  checkAdmin,
  upload.array("images", 5), // Maksimal 5 gambar
  handleMulterError,
  parseJSONFields, // Pastikan ini sebelum validateProduct
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          try {
            const fileId = await uploadToUploadcare(
              file.buffer,
              file.originalname
            );
            imageUrls.push(`https://ucarecdn.com/${fileId}/`);
          } catch (uploadError) {
            console.error(
              "Error uploading one of the images:",
              uploadError.message
            );
            // Anda bisa memilih untuk melanjutkan tanpa gambar ini atau mengembalikan error
            // return res.status(500).json({ message: "Gagal mengupload salah satu gambar", error: uploadError.message });
          }
        }
      }

      const dimensions = req.body.dimensions || { height: null, length: null };
      const type = req.body.type || { jenis: [], size: [] };
      const stocks = req.body.stocks || [];

      // Pastikan setiap item stok memiliki satuan default jika tidak dikirim dari frontend
      // Meskipun schema sudah ada default, lebih aman jika dihandle juga di sini
      const processedStocks = stocks.map((stock) => ({
        ...stock,
        satuan: stock.satuan || "kg", // Default ke 'kg' jika tidak ada
      }));

      const newProduct = new Product({
        ...req.body,
        seller: req.user.id, // req.user.id didapat dari middleware auth
        images: imageUrls,
        dimensions,
        type,
        stocks: processedStocks, // Gunakan stocks yang sudah diproses
        sales: req.body.sales || 0,
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

// Update product (hanya admin)
router.put(
  "/:id",
  auth, // Menggunakan auth biasa dulu, checkAdmin akan ada di dalam
  checkAdmin,
  upload.array("images", 5), // Izinkan upload gambar baru saat update
  handleMulterError,
  parseJSONFields, // Pastikan ini sebelum validateProduct
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      let existingImageUrls = product.images || [];
      // Use req.body.existingImages directly if parseJSONFields handled it
      if (req.body.existingImages && Array.isArray(req.body.existingImages)) {
        existingImageUrls = req.body.existingImages;
      }

      let removedImageUrls = [];
      if (req.body.removedImages && Array.isArray(req.body.removedImages)) {
        removedImageUrls = req.body.removedImages;
      }

      const filteredImageUrls = existingImageUrls.filter(
        (url) => !removedImageUrls.includes(url)
      );
      let imageUrls = [...filteredImageUrls];

      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToUploadcare(file.buffer, file.originalname).catch((err) => {
            console.error(
              "Error uploading one of the new images:",
              err.message
            );
            return null;
          })
        );
        const newFileIds = await Promise.all(uploadPromises);
        const newImageUrls = newFileIds
          .filter((fileId) => fileId !== null)
          .map((fileId) => `https://ucarecdn.com/${fileId}/`);
        imageUrls = [...imageUrls, ...newImageUrls];
      }

      imageUrls = [...new Set(imageUrls)];

      // Prepare fields to update from req.body
      const fieldsToUpdate = { ...req.body };

      // !!! IMPORTANT FIX FOR THE SELLER CASTERROR !!!
      // The seller ID should not be changed via this update method,
      // or if it is, req.body.seller should be just the ID string.
      // To prevent the error, remove it from the update payload if it's an object.
      delete fieldsToUpdate.seller;
      // Also remove fields managed separately or that shouldn't be mass-assigned from req.body
      delete fieldsToUpdate.images; // Will be set from imageUrls
      delete fieldsToUpdate.existingImages;
      delete fieldsToUpdate.removedImages;

      // Assign processed images
      fieldsToUpdate.images = imageUrls;

      // Process stocks if present in req.body (already parsed by parseJSONFields)
      if (req.body.stocks) {
        fieldsToUpdate.stocks = req.body.stocks.map((stock) => ({
          ...stock,
          _id: stock._id ? String(stock._id) : undefined, // Ensure _id is a string or undefined
          satuan: stock.satuan || "kg",
        }));
      }

      // Process type if present (already parsed)
      if (req.body.type) {
        fieldsToUpdate.type = req.body.type;
      }

      // Process dimensions if present (already parsed)
      if (req.body.dimensions) {
        fieldsToUpdate.dimensions = req.body.dimensions;
      }

      // Handle other fields explicitly if they need special processing or validation
      // For example: weight, sales, isPublished
      if (req.body.weight !== undefined)
        fieldsToUpdate.weight = req.body.weight;
      if (req.body.sales !== undefined) fieldsToUpdate.sales = req.body.sales;
      if (req.body.isPublished !== undefined)
        fieldsToUpdate.isPublished = req.body.isPublished;

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: fieldsToUpdate },
        { new: true, runValidators: true }
      );

      res.json(updatedProduct);
    } catch (err) {
      console.error("Error updating product:", err);
      if (err.name === "ValidationError") {
        return res
          .status(400)
          .json({ message: "Validation failed", errors: err.errors });
      }
      if (err.name === "CastError") {
        return res
          .status(400)
          .json({
            message: `Data type error: ${err.message}`,
            path: err.path,
            value: err.value,
          });
      }
      res
        .status(500)
        .json({ message: "Failed to update product", error: err.message });
    }
  }
);

// Delete produk (hanya admin)
router.delete("/:id", auth, checkAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Logika tambahan: Pastikan admin hanya bisa delete produk miliknya (jika bukan superadmin)
    // if (product.seller.toString() !== req.user.id && req.user.role !== 'superadmin') {
    //   return res.status(403).json({ message: "User not authorized to delete this product" });
    // }

    await product.deleteOne(); // Menggunakan deleteOne() pada instance model
    res.json({ message: "Product deleted" });
  } catch (err) {
    console.error("Error deleting product:", err);
    res
      .status(500)
      .json({ message: "Failed to delete product", error: err.message });
  }
});

module.exports = router;

const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

// Konfigurasi Multer untuk menyimpan file di memory dengan filter gambar
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  // Daftar MIME type yang diizinkan (hanya gambar)
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Terima file
  } else {
    cb(
      new Error("Hanya file gambar yang diizinkan (jpeg, png, gif, webp, bmp)"),
      false
    ); // Tolak file
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Opsional: batas ukuran file 5MB sebelum kompresi
});

// Middleware untuk menangani error Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Error spesifik dari Multer (misalnya file terlalu besar)
    return res.status(400).json({ message: err.message });
  } else if (err) {
    // Error dari fileFilter (misalnya tipe file tidak diizinkan)
    return res.status(400).json({ message: err.message });
  }
  next(); // Lanjutkan jika tidak ada error
};

// Middleware untuk validasi input
const validateProduct = [
  body("sku").notEmpty().withMessage("SKU is required"),
  body("name").notEmpty().withMessage("Name is required"),
  body("description").notEmpty().withMessage("Description is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("stock").isNumeric().withMessage("Stock must be a number"),
  body("discount")
    .optional()
    .isNumeric()
    .withMessage("Discount must be a number"),
  body("weight").optional().isNumeric().withMessage("Weight must be a number"),
  body("dimensions.height")
    .optional()
    .isNumeric()
    .withMessage("Height must be a number"),
  body("dimensions.length")
    .optional()
    .isNumeric()
    .withMessage("Length must be a number"),
  body("dimensions.width")
    .optional()
    .isNumeric()
    .withMessage("Width must be a number"),
  body("type.color")
    .optional()
    .isArray()
    .withMessage("Type color must be an array"),
  body("type.size")
    .optional()
    .isArray()
    .withMessage("Type size must be an array"),
  body("isPublished")
    .optional()
    .isBoolean()
    .withMessage("isPublished must be a boolean"),
];

// Helper function untuk mengompresi gambar ke ukuran < 1MB
async function compressImage(fileBuffer) {
  try {
    let quality = 80; // Mulai dengan kualitas 80
    let compressedBuffer = fileBuffer;
    let fileSize = fileBuffer.length;

    // Terus kompresi sampai ukuran < 1MB (1MB = 1048576 bytes)
    while (fileSize > 1048576 && quality > 10) {
      compressedBuffer = await sharp(fileBuffer)
        .jpeg({ quality }) // Gunakan JPEG dengan kualitas tertentu
        .toBuffer();
      fileSize = compressedBuffer.length;
      quality -= 10; // Kurangi kualitas secara bertahap
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

// Helper function untuk upload gambar ke Uploadcare
async function uploadToUploadcare(fileBuffer, fileName) {
  const compressedBuffer = await compressImage(fileBuffer); // Kompresi dulu
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

// Get all published products with search and filter
router.get("/", async (req, res) => {
  try {
    const {
      search,
      minPrice,
      maxPrice,
      color,
      size,
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    let query = { isPublished: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    if (color) {
      const colorArray = color.split(",");
      query["type.color"] = {
        $in: colorArray.map((c) => new RegExp(`^${c}$`, "i")),
      };
    }

    if (size) {
      const sizeArray = size.split(",");
      query["type.size"] = {
        $in: sizeArray.map((s) => new RegExp(`^${s}$`, "i")),
      };
    }

    const total = await Product.countDocuments(query);

    const products = await Product.find(query)
      .sort({ [sortBy]: order === "asc" ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      totalProducts: total,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all products (for admin/seller)
router.get("/all", auth, async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get one product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Create a new product
router.post(
  "/",
  auth,
  upload.single("image"),
  handleMulterError, // Tangani error Multer di sini
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let imageUrl = null;
      if (req.file) {
        const fileId = await uploadToUploadcare(
          req.file.buffer,
          req.file.originalname
        );
        imageUrl = `https://ucarecdn.com/${fileId}/`;
      }

      const newProduct = new Product({
        ...req.body,
        seller: req.user.id,
        image: imageUrl,
        isPublished: req.body.isPublished || false,
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (err) {
      res.status(500).json({
        message: "Failed to create product",
        error: err.message,
      });
    }
  }
);

// Update product
router.put(
  "/:id",
  auth,
  upload.single("image"),
  handleMulterError, // Tangani error Multer di sini
  validateProduct,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (product.seller.toString() !== req.user.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      let imageUrl = product.image;
      if (req.file) {
        const fileId = await uploadToUploadcare(
          req.file.buffer,
          req.file.originalname
        );
        imageUrl = `https://ucarecdn.com/${fileId}/`;
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,
          image: imageUrl,
          isPublished: req.body.isPublished || product.isPublished,
        },
        { new: true }
      );

      res.json(updatedProduct);
    } catch (err) {
      res.status(500).json({
        message: "Failed to update product",
        error: err.message,
      });
    }
  }
);

// Delete product
router.delete("/:id", auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to delete product",
      error: err.message,
    });
  }
});

module.exports = router;

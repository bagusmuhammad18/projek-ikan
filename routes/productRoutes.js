const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

// Konfigurasi Multer (Upload ke memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Middleware untuk validasi input
const validateProduct = [
  body("name").notEmpty().withMessage("Name is required"),
  body("description").notEmpty().withMessage("Description is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("size").notEmpty().withMessage("Size is required"),
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
    .withMessage("isPublished must be a boolean"), // ✅ Tambahkan validasi isPublished
];

/**
 * Helper function untuk memproses dan menyimpan gambar.
 * Jika oldImagePath disediakan, file lama akan dihapus.
 */
async function processImageUpload(fileBuffer, oldImagePath = null) {
  const uploadDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  if (oldImagePath) {
    const fullOldImagePath = path.join(__dirname, "../", oldImagePath);
    if (fs.existsSync(fullOldImagePath)) {
      fs.unlinkSync(fullOldImagePath);
    }
  }

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const fileName = `${uniqueSuffix}.jpeg`;
  const relativeImagePath = path.posix.join("uploads", fileName);
  const fullImagePath = path.join(__dirname, "../", relativeImagePath);

  await sharp(fileBuffer)
    .toFormat("jpeg")
    .jpeg({ quality: 80 })
    .toFile(fullImagePath);

  return relativeImagePath;
}

// Get all published products (untuk user umum)
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ isPublished: true }); // ✅ Hanya produk yang sudah dipublikasikan
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get all products (termasuk yang belum dipublish) - hanya untuk admin/seller
router.get("/all", auth, async (req, res) => {
  try {
    const products = await Product.find(); // ✅ Menampilkan semua produk tanpa filter
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

// Create a new product (hanya seller/admin)
router.post(
  "/",
  auth,
  upload.single("image"),
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let imagePath = null;
      if (req.file) {
        imagePath = await processImageUpload(req.file.buffer);
      }

      const newProduct = new Product({
        ...req.body,
        seller: req.user.id,
        image: imagePath,
        isPublished: req.body.isPublished || false, // ✅ Tambahkan isPublished dengan default false
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to create product", error: err.message });
    }
  }
);

// Update product (hanya seller yang punya akses)
router.put(
  "/:id",
  auth,
  upload.single("image"),
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

      let imagePath = product.image;
      if (req.file) {
        imagePath = await processImageUpload(req.file.buffer, product.image);
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,
          image: imagePath,
          isPublished: req.body.isPublished || product.isPublished,
        },
        { new: true }
      );

      res.json(updatedProduct);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to update product", error: err.message });
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

    if (product.image) {
      const fullImagePath = path.join(__dirname, "../", product.image);
      if (fs.existsSync(fullImagePath)) {
        fs.unlinkSync(fullImagePath);
      }
    }

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete product", error: err.message });
  }
});

// Delete All Products (opsional)
router.delete("/", async (req, res) => {
  try {
    await Product.deleteMany();
    res.json({ message: "All products deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete all products", error: err.message });
  }
});

module.exports = router;

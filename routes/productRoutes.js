const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");
const multer = require("multer");
const streamifier = require("streamifier");
const cloudinary = require("../config/cloudinary");

// Konfigurasi Multer untuk menyimpan file di memory
const storage = multer.memoryStorage();
const upload = multer({ storage });

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

// Helper function untuk upload gambar ke Cloudinary
async function uploadToCloudinary(fileBuffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "ikan",
        format: "jpeg",
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
}

// Get all published products with search and filter
router.get("/", async (req, res) => {
  try {
    const {
      search, // Pencarian berdasarkan nama atau SKU
      minPrice, // Filter harga minimum
      maxPrice, // Filter harga maksimum
      color, // Filter berdasarkan warna
      size, // Filter berdasarkan ukuran
      sortBy = "createdAt", // Urutan default: waktu pembuatan
      order = "desc", // Urutan default: descending
      page = 1, // Halaman default: 1
      limit = 10, // Batas item per halaman: 10
    } = req.query;

    // Buat query awal
    let query = { isPublished: true };

    // Pencarian berdasarkan nama atau SKU
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } }, // Case-insensitive
        { sku: { $regex: search, $options: "i" } },
      ];
    }

    // Filter harga
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Filter berdasarkan warna (case-insensitive)
    if (color) {
      const colorArray = color.split(",");
      query["type.color"] = {
        $in: colorArray.map((c) => new RegExp(`^${c}$`, "i")),
      };
    }

    // Filter berdasarkan ukuran (case-insensitive)
    if (size) {
      const sizeArray = size.split(",");
      query["type.size"] = {
        $in: sizeArray.map((s) => new RegExp(`^${s}$`, "i")),
      };
    }

    // Hitung total dokumen untuk pagination
    const total = await Product.countDocuments(query);

    // Ambil produk dengan pagination, sorting, dan filtering
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
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let imageUrl = null;
      if (req.file) {
        imageUrl = await uploadToCloudinary(req.file.buffer);
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
        imageUrl = await uploadToCloudinary(req.file.buffer);
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

// Delete all products
router.delete("/", async (req, res) => {
  try {
    await Product.deleteMany();
    res.json({ message: "All products deleted" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to delete all products",
      error: err.message,
    });
  }
});

module.exports = router;

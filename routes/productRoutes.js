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

// Helper untuk kompresi gambar
async function compressImage(fileBuffer) {
  try {
    let quality = 80;
    let compressedBuffer = fileBuffer;
    let fileSize = fileBuffer.length;

    while (fileSize > 1048576 && quality > 10) {
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

// Get semua produk dengan filter, sorting, dan pagination (tanpa admin)
router.get("/", async (req, res) => {
  try {
    const {
      search,
      minPrice,
      maxPrice,
      color,
      size,
      sortBy,
      sortOrder,
      page = 1,
      limit = 999999,
    } = req.query;

    let query = { isPublished: true };

    // Search by name
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // Price filter
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }

    // Color filter (case-insensitive with $or and $regex)
    if (color) {
      const colors = Array.isArray(color) ? color : [color];
      const lowerCaseColors = colors.map((c) => c.toLowerCase());
      query.$or = lowerCaseColors.map((c) => ({
        "type.color": { $regex: `^${c}$`, $options: "i" },
      }));
    }

    // Size filter (case-insensitive with $or and $regex)
    if (size) {
      const sizes = Array.isArray(size) ? size : [size];
      const lowerCaseSizes = sizes.map((s) => s.toLowerCase());
      query.$or = lowerCaseSizes.map((s) => ({
        "type.size": { $regex: `^${s}$`, $options: "i" },
      }));
    }

    const pageNumber = Math.max(1, Number(page));
    const limitNumber = Math.max(1, Math.min(100, Number(limit)));
    const skip = (pageNumber - 1) * limitNumber;

    const sortOptions = {};
    if (sortBy) {
      sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;
    } else {
      sortOptions.createdAt = -1;
    }

    const products = await Product.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNumber);

    const total = await Product.countDocuments(query);
    const totalPages = Math.ceil(total / limitNumber);

    res.json({
      products,
      pagination: {
        currentPage: pageNumber,
        totalPages,
        totalItems: total,
        itemsPerPage: limitNumber,
      },
    });
  } catch (err) {
    console.error("Server Error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get semua produk (tanpa admin)
router.get("/all", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get satu produk by ID (tanpa admin)
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Buat produk baru (hanya admin)
router.post(
  "/",
  checkAdmin,
  upload.array("images", 5),
  handleMulterError,
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
        isPublished:
          req.body.isPublished !== undefined ? req.body.isPublished : true,
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

// Update product (hanya admin)
router.put(
  "/:id",
  checkAdmin,
  upload.array("images"),
  handleMulterError,
  validateProduct,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      let existingImageUrls = product.images || [];
      if (req.body.existingImages) {
        try {
          existingImageUrls = JSON.parse(req.body.existingImages) || [];
        } catch (parseError) {
          console.error("Error parsing existingImages:", parseError);
          return res
            .status(400)
            .json({ message: "Invalid existingImages format" });
        }
      }

      let removedImageUrls = [];
      if (req.body.removedImages) {
        try {
          removedImageUrls = JSON.parse(req.body.removedImages) || [];
        } catch (parseError) {
          console.error("Error parsing removedImages:", parseError);
          return res
            .status(400)
            .json({ message: "Invalid removedImages format" });
        }
      }

      const filteredImageUrls = existingImageUrls.filter(
        (url) => !removedImageUrls.includes(url)
      );

      let imageUrls = [...filteredImageUrls];
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToUploadcare(file.buffer, file.originalname)
        );
        const newFileIds = await Promise.all(uploadPromises);
        const newImageUrls = newFileIds.map(
          (fileId) => `https://ucarecdn.com/${fileId}/`
        );
        imageUrls = [...imageUrls, ...newImageUrls];
      }

      let dimensions = product.dimensions || { height: 0, length: 0, width: 0 };
      if (req.body.dimensions) {
        try {
          dimensions = JSON.parse(req.body.dimensions) || {
            height: 0,
            length: 0,
            width: 0,
          };
        } catch (parseError) {
          console.error("Error parsing dimensions:", parseError);
          return res.status(400).json({ message: "Invalid dimensions format" });
        }
      }

      let type = product.type || { color: [], size: [] };
      if (req.body.type) {
        try {
          type = JSON.parse(req.body.type) || { color: [], size: [] };
        } catch (parseError) {
          console.error("Error parsing type:", parseError);
          return res.status(400).json({ message: "Invalid type format" });
        }
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,
          images: imageUrls,
          weight: req.body.weight || product.weight,
          dimensions,
          type,
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

// Delete produk (hanya admin)
router.delete("/:id", checkAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete product", error: err.message });
  }
});

module.exports = router;

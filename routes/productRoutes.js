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
    if (req.body.stocks) {
      req.body.stocks = JSON.parse(req.body.stocks);
    }
    if (req.body.type) {
      req.body.type = JSON.parse(req.body.type);
    }
    if (req.body.dimensions) {
      req.body.dimensions = JSON.parse(req.body.dimensions);
    }
    next();
  } catch (err) {
    console.error("Error parsing JSON fields:", err);
    return res
      .status(400)
      .json({ message: "Invalid JSON format in request body" });
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
        if (!stock.sku || typeof stock.sku !== "string") {
          throw new Error("Each stock entry must have a valid SKU");
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
    } = req.query;
    const query = {};

    // Tambahkan pencarian jika ada
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const products = await Product.find(query)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ [sortBy]: sortOrder === "desc" ? -1 : 1 });

    const total = await Product.countDocuments(query);
    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      totalItems: total,
    };

    // Transformasi produk untuk menyertakan originalPrice dan discountedPrice
    const transformedProducts = products.map((product) => {
      const stock =
        product.stocks && product.stocks.length > 0 ? product.stocks[0] : null;
      const originalPrice = stock ? stock.price : 0;
      const discountedPrice = stock
        ? stock.price - (stock.price * (stock.discount || 0)) / 100
        : 0;
      return {
        ...product.toObject(),
        originalPrice,
        discountedPrice,
      };
    });

    res.json({ products: transformedProducts, pagination });
  } catch (err) {
    console.error("Error fetching products:", err);
    res
      .status(500)
      .json({ message: "Gagal mengambil produk", error: err.message });
  }
});

// Get semua produk (tanpa admin)
router.get("/all", async (req, res) => {
  try {
    const products = await Product.find();
    const productsWithDiscount = products.map((product) => {
      const updatedStocks = product.stocks.map((stock) => ({
        ...stock,
        originalPrice: stock.price,
        discountedPrice: calculateDiscountedPrice(stock.price, stock.discount),
      }));
      return {
        ...product.toObject(),
        stocks: updatedStocks,
        sales: product.sales,
      };
    });
    res.json(productsWithDiscount);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get satu produk by ID (tanpa admin)
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const updatedStocks = product.stocks.map((stock) => ({
      ...stock,
      originalPrice: stock.price,
      discountedPrice: calculateDiscountedPrice(stock.price, stock.discount),
    }));
    const productWithDiscount = {
      ...product.toObject(),
      stocks: updatedStocks,
      sales: product.sales,
    };

    res.json(productWithDiscount);
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
  parseJSONFields, // Add the new middleware
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
          const fileId = await uploadToUploadcare(
            file.buffer,
            file.originalname
          );
          imageUrls.push(`https://ucarecdn.com/${fileId}/`);
        }
      }

      // No need to parse dimensions, type, stocks again since parseJSONFields did it
      const dimensions = req.body.dimensions || { height: 0, length: 0 };
      const type = req.body.type || { jenis: [], size: [] };
      const stocks = req.body.stocks || [];

      const newProduct = new Product({
        ...req.body,
        seller: req.user.id,
        images: imageUrls,
        dimensions,
        type,
        stocks,
        sales: req.body.sales || 0,
        isPublished:
          req.body.isPublished !== undefined ? req.body.isPublished : true,
      });

      await newProduct.save();

      const updatedStocks = newProduct.stocks.map((stock) => ({
        ...stock._doc, // Use _doc to get the raw object
        originalPrice: stock.price,
        discountedPrice: calculateDiscountedPrice(stock.price, stock.discount),
      }));
      const productWithDiscount = {
        ...newProduct.toObject(),
        stocks: updatedStocks,
        sales: newProduct.sales,
      };

      res.status(201).json(productWithDiscount);
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

      let dimensions = product.dimensions || { height: 0, length: 0 };
      if (req.body.dimensions) {
        try {
          dimensions = JSON.parse(req.body.dimensions) || {
            height: 0,
            length: 0,
          };
        } catch (parseError) {
          return res.status(400).json({ message: "Invalid dimensions format" });
        }
      }

      let type = product.type || { jenis: [], size: [] };
      if (req.body.type) {
        try {
          type = JSON.parse(req.body.type) || { jenis: [], size: [] };
        } catch (parseError) {
          return res.status(400).json({ message: "Invalid type format" });
        }
      }

      let stocks = product.stocks || [];
      if (req.body.stocks) {
        try {
          stocks = JSON.parse(req.body.stocks) || [];
        } catch (parseError) {
          return res.status(400).json({ message: "Invalid stocks format" });
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
          stocks,
          sales: req.body.sales || product.sales || 0,
          isPublished:
            req.body.isPublished !== undefined
              ? req.body.isPublished
              : product.isPublished,
        },
        { new: true }
      );

      const updatedStocks = updatedProduct.stocks.map((stock) => ({
        ...stock,
        originalPrice: stock.price,
        discountedPrice: calculateDiscountedPrice(stock.price, stock.discount),
      }));
      const productWithDiscount = {
        ...updatedProduct.toObject(),
        stocks: updatedStocks,
        sales: updatedProduct.sales,
      };

      res.json(productWithDiscount);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to update product", error: err.message });
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

const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { body, validationResult } = require("express-validator");
const auth = require("../middleware/auth");

// Middleware untuk validasi input
const validateProduct = [
  body("name").notEmpty().withMessage("Name is required"),
  body("description").notEmpty().withMessage("Description is required"),
  body("price").isNumeric().withMessage("Price must be a number"),
  body("size").notEmpty().withMessage("Size is required"),
  body("stock").isNumeric().withMessage("Stock must be a number"),
];

// Get all products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Create a new product (hanya seller/admin)
router.post("/", auth, validateProduct, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const newProduct = new Product({
      ...req.body,
      //   seller: req.user.id, // Jika sudah ada autentikasi
      //   seller: "6607b1e6d4a9d8a9f4f3b1a0", //dummy seller ID
    });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    // Tampilkan error detail untuk debugging
    res
      .status(500)
      .json({ message: "Failed to create product", error: err.message });
  }
});

// Update product (hanya seller yang punya akses)
router.put("/:id", auth, validateProduct, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Cek apakah user adalah pemilik produk
    if (product.seller.toString() !== req.user.id) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    res.json(updatedProduct);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update product", error: err.message });
  }
});

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
    res
      .status(500)
      .json({ message: "Failed to delete product", error: err.message });
  }
});

// //Delete All Products
// router.delete("/", async (req, res) => {
//   try {
//     await Product.deleteMany();
//     res.json({ message: "All products deleted" });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ message: "Failed to delete all products", error: err.message });
//   }
// });

module.exports = router;

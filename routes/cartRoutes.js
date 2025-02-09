const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

/**
 * GET /api/cart
 * Mengambil shopping cart untuk user yang sedang login.
 */
router.get("/", auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate(
      "items.product"
    );
    if (!cart) {
      // Jika belum ada cart, buat cart kosong untuk user tersebut.
      cart = new Cart({ user: req.user.id, items: [] });
      await cart.save();
    }
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: "Failed to get cart", error: err.message });
  }
});

/**
 * POST /api/cart
 * Menambahkan item ke cart.
 * Body harus mengandung: productId, quantity.
 */
router.post(
  "/",
  auth,
  [
    body("productId").notEmpty().withMessage("Product ID is required"),
    body("quantity")
      .isInt({ gt: 0 })
      .withMessage("Quantity must be greater than 0"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { productId, quantity } = req.body;

      // Pastikan produk ada
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
      }

      // Cek apakah produk sudah ada di cart
      const itemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );
      if (itemIndex > -1) {
        // Jika sudah ada, tambahkan quantity
        cart.items[itemIndex].quantity += quantity;
      } else {
        cart.items.push({ product: productId, quantity });
      }
      cart.updatedAt = new Date();
      await cart.save();
      res.json(cart);
    } catch (err) {
      res.status(500).json({
        message: "Failed to add item to cart",
        error: err.message,
      });
    }
  }
);

/**
 * PUT /api/cart
 * Memperbarui quantity suatu item di cart.
 * Body harus mengandung: productId, quantity.
 */
router.put(
  "/",
  auth,
  [
    body("productId").notEmpty().withMessage("Product ID is required"),
    body("quantity")
      .isInt({ gt: 0 })
      .withMessage("Quantity must be greater than 0"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { productId, quantity } = req.body;
      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        return res.status(404).json({ message: "Cart not found" });
      }

      const itemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );
      if (itemIndex === -1) {
        return res.status(404).json({ message: "Item not found in cart" });
      }

      cart.items[itemIndex].quantity = quantity;
      cart.updatedAt = new Date();
      await cart.save();
      res.json(cart);
    } catch (err) {
      res.status(500).json({
        message: "Failed to update cart",
        error: err.message,
      });
    }
  }
);

/**
 * DELETE /api/cart/:productId
 * Menghapus item tertentu dari cart berdasarkan productId.
 */
router.delete("/:productId", auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );
    cart.updatedAt = new Date();
    await cart.save();
    res.json(cart);
  } catch (err) {
    res.status(500).json({
      message: "Failed to remove item from cart",
      error: err.message,
    });
  }
});

/**
 * DELETE /api/cart
 * Menghapus semua item di cart (clear cart).
 */
router.delete("/", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id });
    if (cart) {
      cart.items = [];
      cart.updatedAt = new Date();
      await cart.save();
    }
    res.json({ message: "Cart cleared" });
  } catch (err) {
    res.status(500).json({
      message: "Failed to clear cart",
      error: err.message,
    });
  }
});

module.exports = router;

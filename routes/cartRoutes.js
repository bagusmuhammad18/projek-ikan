const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const mongoose = require("mongoose");

/**
 * GET /api/cart
 * Mengambil shopping cart untuk user yang sedang login.
 */
router.get("/", auth, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user.id }).populate(
      "items.product"
    );
    if (!cart) {
      return res.json({ items: [] }); // Kembalikan keranjang kosong tanpa membuat baru
    }
    res.json(cart);
  } catch (err) {
    console.error("Error in GET /api/cart:", err);
    res.status(500).json({ message: "Failed to get cart", error: err.message });
  }
});

/**
 * POST /api/cart
 * Menambahkan item ke cart.
 */
router.post(
  "/",
  auth,
  [
    body("productId").notEmpty().withMessage("Product ID is required"),
    body("quantity")
      .isInt({ gt: 0 })
      .withMessage("Quantity must be greater than 0"),
    body("jenis").notEmpty().withMessage("Jenis is required"),
    body("size").notEmpty().withMessage("Size is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { productId, quantity, jenis, size } = req.body;
      console.log("Received payload for POST /api/cart:", {
        productId,
        quantity,
        jenis,
        size,
      });

      // Validasi eksplisit untuk jenis dan size
      if (!jenis?.trim()) {
        console.log("Validation failed: jenis is empty or undefined");
        return res.status(400).json({ message: "Jenis cannot be empty" });
      }
      if (!size?.trim()) {
        console.log("Validation failed: size is empty or undefined");
        return res.status(400).json({ message: "Size cannot be empty" });
      }

      if (!mongoose.Types.ObjectId.isValid(productId)) {
        console.log("Invalid product ID:", productId);
        return res.status(404).json({ message: "Invalid product ID" });
      }
      const productObjectId = new mongoose.Types.ObjectId(productId);

      const product = await Product.findById(productObjectId);
      if (!product) {
        console.log("Product not found for ID:", productId);
        return res.status(404).json({ message: "Product not found" });
      }

      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) {
        cart = new Cart({ user: req.user.id, items: [] });
      }

      const stockEntry = product.stocks.find(
        (stock) =>
          stock.jenis?.toLowerCase() === jenis?.toLowerCase() &&
          stock.size?.toLowerCase() === size?.toLowerCase()
      );
      if (!stockEntry) {
        console.log("Stock not found for:", { jenis, size });
        return res.status(400).json({
          message: `Stok untuk jenis ${jenis} dan ukuran ${size} tidak ditemukan`,
        });
      }
      if (quantity > stockEntry.stock) {
        console.log("Quantity exceeds stock:", {
          quantity,
          stock: stockEntry.stock,
        });
        return res
          .status(400)
          .json({ message: "Quantity exceeds available stock" });
      }

      const itemIndex = cart.items.findIndex(
        (item) =>
          item.product.toString() === productId &&
          item.jenis === jenis &&
          item.size === size
      );
      if (itemIndex > -1) {
        const newQuantity = cart.items[itemIndex].quantity + quantity;
        if (newQuantity > stockEntry.stock) {
          console.log("Updated quantity exceeds stock:", {
            newQuantity,
            stock: stockEntry.stock,
          });
          return res
            .status(400)
            .json({ message: "Quantity exceeds available stock" });
        }
        cart.items[itemIndex].quantity = newQuantity;
      } else {
        const newItem = {
          product: productObjectId,
          quantity,
          jenis: jenis.trim(),
          size: size.trim(),
        };
        console.log("Pushing new item to cart:", newItem);
        cart.items.push(newItem);
      }

      cart.updatedAt = new Date();
      console.log("Cart before save:", JSON.stringify(cart, null, 2));
      await cart.save();
      console.log("Cart saved successfully:", JSON.stringify(cart, null, 2));
      res.json(cart);
    } catch (err) {
      console.error("Error in POST /api/cart:", err);
      res
        .status(500)
        .json({ message: "Failed to add item to cart", error: err.message });
    }
  }
);

/**
 * PUT /api/cart
 * Memperbarui quantity suatu item di cart.
 */
router.put(
  "/",
  auth,
  [
    body("productId").notEmpty().withMessage("Product ID is required"),
    body("quantity")
      .isInt({ gt: 0 })
      .withMessage("Quantity must be greater than 0"),
    body("jenis").notEmpty().withMessage("Jenis is required"),
    body("size").notEmpty().withMessage("Size is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { productId, quantity, jenis, size } = req.body;
      console.log("Received payload for PUT /api/cart:", {
        productId,
        quantity,
        jenis,
        size,
      });

      if (!jenis?.trim()) {
        console.log("Validation failed: jenis is empty or undefined");
        return res.status(400).json({ message: "Jenis cannot be empty" });
      }
      if (!size?.trim()) {
        console.log("Validation failed: size is empty or undefined");
        return res.status(400).json({ message: "Size cannot be empty" });
      }

      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) return res.status(404).json({ message: "Cart not found" });

      const itemIndex = cart.items.findIndex(
        (item) =>
          item.product.toString() === productId &&
          item.jenis === jenis &&
          item.size === size
      );
      if (itemIndex === -1) {
        return res.status(404).json({ message: "Item not found in cart" });
      }

      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const stockEntry = product.stocks.find(
        (stock) =>
          stock.jenis?.toLowerCase() === jenis?.toLowerCase() &&
          stock.size?.toLowerCase() === size?.toLowerCase()
      );
      if (!stockEntry) {
        return res.status(400).json({
          message: `Stok untuk jenis ${jenis} dan ukuran ${size} tidak ditemukan`,
        });
      }
      if (quantity > stockEntry.stock) {
        return res
          .status(400)
          .json({ message: "Quantity exceeds available stock" });
      }

      cart.items[itemIndex].quantity = quantity;
      cart.updatedAt = new Date();
      console.log("Cart before save:", JSON.stringify(cart, null, 2));
      await cart.save();
      console.log("Cart updated successfully:", JSON.stringify(cart, null, 2));
      res.json(cart);
    } catch (err) {
      console.error("Error in PUT /api/cart:", err);
      res
        .status(500)
        .json({ message: "Failed to update cart", error: err.message });
    }
  }
);

/**
 * DELETE /api/cart/:productId
 * Menghapus item tertentu dari cart berdasarkan productId, jenis, dan size.
 */
router.delete(
  "/:productId",
  auth,
  [
    body("jenis").notEmpty().withMessage("Jenis is required"),
    body("size").notEmpty().withMessage("Size is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("Validation errors:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { productId } = req.params;
      const { jenis, size } = req.body;
      console.log("Received payload for DELETE /api/cart/:productId:", {
        productId,
        jenis,
        size,
      });

      if (!jenis?.trim()) {
        console.log("Validation failed: jenis is empty or undefined");
        return res.status(400).json({ message: "Jenis cannot be empty" });
      }
      if (!size?.trim()) {
        console.log("Validation failed: size is empty or undefined");
        return res.status(400).json({ message: "Size cannot be empty" });
      }

      const cart = await Cart.findOne({ user: req.user.id });
      if (!cart) return res.status(404).json({ message: "Cart not found" });

      cart.items = cart.items.filter(
        (item) =>
          !(
            item.product.toString() === productId &&
            item.jenis === jenis &&
            item.size === size
          )
      );
      cart.updatedAt = new Date();
      console.log("Cart before save:", JSON.stringify(cart, null, 2));
      await cart.save();
      console.log("Cart updated successfully:", JSON.stringify(cart, null, 2));
      res.json(cart);
    } catch (err) {
      console.error("Error in DELETE /api/cart/:productId:", err);
      res.status(500).json({
        message: "Failed to remove item from cart",
        error: err.message,
      });
    }
  }
);

/**
 * DELETE /api/cart/clear
 * Menghapus semua item di cart (clear cart).
 */
router.delete("/clear", auth, async (req, res) => {
  try {
    const cart = await Cart.findOneAndDelete({ user: req.user.id });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    console.log("Cart cleared successfully:", JSON.stringify(cart, null, 2));
    res.json({ message: "Cart cleared" });
  } catch (err) {
    console.error("Error in DELETE /api/cart/clear:", err);
    res
      .status(500)
      .json({ message: "Failed to clear cart", error: err.message });
  }
});

module.exports = router;

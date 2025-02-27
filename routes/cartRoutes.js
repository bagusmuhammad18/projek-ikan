const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

/**
 * @swagger
 * tags:
 *   name: Cart
 *   description: API untuk mengelola shopping cart
 */

/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Mengambil shopping cart untuk user yang sedang login
 *     description: Mengembalikan cart pengguna yang terautentikasi. Jika cart belum ada, akan dibuat baru.
 *     tags: [Cart]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     responses:
 *       200:
 *         description: Berhasil mendapatkan cart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
 *       401:
 *         description: Tidak terautentikasi
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Autentikasi gagal
 *                 error:
 *                   type: string
 *       500:
 *         description: Gagal mendapatkan cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to get cart
 *                 error:
 *                   type: string
 */
router.get("/", auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id }).populate(
      "items.product"
    );
    if (!cart) {
      cart = new Cart({ user: req.user.id, items: [] });
      await cart.save();
    }
    res.json(cart);
  } catch (err) {
    res.status(500).json({ message: "Failed to get cart", error: err.message });
  }
});

/**
 * @swagger
 * /api/cart:
 *   post:
 *     summary: Menambahkan item ke cart
 *     description: Menambahkan produk baru ke cart atau menambah jumlah jika sudah ada, dengan validasi stok.
 *     tags: [Cart]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *                 description: ID produk yang akan ditambahkan
 *                 example: 507f1f77bcf86cd799439011
 *               quantity:
 *                 type: integer
 *                 description: Jumlah produk yang ditambahkan
 *                 example: 2
 *             required:
 *               - productId
 *               - quantity
 *     responses:
 *       200:
 *         description: Item berhasil ditambahkan ke cart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
 *       400:
 *         description: Validasi gagal atau stok tidak cukup
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Quantity exceeds available stock
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                         example: Quantity must be greater than 0
 *       401:
 *         description: Tidak terautentikasi
 *       404:
 *         description: Produk tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Product not found
 *       500:
 *         description: Gagal menambahkan item ke cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to add item to cart
 *                 error:
 *                   type: string
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
      const product = await Product.findById(productId);
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      let cart = await Cart.findOne({ user: req.user.id });
      if (!cart) cart = new Cart({ user: req.user.id, items: [] });

      const itemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );
      if (itemIndex > -1) {
        const newQuantity = cart.items[itemIndex].quantity + quantity;
        if (newQuantity > product.stock)
          return res
            .status(400)
            .json({ message: "Quantity exceeds available stock" });
        cart.items[itemIndex].quantity = newQuantity;
      } else {
        if (quantity > product.stock)
          return res
            .status(400)
            .json({ message: "Quantity exceeds available stock" });
        cart.items.push({ product: productId, quantity });
      }

      cart.updatedAt = new Date();
      await cart.save();
      res.json(cart);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to add item to cart", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/cart:
 *   put:
 *     summary: Memperbarui quantity suatu item di cart
 *     description: Mengubah jumlah item tertentu di cart dengan validasi stok.
 *     tags: [Cart]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *                 description: ID produk yang akan diperbarui
 *                 example: 507f1f77bcf86cd799439011
 *               quantity:
 *                 type: integer
 *                 description: Jumlah baru untuk produk
 *                 example: 3
 *             required:
 *               - productId
 *               - quantity
 *     responses:
 *       200:
 *         description: Quantity berhasil diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
 *       400:
 *         description: Validasi gagal atau stok tidak cukup
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Quantity exceeds available stock
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                         example: Quantity must be greater than 0
 *       401:
 *         description: Tidak terautentikasi
 *       404:
 *         description: Cart atau item tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Item not found in cart
 *       500:
 *         description: Gagal memperbarui cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to update cart
 *                 error:
 *                   type: string
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
      if (!cart) return res.status(404).json({ message: "Cart not found" });

      const itemIndex = cart.items.findIndex(
        (item) => item.product.toString() === productId
      );
      if (itemIndex === -1)
        return res.status(404).json({ message: "Item not found in cart" });

      const product = await Product.findById(productId);
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      if (quantity > product.stock)
        return res
          .status(400)
          .json({ message: "Quantity exceeds available stock" });

      cart.items[itemIndex].quantity = quantity;
      cart.updatedAt = new Date();
      await cart.save();
      res.json(cart);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to update cart", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/cart/{productId}:
 *   delete:
 *     summary: Menghapus item tertentu dari cart
 *     description: Menghapus item berdasarkan productId dari cart pengguna.
 *     tags: [Cart]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID produk yang akan dihapus dari cart
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Item berhasil dihapus dari cart
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Cart'
 *       401:
 *         description: Tidak terautentikasi
 *       404:
 *         description: Cart atau item tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cart not found
 *       500:
 *         description: Gagal menghapus item dari cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to remove item from cart
 *                 error:
 *                   type: string
 */
router.delete("/:productId", auth, async (req, res) => {
  try {
    const { productId } = req.params;
    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items = cart.items.filter(
      (item) => item.product.toString() !== productId
    );
    cart.updatedAt = new Date();
    await cart.save();
    res.json(cart);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to remove item from cart", error: err.message });
  }
});

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Menghapus semua item di cart (clear cart)
 *     description: Mengosongkan seluruh isi cart pengguna.
 *     tags: [Cart]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     responses:
 *       200:
 *         description: Cart berhasil dikosongkan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Cart cleared
 *       401:
 *         description: Tidak terautentikasi
 *       500:
 *         description: Gagal mengosongkan cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Failed to clear cart
 *                 error:
 *                   type: string
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
    res
      .status(500)
      .json({ message: "Failed to clear cart", error: err.message });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Cart:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID cart
 *           example: 507f1f77bcf86cd799439011
 *         user:
 *           type: string
 *           description: ID pengguna yang memiliki cart
 *           example: 507f1f77bcf86cd799439012
 *         items:
 *           type: array
 *           description: Daftar item di cart
 *           items:
 *             type: object
 *             properties:
 *               product:
 *                 type: string
 *                 description: ID produk
 *                 example: 507f1f77bcf86cd799439013
 *               quantity:
 *                 type: integer
 *                 description: Jumlah produk di cart
 *                 example: 2
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Tanggal terakhir cart diperbarui
 *           example: 2025-02-26T20:00:00Z
 *       required:
 *         - user
 *         - items
 *         - updatedAt
 */

module.exports = router;

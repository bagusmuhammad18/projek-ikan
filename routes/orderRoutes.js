const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: API untuk mengelola pesanan (orders)
 */

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Checkout dari shopping cart ke order
 *     description: Membuat order dari isi cart, mengurangi stok produk, dan menghapus cart.
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               shippingAddress:
 *                 type: string
 *                 description: Alamat pengiriman untuk pesanan
 *                 example: "Jl. Contoh No. 123, Jakarta"
 *             required:
 *               - shippingAddress
 *     responses:
 *       201:
 *         description: Order berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Cart kosong, stok tidak mencukupi, atau data tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *       401:
 *         description: Tidak terautentikasi
 *       500:
 *         description: Gagal membuat order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
router.post(
  "/",
  auth,
  [
    body("shippingAddress")
      .notEmpty()
      .withMessage("Shipping address is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const cart = await Cart.findOne({ user: req.user.id }).populate(
        "items.product"
      );
      if (!cart || cart.items.length === 0) {
        return res.status(400).json({ message: "Cart is empty" });
      }

      for (const item of cart.items) {
        if (item.quantity > item.product.stock) {
          return res
            .status(400)
            .json({ message: `Stok untuk ${item.product.name} tidak cukup.` });
        }
      }

      const orderItems = cart.items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.product.price,
      }));

      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.quantity * item.price,
        0
      );

      for (const item of cart.items) {
        const product = await Product.findById(item.product._id);
        product.stock -= item.quantity;
        await product.save();
      }

      const newOrder = new Order({
        user: req.user.id,
        items: orderItems,
        totalAmount,
        shippingAddress: req.body.shippingAddress,
      });

      await newOrder.save();
      await Cart.findOneAndDelete({ user: req.user.id });

      res.status(201).json(newOrder);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to place order", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Melihat daftar order pengguna
 *     description: Mengambil semua order milik pengguna yang terautentikasi, diurutkan dari terbaru.
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     responses:
 *       200:
 *         description: Daftar order berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Order'
 *       401:
 *         description: Tidak terautentikasi
 *       500:
 *         description: Gagal mengambil daftar order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({
      createdAt: -1,
    });
    res.json(orders);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to retrieve orders", error: err.message });
  }
});

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Melihat detail order tertentu
 *     description: Mengambil detail order berdasarkan ID, termasuk informasi produk, untuk pengguna yang terautentikasi.
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID order
 *     responses:
 *       200:
 *         description: Detail order berhasil diambil
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       401:
 *         description: Tidak terautentikasi
 *       404:
 *         description: Order tidak ditemukan atau bukan milik pengguna
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Order not found
 *       500:
 *         description: Gagal mengambil detail order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("items.product");
    if (!order || order.user.toString() !== req.user.id) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.json(order);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to retrieve order", error: err.message });
  }
});

/**
 * @swagger
 * /api/orders/{id}/status:
 *   put:
 *     summary: Update status order
 *     description: |
 *       Memperbarui status pesanan yang dilakukan oleh pengguna terautentikasi.
 *       Status yang dapat diperbarui mencakup:
 *
 *       - **Pending**: Pesanan baru dibuat dan belum dibayar.
 *       - **Paid**: Pesanan telah dibayar oleh pembeli.
 *       - **Processing**: Penjual sedang memproses pesanan yang diterima.
 *       - **Shipped**: Pesanan telah dikirim dan dalam perjalanan menuju pembeli.
 *       - **Delivered**: Pesanan telah sampai dan diterima oleh pembeli.
 *       - **Cancelled**: Pesanan dibatalkan oleh pembeli atau penjual.
 *     tags:
 *       - Orders
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID order
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Pending, Paid, Processing, Shipped, Delivered, Cancelled]
 *                 description: Status baru untuk order
 *                 example: Shipped
 *             required:
 *               - status
 *     responses:
 *       200:
 *         description: Status order berhasil diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Status tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid status
 *       401:
 *         description: Tidak terautentikasi
 *       404:
 *         description: Order tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Order not found
 *       500:
 *         description: Gagal memperbarui status order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
router.put("/:id/status", auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      "Pending",
      "Paid",
      "Processing",
      "Shipped",
      "Delivered",
      "Cancelled",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    order.status = status;
    await order.save();
    res.json(order);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to update order status", error: err.message });
  }
});

/**
 * @swagger
 * /api/orders/{id}/pay:
 *   put:
 *     summary: Simulasi pembayaran order
 *     description: Mengubah status order menjadi "Paid" sebagai simulasi pembayaran.
 *     tags: [Orders]
 *     security:
 *       - BearerAuth: []  # Memerlukan token
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID order
 *     responses:
 *       200:
 *         description: Pembayaran berhasil (simulasi)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Pembayaran berhasil (simulasi)
 *                 order:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Order sudah dibayar atau tidak valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Order sudah dibayar atau tidak bisa diproses
 *       401:
 *         description: Tidak terautentikasi
 *       404:
 *         description: Order tidak ditemukan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Order not found
 *       500:
 *         description: Gagal simulasi pembayaran
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 error:
 *                   type: string
 */
router.put("/:id/pay", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.status !== "Pending") {
      return res
        .status(400)
        .json({ message: "Order sudah dibayar atau tidak bisa diproses" });
    }

    order.status = "Paid";
    await order.save();

    res.json({ message: "Pembayaran berhasil (simulasi)", order });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to simulate payment", error: err.message });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID order
 *           example: 507f1f77bcf86cd799439011
 *         user:
 *           type: string
 *           description: ID pengguna yang membuat order
 *           example: 507f1f77bcf86cd799439012
 *         items:
 *           type: array
 *           description: Daftar item dalam order
 *           items:
 *             type: object
 *             properties:
 *               product:
 *                 type: string
 *                 description: ID produk
 *                 example: 507f1f77bcf86cd799439013
 *               quantity:
 *                 type: number
 *                 description: Jumlah item yang dipesan
 *                 example: 2
 *               price:
 *                 type: number
 *                 description: Harga per item pada saat order
 *                 example: 25000
 *         totalAmount:
 *           type: number
 *           description: Total biaya order
 *           example: 50000
 *         shippingAddress:
 *           type: string
 *           description: Alamat pengiriman order
 *           example: "Jl. Contoh No. 123, Jakarta"
 *         status:
 *           type: string
 *           enum: [Pending, Paid, Processing, Shipped, Delivered, Cancelled]
 *           description: Status order
 *           example: Pending
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Tanggal pembuatan order
 *           example: 2025-02-26T20:00:00Z
 *       required:
 *         - user
 *         - items
 *         - totalAmount
 *         - shippingAddress
 *         - status
 *         - createdAt
 */

module.exports = router;

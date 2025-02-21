const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

/**
 * POST /api/orders
 * Membuat order dari shopping cart (checkout).
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

      const orderItems = cart.items.map((item) => ({
        product: item.product._id,
        quantity: item.quantity,
        price: item.product.price, // harga produk
      }));

      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.quantity * item.price,
        0
      );

      // Buat order baru
      const newOrder = new Order({
        user: req.user.id,
        items: orderItems,
        totalAmount,
        shippingAddress: req.body.shippingAddress,
      });

      // Simpan order dan hapus cart
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
 * GET /api/orders
 * Mendapatkan daftar order milik user yang sedang login.
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
 * GET /api/orders/:id
 * Mendapatkan detail order tertentu (harus milik user).
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
 * PUT /api/orders/:id/status
 * Update status order (contoh: Admin-only).
 * Status valid: [Pending, Paid, Processing, Shipped, Delivered, Cancelled].
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
 * PUT /api/orders/:id/pay
 * Simulasi pembayaran order (hanya untuk testing).
 * Mengubah status order dari 'Pending' ke 'Paid'.
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

    // Simulasi pembayaran sukses
    order.status = "Paid";
    await order.save();

    res.json({ message: "Pembayaran berhasil (simulasi)", order });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to simulate payment", error: err.message });
  }
});

module.exports = router;

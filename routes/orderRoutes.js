const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User"); // Import User model
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");

// Helper untuk menghitung harga setelah diskon
const calculateDiscountedPrice = (price, discount) => {
  if (!discount || discount <= 0 || discount > 100) return price;
  return price - (price * discount) / 100;
};

/**
 * POST /api/orders
 * Checkout dari shopping cart ke order dengan diskon.
 */
router.post(
  "/",
  auth,
  [
    body("shippingAddress")
      .notEmpty()
      .withMessage("Shipping address is required"),
    body("paymentMethod")
      .notEmpty()
      .withMessage("Payment method is required")
      .isIn(["BCA Virtual Account", "QRIS"])
      .withMessage("Invalid payment method"),
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
          return res.status(400).json({
            message: `Stok untuk produk ${item.product.name} tidak mencukupi.`,
          });
        }
      }

      const orderItems = cart.items.map((item) => {
        const discountedPrice = calculateDiscountedPrice(
          item.product.price,
          item.product.discount
        );
        return {
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.price,
          discount: item.product.discount || 0,
          discountedPrice: discountedPrice,
        };
      });

      const totalAmount = orderItems.reduce(
        (sum, item) => sum + item.quantity * item.discountedPrice,
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
        paymentMethod: req.body.paymentMethod, // Simpan paymentMethod
      });

      await newOrder.save();

      // Add the new order to the user's orders array
      await User.findByIdAndUpdate(req.user.id, {
        $push: { orders: newOrder._id },
      });

      await Cart.findOneAndDelete({ user: req.user.id });

      res.status(201).json(newOrder);
    } catch (err) {
      res.status(500).json({
        message: "Failed to place order",
        error: err.message,
      });
    }
  }
);

/**
 * GET /api/orders
 * Mengambil daftar order pengguna yang sedang login
 */
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate("items.product", "name price images discount")
      .populate("user", "name phoneNumber")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res
      .status(500)
      .json({ message: "Failed to retrieve orders", error: err.message });
  }
});

/**
 * GET /api/orders/all
 * Mengambil semua order di database (hanya untuk admin)
 */
router.get("/all", auth, async (req, res) => {
  try {
    // Cek jika pengguna adalah admin
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat melihat semua order.",
      });
    }

    const orders = await Order.find()
      .populate("items.product", "name price images")
      .populate("user", "name phoneNumber")
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error("Error fetching all orders:", err);
    res
      .status(500)
      .json({ message: "Failed to retrieve all orders", error: err.message });
  }
});

/**
 * GET /api/orders/:id
 * Mengambil detail order tertentu dengan diskon
 */
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("items.product")
      .populate("user", "name phoneNumber");
    if (!order || order.user._id.toString() !== req.user.id) {
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
 * Update status order
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
    res.status(500).json({
      message: "Failed to update order status",
      error: err.message,
    });
  }
});

/**
 * PUT /api/orders/:id/pay
 * Simulasi pembayaran order
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
    res.status(500).json({
      message: "Failed to simulate payment",
      error: err.message,
    });
  }
});

module.exports = router;

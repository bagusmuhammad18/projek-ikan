const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const auth = require("../middleware/auth");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

// Konfigurasi Multer untuk menyimpan file di memory
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error("Hanya file gambar yang diizinkan (jpeg, png, gif, webp)"),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Batas 5MB sebelum kompresi
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

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
      throw new Error("Gambar tidak bisa dikompresi di bawah 1MB");
    }

    return compressedBuffer;
  } catch (err) {
    throw new Error("Gagal mengompresi gambar: " + err.message);
  }
}

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

const calculateDiscountedPrice = (price, discount) => {
  if (!discount || discount <= 0 || discount > 100) return price;
  return price - (price * discount) / 100;
};

/**
 * POST /api/orders
 * Checkout dari shopping cart atau pembelian langsung dengan bukti pembayaran
 */
router.post(
  "/",
  auth,
  upload.single("proofOfPayment"),
  handleMulterError,
  [
    body("shippingAddress")
      .notEmpty()
      .withMessage("Shipping address is required"),
    body("paymentMethod").notEmpty().withMessage("Payment method is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let orderItems = [];
      let totalAmount = 0;

      if (req.body.items) {
        orderItems = JSON.parse(req.body.items);
        totalAmount = parseFloat(req.body.totalAmount);

        for (const item of orderItems) {
          const product = await Product.findById(item.product);
          if (!product) {
            return res
              .status(404)
              .json({ message: `Produk ${item.product} tidak ditemukan` });
          }
          if (item.quantity > product.stock) {
            return res.status(400).json({
              message: `Stok untuk produk ${product.name} tidak mencukupi`,
            });
          }
          product.stock -= item.quantity;
          await product.save();
        }
      } else {
        const cart = await Cart.findOne({ user: req.user.id }).populate(
          "items.product"
        );
        if (!cart || cart.items.length === 0) {
          return res.status(400).json({ message: "Cart is empty" });
        }

        for (const item of cart.items) {
          if (item.quantity > item.product.stock) {
            return res.status(400).json({
              message: `Stok untuk produk ${item.product.name} tidak mencukupi`,
            });
          }
        }

        orderItems = cart.items.map((item) => {
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
            size: item.size,
            color: item.color,
          };
        });

        totalAmount = orderItems.reduce(
          (sum, item) => sum + item.quantity * item.discountedPrice,
          0
        );

        for (const item of cart.items) {
          const product = await Product.findById(item.product._id);
          product.stock -= item.quantity;
          await product.save();
        }

        await Cart.findOneAndDelete({ user: req.user.id });
      }

      let proofOfPaymentUrl = null;
      if (req.file) {
        console.log("File Uploaded:", req.file);
        const fileId = await uploadToUploadcare(
          req.file.buffer,
          req.file.originalname
        );
        proofOfPaymentUrl = `https://ucarecdn.com/${fileId}/`;
        console.log("Proof of Payment URL:", proofOfPaymentUrl);
      } else {
        console.log("No file uploaded in request");
      }

      const newOrder = new Order({
        user: req.user.id,
        items: orderItems,
        totalAmount,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: req.body.paymentMethod,
        proofOfPayment: proofOfPaymentUrl, // Pastikan ini ada
      });

      await newOrder.save();
      console.log("New Order Saved:", newOrder.toObject()); // Gunakan toObject() untuk log lengkap

      await User.findByIdAndUpdate(req.user.id, {
        $push: { orders: newOrder._id },
      });

      res.status(201).json(newOrder);
    } catch (err) {
      console.error("Checkout error:", err);
      res.status(500).json({
        message: "Failed to place order",
        error: err.message,
      });
    }
  }
);

/**
 * GET /api/orders
 * Mengambil semua order untuk pengguna yang login
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
 * Mengambil semua order (hanya untuk admin)
 */
router.get("/all", auth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Akses ditolak. Hanya admin yang dapat melihat semua order.",
      });
    }
    const orders = await Order.find()
      .populate("items.product", "name price images discount")
      .populate("user", "name phoneNumber")
      .sort({ createdAt: -1 });
    res.json(orders);
    console.log("Orders Fetched:", orders);
  } catch (err) {
    console.error("Error fetching all orders:", err);
    res
      .status(500)
      .json({ message: "Failed to retrieve all orders", error: err.message });
  }
});

/**
 * GET /api/orders/:id
 * Mengambil detail order berdasarkan ID (hanya untuk pengguna terkait)
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
 * Memperbarui status order (hanya untuk admin)
 */
router.put(
  "/:id/status",
  auth,
  [body("status").notEmpty().withMessage("Status is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (req.user.role !== "admin") {
        return res
          .status(403)
          .json({
            message:
              "Akses ditolak. Hanya admin yang dapat mengubah status order.",
          });
      }

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

      const order = await Order.findById(req.params.id).populate(
        "items.product"
      );
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.status === "Pending") {
        if (status === "Paid") {
          // Stok sudah berkurang saat dibuat, tidak perlu kurangi lagi
        } else if (status === "Cancelled") {
          // Kembalikan stok saat ditolak
          for (const item of order.items) {
            const product = item.product;
            product.stock += item.quantity;
            await product.save();
          }
        } else {
          return res
            .status(400)
            .json({
              message: "Order Pending hanya bisa diubah ke Paid atau Cancelled",
            });
        }
      } else {
        return res
          .status(400)
          .json({
            message:
              "Hanya order dengan status Pending yang bisa diubah di sini",
          });
      }

      order.status = status;
      await order.save();
      res.json(order);
    } catch (err) {
      console.error("Error updating order status:", err);
      res
        .status(500)
        .json({ message: "Failed to update order status", error: err.message });
    }
  }
);

/**
 * PUT /api/orders/:id/pay (Hapus atau biarkan untuk simulasi, tidak diperlukan di sini)
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

module.exports = router;

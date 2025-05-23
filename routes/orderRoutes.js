// orderRoutes.js
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
const FormDataNode = require("form-data"); // Menggunakan alias agar tidak bentrok dengan FormData global browser
const sharp = require("sharp");

// ... (konfigurasi multer, parseJSONFields, compressImage, uploadToUploadcare, calculateDiscountedPrice tetap sama) ...
// Konfigurasi Multer untuk upload file
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
  limits: { fileSize: 0.5 * 1024 * 1024 }, // 0.5 MB
});

// Middleware untuk menangani error Multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "Ukuran file terlalu besar. Maksimum 0.5MB." });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Middleware untuk parsing field JSON dari form-data
const parseJSONFields = (req, res, next) => {
  if (
    req.body.shippingAddress &&
    typeof req.body.shippingAddress === "string"
  ) {
    try {
      req.body.shippingAddress = JSON.parse(req.body.shippingAddress);
    } catch (err) {
      return res
        .status(400)
        .json({ message: "Format shippingAddress tidak valid" });
    }
  }
  if (req.body.items && typeof req.body.items === "string") {
    try {
      req.body.items = JSON.parse(req.body.items);
    } catch (err) {
      return res.status(400).json({ message: "Format items tidak valid" });
    }
  }
  next();
};

// Fungsi untuk kompresi gambar
async function compressImage(fileBuffer) {
  try {
    let quality = 80;
    let compressedBuffer = await sharp(fileBuffer)
      .jpeg({ quality, progressive: true, optimizeScans: true })
      .toBuffer();
    let fileSize = compressedBuffer.length;

    while (fileSize > 500 * 1024 && quality > 10) {
      // Target 500KB
      quality -= 10;
      compressedBuffer = await sharp(fileBuffer)
        .jpeg({ quality, progressive: true, optimizeScans: true })
        .toBuffer();
      fileSize = compressedBuffer.length;
    }

    if (fileSize > 500 * 1024) {
      const metadata = await sharp(compressedBuffer).metadata();
      if (metadata.width && metadata.width > 1200) {
        compressedBuffer = await sharp(compressedBuffer)
          .resize({ width: 1200 })
          .jpeg({ quality: Math.max(quality, 40) })
          .toBuffer();
      }
    }
    return compressedBuffer;
  } catch (err) {
    console.error("Gagal mengompresi gambar:", err);
    throw new Error("Gagal mengompresi gambar: " + err.message);
  }
}

// Fungsi untuk upload ke Uploadcare
async function uploadToUploadcare(fileBuffer, fileName) {
  const compressedBuffer = await compressImage(fileBuffer);
  const formData = new FormDataNode(); // Gunakan alias FormDataNode
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

// Fungsi untuk menghitung harga diskon
const calculateDiscountedPrice = (price, discount) => {
  if (!discount || discount <= 0 || discount > 100) return price;
  return price - (price * discount) / 100;
};

// POST /api/orders - Membuat order baru
router.post(
  "/",
  auth,
  upload.single("proofOfPayment"),
  handleMulterError,
  parseJSONFields,
  [
    body("shippingAddress.recipientName")
      .notEmpty()
      .withMessage("Nama penerima wajib diisi"),
    body("shippingAddress.phoneNumber")
      .notEmpty()
      .withMessage("Nomor telepon wajib diisi"),
    body("shippingAddress.streetAddress")
      .notEmpty()
      .withMessage("Alamat jalan wajib diisi"),
    body("shippingAddress.city").notEmpty().withMessage("Kota wajib diisi"),
    body("shippingAddress.province")
      .notEmpty()
      .withMessage("Provinsi wajib diisi"),
    body("shippingAddress.postalCode")
      .notEmpty()
      .withMessage("Kode pos wajib diisi"),
    body("paymentMethod")
      .notEmpty()
      .withMessage("Metode pembayaran wajib diisi"),
    body("shippingCost")
      .optional()
      .isNumeric()
      .withMessage("Ongkos kirim harus berupa angka"),
    body("items.*.satuan")
      .if(body("items").exists({ checkFalsy: true }))
      .notEmpty()
      .withMessage("Satuan item wajib diisi")
      .isIn(["kg", "ekor"])
      .withMessage("Satuan item harus 'kg' atau 'ekor'"),
    body("source") // Validasi untuk 'source'
      .notEmpty()
      .withMessage("Sumber order (source) wajib diisi.")
      .isIn(["cart", "buyNow"])
      .withMessage("Nilai source tidak valid (harus 'cart' atau 'buyNow')."),
  ],
  async (req, res) => {
    console.log("----------------------------------------------------");
    console.log(
      "RECEIVED AT POST /api/orders - Timestamp:",
      new Date().toISOString()
    );
    console.log("Full req.body:", JSON.stringify(req.body, null, 2)); // Log seluruh body
    console.log("req.body.source received:", req.body.source); // Fokus pada source
    console.log("req.user.id (for cart deletion):", req.user.id);
    console.log("----------------------------------------------------");
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const {
        items: clientOrderItems,
        source,
        shippingCost: clientShippingCost,
      } = req.body; // Ambil 'source' dari req.body
      let orderItems = [];
      let calculatedTotalAmount = 0;
      const shippingCost = parseFloat(clientShippingCost) || 0;

      // Validasi dan pemrosesan item dari clientOrderItems (yang selalu ada karena frontend mengirimkannya)
      if (
        !clientOrderItems ||
        !Array.isArray(clientOrderItems) ||
        clientOrderItems.length === 0
      ) {
        return res
          .status(400)
          .json({ message: "Data item tidak lengkap atau kosong." });
      }

      for (const item of clientOrderItems) {
        if (
          !item.product ||
          !item.quantity ||
          !item.jenis ||
          !item.size ||
          !item.satuan
        ) {
          return res.status(400).json({ message: "Data item tidak lengkap." });
        }
        const product = await Product.findById(item.product);
        if (!product) {
          return res
            .status(404)
            .json({ message: `Produk ${item.product} tidak ditemukan` });
        }

        const stockEntry = product.stocks.find(
          (s) =>
            s.jenis?.toLowerCase() === item.jenis?.toLowerCase() &&
            s.size?.toLowerCase() === item.size?.toLowerCase() &&
            s.satuan === item.satuan
        );

        if (!stockEntry) {
          return res.status(400).json({
            message: `Stok untuk produk ${product.name} jenis ${item.jenis}, ukuran ${item.size}, satuan ${item.satuan} tidak ditemukan`,
          });
        }
        if (item.quantity > stockEntry.stock) {
          return res.status(400).json({
            message: `Stok untuk produk ${product.name} jenis ${item.jenis} ukuran ${item.size} satuan ${item.satuan} tidak mencukupi. Stok tersedia: ${stockEntry.stock}`,
          });
        }

        const price = stockEntry.price;
        const discount = stockEntry.discount || 0; // Pastikan discount ada
        const discountedPrice = calculateDiscountedPrice(price, discount);

        orderItems.push({
          product: product._id,
          quantity: item.quantity,
          price: price, // Simpan harga asli per item
          discount: discount, // Simpan diskon per item
          discountedPrice: discountedPrice, // Simpan harga setelah diskon per item
          jenis: item.jenis,
          size: item.size,
          satuan: item.satuan,
        });
        calculatedTotalAmount += item.quantity * discountedPrice;
      }

      // Mengurangi stok setelah semua item divalidasi
      for (const item of orderItems) {
        const product = await Product.findById(item.product);
        const stockEntry = product.stocks.find(
          (s) =>
            s.jenis?.toLowerCase() === item.jenis?.toLowerCase() &&
            s.size?.toLowerCase() === item.size?.toLowerCase() &&
            s.satuan === item.satuan
        );
        if (stockEntry) {
          stockEntry.stock -= item.quantity;
          await product.save();
        }
      }

      let proofOfPaymentUrl = null;
      if (req.file) {
        const fileId = await uploadToUploadcare(
          req.file.buffer,
          req.file.originalname
        );
        proofOfPaymentUrl = `https://ucarecdn.com/${fileId}/`;
      }

      const finalTotalAmount = calculatedTotalAmount + shippingCost;

      const newOrder = new Order({
        user: req.user.id,
        items: orderItems,
        totalAmount: finalTotalAmount,
        shippingAddress: req.body.shippingAddress,
        shippingCost: shippingCost,
        paymentMethod: req.body.paymentMethod,
        proofOfPayment: proofOfPaymentUrl,
        orderSource: source, // Simpan sumber order jika perlu dilacak
      });

      await newOrder.save();

      await User.findByIdAndUpdate(req.user.id, {
        $push: { orders: newOrder._id },
      });

      // PERUBAHAN DI SINI: Hapus keranjang HANYA jika order berasal dari 'cart'
      if (source === "cart") {
        const cartDeletionResult = await Cart.findOneAndDelete({
          user: req.user.id,
        });
        if (cartDeletionResult) {
          console.log(
            `Cart for user ${req.user.id} deleted successfully because source was 'cart'.`
          );
        } else {
          console.log(
            `Cart for user ${req.user.id} not found or already deleted (source was 'cart').`
          );
        }
      } else {
        console.log(
          `Cart for user ${req.user.id} not deleted, source was '${source}'.`
        );
      }

      res.status(201).json(newOrder);
    } catch (err) {
      console.error("Checkout error:", err);
      res
        .status(500)
        .json({ message: "Gagal membuat pesanan", error: err.message });
    }
  }
);

// ... (GET /api/orders, GET /api/orders/all, GET /api/orders/:id, PUT /api/orders/:id/status, PUT /api/orders/:id/pay tetap sama) ...
// GET /api/orders - Mendapatkan semua order milik user yang login
router.get("/", auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .populate({
        path: "items.product",
        select: "name images", // Ambil hanya nama dan gambar produk
      })
      .populate("user", "name phoneNumber") // Ambil nama dan no telp user
      .sort({ createdAt: -1 })
      .lean(); // .lean() untuk performa lebih baik jika tidak perlu method Mongoose

    const transformedOrders = orders.map((order) => ({
      ...order,
      orderDate: order.createdAt,
    }));

    res.json(transformedOrders);
  } catch (err) {
    console.error("Error fetching user orders:", err);
    res
      .status(500)
      .json({ message: "Gagal mengambil daftar pesanan", error: err.message });
  }
});

// GET /api/orders/all - Mendapatkan semua order (untuk admin) atau order user
router.get("/all", auth, async (req, res) => {
  try {
    let query = {};
    if (req.user.role !== "admin") {
      query.user = req.user.id;
    }

    const orders = await Order.find(query)
      .populate({
        path: "items.product",
        select: "name images",
      })
      .populate("user", "name phoneNumber")
      .sort({ createdAt: -1 })
      .lean();

    const transformedOrders = orders.map((order) => ({
      ...order,
      orderDate: order.createdAt,
    }));

    res.json(transformedOrders);
  } catch (err) {
    console.error("Error fetching all orders:", err);
    res
      .status(500)
      .json({ message: "Gagal mengambil daftar pesanan", error: err.message });
  }
});

// GET /api/orders/:id - Mendapatkan detail order berdasarkan ID
router.get("/:id", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate({
        path: "items.product",
        select: "name images",
      })
      .populate("user", "name phoneNumber")
      .lean();

    if (!order) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    }

    if (
      order.user._id.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Akses ditolak untuk melihat pesanan ini" });
    }

    const transformedOrder = {
      ...order,
      orderDate: order.createdAt,
    };

    res.json(transformedOrder);
  } catch (err) {
    console.error("Error fetching order by ID:", err);
    if (err.kind === "ObjectId") {
      return res.status(400).json({ message: "Format ID pesanan tidak valid" });
    }
    res
      .status(500)
      .json({ message: "Gagal mengambil detail pesanan", error: err.message });
  }
});

// PUT /api/orders/:id/status - Mengupdate status order (hanya admin)
router.put(
  "/:id/status",
  auth,
  upload.single("codProof"),
  handleMulterError,
  [
    body("status")
      .notEmpty()
      .withMessage("Status wajib diisi")
      .isIn([
        "Pending",
        "Paid",
        "Processing",
        "Shipped",
        "Delivered",
        "Cancelled",
      ])
      .withMessage("Status tidak valid"),
    body("trackingNumber")
      .optional({ checkFalsy: true })
      .isString()
      .withMessage("Nomor resi harus string"),
    body("shippingMethod")
      .optional({ checkFalsy: true })
      .isString()
      .withMessage("Metode pengiriman harus string"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({
          message:
            "Akses ditolak. Hanya admin yang dapat mengubah status pesanan.",
        });
      }

      const { status, trackingNumber, shippingMethod } = req.body;
      const order = await Order.findById(req.params.id);

      if (!order) {
        return res.status(404).json({ message: "Pesanan tidak ditemukan" });
      }

      const oldStatus = order.status;

      if (
        (oldStatus === "Cancelled" || oldStatus === "Delivered") &&
        oldStatus !== status
      ) {
        return res.status(400).json({
          message: `Pesanan yang sudah ${oldStatus} tidak bisa diubah statusnya.`,
        });
      }

      order.status = status;

      if (trackingNumber) {
        order.trackingNumber = trackingNumber;
      }

      if (shippingMethod) {
        order.shippingMethod = shippingMethod;
      }

      if (status === "Shipped" && order.paymentMethod.toLowerCase() === "cod") {
        if (!req.file && !order.codProof) {
          return res.status(400).json({
            message: "Bukti COD (codProof) diperlukan untuk pengiriman COD.",
          });
        }
        if (req.file) {
          const fileId = await uploadToUploadcare(
            req.file.buffer,
            req.file.originalname
          );
          order.codProof = `https://ucarecdn.com/${fileId}/`;
        }
        order.shippingMethod = "COD";
      } else if (
        status === "Shipped" &&
        order.paymentMethod.toLowerCase() !== "cod"
      ) {
        if (shippingMethod && shippingMethod.toLowerCase() !== "cod") {
          order.shippingMethod = shippingMethod;
        } else if (!order.shippingMethod) {
          order.shippingMethod = "courier";
        }
      }

      if (status === "Cancelled" && oldStatus !== "Cancelled") {
        for (const item of order.items) {
          const product = await Product.findById(item.product);
          if (product) {
            const stockEntry = product.stocks.find(
              (s) =>
                s.jenis?.toLowerCase() === item.jenis?.toLowerCase() &&
                s.size?.toLowerCase() === item.size?.toLowerCase() &&
                s.satuan === item.satuan
            );
            if (stockEntry) {
              stockEntry.stock += item.quantity;
              await product.save();
            }
          }
        }
      }

      await order.save();
      const updatedOrder = await Order.findById(order._id)
        .populate({ path: "items.product", select: "name images" })
        .populate("user", "name phoneNumber")
        .lean();
      res.json({ ...updatedOrder, orderDate: updatedOrder.createdAt });
    } catch (err) {
      console.error("Error updating order status:", err);
      if (err.kind === "ObjectId") {
        return res
          .status(400)
          .json({ message: "Format ID pesanan tidak valid" });
      }
      res.status(500).json({
        message: "Gagal memperbarui status pesanan",
        error: err.message,
      });
    }
  }
);

// PUT /api/orders/:id/pay - Simulasi pembayaran
router.put("/:id/pay", auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Pesanan tidak ditemukan" });
    }

    if (order.user.toString() !== req.user.id && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Akses ditolak untuk membayar pesanan ini." });
    }

    if (order.status !== "Pending") {
      return res.status(400).json({
        message: `Pesanan dengan status '${order.status}' tidak dapat diproses untuk pembayaran.`,
      });
    }

    order.status = "Paid";
    if (req.body.proofOfPaymentUrl) {
      order.proofOfPayment = req.body.proofOfPaymentUrl;
    }

    await order.save();
    const paidOrder = await Order.findById(order._id)
      .populate({ path: "items.product", select: "name images" })
      .populate("user", "name phoneNumber")
      .lean();
    res.json({
      message: "Pembayaran berhasil (simulasi)",
      order: { ...paidOrder, orderDate: paidOrder.createdAt },
    });
  } catch (err) {
    console.error("Error simulating payment:", err);
    if (err.kind === "ObjectId") {
      return res.status(400).json({ message: "Format ID pesanan tidak valid" });
    }
    res
      .status(500)
      .json({ message: "Gagal memproses pembayaran", error: err.message });
  }
});

module.exports = router;

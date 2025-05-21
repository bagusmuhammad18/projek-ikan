const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const auth = require("../middleware/auth"); // Pastikan path middleware auth benar
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

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

// Fungsi untuk menghitung harga diskon
const calculateDiscountedPrice = (price, discount) => {
  if (!discount || discount <= 0 || discount > 100) return price;
  return price - (price * discount) / 100;
};

// === ROUTES ===

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
    // Validasi satuan pada items, hanya jika 'items' ada (untuk 'buy now')
    body("items.*.satuan")
      .if(body("items").exists({ checkFalsy: true })) // Hanya validasi jika items ada dan bukan array kosong
      .notEmpty()
      .withMessage("Satuan item wajib diisi")
      .isIn(["kg", "ekor"])
      .withMessage("Satuan item harus 'kg' atau 'ekor'"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      let orderItems = [];
      let calculatedTotalAmount = 0; // Total dari item saja, sebelum ongkir
      const shippingCost = parseFloat(req.body.shippingCost) || 0;

      // Logika untuk 'Buy Now' (jika req.body.items ada)
      if (
        req.body.items &&
        Array.isArray(req.body.items) &&
        req.body.items.length > 0
      ) {
        for (const item of req.body.items) {
          if (
            !item.product ||
            !item.quantity ||
            !item.jenis ||
            !item.size ||
            !item.satuan
          ) {
            return res
              .status(400)
              .json({ message: "Data item tidak lengkap untuk 'Buy Now'." });
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
          const discount = stockEntry.discount || 0;
          const discountedPrice = calculateDiscountedPrice(price, discount);

          orderItems.push({
            product: product._id,
            quantity: item.quantity,
            price: price,
            discount: discount,
            discountedPrice: discountedPrice,
            jenis: item.jenis,
            size: item.size,
            satuan: item.satuan,
          });
          calculatedTotalAmount += item.quantity * discountedPrice;
        }
      } else {
        // Logika untuk checkout dari Cart
        const cart = await Cart.findOne({ user: req.user.id }).populate(
          "items.product"
        );
        if (!cart || cart.items.length === 0) {
          return res.status(400).json({ message: "Keranjang belanja kosong" });
        }

        for (const cartItem of cart.items) {
          const product = await Product.findById(cartItem.product._id); // Ambil data produk terbaru
          if (!product) {
            return res
              .status(404)
              .json({
                message: `Produk dengan ID ${cartItem.product._id} di keranjang tidak ditemukan.`,
              });
          }
          const stockEntry = product.stocks.find(
            (s) =>
              s.jenis?.toLowerCase() === cartItem.jenis?.toLowerCase() &&
              s.size?.toLowerCase() === cartItem.size?.toLowerCase() &&
              s.satuan === cartItem.satuan
          );
          if (!stockEntry) {
            return res.status(400).json({
              message: `Stok untuk produk ${product.name} jenis ${cartItem.jenis}, ukuran ${cartItem.size}, satuan ${cartItem.satuan} tidak ditemukan di keranjang.`,
            });
          }
          if (cartItem.quantity > stockEntry.stock) {
            return res.status(400).json({
              message: `Stok untuk produk ${product.name} jenis ${cartItem.jenis} ukuran ${cartItem.size} satuan ${cartItem.satuan} tidak mencukupi. Stok tersedia: ${stockEntry.stock}`,
            });
          }

          const price = stockEntry.price;
          const discount = stockEntry.discount || 0;
          const discountedPrice = calculateDiscountedPrice(price, discount);

          orderItems.push({
            product: product._id,
            quantity: cartItem.quantity,
            price: price,
            discount: discount,
            discountedPrice: discountedPrice,
            jenis: cartItem.jenis,
            size: cartItem.size,
            satuan: cartItem.satuan,
          });
          calculatedTotalAmount += cartItem.quantity * discountedPrice;
        }
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

      // Upload bukti pembayaran jika ada
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
        // status default 'Pending' dari schema
      });

      await newOrder.save();

      // Tambahkan order ke daftar order user
      await User.findByIdAndUpdate(req.user.id, {
        $push: { orders: newOrder._id },
      });

      // Hapus keranjang jika order berasal dari keranjang
      if (
        !(
          req.body.items &&
          Array.isArray(req.body.items) &&
          req.body.items.length > 0
        )
      ) {
        await Cart.findOneAndDelete({ user: req.user.id });
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

    // Data item (jenis, size, satuan) sudah ada di order.items dari saat pembuatan order
    const transformedOrders = orders.map((order) => ({
      ...order,
      orderDate: order.createdAt, // Tambahkan orderDate untuk frontend jika perlu
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
      query.user = req.user.id; // Jika bukan admin, hanya order milik user
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

    // Otorisasi: user hanya bisa melihat ordernya, admin bisa melihat semua
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
  upload.single("codProof"), // File untuk bukti COD jika diperlukan
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
        return res
          .status(403)
          .json({
            message:
              "Akses ditolak. Hanya admin yang dapat mengubah status pesanan.",
          });
      }

      const { status, trackingNumber, shippingMethod } = req.body;
      const order = await Order.findById(req.params.id); // Tidak pakai .lean() karena akan di-save

      if (!order) {
        return res.status(404).json({ message: "Pesanan tidak ditemukan" });
      }

      const oldStatus = order.status;

      if (
        (oldStatus === "Cancelled" || oldStatus === "Delivered") &&
        oldStatus !== status
      ) {
        return res
          .status(400)
          .json({
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

      // Logika untuk bukti COD
      if (status === "Shipped" && order.paymentMethod.toLowerCase() === "cod") {
        if (!req.file && !order.codProof) {
          // Jika tidak ada file baru DAN tidak ada bukti lama
          return res
            .status(400)
            .json({
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
        order.shippingMethod = "COD"; // Pastikan shippingMethod di set COD
      } else if (
        status === "Shipped" &&
        order.paymentMethod.toLowerCase() !== "cod"
      ) {
        if (shippingMethod && shippingMethod.toLowerCase() !== "cod") {
          order.shippingMethod = shippingMethod;
        } else if (!order.shippingMethod) {
          order.shippingMethod = "courier"; // default ke kurir jika bukan COD
        }
      }

      // Pengembalian stok jika order dibatalkan dan sebelumnya belum dibatalkan
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
      // Populate lagi untuk response yang lengkap
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
      res
        .status(500)
        .json({
          message: "Gagal memperbarui status pesanan",
          error: err.message,
        });
    }
  }
);

// PUT /api/orders/:id/pay - Simulasi pembayaran (bisa dikembangkan lebih lanjut)
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
      return res
        .status(400)
        .json({
          message: `Pesanan dengan status '${order.status}' tidak dapat diproses untuk pembayaran.`,
        });
    }

    // Di dunia nyata, di sini akan ada integrasi dengan payment gateway
    // Untuk simulasi, kita hanya update status dan mungkin bukti bayar jika ada
    order.status = "Paid";
    // Jika ada proofOfPayment dikirim di body (misal setelah transfer manual)
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

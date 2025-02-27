const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const { body, validationResult } = require("express-validator");
const checkAdmin = require("../middleware/checkAdmin");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const sharp = require("sharp");

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: API untuk mengelola produk ikan
 */

// Konfigurasi Multer untuk menyimpan file di memory dengan filter gambar
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  allowedTypes.includes(file.mimetype)
    ? cb(null, true)
    : cb(new Error("Hanya file gambar yang diizinkan"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Helper untuk kompresi dan upload gambar
async function compressImage(fileBuffer) {
  let quality = 80;
  let compressedBuffer = fileBuffer;
  let fileSize = fileBuffer.length;

  while (fileSize > 1048576 && quality > 10) {
    compressedBuffer = await sharp(fileBuffer).jpeg({ quality }).toBuffer();
    fileSize = compressedBuffer.length;
    quality -= 10;
  }
  if (fileSize > 1048576) throw new Error("Gambar terlalu besar");
  return compressedBuffer;
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

/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Dapatkan semua produk yang dipublikasikan
 *     tags: [Products]
 *     security: []  # Tidak memerlukan autentikasi
 *     responses:
 *       200:
 *         description: Berhasil mendapatkan daftar produk
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Product'
 *       500:
 *         description: Kesalahan server
 */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find({ isPublished: true });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     summary: Dapatkan detail produk berdasarkan ID (admin only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []  # Memerlukan token dan role admin
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID produk
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Berhasil mendapatkan detail produk
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       401:
 *         description: Tidak terautentikasi (token hilang atau tidak valid)
 *       403:
 *         description: Bukan admin
 *       404:
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Kesalahan server
 */
router.get("/:id", checkAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * @swagger
 * /api/products:
 *   post:
 *     summary: Buat produk baru (admin only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []  # Memerlukan token dan role admin
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nama produk
 *                 example: Ikan Nila
 *               description:
 *                 type: string
 *                 description: Deskripsi produk
 *                 example: Ikan nila segar dari tambak lokal
 *               sku:
 *                 type: string
 *                 description: Kode unik produk (SKU)
 *                 example: NILA-001
 *               price:
 *                 type: number
 *                 description: Harga produk
 *                 example: 25000
 *               stock:
 *                 type: number
 *                 description: Jumlah stok
 *                 example: 100
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Gambar produk (maks 5 file)
 *               discount:
 *                 type: number
 *                 description: Diskon produk (opsional, default 0)
 *                 example: 10
 *               weight:
 *                 type: number
 *                 description: Berat produk dalam gram (opsional)
 *                 example: 500
 *               dimensions.height:
 *                 type: number
 *                 description: Tinggi produk dalam cm (opsional)
 *                 example: 10
 *               dimensions.length:
 *                 type: number
 *                 description: Panjang produk dalam cm (opsional)
 *                 example: 20
 *               dimensions.width:
 *                 type: number
 *                 description: Lebar produk dalam cm (opsional)
 *                 example: 15
 *               type.color:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Warna produk (opsional)
 *                 example: ["Merah", "Biru"]
 *               type.size:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Ukuran produk (opsional)
 *                 example: ["Kecil", "Besar"]
 *               isPublished:
 *                 type: boolean
 *                 description: Status publikasi produk (opsional, default false)
 *                 example: false
 *             required:
 *               - name
 *               - description
 *               - sku
 *               - price
 *               - stock
 *     responses:
 *       201:
 *         description: Produk berhasil dibuat
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       400:
 *         description: Data tidak valid atau error pada upload gambar
 *       401:
 *         description: Tidak terautentikasi (token hilang atau tidak valid)
 *       403:
 *         description: Bukan admin
 *       500:
 *         description: Kesalahan server
 */
router.post(
  "/",
  checkAdmin,
  upload.array("images", 5),
  handleMulterError,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    try {
      let imageUrls = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const fileId = await uploadToUploadcare(
            file.buffer,
            file.originalname
          );
          imageUrls.push(`https://ucarecdn.com/${fileId}/`);
        }
      }

      const newProduct = new Product({
        ...req.body,
        seller: req.user.id,
        images: imageUrls,
        isPublished: req.body.isPublished || false,
      });

      await newProduct.save();
      res.status(201).json(newProduct);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to create product", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   put:
 *     summary: Perbarui produk (admin only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []  # Memerlukan token dan role admin
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID produk
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nama produk
 *                 example: Ikan Nila
 *               description:
 *                 type: string
 *                 description: Deskripsi produk
 *                 example: Ikan nila segar dari tambak lokal
 *               sku:
 *                 type: string
 *                 description: Kode unik produk (SKU)
 *                 example: NILA-001
 *               price:
 *                 type: number
 *                 description: Harga produk
 *                 example: 25000
 *               stock:
 *                 type: number
 *                 description: Jumlah stok
 *                 example: 100
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Gambar produk baru (opsional)
 *               discount:
 *                 type: number
 *                 description: Diskon produk (opsional)
 *                 example: 15
 *               weight:
 *                 type: number
 *                 description: Berat produk dalam gram (opsional)
 *                 example: 600
 *               dimensions.height:
 *                 type: number
 *                 description: Tinggi produk dalam cm (opsional)
 *                 example: 12
 *               dimensions.length:
 *                 type: number
 *                 description: Panjang produk dalam cm (opsional)
 *                 example: 22
 *               dimensions.width:
 *                 type: number
 *                 description: Lebar produk dalam cm (opsional)
 *                 example: 16
 *               type.color:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Warna produk (opsional)
 *                 example: ["Hijau", "Kuning"]
 *               type.size:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Ukuran produk (opsional)
 *                 example: ["Sedang", "Besar"]
 *               isPublished:
 *                 type: boolean
 *                 description: Status publikasi produk (opsional)
 *                 example: true
 *             required:
 *               - name
 *               - description
 *               - sku
 *               - price
 *               - stock
 *     responses:
 *       200:
 *         description: Produk berhasil diperbarui
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Product'
 *       401:
 *         description: Tidak terautentikasi (token hilang atau tidak valid)
 *       403:
 *         description: Bukan admin
 *       404:
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Kesalahan server
 */
router.put(
  "/:id",
  checkAdmin,
  upload.array("images"),
  handleMulterError,
  async (req, res) => {
    try {
      const product = await Product.findById(req.params.id);
      if (!product)
        return res.status(404).json({ message: "Product not found" });

      const updatedProduct = await Product.findByIdAndUpdate(
        req.params.id,
        { ...req.body },
        { new: true }
      );
      res.json(updatedProduct);
    } catch (err) {
      res
        .status(500)
        .json({ message: "Failed to update product", error: err.message });
    }
  }
);

/**
 * @swagger
 * /api/products/{id}:
 *   delete:
 *     summary: Hapus produk (admin only)
 *     tags: [Products]
 *     security:
 *       - BearerAuth: []  # Memerlukan token dan role admin
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID produk
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Produk berhasil dihapus
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Product deleted
 *       401:
 *         description: Tidak terautentikasi (token hilang atau tidak valid)
 *       403:
 *         description: Bukan admin
 *       404:
 *         description: Produk tidak ditemukan
 *       500:
 *         description: Kesalahan server
 */
router.delete("/:id", checkAdmin, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    await product.deleteOne();
    res.json({ message: "Product deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to delete product", error: err.message });
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: ID produk
 *         sku:
 *           type: string
 *           description: Kode unik produk (SKU)
 *           example: NILA-001
 *         name:
 *           type: string
 *           description: Nama produk
 *           example: Ikan Nila
 *         description:
 *           type: string
 *           description: Deskripsi produk
 *           example: Ikan nila segar dari tambak lokal
 *         price:
 *           type: number
 *           description: Harga produk
 *           example: 25000
 *         seller:
 *           type: string
 *           description: ID penjual (referensi ke User)
 *           example: 507f1f77bcf86cd799439011
 *         stock:
 *           type: number
 *           description: Jumlah stok
 *           example: 100
 *         images:
 *           type: array
 *           items:
 *             type: string
 *           description: URL gambar produk
 *           example: ["https://ucarecdn.com/12345/"]
 *         discount:
 *           type: number
 *           description: Diskon produk
 *           example: 10
 *         weight:
 *           type: number
 *           description: Berat produk dalam gram
 *           example: 500
 *         dimensions:
 *           type: object
 *           properties:
 *             height:
 *               type: number
 *               description: Tinggi produk dalam cm
 *               example: 10
 *             length:
 *               type: number
 *               description: Panjang produk dalam cm
 *               example: 20
 *             width:
 *               type: number
 *               description: Lebar produk dalam cm
 *               example: 15
 *         type:
 *           type: object
 *           properties:
 *             color:
 *               type: array
 *               items:
 *                 type: string
 *               description: Warna produk
 *               example: ["Merah", "Biru"]
 *             size:
 *               type: array
 *               items:
 *                 type: string
 *               description: Ukuran produk
 *               example: ["Kecil", "Besar"]
 *         isPublished:
 *           type: boolean
 *           description: Status publikasi produk
 *           example: false
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Tanggal pembuatan produk
 *           example: 2025-02-26T20:00:00Z
 *       required:
 *         - sku
 *         - name
 *         - description
 *         - price
 *         - seller
 *         - stock
 */

module.exports = router;

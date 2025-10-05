const mongoose = require("mongoose");

const stockHistorySchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true, // Menambahkan index untuk query yang lebih cepat
    },
    // Mencatat variasi produk yang stoknya berubah
    jenis: {
      type: String,
      required: true,
    },
    size: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["penambahan", "penjualan", "koreksi"], // Tipe perubahan stok
    },
    // Jumlah stok yang berubah. Positif untuk penambahan, negatif untuk penjualan/koreksi.
    quantityChange: {
      type: Number,
      required: true,
    },
    // Stok variasi ini SETELAH perubahan terjadi
    stockAfterChange: {
      type: Number,
      required: true,
    },
    note: {
      type: String,
      default: "",
    },
    // Jika perubahan stok berasal dari pesanan, simpan ID pesanan
    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    // Jika perubahan dilakukan oleh admin, simpan ID admin
    userActionBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true } // `createdAt` akan menjadi tanggal transaksi
);

module.exports = mongoose.model("StockHistory", stockHistorySchema);

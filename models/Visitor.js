// models/Visitor.js
const mongoose = require("mongoose");

const visitorSchema = new mongoose.Schema({
  ipAddress: {
    type: String,
    // required: true, // Bisa opsional jika sulit didapatkan atau ada isu privasi
  },
  userAgent: {
    type: String,
  },
  path: {
    type: String, // URL yang dikunjungi
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true, // Indeks untuk query berdasarkan waktu yang lebih cepat
  },
  // Anda bisa menambahkan field lain jika diperlukan, misal: userId jika user login
});

// Opsi untuk mencegah duplikasi kunjungan dalam periode waktu singkat (misal, per IP per menit)
// visitorSchema.index({ ipAddress: 1, timestamp: 1 }, { unique: true }); // Ini bisa kompleks, pertimbangkan
// kasus penggunaan dan potensi error duplikasi.

const Visitor = mongoose.model("Visitor", visitorSchema);

module.exports = Visitor;

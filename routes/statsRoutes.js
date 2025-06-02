// routes/statsRoutes.js
const express = require("express");
const router = express.Router();
const statsController = require("../controllers/statsController");
// const { authenticate, checkAdmin } = require("../middleware/auth"); // Komentari jika tidak dipakai di sini
const Visitor = require("../models/Visitor"); // <<==== IMPORT MODEL VISITOR

// Endpoint untuk mengambil statistik pengunjung (tetap ada)
router.get("/visitors", statsController.getVisitorStats);

// <<==== ENDPOINT BARU UNTUK MELACAK KUNJUNGAN DARI FRONTEND ====>>
router.post("/track-page-view", async (req, res) => {
  try {
    const { path: visitedPath } = req.body; // Ambil 'path' dari body dan rename ke 'visitedPath'
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    // User agent dari request ini adalah user agent dari server fetch React (jika server-side)
    // atau user agent dari browser jika fetch dilakukan langsung dari client-side React.
    // Untuk SPA, biasanya fetch dari client, jadi ini user agent browser.
    const userAgent = req.headers["user-agent"];

    if (!visitedPath) {
      return res
        .status(400)
        .json({ success: false, message: "Path is required for tracking" });
    }

    console.log(
      `Backend: Tracking page view for path: ${visitedPath}, IP: ${ip}`
    ); // Log di backend

    const newVisit = new Visitor({
      ipAddress: ip,
      userAgent: userAgent,
      path: visitedPath, // Simpan path yang dikirim dari frontend
      timestamp: new Date(), // Pastikan timestamp juga di-set
    });
    await newVisit.save();
    res
      .status(201)
      .json({ success: true, message: "Page view tracked successfully" });
  } catch (error) {
    console.error("Backend: Error tracking page view from frontend:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while tracking page view",
      });
  }
});

module.exports = router;

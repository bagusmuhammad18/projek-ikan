// controllers/statsController.js
const Visitor = require("../models/Visitor"); // Sesuaikan path jika perlu
const moment = require("moment"); // Anda mungkin perlu: npm install moment

// Helper untuk mendapatkan rentang tanggal
const getCountsForPeriod = async (startDate, endDate) => {
  return Visitor.countDocuments({
    timestamp: {
      $gte: startDate.toDate(),
      $lt: endDate.toDate(),
    },
  });
};

exports.getVisitorStats = async (req, res) => {
  try {
    const now = moment(); // Waktu saat ini

    // Hari Ini
    const startOfToday = now.clone().startOf("day");
    const endOfToday = now.clone().endOf("day");
    const todayCount = await getCountsForPeriod(startOfToday, endOfToday);

    // Kemarin
    const startOfYesterday = now.clone().subtract(1, "days").startOf("day");
    const endOfYesterday = now.clone().subtract(1, "days").endOf("day");
    const yesterdayCount = await getCountsForPeriod(
      startOfYesterday,
      endOfYesterday
    );

    // Minggu Ini (Minggu hingga Sabtu, atau Senin hingga Minggu, tergantung preferensi `moment`)
    // Moment defaultnya Minggu sebagai awal minggu. ISO week (Senin) bisa: .startOf('isoWeek')
    const startOfWeek = now.clone().startOf("week");
    const endOfWeek = now.clone().endOf("week");
    const thisWeekCount = await getCountsForPeriod(startOfWeek, endOfWeek);

    // Bulan Ini
    const startOfMonth = now.clone().startOf("month");
    const endOfMonth = now.clone().endOf("month");
    const thisMonthCount = await getCountsForPeriod(startOfMonth, endOfMonth);

    // Tahun Ini
    const startOfYear = now.clone().startOf("year");
    const endOfYear = now.clone().endOf("year");
    const thisYearCount = await getCountsForPeriod(startOfYear, endOfYear);

    // Jumlah Total
    const totalCount = await Visitor.countDocuments({});

    res.status(200).json({
      success: true,
      data: {
        today: todayCount,
        yesterday: yesterdayCount,
        thisWeek: thisWeekCount,
        thisMonth: thisMonthCount,
        thisYear: thisYearCount,
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Error getting visitor stats:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error while fetching stats" });
  }
};

const nodemailer = require("nodemailer");

// Transporter yang sudah Anda buat, ini tidak perlu diubah.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // Gunakan koneksi SSL yang lebih stabil
  auth: {
    user: "noreply.marketplaceiwak@gmail.com", // User Anda sudah benar
    pass: process.env.GMAIL_APP_PASSWORD, // Pastikan nama variabel ENV ini benar
  },
});

/**
 * Mengirim email notifikasi pesanan baru ke admin.
 * @param {object} order - Objek pesanan yang baru saja dibuat dari database.
 * @param {object} customer - Objek user yang melakukan pemesanan.
 */
const sendNewOrderNotification = async (order, customer) => {
  // Format angka menjadi format Rupiah
  const formattedTotal = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(order.totalAmount);

  const mailOptions = {
    from: '"Marketplace Siphiko" <noreply.marketplaceiwak@gmail.com>',
    to: "aupperikanan@gmail.com", // Email admin tujuan notifikasi
    subject: `Pesanan Baru Diterima`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #2c3e50;">🔔 Notifikasi Pesanan Baru</h2>
        <p>Halo Admin,</p>
        <p>Anda baru saja menerima pesanan baru dengan detail sebagai berikut:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px; width: 30%;"><strong>ID Pesanan:</strong></td>
            <td style="padding: 8px;">#${order._id}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;"><strong>Nama Pelanggan:</strong></td>
            <td style="padding: 8px;">${customer.name}</td>
          </tr>
           <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;"><strong>Nomor Telepon:</strong></td>
            <td style="padding: 8px;">${
              customer.phoneNumber || "Tidak ada"
            }</td>
          </tr>
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 8px;"><strong>Total Pembayaran:</strong></td>
            <td style="padding: 8px;"><strong>${formattedTotal}</strong></td>
          </tr>
        </table>
        <p style="margin-top: 20px;">
          Silakan segera periksa dashboard admin untuk memproses pesanan ini lebih lanjut.
        </p>
        <p>Terima kasih.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(
      `Email notifikasi untuk pesanan #${order._id} berhasil dikirim.`
    );
  } catch (error) {
    console.error(
      `Gagal mengirim email notifikasi untuk pesanan #${order._id}:`,
      error
    );
    // Gagal kirim email tidak boleh menghentikan proses order, jadi kita hanya log error-nya.
  }
};

module.exports = {
  transporter,
  sendNewOrderNotification,
};

const nodemailer = require("nodemailer");

// Konfigurasi transporter untuk Mailtrap
const transporter = nodemailer.createTransport({
  host: "sandbox.smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "c2305e5bf87632", // Ganti dengan username Mailtrap kamu
    pass: "c6ec60fdfa951c", // Ganti dengan password Mailtrap kamu
  },
});

module.exports = transporter;

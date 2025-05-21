const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "noreply.marketplaceiwak@gmail.com",
    pass: process.env.GMAIL_APP_PASSWORD, // App Password dari langkah 1
  },
});

module.exports = transporter;

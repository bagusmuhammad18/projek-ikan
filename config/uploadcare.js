// config/uploadcare.js
const uploadcare = require("uploadcare")({
  publicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  secretKey: process.env.UPLOADCARE_SECRET_KEY,
});

const uploadImage = async (fileBuffer, fileName) => {
  try {
    const result = await uploadcare.file.upload(fileBuffer, {
      publicKey: process.env.UPLOADCARE_PUBLIC_KEY,
      store: "auto",
      name: fileName,
    });
    if (!result || !result.cdnUrl) {
      throw new Error("Tidak ada CDN URL dari Uploadcare");
    }
    return result.cdnUrl;
  } catch (err) {
    console.error("Error upload ke Uploadcare:", err.message, err.stack);
    throw new Error("Gagal mengunggah ke Uploadcare: " + err.message);
  }
};

module.exports = { uploadImage };

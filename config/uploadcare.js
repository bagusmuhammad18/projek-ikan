const uploadcare = require("uploadcare")({
  publicKey: process.env.UPLOADCARE_PUBLIC_KEY,
  secretKey: process.env.UPLOADCARE_SECRET_KEY,
});

const uploadImage = async (filePath) => {
  return new Promise((resolve, reject) => {
    uploadcare.file.upload(filePath, (err, file) => {
      if (err) return reject(err);
      resolve(file);
    });
  });
};

module.exports = { uploadImage };

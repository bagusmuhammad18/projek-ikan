// PROYEK-IKAN/controllers/dbAdminController.js
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const unzipper = require("unzipper"); // Pastikan sudah diinstal

const MONGODB_CONNECTION_URI = process.env.MONGODB_URI;
const MONGO_DB_NAME_FROM_ENV = process.env.MONGO_DB_NAME;

const BACKUP_DIR = path.join(__dirname, "..", "backups");
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// Pastikan direktori ada saat modul dimuat
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Fungsi helper untuk membersihkan path
const cleanupPaths = (paths) => {
  paths.forEach((p) => {
    if (fs.existsSync(p)) {
      fs.rm(p, { recursive: true, force: true }, (errRm) => {
        if (errRm) console.error(`Error saat membersihkan path ${p}:`, errRm);
        else console.log(`Path dibersihkan: ${p}`);
      });
    }
  });
};

exports.backupDatabase = async (req, res) => {
  console.log("Memulai proses backup database...");
  if (!MONGODB_CONNECTION_URI || !MONGO_DB_NAME_FROM_ENV) {
    console.error(
      "Error: MONGODB_URI atau MONGO_DB_NAME tidak terdefinisi di environment variables."
    );
    return res.status(500).json({
      message:
        "Konfigurasi server error: Variabel environment database tidak ditemukan.",
    });
  }

  const timestamp = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
  const backupFileNameBase = `backup-${MONGO_DB_NAME_FROM_ENV}-${timestamp}`;
  const backupDumpPath = path.join(BACKUP_DIR, backupFileNameBase);
  const backupZipPath = path.join(BACKUP_DIR, `${backupFileNameBase}.zip`);

  const command = `mongodump --uri="${MONGODB_CONNECTION_URI}" --db="${MONGO_DB_NAME_FROM_ENV}" --out="${backupDumpPath}"`;
  console.log(`Executing backup command: ${command}`);

  exec(command, async (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing mongodump: ${error.message}`);
      console.error(`Mongodump Stderr: ${stderr}`);
      cleanupPaths([backupDumpPath]);
      if (!res.headersSent) {
        return res.status(500).json({
          message: "Backup database gagal (mongodump error).",
          error: error.message,
          details: stderr,
        });
      }
      return; // Pastikan tidak ada lagi yang dijalankan
    }
    if (stderr && stderr.length > 0) {
      // Hanya log jika stderr tidak kosong
      console.warn(
        `Mongodump stderr (kemungkinan warning atau info): ${stderr}`
      );
    }
    if (stdout && stdout.length > 0) {
      // Hanya log jika stdout tidak kosong
      console.log(`Mongodump stdout: ${stdout}`);
    }
    console.log(`Backup data mentah berhasil disimpan di: ${backupDumpPath}`);

    const output = fs.createWriteStream(backupZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    let archiveFinalized = false;
    let responseSent = false; // Flag untuk mencegah multiple response

    // Handler error harus dipasang sebelum pipe
    archive.on("warning", (warn) => {
      console.warn("Archiver warning:", warn);
    });

    archive.on("error", (err) => {
      console.error("Gagal membuat arsip backup (archiver.on('error')):", err);
      cleanupPaths([backupDumpPath, backupZipPath]);
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        res.status(500).json({
          message: "Gagal memproses arsip backup.",
          error: err.message,
        });
      }
    });

    output.on("close", () => {
      console.log(`Output stream untuk ${backupZipPath} ditutup.`);
      if (responseSent) return; // Jika respons (error) sudah dikirim, jangan lakukan apa-apa lagi

      if (!archiveFinalized) {
        console.warn(
          "Stream output ditutup sebelum arsip difinalisasi. Ini bisa berarti ada masalah."
        );
        // Mungkin tidak perlu mengirim error di sini jika 'archive.on("error")' sudah menangani
        return;
      }

      console.log(
        `Arsip backup berhasil dibuat: ${backupZipPath}, ${archive.pointer()} total bytes`
      );
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        res.download(
          backupZipPath,
          `${backupFileNameBase}.zip`,
          (downloadErr) => {
            if (downloadErr) {
              console.error(
                "Error saat mengirim file backup ke client (setelah download dimulai):",
                downloadErr
              );
              // Tidak bisa mengirim JSON error baru di sini
            } else {
              console.log("File backup berhasil dikirim ke client.");
            }
            cleanupPaths([backupDumpPath, backupZipPath]);
          }
        );
      }
    });

    output.on("error", (err) => {
      console.error("Error pada output stream saat menulis file zip:", err);
      cleanupPaths([backupDumpPath, backupZipPath]);
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        res.status(500).json({
          message: "Gagal menulis file backup zip.",
          error: err.message,
        });
      }
    });

    archive.pipe(output);
    const actualDumpDirForArchiving = path.join(
      backupDumpPath,
      MONGO_DB_NAME_FROM_ENV
    );

    if (fs.existsSync(actualDumpDirForArchiving)) {
      archive.directory(actualDumpDirForArchiving, MONGO_DB_NAME_FROM_ENV);
    } else {
      console.error(
        `CRITICAL: Direktori dump utama ${actualDumpDirForArchiving} tidak ditemukan setelah mongodump sukses. Backup tidak akan valid.`
      );
      cleanupPaths([backupDumpPath, backupZipPath]); // Bersihkan
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        // Kirim error karena backup tidak akan valid
        return res.status(500).json({
          message: "Gagal membuat backup: direktori dump tidak ditemukan.",
        });
      }
      return; // Hentikan proses
    }

    try {
      await archive.finalize();
      archiveFinalized = true;
      console.log("Finalisasi arsip diminta dan berhasil.");
    } catch (finalizeErr) {
      console.error("Error saat finalisasi arsip (try-catch):", finalizeErr);
      cleanupPaths([backupDumpPath, backupZipPath]);
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        res.status(500).json({
          message: "Gagal finalisasi arsip backup.",
          error: finalizeErr.message,
        });
      }
    }
  });
};

exports.restoreDatabase = async (req, res) => {
  // ... (kode restoreDatabase Anda yang sudah berfungsi tetap di sini) ...
  // Pastikan penyesuaian --nsInclude sudah ada
  if (!MONGODB_CONNECTION_URI || !MONGO_DB_NAME_FROM_ENV) {
    console.error("Error: MONGODB_URI atau MONGO_DB_NAME tidak terdefinisi.");
    return res.status(500).json({ message: "Konfigurasi server error." });
  }

  if (!req.file) {
    return res
      .status(400)
      .json({ message: "Tidak ada file backup yang diupload." });
  }

  const uploadedFilePath = req.file.path;
  const originalFileName = req.file.originalname;
  const tempExtractPath = path.join(
    UPLOAD_DIR,
    `extracted-restore-${Date.now()}`
  );

  let command;
  let pathsToCleanupAfterRestore = [uploadedFilePath];
  let responseSent = false; // Flag untuk mencegah multiple response

  try {
    if (originalFileName.endsWith(".zip")) {
      console.log(
        `Mengekstrak file zip: ${uploadedFilePath} ke ${tempExtractPath}`
      );
      if (!fs.existsSync(tempExtractPath)) {
        fs.mkdirSync(tempExtractPath, { recursive: true });
      }
      pathsToCleanupAfterRestore.push(tempExtractPath);

      await fs
        .createReadStream(uploadedFilePath)
        .pipe(unzipper.Extract({ path: tempExtractPath }))
        .promise();
      console.log("Ekstraksi zip selesai.");

      let restoreSourceDir = path.join(tempExtractPath, MONGO_DB_NAME_FROM_ENV);
      if (!fs.existsSync(restoreSourceDir)) {
        console.warn(
          `Subfolder ${MONGO_DB_NAME_FROM_ENV} tidak ditemukan di ${tempExtractPath}. Menggunakan root ekstraksi ${tempExtractPath} sebagai sumber restore.`
        );
        restoreSourceDir = tempExtractPath;
      }
      const filesInRestoreSource = fs.readdirSync(restoreSourceDir);
      if (!filesInRestoreSource.some((file) => file.endsWith(".bson"))) {
        throw new Error(
          `Direktori hasil ekstraksi (${restoreSourceDir}) tidak tampak seperti dump MongoDB yang valid (tidak ada file .bson).`
        );
      }
      command = `mongorestore --uri="${MONGODB_CONNECTION_URI}" --dir="${restoreSourceDir}" --nsInclude="${MONGO_DB_NAME_FROM_ENV}.*" --drop`;
    } else if (
      originalFileName.endsWith(".gz") ||
      originalFileName.endsWith(".archive")
    ) {
      command = `mongorestore --uri="${MONGODB_CONNECTION_URI}" --archive="${uploadedFilePath}" --nsFrom="${MONGO_DB_NAME_FROM_ENV}.*" --nsTo="${MONGO_DB_NAME_FROM_ENV}.*" --gzip --drop`;
    } else {
      cleanupPaths(pathsToCleanupAfterRestore);
      if (!res.headersSent && !responseSent) {
        responseSent = true;
        return res.status(400).json({
          message: `Format file tidak didukung: ${originalFileName}.`,
        });
      }
      return;
    }

    console.log(`Executing restore command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      cleanupPaths(pathsToCleanupAfterRestore);
      if (responseSent) return; // Jika respons sudah dikirim dari try-catch

      if (error) {
        console.error(`Error executing mongorestore: ${error.message}`);
        console.error(`Mongorestore Stderr: ${stderr}`);
        if (!res.headersSent) {
          // Double check headersSent
          responseSent = true;
          return res.status(500).json({
            message: "Restore database gagal (mongorestore error).",
            error: error.message,
            details: stderr,
          });
        }
        return;
      }
      if (stderr && stderr.length > 0) {
        console.warn(
          `Mongorestore stderr (kemungkinan info/warning): ${stderr}`
        );
      }
      if (stdout && stdout.length > 0) {
        console.log(`Mongorestore stdout: ${stdout}`);
      }

      if (!res.headersSent) {
        // Double check headersSent
        responseSent = true;
        res.status(200).json({
          message: "Database berhasil direstore!",
          output: stdout,
          warnings: stderr,
        });
      }
    });
  } catch (processingError) {
    console.error("Error saat memproses file untuk restore:", processingError);
    cleanupPaths(pathsToCleanupAfterRestore);
    if (!res.headersSent && !responseSent) {
      responseSent = true;
      return res.status(500).json({
        message: "Gagal memproses file backup untuk restore.",
        error: processingError.message,
      });
    }
  }
};

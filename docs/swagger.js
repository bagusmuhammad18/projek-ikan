// swagger.js
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

// URL untuk console log (ini sudah benar)
const swaggerUiUrlLocal =
  process.env.LOCAL_SWAGGER_URL || "http://localhost:5000/api-docs";
const swaggerUiUrlProd =
  process.env.PROD_SWAGGER_URL || "https://iwak.onrender.com/api-docs"; // Pastikan fallback sesuai

// URL base API Anda (WAJIB SESUAIKAN JIKA PERLU)
const localApiUrl = "http://localhost:5000/api"; // Ganti jika base path API Anda berbeda
const prodApiUrl = "https://iwak.onrender.com/api"; // Ganti jika base path API Anda berbeda

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Dokumentasi API Siphiko",
      version: "1.0.0",
      description: "Dokumentasi API Siphiko untuk Pengguna dan Admin",
      contact: {
        // SESUAIKAN INI
        name: "Siphiko",
        url: "https://siphiko.vercel.app/",
        email: "support@iwak.com",
      },
    },
    servers: [
      {
        url: localApiUrl,
        description: "Local Development Server",
      },
      {
        url: prodApiUrl,
        description: "Production Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description:
            "Masukkan token JWT dengan prefix 'Bearer '. Contoh: 'Bearer {token}'",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: "Users",
        description:
          "Operasi terkait Pengguna (Autentikasi, Profil, Manajemen Alamat)",
      },
      {
        name: "Admin - Users",
        description: "Operasi Admin untuk manajemen Pengguna",
      },
      {
        name: "Products",
        description: "Operasi terkait Produk (Publik)",
      },
      {
        name: "Admin - Products",
        description: "Operasi Admin untuk manajemen Produk",
      },
      {
        name: "Orders",
        description: "Operasi terkait Pesanan Pengguna",
      },
      {
        name: "Admin - Orders",
        description: "Operasi Admin untuk manajemen Pesanan",
      },
      {
        name: "Cart", // TAG BARU
        description: "Operasi terkait Keranjang Belanja Pengguna",
      },
    ],
  },
  // Path ke file API (YAML atau JS dengan JSDoc) (WAJIB SESUAIKAN JIKA PERLU)
  // Contoh ini mengasumsikan swagger.js, *.yaml ada di root, dan routes di ./routes/
  apis: [path.join(__dirname, "*.yaml"), path.join(__dirname, "./routes/*.js")],
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerDocs = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customCss: ".swagger-ui .topbar { display: none }",
      // swaggerOptions: {
      //   persistAuthorization: true,
      // }
    })
  );

  if (process.env.NODE_ENV !== "test") {
    console.log(
      `Swagger docs tersedia di: ${swaggerUiUrlLocal} (Local) dan ${swaggerUiUrlProd} (Production)`
    );
  }
};

module.exports = swaggerDocs;

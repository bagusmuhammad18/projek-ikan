const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Dokumentasi API Marketplace Ikan",
      version: "1.0.0",
      description: "Dokumentasi API untuk website marketplace penjualan ikan",
    },
    servers: [
      {
        url: "http://localhost:5000/api",
        description: "Local Server",
      },
      {
        url: "https://iwak.onrender.com/api",
        description: "Production Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [], // Gunakan bearerAuth secara konsisten
      },
    ],
  },
  apis: [path.join(__dirname, "*.yaml")],
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerDocs = (app) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log(
    "Swagger docs tersedia di: http://localhost:5000/api-docs dan https://iwak.onrender.com/api-docs"
  );
};

module.exports = swaggerDocs;

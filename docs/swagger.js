const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

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
        url: "https://iwak.onrender.com",
        description: "Production Server",
      },
      {
        url: "http://localhost:5000",
        description: "Local Server",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        BearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

const swaggerDocs = (app) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log("Swagger docs tersedia di: https://iwak.onrender.com/api-docs");
};

module.exports = swaggerDocs;

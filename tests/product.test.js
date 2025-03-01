const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../server"); // Ganti dengan path ke aplikasi Express kamu
const Product = require("../models/Product");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// Mock axios untuk simulasi panggilan ke Uploadcare
jest.mock("axios");

let mongoServer;
let adminToken;
let nonAdminToken;
let adminUserId;

beforeAll(async () => {
  // Putuskan koneksi jika ada
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Mulai MongoMemoryServer
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Koneksi ke MongoDB
  await mongoose.connect(uri);

  // Buat user admin untuk testing
  const adminUser = await User.create({
    name: "Admin User",
    email: "admin@example.com",
    password: "password123",
    phoneNumber: "08123456789",
    role: "admin",
  });
  adminUserId = adminUser._id;
  adminToken = jwt.sign(
    { id: adminUser._id, role: adminUser.role },
    process.env.JWT_SECRET || "secret"
  );

  // Buat user biasa untuk testing
  const regularUser = await User.create({
    name: "Regular User",
    email: "user@example.com",
    password: "password123",
    phoneNumber: "08198765432",
    role: "user",
  });
  nonAdminToken = jwt.sign(
    { id: regularUser._id, role: regularUser.role },
    process.env.JWT_SECRET || "secret"
  );
});

beforeEach(async () => {
  await Product.deleteMany({});
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

// Fungsi helper untuk membuat buffer gambar dummy
function createImageBuffer(sizeInMB) {
  return Buffer.alloc(sizeInMB * 1024 * 1024); // Ukuran dalam MB
}

describe("Product Routes", () => {
  // Test GET /api/products
  describe("GET /api/products", () => {
    it("Harus mengembalikan daftar produk yang dipublikasikan", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Product 1",
          description: "Desc 1",
          price: 100,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
        },
        {
          sku: "P2",
          name: "Product 2",
          description: "Desc 2",
          price: 200,
          stock: 20,
          seller: adminUserId,
          isPublished: false,
        },
      ]);

      const res = await request(app).get("/api/products");

      expect(res.statusCode).toBe(200);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].name).toBe("Product 1");
      expect(res.body.pagination).toHaveProperty("currentPage", 1);
    });

    it("Harus mendukung filter pencarian berdasarkan nama", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Laptop",
          description: "Desc 1",
          price: 1000,
          stock: 5,
          seller: adminUserId,
          isPublished: true,
        },
        {
          sku: "P2",
          name: "Mouse",
          description: "Desc 2",
          price: 50,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
        },
      ]);

      const res = await request(app).get("/api/products?search=lap");

      expect(res.statusCode).toBe(200);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].name).toBe("Laptop");
    });

    it("Harus mendukung filter berdasarkan rentang harga", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Product 1",
          description: "Desc 1",
          price: 100,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
        },
        {
          sku: "P2",
          name: "Product 2",
          description: "Desc 2",
          price: 200,
          stock: 20,
          seller: adminUserId,
          isPublished: true,
        },
      ]);

      const res = await request(app).get(
        "/api/products?minPrice=150&maxPrice=250"
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].name).toBe("Product 2");
    });

    it("Harus mendukung filter berdasarkan color dan size", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Product 1",
          description: "Desc 1",
          price: 100,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
          type: { color: ["Red"], size: ["M"] },
        },
        {
          sku: "P2",
          name: "Product 2",
          description: "Desc 2",
          price: 200,
          stock: 20,
          seller: adminUserId,
          isPublished: true,
          type: { color: ["Blue"], size: ["L"] },
        },
      ]);

      const res = await request(app).get("/api/products?color=red&size=m");

      expect(res.statusCode).toBe(200);
      expect(res.body.products.length).toBe(1);
      expect(res.body.products[0].name).toBe("Product 1");
    });

    it("Harus mendukung sorting berdasarkan price descending", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Product 1",
          description: "Desc 1",
          price: 100,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
        },
        {
          sku: "P2",
          name: "Product 2",
          description: "Desc 2",
          price: 200,
          stock: 20,
          seller: adminUserId,
          isPublished: true,
        },
      ]);

      const res = await request(app).get(
        "/api/products?sortBy=price&sortOrder=desc"
      );

      expect(res.statusCode).toBe(200);
      expect(res.body.products[0].name).toBe("Product 2");
      expect(res.body.products[1].name).toBe("Product 1");
    });

    it("Harus mendukung pagination", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Product 1",
          description: "Desc 1",
          price: 100,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
        },
        {
          sku: "P2",
          name: "Product 2",
          description: "Desc 2",
          price: 200,
          stock: 20,
          seller: adminUserId,
          isPublished: true,
        },
      ]);

      const res = await request(app).get("/api/products?page=1&limit=1");

      expect(res.statusCode).toBe(200);
      expect(res.body.products.length).toBe(1);
      expect(res.body.pagination.totalPages).toBe(2);
    });
  });

  // Test GET /api/products/all
  describe("GET /api/products/all", () => {
    it("Harus mengembalikan semua produk termasuk yang tidak dipublikasikan", async () => {
      await Product.create([
        {
          sku: "P1",
          name: "Product 1",
          description: "Desc 1",
          price: 100,
          stock: 10,
          seller: adminUserId,
          isPublished: true,
        },
        {
          sku: "P2",
          name: "Product 2",
          description: "Desc 2",
          price: 200,
          stock: 20,
          seller: adminUserId,
          isPublished: false,
        },
      ]);

      const res = await request(app).get("/api/products/all");

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
    });
  });

  // Test GET /api/products/:id
  describe("GET /api/products/:id", () => {
    it("Harus mengembalikan produk berdasarkan ID", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: adminUserId,
        isPublished: true,
      });

      const res = await request(app).get(`/api/products/${product._id}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe("Test Product");
    });

    it("Harus mengembalikan 404 jika produk tidak ditemukan", async () => {
      const res = await request(app).get(
        `/api/products/${new mongoose.Types.ObjectId()}`
      );

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Product not found");
    });
  });

  // Test POST /api/products with image upload
  describe("POST /api/products", () => {
    it("Harus berhasil upload gambar dan membuat produk", async () => {
      // Mock respons dari Uploadcare
      axios.post.mockResolvedValue({ data: { file: "mock-file-id" } });

      // Buat buffer gambar dummy (1MB)
      const imageBuffer = createImageBuffer(1);

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("sku", "P1")
        .field("name", "Product with Image")
        .field("description", "Desc")
        .field("price", 100)
        .field("stock", 10)
        .attach("images", imageBuffer, "test.jpg");

      expect(res.statusCode).toBe(201);
      expect(res.body.images).toContain("https://ucarecdn.com/mock-file-id/");
    });

    it("Harus gagal jika file bukan gambar", async () => {
      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("sku", "P1")
        .field("name", "Product with Invalid File")
        .field("description", "Desc")
        .field("price", 100)
        .field("stock", 10)
        .attach("images", Buffer.from("not an image"), {
          filename: "test.pdf",
          contentType: "application/pdf",
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        "message",
        "Hanya file gambar yang diizinkan (jpeg, png, gif, webp, bmp)"
      );
    });

    it("Harus gagal jika ukuran file melebihi batas", async () => {
      // Buat buffer gambar dummy (6MB, misalnya batasnya 5MB)
      const largeImageBuffer = createImageBuffer(6);

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .field("sku", "P1")
        .field("name", "Product with Large Image")
        .field("description", "Desc")
        .field("price", 100)
        .field("stock", 10)
        .attach("images", largeImageBuffer, "large.jpg");

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty("message", "File too large");
    });

    it("Harus gagal jika bukan admin", async () => {
      const productData = {
        sku: "P1",
        name: "New Product",
        description: "Test description",
        price: 100,
        stock: 10,
      };

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${nonAdminToken}`)
        .send(productData);

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty(
        "message",
        "Only admins can perform this action"
      );
    });

    it("Harus gagal jika validasi gagal", async () => {
      const invalidData = {
        sku: "", // SKU kosong
        name: "New Product",
        description: "Test description",
        price: "invalid", // Bukan angka
        stock: 10,
      };

      const res = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(invalidData);

      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  // Test PUT /api/products/:id with image upload
  describe("PUT /api/products/:id", () => {
    it("Harus berhasil mengupdate produk dan menambah gambar", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Old Product",
        description: "Old description",
        price: 100,
        stock: 10,
        seller: adminUserId,
      });

      // Mock respons dari Uploadcare
      axios.post.mockResolvedValue({ data: { file: "new-mock-file-id" } });

      // Buat buffer gambar dummy (1MB)
      const imageBuffer = createImageBuffer(1);

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .field("name", "Updated Product")
        .field("description", "Updated description")
        .field("price", 150)
        .attach("images", imageBuffer, "new.jpg");

      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe("Updated Product");
      expect(res.body.images).toContain(
        "https://ucarecdn.com/new-mock-file-id/"
      );
    });

    it("Harus gagal jika bukan admin", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Old Product",
        description: "Old description",
        price: 100,
        stock: 10,
        seller: adminUserId,
      });

      const res = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${nonAdminToken}`)
        .send({ name: "Updated Product" });

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty(
        "message",
        "Only admins can perform this action"
      );
    });

    it("Harus mengembalikan 404 jika produk tidak ditemukan", async () => {
      const res = await request(app)
        .put(`/api/products/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Updated Product" });

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Product not found");
    });
  });

  // Test DELETE /api/products/:id
  describe("DELETE /api/products/:id", () => {
    it("Harus berhasil menghapus produk oleh admin", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: adminUserId,
      });

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message", "Product deleted");

      const deletedProduct = await Product.findById(product._id);
      expect(deletedProduct).toBeNull();
    });

    it("Harus gagal jika bukan admin", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: adminUserId,
      });

      const res = await request(app)
        .delete(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${nonAdminToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty(
        "message",
        "Only admins can perform this action"
      );
    });

    it("Harus mengembalikan 404 jika produk tidak ditemukan", async () => {
      const res = await request(app)
        .delete(`/api/products/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Product not found");
    });
  });
});

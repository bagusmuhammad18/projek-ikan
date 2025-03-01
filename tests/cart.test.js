jest.setTimeout(30000); // Timeout 30 detik

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../server"); // Impor Express app dari server.js
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

let mongoServer;
let userToken;
let userId;

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

  // Buat user untuk testing
  const user = await User.create({
    name: "Test User",
    email: "user@example.com",
    password: "password123",
    phoneNumber: "08198765432",
    role: "user",
  });
  userId = user._id; // Simpan ID user untuk digunakan
  userToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "secret"
  );
});

beforeEach(async () => {
  await Cart.deleteMany({}); // Bersihkan cart sebelum setiap tes
  await Product.deleteMany({}); // Bersihkan produk sebelum setiap tes
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

describe("Cart Routes", () => {
  // Test GET /api/cart
  describe("GET /api/cart", () => {
    it("Harus mengembalikan cart kosong jika belum ada", async () => {
      const res = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("user", userId.toString());
      expect(res.body.items).toEqual([]);
    });

    it("Harus mengembalikan cart dengan item yang ada", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .get("/api/cart")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].product.name).toBe("Test Product");
      expect(res.body.items[0].quantity).toBe(2);
    });
  });

  // Test POST /api/cart
  describe("POST /api/cart", () => {
    it("Harus menambahkan item baru ke cart", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      const res = await request(app)
        .post("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: product._id, quantity: 3 });

      expect(res.statusCode).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].product.toString()).toBe(product._id.toString());
      expect(res.body.items[0].quantity).toBe(3);
    });

    it("Harus menambah quantity jika item sudah ada di cart", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .post("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: product._id, quantity: 3 });

      expect(res.statusCode).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].quantity).toBe(5);
    });

    it("Harus gagal jika quantity melebihi stok", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 5,
        seller: userId,
      });

      const res = await request(app)
        .post("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: product._id, quantity: 6 });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        "message",
        "Quantity exceeds available stock"
      );
    });

    it("Harus gagal jika productId tidak valid", async () => {
      const res = await request(app)
        .post("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: "invalid-id", quantity: 1 });

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Product not found");
    });

    it("Harus gagal jika validasi gagal", async () => {
      const res = await request(app)
        .post("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: "", quantity: -1 });

      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  // Test PUT /api/cart
  describe("PUT /api/cart", () => {
    it("Harus memperbarui quantity item di cart", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .put("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: product._id, quantity: 5 });

      expect(res.statusCode).toBe(200);
      expect(res.body.items[0].quantity).toBe(5);
    });

    it("Harus gagal jika item tidak ada di cart", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      const res = await request(app)
        .put("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: product._id, quantity: 5 });

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Cart not found");
    });

    it("Harus gagal jika quantity melebihi stok", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 5,
        seller: userId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .put("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: product._id, quantity: 6 });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        "message",
        "Quantity exceeds available stock"
      );
    });

    it("Harus gagal jika validasi gagal", async () => {
      const res = await request(app)
        .put("/api/cart")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ productId: "", quantity: 0 });

      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  // Test DELETE /api/cart/:productId
  describe("DELETE /api/cart/:productId", () => {
    it("Harus menghapus item tertentu dari cart", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .delete(`/api/cart/${product._id}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.items.length).toBe(0);
    });

    it("Harus tetap berhasil meskipun cart kosong", async () => {
      const res = await request(app)
        .delete(`/api/cart/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Cart not found");
    });
  });

  // Test DELETE /api/cart
  describe("DELETE /api/cart", () => {
    it("Harus menghapus semua item di cart", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: userId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .delete("/api/cart")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message", "Cart cleared");

      const cart = await Cart.findOne({ user: userId });
      expect(cart.items.length).toBe(0);
    });

    it("Harus berhasil meskipun cart belum ada", async () => {
      const res = await request(app)
        .delete("/api/cart")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("message", "Cart cleared");
    });
  });
});

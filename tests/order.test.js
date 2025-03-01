jest.setTimeout(30000); // Timeout 30 detik

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../server"); // Impor Express app dari server.js
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const User = require("../models/User");
const jwt = require("jsonwebtoken");

let mongoServer;
let userToken;
let userId;
let adminToken;
let adminId;

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

  // Buat user biasa untuk testing
  const user = await User.create({
    name: "Test User",
    email: "user@example.com",
    password: "password123",
    phoneNumber: "08198765432",
    role: "user",
  });
  userId = user._id;
  userToken = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || "secret"
  );

  // Buat admin untuk testing
  const admin = await User.create({
    name: "Admin User",
    email: "admin@example.com",
    password: "password123",
    phoneNumber: "08123456789",
    role: "admin",
  });
  adminId = admin._id;
  adminToken = jwt.sign(
    { id: admin._id, role: admin.role },
    process.env.JWT_SECRET || "secret"
  );
});

beforeEach(async () => {
  await Order.deleteMany({});
  await Cart.deleteMany({});
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

describe("Order Routes", () => {
  // Test POST /api/orders
  describe("POST /api/orders", () => {
    it("Harus berhasil checkout dari cart ke order", async () => {
      // Buat produk
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 10,
        seller: adminId,
      });

      // Tambahkan item ke cart
      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ shippingAddress: "Alamat Pengiriman" });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty("user", userId.toString());
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].quantity).toBe(2);
      expect(res.body.totalAmount).toBe(200); // 2 * 100
      expect(res.body.shippingAddress).toBe("Alamat Pengiriman");

      // Periksa stok produk
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock).toBe(8); // 10 - 2

      // Periksa cart dihapus
      const cart = await Cart.findOne({ user: userId });
      expect(cart).toBeNull();
    });

    it("Harus gagal jika shippingAddress kosong", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ shippingAddress: "" });

      expect(res.statusCode).toBe(400);
      expect(res.body.errors[0].msg).toBe("Shipping address is required");
    });

    it("Harus gagal jika cart kosong", async () => {
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ shippingAddress: "Alamat Pengiriman" });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty("message", "Cart is empty");
    });

    it("Harus gagal jika stok tidak mencukupi", async () => {
      const product = await Product.create({
        sku: "P1",
        name: "Test Product",
        description: "Test description",
        price: 100,
        stock: 1,
        seller: adminId,
      });

      await Cart.create({
        user: userId,
        items: [{ product: product._id, quantity: 2 }],
      });

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${userToken}`)
        .send({ shippingAddress: "Alamat Pengiriman" });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        "message",
        "Stok untuk produk Test Product tidak mencukupi."
      );
    });
  });

  // Test GET /api/orders
  describe("GET /api/orders", () => {
    it("Harus mengembalikan daftar order pengguna", async () => {
      await Order.create([
        { user: userId, items: [], totalAmount: 100, shippingAddress: "Addr1" },
        { user: userId, items: [], totalAmount: 200, shippingAddress: "Addr2" },
      ]);

      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body[0].shippingAddress).toBe("Addr2"); // Urutan descending createdAt
      expect(res.body[1].shippingAddress).toBe("Addr1");
    });

    it("Harus mengembalikan array kosong jika tidak ada order", async () => {
      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // Test GET /api/orders/:id
  describe("GET /api/orders/:id", () => {
    it("Harus mengembalikan detail order", async () => {
      const order = await Order.create({
        user: userId,
        items: [],
        totalAmount: 100,
        shippingAddress: "Addr1",
      });

      const res = await request(app)
        .get(`/api/orders/${order._id}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("shippingAddress", "Addr1");
      expect(res.body).toHaveProperty("user", userId.toString());
    });

    it("Harus mengembalikan 404 jika order tidak ditemukan atau bukan milik user", async () => {
      const res = await request(app)
        .get(`/api/orders/${new mongoose.Types.ObjectId()}`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Order not found");
    });
  });

  // Test PUT /api/orders/:id/status
  describe("PUT /api/orders/:id/status", () => {
    it("Harus berhasil update status order", async () => {
      const order = await Order.create({
        user: userId,
        items: [],
        totalAmount: 100,
        shippingAddress: "Addr1",
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`) // Admin update status
        .send({ status: "Shipped" });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty("status", "Shipped");
    });

    it("Harus gagal jika status tidak valid", async () => {
      const order = await Order.create({
        user: userId,
        items: [],
        totalAmount: 100,
        shippingAddress: "Addr1",
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "InvalidStatus" });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty("message", "Invalid status");
    });

    it("Harus mengembalikan 404 jika order tidak ditemukan", async () => {
      const res = await request(app)
        .put(`/api/orders/${new mongoose.Types.ObjectId()}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "Shipped" });

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Order not found");
    });
  });

  // Test PUT /api/orders/:id/pay
  describe("PUT /api/orders/:id/pay", () => {
    it("Harus berhasil simulasi pembayaran order", async () => {
      const order = await Order.create({
        user: userId,
        items: [],
        totalAmount: 100,
        shippingAddress: "Addr1",
        status: "Pending",
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}/pay`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty(
        "message",
        "Pembayaran berhasil (simulasi)"
      );
      expect(res.body.order).toHaveProperty("status", "Paid");
    });

    it("Harus gagal jika order bukan status Pending", async () => {
      const order = await Order.create({
        user: userId,
        items: [],
        totalAmount: 100,
        shippingAddress: "Addr1",
        status: "Paid",
      });

      const res = await request(app)
        .put(`/api/orders/${order._id}/pay`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty(
        "message",
        "Order sudah dibayar atau tidak bisa diproses"
      );
    });

    it("Harus mengembalikan 404 jika order tidak ditemukan", async () => {
      const res = await request(app)
        .put(`/api/orders/${new mongoose.Types.ObjectId()}/pay`)
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.statusCode).toBe(404);
      expect(res.body).toHaveProperty("message", "Order not found");
    });
  });
});

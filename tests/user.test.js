jest.setTimeout(30000); // Timeout 30 detik

const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../server"); // Impor Express app
const User = require("../models/User");

let mongoServer;

beforeAll(async () => {
  // Putuskan koneksi jika ada
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  // Mulai MongoMemoryServer
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();

  // Koneksi ke MongoDB tanpa opsi deprecated
  await mongoose.connect(uri);
});

beforeEach(async () => {
  await User.deleteMany({}); // Bersihkan database sebelum setiap tes
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

describe("User Registration", () => {
  it("Harus berhasil registrasi user baru", async () => {
    const res = await request(app).post("/api/users/register").send({
      name: "Test User",
      phoneNumber: "08123456789",
      email: "test@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("user");
    expect(res.body).toHaveProperty("token");
    expect(res.body.user).toMatchObject({
      name: "Test User",
      phoneNumber: "08123456789",
      email: "test@example.com",
    });
  });

  it("Harus gagal jika email sudah terdaftar", async () => {
    await User.create({
      name: "User Duplikat",
      phoneNumber: "0811111111",
      email: "test@example.com",
      password: "password123",
    });

    const res = await request(app).post("/api/users/register").send({
      name: "User Duplikat",
      phoneNumber: "0811111111",
      email: "test@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty("message", "Email sudah terdaftar");
  });
});

describe("User Login", () => {
  it("Harus berhasil login dengan kredensial valid", async () => {
    await User.create({
      name: "Test User",
      phoneNumber: "08123456789",
      email: "test@example.com",
      password: "password123", // Pastikan sesuai dengan logika hashing di model
    });

    const res = await request(app).post("/api/users/login").send({
      email: "test@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(res.body).toHaveProperty("user");
  });

  it("Harus gagal login jika password salah", async () => {
    await User.create({
      name: "Test User",
      phoneNumber: "08123456789",
      email: "test@example.com",
      password: "password123",
    });

    const res = await request(app).post("/api/users/login").send({
      email: "test@example.com",
      password: "passwordSALAH",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty("message", "Email atau password salah");
  });
});

const express = require("express");
const mysql = require("mysql2/promise");
const app = express();
const PORT = 3003;

app.use(express.json());

const dbConfig = {
  host: process.env.DB_HOST || "menu-db",
  user: process.env.DB_USER || "kantin_user",
  password: process.env.DB_PASSWORD || "kantin_password",
  database: process.env.DB_NAME || "kantin_db",
  port: 3306
};

let db;
async function connectWithRetry(retries = 20, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      db = await mysql.createConnection(dbConfig);
      console.log("Menu Service (Node.js) berhasil terhubung ke MySQL");
      return;
    } catch (error) {
      console.log(`Menunggu MySQL siap... percobaan ${attempt}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("Menu Service gagal terhubung ke MySQL");
}

async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS menus (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      price INT NOT NULL,
      available BOOLEAN DEFAULT TRUE
    )
  `);

  // Seed data jika kosong
  const [rows] = await db.execute("SELECT COUNT(*) AS total FROM menus");
  if (rows[0].total === 0) {
    await db.execute(`
      INSERT INTO menus (name, price, available) VALUES 
      ('Nasi Goreng Kampus', 15000, true),
      ('Es Teh Manis', 4000, true),
      ('Mie Goreng Spesial', 12000, false)
    `);
  }
}

// =========================================================================
// BENTUK FUNGSI BAWAAN (HEALTH CHECK & AMBIL SEMUA DATA)
// =========================================================================

app.get("/health", (req, res) => {
  res.json({ service: "menu-service", database: "mysql", status: "running" });
});

app.get("/menu", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM menus");
    res.json({ service: "menu-service", database: "mysql", data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================
// TAMBAHAN 5 FUNGSI BARU (GET & POST) SESUAI STANDAR MODUL
// =========================================================================

// [FUNGSI 1] GET: Mengambil satu detail menu spesifik berdasarkan ID (Referensi Modul Hal. 27)
app.get("/menu/:id", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM menus WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Menu makanan tidak ditemukan" });
    }
    res.json({ service: "menu-service", data: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [FUNGSI 2] GET: Menyaring menu yang statusnya "Tersedia/Ready" saja untuk dibeli mahasiswa
app.get("/menu/filter/available", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT * FROM menus WHERE available = true");
    res.json({ service: "menu-service", total_ready: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [FUNGSI 3] POST: Menambahkan data menu kantin baru (Referensi Modul Hal. 28)
app.post("/menu", async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !price) {
      return res.status(400).json({ message: "Nama makanan dan harga wajib diisi!" });
    }
    const [result] = await db.execute(
      "INSERT INTO menus (name, price, available) VALUES (?, ?, true)",
      [name, price]
    );
    res.status(201).json({
      service: "menu-service",
      message: "Menu baru berhasil didaftarkan ke sistem kantin",
      data: { id: result.insertId, name, price, available: true }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [FUNGSI 4] POST: Mencari data menu berdasarkan kata kunci nama makanan (Fitur Search)
app.post("/menu/search", async (req, res) => {
  try {
    const { keyword } = req.body;
    if (!keyword) {
      return res.status(400).json({ message: "Masukkan kata kunci pencarian makanan" });
    }
    const [rows] = await db.execute("SELECT * FROM menus WHERE name LIKE ?", [`%${keyword}%`]);
    res.json({ service: "menu-service", keyword_used: keyword, result_found: rows.length, data: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// [FUNGSI 5] POST: Mengubah status ketersediaan stok makanan (Tersedia / Habis)
app.post("/menu/toggle-status/:id", async (req, res) => {
  try {
    const { available } = req.body; // Isikan nilai boolean true atau false di Postman
    if (typeof available !== "boolean") {
      return res.status(400).json({ message: "Status available harus bertipe data Boolean (true/false)" });
    }
    const [result] = await db.execute("UPDATE menus SET available = ? WHERE id = ?", [available, req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Menu tidak ditemukan, gagal mengubah status ketersediaan" });
    }
    res.json({ service: "menu-service", message: `Status ketersediaan menu ID ${req.params.id} berhasil diperbarui!` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================================

async function startServer() {
  await connectWithRetry();
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Menu Service berjalan pada port ${PORT}`);
  });
}

startServer();
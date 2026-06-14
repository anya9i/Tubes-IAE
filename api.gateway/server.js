const express = require("express");
const app = express();
const PORT = 3000; // API Gateway berjalan di port 3000 sesuai modul [cite: 82, 408]

app.use(express.json());

// =========================================================================
// DEKLARASI URL SERVICE PENDUKUNG (MENGIKUTI GAYA HALAMAN 11 & 20)
// =========================================================================
const MENU_SERVICE_URL = process.env.MENU_SERVICE_URL || "http://menu-service:3003";
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://order-service:3001";
const PAYMENT_SERVICE_URL = process.env.PAYMENT_SERVICE_URL || "http://payment-service:3002";
const REPORT_SERVICE_URL = process.env.REPORT_SERVICE_URL || "http://report-service:8000";

// =========================================================================
// ENDPOINT UTAMA: MENAMPILKAN DAFTAR ENDPOINTS (MENGIKUTI HALAMAN 11 & 21)
// =========================================================================
app.get("/", (req, res) => {
  res.json({
    service: "api-gateway",
    message: "API Gateway Microservice Multi-Platform Kampus berjalan",
    endpoints: [
      "/menu",
      "/orders",
      "/payments",
      "/report/daily",
      "/report/weekly",
      "/report/detail/:id",
      "/report/range",
      "/report/cleanup",
      "/health"
    ]
  });
});

// Health check untuk API Gateway sendiri [cite: 425]
app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "running"
  });
});

// =========================================================================
// 1. ENDPOINT KATEGORI: MENU SERVICE (NODE.JS + MYSQL)
// =========================================================================

// Ambil semua menu makanan kantin (Kodingan bawaan Anda yang sudah sesuai modul)
app.get("/menu", async (req, res) => {
  try {
    const response = await fetch(`${MENU_SERVICE_URL}/menu`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "menu-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal menghubungi Menu Service", error: error.message }); 
  }
});

// Ambil detail satu menu berdasarkan ID (Ketentuan Tugas!)
app.get("/menu/:id", async (req, res) => {
  try {
    const response = await fetch(`${MENU_SERVICE_URL}/menu/${req.params.id}`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "menu-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil detail menu", error: error.message });
  }
});

// Tambah menu baru
app.post("/menu", async (req, res) => {
  try {
    const response = await fetch(`${MENU_SERVICE_URL}/menu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "menu-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal menambahkan data menu", error: error.message });
  }
});

// =========================================================================
// 2. ENDPOINT KATEGORI: ORDER SERVICE (NODE.JS + MONGODB)
// =========================================================================

app.get("/orders", async (req, res) => {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/orders`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "order-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal menghubungi Order Service", error: error.message });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const response = await fetch(`${ORDER_SERVICE_URL}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "order-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal membuat transaksi order", error: error.message });
  }
});

// =========================================================================
// 3. ENDPOINT KATEGORI: PAYMENT SERVICE (PYTHON FLASK + MYSQL)
// =========================================================================

app.get("/payments", async (req, res) => {
  try {
    const response = await fetch(`${PAYMENT_SERVICE_URL}/payments`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "payment-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal menghubungi Payment Service", error: error.message });
  }
});

// =========================================================================
// 4. ENDPOINT KATEGORI: REPORT SERVICE (PYTHON FLASK + MYSQL)
// =========================================================================

// [Report - Fungsi 1] Health Check
app.get("/report/health", async (req, res) => {
  try {
    const response = await fetch(`${REPORT_SERVICE_URL}/health`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "report-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengecek kesehatan Report Service", error: error.message });
  }
});

// [Report - Fungsi 2] Sinkronisasi Laporan Harian (Mengikuti pola Halaman 20)
app.get("/report/daily", async (req, res) => {
  try {
    const dateQuery = req.query.date ? `?date=${req.query.date}` : "";
    const response = await fetch(`${REPORT_SERVICE_URL}/report/daily${dateQuery}`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "report-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil laporan harian", error: error.message });
  }
});

// [Report - Fungsi 3] Menampilkan Ringkasan Laporan Mingguan
app.get("/report/weekly", async (req, res) => {
  try {
    const response = await fetch(`${REPORT_SERVICE_URL}/report/weekly`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "report-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil laporan mingguan", error: error.message });
  }
});

// [Report - Fungsi 4] MENAMPILKAN DATA LAPORAN BERDASARKAN ID (Ketentuan Utama Tugas!)
app.get("/report/detail/:id", async (req, res) => {
  try {
    const response = await fetch(`${REPORT_SERVICE_URL}/report/detail/${req.params.id}`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "report-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil detail laporan berdasarkan ID", error: error.message });
  }
});

// [Report - Fungsi 5] Filter Laporan Berdasarkan Rentang Tanggal Custom
app.get("/report/range", async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const response = await fetch(`${REPORT_SERVICE_URL}/report/range?start_date=${start_date}&end_date=${end_date}`);
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "report-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal memproses pencarian rentang tanggal", error: error.message });
  }
});

// [Report - Fungsi 6] POST: Pembersihan Laporan Usang Manual (CRUD - Delete)
app.post("/report/cleanup", async (req, res) => {
  try {
    const response = await fetch(`${REPORT_SERVICE_URL}/report/cleanup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.json({
      gateway: "api-gateway",
      source: "report-service",
      result: data
    });
  } catch (error) {
    res.status(500).json({ message: "Gagal melakukan pembersihan data via Gateway", error: error.message });
  }
});

// =========================================================================

app.listen(PORT, () => {
  console.log(`API Gateway berjalan pada port ${PORT}`);
});
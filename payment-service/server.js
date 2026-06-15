require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3001';

// ── Database ──────────────────────────────────────────────────────────────────
const sequelize = new Sequelize(
  process.env.DB_NAME || 'payment_db',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'payment-db',
    dialect: 'mysql',
    port: process.env.DB_PORT || 3306,
    logging: false,
  }
);

// ── Model ─────────────────────────────────────────────────────────────────────
const Payment = sequelize.define('Payment', {
  id:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  order_id:  { type: DataTypes.STRING, allowNull: false },  // STRING karena MongoDB ID
  user_id:   { type: DataTypes.STRING, allowNull: false },
  amount:    { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  method:    { type: DataTypes.ENUM('cash', 'qris', 'transfer'), defaultValue: 'cash' },
  status:    { type: DataTypes.ENUM('pending', 'paid', 'failed'), defaultValue: 'pending' },
  reference: { type: DataTypes.STRING, unique: true },
  note:      { type: DataTypes.STRING, allowNull: true },
  paid_at:   { type: DataTypes.DATE, allowNull: true },
}, { tableName: 'payments', underscored: true });

// ── Routes ────────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ service: 'payment-service', database: 'mysql', status: 'running' });
});

// [FUNGSI 1] POST: Buat payment baru
app.post('/payments', async (req, res) => {
  const { order_id, user_id, amount, method = 'cash', note } = req.body;

  if (!order_id || !user_id || !amount)
    return res.status(400).json({ message: 'order_id, user_id, dan amount wajib diisi.' });

  if (!['cash', 'qris', 'transfer'].includes(method))
    return res.status(400).json({ message: 'Method harus cash, qris, atau transfer.' });

  try {
    const existing = await Payment.findOne({
      where: { order_id, status: { [Op.in]: ['pending', 'paid'] } },
    });
    if (existing)
      return res.status(409).json({ message: 'Order ini sudah punya payment aktif.', data: existing });

    const payment = await Payment.create({
      order_id, user_id, amount, method,
      status: 'pending',
      reference: `PAY-${method.toUpperCase()}-${uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase()}`,
      note: note || null,
    });

    res.status(201).json({ service: 'payment-service', message: 'Payment berhasil dibuat.', data: payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 2] GET: Semua payment
app.get('/payments', async (req, res) => {
  try {
    const where = {};
    if (req.query.status)  where.status  = req.query.status;
    if (req.query.method)  where.method  = req.query.method;
    if (req.query.user_id) where.user_id = req.query.user_id;

    const payments = await Payment.findAll({ where, order: [['created_at', 'DESC']] });
    res.json({ service: 'payment-service', total: payments.length, data: payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 3] GET: Summary untuk report service
// PENTING: taruh /payments/summary SEBELUM /payments/:id agar tidak bentrok
app.get('/payments/summary', async (req, res) => {
  try {
    const revenue = await sequelize.query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const byStatus = await sequelize.query(
      `SELECT status, COUNT(*) as count FROM payments GROUP BY status`,
      { type: Sequelize.QueryTypes.SELECT }
    );
    const byMethod = await sequelize.query(
      `SELECT method, COUNT(*) as count FROM payments WHERE status = 'paid' GROUP BY method`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    res.json({
      service: 'payment-service',
      data: {
        total_revenue: parseFloat(revenue[0].total),
        by_status: Object.fromEntries(byStatus.map(r => [r.status, parseInt(r.count)])),
        by_method: Object.fromEntries(byMethod.map(r => [r.method, parseInt(r.count)])),
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 4] GET: Payment by order_id
// PENTING: taruh /payments/order/:order_id SEBELUM /payments/:id
app.get('/payments/order/:order_id', async (req, res) => {
  try {
    const payments = await Payment.findAll({
      where: { order_id: req.params.order_id },
      order: [['created_at', 'DESC']],
    });
    if (!payments.length)
      return res.status(404).json({ message: 'Tidak ada payment untuk order ini.' });
    res.json({ service: 'payment-service', data: payments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 5] GET: Detail payment by id
app.get('/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment tidak ditemukan.' });
    res.json({ service: 'payment-service', data: payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 6] PATCH: Konfirmasi bayar
app.patch('/payments/:id/confirm', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment tidak ditemukan.' });
    if (payment.status === 'paid') return res.status(400).json({ message: 'Sudah dikonfirmasi.' });

    const { status = 'paid', note } = req.body;
    if (!['paid', 'failed'].includes(status))
      return res.status(400).json({ message: "Status hanya boleh 'paid' atau 'failed'." });

    payment.status  = status;
    payment.paid_at = status === 'paid' ? new Date() : null;
    if (note) payment.note = note;
    await payment.save();

    // Notify Order Service — pakai PUT sesuai endpoint order service
    try {
      await axios.put(
        `${ORDER_SERVICE_URL}/orders/${payment.order_id}`,
        { status: status === 'paid' ? 'paid' : 'failed' },
        { timeout: 5000 }
      );
    } catch (e) {
      console.warn('[NOTIFY] Gagal notif Order Service:', e.message);
    }

    res.json({ service: 'payment-service', message: `Payment berhasil dikonfirmasi sebagai '${status}'.`, data: payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 7] PATCH: Batalkan payment
app.patch('/payments/:id/cancel', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment tidak ditemukan.' });
    if (payment.status !== 'pending')
      return res.status(400).json({ message: `Status '${payment.status}' tidak bisa dibatalkan.` });

    payment.status = 'failed';
    await payment.save();

    res.json({ service: 'payment-service', message: 'Payment berhasil dibatalkan.', data: payment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// [FUNGSI 8] DELETE: Hapus payment
app.delete('/payments/:id', async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment tidak ditemukan.' });

    await payment.destroy();
    res.json({ service: 'payment-service', message: 'Payment berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
sequelize.sync({ alter: true }).then(() => {
  console.log('[DB] payment_db tersambung.');
  app.listen(PORT, () => console.log(`[SERVER] Payment Service jalan di port ${PORT}`));
}).catch(err => {
  console.error('[DB ERROR]', err.message);
  process.exit(1);
});
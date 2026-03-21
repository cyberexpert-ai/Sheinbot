require('dotenv').config();
const { Pool } = require('pg');
const logger = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (err) => logger.error('PostgreSQL pool error: ' + err.message));

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) logger.warn(`Slow query (${duration}ms): ${text}`);
    return res;
  } catch (err) {
    logger.error(`DB Query Error: ${err.message} | Query: ${text}`);
    throw err;
  }
}

// ─── SESSION ────────────────────────────────────────────────────────────────
async function getSession(telegramId) {
  const res = await query(
    'SELECT state, data FROM sessions WHERE telegram_id = $1', [telegramId]
  );
  return res.rows[0] || { state: 'IDLE', data: {} };
}

async function setSession(telegramId, state, data = {}) {
  await query(
    `INSERT INTO sessions (telegram_id, state, data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (telegram_id) DO UPDATE
     SET state = $2, data = $3, updated_at = NOW()`,
    [telegramId, state, JSON.stringify(data)]
  );
}

async function clearSession(telegramId) {
  await setSession(telegramId, 'IDLE', {});
}

async function updateSessionLastMsg(telegramId, msgId) {
  const sess = await getSession(telegramId);
  sess.data.lastMsgId = msgId;
  await setSession(telegramId, sess.state, sess.data);
}

// ─── USERS ──────────────────────────────────────────────────────────────────
async function getUser(telegramId) {
  const res = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return res.rows[0] || null;
}

async function upsertUser(telegramId, username, firstName, lastName) {
  const res = await query(
    `INSERT INTO users (telegram_id, username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO UPDATE
     SET username = $2, first_name = $3, last_name = $4, updated_at = NOW()
     RETURNING *`,
    [telegramId, username || null, firstName || null, lastName || null]
  );
  return res.rows[0];
}

async function setUserVerified(telegramId, verified) {
  await query('UPDATE users SET is_verified = $1, updated_at = NOW() WHERE telegram_id = $2',
    [verified, telegramId]);
}

async function blockUser(telegramId, reason, until = null) {
  await query(
    `UPDATE users SET is_blocked = true, block_reason = $2, block_until = $3, updated_at = NOW()
     WHERE telegram_id = $1`,
    [telegramId, reason, until]
  );
}

async function unblockUser(telegramId) {
  await query(
    `UPDATE users SET is_blocked = false, block_reason = null, block_until = null,
     is_temp_blocked = false, updated_at = NOW() WHERE telegram_id = $1`,
    [telegramId]
  );
}

async function tempBlockUser(telegramId, reason, minutes) {
  const until = new Date(Date.now() + minutes * 60 * 1000);
  await query(
    `UPDATE users SET is_temp_blocked = true, block_reason = $2, block_until = $3, updated_at = NOW()
     WHERE telegram_id = $1`,
    [telegramId, reason, until]
  );
}

async function getAllUsers() {
  const res = await query('SELECT * FROM users ORDER BY created_at DESC');
  return res.rows;
}

async function getUserCount() {
  const res = await query('SELECT COUNT(*) FROM users');
  return parseInt(res.rows[0].count);
}

async function searchUser(telegramId) {
  const res = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return res.rows[0] || null;
}

async function resetUserVerification(telegramId) {
  await query('UPDATE users SET is_verified = false, updated_at = NOW() WHERE telegram_id = $1', [telegramId]);
}

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
async function getCategories(activeOnly = true) {
  const q = activeOnly
    ? 'SELECT * FROM categories WHERE is_active = true ORDER BY id ASC'
    : 'SELECT * FROM categories ORDER BY id ASC';
  const res = await query(q);
  return res.rows;
}

async function getCategory(id) {
  const res = await query('SELECT * FROM categories WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function addCategory(name, description = '') {
  const res = await query(
    'INSERT INTO categories (name, description) VALUES ($1, $2) RETURNING *',
    [name, description]
  );
  return res.rows[0];
}

async function updateCategory(id, name) {
  const res = await query(
    'UPDATE categories SET name = $1 WHERE id = $2 RETURNING *',
    [name, id]
  );
  return res.rows[0];
}

async function deleteCategory(id) {
  await query('DELETE FROM categories WHERE id = $1', [id]);
}

async function toggleCategory(id, active) {
  await query('UPDATE categories SET is_active = $1 WHERE id = $2', [active, id]);
}

async function getCategoryStock(categoryId) {
  const res = await query(
    'SELECT COUNT(*) FROM vouchers WHERE category_id = $1 AND is_used = false',
    [categoryId]
  );
  return parseInt(res.rows[0].count);
}

// ─── VOUCHERS ────────────────────────────────────────────────────────────────
async function addVoucher(categoryId, code) {
  const res = await query(
    'INSERT INTO vouchers (category_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [categoryId, code.trim()]
  );
  return res.rows[0];
}

async function addBulkVouchers(categoryId, codes) {
  const uniqueCodes = [...new Set(codes.map(c => c.trim()).filter(Boolean))];
  let added = 0;
  for (const code of uniqueCodes) {
    const res = await query(
      'INSERT INTO vouchers (category_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
      [categoryId, code]
    );
    if (res.rows[0]) added++;
  }
  return added;
}

async function getAvailableVouchers(categoryId, quantity) {
  const res = await query(
    'SELECT * FROM vouchers WHERE category_id = $1 AND is_used = false LIMIT $2',
    [categoryId, quantity]
  );
  return res.rows;
}

async function markVouchersUsed(voucherIds, orderId) {
  await query(
    'UPDATE vouchers SET is_used = true, used_by_order_id = $1 WHERE id = ANY($2)',
    [orderId, voucherIds]
  );
}

async function deleteVoucher(id) {
  await query('DELETE FROM vouchers WHERE id = $1', [id]);
}

async function deleteAllVouchersInCategory(categoryId, unusedOnly = true) {
  if (unusedOnly) {
    await query('DELETE FROM vouchers WHERE category_id = $1 AND is_used = false', [categoryId]);
  } else {
    await query('DELETE FROM vouchers WHERE category_id = $1', [categoryId]);
  }
}

async function getVoucherList(categoryId, limit = 20) {
  const res = await query(
    'SELECT * FROM vouchers WHERE category_id = $1 ORDER BY id DESC LIMIT $2',
    [categoryId, limit]
  );
  return res.rows;
}

async function getVoucherStats(categoryId) {
  const res = await query(
    `SELECT 
      COUNT(*) FILTER (WHERE is_used = false) AS available,
      COUNT(*) FILTER (WHERE is_used = true) AS used,
      COUNT(*) AS total
     FROM vouchers WHERE category_id = $1`,
    [categoryId]
  );
  return res.rows[0];
}

// ─── PRICE TIERS ─────────────────────────────────────────────────────────────
async function getPriceTiers(categoryId) {
  const res = await query(
    'SELECT * FROM price_tiers WHERE category_id = $1 ORDER BY quantity ASC',
    [categoryId]
  );
  return res.rows;
}

async function setPriceTier(categoryId, quantity, price) {
  await query(
    `INSERT INTO price_tiers (category_id, quantity, price)
     VALUES ($1, $2, $3)
     ON CONFLICT (category_id, quantity) DO UPDATE SET price = $3`,
    [categoryId, quantity, price]
  );
}

async function deletePriceTier(categoryId, quantity) {
  await query('DELETE FROM price_tiers WHERE category_id = $1 AND quantity = $2', [categoryId, quantity]);
}

async function getCustomPricePerUnit(categoryId) {
  const res = await query('SELECT * FROM custom_price_per_unit WHERE category_id = $1', [categoryId]);
  return res.rows[0] || null;
}

async function setCustomPricePerUnit(categoryId, pricePerUnit) {
  await query(
    `INSERT INTO custom_price_per_unit (category_id, price_per_unit)
     VALUES ($1, $2)
     ON CONFLICT (category_id) DO UPDATE SET price_per_unit = $2`,
    [categoryId, pricePerUnit]
  );
}

async function getPrice(categoryId, quantity) {
  // Try exact tier first
  const tierRes = await query(
    'SELECT price FROM price_tiers WHERE category_id = $1 AND quantity = $2',
    [categoryId, quantity]
  );
  if (tierRes.rows[0]) return parseFloat(tierRes.rows[0].price);

  // Fall back to custom per-unit price
  const customRes = await query(
    'SELECT price_per_unit FROM custom_price_per_unit WHERE category_id = $1',
    [categoryId]
  );
  if (customRes.rows[0]) {
    return parseFloat(customRes.rows[0].price_per_unit) * quantity;
  }
  return null;
}

// ─── ORDERS ──────────────────────────────────────────────────────────────────
async function createOrder(orderId, userId, categoryId, categoryName, quantity, totalPrice, screenshotFileId, utr) {
  const recoveryExpires = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const res = await query(
    `INSERT INTO orders (order_id, user_id, category_id, category_name, quantity, total_price,
      screenshot_file_id, utr, recovery_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [orderId, userId, categoryId, categoryName, quantity, totalPrice, screenshotFileId, utr, recoveryExpires]
  );
  await query('UPDATE users SET total_orders = total_orders + 1 WHERE telegram_id = $1', [userId]);
  return res.rows[0];
}

async function getOrder(orderId) {
  const res = await query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
  return res.rows[0] || null;
}

async function getOrdersByUser(userId) {
  const res = await query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return res.rows;
}

async function getPendingOrders() {
  const res = await query(
    `SELECT o.*, u.username, u.first_name FROM orders o
     LEFT JOIN users u ON o.user_id = u.telegram_id
     WHERE o.status = 'PENDING' ORDER BY o.created_at ASC`
  );
  return res.rows;
}

async function updateOrderStatus(orderId, status, rejectReason = null) {
  await query(
    'UPDATE orders SET status = $1, reject_reason = $2, updated_at = NOW() WHERE order_id = $3',
    [status, rejectReason, orderId]
  );
}

async function setOrderAdminMsgId(orderId, msgId) {
  await query('UPDATE orders SET admin_message_id = $1 WHERE order_id = $2', [msgId, orderId]);
}

async function addOrderVouchers(orderId, codes) {
  for (const code of codes) {
    await query('INSERT INTO order_vouchers (order_id, voucher_code) VALUES ($1, $2)', [orderId, code]);
  }
}

async function getOrderVouchers(orderId) {
  const res = await query('SELECT * FROM order_vouchers WHERE order_id = $1', [orderId]);
  return res.rows;
}

async function getOrderStats() {
  const res = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status = 'PENDING') AS pending,
       COUNT(*) FILTER (WHERE status = 'ACCEPTED') AS accepted,
       COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
       SUM(total_price) FILTER (WHERE status = 'ACCEPTED') AS revenue
     FROM orders`
  );
  return res.rows[0];
}

// ─── UTR LOG ─────────────────────────────────────────────────────────────────
async function checkUTRUsed(utr) {
  const res = await query('SELECT * FROM utr_log WHERE utr = $1', [utr]);
  return res.rows[0] || null;
}

async function logUTR(utr, orderId, userId) {
  await query(
    'INSERT INTO utr_log (utr, order_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
    [utr, orderId, userId]
  );
}

// ─── BROADCASTS ──────────────────────────────────────────────────────────────
async function saveBroadcast(message, photoFileId, sentBy, targetType, targetUserId) {
  const res = await query(
    'INSERT INTO broadcasts (message, photo_file_id, sent_by, target_type, target_user_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [message, photoFileId, sentBy, targetType, targetUserId]
  );
  return res.rows[0];
}

async function getBroadcasts(limit = 10) {
  const res = await query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT $1', [limit]);
  return res.rows;
}

async function deleteBroadcast(id) {
  await query('DELETE FROM broadcasts WHERE id = $1', [id]);
}

// ─── DISCOUNT CODES ──────────────────────────────────────────────────────────
async function createDiscountCode(code, discountType, discountValue, categoryId, minQty, maxUses, expiresAt) {
  const res = await query(
    `INSERT INTO discount_codes (code, discount_type, discount_value, category_id, min_quantity, max_uses, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [code.toUpperCase(), discountType, discountValue, categoryId, minQty, maxUses, expiresAt]
  );
  return res.rows[0];
}

async function getDiscountCode(code) {
  const res = await query(
    'SELECT * FROM discount_codes WHERE code = $1 AND is_active = true', [code.toUpperCase()]
  );
  return res.rows[0] || null;
}

async function incrementDiscountUsage(code) {
  await query('UPDATE discount_codes SET used_count = used_count + 1 WHERE code = $1', [code]);
}

async function getAllDiscountCodes() {
  const res = await query('SELECT * FROM discount_codes ORDER BY created_at DESC');
  return res.rows;
}

async function deleteDiscountCode(id) {
  await query('DELETE FROM discount_codes WHERE id = $1', [id]);
}

async function toggleDiscountCode(id, active) {
  await query('UPDATE discount_codes SET is_active = $1 WHERE id = $2', [active, id]);
}

// ─── SUPPORT ─────────────────────────────────────────────────────────────────
async function saveSupportMessage(userId, message, photoFileId) {
  const res = await query(
    'INSERT INTO support_messages (user_id, message, photo_file_id) VALUES ($1,$2,$3) RETURNING *',
    [userId, message, photoFileId]
  );
  return res.rows[0];
}

async function getSupportStats() {
  const res = await query(`SELECT COUNT(*) FILTER (WHERE status='OPEN') AS open_count,
    COUNT(*) AS total FROM support_messages`);
  return res.rows[0];
}

// ─── RECOVERY REQUESTS ───────────────────────────────────────────────────────
async function getRecoveryRequest(orderId) {
  const res = await query('SELECT * FROM recovery_requests WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1', [orderId]);
  return res.rows[0] || null;
}

async function createRecoveryRequest(orderId, userId) {
  await query(
    `INSERT INTO recovery_requests (order_id, user_id) VALUES ($1, $2)
     ON CONFLICT (order_id) DO UPDATE SET user_id = $2, created_at = NOW(), status = 'PENDING'`,
    [orderId, userId]
  );
}

async function updateRecoveryRequest(orderId, status) {
  await query('UPDATE recovery_requests SET status = $1 WHERE order_id = $2', [status, orderId]);
}

// ─── INIT DATABASE ───────────────────────────────────────────────────────────
async function initDatabase() {
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await pool.query(sql);
  logger.info('Database initialized successfully');
}

module.exports = {
  query, pool,
  getSession, setSession, clearSession, updateSessionLastMsg,
  getUser, upsertUser, setUserVerified, blockUser, unblockUser, tempBlockUser,
  getAllUsers, getUserCount, searchUser, resetUserVerification,
  getCategories, getCategory, addCategory, updateCategory, deleteCategory,
  toggleCategory, getCategoryStock,
  addVoucher, addBulkVouchers, getAvailableVouchers, markVouchersUsed,
  deleteVoucher, deleteAllVouchersInCategory, getVoucherList, getVoucherStats,
  getPriceTiers, setPriceTier, deletePriceTier, getCustomPricePerUnit,
  setCustomPricePerUnit, getPrice,
  createOrder, getOrder, getOrdersByUser, getPendingOrders, updateOrderStatus,
  setOrderAdminMsgId, addOrderVouchers, getOrderVouchers, getOrderStats,
  checkUTRUsed, logUTR,
  saveBroadcast, getBroadcasts, deleteBroadcast,
  createDiscountCode, getDiscountCode, incrementDiscountUsage,
  getAllDiscountCodes, deleteDiscountCode, toggleDiscountCode,
  saveSupportMessage, getSupportStats,
  getRecoveryRequest, createRecoveryRequest, updateRecoveryRequest,
  initDatabase
};

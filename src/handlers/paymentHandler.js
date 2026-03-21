// Payment handler - BharatPay webhook (if enabled)
const db = require('../database/database');
const logger = require('../utils/logger');

async function handlePaymentWebhook(req, res) {
  try {
    const { utr, amount, status, merchantId } = req.body;
    if (!utr || status !== 'SUCCESS') return res.json({ ok: false });

    // Check if UTR is pending in any order
    const orderRes = await db.query(
      "SELECT * FROM orders WHERE utr = $1 AND status = 'PENDING'", [utr]
    );
    if (!orderRes.rows[0]) return res.json({ ok: false, msg: 'No pending order for this UTR' });

    const order = orderRes.rows[0];
    logger.info(`BharatPay auto-verified UTR ${utr} for order ${order.order_id}`);

    // Trigger accept flow
    const { handleAdminAcceptOrder } = require('./admin/orderManage');
    // Create a mock context with telegram
    // Actual delivery happens via bot instance
    res.json({ ok: true, orderId: order.order_id });
  } catch (err) {
    logger.error('Payment webhook error: ' + err.message);
    res.status(500).json({ ok: false });
  }
}

module.exports = { handlePaymentWebhook };

require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const cron = require('node-cron');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const logger = require('./utils/logger');
const db = require('./database/database');
const { authMiddleware } = require('./middlewares/auth');
const { handleStart } = require('./commands/start');
const { handleMessage } = require('./handlers/messageHandler');
const { handleCallback } = require('./handlers/callbackHandler');
const { handlePaymentWebhook } = require('./handlers/paymentHandler');
const { ADMIN_ID } = require('./utils/constants');
const { showAdminPanel } = require('./commands/admin/index');

// ─── Express Routes ───────────────────────────────────────────────
app.get('/', (req, res) => res.status(200).send('✅ SheinVoucherHub Bot is running'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime() }));
app.post('/webhook/bharatpay', handlePaymentWebhook);

// ─── Bot Init ─────────────────────────────────────────────────────
const bot = new Telegraf(process.env.BOT_TOKEN);

// Global error handler
bot.catch((err, ctx) => {
  logger.error(`Bot error for ${ctx.updateType}: ${err.message}`);
});

// Auth middleware
bot.use(authMiddleware);

// ─── Commands ─────────────────────────────────────────────────────
bot.start(handleStart);

bot.command('admin', async (ctx) => {
  if (ctx.from.id === ADMIN_ID) {
    try { await ctx.deleteMessage(); } catch (e) {}
    return showAdminPanel(ctx);
  }
});

bot.command('stats', async (ctx) => {
  if (ctx.from.id === ADMIN_ID) {
    try { await ctx.deleteMessage(); } catch (e) {}
    const { showStats } = require('./commands/admin/stats');
    const sess = await db.getSession(ADMIN_ID);
    if (sess.data.lastMsgId) {
      try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
    }
    const msg = await ctx.reply('📊 Loading stats...');
    await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, 'loading').catch(() => {});
    // Re-use stats with a fake callback
    const fakeCtx = { ...ctx, callbackQuery: { message: { message_id: msg.message_id } }, editMessageText: (t, o) => ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, null, t, o) };
    return showStats(fakeCtx);
  }
});

// ─── Handlers ─────────────────────────────────────────────────────
bot.on('callback_query', handleCallback);
bot.on(['message', 'photo'], handleMessage);

// ─── Cron Jobs ────────────────────────────────────────────────────
// Auto expire old pending orders every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  try {
    const res = await db.query(
      "UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '24 hours' RETURNING order_id"
    );
    if (res.rowCount > 0) logger.info(`Auto-expired ${res.rowCount} old orders.`);
  } catch (e) {
    logger.error('Cron expire error: ' + e.message);
  }
});

// Auto unblock temp-blocked users every minute
cron.schedule('* * * * *', async () => {
  try {
    await db.query(
      "UPDATE users SET is_temp_blocked = false, block_reason = null, block_until = null WHERE is_temp_blocked = true AND block_until < NOW()"
    );
  } catch (e) {}
});

// ─── Launch ───────────────────────────────────────────────────────
async function launch() {
  try {
    // Initialize database
    await db.initDatabase();
    logger.info('✅ Database initialized');

    const PORT = process.env.PORT || 3000;

    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      const WEBHOOK_PATH = `/bot${process.env.BOT_TOKEN}`;
      const WEBHOOK_FULL = `${process.env.WEBHOOK_URL}${WEBHOOK_PATH}`;

      app.use(bot.webhookCallback(WEBHOOK_PATH));

      await bot.telegram.setWebhook(WEBHOOK_FULL);
      logger.info(`✅ Webhook set: ${WEBHOOK_FULL}`);

      app.listen(PORT, () => {
        logger.info(`🚀 Server started on port ${PORT}`);
      });
    } else {
      // Development: Long polling
      await bot.telegram.deleteWebhook();
      app.listen(PORT, () => logger.info(`🚀 Server started on port ${PORT}`));
      await bot.launch();
      logger.info('🤖 Bot launched in polling mode');
    }

    // Notify admin on boot
    try {
      await bot.telegram.sendMessage(ADMIN_ID, `✅ *SheinVoucherHub Bot Started!*\n\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { parse_mode: 'Markdown' });
    } catch (e) {}

  } catch (err) {
    logger.error('Launch error: ' + err.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

launch();

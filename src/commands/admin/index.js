const db = require('../../database/database');
const { ADMIN_ID } = require('../../utils/constants');
const { safeDelete } = require('../../utils/helpers');

function getAdminMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '📂 Categories', callback_data: 'admin_categories' }, { text: '🎟 Vouchers', callback_data: 'admin_vouchers' }],
      [{ text: '💰 Prices', callback_data: 'admin_prices' }, { text: '📦 Orders', callback_data: 'admin_orders' }],
      [{ text: '👥 Users', callback_data: 'admin_users' }, { text: '📢 Broadcast', callback_data: 'admin_broadcast_menu' }],
      [{ text: '🏷 Discounts', callback_data: 'admin_discounts' }, { text: '📊 Stats', callback_data: 'admin_stats' }],
      [{ text: '🛡 Security', callback_data: 'admin_security' }, { text: '⚙️ Settings', callback_data: 'admin_settings' }]
    ]
  };
}

async function showAdminPanel(ctx, edit = false) {
  if (ctx.from.id !== ADMIN_ID) return;

  const stats = await db.getOrderStats();
  const userCount = await db.getUserCount();
  const pending = stats?.pending || 0;

  const text = `👑 *Admin Panel*\n\n━━━━━━━━━━━━━━━━━\n👥 Total Users: *${userCount}*\n📦 Total Orders: *${stats?.total || 0}*\n⏳ Pending Orders: *${pending}*${pending > 0 ? ' ⚠️' : ''}\n✅ Successful: *${stats?.accepted || 0}*\n💰 Revenue: *₹${parseFloat(stats?.revenue || 0).toFixed(2)}*\n━━━━━━━━━━━━━━━━━\n\nSelect a section:`;

  const opts = { parse_mode: 'Markdown', reply_markup: getAdminMenuKeyboard() };

  if (edit && ctx.callbackQuery) {
    try { return await ctx.editMessageText(text, opts); } catch (e) {}
  }

  const sess = await db.getSession(ctx.from.id);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(text, opts);
  await db.setSession(ctx.from.id, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showAdminPanel, getAdminMenuKeyboard };

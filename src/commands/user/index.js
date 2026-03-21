const db = require('../../database/database');
const { Markup } = require('telegraf');
const { safeDelete } = require('../../utils/helpers');

function getReplyKeyboard() {
  return Markup.keyboard([
    ['🛒 Buy Voucher'],
    ['🔁 Recover Vouchers', '📦 My Orders'],
    ['🆘 Support', '📜 Disclaimer']
  ]).resize().persistent();
}

async function showMainMenu(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `🏠 *Main Menu*\n\n👋 Hello, ${ctx.from.first_name || 'User'}!\n\n📌 Use the buttons below:`,
    { parse_mode: 'Markdown', ...getReplyKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showMainMenu, getReplyKeyboard };

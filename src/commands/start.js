require('dotenv').config();
const db = require('../database/database');
const { checkChannels, getJoinMessage, getJoinKeyboard } = require('../middlewares/channelCheck');
const { ADMIN_ID, BOT_NAME } = require('../utils/constants');
const { safeDelete } = require('../utils/helpers');
const { showMainMenu, getReplyKeyboard } = require('./user/index');
const { showAdminPanel } = require('./admin/index');

async function handleStart(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);

  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  try { await ctx.deleteMessage(); } catch (e) {}
  await db.clearSession(userId);

  if (userId === ADMIN_ID) return showAdminPanel(ctx);

  const { allJoined } = await checkChannels(ctx);
  if (!allJoined) {
    const msg = await ctx.reply(getJoinMessage(), { parse_mode: 'Markdown', reply_markup: getJoinKeyboard() });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const user = await db.getUser(userId);
  if (!user?.is_verified) {
    await db.setUserVerified(userId, true);
    // Welcome message — text only, no photo
    const msg = await ctx.reply(
      `🎯 *Welcome to ${BOT_NAME}!*\n\n🛒 Get exclusive BigBasket vouchers at the best prices!\n\n📌 Use the menu buttons below:`,
      { parse_mode: 'Markdown', ...getReplyKeyboard() }
    );
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
  } else {
    await showMainMenu(ctx);
  }
}

module.exports = { handleStart };

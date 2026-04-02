const db = require('../../database/database');
const { STATES, ADMIN_ID, ILLEGAL_PATTERNS } = require('../../utils/constants');
const { deleteUserMsg, safeDelete } = require('../../utils/helpers');

async function showSupport(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  // Hide keyboard first
  const tmp = await ctx.reply('...', { reply_markup: { remove_keyboard: true } });
  await safeDelete(ctx, ctx.chat.id, tmp.message_id);

  const msg = await ctx.reply(
    `🆘 *Support*\n\n💬 Describe your issue below.\n\n⚠️ Fake, spam or illegal messages = *immediate ban*.`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Leave', callback_data: 'cb_main' }]] } }
  );
  await db.setSession(userId, STATES.SUPPORT_AWAITING_MSG, { lastMsgId: msg.message_id });
}

async function handleSupportMessage(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  const messageText = ctx.message?.text || '';
  const photoFileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;

  for (const pattern of ILLEGAL_PATTERNS) {
    if (pattern.test(messageText)) {
      await db.tempBlockUser(userId, 'Spam/illegal support message', 30);
      await deleteUserMsg(ctx);
      if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
      await db.clearSession(userId);
      await ctx.reply('🚫 Suspicious message. Restricted for 30 minutes.');
      return;
    }
  }

  if (!messageText && !photoFileId) { await ctx.reply('⚠️ Please send a text message or image.'); return; }
  await deleteUserMsg(ctx);
  await db.saveSupportMessage(userId, messageText, photoFileId);

  const user = await db.getUser(userId);
  const userName = user?.username ? `@${user.username}` : (user?.first_name || 'User');

  try {
    const adminText = `🆘 *Support Request*\n\n👤 ${userName}\n🆔 \`${userId}\`\n\n💬 ${messageText || '(Photo)'}`;
    if (photoFileId) {
      await ctx.telegram.sendPhoto(ADMIN_ID, photoFileId, {
        caption: adminText, parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '💬 Reply', callback_data: `amu_${userId}` }, { text: '🚫 Block', callback_data: `absup_${userId}` }]] }
      });
    } else {
      await ctx.telegram.sendMessage(ADMIN_ID, adminText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '💬 Reply', callback_data: `amu_${userId}` }, { text: '🚫 Block', callback_data: `absup_${userId}` }]] }
      });
    }
  } catch (e) {}

  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const { getReplyKeyboard } = require('./index');
  const msg = await ctx.reply(
    `✅ *Support message sent!*\n\nWe'll respond shortly.\n\n🙏 Thank you for your patience!`,
    { parse_mode: 'Markdown', ...getReplyKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showDisclaimer(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  // Hide keyboard first
  const tmp = await ctx.reply('...', { reply_markup: { remove_keyboard: true } });
  await safeDelete(ctx, ctx.chat.id, tmp.message_id);

  const msg = await ctx.reply(
    `📜 *Disclaimer*\n\n━━━━━━━━━━━━━━━━━\n✅ All coupons are *100% OFF* up to voucher amount with *NO minimum order*.\n\n📞 Contact Support for any issue.\n\n⏰ Replacements only if raised within *1–2 hours* of delivery.\n\n🚫 *No returns.*\n\n💰 Refund only if vouchers are *out of stock.*\n━━━━━━━━━━━━━━━━━`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'cb_main' }]] } }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showSupport, handleSupportMessage, showDisclaimer };

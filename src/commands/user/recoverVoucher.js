const db = require('../../database/database');
const { STATES, ADMIN_ID } = require('../../utils/constants');
const { formatDate, isRecoveryExpired, safeDelete, deleteUserMsg } = require('../../utils/helpers');

async function showRecoverPage(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `🔁 *Recover Vouchers*\n\nSend your Order ID.\n\n📌 *Format:* \`SVH-XXXXXXXXXX-XXXXXX\`\n\n⚠️ *Rules:*\n• Only within *2 hours* of purchase\n• Only the *original account* can recover\n• *Pending* orders cannot be recovered`,
    {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true }
    }
  );
  // Delete keyboard-removing message and resend with inline button
  await safeDelete(ctx, ctx.chat.id, msg.message_id);
  const msg2 = await ctx.reply(
    `🔁 *Recover Vouchers*\n\nSend your Order ID.\n\n📌 *Format:* \`SVH-XXXXXXXXXX-XXXXXX\`\n\n⚠️ *Rules:*\n• Only within *2 hours* of purchase\n• Only the *original account* can recover\n• *Pending* orders cannot be recovered`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'cb_main' }]] } }
  );
  await db.setSession(userId, STATES.RECOVER_AWAITING_ID, { lastMsgId: msg2.message_id });
}

async function handleRecoveryInput(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  const orderId = ctx.message?.text?.trim().toUpperCase();
  await deleteUserMsg(ctx);

  const reply = async (text) => {
    if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
    const msg = await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'cb_main' }]] }
    });
    await db.setSession(userId, STATES.RECOVER_AWAITING_ID, { lastMsgId: msg.message_id });
  };

  if (!orderId || !orderId.startsWith('SVH-'))
    return reply(`⚠️ *Invalid format*\n\nFormat: \`SVH-XXXXXXXXXX-XXXXXX\`\n\nPlease try again.`);

  const order = await db.getOrder(orderId);
  if (!order) return reply(`⚠️ *Order not found:* \`${orderId}\`\n\nCheck the ID and try again.`);

  if (String(order.user_id) !== String(userId)) {
    await db.tempBlockUser(userId, 'Used another user\'s Order ID', 15);
    if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
    await db.clearSession(userId);
    await ctx.reply('🚫 *Security Alert!*\n\nThis Order ID is not yours. Restricted for 15 minutes.', { parse_mode: 'Markdown' });
    return;
  }

  if (order.status === 'PENDING')
    return reply(`⏳ *Order is Still Pending*\n\nOrder \`${orderId}\` is under review.\n\nWait for admin to process it first.`);

  if (order.status === 'ACCEPTED') {
    const vouchers = await db.getOrderVouchers(orderId);
    const codes = vouchers.length ? '\n\n🎟 *Your Codes:*\n' + vouchers.map(v => `\`${v.voucher_code}\``).join('\n') : '';
    return reply(`✅ *Already Delivered!*\n\n🧾 \`${orderId}\`\n🎟 ${order.category_name} × ${order.quantity}${codes}`);
  }

  if (order.recovery_expires_at && isRecoveryExpired(order.recovery_expires_at))
    return reply(`⌛ *Recovery Expired*\n\nOrder: \`${orderId}\`\n\nThe 2-hour window has passed. Contact support.`);

  await db.createRecoveryRequest(orderId, userId);
  const user = await db.getUser(userId);
  const userName = user?.username ? `@${user.username}` : (user?.first_name || 'User');

  try {
    await ctx.telegram.sendMessage(ADMIN_ID,
      `🔁 *Recovery Request*\n\n━━━━━━━━━━━━━━━━━\n👤 ${userName} (\`${userId}\`)\n🧾 \`${orderId}\`\n🎟 ${order.category_name} × ${order.quantity}\n📅 ${formatDate(order.created_at)}\n📊 ${order.status}\n━━━━━━━━━━━━━━━━━`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Send New Code', callback_data: `ars_${orderId}_${userId}` }],
            [{ text: '❌ Reject', callback_data: `arr_${orderId}_${userId}` }]
          ]
        }
      }
    );
  } catch (e) {}

  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
  const { getReplyKeyboard } = require('./index');
  const msg = await ctx.reply(
    `✅ *Recovery Request Sent!*\n\n🧾 \`${orderId}\`\n\nAdmin will respond shortly.\n⏰ Expires: ${formatDate(order.recovery_expires_at)}`,
    { parse_mode: 'Markdown', ...getReplyKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showRecoverPage, handleRecoveryInput };

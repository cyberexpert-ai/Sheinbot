const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');

async function promptRecoveryResponse(ctx, orderId, userId) {
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: 'admin_orders' }]] } };
  const text = `✅ *Send New Voucher Code*\n\nOrder: \`${orderId}\`\nUser: \`${userId}\`\n\nSend the replacement code (or photo with caption):`;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(text, opts); } catch (e) { await ctx.reply(text, opts); } }
  else { await ctx.reply(text, opts); }
  await db.setSession(ADMIN_ID, STATES.ADMIN_RECOVERY_RESP_TEXT, { orderId, targetUserId: userId, lastMsgId: ctx.callbackQuery?.message?.message_id });
}

async function handleRecoveryResponseInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const { orderId, targetUserId } = sess.data;
  const text = ctx.message?.text || ctx.message?.caption || '';
  const photoFileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!text && !photoFileId) return ctx.reply('⚠️ Send a code or photo.');

  if (photoFileId) {
    await ctx.telegram.sendPhoto(targetUserId, photoFileId, { caption: `🔁 *Recovery Response*\n\n${text ? `Replacement:\n\`${text}\`` : 'See image.'}`, parse_mode: 'Markdown' });
  } else {
    await ctx.telegram.sendMessage(targetUserId, `🔁 *Recovery Response*\n\nReplacement code:\n\`${text}\``, { parse_mode: 'Markdown' });
  }
  await db.updateRecoveryRequest(orderId, 'RESOLVED');
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Recovery response sent to \`${targetUserId}\`.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_orders' }]] } });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptRecoveryReject(ctx, orderId, userId) {
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: 'admin_orders' }]] } };
  const text = `❌ *Reject Recovery*\n\nOrder: \`${orderId}\`\n\nSend rejection reason:`;
  if (ctx.callbackQuery) { try { await ctx.editMessageText(text, opts); } catch (e) { await ctx.reply(text, opts); } }
  else { await ctx.reply(text, opts); }
  await db.setSession(ADMIN_ID, STATES.ADMIN_RECOVERY_REJECT_REASON, { orderId, targetUserId: userId, lastMsgId: ctx.callbackQuery?.message?.message_id });
}

async function handleRecoveryRejectInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const reason = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!reason) return ctx.reply('⚠️ Send a reason.');
  const { orderId, targetUserId } = sess.data;
  await ctx.telegram.sendMessage(targetUserId,
    `❌ *Recovery Rejected*\n\nOrder: \`${orderId}\`\nReason: ${reason}\n\nContact support for help.`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🆘 Support', callback_data: 'cb_support' }]] } }
  );
  await db.updateRecoveryRequest(orderId, 'REJECTED');
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply('✅ Recovery rejection sent.', { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_orders' }]] } });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { promptRecoveryResponse, handleRecoveryResponseInput, promptRecoveryReject, handleRecoveryRejectInput };

const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');
const { formatDate } = require('../../utils/helpers');

async function showUserManageMenu(ctx) {
  const count = await db.getUserCount();
  const text = `👥 *User Management*\n\n👤 Total Users: *${count}*\n\nOptions:`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Search User', callback_data: 'admin_user_search' }],
        [{ text: '🚫 Block User', callback_data: 'admin_user_block' }, { text: '✅ Unblock User', callback_data: 'admin_user_unblock' }],
        [{ text: '⏳ Temp Restrict', callback_data: 'admin_user_temp_block' }],
        [{ text: '📋 List All Users', callback_data: 'aul_0' }],
        [{ text: '↩️ Back', callback_data: 'admin_back' }]
      ]
    }
  });
}

async function promptSearchUser(ctx) {
  await ctx.editMessageText('🔍 *Search User*\n\nSend the Telegram User ID:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_users' }]] }
  });
  await db.setSession(ADMIN_ID, 'ADMIN_SEARCH_USER', { lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleSearchUserInput(ctx) {
  const idStr = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  const userId = parseInt(idStr);
  if (isNaN(userId)) return ctx.reply('⚠️ Invalid User ID.');
  await showUserProfile(ctx, userId);
}

async function showUserProfile(ctx, userId, edit = false) {
  const user = await db.searchUser(userId);
  if (!user) {
    const msg = await ctx.reply(`⚠️ User \`${userId}\` not found.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_users' }]] }
    });
    await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }
  const orders = await db.getOrdersByUser(userId);
  const text = `👤 *User Profile*\n\n━━━━━━━━━━━━━━━━━\n🆔 ID: \`${user.telegram_id}\`\n👤 Name: ${user.first_name || ''} ${user.last_name || ''}\n📱 Username: ${user.username ? `@${user.username}` : 'None'}\n🚫 Blocked: ${user.is_blocked ? '✅ Yes' : '❌ No'}\n⏳ Temp Blocked: ${user.is_temp_blocked ? '✅ Yes' : '❌ No'}\n📦 Orders: ${orders.length}\n📅 Joined: ${formatDate(user.created_at)}\n━━━━━━━━━━━━━━━━━`;
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '💬 Message User', callback_data: `admin_msg_user_${userId}` }],
        user.is_blocked
          ? [{ text: '✅ Unblock', callback_data: `aub_${userId}` }]
          : [{ text: '🚫 Block', callback_data: `abp_${userId}` }, { text: '⏳ Temp Restrict', callback_data: `atb_${userId}` }],
        [{ text: '🔄 Reset Verification', callback_data: `arv_${userId}` }],
        [{ text: '📦 View Orders', callback_data: `auo_${userId}` }],
        [{ text: '↩️ Back', callback_data: 'admin_users' }]
      ]
    }
  };
  if (edit && ctx.callbackQuery) { await ctx.editMessageText(text, opts); return; }
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptBlockUser(ctx, userId) {
  await ctx.editMessageText(
    `🚫 *Block User \`${userId}\`*\n\nSend the reason for blocking:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: `avu_${userId}` }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_BLOCK_REASON, { targetUserId: userId, lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleBlockReasonInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const reason = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  await db.blockUser(sess.data.targetUserId, reason);
  try { await ctx.telegram.sendMessage(sess.data.targetUserId, `🚫 *You have been blocked.*\n\nReason: ${reason}\n\nContact @SheinSupportRobot for help.`, { parse_mode: 'Markdown' }); } catch (e) {}
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ User \`${sess.data.targetUserId}\` blocked.\nReason: ${reason}`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_users' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function handleUnblockUser(ctx, userId) {
  await db.unblockUser(userId);
  try { await ctx.telegram.sendMessage(userId, '✅ You have been unblocked! Use /start to continue.'); } catch (e) {}
  await ctx.answerCbQuery('✅ User unblocked!');
  await showUserProfile(ctx, userId, true);
}

async function promptTempBlock(ctx, userId) {
  await ctx.editMessageText(
    `⏳ *Temp Restrict User \`${userId}\`*\n\nSend duration in minutes and reason:\nFormat: \`30 Suspicious activity\``,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: `avu_${userId}` }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_TEMP_BLOCK_DURATION, { targetUserId: userId, lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleTempBlockInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const parts = ctx.message?.text?.trim().split(' ');
  try { await ctx.deleteMessage(); } catch (e) {}
  const minutes = parseInt(parts?.[0]);
  const reason = parts?.slice(1).join(' ') || 'Temporary restriction';
  if (isNaN(minutes) || minutes < 1) return ctx.reply('⚠️ Format: `MINUTES REASON` e.g. `30 Suspicious activity`', { parse_mode: 'Markdown' });
  await db.tempBlockUser(sess.data.targetUserId, reason, minutes);
  const until = new Date(Date.now() + minutes * 60 * 1000).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  try { await ctx.telegram.sendMessage(sess.data.targetUserId, `⏳ You have been temporarily restricted until ${until}\nReason: ${reason}`, { parse_mode: 'Markdown' }); } catch (e) {}
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ User \`${sess.data.targetUserId}\` restricted for ${minutes} minutes.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_users' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showUserOrders(ctx, userId) {
  const orders = await db.getOrdersByUser(userId);
  let text = `📦 *Orders for User \`${userId}\`*\n\n`;
  if (!orders.length) { text += 'No orders found.'; }
  else { text += orders.slice(0, 10).map(o => `• \`${o.order_id}\` | ${o.category_name} x${o.quantity} | ${o.status}`).join('\n'); }
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avu_${userId}` }]] }
  });
}

async function handleResetVerification(ctx, userId) {
  await db.resetUserVerification(userId);
  await ctx.answerCbQuery('✅ Verification reset. User must re-join channels.');
  await showUserProfile(ctx, userId, true);
}

async function showUserList(ctx, page = 0) {
  const allUsers = await db.getAllUsers();
  const pageSize = 10;
  const start = page * pageSize;
  const pageUsers = allUsers.slice(start, start + pageSize);
  let text = `📋 *All Users* (${allUsers.length} total) — Page ${page + 1}\n\n`;
  text += pageUsers.map((u, i) => `${start + i + 1}. \`${u.telegram_id}\` ${u.username ? `@${u.username}` : u.first_name || 'Unknown'} ${u.is_blocked ? '🚫' : ''}`).join('\n');
  const buttons = [];
  const nav = [];
  if (page > 0) nav.push({ text: '⬅️ Prev', callback_data: `aul_${page - 1}` });
  if (start + pageSize < allUsers.length) nav.push({ text: '➡️ Next', callback_data: `aul_${page + 1}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_users' }]);
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

module.exports = {
  showUserManageMenu, promptSearchUser, handleSearchUserInput, showUserProfile,
  promptBlockUser, handleBlockReasonInput, handleUnblockUser,
  promptTempBlock, handleTempBlockInput, showUserOrders, handleResetVerification, showUserList
};

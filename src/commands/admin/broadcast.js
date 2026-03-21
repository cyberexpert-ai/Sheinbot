const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');
const logger = require('../../utils/logger');

async function showBroadcastMenu(ctx) {
  const broadcasts = await db.getBroadcasts(5);
  let text = `📢 *Broadcast Menu*\n\n📋 Recent Broadcasts (last 5):\n`;
  if (!broadcasts.length) { text += 'None yet.'; }
  else { text += broadcasts.map((b, i) => `${i + 1}. ${b.target_type === 'ALL' ? '👥' : '👤'} ${b.message?.slice(0, 40) || '[Photo]'}...`).join('\n'); }
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Broadcast to All', callback_data: 'admin_broadcast_all' }],
        [{ text: '📸 Broadcast with Photo', callback_data: 'admin_broadcast_photo' }],
        [{ text: '💬 Message a User', callback_data: 'admin_msg_user_prompt' }],
        [{ text: '🗑 Delete Broadcast', callback_data: 'admin_broadcast_del_menu' }],
        [{ text: '↩️ Back', callback_data: 'admin_back' }]
      ]
    }
  });
}

async function promptBroadcast(ctx, withPhoto = false) {
  const prompt = withPhoto
    ? '📸 *Broadcast with Photo*\n\nSend the photo with caption (caption = broadcast message):'
    : '📢 *Broadcast Message*\n\nType your broadcast message:';
  await ctx.editMessageText(prompt, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
  });
  await db.setSession(ADMIN_ID, withPhoto ? STATES.ADMIN_BROADCAST_PHOTO : STATES.ADMIN_BROADCAST_MSG, { lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleBroadcastInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoFileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!msgText && !photoFileId) return ctx.reply('⚠️ Please send a message or photo.');
  const users = await db.getAllUsers();
  let sent = 0, failed = 0;
  const broadcast = await db.saveBroadcast(msgText, photoFileId, ADMIN_ID, 'ALL', null);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  const statusMsg = await ctx.reply(`📢 Broadcasting to ${users.length} users...`, { parse_mode: 'Markdown' });
  for (const user of users) {
    try {
      if (photoFileId) {
        await ctx.telegram.sendPhoto(user.telegram_id, photoFileId, { caption: msgText, parse_mode: 'Markdown' });
      } else {
        await ctx.telegram.sendMessage(user.telegram_id, msgText, { parse_mode: 'Markdown' });
      }
      sent++;
    } catch (e) { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
  try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ *Broadcast Complete!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptMessageUser(ctx, prefillUserId = null) {
  await ctx.editMessageText(
    `💬 *Message a User*\n\n${prefillUserId ? `User ID: \`${prefillUserId}\`\n\nNow send the message:` : 'Send the User ID first:'}`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
    }
  );
  if (prefillUserId) {
    await db.setSession(ADMIN_ID, STATES.ADMIN_MSG_USER_TEXT, { targetUserId: prefillUserId, lastMsgId: ctx.callbackQuery?.message?.message_id });
  } else {
    await db.setSession(ADMIN_ID, STATES.ADMIN_MSG_USER_ID, { lastMsgId: ctx.callbackQuery?.message?.message_id });
  }
}

async function handleMsgUserIdInput(ctx) {
  const userId = parseInt(ctx.message?.text?.trim());
  try { await ctx.deleteMessage(); } catch (e) {}
  if (isNaN(userId)) return ctx.reply('⚠️ Invalid User ID.');
  const sess = await db.getSession(ADMIN_ID);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  const msg = await ctx.reply(`💬 Now send the message to user \`${userId}\`:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: 'admin_broadcast_menu' }]] }
  });
  await db.setSession(ADMIN_ID, STATES.ADMIN_MSG_USER_TEXT, { targetUserId: userId, lastMsgId: msg.message_id });
}

async function handleMsgUserTextInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoFileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!msgText && !photoFileId) return ctx.reply('⚠️ Send a message or photo.');
  try {
    if (photoFileId) {
      await ctx.telegram.sendPhoto(sess.data.targetUserId, photoFileId, { caption: msgText ? `📨 *Message from Admin:*\n\n${msgText}` : '📨 Message from Admin', parse_mode: 'Markdown' });
    } else {
      await ctx.telegram.sendMessage(sess.data.targetUserId, `📨 *Message from Admin:*\n\n${msgText}`, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    const msg = await ctx.reply(`❌ Failed to send message. User may have blocked the bot.`, { reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] } });
    await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Message sent to user \`${sess.data.targetUserId}\`!`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showDeleteBroadcastMenu(ctx) {
  const broadcasts = await db.getBroadcasts(10);
  if (!broadcasts.length) return ctx.answerCbQuery('No broadcasts to delete.');
  const buttons = broadcasts.map(b => [{ text: `🗑 ${b.message?.slice(0, 40) || '[Photo]'}`, callback_data: `admin_broadcast_del_${b.id}` }]);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]);
  await ctx.editMessageText('🗑 Select broadcast to delete:', { reply_markup: { inline_keyboard: buttons } });
}

async function handleDeleteBroadcast(ctx, id) {
  await db.deleteBroadcast(id);
  await ctx.answerCbQuery('✅ Broadcast deleted.');
  await showDeleteBroadcastMenu(ctx);
}

module.exports = {
  showBroadcastMenu, promptBroadcast, handleBroadcastInput,
  promptMessageUser, handleMsgUserIdInput, handleMsgUserTextInput,
  showDeleteBroadcastMenu, handleDeleteBroadcast
};

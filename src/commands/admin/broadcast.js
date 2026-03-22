const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');
const logger = require('../../utils/logger');

async function showBroadcastMenu(ctx) {
  const broadcasts = await db.getBroadcasts(5);
  let text = `📢 *Broadcast Menu*\n\n📋 Recent (last 5):\n`;
  if (!broadcasts.length) text += '_None yet._';
  else text += broadcasts.map((b, i) => `${i + 1}. ${b.target_type === 'ALL' ? '👥' : '👤'} ${(b.message || '[Photo]').slice(0, 40)}...`).join('\n');

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📢 Broadcast to All', callback_data: 'ab_all' }],
        [{ text: '📸 Broadcast with Photo', callback_data: 'ab_photo' }],
        [{ text: '💬 Message a User', callback_data: 'ab_user' }],
        [{ text: '🗑 Delete Broadcast', callback_data: 'ab_delmenu' }],
        [{ text: '↩️ Back', callback_data: 'admin_back' }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText(text, opts); } catch (e) {}
  }
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptBroadcast(ctx, withPhoto = false) {
  const text = withPhoto
    ? '📸 *Broadcast with Photo*\n\nSend a photo with caption (caption = message):'
    : '📢 *Broadcast to All*\n\nType your message:';
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
  };
  let msgId;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(text, opts); msgId = ctx.callbackQuery.message.message_id; }
    catch (e) { const m = await ctx.reply(text, opts); msgId = m.message_id; }
  } else {
    const m = await ctx.reply(text, opts); msgId = m.message_id;
  }
  await db.setSession(ADMIN_ID, withPhoto ? STATES.ADMIN_BROADCAST_PHOTO : STATES.ADMIN_BROADCAST_MSG, { lastMsgId: msgId });
}

async function handleBroadcastInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const msgText = ctx.message?.text || ctx.message?.caption || '';
  const photoFileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id || null;
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!msgText && !photoFileId) return ctx.reply('⚠️ Please send a message or photo.');

  const users = await db.getAllUsers();
  await db.saveBroadcast(msgText, photoFileId, ADMIN_ID, 'ALL', null);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}

  const statusMsg = await ctx.reply(`📢 Sending to ${users.length} users...`);
  let sent = 0, failed = 0;

  for (const user of users) {
    try {
      if (photoFileId) {
        await ctx.telegram.sendPhoto(user.telegram_id, photoFileId, { caption: msgText || '', parse_mode: 'Markdown' });
      } else {
        await ctx.telegram.sendMessage(user.telegram_id, msgText, { parse_mode: 'Markdown' });
      }
      sent++;
    } catch (e) { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }

  try { await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(
    `✅ *Broadcast Done!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] } }
  );
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptMessageUser(ctx, prefillUserId = null) {
  const text = prefillUserId
    ? `💬 *Message User*\n\nUser: \`${prefillUserId}\`\n\nNow send the message:`
    : `💬 *Message a User*\n\nSend the User ID first:`;
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
  };
  let msgId;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(text, opts); msgId = ctx.callbackQuery.message.message_id; }
    catch (e) { const m = await ctx.reply(text, opts); msgId = m.message_id; }
  } else {
    const m = await ctx.reply(text, opts); msgId = m.message_id;
  }
  if (prefillUserId) {
    await db.setSession(ADMIN_ID, STATES.ADMIN_MSG_USER_TEXT, { targetUserId: prefillUserId, lastMsgId: msgId });
  } else {
    await db.setSession(ADMIN_ID, STATES.ADMIN_MSG_USER_ID, { lastMsgId: msgId });
  }
}

async function handleMsgUserIdInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const userId = parseInt(ctx.message?.text?.trim());
  try { await ctx.deleteMessage(); } catch (e) {}
  if (isNaN(userId)) {
    const msg = await ctx.reply('⚠️ Invalid User ID. Send a valid Telegram User ID.', {
      reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
    });
    await db.setSession(ADMIN_ID, STATES.ADMIN_MSG_USER_ID, { lastMsgId: msg.message_id });
    return;
  }
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  const msg = await ctx.reply(`💬 Now send the message for user \`${userId}\`:`, {
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
      await ctx.telegram.sendPhoto(sess.data.targetUserId, photoFileId, {
        caption: `📨 *Message from Admin:*\n\n${msgText || ''}`, parse_mode: 'Markdown'
      });
    } else {
      await ctx.telegram.sendMessage(sess.data.targetUserId, `📨 *Message from Admin:*\n\n${msgText}`, { parse_mode: 'Markdown' });
    }
  } catch (e) {
    const msg = await ctx.reply('❌ Failed to send. User may have blocked the bot.', {
      reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
    });
    await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Message sent to \`${sess.data.targetUserId}\`!`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showDeleteBroadcastMenu(ctx) {
  const broadcasts = await db.getBroadcasts(10);
  if (!broadcasts.length) { await ctx.answerCbQuery('No broadcasts to delete.', { show_alert: true }); return; }
  const buttons = broadcasts.map(b => [{ text: `🗑 ${(b.message || '[Photo]').slice(0, 40)}`, callback_data: `ab_del_${b.id}` }]);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_broadcast_menu' }]);
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText('🗑 *Select broadcast to delete:*', opts); } catch (e) {}
  }
  await ctx.reply('🗑 Select broadcast to delete:', opts);
}

async function handleDeleteBroadcast(ctx, id) {
  await db.deleteBroadcast(parseInt(id));
  await ctx.answerCbQuery('✅ Broadcast deleted.');
  await showDeleteBroadcastMenu(ctx);
}

module.exports = {
  showBroadcastMenu, promptBroadcast, handleBroadcastInput,
  promptMessageUser, handleMsgUserIdInput, handleMsgUserTextInput,
  showDeleteBroadcastMenu, handleDeleteBroadcast
};

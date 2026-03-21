const db = require('../../database/database');
const { ADMIN_ID, STATES, CHANNELS } = require('../../utils/constants');
const { formatPrice, formatDate, getStatusEmoji } = require('../../utils/helpers');

async function showOrdersMenu(ctx) {
  const pendingOrders = await db.getPendingOrders();
  let text = `📦 *Order Management*\n\n⏳ Pending: *${pendingOrders.length}*\n\n`;
  if (pendingOrders.length) {
    text += pendingOrders.slice(0, 5).map(o => `• \`${o.order_id}\` | ${o.category_name}×${o.quantity} | ${o.username ? `@${o.username}` : o.first_name}`).join('\n');
  }
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [
      [{ text: '⏳ Pending', callback_data: 'aop_0' }, { text: '✅ Accepted', callback_data: 'aoa_0' }],
      [{ text: '❌ Rejected', callback_data: 'aor_0' }],
      [{ text: '↩️ Back', callback_data: 'admin_back' }]
    ]}
  };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch (e) {} }
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showOrdersByStatus(ctx, status, page = 0) {
  const res = await db.query(
    `SELECT o.*,u.username,u.first_name FROM orders o LEFT JOIN users u ON o.user_id=u.telegram_id WHERE o.status=$1 ORDER BY o.created_at DESC LIMIT 10 OFFSET $2`,
    [status, page * 10]
  );
  const total = parseInt((await db.query('SELECT COUNT(*) FROM orders WHERE status=$1', [status])).rows[0].count);
  const orders = res.rows;
  let text = `📦 *${status} Orders* (${total})\n\n`;
  if (!orders.length) text += 'None found.';
  else text += orders.map(o => `• \`${o.order_id}\`\n  ${o.category_name}×${o.quantity} | ${formatPrice(o.total_price)}`).join('\n\n');

  const prefix = status === 'PENDING' ? 'aop' : status === 'ACCEPTED' ? 'aoa' : 'aor';
  const buttons = orders.map(o => [{ text: `🔍 ${o.order_id}`, callback_data: `aod_${o.order_id}` }]);
  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: `${prefix}_${page - 1}` });
  if ((page + 1) * 10 < total) nav.push({ text: '➡️', callback_data: `${prefix}_${page + 1}` });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_orders' }]);

  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch (e) {} }
  await ctx.reply(text, opts);
}

async function showOrderDetail(ctx, orderId) {
  const order = await db.getOrder(orderId);
  if (!order) return ctx.answerCbQuery('Order not found.');
  const user = await db.getUser(order.user_id);
  const vouchers = await db.getOrderVouchers(orderId);
  const emoji = getStatusEmoji(order.status);

  let text = `🧾 *Order Detail*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${order.order_id}\`\n👤 ${user?.username ? `@${user.username}` : user?.first_name || 'Unknown'} (\`${order.user_id}\`)\n🎟 ${order.category_name}\n📦 Qty: ${order.quantity}\n💰 ${formatPrice(order.total_price)}\n🔑 UTR: \`${order.utr || 'N/A'}\`\n${emoji} ${order.status}\n📅 ${formatDate(order.created_at)}\n━━━━━━━━━━━━━━━━━`;
  if (vouchers.length) text += `\n\n🎟 Codes:\n${vouchers.map(v => `\`${v.voucher_code}\``).join('\n')}`;

  const buttons = [];
  if (order.status === 'PENDING') {
    buttons.push([{ text: '✅ Accept', callback_data: `aac_${orderId}` }, { text: '❌ Reject', callback_data: `arj_${orderId}` }]);
  }
  buttons.push([{ text: '🚀 Force Deliver', callback_data: `afd_${orderId}` }]);
  buttons.push([{ text: '👤 User', callback_data: `avu_${order.user_id}` }, { text: '↩️ Back', callback_data: 'admin_orders' }]);

  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch (e) {} }
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function handleAdminAcceptOrder(ctx, orderId, autoVerify = false) {
  const order = await db.getOrder(orderId);
  if (!order || order.status !== 'PENDING') {
    if (!autoVerify && ctx.callbackQuery) await ctx.answerCbQuery('Already processed.');
    return;
  }

  const vouchers = await db.getAvailableVouchers(order.category_id, order.quantity);
  if (vouchers.length < order.quantity) {
    const text = `⚠️ *Not enough vouchers!*\nOrder: \`${orderId}\`\nNeed: ${order.quantity} | Have: ${vouchers.length}`;
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_orders' }]] } };
    if (ctx.callbackQuery) { try { return await ctx.editMessageText(text, opts); } catch (e) {} }
    await ctx.reply(text, opts);
    return;
  }

  const codes = vouchers.map(v => v.code);
  const ids = vouchers.map(v => v.id);
  await db.markVouchersUsed(ids, orderId);
  await db.addOrderVouchers(orderId, codes);
  await db.updateOrderStatus(orderId, 'ACCEPTED');

  try {
    await ctx.telegram.sendMessage(order.user_id,
      `✅ *Order Accepted & Delivered!*\n\n🧾 \`${orderId}\`\n🎟 ${order.category_name} × ${order.quantity}\n💰 ${formatPrice(order.total_price)}\n\n🎉 *Your Voucher Codes:*\n${codes.map(c => `\`${c}\``).join('\n')}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {}

  if (!autoVerify && ctx.callbackQuery) {
    try {
      await ctx.editMessageCaption(`✅ *Order ${orderId} ACCEPTED*\n\nDelivered ${codes.length} code(s).`, { parse_mode: 'Markdown' });
    } catch (e) {
      try { await ctx.editMessageText(`✅ *Order ${orderId} ACCEPTED*\n\nDelivered ${codes.length} code(s).`, { parse_mode: 'Markdown' }); } catch (e2) {}
    }
  }

  // Notify orders channel
  try {
    const user = await db.getUser(order.user_id);
    const userName = user?.username ? `@${user.username}` : (user?.first_name || 'User');
    await ctx.telegram.sendMessage(CHANNELS.ORDERS_ID,
      `🎯 𝗡𝗲𝘄 𝗢𝗿𝗱𝗲𝗿 𝗦𝘂𝗯𝗺𝗶𝘁𝘁𝗲𝗱\n━━━━━━━━━━━•❈•━━━━━━━━━━━\n╰➤👤 𝗨𝗦𝗘𝗥 𝗡𝗔𝗠𝗘 : ${userName}\n╰➤🆔 𝗨𝗦𝗘𝗥 𝗜𝗗 : ${order.user_id}\n╰➤📡 𝗦𝗧𝗔𝗧𝗨𝗦: ✅ Success\n╰➤ 🔰𝗤𝗨𝗔𝗟𝗜𝗧𝗬: High 📶\n╰➤ 📦𝗧𝗢𝗧𝗔𝗟 𝗤𝗨𝗔𝗡𝗧𝗜𝗧𝗬 : ${order.quantity}\n╰➤ 💳𝗖𝗢𝗦𝗧 : ${formatPrice(order.total_price)}\n\n🤖𝗕𝗢𝗧 𝗡𝗔𝗠𝗘 : @SheinVoucherHub_Bot\n━━━━━━━━━━━•❈•━━━━━━━━━━━`
    );
  } catch (e) {}
}

async function promptRejectOrder(ctx, orderId) {
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Cancel', callback_data: `aod_${orderId}` }]] } };
  const text = `❌ *Reject Order \`${orderId}\`?*\n\nSend rejection reason:`;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageCaption(text, opts); }
    catch (e) { try { await ctx.editMessageText(text, opts); } catch (e2) {} }
  } else { await ctx.reply(text, opts); }
  await db.setSession(ADMIN_ID, STATES.ADMIN_REJECT_ORDER_REASON, { orderId, lastMsgId: ctx.callbackQuery?.message?.message_id });
}

async function handleRejectReasonInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const reason = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!reason) return ctx.reply('⚠️ Please send a reason.');
  const { orderId } = sess.data;
  const order = await db.getOrder(orderId);
  await db.updateOrderStatus(orderId, 'REJECTED', reason);
  try {
    await ctx.telegram.sendMessage(order.user_id,
      `❌ *Order Rejected*\n\n🧾 \`${orderId}\`\n\nReason: ${reason}\n\nContact support if needed.`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🆘 Support', callback_data: 'cb_support' }]] } }
    );
  } catch (e) {}
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Order \`${orderId}\` rejected.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_orders' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function handleForceDeliver(ctx, orderId) {
  const order = await db.getOrder(orderId);
  if (!order) return ctx.answerCbQuery('Order not found.');
  const vouchers = await db.getAvailableVouchers(order.category_id, order.quantity);
  if (!vouchers.length) {
    const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `aod_${orderId}` }]] } };
    try { await ctx.editMessageText(`⚠️ No vouchers in *${order.category_name}*. Add vouchers first.`, opts); } catch (e) {}
    return;
  }
  const codes = vouchers.slice(0, order.quantity).map(v => v.code);
  const ids = vouchers.slice(0, order.quantity).map(v => v.id);
  await db.markVouchersUsed(ids, orderId);
  await db.addOrderVouchers(orderId, codes);
  await db.updateOrderStatus(orderId, 'ACCEPTED');
  try { await ctx.telegram.sendMessage(order.user_id, `✅ *Vouchers Delivered!*\n\n🧾 \`${orderId}\`\n\n${codes.map(c => `\`${c}\``).join('\n')}`, { parse_mode: 'Markdown' }); } catch (e) {}
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_orders' }]] } };
  try { await ctx.editMessageText(`✅ Force delivered ${codes.length} code(s) for \`${orderId}\``, opts); } catch (e) {}
}

module.exports = { showOrdersMenu, showOrdersByStatus, showOrderDetail, handleAdminAcceptOrder, promptRejectOrder, handleRejectReasonInput, handleForceDeliver };

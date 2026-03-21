const db = require('../../database/database');
const { formatPrice, formatDate, getStatusEmoji, safeDelete } = require('../../utils/helpers');

async function showMyOrders(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  // Hide keyboard
  const tmp = await ctx.reply('...', { reply_markup: { remove_keyboard: true } });
  await safeDelete(ctx, ctx.chat.id, tmp.message_id);

  const orders = await db.getOrdersByUser(userId);
  if (!orders.length) {
    const msg = await ctx.reply(
      `📦 *My Orders*\n\n📭 You don't have any orders yet.\n\nTap *Buy Vouchers* to get started!`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'cb_main' }]] } }
    );
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const buttons = orders.slice(0, 10).map(o => {
    const emoji = getStatusEmoji(o.status);
    return [{ text: `${emoji} ${o.order_id} | ${o.category_name} ×${o.quantity} | ${o.status}`, callback_data: `vord_${o.order_id}` }];
  });
  buttons.push([{ text: '🔙 Main Menu', callback_data: 'cb_main' }]);

  const msg = await ctx.reply(`📦 *My Orders* (${orders.length} total)\n\nTap an order for details:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

async function showOrderDetail(ctx, orderId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const order = await db.getOrder(orderId);
  if (!order || String(order.user_id) !== String(userId)) {
    const msg = await ctx.reply(`⚠️ Order not found: \`${orderId}\``, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'cb_orders' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const emoji = getStatusEmoji(order.status);
  let text = `🧾 *Order Details*\n\n━━━━━━━━━━━━━━━━━\n🆔 \`${order.order_id}\`\n🎟 *Category:* ${order.category_name}\n📦 *Qty:* ${order.quantity}\n💰 *Price:* ${formatPrice(order.total_price)}\n${emoji} *Status:* ${order.status}\n📅 *Date:* ${formatDate(order.created_at)}\n━━━━━━━━━━━━━━━━━`;

  if (order.status === 'ACCEPTED') {
    const vouchers = await db.getOrderVouchers(orderId);
    if (vouchers.length) text += `\n\n🎟 *Your Voucher Codes:*\n${vouchers.map(v => `\`${v.voucher_code}\``).join('\n')}`;
  } else if (order.status === 'REJECTED') {
    text += `\n\n❌ *Reason:* ${order.reject_reason || 'Not specified'}`;
  } else if (order.status === 'PENDING') {
    text += `\n\n⏳ Waiting for admin verification...`;
  }

  const msg = await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'cb_orders' }]] }
  });
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
}

module.exports = { showMyOrders, showOrderDetail };

const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');
const { formatPrice } = require('../../utils/helpers');

async function showPriceMenu(ctx) {
  const categories = await db.getCategories(false);
  const text = `💰 *Price Management*\n\nSelect a category to manage price tiers:`;
  const buttons = categories.map(c => [{ text: `📂 ${c.name}`, callback_data: `apc_${c.id}` }]);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_back' }]);
  if (ctx.callbackQuery) return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

async function showCategoryPrices(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  const tiers = await db.getPriceTiers(categoryId);
  const custom = await db.getCustomPricePerUnit(categoryId);

  let text = `💰 *${cat?.name} — Price Tiers*\n\n`;
  if (tiers.length) {
    text += tiers.map(t => `📦 Qty ${t.quantity} → *${formatPrice(t.price)}*`).join('\n');
  } else {
    text += 'No price tiers set yet.';
  }
  if (custom) text += `\n\n✏️ Custom per-unit price: *${formatPrice(custom.price_per_unit)}*`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Add/Update Tier', callback_data: `apa_${categoryId}` }],
        [{ text: '✏️ Set Custom Per-Unit', callback_data: `apcu_${categoryId}` }],
        [{ text: '🗑 Delete a Tier', callback_data: `apdm_${categoryId}` }],
        [{ text: '↩️ Back', callback_data: 'admin_prices' }]
      ]
    }
  });
}

async function promptAddPriceTier(ctx, categoryId) {
  await ctx.editMessageText(
    `➕ *Add/Update Price Tier*\n\nSend in format:\n\`QUANTITY PRICE\`\n\nExample: \`1 149\` means 1 voucher costs ₹149\nExample: \`5 599\` means 5 vouchers cost ₹599`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `apc_${categoryId}` }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_SET_PRICE_QTY, { categoryId, lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handlePriceTierInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const text = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  const parts = text?.split(' ');
  if (!parts || parts.length < 2) {
    return ctx.reply('⚠️ Format: `QUANTITY PRICE` e.g. `3 399`', { parse_mode: 'Markdown' });
  }
  const quantity = parseInt(parts[0]);
  const price = parseFloat(parts[1]);
  if (isNaN(quantity) || isNaN(price) || quantity < 1 || price < 1) {
    return ctx.reply('⚠️ Invalid values. Use format: `QUANTITY PRICE` e.g. `3 399`', { parse_mode: 'Markdown' });
  }
  await db.setPriceTier(sess.data.categoryId, quantity, price);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Price tier set: *${quantity} pcs → ${formatPrice(price)}*`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Prices', callback_data: `apc_${sess.data.categoryId}` }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptSetCustomPrice(ctx, categoryId) {
  await ctx.editMessageText(
    `✏️ *Set Custom Per-Unit Price*\n\nThis price will be used for quantities not in fixed tiers.\n\nSend the price per unit (e.g., \`149\`):`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `apc_${categoryId}` }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_SET_CUSTOM_PRICE, { categoryId, lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleCustomPriceInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const price = parseFloat(ctx.message?.text?.trim());
  try { await ctx.deleteMessage(); } catch (e) {}
  if (isNaN(price) || price < 1) return ctx.reply('⚠️ Invalid price. Send a number like `149`', { parse_mode: 'Markdown' });
  await db.setCustomPricePerUnit(sess.data.categoryId, price);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Custom per-unit price set: *${formatPrice(price)}*`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Prices', callback_data: `apc_${sess.data.categoryId}` }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showDeleteTierMenu(ctx, categoryId) {
  const tiers = await db.getPriceTiers(categoryId);
  if (!tiers.length) return ctx.answerCbQuery('No tiers to delete.');
  const buttons = tiers.map(t => [{ text: `Qty ${t.quantity} — ${formatPrice(t.price)}`, callback_data: `apd_${categoryId}_${t.quantity}` }]);
  buttons.push([{ text: '↩️ Back', callback_data: `apc_${categoryId}` }]);
  await ctx.editMessageText('🗑 Select tier to delete:', { reply_markup: { inline_keyboard: buttons } });
}

async function handleDeleteTier(ctx, categoryId, quantity) {
  await db.deletePriceTier(categoryId, quantity);
  await ctx.answerCbQuery(`✅ Tier Qty ${quantity} deleted.`);
  await showCategoryPrices(ctx, categoryId);
}

module.exports = {
  showPriceMenu, showCategoryPrices, promptAddPriceTier, handlePriceTierInput,
  promptSetCustomPrice, handleCustomPriceInput, showDeleteTierMenu, handleDeleteTier
};

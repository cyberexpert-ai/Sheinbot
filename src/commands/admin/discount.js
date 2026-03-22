const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');

async function showDiscountMenu(ctx) {
  const codes = await db.getAllDiscountCodes();
  let text = `🏷 *Discount Codes* (${codes.length} total)\n\n`;
  if (codes.length) {
    text += codes.slice(0, 8).map(c =>
      `• \`${c.code}\` — ${c.discount_type === 'PERCENT' ? `${c.discount_value}%` : `₹${c.discount_value}`} | ${c.used_count}/${c.max_uses || '∞'} uses | ${c.is_active ? '✅' : '❌'}`
    ).join('\n');
  } else {
    text += '_No discount codes yet._';
  }

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Create Code', callback_data: 'disc_create' }],
        [{ text: '🗑 Delete Code', callback_data: 'disc_delmenu' }, { text: '🔄 Enable/Disable', callback_data: 'disc_togmenu' }],
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

async function promptCreateDiscount(ctx) {
  const text = `➕ *Create Discount Code*\n\nSend in this format:\n\`CODE TYPE VALUE MIN_QTY MAX_USES\`\n\n*Examples:*\n\`SAVE10 PERCENT 10 1 100\` → 10% off, min 1, max 100 uses\n\`FLAT50 FLAT 50 2 0\` → ₹50 off, min 2, unlimited\n\n_TYPE = PERCENT or FLAT | MAX\\_USES = 0 for unlimited_`;
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_discounts' }]] }
  };
  let msgId;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(text, opts); msgId = ctx.callbackQuery.message.message_id; }
    catch (e) { const m = await ctx.reply(text, opts); msgId = m.message_id; }
  } else {
    const m = await ctx.reply(text, opts); msgId = m.message_id;
  }
  await db.setSession(ADMIN_ID, STATES.ADMIN_DISCOUNT_CODE, { lastMsgId: msgId });
}

async function handleCreateDiscountInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const text = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}

  const fail = async (errText) => {
    try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
    const msg = await ctx.reply(errText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_discounts' }]] }
    });
    await db.setSession(ADMIN_ID, STATES.ADMIN_DISCOUNT_CODE, { lastMsgId: msg.message_id });
  };

  if (!text) return;
  const parts = text.split(/\s+/);
  if (parts.length < 5) return fail('⚠️ Need 5 values:\n`CODE TYPE VALUE MIN_QTY MAX_USES`\n\nExample: `SAVE10 PERCENT 10 1 100`');

  const [code, type, value, minQty, maxUses] = parts;
  if (!['PERCENT', 'FLAT'].includes(type.toUpperCase())) return fail('⚠️ TYPE must be `PERCENT` or `FLAT`');
  const numVal = parseFloat(value), numMin = parseInt(minQty), numMax = parseInt(maxUses);
  if (isNaN(numVal) || isNaN(numMin) || isNaN(numMax)) return fail('⚠️ VALUE, MIN\\_QTY, MAX\\_USES must be numbers');
  if (type.toUpperCase() === 'PERCENT' && (numVal <= 0 || numVal > 100)) return fail('⚠️ PERCENT must be 1–100');

  const created = await db.createDiscountCode(code.toUpperCase(), type.toUpperCase(), numVal, null, numMin, numMax === 0 ? null : numMax, null);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);

  const msg = await ctx.reply(
    `✅ *Code Created!*\n\n🏷 \`${created.code}\`\n💰 ${type.toUpperCase() === 'PERCENT' ? `${numVal}% off` : `₹${numVal} off`}\n📦 Min Qty: ${numMin}\n🔢 Max Uses: ${numMax === 0 ? '∞ Unlimited' : numMax}`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Discounts', callback_data: 'admin_discounts' }]] } }
  );
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showDeleteDiscountMenu(ctx) {
  const codes = await db.getAllDiscountCodes();
  if (!codes.length) { await ctx.answerCbQuery('No codes to delete.', { show_alert: true }); return; }
  const buttons = codes.map(c => [{ text: `🗑 ${c.code} (${c.is_active ? '✅' : '❌'})`, callback_data: `disc_del_${c.id}` }]);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_discounts' }]);
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText('🗑 *Select code to delete:*', opts); } catch (e) {}
  }
  await ctx.reply('🗑 Select code to delete:', opts);
}

async function handleDeleteDiscount(ctx, id) {
  const codes = await db.getAllDiscountCodes();
  const found = codes.find(c => c.id == id);
  await db.deleteDiscountCode(parseInt(id));
  await ctx.answerCbQuery(`✅ "${found?.code || id}" deleted.`);
  await showDiscountMenu(ctx);
}

async function showToggleDiscountMenu(ctx) {
  const codes = await db.getAllDiscountCodes();
  if (!codes.length) { await ctx.answerCbQuery('No codes found.', { show_alert: true }); return; }
  const buttons = codes.map(c => [{
    text: `${c.is_active ? '🔴 Disable' : '🟢 Enable'} — ${c.code}`,
    callback_data: `disc_tog_${c.id}_${c.is_active ? '0' : '1'}`
  }]);
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_discounts' }]);
  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText('🔄 *Toggle Discount Codes:*', opts); } catch (e) {}
  }
  await ctx.reply('🔄 Toggle Discount Codes:', opts);
}

async function handleToggleDiscount(ctx, id, active) {
  await db.toggleDiscountCode(parseInt(id), active === '1');
  await ctx.answerCbQuery(`✅ ${active === '1' ? 'Enabled ✅' : 'Disabled ❌'}`);
  await showDiscountMenu(ctx);
}

module.exports = {
  showDiscountMenu, promptCreateDiscount, handleCreateDiscountInput,
  showDeleteDiscountMenu, handleDeleteDiscount, showToggleDiscountMenu, handleToggleDiscount
};

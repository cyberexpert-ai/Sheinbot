const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');

async function showVoucherMenu(ctx) {
  const categories = await db.getCategories(false);
  const text = `🎟 *Voucher Management*\n\nSelect a category to manage vouchers:`;
  const buttons = categories.map(c => ([{ text: `📂 ${c.name}`, callback_data: `avc_${c.id}` }]));
  buttons.push([{ text: '↩️ Back', callback_data: 'admin_back' }]);
  if (ctx.callbackQuery) return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

async function showVoucherCategoryPanel(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  const stats = await db.getVoucherStats(categoryId);
  const text = `🎟 *${cat?.name} Vouchers*\n\n📦 Available: *${stats?.available || 0}*\n✅ Used: *${stats?.used || 0}*\n📊 Total: *${stats?.total || 0}*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Add Single', callback_data: `avs_${categoryId}` }, { text: '📋 Add Bulk', callback_data: `avb_${categoryId}` }],
        [{ text: '👁 View Codes', callback_data: `avl_${categoryId}` }, { text: '🗑 Delete All Unused', callback_data: `avda_${categoryId}` }],
        [{ text: '↩️ Back', callback_data: 'admin_vouchers' }]
      ]
    }
  });
}

async function promptAddSingleVoucher(ctx, categoryId) {
  await ctx.editMessageText(
    `➕ *Add Single Voucher*\n\nSend the voucher code for this category:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avc_${categoryId}` }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_ADD_VOUCHER_SINGLE, { categoryId, lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleSingleVoucherInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const code = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!code) return;
  const result = await db.addVoucher(sess.data.categoryId, code);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(result ? `✅ Voucher added: \`${code}\`` : `⚠️ Voucher already exists: \`${code}\``, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avc_${sess.data.categoryId}` }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptAddBulkVouchers(ctx, categoryId) {
  await ctx.editMessageText(
    `📋 *Add Bulk Vouchers*\n\nSend all voucher codes — *one per line*:\n\nExample:\nCODE001\nCODE002\nCODE003`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avc_${categoryId}` }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_ADD_VOUCHER_BULK, { categoryId, lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleBulkVoucherInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const text = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!text) return;
  const codes = text.split('\n').map(c => c.trim()).filter(Boolean);
  const added = await db.addBulkVouchers(sess.data.categoryId, codes);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ *Bulk Upload Complete*\n\n📋 Submitted: ${codes.length}\n✅ Added: ${added}\n⚠️ Duplicates skipped: ${codes.length - added}`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avc_${sess.data.categoryId}` }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function showVoucherList(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  const vouchers = await db.getVoucherList(categoryId, 20);
  let text = `👁 *${cat?.name} — Voucher Codes (last 20)*\n\n`;
  if (!vouchers.length) {
    text += 'No vouchers found.';
  } else {
    text += vouchers.map((v, i) => `${i + 1}. \`${v.code}\` ${v.is_used ? '✅ Used' : '⭕ Available'}`).join('\n');
  }
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avc_${categoryId}` }]] }
  });
}

async function handleDeleteAllVouchers(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  await ctx.editMessageText(
    `⚠️ *Delete All Unused Vouchers?*\n\nCategory: *${cat?.name}*\n\nThis will delete all unused (available) voucher codes. Used ones will remain.`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Confirm Delete', callback_data: `avdc_${categoryId}` }, { text: '❌ Cancel', callback_data: `avc_${categoryId}` }]
        ]
      }
    }
  );
}

async function confirmDeleteAllVouchers(ctx, categoryId) {
  await db.deleteAllVouchersInCategory(categoryId, true);
  const cat = await db.getCategory(categoryId);
  await ctx.editMessageText(`✅ All unused vouchers deleted from *${cat?.name}*`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: `avc_${categoryId}` }]] }
  });
}

module.exports = {
  showVoucherMenu, showVoucherCategoryPanel,
  promptAddSingleVoucher, handleSingleVoucherInput,
  promptAddBulkVouchers, handleBulkVoucherInput,
  showVoucherList, handleDeleteAllVouchers, confirmDeleteAllVouchers
};

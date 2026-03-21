const db = require('../database/database');
const { STATES, ADMIN_ID } = require('../utils/constants');
const { deleteUserMsg } = require('../utils/helpers');

const { handleScreenshotReceived, handleUTRReceived } = require('../commands/user/buyVoucher');
const { handleRecoveryInput } = require('../commands/user/recoverVoucher');
const { handleSupportMessage } = require('../commands/user/support');
const { handleAddCategoryInput, handleRenameCategoryInput } = require('../commands/admin/category');
const { handleSingleVoucherInput, handleBulkVoucherInput } = require('../commands/admin/voucher');
const { handlePriceTierInput, handleCustomPriceInput } = require('../commands/admin/price');
const { handleBlockReasonInput, handleTempBlockInput, handleSearchUserInput } = require('../commands/admin/userManage');
const { handleBroadcastInput, handleMsgUserIdInput, handleMsgUserTextInput } = require('../commands/admin/broadcast');
const { handleCreateDiscountInput } = require('../commands/admin/discount');
const { handleRejectReasonInput } = require('../commands/admin/orderManage');
const { handleRecoveryResponseInput, handleRecoveryRejectInput } = require('../commands/admin/recoveryManage');

// Reply keyboard button mapping
const MENU_MAP = {
  '🛍 Buy Vouchers':       async (ctx) => { const { showCategories } = require('../commands/user/buyVoucher'); return showCategories(ctx); },
  '🔁 Recover Vouchers':  async (ctx) => { const { showRecoverPage } = require('../commands/user/recoverVoucher'); return showRecoverPage(ctx); },
  '📦 My Orders':         async (ctx) => { const { showMyOrders } = require('../commands/user/myOrders'); return showMyOrders(ctx); },
  '🆘 Support':           async (ctx) => { const { showSupport } = require('../commands/user/support'); return showSupport(ctx); },
  '📜 Disclaimer':        async (ctx) => { const { showDisclaimer } = require('../commands/user/support'); return showDisclaimer(ctx); }
};

async function handleMessage(ctx) {
  if (!ctx.message || !ctx.from) return;
  const userId = ctx.from.id;
  const msgText = ctx.message?.text || '';

  // Maintenance check (skip admin)
  if (userId !== ADMIN_ID) {
    const r = await db.query("SELECT value FROM settings WHERE key='maintenance_mode'");
    if (r.rows[0]?.value === 'true') {
      try { await ctx.deleteMessage(); } catch (e) {}
      await ctx.reply('🔧 Bot is under maintenance. Please try again later.');
      return;
    }
  }

  const sess = await db.getSession(userId);

  // ── REPLY KEYBOARD (user) ──────────────────────────────────────
  if (userId !== ADMIN_ID && MENU_MAP[msgText]) {
    try { await ctx.deleteMessage(); } catch (e) {}
    await db.clearSession(userId);
    return MENU_MAP[msgText](ctx);
  }

  // ── ADMIN STATES ───────────────────────────────────────────────
  if (userId === ADMIN_ID) {
    if (sess.state === STATES.ADMIN_ADD_CATEGORY_NAME) return handleAddCategoryInput(ctx);
    if (sess.state === STATES.ADMIN_RENAME_CATEGORY) return handleRenameCategoryInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_VOUCHER_SINGLE) return handleSingleVoucherInput(ctx);
    if (sess.state === STATES.ADMIN_ADD_VOUCHER_BULK) return handleBulkVoucherInput(ctx);
    if (sess.state === STATES.ADMIN_SET_PRICE_QTY) return handlePriceTierInput(ctx);
    if (sess.state === STATES.ADMIN_SET_CUSTOM_PRICE) return handleCustomPriceInput(ctx);
    if (sess.state === STATES.ADMIN_BLOCK_REASON) return handleBlockReasonInput(ctx);
    if (sess.state === STATES.ADMIN_TEMP_BLOCK_DURATION) return handleTempBlockInput(ctx);
    if (sess.state === 'ADMIN_SEARCH_USER') return handleSearchUserInput(ctx);
    if (sess.state === STATES.ADMIN_BROADCAST_MSG || sess.state === STATES.ADMIN_BROADCAST_PHOTO) return handleBroadcastInput(ctx);
    if (sess.state === STATES.ADMIN_MSG_USER_ID) return handleMsgUserIdInput(ctx);
    if (sess.state === STATES.ADMIN_MSG_USER_TEXT) return handleMsgUserTextInput(ctx);
    if (sess.state === STATES.ADMIN_DISCOUNT_CODE) return handleCreateDiscountInput(ctx);
    if (sess.state === STATES.ADMIN_REJECT_ORDER_REASON) return handleRejectReasonInput(ctx);
    if (sess.state === STATES.ADMIN_RECOVERY_RESP_TEXT) return handleRecoveryResponseInput(ctx);
    if (sess.state === STATES.ADMIN_RECOVERY_REJECT_REASON) return handleRecoveryRejectInput(ctx);
  }

  // ── USER STATES ────────────────────────────────────────────────
  if (sess.state === STATES.BUY_AWAITING_SCREENSHOT) return handleScreenshotReceived(ctx);
  if (sess.state === STATES.BUY_AWAITING_UTR) return handleUTRReceived(ctx);
  if (sess.state === STATES.BUY_CUSTOM_QUANTITY) return handleCustomQty(ctx, sess);
  if (sess.state === STATES.RECOVER_AWAITING_ID) return handleRecoveryInput(ctx);
  if (sess.state === STATES.SUPPORT_AWAITING_MSG) return handleSupportMessage(ctx);

  // ── UNHANDLED ──────────────────────────────────────────────────
  if (userId !== ADMIN_ID) {
    try { await ctx.deleteMessage(); } catch (e) {}
    const msg = await ctx.reply('❓ Use the menu buttons below or /start.', {
      reply_markup: { inline_keyboard: [[{ text: '🏠 Main Menu', callback_data: 'cb_main' }]] }
    });
    setTimeout(async () => { try { await ctx.telegram.deleteMessage(ctx.chat.id, msg.message_id); } catch (e) {} }, 4000);
  }
}

async function handleCustomQty(ctx, sess) {
  const qty = parseInt(ctx.message?.text?.trim());
  try { await ctx.deleteMessage(); } catch (e) {}
  const { categoryId, maxStock, pricePerUnit } = sess.data;

  if (isNaN(qty) || qty < 1) return ctx.reply('⚠️ Enter a valid quantity (min 1).');
  if (qty > maxStock) return ctx.reply(`⚠️ Only *${maxStock}* available. Enter a lower quantity.`, { parse_mode: 'Markdown' });

  let totalPrice = pricePerUnit
    ? Math.ceil(parseFloat(pricePerUnit) * qty)
    : await db.getPrice(categoryId, qty);

  if (!totalPrice) return ctx.reply('⚠️ Price not set for this quantity. Contact admin or choose a preset.', {
    reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `bc${categoryId}` }]] }
  });

  const { showPaymentPage } = require('../commands/user/buyVoucher');
  await showPaymentPage(ctx, categoryId, qty, totalPrice);
}

module.exports = { handleMessage };

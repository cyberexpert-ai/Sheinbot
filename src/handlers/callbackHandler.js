const db = require('../database/database');
const { ADMIN_ID } = require('../utils/constants');
const { checkChannels, getJoinMessage, getJoinKeyboard } = require('../middlewares/channelCheck');

const { showMainMenu } = require('../commands/user/index');
const { showCategories, showQuantitySelection, promptCustomQuantity, showPaymentPage, askForScreenshot } = require('../commands/user/buyVoucher');
const { showMyOrders, showOrderDetail } = require('../commands/user/myOrders');
const { showRecoverPage } = require('../commands/user/recoverVoucher');
const { showSupport, showDisclaimer } = require('../commands/user/support');
const { showAdminPanel } = require('../commands/admin/index');
const { showCategoryMenu, promptAddCategory, promptRenameCategory, handleToggleCategory, handleDeleteCategory, confirmDeleteCategory } = require('../commands/admin/category');
const { showVoucherMenu, showVoucherCategoryPanel, promptAddSingleVoucher, promptAddBulkVouchers, showVoucherList, handleDeleteAllVouchers, confirmDeleteAllVouchers } = require('../commands/admin/voucher');
const { showPriceMenu, showCategoryPrices, promptAddPriceTier, promptSetCustomPrice, showDeleteTierMenu, handleDeleteTier } = require('../commands/admin/price');
const { showUserManageMenu, promptSearchUser, showUserProfile, promptBlockUser, handleUnblockUser, promptTempBlock, showUserOrders, handleResetVerification, showUserList } = require('../commands/admin/userManage');
const { showOrdersMenu, showOrdersByStatus, showOrderDetail: adminOrderDetail, handleAdminAcceptOrder, promptRejectOrder, handleForceDeliver } = require('../commands/admin/orderManage');
const { showBroadcastMenu, promptBroadcast, promptMessageUser, showDeleteBroadcastMenu, handleDeleteBroadcast } = require('../commands/admin/broadcast');
const { showDiscountMenu, promptCreateDiscount, showDeleteDiscountMenu, handleDeleteDiscount, showToggleDiscountMenu, handleToggleDiscount } = require('../commands/admin/discount');
const { showStats } = require('../commands/admin/stats');
const { showSecurityPanel, handleToggleBharatPay, handleToggleMaintenance, showDuplicateUTRs, handleExpireOldRecoveries, showAdminSettings } = require('../commands/admin/security');
const { promptRecoveryResponse, promptRecoveryReject } = require('../commands/admin/recoveryManage');

async function handleCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const userId = ctx.from.id;
  const isAdmin = userId === ADMIN_ID;

  await ctx.answerCbQuery().catch(() => {});

  // Maintenance (skip admin)
  if (!isAdmin) {
    const r = await db.query("SELECT value FROM settings WHERE key='maintenance_mode'");
    if (r.rows[0]?.value === 'true') {
      try { await ctx.deleteMessage(); } catch (e) {}
      await ctx.reply('🔧 Bot is under maintenance. Please try again later.');
      return;
    }
  }

  // ── CHANNEL VERIFY ─────────────────────────────────────────────
  if (data === 'verify_ch') {
    const { allJoined } = await checkChannels(ctx);
    if (!allJoined) { await ctx.answerCbQuery('❌ Please join both channels first!', { show_alert: true }); return; }
    await db.setUserVerified(userId, true);
    try { await ctx.deleteMessage(); } catch (e) {}
    return showMainMenu(ctx);
  }

  // Channel re-check for non-admin
  if (!isAdmin) {
    const user = await db.getUser(userId);
    if (user?.is_verified) {
      const { allJoined } = await checkChannels(ctx);
      if (!allJoined) {
        await db.setUserVerified(userId, false);
        try { await ctx.deleteMessage(); } catch (e) {}
        await ctx.reply(getJoinMessage(), { parse_mode: 'Markdown', reply_markup: getJoinKeyboard() });
        return;
      }
    }
  }

  // ── MAIN MENU ──────────────────────────────────────────────────
  if (data === 'cb_main') {
    try { await ctx.deleteMessage(); } catch (e) {}
    await db.clearSession(userId);
    return showMainMenu(ctx);
  }

  // ── USER MENU SHORTCUTS ────────────────────────────────────────
  if (data === 'cb_buy') { try { await ctx.deleteMessage(); } catch (e) {} await db.clearSession(userId); return showCategories(ctx); }
  if (data === 'cb_recover') { try { await ctx.deleteMessage(); } catch (e) {} await db.clearSession(userId); return showRecoverPage(ctx); }
  if (data === 'cb_orders') { try { await ctx.deleteMessage(); } catch (e) {} await db.clearSession(userId); return showMyOrders(ctx); }
  if (data === 'cb_support') { try { await ctx.deleteMessage(); } catch (e) {} await db.clearSession(userId); return showSupport(ctx); }
  if (data === 'cb_disclaimer') { try { await ctx.deleteMessage(); } catch (e) {} await db.clearSession(userId); return showDisclaimer(ctx); }

  if (data === 'nostock') { await ctx.answerCbQuery('😔 Out of stock! Check back later.', { show_alert: true }); return; }

  // ── BUY FLOW ───────────────────────────────────────────────────
  if (data.startsWith('bcustom_')) {
    const catId = parseInt(data.replace('bcustom_', ''));
    try { await ctx.deleteMessage(); } catch (e) {}
    return promptCustomQuantity(ctx, catId);
  }
  if (data.startsWith('bc') && /^bc\d+$/.test(data)) {
    const catId = parseInt(data.replace('bc', ''));
    try { await ctx.deleteMessage(); } catch (e) {}
    return showQuantitySelection(ctx, catId);
  }
  if (data.startsWith('bq_')) {
    const parts = data.replace('bq_', '').split('_');
    const catId = parseInt(parts[0]), qty = parseInt(parts[1]), price = parseInt(parts[2]);
    try { await ctx.deleteMessage(); } catch (e) {}
    return showPaymentPage(ctx, catId, qty, price);
  }
  if (data.startsWith('bpaid_')) {
    const parts = data.replace('bpaid_', '').split('_');
    const catId = parseInt(parts[0]), qty = parseInt(parts[1]), price = parseInt(parts[2]);
    return askForScreenshot(ctx, catId, qty, price);
  }
  if (data.startsWith('vord_')) return showOrderDetail(ctx, data.replace('vord_', ''));

  // ── ADMIN ONLY ─────────────────────────────────────────────────
  if (!isAdmin) return;

  if (data === 'admin_back') return showAdminPanel(ctx, true);
  if (data === 'admin_categories') return showCategoryMenu(ctx);
  if (data === 'admin_vouchers') return showVoucherMenu(ctx);
  if (data === 'admin_prices') return showPriceMenu(ctx);
  if (data === 'admin_orders') return showOrdersMenu(ctx);
  if (data === 'admin_users') return showUserManageMenu(ctx);
  if (data === 'admin_broadcast_menu') return showBroadcastMenu(ctx);
  if (data === 'admin_discounts') return showDiscountMenu(ctx);
  if (data === 'admin_stats') return showStats(ctx);
  if (data === 'admin_security') return showSecurityPanel(ctx);
  if (data === 'admin_settings') return showAdminSettings(ctx);
  if (data === 'admin_user_search') return promptSearchUser(ctx);

  // Categories
  if (data === 'admin_cat_add') return promptAddCategory(ctx);
  if (data.startsWith('ace_')) return promptRenameCategory(ctx, parseInt(data.replace('ace_', '')));
  if (data.startsWith('act_')) return handleToggleCategory(ctx, parseInt(data.replace('act_', '')));
  if (data.startsWith('acd_')) return handleDeleteCategory(ctx, parseInt(data.replace('acd_', '')));
  if (data.startsWith('acdc_')) return confirmDeleteCategory(ctx, parseInt(data.replace('acdc_', '')));

  // Vouchers
  if (data.startsWith('avc_')) return showVoucherCategoryPanel(ctx, parseInt(data.replace('avc_', '')));
  if (data.startsWith('avs_')) return promptAddSingleVoucher(ctx, parseInt(data.replace('avs_', '')));
  if (data.startsWith('avb_')) return promptAddBulkVouchers(ctx, parseInt(data.replace('avb_', '')));
  if (data.startsWith('avl_')) return showVoucherList(ctx, parseInt(data.replace('avl_', '')));
  if (data.startsWith('avda_')) return handleDeleteAllVouchers(ctx, parseInt(data.replace('avda_', '')));
  if (data.startsWith('avdc_')) return confirmDeleteAllVouchers(ctx, parseInt(data.replace('avdc_', '')));

  // Prices
  if (data.startsWith('apc_')) return showCategoryPrices(ctx, parseInt(data.replace('apc_', '')));
  if (data.startsWith('apa_')) return promptAddPriceTier(ctx, parseInt(data.replace('apa_', '')));
  if (data.startsWith('apcu_')) return promptSetCustomPrice(ctx, parseInt(data.replace('apcu_', '')));
  if (data.startsWith('apdm_')) return showDeleteTierMenu(ctx, parseInt(data.replace('apdm_', '')));
  if (data.startsWith('apd_')) {
    const parts = data.replace('apd_', '').split('_');
    return handleDeleteTier(ctx, parseInt(parts[0]), parseInt(parts[1]));
  }

  // Orders
  if (data.startsWith('aop_')) return showOrdersByStatus(ctx, 'PENDING', parseInt(data.replace('aop_', '')));
  if (data.startsWith('aoa_')) return showOrdersByStatus(ctx, 'ACCEPTED', parseInt(data.replace('aoa_', '')));
  if (data.startsWith('aor_')) return showOrdersByStatus(ctx, 'REJECTED', parseInt(data.replace('aor_', '')));
  if (data.startsWith('aod_')) return adminOrderDetail(ctx, data.replace('aod_', ''));
  if (data.startsWith('aac_')) return handleAdminAcceptOrder(ctx, data.replace('aac_', ''));
  if (data.startsWith('arj_')) return promptRejectOrder(ctx, data.replace('arj_', ''));
  if (data.startsWith('afd_')) return handleForceDeliver(ctx, data.replace('afd_', ''));

  // Users
  if (data.startsWith('aul_')) return showUserList(ctx, parseInt(data.replace('aul_', '')));
  if (data.startsWith('avu_')) return showUserProfile(ctx, parseInt(data.replace('avu_', '')), true);
  if (data.startsWith('abp_')) return promptBlockUser(ctx, parseInt(data.replace('abp_', '')));
  if (data.startsWith('aub_')) return handleUnblockUser(ctx, parseInt(data.replace('aub_', '')));
  if (data.startsWith('atb_')) return promptTempBlock(ctx, parseInt(data.replace('atb_', '')));
  if (data.startsWith('arv_')) return handleResetVerification(ctx, parseInt(data.replace('arv_', '')));
  if (data.startsWith('auo_')) return showUserOrders(ctx, parseInt(data.replace('auo_', '')));
  if (data.startsWith('absup_')) return promptBlockUser(ctx, parseInt(data.replace('absup_', '')));

  // Broadcast — ab_all, ab_photo, ab_user, ab_delmenu, ab_del_ID
  if (data === 'ab_all') return promptBroadcast(ctx, false);
  if (data === 'ab_photo') return promptBroadcast(ctx, true);
  if (data === 'ab_user') return promptMessageUser(ctx);
  if (data === 'ab_delmenu') return showDeleteBroadcastMenu(ctx);
  if (data.startsWith('ab_del_')) return handleDeleteBroadcast(ctx, parseInt(data.replace('ab_del_', '')));
  if (data.startsWith('amu_')) return promptMessageUser(ctx, parseInt(data.replace('amu_', '')));

  // Discounts — disc_create, disc_delmenu, disc_togmenu, disc_del_ID, disc_tog_ID_VAL
  if (data === 'disc_create') return promptCreateDiscount(ctx);
  if (data === 'disc_delmenu') return showDeleteDiscountMenu(ctx);
  if (data === 'disc_togmenu') return showToggleDiscountMenu(ctx);
  if (data.startsWith('disc_del_')) return handleDeleteDiscount(ctx, parseInt(data.replace('disc_del_', '')));
  if (data.startsWith('disc_tog_')) {
    const parts = data.replace('disc_tog_', '').split('_');
    return handleToggleDiscount(ctx, parseInt(parts[0]), parts[1]);
  }

  // Security
  if (data.startsWith('abpay_')) return handleToggleBharatPay(ctx, data.replace('abpay_', ''));
  if (data.startsWith('amaint_')) return handleToggleMaintenance(ctx, data.replace('amaint_', ''));
  if (data === 'admin_check_utrs') return showDuplicateUTRs(ctx);
  if (data === 'admin_expire_rec') return handleExpireOldRecoveries(ctx);

  // Recovery admin — ars_ORDER_USER, arr_ORDER_USER
  if (data.startsWith('ars_')) {
    const rest = data.replace('ars_', '');
    const li = rest.lastIndexOf('_');
    return promptRecoveryResponse(ctx, rest.substring(0, li), parseInt(rest.substring(li + 1)));
  }
  if (data.startsWith('arr_')) {
    const rest = data.replace('arr_', '');
    const li = rest.lastIndexOf('_');
    return promptRecoveryReject(ctx, rest.substring(0, li), parseInt(rest.substring(li + 1)));
  }
}

module.exports = { handleCallback };

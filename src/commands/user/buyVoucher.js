const db = require('../../database/database');
const { Markup } = require('telegraf');
const { STATES, QR_IMAGE, ADMIN_ID, ILLEGAL_PATTERNS } = require('../../utils/constants');
const { generateOrderId, formatPrice, formatDate, safeDelete, deleteUserMsg } = require('../../utils/helpers');
const logger = require('../../utils/logger');

// Hides the reply keyboard
const hideKb = Markup.removeKeyboard();

async function showCategories(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const categories = await db.getCategories(true);
  if (!categories.length) {
    const msg = await ctx.reply('❌ *No voucher categories available.*\n\nPlease check back later.', {
      parse_mode: 'Markdown',
      ...hideKb,
      reply_markup: { inline_keyboard: [[{ text: '🔙 Main Menu', callback_data: 'cb_main' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const buttons = [];
  for (const cat of categories) {
    const stock = await db.getCategoryStock(cat.id);
    buttons.push([{
      text: stock > 0 ? `${cat.name} — ${stock} available` : `${cat.name} — Out of Stock`,
      callback_data: stock > 0 ? `bc${cat.id}` : 'nostock'
    }]);
  }
  buttons.push([{ text: '🔙 Main Menu', callback_data: 'cb_main' }]);

  // Send with remove_keyboard to hide the reply keyboard
  const msg = await ctx.reply('🛒 *Buy Voucher*\n\n📂 Select a category:', {
    parse_mode: 'Markdown',
    reply_markup: { remove_keyboard: true }
  });
  // Delete that and send with inline
  await safeDelete(ctx, ctx.chat.id, msg.message_id);
  const msg2 = await ctx.reply('🛒 *Buy Voucher*\n\n📂 Select a category:', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons }
  });
  await db.setSession(userId, STATES.BUY_SELECT_CATEGORY, { lastMsgId: msg2.message_id });
}

async function showQuantitySelection(ctx, categoryId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const category = await db.getCategory(categoryId);
  if (!category) return showCategories(ctx);

  const stock = await db.getCategoryStock(categoryId);
  if (stock === 0) {
    const msg = await ctx.reply(`😔 *Out of Stock*\n\n*${category.name}* is currently out of stock.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: 'cb_buy' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const priceTiers = await db.getPriceTiers(categoryId);
  const customPrice = await db.getCustomPricePerUnit(categoryId);

  const btns = [];
  for (const tier of priceTiers) {
    if (tier.quantity <= stock) {
      const priceInt = Math.round(parseFloat(tier.price));
      btns.push({ text: `${tier.quantity} pc${tier.quantity > 1 ? 's' : ''} — ${formatPrice(tier.price)}`, callback_data: `bq_${categoryId}_${tier.quantity}_${priceInt}` });
    }
  }

  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
  if (customPrice) rows.push([{ text: '✏️ Custom Quantity', callback_data: `bcustom_${categoryId}` }]);
  rows.push([{ text: '🔙 Back', callback_data: 'cb_buy' }]);

  const msg = await ctx.reply(
    `🛒 *${category.name}*\n\n📦 *Stock:* ${stock} available\n\n💰 *Select Quantity:*`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: rows } }
  );
  await db.setSession(userId, STATES.BUY_SELECT_QUANTITY, { lastMsgId: msg.message_id, categoryId, categoryName: category.name });
}

async function promptCustomQuantity(ctx, categoryId) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const category = await db.getCategory(categoryId);
  const stock = await db.getCategoryStock(categoryId);
  const customPrice = await db.getCustomPricePerUnit(categoryId);

  const msg = await ctx.reply(
    `✏️ *Custom Quantity*\n\n📂 *Category:* ${category.name}\n📦 *Stock:* ${stock}${customPrice ? `\n💰 *Per unit:* ${formatPrice(customPrice.price_per_unit)}` : ''}\n\nType a quantity (max ${stock}):`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `bc${categoryId}` }]] } }
  );
  await db.setSession(userId, STATES.BUY_CUSTOM_QUANTITY, {
    lastMsgId: msg.message_id, categoryId, categoryName: category.name,
    maxStock: stock, pricePerUnit: customPrice?.price_per_unit || null
  });
}

async function showPaymentPage(ctx, categoryId, quantity, totalPrice) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const category = await db.getCategory(categoryId);
  const priceInt = Math.round(totalPrice);

  const msg = await ctx.replyWithPhoto(QR_IMAGE, {
    caption: `💳 *Payment Details*\n\n━━━━━━━━━━━━━━━━━\n🎟 *Category:* ${category?.name}\n📦 *Quantity:* ${quantity}\n💰 *Total:* ${formatPrice(totalPrice)}\n━━━━━━━━━━━━━━━━━\n\n📲 Scan QR & pay *exactly* ${formatPrice(totalPrice)}\n\n⚠️ Fake payment = *permanent ban*`,
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ I Have Paid', callback_data: `bpaid_${categoryId}_${quantity}_${priceInt}` }],
        [{ text: '🔙 Back', callback_data: `bc${categoryId}` }]
      ]
    }
  });
  await db.setSession(userId, STATES.BUY_SELECT_QUANTITY, {
    lastMsgId: msg.message_id, isPhoto: true,
    categoryId, categoryName: category?.name, quantity, totalPrice
  });
}

async function askForScreenshot(ctx, categoryId, quantity, totalPrice) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const msg = await ctx.reply(
    `📸 *Upload Payment Screenshot*\n\n🎟 *Category:* ${sess.data.categoryName || ''}\n💰 *Amount:* ${formatPrice(totalPrice)}\n\nSend your payment screenshot photo now.\n\n⚠️ Fake screenshots = *permanent ban*`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `bc${categoryId}` }]] }
    }
  );
  await db.setSession(userId, STATES.BUY_AWAITING_SCREENSHOT, {
    lastMsgId: msg.message_id, categoryId, quantity, totalPrice, categoryName: sess.data.categoryName
  });
}

async function handleScreenshotReceived(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.state !== STATES.BUY_AWAITING_SCREENSHOT) return;

  const photoFileId = ctx.message?.photo?.[ctx.message.photo.length - 1]?.file_id;
  if (!photoFileId) {
    await ctx.reply('⚠️ Please send a *photo* of your payment screenshot.', { parse_mode: 'Markdown' });
    return;
  }
  await deleteUserMsg(ctx);
  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const { categoryId, quantity, totalPrice, categoryName } = sess.data;
  const msg = await ctx.reply(
    `🔢 *Enter UTR / Transaction Reference ID*\n\n🎟 *Category:* ${categoryName}\n💰 *Amount:* ${formatPrice(totalPrice)}\n\nSend your 12-digit UTR number.\n\n⚠️ Fake or duplicate UTR = *immediate ban*`,
    {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🔙 Back', callback_data: `bc${categoryId}` }]] }
    }
  );
  await db.setSession(userId, STATES.BUY_AWAITING_UTR, {
    lastMsgId: msg.message_id, categoryId, quantity, totalPrice, categoryName, screenshotFileId: photoFileId
  });
}

async function handleUTRReceived(ctx) {
  const userId = ctx.from.id;
  const sess = await db.getSession(userId);
  if (sess.state !== STATES.BUY_AWAITING_UTR) return;

  const utr = ctx.message?.text?.trim();
  if (!utr || utr.length < 6) {
    await ctx.reply('⚠️ Enter a valid UTR (min 6 characters).');
    return;
  }

  for (const pattern of ILLEGAL_PATTERNS) {
    if (pattern.test(utr)) {
      await deleteUserMsg(ctx);
      if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
      await db.tempBlockUser(userId, 'Suspicious UTR detected', 20);
      await db.clearSession(userId);
      await ctx.reply('🚫 Suspicious activity. Restricted for 20 minutes.');
      return;
    }
  }

  const existingUTR = await db.checkUTRUsed(utr);
  if (existingUTR) {
    await deleteUserMsg(ctx);
    if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
    await db.tempBlockUser(userId, 'Duplicate UTR submitted', 30);
    await db.clearSession(userId);
    await ctx.reply('🚫 This UTR was already used. Restricted for 30 minutes.');
    return;
  }

  await deleteUserMsg(ctx);
  const { categoryId, categoryName, quantity, totalPrice, screenshotFileId } = sess.data;

  const stock = await db.getCategoryStock(categoryId);
  if (stock < quantity) {
    if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);
    await db.clearSession(userId);
    const msg = await ctx.reply(`😔 *Out of Stock!*\n\nOnly ${stock} available now. Contact support.`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🆘 Support', callback_data: 'cb_support' }]] }
    });
    await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });
    return;
  }

  const orderId = generateOrderId();
  await db.createOrder(orderId, userId, categoryId, categoryName, quantity, totalPrice, screenshotFileId, utr);
  await db.logUTR(utr, orderId, userId);

  if (sess.data.lastMsgId) await safeDelete(ctx, ctx.chat.id, sess.data.lastMsgId);

  const { getReplyKeyboard } = require('./index');
  const msg = await ctx.reply(
    `✅ *Order Submitted!*\n\n━━━━━━━━━━━━━━━━━\n🧾 *Order ID:* \`${orderId}\`\n🎟 *Category:* ${categoryName}\n📦 *Quantity:* ${quantity}\n💰 *Amount:* ${formatPrice(totalPrice)}\n📅 *Date:* ${formatDate(new Date())}\n━━━━━━━━━━━━━━━━━\n\n⏳ Admin verifying your payment.\n🔁 Recovery window: *2 hours only*`,
    { parse_mode: 'Markdown', ...getReplyKeyboard() }
  );
  await db.setSession(userId, 'IDLE', { lastMsgId: msg.message_id });

  // BharatPay check
  const bharatRes = await db.query("SELECT value FROM settings WHERE key='bharatpay_enabled'");
  const autoVerify = bharatRes.rows[0]?.value === 'true';
  if (autoVerify) {
    await verifyWithBharatPay(ctx, orderId, utr, userId, categoryId, categoryName, quantity, totalPrice, screenshotFileId);
  } else {
    await notifyAdmin(ctx, { orderId, userId, categoryName, quantity, totalPrice, screenshotFileId, utr });
  }
}

async function notifyAdmin(ctx, { orderId, userId, categoryName, quantity, totalPrice, screenshotFileId, utr }) {
  try {
    const user = await db.getUser(userId);
    const userName = user?.username ? `@${user.username}` : (user?.first_name || 'Unknown');
    const adminMsg = await ctx.telegram.sendPhoto(ADMIN_ID, screenshotFileId, {
      caption: `🆕 *New Order*\n\n━━━━━━━━━━━━━━━━━\n🧾 \`${orderId}\`\n👤 ${userName} (\`${userId}\`)\n🎟 ${categoryName}\n📦 Qty: ${quantity}\n💰 ${formatPrice(totalPrice)}\n🔑 UTR: \`${utr}\`\n━━━━━━━━━━━━━━━━━`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Accept & Deliver', callback_data: `aac_${orderId}` }, { text: '❌ Reject', callback_data: `arj_${orderId}` }],
          [{ text: '👤 View User', callback_data: `avu_${userId}` }]
        ]
      }
    });
    await db.setOrderAdminMsgId(orderId, adminMsg.message_id);
  } catch (err) { logger.error('Admin notify failed: ' + err.message); }
}

async function verifyWithBharatPay(ctx, orderId, utr, userId, categoryId, categoryName, quantity, totalPrice, screenshotFileId) {
  try {
    const merchantId = process.env.BHARATPAY_MERCHANT_ID;
    const apiKey = process.env.BHARATPAY_API_KEY;
    if (!merchantId || !apiKey) {
      await notifyAdmin(ctx, { orderId, userId, categoryName, quantity, totalPrice, screenshotFileId, utr });
      return;
    }
    const axios = require('axios');
    const response = await axios.post('https://api.bharatpe.in/v1/transaction/verify',
      { merchantId, utr, amount: totalPrice },
      { headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    if (response.data?.success && response.data?.transaction?.status === 'SUCCESS') {
      const { handleAdminAcceptOrder } = require('../admin/orderManage');
      await handleAdminAcceptOrder(ctx, orderId, true);
    } else {
      await notifyAdmin(ctx, { orderId, userId, categoryName, quantity, totalPrice, screenshotFileId, utr });
    }
  } catch (err) {
    logger.error('BharatPay error: ' + err.message);
    await notifyAdmin(ctx, { orderId, userId, categoryName, quantity, totalPrice, screenshotFileId, utr });
  }
}

module.exports = { showCategories, showQuantitySelection, promptCustomQuantity, showPaymentPage, askForScreenshot, handleScreenshotReceived, handleUTRReceived, notifyAdmin };

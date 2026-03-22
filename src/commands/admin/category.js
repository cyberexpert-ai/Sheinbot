const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');

async function showCategoryMenu(ctx) {
  const categories = await db.getCategories(false);
  const text = `📂 *Category Management*\n\n${categories.length
    ? categories.map((c, i) => `${i + 1}. ${c.is_active ? '✅' : '❌'} *${c.name}* (ID: ${c.id})`).join('\n')
    : '_No categories yet._'}\n\nTotal: *${categories.length}*`;

  const buttons = [
    [{ text: '➕ Add Category', callback_data: 'admin_cat_add' }],
    ...categories.map(c => ([
      { text: `✏️ ${c.name}`, callback_data: `ace_${c.id}` },
      { text: c.is_active ? '🔴 Disable' : '🟢 Enable', callback_data: `act_${c.id}` },
      { text: '🗑 Del', callback_data: `acd_${c.id}` }
    ])),
    [{ text: '↩️ Back', callback_data: 'admin_back' }]
  ];

  const opts = { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText(text, opts); } catch (e) {}
  }
  const msg = await ctx.reply(text, opts);
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptAddCategory(ctx) {
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_categories' }]] }
  };
  let msgId;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText('📂 *Add Category*\n\nSend the category name (e.g. `₹500`, `₹1000`):', opts); msgId = ctx.callbackQuery.message.message_id; }
    catch (e) { const m = await ctx.reply('📂 *Add Category*\n\nSend the category name:', opts); msgId = m.message_id; }
  } else {
    const m = await ctx.reply('📂 *Add Category*\n\nSend the category name:', opts); msgId = m.message_id;
  }
  await db.setSession(ADMIN_ID, STATES.ADMIN_ADD_CATEGORY_NAME, { lastMsgId: msgId });
}

async function handleAddCategoryInput(ctx) {
  const name = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!name) return ctx.reply('⚠️ Please enter a valid category name.');
  const cat = await db.addCategory(name);
  const sess = await db.getSession(ADMIN_ID);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Category *${cat.name}* added!\n\nNow set price tiers via 💰 Prices menu.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Categories', callback_data: 'admin_categories' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptRenameCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_categories' }]] }
  };
  let msgId;
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(`✏️ *Rename Category*\n\nCurrent: *${cat?.name}*\n\nSend the new name:`, opts); msgId = ctx.callbackQuery.message.message_id; }
    catch (e) { const m = await ctx.reply(`✏️ Rename *${cat?.name}* — send new name:`, opts); msgId = m.message_id; }
  } else {
    const m = await ctx.reply(`✏️ Rename *${cat?.name}* — send new name:`, opts); msgId = m.message_id;
  }
  await db.setSession(ADMIN_ID, STATES.ADMIN_RENAME_CATEGORY, { categoryId, lastMsgId: msgId });
}

async function handleRenameCategoryInput(ctx) {
  const sess = await db.getSession(ADMIN_ID);
  const name = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!name) return;
  await db.updateCategory(sess.data.categoryId, name);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Category renamed to *${name}*`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Categories', callback_data: 'admin_categories' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function handleToggleCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  if (!cat) { await ctx.answerCbQuery('Category not found.'); return; }
  await db.toggleCategory(categoryId, !cat.is_active);
  await ctx.answerCbQuery(`✅ Category ${!cat.is_active ? 'enabled ✅' : 'disabled ❌'}`);
  await showCategoryMenu(ctx);
}

async function handleDeleteCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  if (!cat) { await ctx.answerCbQuery('Category not found.'); return; }
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Yes, Delete', callback_data: `acdc_${categoryId}` }, { text: '❌ Cancel', callback_data: 'admin_categories' }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText(`🗑 *Delete "${cat.name}"?*\n\n⚠️ All vouchers in this category will be deleted!\n\nAre you sure?`, opts); } catch (e) {}
  }
  await ctx.reply(`🗑 Delete "${cat.name}"? This will delete all vouchers!`, opts);
}

async function confirmDeleteCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  await db.deleteCategory(categoryId);
  const opts = {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Categories', callback_data: 'admin_categories' }]] }
  };
  if (ctx.callbackQuery) {
    try { return await ctx.editMessageText(`✅ Category *${cat?.name}* deleted.`, opts); } catch (e) {}
  }
  await ctx.reply(`✅ Category *${cat?.name}* deleted.`, opts);
}

module.exports = {
  showCategoryMenu, promptAddCategory, handleAddCategoryInput,
  promptRenameCategory, handleRenameCategoryInput, handleToggleCategory,
  handleDeleteCategory, confirmDeleteCategory
};

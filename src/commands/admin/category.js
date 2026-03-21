const db = require('../../database/database');
const { ADMIN_ID, STATES } = require('../../utils/constants');
const { showAdminPanel } = require('./index');

async function showCategoryMenu(ctx) {
  const categories = await db.getCategories(false);
  const text = `📂 *Category Management*\n\n${categories.length ? categories.map((c, i) => `${i + 1}. ${c.is_active ? '✅' : '❌'} *${c.name}* (ID: ${c.id})`).join('\n') : 'No categories yet.'}\n\nTotal: *${categories.length}*`;

  const buttons = [
    [{ text: '➕ Add Category', callback_data: 'admin_cat_add' }],
    ...categories.map(c => ([
      { text: `✏️ ${c.name}`, callback_data: `admin_cat_edit_${c.id}` },
      { text: c.is_active ? '🔴 Disable' : '🟢 Enable', callback_data: `admin_cat_toggle_${c.id}` },
      { text: '🗑 Delete', callback_data: `acd_${c.id}` }
    ])),
    [{ text: '↩️ Back', callback_data: 'admin_back' }]
  ];

  if (ctx.callbackQuery) {
    return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
  }
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } });
}

async function promptAddCategory(ctx) {
  await ctx.editMessageText(
    `📂 *Add New Category*\n\nSend the category name (e.g., "₹500", "₹1000"):`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_categories' }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_ADD_CATEGORY_NAME, { lastMsgId: ctx.callbackQuery.message.message_id });
}

async function handleAddCategoryInput(ctx) {
  const name = ctx.message?.text?.trim();
  try { await ctx.deleteMessage(); } catch (e) {}
  if (!name) return ctx.reply('⚠️ Please enter a valid category name.');
  const cat = await db.addCategory(name);
  const sess = await db.getSession(ADMIN_ID);
  try { await ctx.telegram.deleteMessage(ctx.chat.id, sess.data.lastMsgId); } catch (e) {}
  await db.clearSession(ADMIN_ID);
  const msg = await ctx.reply(`✅ Category *${cat.name}* added! (ID: ${cat.id})\n\nNow set price tiers via 💰 Prices menu.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back to Categories', callback_data: 'admin_categories' }]] }
  });
  await db.setSession(ADMIN_ID, 'IDLE', { lastMsgId: msg.message_id });
}

async function promptRenameCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  await ctx.editMessageText(
    `✏️ *Rename Category*\n\nCurrent name: *${cat?.name}*\n\nSend the new name:`,
    { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_categories' }]] } }
  );
  await db.setSession(ADMIN_ID, STATES.ADMIN_RENAME_CATEGORY, { categoryId, lastMsgId: ctx.callbackQuery.message.message_id });
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
  if (!cat) return;
  await db.toggleCategory(categoryId, !cat.is_active);
  await ctx.answerCbQuery(`✅ Category ${!cat.is_active ? 'enabled' : 'disabled'}!`);
  await showCategoryMenu(ctx);
}

async function handleDeleteCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  if (!cat) return ctx.answerCbQuery('Category not found.');
  await ctx.editMessageText(
    `🗑 *Delete Category?*\n\n*${cat.name}*\n\n⚠️ This will delete ALL vouchers in this category!\n\nAre you sure?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Yes, Delete', callback_data: `admin_cat_del_confirm_${categoryId}` }, { text: '❌ Cancel', callback_data: 'admin_categories' }]
        ]
      }
    }
  );
}

async function confirmDeleteCategory(ctx, categoryId) {
  const cat = await db.getCategory(categoryId);
  await db.deleteCategory(categoryId);
  await ctx.editMessageText(`✅ Category *${cat?.name}* deleted.`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_categories' }]] }
  });
}

module.exports = {
  showCategoryMenu, promptAddCategory, handleAddCategoryInput,
  promptRenameCategory, handleRenameCategoryInput, handleToggleCategory,
  handleDeleteCategory, confirmDeleteCategory
};

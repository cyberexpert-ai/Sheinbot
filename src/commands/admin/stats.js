const db = require('../../database/database');
const { formatPrice } = require('../../utils/helpers');

async function showStats(ctx) {
  const [orderStats, userCount, categories] = await Promise.all([
    db.getOrderStats(),
    db.getUserCount(),
    db.getCategories(false)
  ]);

  let stockText = '';
  for (const cat of categories) {
    const stock = await db.getCategoryStock(cat.id);
    stockText += `\n• ${cat.name}: *${stock}* available`;
  }

  const text = `📊 *Bot Statistics*\n\n━━━━━━━━━━━━━━━━━\n👥 *Users*\n├ Total Registered: *${userCount}*\n\n📦 *Orders*\n├ Total: *${orderStats?.total || 0}*\n├ ⏳ Pending: *${orderStats?.pending || 0}*\n├ ✅ Accepted: *${orderStats?.accepted || 0}*\n└ ❌ Rejected: *${orderStats?.rejected || 0}*\n\n💰 *Revenue*\n└ Total: *${formatPrice(orderStats?.revenue || 0)}*\n\n🎟 *Stock*${stockText || '\nNo categories.'}\n━━━━━━━━━━━━━━━━━`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Refresh', callback_data: 'admin_stats' }],
        [{ text: '↩️ Back', callback_data: 'admin_back' }]
      ]
    }
  });
}

module.exports = { showStats };

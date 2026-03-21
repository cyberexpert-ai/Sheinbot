const db = require('../database/database');
const { ADMIN_ID } = require('../utils/constants');
const logger = require('../utils/logger');

async function authMiddleware(ctx, next) {
  if (!ctx.from) return next();

  const telegramId = ctx.from.id;

  try {
    // Register or update user
    await db.upsertUser(
      telegramId,
      ctx.from.username,
      ctx.from.first_name,
      ctx.from.last_name
    );

    // Skip checks for admin
    if (telegramId === ADMIN_ID) return next();

    // Get user details
    const user = await db.getUser(telegramId);
    if (!user) return next();

    // Check temp block expiry
    if (user.is_temp_blocked && user.block_until) {
      if (new Date() > new Date(user.block_until)) {
        await db.unblockUser(telegramId);
        return next();
      }
    }

    // Check permanent block
    if (user.is_blocked) {
      const blockedMsg = `🚫 *You have been blocked.*\n\n${user.block_reason ? `Reason: ${user.block_reason}` : ''}\n\nContact support if you think this is a mistake.`;
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('🚫 You are blocked.', { show_alert: true });
        await ctx.editMessageText(blockedMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🆘 Contact Support', url: `https://t.me/SheinSupportRobot` }]]
          }
        }).catch(() => {});
      } else if (ctx.message) {
        await ctx.reply(blockedMsg, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '🆘 Contact Support', url: `https://t.me/SheinSupportRobot` }]]
          }
        }).catch(() => {});
      }
      return;
    }

    // Check temp block
    if (user.is_temp_blocked) {
      const until = new Date(user.block_until);
      const msg = `⏳ *Temporary Restriction*\n\nYou are temporarily restricted until:\n${until.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n\nReason: ${user.block_reason || 'Suspicious activity detected'}`;
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery('⏳ You are temporarily restricted.', { show_alert: true });
      } else if (ctx.message) {
        await ctx.reply(msg, { parse_mode: 'Markdown' }).catch(() => {});
      }
      return;
    }

    return next();
  } catch (err) {
    logger.error('Auth middleware error: ' + err.message);
    return next();
  }
}

module.exports = { authMiddleware };

const db = require('../../database/database');
const { ADMIN_ID } = require('../../utils/constants');

async function showSecurityPanel(ctx) {
  const bharatRes = await db.query("SELECT value FROM settings WHERE key = 'bharatpay_enabled'");
  const maintRes = await db.query("SELECT value FROM settings WHERE key = 'maintenance_mode'");
  const bharatEnabled = bharatRes.rows[0]?.value === 'true';
  const maintEnabled = maintRes.rows[0]?.value === 'true';

  const text = `🛡 *Security & Settings*\n\n🔘 BharatPay Auto-Verify: *${bharatEnabled ? '✅ ON' : '❌ OFF'}*\n🔧 Maintenance Mode: *${maintEnabled ? '✅ ON' : '❌ OFF'}*`;
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: `${bharatEnabled ? '🔴 Disable' : '🟢 Enable'} BharatPay`, callback_data: `abpay_${bharatEnabled ? '0' : '1'}` }],
        [{ text: `${maintEnabled ? '🔴 Disable' : '🟢 Enable'} Maintenance`, callback_data: `amaint_${maintEnabled ? '0' : '1'}` }],
        [{ text: '🔍 Check Duplicate UTRs', callback_data: 'admin_check_utrs' }],
        [{ text: '⌛ Expire Old Recoveries', callback_data: 'admin_expire_rec' }],
        [{ text: '↩️ Back', callback_data: 'admin_back' }]
      ]
    }
  });
}

async function handleToggleBharatPay(ctx, enable) {
  await db.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'bharatpay_enabled'", [enable === '1' ? 'true' : 'false']);
  await ctx.answerCbQuery(`✅ BharatPay ${enable === '1' ? 'enabled' : 'disabled'}.`);
  await showSecurityPanel(ctx);
}

async function handleToggleMaintenance(ctx, enable) {
  await db.query("UPDATE settings SET value = $1, updated_at = NOW() WHERE key = 'maintenance_mode'", [enable === '1' ? 'true' : 'false']);
  await ctx.answerCbQuery(`✅ Maintenance mode ${enable === '1' ? 'ON' : 'OFF'}.`);
  await showSecurityPanel(ctx);
}

async function showDuplicateUTRs(ctx) {
  const res = await db.query(`SELECT utr, COUNT(*) as count FROM utr_log GROUP BY utr HAVING COUNT(*) > 1`);
  const text = res.rows.length
    ? `🔍 *Duplicate UTRs Found:*\n\n${res.rows.map(r => `• \`${r.utr}\` — ${r.count}x`).join('\n')}`
    : '✅ *No duplicate UTRs found.*';
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_security' }]] }
  });
}

async function handleExpireOldRecoveries(ctx) {
  const res = await db.query(
    `UPDATE orders SET status = 'EXPIRED' WHERE status = 'PENDING' AND recovery_expires_at < NOW() RETURNING order_id`
  );
  await ctx.editMessageText(`✅ Expired ${res.rowCount} old pending order(s).`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: [[{ text: '↩️ Back', callback_data: 'admin_security' }]] }
  });
}

async function showAdminSettings(ctx) {
  await ctx.editMessageText(
    `⚙️ *Settings*\n\nUse the options below to configure the bot:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛡 Security Panel', callback_data: 'admin_security' }],
          [{ text: '↩️ Back', callback_data: 'admin_back' }]
        ]
      }
    }
  );
}

module.exports = {
  showSecurityPanel, handleToggleBharatPay, handleToggleMaintenance,
  showDuplicateUTRs, handleExpireOldRecoveries, showAdminSettings
};

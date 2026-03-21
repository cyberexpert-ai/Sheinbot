require('dotenv').config();
const { CHANNELS } = require('../utils/constants');

async function isUserInChannel(ctx, channelId) {
  try {
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (e) { return true; }
}

async function checkChannels(ctx) {
  const inMain = await isUserInChannel(ctx, CHANNELS.MAIN_ID);
  const inOrders = await isUserInChannel(ctx, CHANNELS.ORDERS_ID);
  return { inMain, inOrders, allJoined: inMain && inOrders };
}

function getJoinMessage() {
  return `👋 *Welcome to Shein Codes Bot*\n\n📢 Please join both channels to continue:\n\n1️⃣ @${CHANNELS.MAIN}\n2️⃣ @${CHANNELS.ORDERS}\n\nAfter joining, tap *Verify ✅* below.`;
}

function getJoinKeyboard() {
  return {
    inline_keyboard: [
      [{ text: `📢 Join @${CHANNELS.MAIN}`, url: CHANNELS.MAIN_LINK }, { text: `📢 Join @${CHANNELS.ORDERS}`, url: CHANNELS.ORDERS_LINK }],
      [{ text: '✅ Verify', callback_data: 'verify_ch' }]
    ]
  };
}

module.exports = { checkChannels, getJoinMessage, getJoinKeyboard, isUserInChannel };

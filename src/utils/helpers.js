const crypto = require('crypto');
const { ORDER_PREFIX } = require('./constants');

function generateOrderId() {
  const timestamp = Date.now().toString().slice(-10);
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${ORDER_PREFIX}-${timestamp}-${random}`;
}

function formatPrice(price) {
  return `₹${parseFloat(price).toFixed(2)}`;
}

function formatDate(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });
}

function getRecoveryExpiry(createdAt) {
  const expiry = new Date(createdAt);
  expiry.setHours(expiry.getHours() + 2);
  return expiry;
}

function isRecoveryExpired(expiresAt) {
  return new Date() > new Date(expiresAt);
}

function getStatusEmoji(status) {
  const map = {
    PENDING: '⏳',
    ACCEPTED: '✅',
    REJECTED: '❌',
    CANCELLED: '🚫',
    EXPIRED: '⌛'
  };
  return map[status] || '❓';
}

function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function safeDelete(ctx, chatId, messageId) {
  try {
    if (messageId) await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (e) { /* ignore */ }
}

async function deleteUserMsg(ctx) {
  try {
    if (ctx.message) await ctx.deleteMessage(ctx.message.message_id);
  } catch (e) { /* ignore */ }
}

function buildKeyboard(buttons, columns = 2) {
  const keyboard = [];
  for (let i = 0; i < buttons.length; i += columns) {
    keyboard.push(buttons.slice(i, i + columns));
  }
  return keyboard;
}

module.exports = {
  generateOrderId,
  formatPrice,
  formatDate,
  getRecoveryExpiry,
  isRecoveryExpired,
  getStatusEmoji,
  escapeMarkdown,
  chunkArray,
  safeDelete,
  deleteUserMsg,
  buildKeyboard
};

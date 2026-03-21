# SheinVoucherHub Bot 🤖

A powerful Telegram bot for selling Shein voucher codes with admin panel, payment verification, and order management.

## 🚀 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure `.env`
Fill in your values:
```
BOT_TOKEN=your_bot_token
ADMIN_ID=8004114088
DATABASE_URL=your_postgresql_url
WEBHOOK_URL=https://your-app.onrender.com
MAIN_CHANNEL_ID=-100xxxxxxxxx
ORDERS_CHANNEL_ID=-1002862139182
```

### 3. Get Channel IDs
- Add the bot as admin to both channels
- MAIN_CHANNEL_ID: Your @SheinVoucherHub channel ID
- ORDERS_CHANNEL_ID: -1002862139182

### 4. Deploy to Render
- Connect your GitHub repo
- Set all env vars in Render dashboard
- Deploy!

## 📋 Admin Commands
- `/start` — Open admin panel
- `/admin` — Quick admin panel
- `/stats` — Quick stats

## 🛒 User Flow
1. `/start` → Join channels → Verify
2. Buy Voucher → Select category → Select qty → Pay → Upload screenshot → Enter UTR
3. Admin accepts → Voucher delivered

## 💰 Price Setup
Go to Admin Panel → Prices → Select category → Add/Update Tier
Format: `QUANTITY PRICE` e.g. `1 149` or `5 599`

## 🎟 Add Vouchers
Go to Admin Panel → Vouchers → Select category → Add Single or Bulk

## 🛡 Security Features
- Force channel membership
- Duplicate UTR detection
- Fake UTR temp ban (20-30 min)
- Order ID tied to Telegram account
- Recovery window: 2 hours only
- Auto temp-unblock via cron

## 📊 Database
Uses PostgreSQL (Render). Tables auto-created on first run.

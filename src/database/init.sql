-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  is_blocked BOOLEAN DEFAULT FALSE,
  is_temp_blocked BOOLEAN DEFAULT FALSE,
  block_reason TEXT,
  block_until TIMESTAMP,
  is_verified BOOLEAN DEFAULT FALSE,
  total_orders INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sessions table (bot state machine)
CREATE TABLE IF NOT EXISTS sessions (
  telegram_id BIGINT PRIMARY KEY,
  state VARCHAR(100) DEFAULT 'IDLE',
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vouchers/Codes table
CREATE TABLE IF NOT EXISTS vouchers (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE CASCADE,
  code VARCHAR(500) NOT NULL,
  is_used BOOLEAN DEFAULT FALSE,
  used_by_order_id VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(category_id, code)
);

-- Price tiers per category per quantity
CREATE TABLE IF NOT EXISTS price_tiers (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  UNIQUE(category_id, quantity)
);

-- Custom per-unit price for quantities not in price_tiers
CREATE TABLE IF NOT EXISTS custom_price_per_unit (
  id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(id) ON DELETE CASCADE UNIQUE,
  price_per_unit DECIMAL(10,2) NOT NULL
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(50) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  category_id INT REFERENCES categories(id),
  category_name VARCHAR(100),
  quantity INT NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  screenshot_file_id TEXT,
  utr VARCHAR(100),
  reject_reason TEXT,
  recovery_expires_at TIMESTAMP,
  admin_message_id BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order voucher codes (delivered to user)
CREATE TABLE IF NOT EXISTS order_vouchers (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(50) REFERENCES orders(order_id) ON DELETE CASCADE,
  voucher_code VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Broadcasts
CREATE TABLE IF NOT EXISTS broadcasts (
  id SERIAL PRIMARY KEY,
  message TEXT,
  photo_file_id TEXT,
  sent_by BIGINT,
  target_type VARCHAR(20) DEFAULT 'ALL',
  target_user_id BIGINT,
  message_ids JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Discount codes
CREATE TABLE IF NOT EXISTS discount_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  category_id INT REFERENCES categories(id) ON DELETE SET NULL,
  min_quantity INT DEFAULT 1,
  max_uses INT,
  used_count INT DEFAULT 0,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Support messages
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  message TEXT,
  photo_file_id TEXT,
  admin_reply TEXT,
  status VARCHAR(20) DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT NOW()
);

-- UTR log (prevent double use)
CREATE TABLE IF NOT EXISTS utr_log (
  id SERIAL PRIMARY KEY,
  utr VARCHAR(100) UNIQUE NOT NULL,
  order_id VARCHAR(50),
  user_id BIGINT,
  used_at TIMESTAMP DEFAULT NOW()
);

-- Recovery requests
CREATE TABLE IF NOT EXISTS recovery_requests (
  id SERIAL PRIMARY KEY,
  order_id VARCHAR(50) UNIQUE NOT NULL,
  user_id BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Settings (key-value store for admin-configurable options)
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('bharatpay_enabled', 'false'),
  ('maintenance_mode', 'false'),
  ('welcome_message', 'default'),
  ('max_quantity_display', '5')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_category_id ON vouchers(category_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_is_used ON vouchers(is_used);
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_id ON sessions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_utr_log_utr ON utr_log(utr);

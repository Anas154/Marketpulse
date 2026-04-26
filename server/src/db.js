const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'marketpulse.db');

async function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
}

async function ensureColumn(db, table, column, sqlType) {
  const info = await db.all(`PRAGMA table_info(${table})`);
  const hasColumn = info.some((c) => c.name === column);
  if (!hasColumn) {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType}`);
  }
}

async function ensureSchema(db) {
  await db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS instruments (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      exchange TEXT NOT NULL,
      sector TEXT NOT NULL,
      current_price REAL NOT NULL,
      change_pct REAL NOT NULL,
      high52 REAL NOT NULL,
      low52 REAL NOT NULL,
      inav REAL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      ts TEXT NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume INTEGER NOT NULL,
      timeframe TEXT NOT NULL DEFAULT '1D',
      FOREIGN KEY(symbol) REFERENCES instruments(symbol)
    );

    CREATE INDEX IF NOT EXISTS idx_prices_symbol_ts ON prices(symbol, ts);

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, symbol),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(symbol) REFERENCES instruments(symbol)
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      condition TEXT NOT NULL,
      target REAL,
      note TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      triggered_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(symbol) REFERENCES instruments(symbol)
    );

    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      symbol TEXT NOT NULL,
      units REAL NOT NULL,
      avg_cost REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, symbol),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(symbol) REFERENCES instruments(symbol)
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS portfolio_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      provider_name TEXT,
      status TEXT NOT NULL,
      summary_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  await ensureColumn(db, 'users', 'username', 'TEXT');
  await ensureColumn(db, 'users', 'role', "TEXT NOT NULL DEFAULT 'user'");
  await ensureColumn(db, 'users', 'pan', 'TEXT');
  await ensureColumn(db, 'users', 'onboarding_completed', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'users', 'onboarding_step', "TEXT NOT NULL DEFAULT 'welcome'");
  await ensureColumn(db, 'users', 'onboarding_json', 'TEXT');
  await ensureColumn(db, 'users', 'email_alerts_enabled', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn(db, 'users', 'timezone', "TEXT NOT NULL DEFAULT 'Asia/Kolkata'");
  await ensureColumn(db, 'alerts', 'last_sent_at', 'TEXT');
  await db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_portfolio_holdings_user_id ON portfolio_holdings(user_id)');
  await db.exec('CREATE INDEX IF NOT EXISTS idx_portfolio_imports_user_id ON portfolio_imports(user_id)');
}

module.exports = {
  DB_PATH,
  openDb,
  ensureSchema
};

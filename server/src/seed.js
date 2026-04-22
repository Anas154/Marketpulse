require('dotenv').config();
const bcrypt = require('bcryptjs');
const { INSTRUMENTS, SECTORS, DEFAULT_ALERTS, DEFAULT_WATCHLIST } = require('./data');
const { openDb, ensureSchema } = require('./db');
const { generateHistory } = require('./market');

async function seed() {
  const db = await openDb();
  await ensureSchema(db);

  const demoEmail = process.env.DEMO_EMAIL || 'demo@marketpulse.local';
  const demoPassword = process.env.DEMO_PASSWORD || 'Password123!';
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  await db.run(
    `INSERT OR IGNORE INTO users(email, password_hash, display_name)
     VALUES (?, ?, ?)`,
    [demoEmail, passwordHash, 'Demo Analyst']
  );

  const user = await db.get(`SELECT * FROM users WHERE email = ?`, [demoEmail]);

  for (const inst of INSTRUMENTS) {
    await db.run(
      `INSERT OR REPLACE INTO instruments(symbol, name, type, exchange, sector, current_price, change_pct, high52, low52, inav, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        inst.sym,
        inst.name,
        inst.type,
        inst.exchange,
        inst.sector,
        inst.currentPrice,
        inst.changePct,
        inst.high52,
        inst.low52,
        inst.inav
      ]
    );
  }

  const existing = await db.get(`SELECT COUNT(*) AS count FROM prices`);
  if (!existing.count) {
    for (const inst of INSTRUMENTS) {
      const rows = generateHistory({
        symbol: inst.sym,
        current_price: inst.currentPrice,
        low52: inst.low52,
        high52: inst.high52
      }, 252);

      for (const row of rows) {
        await db.run(
          `INSERT INTO prices(symbol, ts, open, high, low, close, volume, timeframe)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.symbol, row.ts, row.open, row.high, row.low, row.close, row.volume, row.timeframe]
        );
      }
    }
  }

  const botStateSeed = {
    uptime_seconds: '15417',
    emails_sent: '12',
    nse_errors: '2',
    market_open: '1',
    heartbeat: new Date().toISOString()
  };

  for (const [key, value] of Object.entries(botStateSeed)) {
    await db.run(`INSERT OR REPLACE INTO bot_state(key, value) VALUES (?, ?)`, [key, value]);
  }

  const logCount = await db.get(`SELECT COUNT(*) AS count FROM logs`);
  if (!logCount.count) {
    const sampleLogs = [
      ['info', 'MarketPulse started — demo environment seeded'],
      ['info', `Demo login ready — ${demoEmail}`],
      ['info', 'NSE session initialized — tracking 24 instruments'],
      ['info', 'Gmail App Password auth configured'],
      ['info', 'systemd service can be enabled for boot start'],
      ['warn', 'Monthly low check armed for GOLDBEES'],
      ['info', 'Smart sleep engine ready — wakes 09:15 IST']
    ];
    for (const [level, message] of sampleLogs) {
      await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, [level, message]);
    }
  }

  const watchCount = await db.get(`SELECT COUNT(*) AS count FROM watchlists`);
  if (!watchCount.count) {
    for (const symbol of DEFAULT_WATCHLIST) {
      await db.run(`INSERT INTO watchlists(user_id, symbol) VALUES (?, ?)`, [user.id, symbol]);
    }
  }

  const alertCount = await db.get(`SELECT COUNT(*) AS count FROM alerts`);
  if (!alertCount.count) {
    for (const alert of DEFAULT_ALERTS) {
      await db.run(
        `INSERT INTO alerts(user_id, symbol, condition, target, note, enabled)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, alert.symbol, alert.condition, alert.target, alert.note, alert.enabled ? 1 : 0]
      );
    }
  }

  await db.close();
  console.log('Seed complete');
}

if (require.main === module) {
  seed().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seed };

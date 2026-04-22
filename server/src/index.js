require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cron = require('node-cron');
const { z } = require('zod');
const { openDb, ensureSchema } = require('./db');
const { INSTRUMENTS, SECTORS } = require('./data');
const {
  generateHistory,
  generateIntraday,
  aggregateRows,
  currentMarketStatus,
  pctPosition
} = require('./market');

const PORT = Number(process.env.PORT || 4000);
const CLIENT_BUILD_PATH = process.env.CLIENT_BUILD_PATH || path.join(__dirname, '..', '..', 'client', 'dist');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';

const allowedOrigins = new Set([
  process.env.CLIENT_DEV_ORIGIN || 'http://localhost:5173',
  process.env.CLIENT_PROD_ORIGIN || 'https://anas154.github.io',
  process.env.RENDER_EXTERNAL_URL
].filter(Boolean));

const app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

let db;

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function auth(required = true) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      if (required) return res.status(401).json({ error: 'Authentication required' });
      return next();
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await db.get('SELECT id, email, display_name, created_at FROM users WHERE id = ?', [payload.sub]);
      if (!user) return res.status(401).json({ error: 'Invalid session' });
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid session' });
    }
  };
}

async function getUserId(req, res) {
  const row = req.user || await db.get('SELECT id FROM users LIMIT 1');
  if (!row) {
    res.status(500).json({ error: 'Demo user missing' });
    return null;
  }
  return row.id;
}

function formatHistoryRows(symbol, timeframe) {
  return async () => {
    if (timeframe === '1D') {
      const instrument = INSTRUMENTS.find((i) => i.sym === symbol);
      return aggregateRows(generateIntraday({
        symbol: instrument.sym,
        current_price: instrument.currentPrice,
        low52: instrument.low52,
        high52: instrument.high52
      }), '1D');
    }

    const rows = await db.all(
      `SELECT ts, open, high, low, close, volume
       FROM prices
       WHERE symbol = ?
       ORDER BY ts ASC`,
      [symbol]
    );
    return aggregateRows(rows, timeframe);
  };
}

async function refreshDemoMarket() {
  const now = new Date();
  const market = currentMarketStatus(now);
  await db.run(`INSERT OR REPLACE INTO bot_state(key, value) VALUES (?, ?)`, ['market_open', market.open ? '1' : '0']);
  await db.run(`INSERT OR REPLACE INTO bot_state(key, value) VALUES (?, ?)`, ['heartbeat', now.toISOString()]);

  const instruments = await db.all(`SELECT * FROM instruments`);
  for (const inst of instruments) {
    const delta = (Math.random() - 0.5) * inst.current_price * 0.0012;
    const next = Math.max(inst.low52 * 0.9, Number((inst.current_price + delta).toFixed(2)));
    const changePct = Number((((next - inst.current_price) / inst.current_price) * 100).toFixed(2));
    await db.run(
      `UPDATE instruments
       SET current_price = ?, change_pct = ?, updated_at = CURRENT_TIMESTAMP
       WHERE symbol = ?`,
      [next, changePct, inst.symbol]
    );
  }

  const activeAlerts = await db.all(
    `SELECT a.*, u.email FROM alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.enabled = 1`
  );

  for (const alert of activeAlerts) {
    const inst = await db.get(`SELECT * FROM instruments WHERE symbol = ?`, [alert.symbol]);
    if (!inst) continue;
    let triggered = false;
    if (alert.condition === 'below' && alert.target != null && inst.current_price <= alert.target) triggered = true;
    if (alert.condition === 'above' && alert.target != null && inst.current_price >= alert.target) triggered = true;
    if (alert.condition === 'monthly_low' && inst.current_price <= inst.low52 * 1.01) triggered = true;
    if (alert.condition === 'monthly_high' && inst.current_price >= inst.high52 * 0.99) triggered = true;

    if (triggered) {
      await db.run(
        `UPDATE alerts SET triggered_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [alert.id]
      );
      await db.run(
        `INSERT INTO logs(level, message) VALUES (?, ?)`,
        ['warn', `ALERT: ${alert.symbol} triggered for ${alert.condition} by ${alert.email}`]
      );
      const emails = await db.get(`SELECT value FROM bot_state WHERE key = 'emails_sent'`);
      const count = Number(emails?.value || '0') + 1;
      await db.run(`INSERT OR REPLACE INTO bot_state(key, value) VALUES (?, ?)`, ['emails_sent', String(count)]);
    }
  }

  const uptime = await db.get(`SELECT value FROM bot_state WHERE key = 'uptime_seconds'`);
  const nextUptime = Number(uptime?.value || '0') + 60;
  await db.run(`INSERT OR REPLACE INTO bot_state(key, value) VALUES (?, ?)`, ['uptime_seconds', String(nextUptime)]);
}

function publicInstrument(inst) {
  return {
    symbol: inst.symbol,
    name: inst.name,
    type: inst.type,
    exchange: inst.exchange,
    sector: inst.sector,
    currentPrice: inst.current_price,
    changePct: inst.change_pct,
    high52: inst.high52,
    low52: inst.low52,
    inav: inst.inav,
    position52w: pctPosition(inst.current_price, inst.low52, inst.high52),
    trend: inst.change_pct >= 0 ? 'up' : 'down'
  };
}

app.get('/health', async (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials payload' });

  const user = await db.get(`SELECT * FROM users WHERE email = ?`, [parsed.data.email]);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, displayName: user.display_name }
  });
});

app.get('/api/me', auth(true), async (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email, displayName: req.user.display_name } });
});

app.get('/api/bootstrap', auth(false), async (req, res) => {
  const userId = req.user?.id || null;
  const [instruments, logs, sectors, botState] = await Promise.all([
    db.all(`SELECT * FROM instruments ORDER BY CASE type WHEN 'index' THEN 1 WHEN 'etf' THEN 2 WHEN 'stock' THEN 3 ELSE 4 END, symbol`),
    db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 50`),
    Promise.resolve(SECTORS),
    db.all(`SELECT key, value FROM bot_state`)
  ]);

  const alerts = userId
    ? await db.all(`SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC`, [userId])
    : [];
  const watchlist = userId
    ? await db.all(`SELECT w.symbol, i.name, i.type, i.current_price, i.change_pct, i.high52, i.low52
                   FROM watchlists w
                   JOIN instruments i ON i.symbol = w.symbol
                   WHERE w.user_id = ?
                   ORDER BY w.id DESC`, [userId])
    : [];

  res.json({
    user: req.user ? { id: req.user.id, email: req.user.email, displayName: req.user.display_name } : null,
    instruments: instruments.map(publicInstrument),
    sectors,
    alerts,
    watchlist,
    logs,
    botState: Object.fromEntries(botState.map((x) => [x.key, x.value])),
    marketStatus: currentMarketStatus(),
    defaultSymbol: 'GOLDBEES'
  });
});

app.get('/api/instruments', async (_req, res) => {
  const instruments = await db.all(`SELECT * FROM instruments ORDER BY symbol`);
  res.json(instruments.map(publicInstrument));
});

app.get('/api/instruments/:symbol', async (req, res) => {
  const inst = await db.get(`SELECT * FROM instruments WHERE symbol = ?`, [req.params.symbol.toUpperCase()]);
  if (!inst) return res.status(404).json({ error: 'Instrument not found' });
  res.json(publicInstrument(inst));
});

app.get('/api/instruments/:symbol/history', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const timeframe = String(req.query.tf || '3M').toUpperCase();
  const instrument = await db.get(`SELECT * FROM instruments WHERE symbol = ?`, [symbol]);
  if (!instrument) return res.status(404).json({ error: 'Instrument not found' });

  const validTf = ['1D', '1W', '1M', '3M', '1Y'];
  if (!validTf.includes(timeframe)) return res.status(400).json({ error: 'Invalid timeframe' });

  const rows = await formatHistoryRows(symbol, timeframe)();
  res.json({ symbol, timeframe, rows });
});

app.get('/api/sectors', async (_req, res) => {
  res.json(SECTORS);
});

app.get('/api/watchlist', auth(true), async (req, res) => {
  const rows = await db.all(
    `SELECT w.id, w.symbol, i.name, i.type, i.current_price, i.change_pct, i.high52, i.low52
     FROM watchlists w
     JOIN instruments i ON i.symbol = w.symbol
     WHERE w.user_id = ?
     ORDER BY w.id DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/watchlist', auth(true), async (req, res) => {
  const schema = z.object({ symbol: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid symbol' });

  const symbol = parsed.data.symbol.toUpperCase();
  const inst = await db.get(`SELECT symbol FROM instruments WHERE symbol = ?`, [symbol]);
  if (!inst) return res.status(404).json({ error: 'Instrument not found' });

  await db.run(`INSERT OR IGNORE INTO watchlists(user_id, symbol) VALUES (?, ?)`, [req.user.id, symbol]);
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Watchlist added: ${symbol}`]);
  res.json({ ok: true });
});

app.delete('/api/watchlist/:symbol', auth(true), async (req, res) => {
  await db.run(`DELETE FROM watchlists WHERE user_id = ? AND symbol = ?`, [req.user.id, req.params.symbol.toUpperCase()]);
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Watchlist removed: ${req.params.symbol.toUpperCase()}`]);
  res.json({ ok: true });
});

app.get('/api/alerts', auth(true), async (req, res) => {
  const rows = await db.all(`SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC`, [req.user.id]);
  res.json(rows);
});

app.post('/api/alerts', auth(true), async (req, res) => {
  const schema = z.object({
    symbol: z.string().min(1),
    condition: z.enum(['below', 'above', 'monthly_low', 'monthly_high', 'pct_drop']),
    target: z.number().optional().nullable(),
    note: z.string().optional().default(''),
    enabled: z.boolean().optional().default(true)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid alert payload' });

  const symbol = parsed.data.symbol.toUpperCase();
  const inst = await db.get(`SELECT symbol FROM instruments WHERE symbol = ?`, [symbol]);
  if (!inst) return res.status(404).json({ error: 'Instrument not found' });

  const result = await db.run(
    `INSERT INTO alerts(user_id, symbol, condition, target, note, enabled)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user.id, symbol, parsed.data.condition, parsed.data.target ?? null, parsed.data.note || '', parsed.data.enabled ? 1 : 0]
  );
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Alert created: ${symbol} ${parsed.data.condition}`]);
  res.json({ id: result.lastID, ok: true });
});

app.patch('/api/alerts/:id', auth(true), async (req, res) => {
  const schema = z.object({
    enabled: z.boolean().optional(),
    target: z.number().optional().nullable(),
    note: z.string().optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload' });

  const existing = await db.get(`SELECT * FROM alerts WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  if (!existing) return res.status(404).json({ error: 'Alert not found' });

  const enabled = parsed.data.enabled ?? Boolean(existing.enabled);
  const target = parsed.data.target === undefined ? existing.target : parsed.data.target;
  const note = parsed.data.note ?? existing.note;

  await db.run(
    `UPDATE alerts SET enabled = ?, target = ?, note = ? WHERE id = ? AND user_id = ?`,
    [enabled ? 1 : 0, target, note, req.params.id, req.user.id]
  );
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Alert updated: ${existing.symbol}`]);
  res.json({ ok: true });
});

app.delete('/api/alerts/:id', auth(true), async (req, res) => {
  await db.run(`DELETE FROM alerts WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Alert deleted: ${req.params.id}`]);
  res.json({ ok: true });
});

app.get('/api/logs', auth(false), async (_req, res) => {
  const rows = await db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 100`);
  res.json(rows);
});

app.get('/api/bot/status', auth(false), async (_req, res) => {
  const rows = await db.all(`SELECT key, value FROM bot_state`);
  const obj = Object.fromEntries(rows.map((x) => [x.key, x.value]));
  const market = currentMarketStatus();
  res.json({
    uptimeSeconds: Number(obj.uptime_seconds || 0),
    emailsSent: Number(obj.emails_sent || 0),
    nseErrors: Number(obj.nse_errors || 0),
    marketOpen: market.open,
    marketLabel: market.label,
    heartbeat: obj.heartbeat || null
  });
});

app.get('/api/screener', async (req, res) => {
  const type = String(req.query.type || 'all').toLowerCase();
  const minPrice = Number(req.query.minPrice || 0);
  const change = String(req.query.change || 'all').toLowerCase();
  const sort = String(req.query.sort || 'change_desc').toLowerCase();

  let rows = await db.all(`SELECT * FROM instruments`);
  rows = rows.filter((i) => (type === 'all' ? true : i.type === type));
  rows = rows.filter((i) => i.current_price >= minPrice);
  rows = rows.filter((i) => (change === 'all' ? true : change === 'gainers' ? i.change_pct > 0 : change === 'losers' ? i.change_pct < 0 : Math.abs(i.change_pct) <= 0.5));

  rows.sort((a, b) => {
    if (sort === 'change_asc') return a.change_pct - b.change_pct;
    if (sort === 'price_desc') return b.current_price - a.current_price;
    if (sort === 'price_asc') return a.current_price - b.current_price;
    return b.change_pct - a.change_pct;
  });

  res.json(rows.map(publicInstrument));
});

app.use(express.static(path.join(__dirname, '..', '..', 'client', 'dist')));

app.use((_req, res) => {
  const file = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  return res.status(200).send('<h1>MarketPulse API is running</h1><p>Build the client with <code>npm run build --prefix client</code>.</p>');
});

async function start() {
  db = await openDb();
  await ensureSchema(db);

  const { seed } = require('./seed');
  await seed();

  cron.schedule('* * * * *', async () => {
    try {
      await refreshDemoMarket();
    } catch (err) {
      console.error('Market refresh failed', err);
      await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['error', `Market refresh failed: ${err.message}`]);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MarketPulse server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});

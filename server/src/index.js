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
const multer = require('multer');
const { z } = require('zod');
const { openDb, ensureSchema } = require('./db');
const { INSTRUMENTS, SECTORS, PORTFOLIO_TEMPLATES } = require('./data');
const { getPublicMailStatus, isMailConfigured, sendAlertEmail } = require('./mailer');
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
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const THRESHOLD_CONDITIONS = new Set(['below', 'above', 'nav_below', 'nav_above']);
const TRIGGER_CONDITIONS = new Set(['below', 'above', 'nav_below', 'nav_above', 'monthly_low', 'monthly_high']);
const PORTFOLIO_IMPORT_MODES = new Set(['fetch', 'skip']);
const PORTFOLIO_IMPORT_SOURCES = new Set(['cams_cas', 'nsdl_cas', 'broker_contract', 'email_forwarding', 'manual_review']);
const PORTFOLIO_IMPORT_ASSET_TYPES = new Set(['stock', 'mf', 'etf']);
const UPLOAD_DIR = process.env.PORTFOLIO_UPLOAD_DIR || path.join(__dirname, '..', 'data', 'uploads');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const allowedOrigins = new Set([
  process.env.CLIENT_DEV_ORIGIN || 'http://localhost:5173',
  process.env.CLIENT_PROD_ORIGIN || 'https://anas154.github.io',
  process.env.RENDER_EXTERNAL_URL
].filter(Boolean));

function isAllowedLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isLocalHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    return isHttp && isLocalHost;
  } catch {
    return false;
  }
}

const app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin) || isAllowedLocalOrigin(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

let db;

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function parseJsonSafely(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uniqueImportAssetTypes(values) {
  return [...new Set((values || []).filter((value) => PORTFOLIO_IMPORT_ASSET_TYPES.has(value)))];
}

function sanitizePortfolioImportRequest(input = {}) {
  return {
    source: PORTFOLIO_IMPORT_SOURCES.has(input.source) ? input.source : 'cams_cas',
    providerName: String(input.providerName || '').trim(),
    accountHint: String(input.accountHint || '').trim(),
    requestNotes: String(input.requestNotes || '').trim(),
    assetTypes: uniqueImportAssetTypes(input.assetTypes),
    requestedAt: new Date().toISOString()
  };
}

async function savePortfolioImportRequest(userId, request, status, importedCount = 0) {
  const existing = await db.get(`SELECT onboarding_json FROM users WHERE id = ?`, [userId]);
  const onboarding = parseJsonSafely(existing?.onboarding_json, {});
  const nextOnboarding = {
    ...onboarding,
    importMode: status === 'skipped' ? 'skip' : 'fetch',
    importStatus: status,
    importRequest: request || onboarding.importRequest || null
  };

  if (importedCount) {
    nextOnboarding.importedCount = importedCount;
  }

  await db.run(
    `UPDATE users
     SET onboarding_json = ?
     WHERE id = ?`,
    [JSON.stringify(nextOnboarding), userId]
  );

  return nextOnboarding;
}

function serializeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    displayName: user.display_name,
    pan: user.pan || '',
    onboardingCompleted: Boolean(user.onboarding_completed),
    onboardingStep: user.onboarding_step || 'welcome',
    onboarding: parseJsonSafely(user.onboarding_json),
    emailAlertsEnabled: Boolean(user.email_alerts_enabled),
    timezone: user.timezone || 'Asia/Kolkata'
  };
}

function portfolioTemplateFor(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return PORTFOLIO_TEMPLATES[normalized] || null;
}

function toPortfolioHolding(row) {
  const units = Number(row.units || 0);
  const avgCost = Number(row.avg_cost || 0);
  const currentPrice = Number(row.current_price || 0);
  const investedValue = Number((units * avgCost).toFixed(2));
  const currentValue = Number((units * currentPrice).toFixed(2));
  const pnl = Number((currentValue - investedValue).toFixed(2));
  const pnlPct = investedValue ? Number(((pnl / investedValue) * 100).toFixed(2)) : 0;

  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    type: row.type,
    exchange: row.exchange,
    source: row.source,
    units,
    avgCost,
    currentPrice,
    investedValue,
    currentValue,
    pnl,
    pnlPct,
    changePct: Number(row.change_pct || 0)
  };
}

async function getPortfolioRows(userId) {
  const rows = await db.all(
    `SELECT p.id, p.user_id, p.symbol, p.units, p.avg_cost, p.source, p.created_at, p.updated_at,
            i.name, i.type, i.exchange, i.current_price, i.change_pct
     FROM portfolio_holdings p
     JOIN instruments i ON i.symbol = p.symbol
     WHERE p.user_id = ?
     ORDER BY i.type, p.symbol`,
    [userId]
  );

  return rows.map(toPortfolioHolding);
}

function buildPortfolioSummary(holdings) {
  const investedValue = holdings.reduce((sum, item) => sum + item.investedValue, 0);
  const currentValue = holdings.reduce((sum, item) => sum + item.currentValue, 0);
  const pnl = Number((currentValue - investedValue).toFixed(2));
  const pnlPct = investedValue ? Number(((pnl / investedValue) * 100).toFixed(2)) : 0;

  return {
    investedValue: Number(investedValue.toFixed(2)),
    currentValue: Number(currentValue.toFixed(2)),
    pnl,
    pnlPct,
    holdingsCount: holdings.length
  };
}

async function importPortfolioForUser(user, { replaceExisting = true, source = 'email_fetch' } = {}) {
  const template = portfolioTemplateFor(user.email);
  if (!template || !template.length) {
    return { importedCount: 0, matchedTemplate: false };
  }

  if (replaceExisting) {
    await db.run(`DELETE FROM portfolio_holdings WHERE user_id = ?`, [user.id]);
  }

  for (const holding of template) {
    await db.run(
      `INSERT INTO portfolio_holdings(user_id, symbol, units, avg_cost, source, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, symbol) DO UPDATE SET
         units = excluded.units,
         avg_cost = excluded.avg_cost,
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`,
      [user.id, holding.symbol, holding.units, holding.avgCost, holding.source || source]
    );
  }

  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Portfolio imported for ${user.email} with ${template.length} holdings`]);

  return { importedCount: template.length, matchedTemplate: true };
}

function sanitizeUploadFilename(name) {
  return String(name || 'portfolio-upload')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'portfolio-upload';
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseNumber(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractHoldingRow(row) {
  const symbol = String(
    row.symbol
    || row.ticker
    || row.instrument
    || row.instrument_symbol
    || row.scheme_code
    || ''
  ).trim().toUpperCase();
  const units = parseNumber(row.units ?? row.qty ?? row.quantity);
  const totalCost = parseNumber(row.invested_value ?? row.cost_value ?? row.amount ?? row.total_cost);
  const avgCost = parseNumber(
    row.avg_cost
    ?? row.avgcost
    ?? row.average_cost
    ?? row.purchase_price
    ?? row.buy_price
    ?? row.price
  );

  const resolvedAvgCost = avgCost != null
    ? avgCost
    : (units && totalCost != null ? Number((totalCost / units).toFixed(6)) : null);

  if (!symbol || units == null || resolvedAvgCost == null || units <= 0 || resolvedAvgCost < 0) {
    return null;
  }

  return {
    symbol,
    units: Number(units.toFixed(4)),
    avgCost: Number(resolvedAvgCost.toFixed(4))
  };
}

function parseCsvPortfolioHoldings(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { holdings: [], warnings: ['The uploaded CSV did not contain any data rows.'] };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce((accumulator, header, index) => {
      accumulator[header] = values[index] || '';
      return accumulator;
    }, {});
  });

  return {
    holdings: rows.map(extractHoldingRow).filter(Boolean),
    warnings: []
  };
}

function parseJsonPortfolioHoldings(text) {
  const parsed = JSON.parse(String(text || '{}'));
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed.holdings || parsed.portfolio || parsed.items || [];

  if (!Array.isArray(rows)) {
    return { holdings: [], warnings: ['The JSON file must contain an array or a holdings/portfolio/items list.'] };
  }

  return {
    holdings: rows.map(extractHoldingRow).filter(Boolean),
    warnings: []
  };
}

function summarizeHoldings(holdings) {
  const aggregated = new Map();

  for (const holding of holdings) {
    const current = aggregated.get(holding.symbol) || { units: 0, investedValue: 0 };
    current.units += holding.units;
    current.investedValue += holding.units * holding.avgCost;
    aggregated.set(holding.symbol, current);
  }

  return [...aggregated.entries()].map(([symbol, value]) => ({
    symbol,
    units: Number(value.units.toFixed(4)),
    avgCost: Number((value.investedValue / value.units).toFixed(4))
  }));
}

async function storeImportFile(userId, file) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const originalName = sanitizeUploadFilename(file.originalname);
  const storedName = `${Date.now()}-${userId}-${originalName}`;
  const targetPath = path.join(UPLOAD_DIR, storedName);
  fs.writeFileSync(targetPath, file.buffer);
  return { storedName, targetPath };
}

async function recordPortfolioImport({
  userId,
  file,
  storedName,
  source,
  providerName,
  status,
  summary
}) {
  await db.run(
    `INSERT INTO portfolio_imports(user_id, original_name, stored_name, mime_type, file_size, source, provider_name, status, summary_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      file.originalname,
      storedName,
      file.mimetype || '',
      Number(file.size || 0),
      source,
      providerName || '',
      status,
      JSON.stringify(summary || {})
    ]
  );
}

async function importParsedHoldingsForUser(user, holdings, { replaceExisting = true, source = 'upload_import' } = {}) {
  if (replaceExisting) {
    await db.run(`DELETE FROM portfolio_holdings WHERE user_id = ?`, [user.id]);
  }

  for (const holding of holdings) {
    await db.run(
      `INSERT INTO portfolio_holdings(user_id, symbol, units, avg_cost, source, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, symbol) DO UPDATE SET
         units = excluded.units,
         avg_cost = excluded.avg_cost,
         source = excluded.source,
         updated_at = CURRENT_TIMESTAMP`,
      [user.id, holding.symbol, holding.units, holding.avgCost, source]
    );
  }

  await db.run(
    `INSERT INTO logs(level, message) VALUES (?, ?)`,
    ['info', `Portfolio upload imported for ${user.email} with ${holdings.length} holdings`]
  );

  return holdings.length;
}

async function parsePortfolioUpload(file) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const text = file.buffer.toString('utf8');

  if (extension === '.csv' || extension === '.txt' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || file.mimetype === 'text/plain') {
    return parseCsvPortfolioHoldings(text);
  }

  if (extension === '.json' || file.mimetype === 'application/json' || file.mimetype === 'text/json') {
    return parseJsonPortfolioHoldings(text);
  }

  return {
    holdings: [],
    warnings: ['This file type could not be auto-imported yet. Upload CSV or JSON, or keep the file for manual broker/CAS review.']
  };
}

function toAlertMetric(alert, instrument) {
  if (alert.condition === 'nav_below' || alert.condition === 'nav_above' || alert.condition === 'hourly_nav') {
    return {
      label: 'NAV',
      value: Number(instrument.inav ?? instrument.current_price ?? 0)
    };
  }

  return {
    label: 'Price',
    value: Number(instrument.current_price ?? 0)
  };
}

async function getMonthlyLow(symbol, lookbackDays = 30) {
  const rows = await db.all(
    `SELECT close
     FROM prices
     WHERE symbol = ?
     ORDER BY ts DESC
     LIMIT ?`,
    [symbol, lookbackDays]
  );

  if (!rows.length) return null;
  return rows.reduce((min, row) => Math.min(min, Number(row.close || 0)), Number(rows[0].close || 0));
}

function isSameMarketHour(a, b) {
  if (!a || !b) return false;
  const left = new Date(a);
  const right = new Date(b);

  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
    && left.getHours() === right.getHours();
}

function describeAlert(alert) {
  const labels = {
    below: 'Price below target',
    above: 'Price above target',
    nav_below: 'NAV below target',
    nav_above: 'NAV above target',
    monthly_low: 'Monthly low watch',
    monthly_high: 'Monthly high watch',
    hourly_nav: 'Hourly NAV mail'
  };

  return labels[alert.condition] || alert.condition;
}

async function sendAlertNotification({ alert, instrument, currentValue, metricLabel, monthlyLow = null, now = new Date() }) {
  const subject = `MarketPulse Alert: ${alert.symbol} ${describeAlert(alert)}`;
  const lines = [
    `Hello ${alert.display_name || alert.email},`,
    '',
    `Your alert for ${alert.symbol} has been triggered.`,
    `Rule: ${describeAlert(alert)}`,
    `${metricLabel}: ${currentValue.toFixed(2)}`
  ];

  if (alert.target != null && THRESHOLD_CONDITIONS.has(alert.condition)) {
    lines.push(`Target: ${Number(alert.target).toFixed(2)}`);
  }
  if (monthlyLow != null) {
    lines.push(`30-day low: ${Number(monthlyLow).toFixed(2)}`);
  }
  if (alert.note) {
    lines.push(`Note: ${alert.note}`);
  }
  lines.push(`Triggered at: ${now.toLocaleString('en-IN', { timeZone: alert.timezone || 'Asia/Kolkata' })}`);
  lines.push('');
  lines.push('This email was sent because email alerts are enabled on your MarketPulse account.');

  const html = `
    <div style="font-family:Segoe UI,sans-serif;line-height:1.6;color:#10203a">
      <h2 style="margin-bottom:8px;">MarketPulse Alert</h2>
      <p>Your alert for <strong>${alert.symbol}</strong> has been triggered.</p>
      <ul>
        <li><strong>Rule:</strong> ${describeAlert(alert)}</li>
        <li><strong>${metricLabel}:</strong> ${currentValue.toFixed(2)}</li>
        ${alert.target != null && THRESHOLD_CONDITIONS.has(alert.condition) ? `<li><strong>Target:</strong> ${Number(alert.target).toFixed(2)}</li>` : ''}
        ${monthlyLow != null ? `<li><strong>30-day low:</strong> ${Number(monthlyLow).toFixed(2)}</li>` : ''}
        ${alert.note ? `<li><strong>Note:</strong> ${alert.note}</li>` : ''}
      </ul>
      <p style="margin-top:16px;">Triggered at: ${now.toLocaleString('en-IN', { timeZone: alert.timezone || 'Asia/Kolkata' })}</p>
    </div>
  `;

  const result = await sendAlertEmail({
    to: alert.email,
    subject,
    text: lines.join('\n'),
    html
  });

  if (result.ok) {
    await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Email alert sent to ${alert.email} for ${alert.symbol}`]);
    const emails = await db.get(`SELECT value FROM bot_state WHERE key = 'emails_sent'`);
    const count = Number(emails?.value || '0') + 1;
    await db.run(`INSERT OR REPLACE INTO bot_state(key, value) VALUES (?, ?)`, ['emails_sent', String(count)]);
  } else if (result.skipped) {
    await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['warn', `Email alert skipped for ${alert.email}: ${result.reason}`]);
  }
}

function buildDashboardData(instruments, watchlist, alerts, portfolio = []) {
  const topMovers = [...instruments]
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, 6);

  const watchlistValue = watchlist.reduce((sum, item) => sum + Number(item.current_price || 0), 0);
  const watchlistChange = watchlist.reduce((sum, item) => sum + Number(item.change_pct || 0), 0);
  const portfolioSummary = buildPortfolioSummary(portfolio);

  return {
    summary: {
      watchlistValue: Number(watchlistValue.toFixed(2)),
      averageChangePct: watchlist.length ? Number((watchlistChange / watchlist.length).toFixed(2)) : 0,
      activeAlerts: alerts.filter((alert) => alert.enabled).length,
      watchlistCount: watchlist.length,
      portfolioValue: portfolioSummary.currentValue,
      portfolioInvestedValue: portfolioSummary.investedValue,
      portfolioPnl: portfolioSummary.pnl,
      portfolioPnlPct: portfolioSummary.pnlPct,
      holdingsCount: portfolioSummary.holdingsCount
    },
    topMovers
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, username: user.username, role: user.role, displayName: user.display_name },
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
      const user = await db.get(
        `SELECT id, email, username, role, display_name, pan, onboarding_completed, onboarding_step, onboarding_json,
                email_alerts_enabled, timezone, created_at
         FROM users
         WHERE id = ?`,
        [payload.sub]
      );
      if (!user) return res.status(401).json({ error: 'Invalid session' });
      req.user = user;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid session' });
    }
  };
}


function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
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
    `SELECT a.*, u.email, u.display_name, u.email_alerts_enabled, u.timezone FROM alerts a
     JOIN users u ON u.id = a.user_id
     WHERE a.enabled = 1`
  );

  for (const alert of activeAlerts) {
    if (!alert.email_alerts_enabled) continue;

    const inst = await db.get(`SELECT * FROM instruments WHERE symbol = ?`, [alert.symbol]);
    if (!inst) continue;
    const metric = toAlertMetric(alert, inst);
    const metricValue = metric.value;
    const target = alert.target == null ? null : Number(alert.target);
    let triggered = false;
    let monthlyLow = null;

    if (alert.condition === 'below' && target != null) triggered = metricValue <= target;
    if (alert.condition === 'above' && target != null) triggered = metricValue >= target;
    if (alert.condition === 'nav_below' && target != null) triggered = metricValue <= target;
    if (alert.condition === 'nav_above' && target != null) triggered = metricValue >= target;
    if (alert.condition === 'monthly_low') {
      monthlyLow = await getMonthlyLow(alert.symbol);
      if (monthlyLow != null) triggered = Number(inst.current_price || 0) <= monthlyLow;
    }
    if (alert.condition === 'monthly_high') triggered = Number(inst.current_price || 0) >= Number(inst.high52 || 0) * 0.99;

    if (alert.condition === 'hourly_nav') {
      const canSendHourly = market.open && now.getMinutes() === 0 && !isSameMarketHour(alert.last_sent_at, now);
      if (canSendHourly) {
        await sendAlertNotification({
          alert,
          instrument: inst,
          currentValue: metricValue,
          metricLabel: metric.label,
          now
        });
        await db.run(
          `UPDATE alerts SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [alert.id]
        );
      }
      continue;
    }

    if (triggered && !alert.triggered_at) {
      await db.run(
        `UPDATE alerts SET triggered_at = CURRENT_TIMESTAMP, last_sent_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [alert.id]
      );
      await db.run(
        `INSERT INTO logs(level, message) VALUES (?, ?)`,
        ['warn', `ALERT: ${alert.symbol} triggered for ${alert.condition} by ${alert.email}`]
      );
      await sendAlertNotification({
        alert,
        instrument: inst,
        currentValue: metricValue,
        metricLabel: metric.label,
        monthlyLow,
        now
      });
    }

    if (!triggered && alert.triggered_at) {
      await db.run(
        `UPDATE alerts SET triggered_at = NULL WHERE id = ?`,
        [alert.id]
      );
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

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

app.get('/health', async (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const schema = z.object({
    identifier: z.string().min(2).optional(),
    email: z.string().email().optional(),
    password: z.string().min(6)
  }).refine((val) => Boolean(val.identifier || val.email), { message: 'Login identifier required' });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid credentials payload' });

  const rawIdentifier = parsed.data.identifier || parsed.data.email;
  const identifier = String(rawIdentifier).trim();
  const user = await db.get(`SELECT * FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)`, [identifier, identifier]);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  res.json({
    token: signToken(user),
    user: serializeUser(user)
  });
});


app.post('/api/auth/register', async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(24).regex(/^[A-Za-z0-9_]+$/),
    displayName: z.string().min(2).max(60),
    password: z.string().min(8)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid registration payload' });

  const email = parsed.data.email.trim().toLowerCase();
  const username = normalizeUsername(parsed.data.username);
  const exists = await db.get(`SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)`, [email, username]);
  if (exists) return res.status(409).json({ error: 'Email or username already exists' });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const result = await db.run(
    `INSERT INTO users(email, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, 'user')`,
    [email, username, passwordHash, parsed.data.displayName.trim()]
  );
  const user = await db.get(`SELECT * FROM users WHERE id = ?`, [result.lastID]);

  res.status(201).json({
    token: signToken(user),
    user: serializeUser(user)
  });
});

app.post('/api/admin/users', auth(true), requireAdmin, async (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    username: z.string().min(3).max(24).regex(/^[A-Za-z0-9_]+$/),
    displayName: z.string().min(2).max(60),
    password: z.string().min(8),
    role: z.enum(['user', 'admin']).default('user')
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user payload' });

  const email = parsed.data.email.trim().toLowerCase();
  const username = normalizeUsername(parsed.data.username);
  const exists = await db.get(`SELECT id FROM users WHERE lower(email) = lower(?) OR lower(username) = lower(?)`, [email, username]);
  if (exists) return res.status(409).json({ error: 'Email or username already exists' });

  const hash = await bcrypt.hash(parsed.data.password, 10);
  const result = await db.run(
    `INSERT INTO users(email, username, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)`,
    [email, username, hash, parsed.data.displayName.trim(), parsed.data.role]
  );

  const user = await db.get(
    `SELECT id, email, username, role, display_name, pan, onboarding_completed, onboarding_step, onboarding_json,
            email_alerts_enabled, timezone, created_at
     FROM users
     WHERE id = ?`,
    [result.lastID]
  );
  res.status(201).json({ user });
});

app.get('/api/admin/users', auth(true), requireAdmin, async (_req, res) => {
  const users = await db.all(
    `SELECT id, email, username, role, display_name, pan, onboarding_completed, email_alerts_enabled, created_at
     FROM users
     ORDER BY created_at DESC`
  );
  res.json(users);
});

app.get('/api/me', auth(true), async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

app.get('/api/bootstrap', auth(false), async (req, res) => {
  const userId = req.user?.id || null;
  const isAdmin = req.user?.role === 'admin';
  const [instruments, sectors, botState, logs] = await Promise.all([
    db.all(`SELECT * FROM instruments ORDER BY CASE type WHEN 'index' THEN 1 WHEN 'etf' THEN 2 WHEN 'stock' THEN 3 ELSE 4 END, symbol`),
    Promise.resolve(SECTORS),
    db.all(`SELECT key, value FROM bot_state`),
    isAdmin ? db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 50`) : Promise.resolve([])
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
  const portfolio = userId ? await getPortfolioRows(userId) : [];
  const dashboard = buildDashboardData(instruments.map(publicInstrument), watchlist, alerts, portfolio);
  const portfolioSummary = buildPortfolioSummary(portfolio);

  res.json({
    user: serializeUser(req.user),
    instruments: instruments.map(publicInstrument),
    sectors,
    alerts,
    watchlist,
    portfolio,
    portfolioSummary,
    dashboard,
    logs,
    mailStatus: getPublicMailStatus(),
    botState: Object.fromEntries(botState.map((x) => [x.key, x.value])),
    marketStatus: currentMarketStatus(),
    defaultSymbol: portfolio[0]?.symbol || watchlist[0]?.symbol || 'GOLDBEES'
  });
});

app.get('/api/dashboard', auth(true), async (req, res) => {
  const [instruments, alerts, watchlist, portfolio] = await Promise.all([
    db.all(`SELECT * FROM instruments ORDER BY symbol`),
    db.all(`SELECT * FROM alerts WHERE user_id = ? ORDER BY id DESC`, [req.user.id]),
    db.all(
      `SELECT w.id, w.symbol, i.name, i.type, i.current_price, i.change_pct, i.high52, i.low52
       FROM watchlists w
       JOIN instruments i ON i.symbol = w.symbol
       WHERE w.user_id = ?
       ORDER BY w.id DESC`,
      [req.user.id]
    ),
    getPortfolioRows(req.user.id)
  ]);

  res.json(buildDashboardData(instruments.map(publicInstrument), watchlist, alerts, portfolio));
});

app.post('/api/onboarding/complete', auth(true), async (req, res) => {
  const schema = z.object({
    consentAccepted: z.boolean(),
    displayName: z.string().trim().min(2).max(60),
    pan: z.string().trim().transform((value) => value.toUpperCase()),
    importMode: z.string().refine((value) => PORTFOLIO_IMPORT_MODES.has(value)),
    importSource: z.string().default('cams_cas').refine((value) => PORTFOLIO_IMPORT_SOURCES.has(value)),
    importProvider: z.string().trim().max(80).default(''),
    importAccountHint: z.string().trim().max(80).default(''),
    importAssetTypes: z.array(z.string()).default([]),
    importNotes: z.string().trim().max(500).default(''),
    emailAlertsEnabled: z.boolean().default(true)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid onboarding payload' });
  if (!parsed.data.consentAccepted) return res.status(400).json({ error: 'Consent is required to continue' });
  if (!PAN_REGEX.test(parsed.data.pan)) return res.status(400).json({ error: 'PAN must be in valid format' });

  const importRequest = sanitizePortfolioImportRequest({
    source: parsed.data.importSource,
    providerName: parsed.data.importProvider,
    accountHint: parsed.data.importAccountHint,
    requestNotes: parsed.data.importNotes,
    assetTypes: parsed.data.importAssetTypes
  });

  if (parsed.data.importMode === 'fetch') {
    if (!importRequest.providerName) {
      return res.status(400).json({ error: 'Add the broker, RTA, or platform name before starting portfolio fetch.' });
    }
    if (!importRequest.assetTypes.length) {
      return res.status(400).json({ error: 'Choose at least one asset type to import.' });
    }
  }

  const onboarding = {
    consentAccepted: parsed.data.consentAccepted,
    importMode: parsed.data.importMode,
    importRequest: parsed.data.importMode === 'fetch' ? importRequest : null,
    completedAt: new Date().toISOString()
  };

  let importedCount = 0;
  let importStatus = parsed.data.importMode === 'skip' ? 'skipped' : 'pending_manual_connection';
  if (parsed.data.importMode === 'fetch') {
    const result = await importPortfolioForUser(req.user, {
      replaceExisting: true,
      source: importRequest.source
    });
    importedCount = result.importedCount;
    importStatus = result.matchedTemplate ? 'imported' : 'pending_manual_connection';
    onboarding.importStatus = importStatus;
    if (importedCount) onboarding.importedCount = importedCount;
  } else {
    onboarding.importStatus = importStatus;
  }

  await db.run(
    `UPDATE users
     SET display_name = ?, pan = ?, onboarding_completed = 1, onboarding_step = 'done', onboarding_json = ?, email_alerts_enabled = ?
     WHERE id = ?`,
    [parsed.data.displayName, parsed.data.pan, JSON.stringify(onboarding), parsed.data.emailAlertsEnabled ? 1 : 0, req.user.id]
  );

  const user = await db.get(
    `SELECT id, email, username, role, display_name, pan, onboarding_completed, onboarding_step, onboarding_json,
            email_alerts_enabled, timezone, created_at
     FROM users
     WHERE id = ?`,
    [req.user.id]
  );

  if (parsed.data.importMode === 'fetch') {
    await db.run(
      `INSERT INTO logs(level, message) VALUES (?, ?)`,
      ['info', `Portfolio fetch request saved for ${req.user.email} via ${importRequest.providerName}`]
    );
  }

  res.json({ user: serializeUser(user), importedCount, importStatus });
});

app.patch('/api/profile', auth(true), async (req, res) => {
  const schema = z.object({
    displayName: z.string().trim().min(2).max(60),
    username: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/),
    emailAlertsEnabled: z.boolean().optional(),
    timezone: z.string().trim().min(3).max(60).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid profile payload' });

  const username = normalizeUsername(parsed.data.username);
  const exists = await db.get(
    `SELECT id
     FROM users
     WHERE lower(username) = lower(?)
       AND id <> ?`,
    [username, req.user.id]
  );
  if (exists) return res.status(409).json({ error: 'Username already exists' });

  await db.run(
    `UPDATE users
     SET display_name = ?, username = ?, email_alerts_enabled = ?, timezone = ?
     WHERE id = ?`,
    [
      parsed.data.displayName,
      username,
      parsed.data.emailAlertsEnabled === undefined ? req.user.email_alerts_enabled : (parsed.data.emailAlertsEnabled ? 1 : 0),
      parsed.data.timezone || req.user.timezone || 'Asia/Kolkata',
      req.user.id
    ]
  );

  const user = await db.get(
    `SELECT id, email, username, role, display_name, pan, onboarding_completed, onboarding_step, onboarding_json,
            email_alerts_enabled, timezone, created_at
     FROM users
     WHERE id = ?`,
    [req.user.id]
  );

  res.json({ user: serializeUser(user) });
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

app.get('/api/search', auth(true), async (req, res) => {
  const rawQuery = String(req.query.q || '').trim();
  const query = normalizeSearchText(rawQuery);
  if (!query) return res.json([]);
  const tokens = query.split(/\s+/).filter(Boolean);

  const rows = await db.all(`SELECT * FROM instruments ORDER BY symbol`);
  const matches = rows
    .map(publicInstrument)
    .map((item) => {
      const symbol = normalizeSearchText(item.symbol);
      const searchable = normalizeSearchText([
        item.symbol,
        item.name,
        item.type,
        item.exchange,
        item.sector
      ].join(' '));
      const score = symbol === query
        ? 0
        : symbol.startsWith(query)
          ? 1
          : item.name.toLowerCase().startsWith(rawQuery.toLowerCase())
            ? 2
            : 3;

      return { item, searchable, score };
    })
    .filter(({ searchable }) => tokens.every((token) => searchable.includes(token)))
    .sort((a, b) => a.score - b.score || a.item.symbol.localeCompare(b.item.symbol))
    .map(({ item }) => item)
    .slice(0, 10);

  res.json(matches);
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

app.get('/api/portfolio', auth(true), async (req, res) => {
  const holdings = await getPortfolioRows(req.user.id);
  res.json({
    holdings,
    summary: buildPortfolioSummary(holdings)
  });
});

app.post('/api/portfolio/import', auth(true), async (req, res) => {
  const schema = z.object({
    replaceExisting: z.boolean().optional().default(true),
    importSource: z.string().default('cams_cas').refine((value) => PORTFOLIO_IMPORT_SOURCES.has(value)),
    importProvider: z.string().trim().min(2).max(80),
    importAccountHint: z.string().trim().max(80).default(''),
    importAssetTypes: z.array(z.string()).default([]),
    importNotes: z.string().trim().max(500).default('')
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid import payload' });

  const importRequest = sanitizePortfolioImportRequest({
    source: parsed.data.importSource,
    providerName: parsed.data.importProvider,
    accountHint: parsed.data.importAccountHint,
    requestNotes: parsed.data.importNotes,
    assetTypes: parsed.data.importAssetTypes
  });

  if (!importRequest.assetTypes.length) {
    return res.status(400).json({ error: 'Choose at least one asset type to import.' });
  }

  const result = await importPortfolioForUser(req.user, {
    replaceExisting: parsed.data.replaceExisting,
    source: importRequest.source
  });
  const importedCount = result.importedCount;
  const importStatus = result.matchedTemplate ? 'imported' : 'pending_manual_connection';
  const onboarding = await savePortfolioImportRequest(req.user.id, importRequest, importStatus, importedCount);

  await db.run(
    `INSERT INTO logs(level, message) VALUES (?, ?)`,
    ['info', `Portfolio import request updated for ${req.user.email} via ${importRequest.providerName}`]
  );

  const holdings = await getPortfolioRows(req.user.id);

  res.json({
    importedCount,
    importStatus,
    onboarding,
    holdings,
    summary: buildPortfolioSummary(holdings)
  });
});

app.post('/api/portfolio/import-file', auth(true), upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Choose a portfolio file to upload.' });
  }

  const replaceExisting = String(req.body.replaceExisting || 'true').toLowerCase() !== 'false';
  const importRequest = sanitizePortfolioImportRequest({
    source: req.body.importSource,
    providerName: req.body.importProvider,
    accountHint: req.body.importAccountHint,
    requestNotes: req.body.importNotes,
    assetTypes: parseJsonSafely(req.body.importAssetTypes, [])
  });

  if (!importRequest.providerName) {
    return res.status(400).json({ error: 'Add the broker, RTA, or platform name before uploading the file.' });
  }

  if (!importRequest.assetTypes.length) {
    return res.status(400).json({ error: 'Choose at least one asset type to import.' });
  }

  const { storedName } = await storeImportFile(req.user.id, req.file);
  const parsed = await parsePortfolioUpload(req.file);
  const knownInstruments = new Set((await db.all(`SELECT symbol FROM instruments`)).map((row) => row.symbol));
  const validHoldings = summarizeHoldings(parsed.holdings.filter((holding) => knownInstruments.has(holding.symbol)));
  const unknownSymbols = [...new Set(parsed.holdings
    .filter((holding) => !knownInstruments.has(holding.symbol))
    .map((holding) => holding.symbol))];
  const warnings = [
    ...parsed.warnings,
    ...(unknownSymbols.length ? [`Skipped unknown symbols: ${unknownSymbols.join(', ')}`] : [])
  ];

  let importedCount = 0;
  let importStatus = 'uploaded_pending_review';

  if (validHoldings.length) {
    importedCount = await importParsedHoldingsForUser(req.user, validHoldings, {
      replaceExisting,
      source: `file_upload:${importRequest.source}`
    });
    importStatus = 'imported_from_file';
  }

  const onboarding = await savePortfolioImportRequest(req.user.id, importRequest, importStatus, importedCount);
  await recordPortfolioImport({
    userId: req.user.id,
    file: req.file,
    storedName,
    source: importRequest.source,
    providerName: importRequest.providerName,
    status: importStatus,
    summary: {
      importedCount,
      warnings,
      assetTypes: importRequest.assetTypes
    }
  });

  await db.run(
    `INSERT INTO logs(level, message) VALUES (?, ?)`,
    ['info', `Portfolio file uploaded for ${req.user.email}: ${req.file.originalname}`]
  );

  const holdings = await getPortfolioRows(req.user.id);
  return res.json({
    importedCount,
    importStatus,
    warnings,
    onboarding,
    holdings,
    summary: buildPortfolioSummary(holdings)
  });
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
    condition: z.enum(['below', 'above', 'nav_below', 'nav_above', 'monthly_low', 'monthly_high', 'hourly_nav']),
    target: z.number().optional().nullable(),
    note: z.string().optional().default(''),
    enabled: z.boolean().optional().default(true)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid alert payload' });
  if (THRESHOLD_CONDITIONS.has(parsed.data.condition) && parsed.data.target == null) {
    return res.status(400).json({ error: 'Target is required for threshold alerts' });
  }

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
    note: z.string().optional(),
    condition: z.enum(['below', 'above', 'nav_below', 'nav_above', 'monthly_low', 'monthly_high', 'hourly_nav']).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid update payload' });

  const existing = await db.get(`SELECT * FROM alerts WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  if (!existing) return res.status(404).json({ error: 'Alert not found' });

  const enabled = parsed.data.enabled ?? Boolean(existing.enabled);
  const target = parsed.data.target === undefined ? existing.target : parsed.data.target;
  const note = parsed.data.note ?? existing.note;
  const condition = parsed.data.condition ?? existing.condition;

  if (THRESHOLD_CONDITIONS.has(condition) && target == null) {
    return res.status(400).json({ error: 'Target is required for threshold alerts' });
  }

  await db.run(
    `UPDATE alerts
     SET enabled = ?, target = ?, note = ?, condition = ?, triggered_at = NULL
     WHERE id = ? AND user_id = ?`,
    [enabled ? 1 : 0, target, note, condition, req.params.id, req.user.id]
  );
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Alert updated: ${existing.symbol}`]);
  res.json({ ok: true });
});

app.delete('/api/alerts/:id', auth(true), async (req, res) => {
  await db.run(`DELETE FROM alerts WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Alert deleted: ${req.params.id}`]);
  res.json({ ok: true });
});

app.get('/api/logs', auth(true), requireAdmin, async (_req, res) => {
  const rows = await db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 100`);
  res.json(rows);
});

app.post('/api/admin/test-mail', auth(true), requireAdmin, async (req, res) => {
  const schema = z.object({
    to: z.string().email(),
    subject: z.string().trim().min(3).max(120).optional(),
    body: z.string().trim().min(3).max(4000).optional()
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid test mail payload' });
  if (!isMailConfigured()) {
    const mailStatus = getPublicMailStatus();
    return res.status(503).json({
      error: `SMTP is not configured on the server yet. Missing: ${mailStatus.missingFields.join(', ') || 'SMTP details'}.`
    });
  }

  const subject = parsed.data.subject || 'MarketPulse test mail';
  const body = parsed.data.body || 'This is a test email sent from the MarketPulse admin panel.';

  await sendAlertEmail({
    to: parsed.data.to,
    subject,
    text: body,
    html: `<div style="font-family:Segoe UI,sans-serif;color:#172033;line-height:1.6"><h2>${subject}</h2><p>${body}</p><p>Sent from the MarketPulse admin panel.</p></div>`
  });

  await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['info', `Admin test mail sent to ${parsed.data.to}`]);
  res.json({ ok: true });
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

app.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Portfolio upload must be 5 MB or smaller.' });
    }
    return res.status(400).json({ error: error.message });
  }

  return next(error);
});

app.use(express.static(CLIENT_BUILD_PATH));

app.use((_req, res) => {
  const file = path.join(CLIENT_BUILD_PATH, 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  return res.status(200).send('<h1>MarketPulse API is running</h1><p>Build the client with <code>npm run build --prefix client</code>.</p>');
});

async function start() {
  db = await openDb();
  await ensureSchema(db);

  const { seed } = require('./seed');
  await seed();

  if (!isMailConfigured()) {
    await db.run(`INSERT INTO logs(level, message) VALUES (?, ?)`, ['warn', 'SMTP is not configured. Email alerts will be skipped until SMTP env vars are set.']);
  }

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

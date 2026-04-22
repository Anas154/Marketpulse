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

app.use(helmet({ contentSecurityPolicy: false }));
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

// rest unchanged

app.use(express.static(path.join(__dirname, '..', '..', 'client', 'dist')));

app.use((_req, res) => {
  const file = path.join(__dirname, '..', '..', 'client', 'dist', 'index.html');
  if (fs.existsSync(file)) return res.sendFile(file);
  return res.status(200).send('<h1>MarketPulse API is running</h1>');
});

async function start() {
  db = await openDb();
  await ensureSchema(db);
  const { seed } = require('./seed');
  await seed();

  cron.schedule('* * * * *', async () => {
    try { await refreshDemoMarket(); } catch (err) { console.error(err); }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MarketPulse server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => { console.error(err); process.exit(1); });

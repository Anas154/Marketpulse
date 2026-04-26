const crypto = require('crypto');

function hashSeed(input) {
  const hex = crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, 8);
  return parseInt(hex, 16);
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatISODate(date) {
  return date.toISOString().slice(0, 10);
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function previousTradingDay(date) {
  const d = new Date(date);
  do {
    d.setDate(d.getDate() - 1);
  } while (isWeekend(d));
  return d;
}

function tradingDaysBack(count, anchor = new Date()) {
  const out = [];
  let cursor = new Date(anchor);
  while (out.length < count) {
    cursor = previousTradingDay(cursor);
    out.unshift(new Date(cursor));
  }
  return out;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function generateHistory(instrument, days = 252) {
  const rand = mulberry32(hashSeed(`${instrument.symbol}:${days}`));
  const dates = tradingDaysBack(days);
  const low = instrument.low52;
  const high = instrument.high52;
  const span = Math.max(high - low, low * 0.05);
  const startBase = clamp(instrument.current_price * (0.76 + rand() * 0.10), low, high);
  const rows = [];
  let previousClose = startBase;

  for (let i = 0; i < dates.length; i += 1) {
    const t = i / Math.max(dates.length - 1, 1);
    const trend = startBase + (instrument.current_price - startBase) * t;
    const wave = Math.sin(i / 6.5) * span * 0.03;
    const noise = (rand() - 0.5) * span * 0.02;
    const close = clamp(trend + wave + noise, low, high);
    const open = i === 0 ? close * (0.995 + rand() * 0.01) : previousClose;
    const highCandle = clamp(Math.max(open, close) + span * (0.01 + rand() * 0.01), low, high);
    const lowCandle = clamp(Math.min(open, close) - span * (0.01 + rand() * 0.01), low, high);
    const volume = Math.round(500000 + rand() * 3500000);

    rows.push({
      symbol: instrument.symbol,
      ts: formatISODate(dates[i]),
      open: round(open),
      high: round(highCandle),
      low: round(lowCandle),
      close: round(close),
      volume,
      timeframe: '1D'
    });

    previousClose = close;
  }

  rows[rows.length - 1] = {
    ...rows[rows.length - 1],
    close: round(instrument.current_price),
    high: round(Math.max(instrument.current_price * 1.004, rows[rows.length - 1].high)),
    low: round(Math.min(instrument.current_price * 0.997, rows[rows.length - 1].low))
  };

  return rows;
}

function generateIntraday(instrument) {
  const rand = mulberry32(hashSeed(`intraday:${instrument.symbol}`));
  const points = [];
  const today = new Date();
  const base = instrument.current_price * (0.992 + rand() * 0.004);
  const times = ['09:15', '09:30', '09:45', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];

  let prev = base;
  times.forEach((time, idx) => {
    const [hh, mm] = time.split(':').map(Number);
    const ts = new Date(today);
    ts.setHours(hh, mm, 0, 0);
    const progress = idx / Math.max(times.length - 1, 1);
    const drift = (instrument.current_price - base) * progress;
    const noise = (rand() - 0.5) * instrument.current_price * 0.004;
    const close = clamp(base + drift + noise, instrument.low52 * 0.98, instrument.high52 * 1.01);
    const open = idx === 0 ? close * 0.999 : prev;
    const high = clamp(Math.max(open, close) + instrument.current_price * (0.002 + rand() * 0.002), instrument.low52 * 0.98, instrument.high52 * 1.01);
    const low = clamp(Math.min(open, close) - instrument.current_price * (0.002 + rand() * 0.002), instrument.low52 * 0.98, instrument.high52 * 1.01);

    points.push({
      symbol: instrument.symbol,
      ts: ts.toISOString(),
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(idx === times.length - 1 ? instrument.current_price : close),
      volume: Math.round(80000 + rand() * 350000),
      timeframe: '1D'
    });

    prev = close;
  });

  return points;
}

function aggregateRows(rows, tf) {
  if (tf === '1D') return rows.map((r) => ({
    x: r.ts.includes('T') ? r.ts : `${r.ts}T00:00:00Z`,
    o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume
  }));

  if (tf === '1W' || tf === '1M' || tf === '3M') {
    const maxRows = tf === '1W' ? 5 : tf === '1M' ? 22 : 65;
    const sliced = rows.slice(-maxRows);
    return sliced.map((r) => ({
      x: r.ts.includes('T') ? r.ts : `${r.ts}T00:00:00Z`,
      o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume
    }));
  }

  if (tf === '1Y') {
    const map = new Map();
    for (const row of rows) {
      const month = row.ts.slice(0, 7);
      if (!map.has(month)) {
        map.set(month, { ...row, ts: `${month}-01T00:00:00Z` });
      } else {
        const item = map.get(month);
        item.high = round(Math.max(item.high, row.high));
        item.low = round(Math.min(item.low, row.low));
        item.close = row.close;
        item.volume += row.volume;
      }
    }
    return Array.from(map.values()).map((r) => ({
      x: r.ts,
      o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume
    }));
  }

  return rows.map((r) => ({
    x: r.ts.includes('T') ? r.ts : `${r.ts}T00:00:00Z`,
    o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume
  }));
}

function round(n) {
  return Number(Number(n).toFixed(2));
}

function currentMarketStatus(date = new Date()) {
  const day = date.getDay();
  const minutes = date.getHours() * 60 + date.getMinutes();
  const openMinutes = 9 * 60 + 15;
  const closeMinutes = 15 * 60 + 30;
  const open = day >= 1 && day <= 5 && minutes >= openMinutes && minutes <= closeMinutes;
  return {
    open,
    label: open ? 'NSE Open' : 'NSE Closed'
  };
}

function pctPosition(current, low, high) {
  return Number((((current - low) / Math.max(high - low, 1)) * 100).toFixed(1));
}

module.exports = {
  hashSeed,
  mulberry32,
  tradingDaysBack,
  generateHistory,
  generateIntraday,
  aggregateRows,
  currentMarketStatus,
  pctPosition
};

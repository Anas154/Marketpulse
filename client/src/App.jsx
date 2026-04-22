import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler } from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import { Search, Bell, LayoutGrid, LineChart as LineChartIcon, Menu, ShieldCheck, Filter, Settings2, TrendingUp, TrendingDown, Clock3, Globe2, LogOut, User2, Plus, X, ArrowUpRight, ArrowDownRight, CalendarClock, Gauge } from 'lucide-react';
import { apiFetch, clearSession, getSessionToken, saveSession } from './api';
import MiniMetric from './components/MiniMetric'

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Legend, Filler, zoomPlugin);

const navItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'bot', label: 'Alert Bot' },
  { key: 'sectors', label: 'Sectors' },
  { key: 'screener', label: 'Screener' }
];

const timeframeConfig = {
  '1D': { unit: 'minute', title: 'Intraday' },
  '1W': { unit: 'day', title: 'Weekly' },
  '1M': { unit: 'day', title: 'Monthly' },
  '3M': { unit: 'week', title: 'Quarterly' },
  '1Y': { unit: 'month', title: 'Yearly' }
};

const demoCredentials = {
  email: 'demo@marketpulse.local',
  password: 'Password123!'
};

function formatINR(value) {
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    minimumFractionDigits: value >= 1000 ? 0 : 2
  }).format(Number(value || 0));
}

function pctBadge(value) {
  const positive = Number(value) >= 0;
  return {
    label: `${positive ? '▲ +' : '▼ '}${Math.abs(Number(value)).toFixed(2)}%`,
    className: positive ? 'badge badge-pos' : 'badge badge-neg',
    icon: positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />
  };
}

function SectionTitle({ icon, title, subtitle }) {
  return (
    <div className="section-title">
      <div className="section-title__row">
        <span className="section-title__icon">{icon}</span>
        <h2>{title}</h2>
      </div>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}

function Card({ title, icon, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <SectionTitle icon={icon} title={title} />
      <div className="card__body">{children}</div>
    </section>
  );
}

function StatCard({ label, value, helper, tone = 'neutral' }) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__helper">{helper}</div>
    </div>
  );
}

function DataChip({ label, value, tone = 'neutral' }) {
  return (
    <div className={`chip-card chip-card--${tone}`}>
      <div className="chip-card__label">{label}</div>
      <div className="chip-card__value">{value}</div>
    </div>
  );
}

function Toggle({ on, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`toggle ${on ? 'toggle--on' : ''}`}
      onClick={onToggle}
    >
      <span className="toggle__dot" />
    </button>
  );
}

function Badge({ type, children }) {
  return <span className={`asset-badge asset-badge--${type}`}>{children}</span>;
}

function loginFallback() {
  const email = demoCredentials.email;
  const password = demoCredentials.password;
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

function buildChartOptions(unit) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111318',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        titleColor: '#cbd5e1',
        bodyColor: '#f8fafc',
        callbacks: {
          label: (ctx) => `₹${formatINR(ctx.parsed.y)}`
        }
      },
      zoom: {
        zoom: {
          wheel: { enabled: true },
          pinch: { enabled: true },
          drag: { enabled: false },
          mode: 'x'
        },
        pan: {
          enabled: true,
          mode: 'x'
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit,
          tooltipFormat: 'dd MMM yyyy, HH:mm'
        },
        ticks: {
          color: '#94a3b8',
          font: { size: 11 }
        },
        grid: {
          color: 'rgba(255,255,255,0.05)'
        }
      },
      y: {
        position: 'right',
        ticks: {
          color: '#94a3b8',
          font: { size: 11 },
          callback: (v) => `₹${formatINR(v)}`
        },
        grid: {
          color: 'rgba(255,255,255,0.05)'
        }
      }
    }
  };
}

function makeRefLinePlugin(lowRef, avgRef) {
  return {
    id: 'refLinePlugin',
    afterDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales?.y) return;

      const drawLine = (value, color, dash, label) => {
        if (value == null) return;
        const y = scales.y.getPixelForValue(value);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.setLineDash(dash);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(chartArea.left, y);
        ctx.lineTo(chartArea.right, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(label, chartArea.right + 6, y - 3);
        ctx.restore();
      };

      drawLine(lowRef, '#ef4444', [4, 4], `₹${formatINR(lowRef)}`);
      drawLine(avgRef, '#3b82f6', [2, 4], 'avg');
    }
  };
}

export default function App() {
  const [boot, setBoot] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [activeSym, setActiveSym] = useState('GOLDBEES');
  const [timeframe, setTimeframe] = useState('3M');
  const [search, setSearch] = useState('');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [filter, setFilter] = useState('all');
  const [botStatus, setBotStatus] = useState(null);
  const [chartState, setChartState] = useState({ rows: [], lowRef: null, avgRef: null });
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [loginForm, setLoginForm] = useState(demoCredentials);
  const [authReady, setAuthReady] = useState(Boolean(getSessionToken()));

  const chart = useMemo(() => {
    const rows = chartState.rows || [];
    return {
      labels: rows.map((r) => r.x),
      datasets: [
        {
          data: rows.map((r) => ({ x: r.x, y: r.c ?? r.close ?? r.price })),
          borderColor: '#22c55e',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.28,
          fill: true,
          backgroundColor: 'rgba(34,197,94,0.08)'
        }
      ]
    };
  }, [chartState]);

  const currentInstrument = useMemo(() => {
    if (!boot?.instruments?.length) return null;
    return boot.instruments.find((i) => i.symbol === activeSym) || boot.instruments[0];
  }, [boot, activeSym]);

  const filteredInstruments = useMemo(() => {
    const items = boot?.instruments || [];
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      const matchesSearch = !q || i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' ? true : i.type === filter;
      return matchesSearch && matchesFilter;
    });
  }, [boot, search, filter]);

  useEffect(() => {
    const init = async () => {
      try {
        if (!getSessionToken()) {
          const login = await loginFallback();
          saveSession(login.token);
        }
        let data;
        try {
          data = await apiFetch('/api/bootstrap');
        } catch {
          clearSession();
          const login = await loginFallback();
          saveSession(login.token);
          data = await apiFetch('/api/bootstrap');
        }
        setBoot(data);
        setBotStatus(await apiFetch('/api/bot/status'));
        setActiveSym(data.defaultSymbol || 'GOLDBEES');
        setAuthReady(true);
      } catch (err) {
        setLoginError(err.message || 'Failed to initialize');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const load = async () => {
      try {
        const history = await apiFetch(`/api/instruments/${activeSym}/history?tf=${timeframe}`);
        const rows = history.rows || [];
        const closes = rows.map((r) => r.c);
        const lowRef = closes.length ? Math.min(...closes) : null;
        const avgRef = closes.length ? Number((closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2)) : null;
        setChartState({ rows, lowRef, avgRef });
      } catch {
        setChartState({ rows: [], lowRef: null, avgRef: null });
      }
    };
    load();
  }, [authReady, activeSym, timeframe]);

  useEffect(() => {
    if (!authReady) return;
    const refresh = async () => {
      try {
        const [status, bootstrap] = await Promise.all([
          apiFetch('/api/bot/status'),
          apiFetch('/api/bootstrap')
        ]);
        setBotStatus(status);
        setBoot((prev) => ({ ...(prev || {}), ...bootstrap, instruments: bootstrap.instruments || (prev || {}).instruments || [], alerts: bootstrap.alerts || (prev || {}).alerts || [], watchlist: bootstrap.watchlist || (prev || {}).watchlist || [] }));
      } catch {
        // silent
      }
    };
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [authReady]);

  const chartLow = chartState.lowRef;
  const chartAvg = chartState.avgRef;

  const currentPrice = Number(currentInstrument?.currentPrice || 0);
  const monthlyLow = Number(currentInstrument?.low52 || 0);
  const monthlyHigh = Number(currentInstrument?.high52 || 0);
  const position52w = currentInstrument ? Number((((currentPrice - monthlyLow) / Math.max(monthlyHigh - monthlyLow, 1)) * 100).toFixed(1)) : 0;
  const nearLow = currentInstrument ? currentPrice <= monthlyLow * 1.06 : false;
  const changeBadge = currentInstrument ? pctBadge(currentInstrument.changePct) : { label: '0.00%', className: 'badge badge-neutral', icon: null };
  const alertCount = boot?.alerts?.length || 0;
  const watchlistCount = boot?.watchlist?.length || 0;

  async function handleLogin(e) {
    e.preventDefault();
    setLoginError('');
    try {
      const login = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password
        })
      });
      saveSession(login.token);
      setAuthReady(true);
      const data = await apiFetch('/api/bootstrap');
      setBoot(data);
      setBotStatus(await apiFetch('/api/bot/status'));
      setActiveSym(data.defaultSymbol || 'GOLDBEES');
    } catch (err) {
      setLoginError(err.message);
    }
  }

  async function toggleAlert(id, enabled) {
    await apiFetch(`/api/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !enabled })
    });
    const data = await apiFetch('/api/bootstrap');
    setBoot((prev) => ({ ...(prev || {}), alerts: data.alerts }));
  }

  async function addAlert() {
    const target = Number(prompt('Enter target value', '120'));
    if (!target) return;
    await apiFetch('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({
        symbol: activeSym,
        condition: 'below',
        target,
        note: 'Quick alert',
        enabled: true
      })
    });
    const data = await apiFetch('/api/bootstrap');
    setBoot((prev) => ({ ...(prev || {}), alerts: data.alerts }));
  }

  async function addToWatchlist(symbol) {
    await apiFetch('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ symbol })
    });
    const data = await apiFetch('/api/bootstrap');
    setBoot((prev) => ({ ...(prev || {}), watchlist: data.watchlist }));
  }

  async function removeFromWatchlist(symbol) {
    await apiFetch(`/api/watchlist/${symbol}`, { method: 'DELETE' });
    const data = await apiFetch('/api/bootstrap');
    setBoot((prev) => ({ ...(prev || {}), watchlist: data.watchlist }));
  }

  async function logout() {
    clearSession();
    setAuthReady(false);
    setBoot(null);
    window.location.reload();
  }

  if (loading) {
    return <div className="loading-screen">Loading MarketPulse…</div>;
  }

  if (!authReady || !boot) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand-block">
            <div className="brand-block__dot" />
            <div>
              <h1>MarketPulse</h1>
              <p>Production market dashboard for Indian stocks, ETFs, mutual funds, alerts, and charts.</p>
            </div>
          </div>

          <div className="auth-grid">
            <div className="auth-panel">
              <h2>Sign in</h2>
              <p>Use the demo account to inspect the full application.</p>
              <form onSubmit={handleLogin} className="auth-form">
                <label>
                  Email
                  <input value={loginForm.email} onChange={(e) => setLoginForm((s) => ({ ...s, email: e.target.value }))} type="email" />
                </label>
                <label>
                  Password
                  <input value={loginForm.password} onChange={(e) => setLoginForm((s) => ({ ...s, password: e.target.value }))} type="password" />
                </label>
                {loginError ? <div className="auth-error">{loginError}</div> : null}
                <button className="primary-btn" type="submit">Open dashboard</button>
              </form>
            </div>

            <div className="auth-panel auth-panel--accent">
              <h2>What is included</h2>
              <ul className="feature-list">
                <li>Responsive dashboard with date-based chart axes</li>
                <li>Watchlist, alerts, screener, sectors, and bot log views</li>
                <li>SQLite-backed API with JWT login and seeded demo data</li>
                <li>Production-ready structure for real market-data integration</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tickerItems = boot.instruments.slice(0, 14);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__logo">
            <span />
          </div>
          <div>
            <div className="brand__title">MarketPulse</div>
            <div className="brand__sub">Indian market tracker • alert engine • historical charts</div>
          </div>
        </div>

        <nav className="nav-tabs desktop-only">
          {navItems.map((item) => (
            <button key={item.key} className={`nav-tab ${activePage === item.key ? 'nav-tab--active' : ''}`} onClick={() => setActivePage(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="topbar__actions">
          <div className={`market-pill ${botStatus?.marketOpen ? 'market-pill--open' : 'market-pill--closed'}`}>
            <Clock3 size={14} />
            {botStatus?.marketLabel || 'NSE Status'}
          </div>
          <div className="search-box desktop-only">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol…" />
          </div>
          <button className="icon-btn mobile-only" onClick={() => setMobileMenu((v) => !v)} aria-label="Open menu">
            <Menu size={18} />
          </button>
          <button className="icon-btn desktop-only" onClick={logout} aria-label="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {mobileMenu ? (
        <div className="mobile-nav">
          <div className="search-box">
            <Search size={15} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol…" />
          </div>
          <div className="mobile-nav__grid">
            {navItems.map((item) => (
              <button key={item.key} className={`nav-tab ${activePage === item.key ? 'nav-tab--active' : ''}`} onClick={() => { setActivePage(item.key); setMobileMenu(false); }}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <main className="layout">
        <aside className="sidebar desktop-only">
          <SectionTitle icon={<Globe2 size={18} />} title="Tracked Instruments" subtitle="Indices, ETFs, stocks, mutual funds" />
          <div className="sidebar__list">
            {['index', 'etf', 'stock', 'mf'].map((group) => {
              const groupItems = boot.instruments.filter((i) => i.type === group);
              return (
                <div key={group} className="sidebar-group">
                  <div className="sidebar-group__label">{group === 'mf' ? 'Mutual Funds' : group.toUpperCase()}</div>
                  {groupItems.slice(0, 5).map((item) => {
                    const active = activeSym === item.symbol;
                    return (
                      <button key={item.symbol} className={`instrument-row ${active ? 'instrument-row--active' : ''}`} onClick={() => { setActiveSym(item.symbol); setActivePage('dashboard'); }}>
                        <div className="instrument-row__left">
                          <div className="instrument-row__symbol">{item.symbol}</div>
                          <div className="instrument-row__name">{item.name}</div>
                          <Badge type={item.type}>{item.type.toUpperCase()}</Badge>
                        </div>
                        <div className="instrument-row__right">
                          <div className={`instrument-row__price ${Number(item.changePct) >= 0 ? 'text-up' : 'text-down'}`}>₹{formatINR(item.currentPrice)}</div>
                          <div className={Number(item.changePct) >= 0 ? 'text-up' : 'text-down'}>{Number(item.changePct) >= 0 ? '+' : ''}{Number(item.changePct).toFixed(2)}%</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="content">
          <div className="ticker-banner">
            <div className="ticker-banner__inner">
              {[...tickerItems, ...tickerItems].map((item, idx) => (
                <div key={`${item.symbol}-${idx}`} className="ticker-item">
                  <span className="ticker-item__symbol">{item.symbol}</span>
                  <span className={Number(item.changePct) >= 0 ? 'text-up' : 'text-down'}>
                    ₹{formatINR(item.currentPrice)} {Number(item.changePct) >= 0 ? '▲' : '▼'} {Math.abs(Number(item.changePct)).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {activePage === 'dashboard' ? (
            <>
              <div className="stats-grid">
                <StatCard label="Current Price" value={`₹${formatINR(currentPrice)}`} helper="Live market value" tone="green" />
                <StatCard label="iNAV Value" value={`₹${formatINR(currentInstrument?.inav || currentPrice)}`} helper="Indicative NAV" tone="blue" />
                <StatCard label="Monthly Low" value={`₹${formatINR(monthlyLow)}`} helper="30-day support level" tone="amber" />
                <StatCard label="Day Range" value={`₹${formatINR(currentPrice * 0.993)} — ₹${formatINR(currentPrice * 1.003)}`} helper="Intraday high / low" tone="neutral" />
              </div>

              {nearLow ? (
                <div className="signal-card">
                  <div className="signal-card__icon">🚨</div>
                  <div>
                    <div className="signal-card__title">Buy signal detected</div>
                    <div className="signal-card__body">{activeSym} is within 6% of its 52-week low. Potential accumulation zone.</div>
                  </div>
                </div>
              ) : null}

              <div className="dashboard-grid">
                <Card title={`${activeSym} price history`} icon={<LineChartIcon size={18} />} className="chart-card">
                  <div className="chart-toolbar">
                    <div>
                      <div className="chart-title">{currentInstrument?.name}</div>
                      <div className="chart-sub">Date-based historical chart with real calendar labels</div>
                    </div>
                    <div className="timeframe-tabs">
                      {Object.keys(timeframeConfig).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setTimeframe(tf)}
                          className={`timeframe-btn ${timeframe === tf ? 'timeframe-btn--active' : ''}`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="chart-box">
                    <Line
                      data={chart}
                      options={buildChartOptions(timeframeConfig[timeframe].unit)}
                      plugins={[makeRefLinePlugin(chartLow, chartAvg)]}
                    />
                  </div>

                  <div className="chart-metrics">
                    <DataChip label="52W Position" value={`${position52w}%`} tone="green" />
                    <DataChip label="Monthly Low" value={`₹${formatINR(chartLow ?? monthlyLow)}`} tone="amber" />
                    <DataChip label="Monthly Avg" value={`₹${formatINR(chartAvg ?? currentPrice)}`} tone="blue" />
                  </div>
                </Card>

                <div className="side-stack">
                  <Card title="Price alert" icon={<Bell size={18} />}>
                    <div className="form-stack">
                      <div className="field">
                        <label>Symbol</label>
                        <input value={activeSym} readOnly />
                      </div>
                      <div className="field">
                        <label>Condition</label>
                        <select value="below" disabled>
                          <option>Price drops below</option>
                        </select>
                      </div>
                      <div className="field">
                        <label>Target Value</label>
                        <input value="120.00" readOnly />
                      </div>
                      <button className="primary-btn" onClick={addAlert}>Set alert</button>
                    </div>
                  </Card>

                  <Card title={`Active alerts (${alertCount})`} icon={<Filter size={18} />}>
                    <div className="list-panel">
                      {(boot.alerts || []).map((alert) => (
                        <div key={alert.id} className="list-panel__row">
                          <div>
                            <div className="list-panel__title">{alert.symbol}</div>
                            <div className="list-panel__sub">{alert.condition} {alert.target != null ? `₹${formatINR(alert.target)}` : ''} • {alert.note || 'No note'}</div>
                          </div>
                          <Toggle on={Boolean(alert.enabled)} onToggle={() => toggleAlert(alert.id, Boolean(alert.enabled))} />
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>

              <div className="bottom-grid">
                <Card title="Live bot log" icon={<CalendarClock size={18} />}>
                  <div className="log-list">
                    {(boot.logs || []).slice(0, 8).map((log) => (
                      <div key={log.id} className="log-list__row">
                        <span className="log-list__time">{new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                        <span className={`log-tag log-tag--${log.level}`}>[{log.level.toUpperCase()}]</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card title="Bot status" icon={<Gauge size={18} />}>
                  <div className="metrics-grid">
                    <MiniMetric label="Uptime" value={formatUptime(botStatus?.uptimeSeconds || 0)} />
                    <MiniMetric label="Emails Sent" value={String(botStatus?.emailsSent || 0)} />
                    <MiniMetric label="NSE Errors" value={String(botStatus?.nseErrors || 0)} />
                    <MiniMetric label="Market" value={botStatus?.marketLabel || 'Unknown'} />
                  </div>
                </Card>
              </div>
            </>
          ) : null}

          {activePage === 'watchlist' ? (
            <Card title={`Watchlist (${watchlistCount})`} icon={<LayoutGrid size={18} />}>
              <div className="filter-tabs">
                {['all', 'etf', 'stock', 'mf', 'index'].map((type) => (
                  <button key={type} className={`filter-btn ${filter === type ? 'filter-btn--active' : ''}`} onClick={() => setFilter(type)}>
                    {type === 'all' ? 'All' : type === 'mf' ? 'Mutual Funds' : type.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="table-wrap">
                <div className="table-grid table-grid--header">
                  <span>Instrument</span><span>Price</span><span>Change</span><span>52W High</span><span>52W Low</span><span>Action</span>
                </div>
                {filteredInstruments.map((item) => (
                  <div key={item.symbol} className="table-grid">
                    <div>
                      <div className="instrument-row__symbol">{item.symbol}</div>
                      <div className="instrument-row__name">{item.name}</div>
                      <Badge type={item.type}>{item.type.toUpperCase()}</Badge>
                    </div>
                    <div>₹{formatINR(item.currentPrice)}</div>
                    <div className={Number(item.changePct) >= 0 ? 'text-up' : 'text-down'}>{Number(item.changePct) >= 0 ? '+' : ''}{Number(item.changePct).toFixed(2)}%</div>
                    <div>₹{formatINR(item.high52)}</div>
                    <div>₹{formatINR(item.low52)}</div>
                    <button className="small-btn" onClick={() => removeFromWatchlist(item.symbol)}>Remove</button>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          {activePage === 'bot' ? (
            <div className="dual-grid">
              <Card title="Bot configuration" icon={<Settings2 size={18} />}>
                <div className="cfg-list">
                  {[
                    ['Live monitor', '9:15 AM – 3:30 PM, Mon–Fri'],
                    ['Hourly price emails', 'Every hour during market hours'],
                    ['Monthly low alert', 'Instant when new low is detected'],
                    ['Market close summary', '3:30 PM CSV attached'],
                    ['NSE API retry', '3 retries on failure'],
                    ['Smart sleep', 'Exact 9:15 wake, zero CPU waste'],
                    ['systemd auto-start', 'Starts on laptop boot']
                  ].map(([label, sub]) => (
                    <div key={label} className="cfg-row">
                      <div>
                        <div className="cfg-row__title">{label}</div>
                        <div className="cfg-row__sub">{sub}</div>
                      </div>
                      <Toggle on />
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Bot metrics" icon={<ShieldCheck size={18} />}>
                <div className="metrics-grid metrics-grid--compact">
                  <MiniMetric label="Uptime" value={formatUptime(botStatus?.uptimeSeconds || 0)} />
                  <MiniMetric label="Emails Sent" value={String(botStatus?.emailsSent || 0)} />
                  <MiniMetric label="NSE Errors" value={String(botStatus?.nseErrors || 0)} />
                  <MiniMetric label="Market State" value={botStatus?.marketLabel || 'Unknown'} />
                </div>
                <div className="log-panel">
                  {(boot.logs || []).slice(0, 12).map((log) => (
                    <div key={log.id} className="log-list__row">
                      <span className="log-list__time">{new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                      <span className={`log-tag log-tag--${log.level}`}>[{log.level.toUpperCase()}]</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}

          {activePage === 'sectors' ? (
            <div className="dual-grid">
              <Card title="Sector heatmap" icon={<TrendingUp size={18} />}>
                <div className="sector-grid">
                  {(boot.sectors || []).map((sector) => (
                    <div key={sector.name} className="sector-tile" style={{
                      background: sector.changePct >= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.12)',
                      borderColor: sector.changePct >= 0 ? 'rgba(34,197,94,0.24)' : 'rgba(239,68,68,0.24)'
                    }}>
                      <div className="sector-tile__title">{sector.name}</div>
                      <div className={`sector-tile__value ${sector.changePct >= 0 ? 'text-up' : 'text-down'}`}>{sector.changePct >= 0 ? '+' : ''}{Number(sector.changePct).toFixed(2)}%</div>
                      <div className="sector-tile__sub">{sector.marketCap}</div>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Market breadth" icon={<TrendingDown size={18} />}>
                <div className="breadth-grid">
                  <StatCard label="Advances" value="1,284" helper="62% of market" tone="green" />
                  <StatCard label="Declines" value="721" helper="35% of market" tone="red" />
                  <StatCard label="Unchanged" value="63" helper="3% flat" tone="neutral" />
                  <StatCard label="52W New Highs" value="47" helper="New peaks today" tone="blue" />
                </div>
              </Card>
            </div>
          ) : null}

          {activePage === 'screener' ? (
            <Card title="Market screener" icon={<Filter size={18} />}>
              <div className="screener-grid">
                <label className="field">
                  <span>Asset Type</span>
                  <select onChange={(e) => setFilter(e.target.value)} value={filter}>
                    <option value="all">All</option>
                    <option value="stock">Stocks</option>
                    <option value="etf">ETFs</option>
                    <option value="mf">Mutual Funds</option>
                    <option value="index">Indices</option>
                  </select>
                </label>
                <label className="field">
                  <span>Min Price (₹)</span>
                  <input placeholder="0" />
                </label>
                <label className="field">
                  <span>Change Filter</span>
                  <select>
                    <option>All</option>
                    <option>Gainers only</option>
                    <option>Losers only</option>
                  </select>
                </label>
                <label className="field">
                  <span>Sort By</span>
                  <select>
                    <option>Biggest Gainers</option>
                    <option>Biggest Losers</option>
                    <option>Highest Price</option>
                    <option>Lowest Price</option>
                  </select>
                </label>
              </div>
              <div className="table-wrap">
                <div className="table-grid table-grid--header">
                  <span>Instrument</span><span>Price</span><span>Change</span><span>52W High</span><span>52W Low</span><span>Trend</span>
                </div>
                {(boot.instruments || []).slice(0, 12).map((item) => (
                  <div key={item.symbol} className="table-grid">
                    <div>
                      <div className="instrument-row__symbol">{item.symbol}</div>
                      <div className="instrument-row__name">{item.name}</div>
                    </div>
                    <div>₹{formatINR(item.currentPrice)}</div>
                    <div className={Number(item.changePct) >= 0 ? 'text-up' : 'text-down'}>{Number(item.changePct) >= 0 ? '+' : ''}{Number(item.changePct).toFixed(2)}%</div>
                    <div>₹{formatINR(item.high52)}</div>
                    <div>₹{formatINR(item.low52)}</div>
                    <div className="sparkline">{Number(item.changePct) >= 0 ? '↗' : '↘'}</div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </section>
      </main>

      <footer className="mobile-bottom-nav mobile-only">
        {navItems.map((item) => (
          <button key={item.key} className={`mobile-bottom-nav__item ${activePage === item.key ? 'mobile-bottom-nav__item--active' : ''}`} onClick={() => setActivePage(item.key)}>
            {item.label}
          </button>
        ))}
      </footer>
    </div>
  );
}

function formatUptime(seconds) {
  const s = Number(seconds || 0);
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

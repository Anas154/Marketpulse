import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Filler } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Activity, Bell, History, LayoutDashboard, LogOut, Settings, Shield, Users } from 'lucide-react';
import { apiFetch, clearSession, getSessionToken, saveSession } from './api';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Filler);

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y'];

function currency(n) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(Number(n || 0));
}

export default function App() {
  const [tokenReady, setTokenReady] = useState(Boolean(getSessionToken()));
  const [mode, setMode] = useState('signin');
  const [authForm, setAuthForm] = useState({ identifier: 'demo@marketpulse.local', password: 'Password123!', email: '', username: '', displayName: '' });
  const [error, setError] = useState('');
  const [boot, setBoot] = useState(null);
  const [activePage, setActivePage] = useState('dashboard');
  const [symbol, setSymbol] = useState('GOLDBEES');
  const [timeframe, setTimeframe] = useState('3M');
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [screener, setScreener] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [alertForm, setAlertForm] = useState({ condition: 'below', target: '120', note: '' });
  const [newUserForm, setNewUserForm] = useState({ email: '', username: '', displayName: '', password: '', role: 'user' });

  const user = boot?.user;
  const isAdmin = user?.role === 'admin';

  const nav = useMemo(() => {
    const base = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'alerts', label: 'Alerts', icon: Bell },
      { key: 'history', label: 'History', icon: History },
      { key: 'screener', label: 'Screener', icon: Activity }
    ];
    if (isAdmin) {
      base.push({ key: 'admin', label: 'Admin Panel', icon: Shield });
      base.push({ key: 'logs', label: 'System Logs', icon: Settings });
    }
    return base;
  }, [isAdmin]);

  async function loadBootstrap() {
    const data = await apiFetch('/api/bootstrap');
    setBoot(data);
    setSymbol(data.defaultSymbol || data.instruments?.[0]?.symbol || 'GOLDBEES');
  }

  useEffect(() => {
    if (!tokenReady) return;
    loadBootstrap().catch((e) => {
      clearSession();
      setTokenReady(false);
      setError(e.message);
    });
  }, [tokenReady]);

  useEffect(() => {
    if (!tokenReady || !symbol) return;
    apiFetch(`/api/instruments/${symbol}/history?tf=${timeframe}`).then((res) => setHistory(res.rows || [])).catch(() => setHistory([]));
  }, [tokenReady, symbol, timeframe]);

  useEffect(() => {
    if (!tokenReady) return;
    apiFetch('/api/screener').then(setScreener).catch(() => setScreener([]));
  }, [tokenReady]);

  useEffect(() => {
    if (!tokenReady || !isAdmin) return;
    apiFetch('/api/logs').then(setLogs).catch(() => setLogs([]));
    apiFetch('/api/admin/users').then(setAdminUsers).catch(() => setAdminUsers([]));
  }, [tokenReady, isAdmin]);

  async function submitAuth(e) {
    e.preventDefault();
    setError('');
    try {
      const endpoint = mode === 'signin' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'signin'
        ? { identifier: authForm.identifier, password: authForm.password }
        : { email: authForm.email, username: authForm.username, displayName: authForm.displayName, password: authForm.password };
      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      saveSession(res.token);
      setTokenReady(true);
    } catch (err) {
      setError(err.message);
    }
  }

  async function createAlert(e) {
    e.preventDefault();
    await apiFetch('/api/alerts', {
      method: 'POST',
      body: JSON.stringify({ symbol, condition: alertForm.condition, target: Number(alertForm.target), note: alertForm.note, enabled: true })
    });
    await loadBootstrap();
    setActivePage('history');
  }

  async function toggleAlert(alert) {
    await apiFetch(`/api/alerts/${alert.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !alert.enabled }) });
    await loadBootstrap();
  }

  async function createUser(e) {
    e.preventDefault();
    await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(newUserForm) });
    setNewUserForm({ email: '', username: '', displayName: '', password: '', role: 'user' });
    setAdminUsers(await apiFetch('/api/admin/users'));
  }

  function doLogout() {
    clearSession();
    setTokenReady(false);
    setBoot(null);
  }

  if (!tokenReady) {
    return (
      <div className="auth-wrap">
        <form className="auth-card" onSubmit={submitAuth}>
          <h1>MarketPulse Pro</h1>
          <p>Production-ready market operations console.</p>
          <div className="switcher">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign In</button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Sign Up</button>
          </div>
          {mode === 'signin' ? (
            <>
              <input placeholder="Email or username" value={authForm.identifier} onChange={(e) => setAuthForm((s) => ({ ...s, identifier: e.target.value }))} />
              <input placeholder="Password" type="password" value={authForm.password} onChange={(e) => setAuthForm((s) => ({ ...s, password: e.target.value }))} />
              <small>Admin: <b>Admin</b> / <b>Admin@1234</b></small>
            </>
          ) : (
            <>
              <input placeholder="Display name" value={authForm.displayName} onChange={(e) => setAuthForm((s) => ({ ...s, displayName: e.target.value }))} required />
              <input placeholder="Email" type="email" value={authForm.email} onChange={(e) => setAuthForm((s) => ({ ...s, email: e.target.value }))} required />
              <input placeholder="Username" value={authForm.username} onChange={(e) => setAuthForm((s) => ({ ...s, username: e.target.value }))} required />
              <input placeholder="Password" type="password" value={authForm.password} onChange={(e) => setAuthForm((s) => ({ ...s, password: e.target.value }))} required />
            </>
          )}
          {error ? <div className="error">{error}</div> : null}
          <button className="primary" type="submit">{mode === 'signin' ? 'Open Dashboard' : 'Create Account'}</button>
        </form>
      </div>
    );
  }

  if (!boot) return <div className="loading">Loading...</div>;

  const instrument = boot.instruments.find((i) => i.symbol === symbol) || boot.instruments[0];
  const chartData = {
    labels: history.map((r) => r.x),
    datasets: [{ data: history.map((r) => ({ x: r.x, y: r.c })), borderColor: '#2dd4bf', backgroundColor: 'rgba(45,212,191,0.16)', fill: true, tension: 0.3, pointRadius: 0 }]
  };

  return (
    <div className="shell">
      <header className="header">
        <div>
          <h2>MarketPulse</h2>
          <span>{user.displayName} • {user.role}</span>
        </div>
        <button onClick={doLogout} className="ghost"><LogOut size={16} /> Logout</button>
      </header>

      <div className="body">
        <aside className="sidebar">
          {nav.map((item) => {
            const Icon = item.icon;
            return <button key={item.key} className={activePage === item.key ? 'active' : ''} onClick={() => setActivePage(item.key)}><Icon size={16} /> {item.label}</button>;
          })}
        </aside>

        <main className="content">
          {activePage === 'dashboard' && (
            <>
              <section className="panel kpis">
                <div><label>Current</label><h3>${currency(instrument?.currentPrice)}</h3></div>
                <div><label>Change</label><h3 className={instrument?.changePct >= 0 ? 'up' : 'down'}>{instrument?.changePct?.toFixed(2)}%</h3></div>
                <div><label>52W High</label><h3>${currency(instrument?.high52)}</h3></div>
                <div><label>52W Low</label><h3>${currency(instrument?.low52)}</h3></div>
              </section>

              <section className="panel">
                <div className="row">
                  <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                    {boot.instruments.map((i) => <option key={i.symbol} value={i.symbol}>{i.symbol} — {i.name}</option>)}
                  </select>
                  <div className="timeframes">
                    {TIMEFRAMES.map((tf) => <button key={tf} className={timeframe === tf ? 'active' : ''} onClick={() => setTimeframe(tf)}>{tf}</button>)}
                  </div>
                </div>
                <div className="chart"><Line data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} /></div>
              </section>
            </>
          )}

          {activePage === 'alerts' && (
            <section className="panel">
              <h3>Set up alert</h3>
              <form className="grid" onSubmit={createAlert}>
                <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>{boot.instruments.map((i) => <option key={i.symbol}>{i.symbol}</option>)}</select>
                <select value={alertForm.condition} onChange={(e) => setAlertForm((s) => ({ ...s, condition: e.target.value }))}>
                  <option value="below">Price below</option>
                  <option value="above">Price above</option>
                  <option value="monthly_low">Near monthly low</option>
                </select>
                <input value={alertForm.target} onChange={(e) => setAlertForm((s) => ({ ...s, target: e.target.value }))} placeholder="Target" />
                <input value={alertForm.note} onChange={(e) => setAlertForm((s) => ({ ...s, note: e.target.value }))} placeholder="Note" />
                <button className="primary" type="submit">Create alert</button>
              </form>
            </section>
          )}

          {activePage === 'history' && (
            <section className="panel">
              <h3>Alert history bar</h3>
              <div className="list">
                {boot.alerts.map((a) => (
                  <div key={a.id} className="item">
                    <div>
                      <b>{a.symbol}</b> — {a.condition} {a.target ? `$${currency(a.target)}` : ''}
                      <small>{a.note || 'No note'} • {new Date(a.created_at).toLocaleString()}</small>
                    </div>
                    <button className="ghost" onClick={() => toggleAlert(a)}>{a.enabled ? 'Disable' : 'Enable'}</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activePage === 'screener' && (
            <section className="panel">
              <h3>Market screener (live simulated updates)</h3>
              <div className="list">
                {screener.map((i) => (
                  <div key={i.symbol} className="item"><span>{i.symbol} • {i.name}</span><span className={i.changePct >= 0 ? 'up' : 'down'}>{i.changePct.toFixed(2)}% • ${currency(i.currentPrice)}</span></div>
                ))}
              </div>
            </section>
          )}

          {isAdmin && activePage === 'admin' && (
            <section className="panel">
              <h3>Admin user management</h3>
              <form className="grid" onSubmit={createUser}>
                <input placeholder="Display name" value={newUserForm.displayName} onChange={(e) => setNewUserForm((s) => ({ ...s, displayName: e.target.value }))} required />
                <input placeholder="Email" type="email" value={newUserForm.email} onChange={(e) => setNewUserForm((s) => ({ ...s, email: e.target.value }))} required />
                <input placeholder="Username" value={newUserForm.username} onChange={(e) => setNewUserForm((s) => ({ ...s, username: e.target.value }))} required />
                <input placeholder="Password" type="password" value={newUserForm.password} onChange={(e) => setNewUserForm((s) => ({ ...s, password: e.target.value }))} required />
                <select value={newUserForm.role} onChange={(e) => setNewUserForm((s) => ({ ...s, role: e.target.value }))}><option value="user">Normal User</option><option value="admin">Admin</option></select>
                <button className="primary" type="submit"><Users size={16} /> Create user</button>
              </form>
              <div className="list">
                {adminUsers.map((u) => <div key={u.id} className="item"><span>{u.display_name} ({u.username})</span><span>{u.email} • {u.role}</span></div>)}
              </div>
            </section>
          )}

          {isAdmin && activePage === 'logs' && (
            <section className="panel">
              <h3>System logs (admin only)</h3>
              <div className="list">
                {logs.map((l) => <div key={l.id} className="item"><span>[{l.level.toUpperCase()}] {l.message}</span><small>{new Date(l.created_at).toLocaleString()}</small></div>)}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

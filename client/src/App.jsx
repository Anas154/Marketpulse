import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Filler } from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  Activity,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CandlestickChart,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  LogOut,
  Mail,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users
} from 'lucide-react';
import { apiFetch, clearSession, getSessionToken, saveSession } from './api';

const hoverLinePlugin = {
  id: 'hoverLine',
  afterDatasetsDraw(chart, _args, options) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length) return;

    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = options.color || 'rgba(23, 32, 51, 0.28)';
    ctx.stroke();
    ctx.restore();
  }
};

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Tooltip, Filler, hoverLinePlugin);

const TIMEFRAMES = ['1D', '1W', '1M', '3M', '1Y'];
const AUTH_INITIAL_STATE = { identifier: '', password: '', email: '', username: '', displayName: '' };
const NEW_USER_INITIAL_STATE = { email: '', username: '', displayName: '', password: '', role: 'user' };
const SETTINGS_INITIAL_STATE = { displayName: '', username: '', timezone: 'Asia/Kolkata', emailAlertsEnabled: true };
const ONBOARDING_INITIAL_STATE = {
  consentAccepted: false,
  displayName: '',
  pan: '',
  importMode: 'fetch',
  importSource: 'cams_cas',
  importProvider: '',
  importAccountHint: '',
  importAssetTypes: ['mf'],
  importNotes: '',
  emailAlertsEnabled: true
};
const ALERT_INITIAL_STATE = {
  symbol: '',
  condition: 'below',
  target: '',
  note: ''
};
const SCREENER_FILTERS_INITIAL = {
  type: 'all',
  minPrice: '0',
  change: 'all',
  sort: 'change_desc'
};
const TEST_MAIL_INITIAL_STATE = {
  to: '',
  subject: 'MarketPulse test mail',
  body: 'This is a test email sent from the MarketPulse admin panel.'
};

const PORTFOLIO_IMPORT_SOURCE_OPTIONS = [
  { value: 'cams_cas', label: 'CAMS CAS', helper: 'Best for mutual fund folios linked to your PAN and email.' },
  { value: 'nsdl_cas', label: 'NSDL CAS', helper: 'Useful when NSDL CAS covers your demat-linked holdings and statements.' },
  { value: 'broker_contract', label: 'Broker contract notes', helper: 'For equities and ETFs imported from broker trade files or back-office exports.' },
  { value: 'email_forwarding', label: 'Email forwarding', helper: 'Closest to the MProfit-style auto-import model for future updates.' },
  { value: 'manual_review', label: 'Manual review request', helper: 'Capture your provider details now and complete the mapping after statement review.' }
];

const PORTFOLIO_ASSET_OPTIONS = [
  { value: 'stock', label: 'Stocks' },
  { value: 'mf', label: 'Mutual funds' },
  { value: 'etf', label: 'ETFs' }
];

const GMAIL_SETUP_STEPS = [
  'Turn on 2-Step Verification in your Google Account security settings.',
  'Open Google Account > Security > App passwords.',
  'Create an app password for Mail on a computer or custom device.',
  'Use that 16-character app password only in server SMTP settings, never as your normal Gmail password.'
];

const ALERT_CONDITION_OPTIONS = [
  { value: 'below', label: 'Price below target', needsTarget: true, helper: 'Send a mail when live price trades below your target.' },
  { value: 'above', label: 'Price above target', needsTarget: true, helper: 'Send a mail when live price trades above your target.' },
  { value: 'nav_below', label: 'NAV below target', needsTarget: true, helper: 'Best for ETFs and mutual funds when you care about NAV, not traded price.' },
  { value: 'nav_above', label: 'NAV above target', needsTarget: true, helper: 'Send a mail when NAV moves above your target value.' },
  { value: 'monthly_low', label: 'Monthly low watch', needsTarget: false, helper: 'Triggers when the current price touches the last 30-day low.' },
  { value: 'monthly_high', label: 'Monthly high watch', needsTarget: false, helper: 'Triggers when price approaches the upper range of the month.' },
  { value: 'hourly_nav', label: 'Hourly NAV mail', needsTarget: false, helper: 'Sends an hourly NAV update during market hours to your account email.' }
];

const ONBOARDING_STEPS = [
  { key: 'consent', title: 'Consent', subtitle: 'Explain usage and gather approval before portfolio setup.' },
  { key: 'profile', title: 'Profile setup', subtitle: 'Confirm your name and PAN before continuing.' },
  { key: 'import', title: 'Portfolio import', subtitle: 'Choose to fetch your holdings now or skip for later.' }
];

const HERO_POINTS = [
  'Clean onboarding for first-time users',
  'Portfolio import or skip flow after sign in',
  'Role-aware dashboard, alerts, search, and admin tools'
];

function formatMoney(value) {
  return `INR ${new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(Number(value || 0))}`;
}

function formatPercent(value) {
  const number = Number(value || 0);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${number.toFixed(2)}%`;
}

function formatChartTickLabel(value, timeframe) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  if (timeframe === '1D') {
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  }

  if (timeframe === '1W' || timeframe === '1M') {
    return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(date);
  }

  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: '2-digit' }).format(date);
}

function formatReadableDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatDisplayName(value) {
  const cleaned = String(value || '').trim().replace(/\s*-\s*user$/i, '');
  return cleaned || 'Investor';
}

function describeCondition(condition) {
  return ALERT_CONDITION_OPTIONS.find((option) => option.value === condition)?.label || condition;
}

function SectionCard({ title, kicker, actions, children }) {
  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          {kicker ? <p className="section-card__kicker">{kicker}</p> : null}
          <h3>{title}</h3>
        </div>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function PortfolioImportFields({ form, onFieldChange, onToggleAssetType }) {
  return (
    <div className="stack">
      <div className="callout">
        <BriefcaseBusiness size={18} />
        <div>
          <strong>Import needs a real source, not just a PAN</strong>
          <span>
            Products like MProfit typically import mutual funds from CAS statements and stocks from broker trade files,
            then map the data before the portfolio is updated.
          </span>
        </div>
      </div>

      <div className="field-grid field-grid--triple">
        <div className="field-group">
          <label className="field-label" htmlFor="portfolioImportSource">Import source</label>
          <select
            id="portfolioImportSource"
            className="field-input"
            value={form.importSource}
            onChange={(event) => onFieldChange('importSource', event.target.value)}
          >
            {PORTFOLIO_IMPORT_SOURCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="field-help">
            {PORTFOLIO_IMPORT_SOURCE_OPTIONS.find((option) => option.value === form.importSource)?.helper}
          </p>
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="portfolioImportProvider">Broker, RTA, or platform</label>
          <input
            id="portfolioImportProvider"
            className="field-input"
            value={form.importProvider}
            onChange={(event) => onFieldChange('importProvider', event.target.value)}
            placeholder="For example Groww, Zerodha, CAMS, NSDL"
          />
        </div>

        <div className="field-group">
          <label className="field-label" htmlFor="portfolioImportHint">Account hint</label>
          <input
            id="portfolioImportHint"
            className="field-input"
            value={form.importAccountHint}
            onChange={(event) => onFieldChange('importAccountHint', event.target.value)}
            placeholder="Registered email, last 4 digits, or folio hint"
          />
          <p className="field-help">Use a safe identifier hint, not your full password or sensitive account secret.</p>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label">Asset types to fetch</label>
        <div className="choice-grid choice-grid--triple">
          {PORTFOLIO_ASSET_OPTIONS.map((option) => (
            <label key={option.value} className={`choice-card ${form.importAssetTypes.includes(option.value) ? 'choice-card--selected' : ''}`}>
              <input
                type="checkbox"
                checked={form.importAssetTypes.includes(option.value)}
                onChange={() => onToggleAssetType(option.value)}
              />
              <div>
                <strong>{option.label}</strong>
                <span>Include these holdings when the import request is reviewed.</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="portfolioImportNotes">What should be fetched?</label>
        <textarea
          id="portfolioImportNotes"
          className="field-input field-textarea"
          value={form.importNotes}
          onChange={(event) => onFieldChange('importNotes', event.target.value)}
          placeholder="Describe your setup, for example 2 MF folios in CAMS plus Zerodha equity holdings."
        />
      </div>
    </div>
  );
}

function PortfolioUploadFields({
  uploadKey,
  selectedFile,
  selectedSource,
  onFileChange,
  onSubmit,
  busy,
  showForwardingHint
}) {
  return (
    <div className="stack">
      <div className="callout">
        <Plus size={18} />
        <div>
          <strong>Upload a portfolio file</strong>
          <span>
            CSV and JSON files can be imported directly right now. Other statement files are still saved so the source details stay attached for manual review.
          </span>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="portfolioUpload">Statement or holdings file</label>
        <input
          key={uploadKey}
          id="portfolioUpload"
          className="field-input"
          type="file"
          accept=".csv,.json,.txt,.pdf"
          onChange={(event) => onFileChange(event.target.files?.[0] || null)}
        />
        <p className="field-help">
          Best current format: CSV with `symbol`, `units`, and `avgCost`. Selected source: {selectedSource?.label || 'Portfolio import'}.
        </p>
      </div>

      {selectedFile ? (
        <div className="inline-fact">
          <CheckCircle2 size={16} />
          <span>{selectedFile.name} selected for upload.</span>
        </div>
      ) : null}

      {showForwardingHint ? (
        <div className="callout">
          <Mail size={18} />
          <div>
            <strong>Email forwarding still needs inbound mail infrastructure</strong>
            <span>
              The provider/source details are captured now, but automatic inbound email ingestion still needs a mailbox or webhook service. Upload the latest statement file as the fallback path.
            </span>
          </div>
        </div>
      ) : null}

      <div className="form-actions">
        <button className="button button--primary" type="button" onClick={onSubmit} disabled={busy}>
          {busy ? 'Uploading...' : 'Upload and import'}
        </button>
      </div>
    </div>
  );
}

function App() {
  const [tokenReady, setTokenReady] = useState(Boolean(getSessionToken()));
  const [mode, setMode] = useState('signin');
  const [authForm, setAuthForm] = useState(AUTH_INITIAL_STATE);
  const [authError, setAuthError] = useState('');
  const [boot, setBoot] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [symbol, setSymbol] = useState('');
  const [timeframe, setTimeframe] = useState('3M');
  const [history, setHistory] = useState([]);
  const [screener, setScreener] = useState([]);
  const [screenerFilters, setScreenerFilters] = useState(SCREENER_FILTERS_INITIAL);
  const [logs, setLogs] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [newUserForm, setNewUserForm] = useState(NEW_USER_INITIAL_STATE);
  const [alertForm, setAlertForm] = useState(ALERT_INITIAL_STATE);
  const [settingsForm, setSettingsForm] = useState(SETTINGS_INITIAL_STATE);
  const [onboardingForm, setOnboardingForm] = useState(ONBOARDING_INITIAL_STATE);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [watchlistSymbol, setWatchlistSymbol] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [detailSymbol, setDetailSymbol] = useState('');
  const [testMailForm, setTestMailForm] = useState(TEST_MAIL_INITIAL_STATE);
  const [portfolioUploadFile, setPortfolioUploadFile] = useState(null);
  const [portfolioUploadKey, setPortfolioUploadKey] = useState(0);
  const [notice, setNotice] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const user = boot?.user;
  const isAdmin = user?.role === 'admin';
  const isOnboarded = Boolean(user?.onboardingCompleted);
  const userDisplayName = formatDisplayName(user?.displayName);
  const portfolio = boot?.portfolio || [];
  const portfolioSummary = boot?.portfolioSummary || {};
  const mailStatus = boot?.mailStatus || { configured: false, provider: 'unknown', missingFields: [] };
  const hasPortfolioImportDetails = Boolean(onboardingForm.importProvider.trim() && onboardingForm.importAssetTypes.length);
  const selectedImportSource = PORTFOLIO_IMPORT_SOURCE_OPTIONS.find((option) => option.value === onboardingForm.importSource);

  const navigation = useMemo(() => {
    const items = [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'portfolio', label: 'Portfolio', icon: BriefcaseBusiness },
      { key: 'watchlist', label: 'Watchlist', icon: BriefcaseBusiness },
      { key: 'alerts', label: 'Alerts', icon: Bell },
      { key: 'screener', label: 'Screener', icon: Activity },
      { key: 'sectors', label: 'Sectors', icon: CandlestickChart },
      { key: 'settings', label: 'Settings', icon: Settings }
    ];

    if (isAdmin) {
      items.push({ key: 'admin', label: 'Admin', icon: Users });
      items.push({ key: 'logs', label: 'Activity', icon: History });
    }

    return items;
  }, [isAdmin]);

  const indices = useMemo(
    () => (boot?.instruments || []).filter((item) => item.type === 'index').slice(0, 4),
    [boot]
  );

  const instrument = useMemo(
    () => (boot?.instruments || []).find((item) => item.symbol === symbol) || boot?.instruments?.[0] || null,
    [boot, symbol]
  );
  const detailInstrument = useMemo(
    () => (boot?.instruments || []).find((item) => item.symbol === detailSymbol) || instrument || null,
    [boot, detailSymbol, instrument]
  );

  const availableWatchlistSymbols = useMemo(() => {
    const current = new Set((boot?.watchlist || []).map((item) => item.symbol));
    return (boot?.instruments || []).filter((item) => !current.has(item.symbol));
  }, [boot]);

  const targetRequired = ALERT_CONDITION_OPTIONS.find((option) => option.value === alertForm.condition)?.needsTarget;
  const chartLatestPoint = history[history.length - 1] || null;
  const chartFirstPoint = history[0] || null;
  const chartLineColor = !chartFirstPoint || !chartLatestPoint || chartLatestPoint.c >= chartFirstPoint.c ? '#00a76f' : '#d8505d';
  const chartMetricLabel = instrument?.inav ? 'NAV' : 'Price';
  const chartHeaderValue = formatMoney(instrument?.inav ?? chartLatestPoint?.c ?? instrument?.currentPrice);
  const chartHeaderDate = chartLatestPoint ? formatReadableDate(chartLatestPoint.x) : '';
  const chartData = useMemo(() => ({
    datasets: [
      {
        data: history.map((row) => ({ x: row.x, y: row.c })),
        borderColor: chartLineColor,
        backgroundColor: chartLineColor === '#00a76f' ? 'rgba(0, 167, 111, 0.08)' : 'rgba(216, 80, 93, 0.08)',
        fill: true,
        tension: 0.32,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: chartLineColor,
        pointHoverBorderWidth: 2,
        borderWidth: 2.4,
        segment: {
          borderColor: chartLineColor,
          borderWidth: 2.4
        }
      }
    ]
  }), [chartLineColor, history]);
  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 280
    },
    interaction: {
      mode: 'index',
      intersect: false
    },
    plugins: {
      legend: { display: false },
      hoverLine: {
        color: 'rgba(23, 32, 51, 0.24)'
      },
      tooltip: {
        displayColors: false,
        backgroundColor: '#ffffff',
        titleColor: '#172033',
        bodyColor: '#66708a',
        borderColor: 'rgba(219, 227, 242, 0.95)',
        borderWidth: 1,
        padding: 12,
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12, weight: '600' },
        cornerRadius: 10,
        boxPadding: 6,
        callbacks: {
          title(context) {
            return formatReadableDate(context[0]?.parsed?.x);
          },
          label(context) {
            return `${chartMetricLabel}: ${formatMoney(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        display: true,
        time: {
          unit: timeframe === '1D' ? 'hour' : timeframe === '1Y' ? 'month' : 'day'
        },
        ticks: {
          color: '#6b7280',
          autoSkip: true,
          maxTicksLimit: timeframe === '1D' ? 6 : 5,
          maxRotation: 0,
          font: { size: 11 },
          callback(value) {
            return formatChartTickLabel(value, timeframe);
          }
        },
        grid: {
          display: false,
          drawBorder: false
        }
      },
      y: {
        display: true,
        position: 'right',
        ticks: {
          color: '#6b7280',
          maxTicksLimit: 5,
          font: { size: 11 },
          padding: 8,
          callback(value) {
            return Number(value).toFixed(0);
          }
        },
        grid: {
          color: 'rgba(219, 227, 242, 0.58)',
          drawBorder: false
        }
      }
    }
  }), [chartMetricLabel, timeframe]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!tokenReady) return;
    loadBootstrap().catch((error) => {
      clearSession();
      setBoot(null);
      setTokenReady(false);
      setAuthError(error.message);
    });
  }, [tokenReady]);

  useEffect(() => {
    if (!boot?.user) return;

    setSymbol((current) => current || boot.defaultSymbol || boot.instruments?.[0]?.symbol || '');
    setDetailSymbol((current) => current || boot.defaultSymbol || boot.instruments?.[0]?.symbol || '');
    setAlertForm((current) => ({
      ...current,
      symbol: current.symbol || boot.defaultSymbol || boot.instruments?.[0]?.symbol || ''
    }));
    setWatchlistSymbol((current) => current || availableWatchlistSymbols[0]?.symbol || '');
    setSelectedSector((current) => current || boot.sectors?.[0]?.name || '');
    setSettingsForm({
      displayName: boot.user.displayName || '',
      username: boot.user.username || '',
      timezone: boot.user.timezone || 'Asia/Kolkata',
      emailAlertsEnabled: boot.user.emailAlertsEnabled ?? true
    });
    setOnboardingForm({
      consentAccepted: Boolean(boot.user.onboarding?.consentAccepted),
      displayName: boot.user.displayName || '',
      pan: boot.user.pan || '',
      importMode: boot.user.onboarding?.importMode || 'fetch',
      importSource: boot.user.onboarding?.importRequest?.source || 'cams_cas',
      importProvider: boot.user.onboarding?.importRequest?.providerName || '',
      importAccountHint: boot.user.onboarding?.importRequest?.accountHint || '',
      importAssetTypes: boot.user.onboarding?.importRequest?.assetTypes?.length ? boot.user.onboarding.importRequest.assetTypes : ['mf'],
      importNotes: boot.user.onboarding?.importRequest?.requestNotes || '',
      emailAlertsEnabled: boot.user.emailAlertsEnabled ?? true
    });
    setOnboardingStep(0);
    setTestMailForm((current) => ({
      ...current,
      to: current.to || boot.user.email || ''
    }));
  }, [boot, availableWatchlistSymbols]);

  useEffect(() => {
    if (!tokenReady || !isOnboarded || !symbol) return;

    apiFetch(`/api/instruments/${symbol}/history?tf=${timeframe}`)
      .then((response) => setHistory(response.rows || []))
      .catch(() => setHistory([]));
  }, [tokenReady, isOnboarded, symbol, timeframe]);

  useEffect(() => {
    if (!tokenReady || !isOnboarded) return;

    const params = new URLSearchParams({
      type: screenerFilters.type,
      minPrice: screenerFilters.minPrice || '0',
      change: screenerFilters.change,
      sort: screenerFilters.sort
    });

    apiFetch(`/api/screener?${params.toString()}`)
      .then(setScreener)
      .catch(() => setScreener([]));
  }, [tokenReady, isOnboarded, screenerFilters]);

  useEffect(() => {
    if (!tokenReady || !isOnboarded || !isAdmin) return;
    apiFetch('/api/logs').then(setLogs).catch(() => setLogs([]));
    apiFetch('/api/admin/users').then(setAdminUsers).catch(() => setAdminUsers([]));
  }, [tokenReady, isOnboarded, isAdmin]);

  useEffect(() => {
    if (!tokenReady) return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = window.setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`)
        .then((rows) => {
          if (!cancelled) setSearchResults(rows || []);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tokenReady, searchQuery]);

  async function loadBootstrap() {
    const data = await apiFetch('/api/bootstrap');
    setBoot(data);
  }

  function updateOnboardingField(field, value) {
    setOnboardingForm((current) => ({ ...current, [field]: value }));
  }

  function toggleImportAssetType(assetType) {
    setOnboardingForm((current) => {
      const exists = current.importAssetTypes.includes(assetType);
      return {
        ...current,
        importAssetTypes: exists
          ? current.importAssetTypes.filter((value) => value !== assetType)
          : [...current.importAssetTypes, assetType]
      };
    });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setBusyKey('auth');
    setAuthError('');

    try {
      const endpoint = mode === 'signin' ? '/api/auth/login' : '/api/auth/register';
      const payload = mode === 'signin'
        ? { identifier: authForm.identifier.trim(), password: authForm.password }
        : {
            email: authForm.email.trim(),
            username: authForm.username.trim(),
            displayName: authForm.displayName.trim(),
            password: authForm.password
          };

      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      saveSession(response.token);
      setOnboardingStep(0);
      setPage('dashboard');
      setAuthForm(AUTH_INITIAL_STATE);
      setTokenReady(true);
      setNotice({
        type: 'success',
        message: mode === 'signin' ? 'Signed in successfully.' : 'Account created. Let us finish your onboarding.'
      });
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setBusyKey('');
    }
  }

  async function handleOnboardingSubmit(event) {
    event.preventDefault();
    setBusyKey('onboarding');

    try {
      const response = await apiFetch('/api/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(onboardingForm)
      });

      setBoot((current) => ({ ...current, user: response.user }));
      await loadBootstrap();
      setPage('dashboard');
      setNotice({
        type: 'success',
        message: response.importStatus === 'pending_manual_connection'
          ? 'Onboarding complete. Your import request was saved, but live portfolio mapping still needs statement or broker integration.'
          : response.importedCount
            ? `Onboarding complete. Imported ${response.importedCount} portfolio holdings.`
            : 'Onboarding complete. Your dashboard is ready.'
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleAddWatchlist() {
    if (!watchlistSymbol) return;
    setBusyKey('watchlist-add');

    try {
      await apiFetch('/api/watchlist', {
        method: 'POST',
        body: JSON.stringify({ symbol: watchlistSymbol })
      });
      await loadBootstrap();
      setWatchlistSymbol('');
      setNotice({ type: 'success', message: 'Symbol added to watchlist.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleRemoveWatchlist(symbolToRemove) {
    setBusyKey(`watchlist-remove-${symbolToRemove}`);

    try {
      await apiFetch(`/api/watchlist/${symbolToRemove}`, { method: 'DELETE' });
      await loadBootstrap();
      setNotice({ type: 'success', message: `${symbolToRemove} removed from watchlist.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleCreateAlert(event) {
    event.preventDefault();
    setBusyKey('alert-create');

    try {
      const payload = {
        symbol: alertForm.symbol,
        condition: alertForm.condition,
        target: targetRequired ? Number(alertForm.target) : null,
        note: alertForm.note.trim(),
        enabled: true
      };

      await apiFetch('/api/alerts', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      await loadBootstrap();
      setAlertForm({
        ...ALERT_INITIAL_STATE,
        symbol: alertForm.symbol
      });
      setNotice({
        type: 'success',
        message: mailStatus.configured
          ? 'Alert created and linked to your account email.'
          : 'Alert created. Delivery will start after SMTP is configured on the server.'
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleToggleAlert(alert) {
    setBusyKey(`alert-toggle-${alert.id}`);

    try {
      await apiFetch(`/api/alerts/${alert.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !alert.enabled })
      });
      await loadBootstrap();
      setNotice({ type: 'success', message: `Alert ${alert.enabled ? 'paused' : 'enabled'}.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleDeleteAlert(alertId) {
    setBusyKey(`alert-delete-${alertId}`);

    try {
      await apiFetch(`/api/alerts/${alertId}`, { method: 'DELETE' });
      await loadBootstrap();
      setNotice({ type: 'success', message: 'Alert deleted.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setBusyKey('profile-save');

    try {
      const response = await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify(settingsForm)
      });
      setBoot((current) => ({ ...current, user: response.user }));
      setNotice({ type: 'success', message: 'Profile saved successfully.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleImportPortfolio() {
    if (!hasPortfolioImportDetails) {
      setPage('settings');
      setNotice({ type: 'error', message: 'Add your portfolio source details first so fetch can map the right holdings.' });
      return;
    }

    setBusyKey('portfolio-import');

    try {
      const response = await apiFetch('/api/portfolio/import', {
        method: 'POST',
        body: JSON.stringify({
          replaceExisting: true,
          importSource: onboardingForm.importSource,
          importProvider: onboardingForm.importProvider.trim(),
          importAccountHint: onboardingForm.importAccountHint.trim(),
          importAssetTypes: onboardingForm.importAssetTypes,
          importNotes: onboardingForm.importNotes.trim()
        })
      });
      await loadBootstrap();
      setNotice({
        type: response.importStatus === 'pending_manual_connection' ? 'error' : 'success',
        message: response.importStatus === 'pending_manual_connection'
          ? `Import request saved for ${user.email}. Live holdings still need statement or broker mapping for ${onboardingForm.importProvider.trim()}.`
          : `Portfolio fetched for ${user.email}.`
      });
      setPage('portfolio');
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleUploadPortfolioFile(event) {
    event.preventDefault();

    if (!hasPortfolioImportDetails) {
      setPage('settings');
      setNotice({ type: 'error', message: 'Add your source details first so the upload can be mapped to the right account.' });
      return;
    }

    if (!portfolioUploadFile) {
      setNotice({ type: 'error', message: 'Choose a CSV, JSON, or broker statement file before uploading.' });
      return;
    }

    setBusyKey('portfolio-upload');

    try {
      const formData = new FormData();
      formData.append('file', portfolioUploadFile);
      formData.append('replaceExisting', 'true');
      formData.append('importSource', onboardingForm.importSource);
      formData.append('importProvider', onboardingForm.importProvider.trim());
      formData.append('importAccountHint', onboardingForm.importAccountHint.trim());
      formData.append('importAssetTypes', JSON.stringify(onboardingForm.importAssetTypes));
      formData.append('importNotes', onboardingForm.importNotes.trim());

      const response = await apiFetch('/api/portfolio/import-file', {
        method: 'POST',
        body: formData
      });

      await loadBootstrap();
      setPortfolioUploadFile(null);
      setPortfolioUploadKey((current) => current + 1);
      setPage('portfolio');
      setNotice({
        type: response.importedCount ? 'success' : 'error',
        message: response.importedCount
          ? `Imported ${response.importedCount} holdings from ${portfolioUploadFile.name}.`
          : response.warnings?.[0] || 'File uploaded, but the app could not auto-import holdings from it yet.'
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setBusyKey('admin-create-user');

    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(newUserForm)
      });
      setNewUserForm(NEW_USER_INITIAL_STATE);
      setAdminUsers(await apiFetch('/api/admin/users'));
      setNotice({
        type: 'success',
        message: 'User created. They can sign in with the email or username you set, then complete onboarding.'
      });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  async function handleSendTestMail(event) {
    event.preventDefault();
    setBusyKey('admin-test-mail');

    try {
      await apiFetch('/api/admin/test-mail', {
        method: 'POST',
        body: JSON.stringify(testMailForm)
      });
      setNotice({ type: 'success', message: `Test mail sent to ${testMailForm.to}.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message });
    } finally {
      setBusyKey('');
    }
  }

  function handleLogout() {
    clearSession();
    setTokenReady(false);
    setBoot(null);
    setAuthError('');
    setAuthForm(AUTH_INITIAL_STATE);
    setOnboardingForm(ONBOARDING_INITIAL_STATE);
    setOnboardingStep(0);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setPortfolioUploadFile(null);
    setPortfolioUploadKey((current) => current + 1);
    setPage('dashboard');
    setNotice({ type: 'success', message: 'Signed out successfully.' });
  }

  function openInstrument(nextSymbol, nextPage = 'detail') {
    setSymbol(nextSymbol);
    setDetailSymbol(nextSymbol);
    setSearchQuery('');
    setSearchResults([]);
    setSearchLoading(false);
    setPage(nextPage);
  }

  function goToNextOnboardingStep() {
    if (onboardingStep === 0 && !onboardingForm.consentAccepted) {
      setNotice({ type: 'error', message: 'Please accept consent to continue.' });
      return;
    }

    if (onboardingStep === 1) {
      if (!onboardingForm.displayName.trim()) {
        setNotice({ type: 'error', message: 'Please enter your display name.' });
        return;
      }

      if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(onboardingForm.pan.trim().toUpperCase())) {
        setNotice({ type: 'error', message: 'PAN must be in valid format, for example ABCDE1234F.' });
        return;
      }
    }

    if (onboardingStep === 2 && !['fetch', 'skip'].includes(onboardingForm.importMode)) {
      setNotice({ type: 'error', message: 'Choose whether to fetch your portfolio or skip for now.' });
      return;
    }

    if (onboardingStep === 2 && onboardingForm.importMode === 'fetch') {
      if (!onboardingForm.importProvider.trim()) {
        setNotice({ type: 'error', message: 'Add the broker, RTA, or platform name before requesting a fetch.' });
        return;
      }

      if (!onboardingForm.importAssetTypes.length) {
        setNotice({ type: 'error', message: 'Choose at least one asset type for the portfolio import request.' });
        return;
      }
    }

    setOnboardingStep((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1));
  }

  function goToPreviousOnboardingStep() {
    setOnboardingStep((current) => Math.max(current - 1, 0));
  }

  function renderAuthExperience() {
    return (
      <div className="auth-layout">
        <aside className="auth-showcase">
          <div className="brand-pill">MarketPulse workflow</div>
          <h1>Portfolio tracking with cleaner onboarding, smarter alerts, and a calmer first session.</h1>
          <p>
            The workflow now follows a proper finance product journey: sign in, complete consent and PAN setup,
            choose how to start, then land on a dashboard built for watchlists, alerts, sectors, and admin review.
          </p>

          <div className="hero-points">
            {HERO_POINTS.map((point) => (
              <div key={point} className="hero-point">
                <CheckCircle2 size={18} />
                <span>{point}</span>
              </div>
            ))}
          </div>

          <div className="market-preview">
            <div className="market-preview__heading">
              <Sparkles size={16} />
              <span>What changes after login</span>
            </div>
            <div className="market-preview__grid">
              <div>
                <strong>Step-based onboarding</strong>
                <span>No dashboard confusion before account setup is complete.</span>
              </div>
              <div>
                <strong>Email-linked alerts</strong>
                <span>Threshold, monthly-low, and hourly NAV delivery tied to the user email.</span>
              </div>
              <div>
                <strong>Role-aware views</strong>
                <span>Admin, logs, and user creation stay separated from the main user experience.</span>
              </div>
            </div>
          </div>
        </aside>

        <form className="auth-panel" onSubmit={handleAuthSubmit}>
          <div className="auth-panel__header">
            <div className="brand-mark">MP</div>
            <div>
              <p className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'Create account'}</p>
              <h2>{mode === 'signin' ? 'Sign in to continue' : 'Start your MarketPulse account'}</h2>
            </div>
          </div>

          <div className="mode-switch">
            <button
              type="button"
              className={mode === 'signin' ? 'active' : ''}
              onClick={() => setMode('signin')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => setMode('signup')}
            >
              Sign up
            </button>
          </div>

          {mode === 'signin' ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="identifier">Email or username</label>
                <input
                  id="identifier"
                  className="field-input"
                  value={authForm.identifier}
                  autoComplete="username"
                  onChange={(event) => setAuthForm((current) => ({ ...current, identifier: event.target.value }))}
                  placeholder="Enter your login email or username"
                  aria-label="Email or username"
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  className="field-input"
                  type="password"
                  value={authForm.password}
                  autoComplete="current-password"
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Enter your password"
                  aria-label="Password"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div className="field-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="displayName">Display name</label>
                  <input
                    id="displayName"
                    className="field-input"
                    value={authForm.displayName}
                    onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))}
                    placeholder="How should we address you?"
                    aria-label="Display name"
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="signupUsername">Username</label>
                  <input
                    id="signupUsername"
                    className="field-input"
                    value={authForm.username}
                    autoComplete="username"
                    onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
                    placeholder="Choose a unique username"
                    aria-label="Username"
                    required
                  />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="signupEmail">Email</label>
                <input
                  id="signupEmail"
                  className="field-input"
                  type="email"
                  value={authForm.email}
                  autoComplete="email"
                  onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="Enter your account email"
                  aria-label="Email"
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="signupPassword">Password</label>
                <input
                  id="signupPassword"
                  className="field-input"
                  type="password"
                  value={authForm.password}
                  autoComplete="new-password"
                  onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Create a secure password"
                  aria-label="Password"
                  required
                />
              </div>
            </>
          )}

          {authError ? <div className="notice notice--error">{authError}</div> : null}

          <button className="button button--primary button--full" type="submit" disabled={busyKey === 'auth'}>
            {busyKey === 'auth' ? 'Working...' : mode === 'signin' ? 'Submit' : 'Create account'}
          </button>
        </form>
      </div>
    );
  }

  function renderOnboarding() {
    const currentStep = ONBOARDING_STEPS[onboardingStep];

    return (
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <div>
            <p className="eyebrow">First-time setup</p>
            <h1>Finish your account workflow</h1>
            <p className="subtle">
              The dashboard stays hidden until your name, PAN, and portfolio choice are complete, so the first session feels focused instead of confusing.
            </p>
          </div>
          <button className="button button--ghost" type="button" onClick={handleLogout}>
            <LogOut size={16} />
            Sign out
          </button>
        </header>

        <div className="onboarding-progress">
          {ONBOARDING_STEPS.map((step, index) => (
            <div key={step.key} className={`step-chip ${index === onboardingStep ? 'step-chip--active' : index < onboardingStep ? 'step-chip--done' : ''}`}>
              <span>{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.subtitle}</small>
              </div>
            </div>
          ))}
        </div>

        <form className="onboarding-card" onSubmit={handleOnboardingSubmit}>
          <div className="section-card__header">
            <div>
              <p className="section-card__kicker">Step {onboardingStep + 1} of {ONBOARDING_STEPS.length}</p>
              <h3>{currentStep.title}</h3>
            </div>
          </div>

          {onboardingStep === 0 ? (
            <div className="stack">
              <div className="callout">
                <ShieldCheck size={18} />
                <div>
                  <strong>Consent is mandatory</strong>
                  <span>We only continue once you understand how PAN and portfolio data are used inside the application.</span>
                </div>
              </div>
              <label className="choice-card">
                <input
                  type="checkbox"
                  checked={onboardingForm.consentAccepted}
                  onChange={(event) => setOnboardingForm((current) => ({ ...current, consentAccepted: event.target.checked }))}
                />
                <div>
                  <strong>I agree to share PAN and portfolio details for onboarding and alerts.</strong>
                  <span>This keeps the workflow aligned with the document requirement before any portfolio fetch begins.</span>
                </div>
              </label>
            </div>
          ) : null}

          {onboardingStep === 1 ? (
            <div className="stack">
              <div className="field-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor="onboardingDisplayName">Display name</label>
                  <input
                    id="onboardingDisplayName"
                    className="field-input"
                    value={onboardingForm.displayName}
                    onChange={(event) => setOnboardingForm((current) => ({ ...current, displayName: event.target.value }))}
                    placeholder="How should we show your name?"
                    aria-label="Display name"
                    required
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="panNumber">PAN number</label>
                  <input
                    id="panNumber"
                    className="field-input field-input--wide"
                    value={onboardingForm.pan}
                    onChange={(event) => setOnboardingForm((current) => ({ ...current, pan: event.target.value.toUpperCase() }))}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    aria-label="PAN number"
                    required
                  />
                  <p className="field-help">Format required: 5 letters, 4 digits, 1 letter.</p>
                </div>
              </div>
              <div className="inline-fact">
                <Mail size={16} />
                <span>Your alerts and imported holdings will stay connected to {user.email}.</span>
              </div>
            </div>
          ) : null}

          {onboardingStep === 2 ? (
            <div className="stack">
              <div className="choice-grid choice-grid--dual">
                {[
                  {
                    value: 'fetch',
                    title: 'Fetch portfolio now',
                    body: 'Tell us your source details first, then we try to map holdings using the same statement-driven pattern used by portfolio trackers.'
                  },
                  {
                    value: 'skip',
                    title: 'Skip for now',
                    body: 'Finish onboarding first and import later from the Portfolio page whenever you want.'
                  }
                ].map((option) => (
                  <label key={option.value} className={`choice-card choice-card--radio ${onboardingForm.importMode === option.value ? 'choice-card--selected' : ''}`}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={onboardingForm.importMode === option.value}
                      onChange={() => setOnboardingForm((current) => ({ ...current, importMode: option.value }))}
                    />
                    <div>
                      <strong>{option.title}</strong>
                      <span>{option.body}</span>
                    </div>
                  </label>
                ))}
              </div>

              {onboardingForm.importMode === 'fetch' ? (
                <PortfolioImportFields
                  form={onboardingForm}
                  onFieldChange={updateOnboardingField}
                  onToggleAssetType={toggleImportAssetType}
                />
              ) : null}

              <label className="choice-card">
                <input
                  type="checkbox"
                  checked={onboardingForm.emailAlertsEnabled}
                  onChange={(event) => setOnboardingForm((current) => ({ ...current, emailAlertsEnabled: event.target.checked }))}
                />
                <div>
                  <strong>Enable email alerts right away</strong>
                  <span>Threshold alerts, monthly-low watches, and hourly NAV updates will use {user.email}.</span>
                </div>
              </label>

              <div className="callout">
                <Mail size={18} />
                <div>
                  <strong>{mailStatus.configured ? 'Mail delivery is ready' : 'Mail delivery still needs SMTP setup'}</strong>
                  <span>
                    {mailStatus.configured
                      ? 'Alert emails can be sent from the app as soon as your rules are active.'
                      : 'This app uses a server-managed SMTP sender. Do not paste your personal Gmail password into alert setup. An admin must finish SMTP configuration first.'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="wizard-actions">
            <button className="button button--ghost" type="button" onClick={goToPreviousOnboardingStep} disabled={onboardingStep === 0}>
              <ChevronLeft size={16} />
              Back
            </button>
            {onboardingStep < ONBOARDING_STEPS.length - 1 ? (
              <button className="button button--primary" type="button" onClick={goToNextOnboardingStep}>
                Continue
                <ChevronRight size={16} />
              </button>
            ) : (
              <button className="button button--primary" type="submit" disabled={busyKey === 'onboarding'}>
                {busyKey === 'onboarding' ? 'Finishing...' : onboardingForm.importMode === 'fetch' ? 'Import and continue' : 'Complete onboarding'}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  function renderDashboardPage() {
    return (
      <div className="page-stack">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Dashboard</p>
            <h1>Welcome, {userDisplayName}</h1>
            <p className="subtle">
              Monitor your portfolio, watchlist, active alerts, sector view, and live trend movement in one place.
            </p>
          </div>
          <div className="hero-stats">
            <div>
              <span>Portfolio value</span>
              <strong>{formatMoney(portfolioSummary.currentValue)}</strong>
            </div>
            <div>
              <span>Total P&amp;L</span>
              <strong className={portfolioSummary.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                {portfolioSummary.pnl >= 0 ? '+' : ''}{formatMoney(portfolioSummary.pnl)}
              </strong>
            </div>
            <div>
              <span>Active alerts</span>
              <strong>{boot.dashboard?.summary?.activeAlerts || 0}</strong>
            </div>
            <div>
              <span>Market status</span>
              <strong>{boot.marketStatus?.label || 'Market status unavailable'}</strong>
            </div>
          </div>
        </section>

        <div className="metric-grid">
          <button className="metric-card card-button" type="button" onClick={() => setPage('portfolio')}>
            <span>Portfolio holdings</span>
            <strong>{portfolioSummary.holdingsCount || 0}</strong>
            <small>Open your portfolio page to review imported funds and holdings.</small>
          </button>
          <div className="metric-card">
            <span>Mail delivery</span>
            <strong>{user.emailAlertsEnabled ? 'Enabled' : 'Paused'}</strong>
            <small>Alerts route to {user.email}.</small>
          </div>
          <button className="metric-card card-button" type="button" onClick={() => openInstrument(instrument?.symbol || boot.defaultSymbol)}>
            <span>Selected symbol</span>
            <strong>{instrument?.symbol || 'NA'}</strong>
            <small>{instrument?.name || 'Choose an instrument from the chart panel.'}</small>
          </button>
          <div className="metric-card">
            <span>Watchlist size</span>
            <strong>{boot.watchlist?.length || 0}</strong>
            <small>Use quick actions below to add or remove more symbols.</small>
          </div>
        </div>

        <div className="dashboard-grid">
          <SectionCard
            title={`${instrument?.symbol || 'Instrument'} live trend`}
            kicker="Interactive chart"
            actions={(
              <div className="inline-controls inline-controls--chart">
                <select className="field-input field-input--compact" value={symbol} onChange={(event) => setSymbol(event.target.value)} aria-label="Select instrument">
                  {(boot.instruments || []).map((item) => (
                    <option key={item.symbol} value={item.symbol}>{item.symbol} - {item.name}</option>
                  ))}
                </select>
                <div className="pill-row">
                  {TIMEFRAMES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`pill-button ${timeframe === value ? 'pill-button--active' : ''}`}
                      onClick={() => setTimeframe(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          >
            <div className="chart-header">
              <div>
                <div className="chart-title-label">{chartMetricLabel}</div>
                <div className="chart-title-value">{chartHeaderValue}</div>
              </div>
              <div className="chart-title-date">
                {chartHeaderDate}
              </div>
            </div>
            <div className="chart-shell">
              <Line data={chartData} options={chartOptions} />
            </div>
            <div className="chart-actions chart-actions--detail">
              <button className="button button--ghost" type="button" onClick={() => openInstrument(symbol)}>
                Open details
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Top movers" kicker="Across the tracked universe">
            <div className="list-grid">
              {(boot.dashboard?.topMovers || []).map((item) => (
                <button key={item.symbol} className="list-card card-button" type="button" onClick={() => openInstrument(item.symbol)}>
                  <div>
                    <strong>{item.symbol}</strong>
                    <span>{item.name}</span>
                  </div>
                  <div className={`trend ${item.changePct >= 0 ? 'trend--up' : 'trend--down'}`}>
                    <TrendingUp size={15} />
                    <span>{formatPercent(item.changePct)}</span>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="dashboard-grid">
          <SectionCard title="Recent alerts" kicker="Linked to your account email">
            {(boot.alerts || []).length ? (
              <div className="stack">
                {(boot.alerts || []).slice(0, 4).map((alert) => (
                  <div key={alert.id} className="alert-row">
                    <div className="alert-copy">
                      <strong>{alert.symbol}</strong>
                      <span>{describeCondition(alert.condition)}{alert.target != null ? ` - ${formatMoney(alert.target)}` : ''}</span>
                    </div>
                    <div className="alert-meta">
                      <span className={`status-badge ${alert.enabled ? 'status-badge--active' : 'status-badge--muted'}`}>
                        {alert.enabled ? 'Active' : 'Paused'}
                      </span>
                      <small>{alert.last_sent_at ? `Last mail ${new Date(alert.last_sent_at).toLocaleString()}` : 'Not mailed yet'}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Bell size={18} />
                <div>
                  <strong>No alerts yet</strong>
                  <span>Start with an hourly NAV update or a monthly-low watch so first-time users get useful mail quickly.</span>
                </div>
                <button className="button button--ghost" type="button" onClick={() => setPage('alerts')}>
                  Open alert center
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Sector pulse" kicker="Quick performance map">
            <div className="sector-list">
              {(boot.sectors || []).slice(0, 6).map((sector) => (
                <button
                  key={sector.name}
                  type="button"
                  className={`sector-chip ${selectedSector === sector.name ? 'sector-chip--active' : ''}`}
                  onClick={() => {
                    setSelectedSector(sector.name);
                    setPage('sectors');
                  }}
                >
                  <span>{sector.name}</span>
                  <strong>{formatPercent(sector.changePct)}</strong>
                </button>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderPortfolioPage() {
    return (
      <div className="page-stack">
        <SectionCard
          title="Portfolio"
          kicker="Imported and tracked holdings"
          actions={(
            <div className="inline-controls inline-controls--actions">
              <button className="button button--ghost" type="button" onClick={() => setPage('dashboard')}>
                Back to dashboard
              </button>
              <button className="button button--primary" type="button" onClick={handleImportPortfolio} disabled={busyKey === 'portfolio-import'}>
                {busyKey === 'portfolio-import' ? 'Fetching...' : 'Fetch portfolio'}
              </button>
            </div>
          )}
        >
          <div className="metric-grid">
            <div className="metric-card">
              <span>Current value</span>
              <strong>{formatMoney(portfolioSummary.currentValue)}</strong>
            </div>
            <div className="metric-card">
              <span>Invested value</span>
              <strong>{formatMoney(portfolioSummary.investedValue)}</strong>
            </div>
            <div className="metric-card">
              <span>Total P&amp;L</span>
              <strong className={portfolioSummary.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                {portfolioSummary.pnl >= 0 ? '+' : ''}{formatMoney(portfolioSummary.pnl)}
              </strong>
            </div>
            <div className="metric-card">
              <span>Holdings</span>
              <strong>{portfolioSummary.holdingsCount || 0}</strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="My portfolio holdings" kicker="Click any holding to open its full detail page">
          {portfolio.length ? (
            <div className="table-list">
              {portfolio.map((holding) => (
                <button key={holding.symbol} type="button" className="table-row card-button" onClick={() => openInstrument(holding.symbol)}>
                  <div>
                    <strong>{holding.name}</strong>
                    <span>{holding.symbol} - {holding.type}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(holding.currentValue)}</strong>
                    <span>{holding.units} units at {formatMoney(holding.avgCost)}</span>
                  </div>
                  <div className={holding.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                    {holding.pnl >= 0 ? '+' : ''}{formatMoney(holding.pnl)} ({formatPercent(holding.pnlPct)})
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <BriefcaseBusiness size={18} />
              <div>
                <strong>No portfolio imported yet</strong>
                <span>Use fetch portfolio to load your holdings now, or keep using the app and import later.</span>
              </div>
              <button className="button button--primary" type="button" onClick={handleImportPortfolio} disabled={busyKey === 'portfolio-import'}>
                {busyKey === 'portfolio-import' ? 'Fetching...' : 'Fetch portfolio'}
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Upload statement or holdings file" kicker="Direct import for CSV or JSON, manual review fallback for other statements">
          <PortfolioUploadFields
            uploadKey={portfolioUploadKey}
            selectedFile={portfolioUploadFile}
            selectedSource={selectedImportSource}
            onFileChange={setPortfolioUploadFile}
            onSubmit={handleUploadPortfolioFile}
            busy={busyKey === 'portfolio-upload'}
            showForwardingHint={onboardingForm.importSource === 'email_forwarding'}
          />
        </SectionCard>
      </div>
    );
  }

  function renderInstrumentDetailPage() {
    const holding = portfolio.find((item) => item.symbol === detailInstrument?.symbol);

    if (!detailInstrument) {
      return (
        <div className="page-stack">
          <SectionCard title="Instrument details" kicker="Open a stock, ETF, or fund from search or any list">
            <div className="empty-state">
              <CandlestickChart size={18} />
              <div>
                <strong>No instrument selected</strong>
                <span>Choose any symbol from the dashboard chart, watchlist, screener, portfolio, or top search box.</span>
              </div>
            </div>
          </SectionCard>
        </div>
      );
    }

    return (
      <div className="page-stack">
        <section className="hero-panel instrument-hero">
          <div>
            <p className="eyebrow">{detailInstrument.type.toUpperCase()}</p>
            <h1>{detailInstrument.name}</h1>
            <p className="subtle">{detailInstrument.symbol} - {detailInstrument.exchange}</p>
            <div className="detail-price-row">
              <strong>{formatMoney(detailInstrument.currentPrice)}</strong>
              <span className={detailInstrument.changePct >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                {formatPercent(detailInstrument.changePct)}
              </span>
            </div>
          </div>
          <div className="hero-stats">
            <div>
              <span>52 week high</span>
              <strong>{formatMoney(detailInstrument.high52)}</strong>
            </div>
            <div>
              <span>52 week low</span>
              <strong>{formatMoney(detailInstrument.low52)}</strong>
            </div>
            <div>
              <span>{detailInstrument.inav ? 'NAV' : 'Trend position'}</span>
              <strong>{detailInstrument.inav ? formatMoney(detailInstrument.inav) : `${Math.round(detailInstrument.position52w || 0)}%`}</strong>
            </div>
            <div>
              <span>In portfolio</span>
              <strong>{holding ? 'Yes' : 'No'}</strong>
            </div>
          </div>
        </section>

        <div className="dashboard-grid">
          <SectionCard
            title={`${detailInstrument.symbol} chart`}
            kicker="Hover to inspect clean date and price points"
            actions={(
              <div className="inline-controls">
                <button className="button button--ghost" type="button" onClick={() => setPage('dashboard')}>
                  Back
                </button>
                <div className="pill-row">
                  {TIMEFRAMES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={`pill-button ${timeframe === value ? 'pill-button--active' : ''}`}
                      onClick={() => setTimeframe(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
          >
            <div className="chart-header chart-header--inside">
              <div>
                <div className="chart-title-label">{detailInstrument.inav ? 'NAV' : 'Price'}</div>
                <div className="chart-title-value">{formatMoney(detailInstrument.inav ?? chartLatestPoint?.c ?? detailInstrument.currentPrice)}</div>
              </div>
              <div className="chart-title-date">{chartHeaderDate}</div>
            </div>
            <div className="chart-shell chart-shell--detail">
              <Line data={chartData} options={chartOptions} />
            </div>
          </SectionCard>

          <SectionCard title="Overview" kicker="Grow-inspired instrument summary">
            <div className="stack">
              <div className="list-card">
                <div>
                  <strong>Category</strong>
                  <span>{detailInstrument.type} / {detailInstrument.sector}</span>
                </div>
                <div>
                  <strong>Exchange</strong>
                  <span>{detailInstrument.exchange}</span>
                </div>
              </div>
              <div className="list-card">
                <div>
                  <strong>Current price</strong>
                  <span>{formatMoney(detailInstrument.currentPrice)}</span>
                </div>
                <div>
                  <strong>Day change</strong>
                  <span className={detailInstrument.changePct >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                    {formatPercent(detailInstrument.changePct)}
                  </span>
                </div>
              </div>
              {holding ? (
                <div className="list-card">
                  <div>
                    <strong>Your holding</strong>
                    <span>{holding.units} units</span>
                  </div>
                  <div>
                    <strong>Your P&amp;L</strong>
                    <span className={holding.pnl >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                      {holding.pnl >= 0 ? '+' : ''}{formatMoney(holding.pnl)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  function renderWatchlistPage() {
    return (
      <div className="page-stack">
        <SectionCard
          title="Watchlist"
          kicker="Track symbols that matter"
          actions={(
            <div className="inline-controls">
              <select className="field-input field-input--compact" value={watchlistSymbol} onChange={(event) => setWatchlistSymbol(event.target.value)} aria-label="Choose watchlist symbol">
                <option value="">Select a symbol</option>
                {availableWatchlistSymbols.map((item) => (
                  <option key={item.symbol} value={item.symbol}>{item.symbol} - {item.name}</option>
                ))}
              </select>
              <button className="button button--primary" type="button" onClick={handleAddWatchlist} disabled={!watchlistSymbol || busyKey === 'watchlist-add'}>
                <Plus size={16} />
                Add
              </button>
            </div>
          )}
        >
          {(boot.watchlist || []).length ? (
            <div className="table-list">
              {(boot.watchlist || []).map((item) => (
                <div key={item.symbol} className="table-row table-row--split">
                  <button type="button" className="table-row__main" onClick={() => openInstrument(item.symbol)}>
                    <div>
                      <strong>{item.symbol}</strong>
                      <span>{item.name}</span>
                    </div>
                    <div>
                      <strong>{formatMoney(item.current_price)}</strong>
                      <span className={item.change_pct >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                        {formatPercent(item.change_pct)}
                      </span>
                    </div>
                  </button>
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => handleRemoveWatchlist(item.symbol)}
                    disabled={busyKey === `watchlist-remove-${item.symbol}`}
                  >
                    <Trash2 size={16} />
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <BriefcaseBusiness size={18} />
              <div>
                <strong>Your watchlist is empty</strong>
                <span>Add a stock, ETF, or fund here and click any row later to open its detail view.</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderAlertsPage() {
    return (
      <div className="page-stack">
        <SectionCard title="Alert center" kicker="Threshold, monthly-low, and hourly NAV delivery">
          <div className="email-banner">
            <Mail size={18} />
            <div className="email-banner__content">
              <strong>Emails go to {user.email}</strong>
              <span>That is the login email saved on the account. You can pause delivery from Settings any time.</span>
            </div>
          </div>

          {!mailStatus.configured ? (
            <div className="callout">
              <Shield size={18} />
              <div>
                <strong>SMTP is not configured yet</strong>
                <span>
                  Alert rules can still be created, but delivery will stay paused until the server owner finishes SMTP setup.
                  For Gmail, use an App Password on the server side after enabling 2-Step Verification. Do not share your personal Gmail password in this user flow.
                </span>
              </div>
            </div>
          ) : null}

          <form className="stack" onSubmit={handleCreateAlert}>
            <div className="field-grid field-grid--triple">
              <div className="field-group">
                <label className="field-label" htmlFor="alertSymbol">Symbol</label>
                <select
                  id="alertSymbol"
                  className="field-input"
                  value={alertForm.symbol}
                  onChange={(event) => setAlertForm((current) => ({ ...current, symbol: event.target.value }))}
                >
                  {(boot.instruments || []).map((item) => (
                    <option key={item.symbol} value={item.symbol}>{item.symbol} - {item.name}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="alertCondition">Alert type</label>
                <select
                  id="alertCondition"
                  className="field-input"
                  value={alertForm.condition}
                  onChange={(event) => setAlertForm((current) => ({ ...current, condition: event.target.value }))}
                >
                  {ALERT_CONDITION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <p className="field-help">{ALERT_CONDITION_OPTIONS.find((option) => option.value === alertForm.condition)?.helper}</p>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="alertTarget">Target</label>
                <input
                  id="alertTarget"
                  className="field-input"
                  value={alertForm.target}
                  onChange={(event) => setAlertForm((current) => ({ ...current, target: event.target.value }))}
                  placeholder={targetRequired ? 'Enter target value' : 'Not needed for this alert'}
                  disabled={!targetRequired}
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="alertNote">Note</label>
              <textarea
                id="alertNote"
                className="field-input field-textarea"
                value={alertForm.note}
                onChange={(event) => setAlertForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Optional context, for example buy-on-dip or monthly NAV tracking."
              />
            </div>

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={busyKey === 'alert-create'}>
                {busyKey === 'alert-create' ? 'Saving...' : 'Create alert'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Existing alerts" kicker="Everything configured for this account">
          {(boot.alerts || []).length ? (
            <div className="stack">
              {(boot.alerts || []).map((alert) => (
                <div key={alert.id} className="alert-row">
                  <div className="alert-copy">
                    <strong>{alert.symbol} - {describeCondition(alert.condition)}</strong>
                    <span>
                      {alert.target != null ? `${formatMoney(alert.target)} - ` : ''}
                      {alert.note || 'No custom note'}
                    </span>
                    <small>
                      {alert.last_sent_at ? `Last sent ${new Date(alert.last_sent_at).toLocaleString()}` : 'No email sent yet'}
                    </small>
                  </div>
                  <div className="alert-actions">
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => handleToggleAlert(alert)}
                      disabled={busyKey === `alert-toggle-${alert.id}`}
                    >
                      {alert.enabled ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      className="button button--ghost"
                      type="button"
                      onClick={() => handleDeleteAlert(alert.id)}
                      disabled={busyKey === `alert-delete-${alert.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Mail size={18} />
              <div>
                <strong>No alert rules are active yet</strong>
                <span>Create a price, NAV, monthly-low, or hourly NAV alert here and every email will go to your saved login address.</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderScreenerPage() {
    return (
      <div className="page-stack">
        <SectionCard title="Screener" kicker="Filter the market universe quickly">
          <div className="field-grid field-grid--quad">
            <div className="field-group">
              <label className="field-label" htmlFor="screenType">Type</label>
              <select
                id="screenType"
                className="field-input"
                value={screenerFilters.type}
                onChange={(event) => setScreenerFilters((current) => ({ ...current, type: event.target.value }))}
              >
                <option value="all">All</option>
                <option value="index">Index</option>
                <option value="etf">ETF</option>
                <option value="stock">Stock</option>
                <option value="mf">Mutual fund</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="screenPrice">Minimum price</label>
              <input
                id="screenPrice"
                className="field-input"
                value={screenerFilters.minPrice}
                onChange={(event) => setScreenerFilters((current) => ({ ...current, minPrice: event.target.value }))}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="screenChange">Movement</label>
              <select
                id="screenChange"
                className="field-input"
                value={screenerFilters.change}
                onChange={(event) => setScreenerFilters((current) => ({ ...current, change: event.target.value }))}
              >
                <option value="all">All</option>
                <option value="gainers">Gainers</option>
                <option value="losers">Losers</option>
                <option value="flat">Flat</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="screenSort">Sort</label>
              <select
                id="screenSort"
                className="field-input"
                value={screenerFilters.sort}
                onChange={(event) => setScreenerFilters((current) => ({ ...current, sort: event.target.value }))}
              >
                <option value="change_desc">Change descending</option>
                <option value="change_asc">Change ascending</option>
                <option value="price_desc">Price descending</option>
                <option value="price_asc">Price ascending</option>
              </select>
            </div>
          </div>

          {screener.length ? (
            <div className="table-list">
              {screener.map((item) => (
                <button key={item.symbol} type="button" className="table-row card-button" onClick={() => openInstrument(item.symbol)}>
                  <div>
                    <strong>{item.symbol}</strong>
                    <span>{item.name}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.currentPrice)}</strong>
                    <span>{item.exchange} - {item.type}</span>
                  </div>
                  <div className={item.changePct >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                    {formatPercent(item.changePct)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Search size={18} />
              <div>
                <strong>No screener matches</strong>
                <span>Try a broader filter so you can drill into a stock or fund detail page from here.</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderSectorsPage() {
    const selectedInstruments = (boot?.instruments || []).filter((item) => item.sector === selectedSector);

    return (
      <div className="page-stack">
        <SectionCard title="Sectors" kicker="Heatmap-style view with drilldown">
          <div className="sector-list sector-list--wide">
            {(boot.sectors || []).map((sector) => (
              <button
                key={sector.name}
                type="button"
                className={`sector-chip ${selectedSector === sector.name ? 'sector-chip--active' : ''}`}
                onClick={() => setSelectedSector(sector.name)}
              >
                <span>{sector.name}</span>
                <strong>{formatPercent(sector.changePct)}</strong>
                <small>{sector.marketCap}</small>
              </button>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={`${selectedSector || 'Sector'} instruments`} kicker="Filtered from the tracked market list">
          {selectedInstruments.length ? (
            <div className="table-list">
              {selectedInstruments.map((item) => (
                <button key={item.symbol} type="button" className="table-row card-button" onClick={() => openInstrument(item.symbol)}>
                  <div>
                    <strong>{item.symbol}</strong>
                    <span>{item.name}</span>
                  </div>
                  <div>
                    <strong>{formatMoney(item.currentPrice)}</strong>
                    <span>{item.exchange}</span>
                  </div>
                  <div className={item.changePct >= 0 ? 'trend trend--up' : 'trend trend--down'}>
                    {formatPercent(item.changePct)}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CandlestickChart size={18} />
              <div>
                <strong>No tracked instruments in this sector</strong>
                <span>Pick another sector chip above to open its matching instruments.</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderSettingsPage() {
    return (
      <div className="page-stack">
        <SectionCard
          title="Profile and delivery settings"
          kicker="Keep login, onboarding, and mail behavior aligned"
          actions={(
            <button className="button button--ghost" type="button" onClick={() => setPage('portfolio')}>
              Open portfolio
            </button>
          )}
        >
          <form className="stack" onSubmit={handleSaveProfile}>
            <div className="field-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="settingsDisplay">Display name</label>
                <input
                  id="settingsDisplay"
                  className="field-input"
                  value={settingsForm.displayName}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, displayName: event.target.value }))}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="settingsUsername">Username</label>
                <input
                  id="settingsUsername"
                  className="field-input"
                  value={settingsForm.username}
                  onChange={(event) => setSettingsForm((current) => ({ ...current, username: event.target.value }))}
                />
              </div>
            </div>

            <div className="field-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="settingsEmail">Login email</label>
                <input id="settingsEmail" className="field-input" value={user.email} disabled />
                <p className="field-help">Alert emails use this account email.</p>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="settingsPan">PAN</label>
                <input id="settingsPan" className="field-input" value={user.pan || 'Not provided'} disabled />
              </div>
            </div>

            <label className="choice-card">
              <input
                type="checkbox"
                checked={settingsForm.emailAlertsEnabled}
                onChange={(event) => setSettingsForm((current) => ({ ...current, emailAlertsEnabled: event.target.checked }))}
              />
              <div>
                <strong>Enable email alerts</strong>
                <span>Threshold, monthly-low, and hourly NAV updates respect this toggle.</span>
              </div>
            </label>

            <div className="stack">
              <div>
                <p className="section-card__kicker">Portfolio import setup</p>
                <h3 className="section-card__subheading">Collect the same details you would provide to a broker or CAS-driven import flow</h3>
              </div>

              <PortfolioImportFields
                form={onboardingForm}
                onFieldChange={updateOnboardingField}
                onToggleAssetType={toggleImportAssetType}
              />

              <div className="callout">
                <Mail size={18} />
                <div>
                  <strong>{mailStatus.configured ? 'SMTP is configured for alerts' : 'SMTP still needs admin setup'}</strong>
                  <span>
                    {mailStatus.configured
                      ? 'Once imported holdings are tracked, your alert emails can use the shared application sender.'
                      : 'If you are self-hosting MarketPulse with Gmail, create an App Password from Google Account security settings and place it in the server SMTP variables.'}
                  </span>
                </div>
              </div>

              <div className="form-actions">
                <button className="button button--ghost" type="button" onClick={handleImportPortfolio} disabled={busyKey === 'portfolio-import'}>
                  {busyKey === 'portfolio-import' ? 'Fetching...' : 'Fetch portfolio now'}
                </button>
              </div>
            </div>

            <PortfolioUploadFields
              uploadKey={portfolioUploadKey}
              selectedFile={portfolioUploadFile}
              selectedSource={selectedImportSource}
              onFileChange={setPortfolioUploadFile}
              onSubmit={handleUploadPortfolioFile}
              busy={busyKey === 'portfolio-upload'}
              showForwardingHint={onboardingForm.importSource === 'email_forwarding'}
            />

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={busyKey === 'profile-save'}>
                {busyKey === 'profile-save' ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        </SectionCard>
      </div>
    );
  }

  function renderAdminPage() {
    return (
      <div className="page-stack">
        <SectionCard title="Create user" kicker="Admin-only account provisioning">
          <form className="stack" onSubmit={handleCreateUser}>
            <div className="field-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="adminDisplay">Display name</label>
                <input
                  id="adminDisplay"
                  className="field-input"
                  value={newUserForm.displayName}
                  onChange={(event) => setNewUserForm((current) => ({ ...current, displayName: event.target.value }))}
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="adminUsername">Username</label>
                <input
                  id="adminUsername"
                  className="field-input"
                  value={newUserForm.username}
                  onChange={(event) => setNewUserForm((current) => ({ ...current, username: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="field-grid">
              <div className="field-group">
                <label className="field-label" htmlFor="adminEmail">Email</label>
                <input
                  id="adminEmail"
                  className="field-input"
                  type="email"
                  value={newUserForm.email}
                  onChange={(event) => setNewUserForm((current) => ({ ...current, email: event.target.value }))}
                  required
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="adminPassword">Password</label>
                <input
                  id="adminPassword"
                  className="field-input"
                  type="password"
                  value={newUserForm.password}
                  onChange={(event) => setNewUserForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
              </div>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="adminRole">Role</label>
              <select
                id="adminRole"
                className="field-input"
                value={newUserForm.role}
                onChange={(event) => setNewUserForm((current) => ({ ...current, role: event.target.value }))}
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={busyKey === 'admin-create-user'}>
                {busyKey === 'admin-create-user' ? 'Creating...' : 'Create user'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Test mail" kicker="Admin-only mail verification through the application">
          <form className="stack" onSubmit={handleSendTestMail}>
            <div className="email-banner">
              <Mail size={18} />
              <div className="email-banner__content">
                <strong>Application mail flow</strong>
                <span>This test goes through the same SMTP configuration that alert mails use for users.</span>
              </div>
            </div>

            <div className="callout">
              <ShieldCheck size={18} />
              <div>
                <strong>{mailStatus.configured ? 'SMTP is configured on the server' : 'SMTP is missing required server values'}</strong>
                <span>
                  {mailStatus.configured
                    ? `Provider: ${mailStatus.provider}. Host: ${mailStatus.host || 'custom host'}.`
                    : `Missing: ${(mailStatus.missingFields || []).join(', ') || 'SMTP details'}.`}
                </span>
              </div>
            </div>

            {!mailStatus.configured ? (
              <div className="stack">
                <div>
                  <p className="section-card__kicker">Gmail app password setup</p>
                  <h3 className="section-card__subheading">Finish server mail configuration before sending test mail</h3>
                </div>
                <div className="list-grid">
                  {GMAIL_SETUP_STEPS.map((step, index) => (
                    <div key={step} className="list-card">
                      <div>
                        <strong>Step {index + 1}</strong>
                        <span>{step}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="field-group">
              <label className="field-label" htmlFor="testMailTo">Send to</label>
              <input
                id="testMailTo"
                className="field-input"
                type="email"
                value={testMailForm.to}
                onChange={(event) => setTestMailForm((current) => ({ ...current, to: event.target.value }))}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="testMailSubject">Subject</label>
              <input
                id="testMailSubject"
                className="field-input"
                value={testMailForm.subject}
                onChange={(event) => setTestMailForm((current) => ({ ...current, subject: event.target.value }))}
                required
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="testMailBody">Body</label>
              <textarea
                id="testMailBody"
                className="field-input field-textarea"
                value={testMailForm.body}
                onChange={(event) => setTestMailForm((current) => ({ ...current, body: event.target.value }))}
                required
              />
            </div>

            <div className="form-actions">
              <button className="button button--primary" type="submit" disabled={busyKey === 'admin-test-mail' || !mailStatus.configured}>
                {busyKey === 'admin-test-mail' ? 'Sending...' : 'Send test mail'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="User directory" kicker="Recent accounts">
          {adminUsers.length ? (
            <div className="table-list">
              {adminUsers.map((account) => (
                <div key={account.id} className="table-row">
                  <div>
                    <strong>{account.display_name}</strong>
                    <span>{account.username}</span>
                  </div>
                  <div>
                    <strong>{account.email}</strong>
                    <span>{account.role} - {account.onboarding_completed ? 'Onboarded' : 'Needs onboarding'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Users size={18} />
              <div>
                <strong>No users found</strong>
                <span>Create a user above and they will appear here immediately.</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderLogsPage() {
    return (
      <div className="page-stack">
        <SectionCard title="Activity logs" kicker="Recent server-side events">
          {logs.length ? (
            <div className="table-list">
              {logs.map((log) => (
                <div key={log.id} className="table-row">
                  <div>
                    <strong>{log.level.toUpperCase()}</strong>
                    <span>{log.message}</span>
                  </div>
                  <div>
                    <small>{new Date(log.created_at).toLocaleString()}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <History size={18} />
              <div>
                <strong>No logs available</strong>
                <span>Admin actions, alert sends, and portfolio imports will appear here.</span>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  function renderActivePage() {
    switch (page) {
      case 'detail':
        return renderInstrumentDetailPage();
      case 'portfolio':
        return renderPortfolioPage();
      case 'watchlist':
        return renderWatchlistPage();
      case 'alerts':
        return renderAlertsPage();
      case 'screener':
        return renderScreenerPage();
      case 'sectors':
        return renderSectorsPage();
      case 'settings':
        return renderSettingsPage();
      case 'admin':
        return renderAdminPage();
      case 'logs':
        return renderLogsPage();
      case 'dashboard':
      default:
        return renderDashboardPage();
    }
  }

  if (!tokenReady) {
    return renderAuthExperience();
  }

  if (!boot) {
    return (
      <div className="loading-shell">
        <div className="loading-card">
          <Sparkles size={22} />
          <strong>Loading MarketPulse</strong>
          <span>Preparing account data and market context.</span>
        </div>
      </div>
    );
  }

  if (!isOnboarded) {
    return renderOnboarding();
  }

  return (
    <div className="app-shell">
      {notice ? (
        <div className={`notice notice--floating ${notice.type === 'error' ? 'notice--error' : 'notice--success'}`}>
          {notice.message}
        </div>
      ) : null}

      <header className="topbar">
        <div className="brand-stack">
          <div className="brand-mark">MP</div>
          <div>
            <span className="eyebrow">MarketPulse</span>
            <strong>Investor workflow dashboard</strong>
          </div>
        </div>

        <div className="topbar-search topbar-search--interactive">
          <Search size={16} />
          <input
            className="topbar-search__input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search stocks, ETFs, or mutual funds"
            aria-label="Search instruments"
          />
          {searchQuery.trim() ? (
            <div className="search-popover">
              {searchLoading ? (
                <div className="search-empty">
                  <strong>Searching...</strong>
                  <span>Checking symbols, funds, sectors, and exchanges.</span>
                </div>
              ) : searchResults.length ? (
                searchResults.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    className="search-result"
                    onClick={() => openInstrument(item.symbol)}
                  >
                    <div>
                      <strong>{item.symbol}</strong>
                      <span>{item.name}</span>
                    </div>
                    <small>{item.type}</small>
                  </button>
                ))
              ) : (
                <div className="search-empty">
                  <strong>No matches</strong>
                  <span>Try another symbol or fund name.</span>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="user-pill">
          <ShieldCheck size={16} />
          <span>{userDisplayName}</span>
        </div>

        <button className="button button--ghost" type="button" onClick={handleLogout}>
          <LogOut size={16} />
          Sign out
        </button>
      </header>

      <div className="market-strip">
        {indices.map((item) => (
          <div key={item.symbol} className="market-strip__item">
            <span>{item.name}</span>
            <strong>{formatMoney(item.currentPrice)}</strong>
            <small className={item.changePct >= 0 ? 'trend trend--up' : 'trend trend--down'}>
              {formatPercent(item.changePct)}
            </small>
          </div>
        ))}
      </div>

      <div className="workspace">
        <aside className="sidebar">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={`sidebar-link ${page === item.key ? 'sidebar-link--active' : ''}`}
                onClick={() => setPage(item.key)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="sidebar-callout">
            <Mail size={16} />
            <div>
              <strong>Email logic</strong>
              <span>Alerts are evaluated every minute and mailed to the account email when rules match.</span>
            </div>
          </div>
        </aside>

        <main className="content-shell">
          {renderActivePage()}
        </main>
      </div>
    </div>
  );
}

export default App;

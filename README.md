# MarketPulse Production Web Application

A full-stack production starter for Indian market tracking, charting, watchlists, alerts, sectors, and a bot console.

## What is included

- Responsive React dashboard
- Chart.js time-based historical charts
- Express API
- SQLite persistence
- JWT login
- Watchlist and alerts
- Screener and sector pages
- Bot logs and status
- Demo data seeded on first run

## Run on Ubuntu

### 1) Install prerequisites

```bash
sudo apt update
sudo apt install -y git curl
```

Install Node.js 20+.

### 2) Go to the project

```bash
cd marketpulse-production
```

### 3) Install dependencies

```bash
npm install
npm install --prefix server
npm install --prefix client
```

### 4) Create backend env file

```bash
cp server/.env.example server/.env
nano server/.env
```

### 5) Start development mode

```bash
npm run dev
```

Open:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000/health`

### 6) Demo login

The app auto-seeds a demo user:

- Email: `demo@marketpulse.local`
- Password: `Password123!`

### 7) Production build

```bash
npm run build
npm start
```

Then open `http://localhost:4000`

## Notes

- Chart.js uses a real time scale for date-based axes.
- SQLite is used because it is self-contained and zero-configuration.
- The backend seeds realistic historical OHLC data, watchlist entries, alerts, and logs.
- For split deployments such as `Vercel frontend + Render backend`, set `VITE_API_BASE_URL` in the frontend environment instead of relying on a hardcoded production hostname.
- SMTP alerts are server-managed. Configure `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` on the backend before expecting user alert emails or admin test mail to work.
- Portfolio uploads now support direct CSV or JSON ingestion. Uploaded files are stored under `PORTFOLIO_UPLOAD_DIR` for audit/manual review, while unsupported statement formats can still be captured there for follow-up mapping.

## Systemd option

Copy a service file to `/etc/systemd/system/marketpulse.service` and start it with `systemctl enable --now marketpulse`.

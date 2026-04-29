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
- For split deployments (for example GitHub Pages + API service), set `VITE_API_BASE_URL` in frontend build environment.
- SMTP can now be configured in two ways:
  - App-level SMTP on backend env vars (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) for shared delivery.
  - Per-user SMTP in Settings (or at Sign Up). User SMTP is preferred for that account, with backend SMTP as fallback.
- Portfolio uploads now support direct CSV or JSON ingestion. Uploaded files are stored under `PORTFOLIO_UPLOAD_DIR` for audit/manual review, while unsupported statement formats can still be captured there for follow-up mapping.

## Northflank Deployment

- This repo now deploys to Northflank with Docker (`Dockerfile` in repo root).
- Create a Northflank service from this repository branch `main`.
- Build source: `Dockerfile` at repository root.
- Exposed port: `4000`.
- Health check path: `/health`.
- Free-safe default: no persistent volume, no jobs, no addons, and no extra services. SQLite data is stored on ephemeral container storage and can reset on redeploy/restart.
- Add a persistent volume mounted at `/app/server/data` only after explicit cost approval and a policy update.
- Set:
  - `DATABASE_PATH=/app/server/data/marketpulse.db`
  - `PORTFOLIO_UPLOAD_DIR=/app/server/data/uploads`
  - `JWT_SECRET=<secure random>`
  - `SMTP_CREDENTIALS_SECRET=<secure random>`
  - Optional shared SMTP envs (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)

### Auto Deploy On Every GitHub Commit

- Your Northflank team must link GitHub first (your current dashboard shows no VCS linked).
- Workflow `.github/workflows/northflank-deploy.yml` is included and does:
  1. Build and push image to GHCR on each push to `main`
  2. Deploy that image to a Northflank deployment service using the official Northflank GitHub action
- Required repository secrets:
  - `NORTHFLANK_API_KEY`
  - `NORTHFLANK_PROJECT_ID`
  - `NORTHFLANK_SERVICE_ID`
  - `JWT_SECRET`
  - `SMTP_CREDENTIALS_SECRET`
- Optional secret (if image registry credentials are required in Northflank):
  - `NORTHFLANK_CREDENTIALS_ID`
- Optional for GitHub Pages frontend builds:
  - `NORTHFLANK_API_BASE_URL` (for `.github/workflows/pages.yml`)

## Cost Control Guardrails

This repository includes a strict cost policy with CI enforcement:

- Policy file: `ops/cost-policy.json`
- Enforcement script: `scripts/enforce-cost-policy.mjs`
- CI workflow gate: `.github/workflows/cost-guard.yml`

Current enforced rules:

- Max 1 service in project (`marketpulse-api`)
- Max 0 jobs in project
- Max 0 addons in project
- Max 0 volumes in project
- Max 1 replica per service
- Only `nf-compute-10` deployment plan allowed
- Only public port `4000` is allowed
- Ephemeral storage is capped at 1024 MB and shared memory at 64 MB
- Service/job/addon/volume creation beyond the approved service is disallowed by policy
- GitHub workflow cron/schedule triggers disallowed

`northflank-deploy.yml` applies the approved Northflank service configuration, runs policy enforcement before deploy, deploys the Docker image, reapplies runtime guardrails, and verifies `/health` plus `/api/bootstrap`.

The app uses an in-process Node cron loop for market refresh/alert checks. It does not create a Northflank cron job, so it does not consume the Northflank job quota.

Recommended account-level controls in Northflank UI:

1. Keep team on Sandbox plan while testing
2. Configure billing alerts at low thresholds (for example $1, $3, $5)
3. Enable invoice/billing emails for at least two addresses
4. Review usage dashboard before any scale/plan change

## Systemd option

Copy a service file to `/etc/systemd/system/marketpulse.service` and start it with `systemctl enable --now marketpulse`.

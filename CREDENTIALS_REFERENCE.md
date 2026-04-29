# MarketPulse - Credentials Reference

**⚠️ FOR DEVELOPMENT ONLY - DO NOT SHARE PUBLICLY**

## Demo Accounts

### Admin Account
- **Email**: `admin@marketpulse.local`
- **Password**: `Admin@1234`
- **Role**: Admin
- **Access**: 
  - Full dashboard
  - User management
  - Admin panel
  - Test mail sending
  - Activity logs

### Demo User Account  
- **Email**: `demo@marketpulse.local`
- **Password**: `Password123!`
- **Role**: User
- **Access**: 
  - Dashboard
  - Portfolio (pre-populated with 3 mutual funds)
  - Watchlist
  - Alerts
  - Search
  - Settings

### Test User (Portfolio Template)
- **Email**: `anasquazi1@gmail.com`
- **Pre-loaded Portfolio**:
  - PARAG_FLEXI: 18.44 units @ ₹79.12
  - MOTILAL_LARGE: 22.15 units @ ₹51.38
  - NIPPON_SMALL: 31.72 units @ ₹68.04

---

## Testing Credentials

Use these accounts to test different flows:

| Feature | Account | Steps |
|---------|---------|-------|
| Sign Up | Any email | Navigate to Sign Up, fill form, submit |
| User Login | `demo@marketpulse.local` | Use password `Password123!` |
| Admin Login | `admin@marketpulse.local` | Use password `Admin@1234` |
| Portfolio Import | `anasquazi1@gmail.com` | Any password, choose "Fetch" in onboarding |
| Alerts | Any account | Create alerts on dashboard |
| Test Mail | Admin only | Admin panel → Test Mail (requires SMTP config) |

---

## SMTP Configuration (Email Alerts)

### Current Status
- **Configured**: No (local SQLite mode)
- **Status**: Email alerts are logged but not sent
- **For Testing**: Admin test mail will show "Mail not configured" message

### To Enable Email Alerts

#### Option 1: Gmail (Recommended for Testing)
```bash
# In server/.env

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
SMTP_FROM=your-email@gmail.com
SMTP_SECURE=false
```

**Get Gmail App Password**:
1. Enable 2-Factor Authentication on Gmail
2. Go to https://myaccount.google.com/apppasswords
3. Select Mail & Windows Computer
4. Copy the 16-character password
5. Paste as SMTP_PASS

#### Option 2: User-specific SMTP (Preferred for multi-user)
Users can set their own SMTP credentials in Settings or at Sign Up:
- SMTP Host
- SMTP Port
- SMTP User
- SMTP App Password
- SMTP From

App-level SMTP in backend env vars remains as fallback for users who do not configure personal SMTP.

---

## Database

### Current Setup
- **Type**: SQLite (file-based)
- **Location**: `server/data/marketpulse.db`
- **Auto-seeded**: Yes (on first run)
- **Persistence**: Local file system

### Seeded Data
- 26 instruments (indices, stocks, ETFs, mutual funds)
- 252 days historical OHLC data
- Demo users with onboarding completed
- Sample alerts and watchlist

---

## Environments

### Development
```
Backend: http://localhost:4000
Frontend: http://localhost:3000/Marketpulse/
Database: ./server/data/marketpulse.db
```

### Production (Northflank)
```
Backend + Frontend: Northflank deployment URL (single Docker service)
Database: SQLite with persistent volume mount (or PostgreSQL if you migrate later)
```

---

## Important Notes

1. **Password Security**: Production passwords should be strong and stored in environment variables
2. **JWT Secret**: Change `JWT_SECRET` in production (currently defaults to 'change_this_in_production')
3. **Database**: SQLite is fine for development and single-instance deployments
4. **Email**: Set up SMTP before deploying to production
5. **CORS**: Dev mode allows localhost/127.0.0.1; update for production domains

---

## Troubleshooting

### Can't Login After Sign Up
- Ensure you're using the correct password
- Check if user was created in the seeded demo accounts
- Clear browser localStorage and try again

### Email Alerts Not Sending
- Check if SMTP_* env vars are set in server/.env
- Admin test mail will show "Mail not configured" if SMTP is missing
- View logs in server/src/index.js for error details

### Blank Charts
- Ensure backend is running (http://localhost:4000/health)
- Check browser console for API errors
- Verify CORS is allowing your frontend origin

---

Last Updated: April 26, 2026

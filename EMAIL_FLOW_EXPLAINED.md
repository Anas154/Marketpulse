# Email Alert Flow - Simple Explanation

## How Email Alerts Work in MarketPulse

### The Flow (Step by Step)

```
1. User Creates Alert
   └─ Admin or User creates alert rule (e.g., "Send email if GOLDBEES price drops below ₹120")
   └─ Alert stored in database with user's login email

2. Backend Checks Every Minute
   └─ Cron job runs every minute
   └─ Queries all enabled alerts
   └─ Checks if trigger condition is met (price below ₹120, etc.)

3. Alert Triggered?
   ├─ YES: 
   │  ├─ System sends email to user's LOGIN EMAIL ONLY
   │  ├─ Uses Nodemailer + SMTP (Gmail, custom server, etc.)
   │  ├─ Records trigger in database (prevents duplicate emails)
   │  └─ User receives "Buy Alert!" email with price details
   │
   └─ NO: Do nothing, check again next minute

4. Alert Resets
   └─ When price goes back up (above ₹120), alert resets
   └─ Ready to trigger again if price drops below ₹120 again
```

---

## Alert Types & How They Trigger

### 1️⃣ Price-Based Alerts
**Trigger When**:
- Price crosses above/below your target value

**Example**: 
- Alert: "Send when TCS price goes ABOVE ₹3500"
- Current price: ₹3485
- User buys TCS stock
- Price rises to ₹3510
- ✅ Email sent: "TCS reached your target! Price: ₹3510"

**Use For**: Stocks, ETFs, mutual funds

---

### 2️⃣ NAV-Based Alerts (For Mutual Funds & ETFs)
**Trigger When**:
- NAV (Net Asset Value) crosses above/below target

**Example**:
- Alert: "Send when GOLDBEES NAV goes BELOW ₹120"
- Current NAV: ₹124
- Market drops
- NAV falls to ₹118
- ✅ Email sent: "GOLDBEES hit monthly low! NAV: ₹118"

**Use For**: Mutual funds, ETFs

---

### 3️⃣ Monthly Low Watch
**Trigger When**:
- Price reaches the lowest value in the last 30 days

**Example**:
- Last 30 days low for RELIANCE: ₹2900
- Current price: ₹2950
- Price drops to ₹2895 (new 30-day low)
- ✅ Email sent: "New monthly low detected! Price: ₹2895"

**Use For**: Spotting support levels

---

### 4️⃣ Monthly High Watch
**Trigger When**:
- Price reaches the highest value in the last 30 days

**Example**:
- Last 30 days high for INFY: ₹1600
- Current price: ₹1580
- Price rises to ₹1610 (new 30-day high)
- ✅ Email sent: "New monthly high reached! Price: ₹1610"

**Use For**: Spotting resistance levels

---

### 5️⃣ Hourly NAV Updates
**Trigger When**:
- Every hour during market hours (9:30 AM to 3:30 PM IST)

**Example**:
- Alert: "Send me hourly NAV update for GOLDBEES"
- 10:00 AM → Email: GOLDBEES NAV: ₹124.50
- 11:00 AM → Email: GOLDBEES NAV: ₹124.48
- 12:00 PM → Email: GOLDBEES NAV: ₹124.52
- (continues every hour until market close)

**Use For**: Tracking intraday NAV movements

---

## Key Points About Email Alerts

### Where Email Goes
- **Always to**: The email you used to login/sign up
- **Not to**: Any hardcoded email, not to other users
- **Example**: If you sign up as `anasquazi1@gmail.com`, alerts go to `anasquazi1@gmail.com`

### Why You Might Not Receive Emails

| Issue | Why | Fix |
|-------|-----|-----|
| "Mail not configured" | SMTP env vars not set | Set SMTP_* in server/.env |
| Silent (no error) | Email being sent but not arriving | Check spam folder, verify SMTP credentials |
| Alert created but no email | Alert might not be triggered yet | Check if condition is actually met |
| Only admin test mail works | SMTP configured but user alerts fail | Check alert's target price/NAV value |

---

## How to Set Up Emails (For Admins)

### Step 1: Get SMTP Credentials
Choose your email provider:

**Gmail** (Easiest):
```
SMTP_HOST: smtp.gmail.com
SMTP_PORT: 587
SMTP_USER: your-email@gmail.com
SMTP_PASS: (16-char app password from myaccount.google.com/apppasswords)
SMTP_FROM: your-email@gmail.com
SMTP_SECURE: false
```

**SendGrid** (Production):
```
SMTP_HOST: smtp.sendgrid.net
SMTP_PORT: 587
SMTP_USER: apikey
SMTP_PASS: (your SendGrid API key)
SMTP_FROM: your-app-email@example.com
SMTP_SECURE: false
```

### Step 2: Add to server/.env
```bash
# server/.env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=your-email@gmail.com
SMTP_SECURE=false
```

### Step 3: Restart Backend
```bash
cd server
node src/index.js
```

### Step 4: Test with Admin Test Mail
```
1. Login as admin@marketpulse.local / Admin@1234
2. Go to Admin panel
3. Click "Send Test Mail"
4. Enter test email and message
5. Click "Send"
6. Check your inbox (or spam)
```

---

## Email Content Example

### Price Alert Email
```
Subject: 🚨 BUY ALERT - GOLDBEES

Price Alert Triggered!

Instrument: Nippon India Gold ETF (GOLDBEES)
Condition: Price below ₹120.00
Current Price: ₹119.50
Triggered At: 2:45 PM IST, 26 April 2026

Time to buy? Check the dashboard for more details.

---
MarketPulse Trading Bot
Alerts end when you disable them.
```

### Hourly NAV Email
```
Subject: Hourly NAV Update - GOLDBEES

NAV Update for Nippon India Gold ETF (GOLDBEES)

NAV: ₹2,058.02
Time: 11:00 AM IST, 26 April 2026
52-Week Range: ₹1,900 - ₹2,150

Check dashboard for historical trends.

---
MarketPulse Trading Bot
Next update: 12:00 PM IST
```

---

## Important Security Notes

❌ **Never**:
- Share your email with other users
- Set up alerts for someone else's email
- Give admin password to regular users
- Store passwords in plain text in code

✅ **Always**:
- Use strong unique passwords
- Keep SMTP credentials in .env (never in git)
- Check spam filters if emails don't arrive
- Disable alerts when you don't need them

---

## Troubleshooting Email Issues

### Problem: Admin test mail shows "Mail not configured"

**Solution**: Add SMTP env vars to server/.env and restart backend

```bash
# Check if .env exists
ls server/.env

# Create from example
cp server/.env.example server/.env

# Edit with SMTP details
nano server/.env

# Restart
node src/index.js
```

---

### Problem: Alert triggered but no email received

**Checklist**:
1. ✅ Is SMTP configured? (Check server/.env)
2. ✅ Is the alert ENABLED? (Check alert list)
3. ✅ Is the condition actually TRUE? (Check current price)
4. ✅ Did the condition just CHANGE to true? (First time trigger only)
5. ✅ Check spam folder and Gmail filters

---

### Problem: Same email keeps arriving every minute

**Solution**: Alert settings might be wrong. Check if:
- Condition is "monthly_low" (should only trigger once)
- Not "hourly_nav" (which sends every hour intentionally)
- Alert might be disabled/re-enabled repeatedly

---

## Quick Reference

| Need | Do This |
|------|---------|
| Test email sending | Admin panel → Test Mail (Gmail SMTP needed) |
| Set up user alerts | User login → Alerts → Create alert → Set target |
| Disable alerts | Alerts tab → Toggle off |
| Check alert history | Dashboard → Bot status → Recent triggers |
| Get hourly updates | Create alert → Condition: "Hourly NAV mail" |
| Buy/Sell signals | Create alert → Price above/below target |

---

Last Updated: April 26, 2026

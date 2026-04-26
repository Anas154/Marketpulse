const nodemailer = require('nodemailer');

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  return {
    host,
    port,
    user,
    pass,
    from,
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'
  };
}

function isMailConfigured() {
  const config = getMailConfig();
  return Boolean(config.host && config.user && config.pass && config.from);
}

function inferProvider(host) {
  const normalized = String(host || '').toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('gmail')) return 'gmail';
  if (normalized.includes('sendgrid')) return 'sendgrid';
  if (normalized.includes('outlook') || normalized.includes('office365')) return 'outlook';
  return 'custom';
}

function getPublicMailStatus() {
  const config = getMailConfig();
  const missingFields = [];

  if (!config.host) missingFields.push('SMTP_HOST');
  if (!config.user) missingFields.push('SMTP_USER');
  if (!config.pass) missingFields.push('SMTP_PASS');
  if (!config.from) missingFields.push('SMTP_FROM');

  return {
    configured: missingFields.length === 0,
    provider: inferProvider(config.host),
    host: config.host || '',
    port: config.port,
    secure: config.secure,
    from: config.from || '',
    missingFields
  };
}

function buildTransport() {
  const config = getMailConfig();
  if (!isMailConfigured()) return null;

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    }
  });
}

async function sendAlertEmail({ to, subject, text, html }) {
  const transporter = buildTransport();
  const config = getMailConfig();

  if (!transporter) {
    return { ok: false, skipped: true, reason: 'mail_not_configured' };
  }

  await transporter.sendMail({
    from: config.from,
    to,
    subject,
    text,
    html
  });

  return { ok: true };
}

module.exports = {
  getMailConfig,
  getPublicMailStatus,
  isMailConfigured,
  sendAlertEmail
};

const crypto = require('crypto');
const nodemailer = require('nodemailer');

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value || '').toLowerCase() === 'true';
}

function getEncryptionSecret() {
  return process.env.SMTP_CREDENTIALS_SECRET || process.env.JWT_SECRET || 'change_this_in_production';
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptSecret(plain) {
  const text = String(plain || '');
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(getEncryptionSecret()), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(cipherText) {
  if (!cipherText) return '';
  try {
    const [ivB64, tagB64, payloadB64] = String(cipherText).split(':');
    if (!ivB64 || !tagB64 || !payloadB64) return '';
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      deriveKey(getEncryptionSecret()),
      Buffer.from(ivB64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payloadB64, 'base64')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

function normalizeMailConfig(input = {}) {
  const host = String(input.host || '').trim();
  const port = Number(input.port || 587);
  const user = String(input.user || '').trim();
  const pass = String(input.pass || '').trim();
  const from = String(input.from || user).trim();
  const secure = toBoolean(input.secure);

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user,
    pass,
    from,
    secure
  };
}

function getMailConfig() {
  return normalizeMailConfig({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    secure: process.env.SMTP_SECURE
  });
}

function getUserMailConfig(user = {}) {
  if (!toBoolean(user.smtp_enabled)) return null;
  return normalizeMailConfig({
    host: user.smtp_host,
    port: user.smtp_port || 587,
    user: user.smtp_user,
    pass: decryptSecret(user.smtp_pass_enc),
    from: user.smtp_from || user.smtp_user,
    secure: toBoolean(user.smtp_secure)
  });
}

function inferProvider(host) {
  const normalized = String(host || '').toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('gmail')) return 'gmail';
  if (normalized.includes('sendgrid')) return 'sendgrid';
  if (normalized.includes('outlook') || normalized.includes('office365')) return 'outlook';
  return 'custom';
}

function getMissingFields(config, prefix = 'SMTP_') {
  const missing = [];
  if (!config.host) missing.push(`${prefix}HOST`);
  if (!config.user) missing.push(`${prefix}USER`);
  if (!config.pass) missing.push(`${prefix}PASS`);
  if (!config.from) missing.push(`${prefix}FROM`);
  return missing;
}

function isMailConfigured(config = getMailConfig()) {
  return getMissingFields(config).length === 0;
}

function getPublicMailStatus(user = null) {
  const appConfig = getMailConfig();
  const appMissing = getMissingFields(appConfig);
  const userConfig = user ? getUserMailConfig(user) : null;
  const userMissing = userConfig ? getMissingFields(userConfig, 'USER_SMTP_') : ['USER_SMTP_DISABLED'];
  const usingUserSmtp = Boolean(userConfig && userMissing.length === 0);
  const effective = usingUserSmtp ? userConfig : appConfig;
  const effectiveMissing = usingUserSmtp ? userMissing : appMissing;

  return {
    configured: effectiveMissing.length === 0,
    provider: inferProvider(effective.host),
    host: effective.host || '',
    port: effective.port,
    secure: effective.secure,
    from: effective.from || '',
    usingUserSmtp,
    missingFields: effectiveMissing,
    app: {
      configured: appMissing.length === 0,
      provider: inferProvider(appConfig.host),
      host: appConfig.host || '',
      port: appConfig.port,
      secure: appConfig.secure,
      from: appConfig.from || '',
      missingFields: appMissing
    },
    user: {
      enabled: Boolean(user && toBoolean(user.smtp_enabled)),
      configured: userMissing.length === 0,
      provider: inferProvider(userConfig?.host),
      host: userConfig?.host || '',
      port: userConfig?.port || 587,
      secure: Boolean(userConfig?.secure),
      from: userConfig?.from || '',
      missingFields: userMissing
    }
  };
}

function resolveMailConfig(preferred = null) {
  const normalizedPreferred = preferred ? normalizeMailConfig(preferred) : null;
  if (normalizedPreferred && isMailConfigured(normalizedPreferred)) {
    return { config: normalizedPreferred, source: 'user' };
  }

  const fallback = getMailConfig();
  if (isMailConfigured(fallback)) {
    return { config: fallback, source: 'app' };
  }

  return { config: null, source: 'none' };
}

function buildTransport(config) {
  if (!config) return null;
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

async function sendAlertEmail({ to, subject, text, html, smtpConfig = null }) {
  const resolved = resolveMailConfig(smtpConfig);
  if (!resolved.config) {
    return { ok: false, skipped: true, reason: 'mail_not_configured', source: resolved.source };
  }

  const transporter = buildTransport(resolved.config);
  await transporter.sendMail({
    from: resolved.config.from,
    to,
    subject,
    text,
    html
  });

  return { ok: true, source: resolved.source, provider: inferProvider(resolved.config.host) };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  getMailConfig,
  getUserMailConfig,
  getPublicMailStatus,
  isMailConfigured,
  sendAlertEmail
};

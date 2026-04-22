const DEFAULT_API_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:4000'
  : 'https://marketpulse-ivi5.onrender.com';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

function buildUrl(path) {
  if (!path) return API_BASE_URL;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('marketpulse_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path), {
    ...options,
    headers,
    mode: 'cors'
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const message = data?.error || `Request failed: ${res.status}`;
    throw new Error(message);
  }

  return data;
}

export function saveSession(token) {
  localStorage.setItem('marketpulse_token', token);
}

export function clearSession() {
  localStorage.removeItem('marketpulse_token');
}

export function getSessionToken() {
  return localStorage.getItem('marketpulse_token');
}

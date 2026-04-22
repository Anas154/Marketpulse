export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('marketpulse_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    ...options,
    headers
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

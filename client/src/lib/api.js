// [FIX 2 - VITE_API_URL WIRING]
const API_BASE = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'nu_board_token';

export function getToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (!token) window.localStorage.removeItem(TOKEN_KEY);
  else window.localStorage.setItem(TOKEN_KEY, token);
}

export function authHeader() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// [FIX - SESSION EXPIRY 401 HANDLER]
function handleSessionExpired() {
  setToken('');
  localStorage.removeItem('token');

  const onLoginPage = window.location.pathname.endsWith('/login');
  const hasExpiredParam = window.location.search.includes('session=expired');
  if (!onLoginPage || !hasExpiredParam) {
    window.location.href = '/login?session=expired';
  }

  return new Promise(() => {});
}

async function parseJsonResponse(res) {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return await res.json();
  const text = await res.text();
  return text ? { message: text } : {};
}

export async function api(path, { method = 'GET', body, headers } = {}) {
  // [FIX 2 - VITE_API_URL WIRING]
  const url = typeof path === 'string' && /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  // [FIX 2 - VITE_API_URL WIRING]
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await parseJsonResponse(res);

  // [FIX - SESSION EXPIRY 401 HANDLER]
  if (res.status === 401) {
    return handleSessionExpired();
  }

  if (!res.ok) {
    const message = data && data.message ? data.message : `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiAuth(path, options = {}) {
  return api(path, { ...options, headers: { ...authHeader(), ...(options.headers || {}) } });
}

// For FormData uploads — browser sets Content-Type (multipart boundary) automatically
export async function apiAuthUpload(path, formData) {
  const token = getToken();
  // [FIX 2 - VITE_API_URL WIRING]
  const url = typeof path === 'string' && /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  // [FIX 2 - VITE_API_URL WIRING]
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await parseJsonResponse(res);

  // [FIX - SESSION EXPIRY 401 HANDLER]
  if (res.status === 401) {
    return handleSessionExpired();
  }

  if (!res.ok) {
    const message = data?.message || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

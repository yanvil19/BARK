// [FIX 2 - VITE_API_URL WIRING]
const API_BASE = import.meta.env.VITE_API_URL || '';
const AUTH_TOKEN_KEY = 'nu_board_token';

export function getStoredAuthToken() {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearClientSessionStorage() {
  try {
    window.localStorage.clear();
  } catch {
    // Ignore storage access failures so auth redirects can still proceed.
  }
}

export function buildAuthHeaders(headers = {}) {
  const token = getStoredAuthToken();
  return {
    ...(headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// [FIX - SESSION EXPIRY 401 HANDLER]
function handleSessionExpired(isDeactivated = false) {
  clearClientSessionStorage();

  if (isDeactivated) {
    // Fire a custom event so App.jsx can show a modal before logging the user out.
    window.dispatchEvent(new CustomEvent('account-deactivated'));
    return new Promise(() => {});
  }

  const onLoginPage = window.location.pathname.endsWith('/login');
  const hasSessionParam = window.location.search.includes('session=');
  if (!onLoginPage || !hasSessionParam) {
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

export async function api(path, { method = 'GET', body, headers, expectAuth = false } = {}) {
  // [FIX 2 - VITE_API_URL WIRING]
  const url = typeof path === 'string' && /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(headers),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await parseJsonResponse(res);

  // [FIX - SESSION EXPIRY 401 HANDLER]
  if (res.status === 401) {
    const isDeactivated = Boolean(data?.message && data.message.toLowerCase().includes('deactivated'));
    if (expectAuth) return handleSessionExpired(isDeactivated);
    clearClientSessionStorage();
  }

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiAuth(path, options = {}) {
  return api(path, { ...options, expectAuth: true });
}

// For FormData uploads — browser sets Content-Type (multipart boundary) automatically
export async function apiAuthUpload(path, formData) {
  const url = typeof path === 'string' && /^https?:\/\//i.test(path) ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: buildAuthHeaders(),
    body: formData,
  });
  const data = await parseJsonResponse(res);

  if (res.status === 401) {
    const isDeactivated = Boolean(data?.message && data.message.toLowerCase().includes('deactivated'));
    return handleSessionExpired(isDeactivated);
  }

  if (!res.ok) {
    const message = data?.message || data?.error || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

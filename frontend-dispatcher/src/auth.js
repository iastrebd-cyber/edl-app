/**
 * frontend-dispatcher/src/auth.js
 *
 * Token management, auto-refresh and authenticated fetch wrapper
 * for the dispatcher frontend.
 *
 * Tokens are stored ONLY in localStorage — never in component state or cookies.
 * Tokens are never logged to the console.
 */

const API         = 'http://localhost:3000';
const ACCESS_KEY  = 'dispatcher_token';
const REFRESH_KEY = 'dispatcher_refresh_token';

let _refreshTimer = null;

// ─── Storage ───────────────────────────────────────────────────────────────

export function getAccessToken()  { return localStorage.getItem(ACCESS_KEY); }
export function getRefreshToken() { return localStorage.getItem(REFRESH_KEY); }

export function saveTokens({ access_token, refresh_token }) {
  if (access_token)  localStorage.setItem(ACCESS_KEY,  access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ─── Refresh timer ─────────────────────────────────────────────────────────
// access_token lives 15 min — refresh 2 min before expiry = every 13 min.

const REFRESH_INTERVAL_MS = 13 * 60 * 1000;

export function startRefreshTimer() {
  stopRefreshTimer();
  _refreshTimer = setInterval(async () => {
    const ok = await refreshAccessToken();
    if (!ok) {
      stopRefreshTimer();
      window.dispatchEvent(new Event('auth:expired'));
    }
  }, REFRESH_INTERVAL_MS);
}

export function stopRefreshTimer() {
  if (_refreshTimer !== null) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

// ─── Auth API calls ────────────────────────────────────────────────────────

/**
 * POST /api/auth/login
 * Returns { ok: true, user } or { ok: false, error, message? }
 */
export async function login(email, password) {
  try {
    const res  = await fetch(`${API}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const json = await res.json();

    if (res.ok) {
      saveTokens(json);
      startRefreshTimer();
      return { ok: true, user: json.user };
    }
    if (res.status === 401) return { ok: false, error: 'INVALID_CREDENTIALS' };
    if (res.status === 423) return { ok: false, error: 'ACCOUNT_LOCKED', message: json.message };
    return { ok: false, error: 'SERVER_ERROR' };
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}

/**
 * POST /api/auth/logout — fire-and-forget, always clears local tokens.
 */
export async function logout() {
  const token = getAccessToken();
  if (token) {
    fetch(`${API}/api/auth/logout`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});  // intentionally fire-and-forget
  }
  clearTokens();
  stopRefreshTimer();
}

/**
 * POST /api/auth/refresh
 * Returns true on success, false on any failure (tokens cleared on failure).
 */
export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearTokens();
    return false;
  }
  try {
    const res = await fetch(`${API}/api/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearTokens();
      return false;
    }
    const json = await res.json();
    saveTokens(json);
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

/**
 * GET /api/auth/me — validates current access token, attempts refresh on 401.
 * Returns { ok: true, user } or { ok: false, error? }
 */
export async function checkAuth() {
  const token = getAccessToken();
  if (!token) return { ok: false };

  try {
    const res = await fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const user = await res.json();
      return { ok: true, user };
    }

    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) return { ok: false };

      const res2 = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
      });
      if (res2.ok) {
        const user = await res2.json();
        return { ok: true, user };
      }
      return { ok: false };
    }

    return { ok: false };
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}

// ─── authFetch ─────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for fetch in all components.
 *
 * - Automatically injects Authorization: Bearer <access_token>
 * - On 401: attempts silent token refresh, then retries the request once
 * - On terminal 401 (refresh failed): dispatches window 'auth:expired' event
 *   so App.jsx can redirect to LoginScreen
 */
export async function authFetch(url, options = {}) {
  const buildHeaders = () => ({
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    Authorization:  `Bearer ${getAccessToken() || ''}`,
  });

  let res = await fetch(url, { ...options, headers: buildHeaders() });

  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // One retry with the new token
      res = await fetch(url, { ...options, headers: buildHeaders() });
    } else {
      // Refresh failed — tell the app the session is dead
      window.dispatchEvent(new Event('auth:expired'));
    }
  }

  return res;
}

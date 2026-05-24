/**
 * src/api/client.js
 *
 * Axios instance with:
 *   - Base URL pointing to backend
 *   - JWT access token attached to every request
 *   - Auto-refresh: if 401 received, refresh token and retry
 *   - On refresh failure: redirect to login
 */

import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// ── Main API client ───────────────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach access token ─────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 + token refresh ─────────
let isRefreshing = false;
let failedQueue  = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else       prom.resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        isRefreshing = false;
        redirectToLogin();
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const { access_token, refresh_token } = data;
        localStorage.setItem('access_token',  access_token);
        localStorage.setItem('refresh_token', refresh_token);

        api.defaults.headers.common.Authorization = `Bearer ${access_token}`;
        originalRequest.headers.Authorization     = `Bearer ${access_token}`;

        processQueue(null, access_token);
        isRefreshing = false;

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        isRefreshing = false;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        redirectToLogin();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

function redirectToLogin() {
  window.location.href = '/login';
}

// ── Auth endpoints ────────────────────────────────────────────
export const authAPI = {
  login:          (email, password) =>
    api.post('/auth/login', { email, password }),
  logout:         () =>
    api.post('/auth/logout'),
  me:             () =>
    api.get('/auth/me'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
};

// ── HOS Events endpoints ──────────────────────────────────────
export const hosAPI = {
  createEvent:    (data) =>
    api.post('/hos-events', data),
  getDriverHOS:   (driverId) =>
    api.get(`/hos-events/drivers/${driverId}/hos`),
  getSessionEvents: (sessionId) =>
    api.get(`/hos-events/sessions/${sessionId}/events`),
  editEvent:      (eventId, data) =>
    api.post(`/hos-events/${eventId}/edit`, data),
  certifySession: (sessionId, signature) =>
    api.post(`/hos-events/sessions/${sessionId}/certify`, { signature }),
};

// ── Sessions endpoints ────────────────────────────────────────
export const sessionsAPI = {
  getToday:       () =>
    api.get('/sessions/today'),
  getSession:     (id) =>
    api.get(`/sessions/${id}`),
  getHistory:     (driverId, days = 8) =>
    api.get(`/sessions/drivers/${driverId}/sessions?days=${days}`),
  update:         (id, data) =>
    api.put(`/sessions/${id}`, data),
};

// ── Violations endpoints ──────────────────────────────────────
export const violationsAPI = {
  getDriverViolations: (driverId) =>
    api.get(`/violations/driver/${driverId}`),
};

// ── DVIR endpoints ────────────────────────────────────────────
export const dvirAPI = {
  /** Submit a new DVIR (pre/post/roadside). */
  submit:           (data)      => api.post('/dvir', data),
  /** Get DVIR history for a driver. */
  getHistory:       (driverId)  => api.get(`/dvir/driver/${driverId}`),
  /**
   * Check whether the driver has completed a pre-trip DVIR today.
   * @param {string} [sessionId] – optional current session UUID
   * @returns {{ completed: boolean, safe_to_operate: boolean|null, report: object|null }}
   */
  checkPretrip:     (sessionId) =>
    api.get('/dvir/pretrip-status', { params: sessionId ? { session_id: sessionId } : {} }),
};

export default api;

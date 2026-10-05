/**
 * API service layer – Axios instance, token management and endpoint groups.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'auth_token';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 30_000,
});

// ── Token management ──────────────────────────────────────────────────────────

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem(TOKEN_KEY);
    delete api.defaults.headers.common['Authorization'];
  }
}

export function getAuthHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Auto-load token on import
setAuthToken(getToken());

// Any 401 from a protected endpoint → tell the app to log out.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    if (err.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register') && !url.startsWith('/auth/google')) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(err);
  }
);

/** Extract a readable message from an axios error. */
export function errorMessage(err, fallback = 'Error') {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
  return err?.message || fallback;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  google: (credential) => api.post('/auth/google', { credential }),
  me: () => api.get('/auth/me'),
  config: () => api.get('/auth/config'),
};

// ── Models ─────────────────────────────────────────────────────────────────────

export const modelsApi = {
  list: () => api.get('/models/'),
};

// ── History endpoints ──────────────────────────────────────────────────────────

export const historyApi = {
  list: (limit = 100, offset = 0) =>
    api.get('/history/', { params: { limit, offset } }),
  get: (convId) => api.get(`/history/${convId}`),
  update: (convId, data) => api.patch(`/history/${convId}`, data),
  delete: (convId) => api.delete(`/history/${convId}`),
};

// ── Document endpoints ─────────────────────────────────────────────────────────

export const documentApi = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600_000,
    });
  },
};

export function resolveFileUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const cleanBase = BASE_URL.replace(/\/$/, '');
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${cleanBase}${cleanPath}`;
}


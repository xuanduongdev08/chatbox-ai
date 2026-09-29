/**
 * API service layer – Axios instance + auth helpers.
 */
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 30_000,
});

// ── Token management ──────────────────────────────────────────────────────────

export function setAuthToken(token) {
  if (token) {
    localStorage.setItem('auth_token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    localStorage.removeItem('auth_token');
    delete api.defaults.headers.common['Authorization'];
  }
}

export function getAuthHeaders() {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Auto-load token on import
const savedToken = localStorage.getItem('auth_token');
if (savedToken) {
  api.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
}

// ── Auth endpoints ─────────────────────────────────────────────────────────────

export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

// ── History endpoints ──────────────────────────────────────────────────────────

export const historyApi = {
  list: (limit = 30, offset = 0) =>
    api.get('/history/', { params: { limit, offset } }),
  get: (convId) => api.get(`/history/${convId}`),
  delete: (convId) => api.delete(`/history/${convId}`),
};

// ── Document endpoints ─────────────────────────────────────────────────────────

export const documentApi = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/documents/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

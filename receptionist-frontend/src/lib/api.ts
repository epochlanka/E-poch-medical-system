import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('epoch_reception_token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('epoch_reception_token');
      localStorage.removeItem('epoch_reception_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const fileUrl = (path: string) => `${API_BASE_URL}${path}`;

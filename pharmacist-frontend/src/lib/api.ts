import axios from 'axios';
import { commonLoginUrl } from '../config/roleRoutes';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && !window.location.pathname.startsWith('/login')) {
      window.location.replace(commonLoginUrl());
    }
    return Promise.reject(error);
  }
);

export const fileUrl = (path: string) => `${API_BASE_URL}${path}`;

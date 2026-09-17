import axios from 'axios';
import { commonLoginUrl } from '../config/roleRoutes';

// Default to the host used to open the UI so LAN clients call the clinic server, not themselves.
export const API_BASE_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

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

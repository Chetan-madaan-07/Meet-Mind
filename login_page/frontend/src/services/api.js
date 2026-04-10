import { Platform } from "react-native";
import axios from "axios";
import {
  getToken,
  getRefreshToken,
  saveToken,
  removeToken,
} from "../utils/storage";

// Web runs on the same machine; mobile devices need the host LAN IP.
const HOST_IP = "10.21.168.92";
export const BASE_URL =
  Platform.OS === "web" ? "http://localhost:8000" : `http://${HOST_IP}:8000`;

export const MEETING_WEB_URL = `${BASE_URL}/meeting`;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let pendingRequests = [];

const flushPendingRequests = (error, newToken = null) => {
  pendingRequests.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(newToken);
    }
  });
  pendingRequests = [];
};

// Attach JWT token to every request
api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const statusCode = error?.response?.status;
    const requestUrl = originalRequest?.url || "";

    if (!originalRequest || statusCode !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const isAuthRoute =
      requestUrl.includes("/api/auth/login") ||
      requestUrl.includes("/api/auth/signup") ||
      requestUrl.includes("/api/auth/google") ||
      requestUrl.includes("/api/auth/refresh");

    if (isAuthRoute) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await removeToken();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingRequests.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((refreshError) => Promise.reject(refreshError));
    }

    isRefreshing = true;

    try {
      const response = await axios.post(`${BASE_URL}/api/auth/refresh`, {
        refresh_token: refreshToken,
      });

      const newAccessToken = response.data?.access_token;
      if (!newAccessToken) {
        throw new Error("Refresh endpoint did not return an access token");
      }

      await saveToken(newAccessToken);
      flushPendingRequests(null, newAccessToken);

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      flushPendingRequests(refreshError, null);
      await removeToken();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

// ── Auth API calls ──

export const signupUser = async (name, email, password) => {
  const response = await api.post("/api/auth/signup", { name, email, password });
  return response.data;
};

export const loginUser = async (email, password) => {
  const response = await api.post("/api/auth/login", { email, password });
  return response.data;
};

export const googleAuth = async (payload) => {
  const response = await api.post("/api/auth/google", payload);
  return response.data;
};

export const refreshAccessToken = async (refreshToken) => {
  const response = await api.post("/api/auth/refresh", {
    refresh_token: refreshToken,
  });
  return response.data;
};

export const startMeeting = async () => {
  const response = await api.post("/api/meetings/start");
  return response.data;
};

export const stopMeeting = async (meetingId) => {
  const response = await api.post(`/api/meetings/${meetingId}/stop`);
  return response.data;
};

export const getMeetingSummary = async (meetingId) => {
  const response = await api.get(`/api/meetings/${meetingId}/summary`);
  return response.data;
};

export const updateTaskStatus = async (taskId, status) => {
  const response = await api.patch(`/api/tasks/${taskId}`, { status });
  return response.data;
};

export const getProfile = async () => {
  const response = await api.get("/api/auth/me");
  return response.data;
};

export default api;

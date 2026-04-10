import { NativeModules, Platform } from "react-native";
import axios from "axios";
import {
  getToken,
  getRefreshToken,
  saveToken,
  removeToken,
} from "../utils/storage";

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const getHostFromScriptURL = () => {
  const scriptURL = NativeModules?.SourceCode?.scriptURL;
  if (!scriptURL) return null;
  try {
    return new URL(scriptURL).hostname || null;
  } catch {
    return null;
  }
};

const getHostFromExpoConfig = () => {
  try {
    // Optional dependency in Expo projects; safe fallback if unavailable.
    const Constants = require("expo-constants").default;
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest2?.extra?.expoClient?.hostUri ||
      Constants?.manifest?.debuggerHost;
    if (!hostUri) return null;
    return String(hostUri).split(":")[0] || null;
  } catch {
    return null;
  }
};

const resolveBaseUrl = () => {
  const apiUrlOverride = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrlOverride) {
    return trimTrailingSlash(apiUrlOverride);
  }

  if (Platform.OS === "web") {
    return "http://localhost:8000";
  }

  const apiHostOverride = process.env.EXPO_PUBLIC_API_HOST;
  if (apiHostOverride) {
    return `http://${apiHostOverride}:8000`;
  }

  const detectedHost = getHostFromExpoConfig() || getHostFromScriptURL();
  if (detectedHost) {
    return `http://${detectedHost}:8000`;
  }

  // Last-resort default for local Android emulator use.
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }

  return "http://localhost:8000";
};

export const BASE_URL = resolveBaseUrl();

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

export const getMeetingHistory = async (params = {}) => {
  const response = await api.get("/api/meetings", { params });
  return response.data;
};

export const getTaskBoard = async (params = {}) => {
  const response = await api.get("/api/tasks", { params });
  return response.data;
};

export const deleteMeeting = async (meetingId) => {
  await api.delete(`/api/meetings/${meetingId}`);
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

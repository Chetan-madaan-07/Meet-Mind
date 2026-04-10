import { Platform } from "react-native";
import axios from "axios";
import { getToken } from "../utils/storage";

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

// ── Auth API calls ──

export const signupUser = async (name, email, password) => {
  const response = await api.post("/api/auth/signup", { name, email, password });
  return response.data;
};

export const loginUser = async (email, password) => {
  const response = await api.post("/api/auth/login", { email, password });
  return response.data;
};

export const getProfile = async () => {
  const response = await api.get("/api/auth/me");
  return response.data;
};

export default api;

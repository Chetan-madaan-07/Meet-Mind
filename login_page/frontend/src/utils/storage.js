import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "meetmind_jwt_token";
const REFRESH_TOKEN_KEY = "meetmind_refresh_token";
const USER_KEY = "meetmind_user_data";

const secureSetItem = async (key, value) => {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  const isAvailable = await SecureStore.isAvailableAsync();
  if (!isAvailable) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const secureGetItem = async (key) => {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  const isAvailable = await SecureStore.isAvailableAsync();
  if (!isAvailable) {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
};

const secureDeleteItem = async (key) => {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  const isAvailable = await SecureStore.isAvailableAsync();
  if (!isAvailable) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

/**
 * Save JWT token to secure storage.
 */
export const saveToken = async (token) => {
  try {
    await secureSetItem(TOKEN_KEY, token);
  } catch (error) {
    console.error("Error saving token:", error);
  }
};

/**
 * Retrieve JWT token from storage.
 */
export const getToken = async () => {
  try {
    return await secureGetItem(TOKEN_KEY);
  } catch (error) {
    console.error("Error getting token:", error);
    return null;
  }
};

/**
 * Save refresh token.
 */
export const saveRefreshToken = async (refreshToken) => {
  try {
    await secureSetItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch (error) {
    console.error("Error saving refresh token:", error);
  }
};

/**
 * Retrieve refresh token from storage.
 */
export const getRefreshToken = async () => {
  try {
    return await secureGetItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("Error getting refresh token:", error);
    return null;
  }
};

/**
 * Remove JWT token (logout).
 */
export const removeToken = async () => {
  try {
    await secureDeleteItem(TOKEN_KEY);
    await secureDeleteItem(REFRESH_TOKEN_KEY);
    await AsyncStorage.removeItem(USER_KEY);
  } catch (error) {
    console.error("Error removing token:", error);
  }
};

/**
 * Save user data to storage.
 */
export const saveUser = async (user) => {
  try {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (error) {
    console.error("Error saving user:", error);
  }
};

/**
 * Retrieve user data from storage.
 */
export const getUser = async () => {
  try {
    const data = await AsyncStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error("Error getting user:", error);
    return null;
  }
};

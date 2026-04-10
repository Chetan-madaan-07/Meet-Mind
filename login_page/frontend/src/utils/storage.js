import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "meetmind_jwt_token";
const USER_KEY = "meetmind_user_data";

/**
 * Save JWT token to secure storage.
 */
export const saveToken = async (token) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error("Error saving token:", error);
  }
};

/**
 * Retrieve JWT token from storage.
 */
export const getToken = async () => {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch (error) {
    console.error("Error getting token:", error);
    return null;
  }
};

/**
 * Remove JWT token (logout).
 */
export const removeToken = async () => {
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
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

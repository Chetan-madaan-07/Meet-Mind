import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BASE_URL, loginUser } from "../services/api";
import { saveToken, saveRefreshToken, saveUser } from "../utils/storage";

const { width } = Dimensions.get("window");

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const errorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    if (error) {
      Animated.sequence([
        Animated.timing(errorAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(3000),
        Animated.timing(errorAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setError(""));
    }
  }, [error]);

  const validateEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleLogin = async () => {
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }
    if (!validateEmail(email)) {
      setError("Please enter a valid email address");
      return;
    }
    if (!password) {
      setError("Please enter your password");
      return;
    }

    setLoading(true);
    try {
      const data = await loginUser(email.trim().toLowerCase(), password);
      await saveToken(data.access_token);
      if (data.refresh_token) {
        await saveRefreshToken(data.refresh_token);
      }
      await saveUser(data.user);
      navigation.replace("Home");
    } catch (err) {
      const isNetworkError = !err.response;
      const message =
        err.response?.data?.detail ||
        (isNetworkError
          ? `Login failed: cannot reach backend at ${BASE_URL}`
          : "Login failed. Please try again.");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Logo / Branding */}
            <Animated.View
              style={[
                styles.logoContainer,
                { transform: [{ scale: logoScale }] },
              ]}
            >
              <View style={styles.logoCircle}>
                <Ionicons name="people" size={40} color="#e94560" />
              </View>
              <Text style={styles.appName}>Meet-Mind</Text>
              <Text style={styles.tagline}>Your intelligent meeting companion</Text>
            </Animated.View>

            {/* Form Card */}
            <Animated.View
              style={[
                styles.formCard,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Text style={styles.formTitle}>Welcome Back</Text>
              <Text style={styles.formSubtitle}>Sign in to continue</Text>

              {/* Error Message */}
              {error ? (
                <Animated.View style={[styles.errorContainer, { opacity: errorAnim }]}>
                  <Ionicons name="alert-circle" size={18} color="#ff6b6b" />
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>
              ) : null}

              {/* Email Input */}
              <View
                style={[
                  styles.inputContainer,
                  emailFocused && styles.inputContainerFocused,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={20}
                  color={emailFocused ? "#e94560" : "#8892b0"}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Email address"
                  placeholderTextColor="#5a6380"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
              </View>

              {/* Password Input */}
              <View
                style={[
                  styles.inputContainer,
                  passwordFocused && styles.inputContainerFocused,
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={20}
                  color={passwordFocused ? "#e94560" : "#8892b0"}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#5a6380"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#8892b0"
                  />
                </TouchableOpacity>
              </View>

              {/* Forgot Password */}
              <TouchableOpacity style={styles.forgotPassword}>
                <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>

              {/* Login Button */}
              <TouchableOpacity
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={["#e94560", "#c23152"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButton}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Text style={styles.loginButtonText}>Log In</Text>
                      <Ionicons name="arrow-forward" size={20} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Sign Up Link */}
              <View style={styles.signupContainer}>
                <Text style={styles.signupText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
                  <Text style={styles.signupLink}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(233, 69, 96, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(233, 69, 96, 0.3)",
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 14,
    color: "#8892b0",
    marginTop: 6,
    letterSpacing: 0.5,
  },
  formCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
  },
  formTitle: {
    fontSize: 26,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  formSubtitle: {
    fontSize: 15,
    color: "#8892b0",
    marginBottom: 24,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 107, 107, 0.2)",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.08)",
    height: 54,
  },
  inputContainerFocused: {
    borderColor: "rgba(233, 69, 96, 0.5)",
    backgroundColor: "rgba(233, 69, 96, 0.04)",
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    paddingVertical: 0,
  },
  eyeIcon: {
    padding: 4,
  },
  forgotPassword: {
    alignSelf: "flex-end",
    marginBottom: 20,
    marginTop: 2,
  },
  forgotPasswordText: {
    color: "#e94560",
    fontSize: 13,
    fontWeight: "600",
  },
  loginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    height: 54,
    gap: 8,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 24,
  },
  signupContainer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 24,
  },
  signupText: {
    color: "#8892b0",
    fontSize: 14,
  },
  signupLink: {
    color: "#e94560",
    fontSize: 14,
    fontWeight: "700",
  },
});

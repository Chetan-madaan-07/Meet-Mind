import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { BASE_URL } from "../services/api";
import { getToken, getUser } from "../utils/storage";

export default function MeetingRoomScreen() {
  const [roomId, setRoomId] = useState(`room-${Math.random().toString(36).slice(2, 8)}`);
  const [name, setName] = useState("Guest");
  const [token, setToken] = useState("");
  const [joined, setJoined] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);

  useEffect(() => {
    const hydrateIdentity = async () => {
      const [storedUser, storedToken] = await Promise.all([getUser(), getToken()]);
      if (storedUser?.name) {
        setName(storedUser.name);
      }
      if (storedToken) {
        setToken(storedToken);
      }
    };

    hydrateIdentity();
  }, []);

  const meetingUrl = useMemo(() => {
    const encodedRoom = encodeURIComponent(roomId.trim() || "room-default");
    const encodedName = encodeURIComponent(name.trim() || "Guest");
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
    return `${BASE_URL}/meeting/?room=${encodedRoom}&name=${encodedName}${tokenQuery}`;
  }, [roomId, name, token]);

  const joinRoom = () => {
    if (!roomId.trim()) {
      Alert.alert("Room ID required", "Please enter a room ID to continue.");
      return;
    }
    setJoined(true);
    setWebViewKey((value) => value + 1);
  };

  const resetRoom = () => {
    setJoined(false);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={styles.gradient}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Meeting Room</Text>
              <Text style={styles.subtitle}>Join and talk with your team live</Text>
            </View>
            <Ionicons name="videocam" size={28} color="#e94560" />
          </View>

          <View style={styles.controlsCard}>
            <Text style={styles.label}>Room ID</Text>
            <TextInput
              style={styles.input}
              value={roomId}
              onChangeText={setRoomId}
              placeholder="team-standup"
              placeholderTextColor="#6f7a97"
            />

            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#6f7a97"
            />

            <Text style={styles.label}>JWT Token (optional)</Text>
            <TextInput
              style={styles.input}
              value={token}
              onChangeText={setToken}
              placeholder="Paste token if needed"
              placeholderTextColor="#6f7a97"
              autoCapitalize="none"
            />

            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={joinRoom}>
                <Text style={styles.primaryButtonText}>{joined ? "Reload Room" : "Join Room"}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.secondaryButton} onPress={resetRoom}>
                <Text style={styles.secondaryButtonText}>Leave</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.webviewContainer}>
            {joined ? (
              <WebView
                key={webViewKey}
                source={{ uri: meetingUrl }}
                originWhitelist={["*"]}
                mediaPlaybackRequiresUserAction={false}
                allowsInlineMediaPlayback
                javaScriptEnabled
                domStorageEnabled
                startInLoadingState
                onError={() => {
                  Alert.alert(
                    "Connection error",
                    "Could not open meeting room. Ensure backend is running and phone can reach your laptop IP."
                  );
                }}
              />
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="people-circle-outline" size={56} color="#8892b0" />
                <Text style={styles.emptyTitle}>Room is not active</Text>
                <Text style={styles.emptyText}>Tap Join Room to open the in-app call screen.</Text>
              </View>
            )}
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 14,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
  },
  subtitle: {
    color: "#98a2be",
    marginTop: 4,
    fontSize: 13,
  },
  controlsCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  label: {
    color: "#b9c3dd",
    fontSize: 12,
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "rgba(8, 14, 32, 0.6)",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#fff",
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#e94560",
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  secondaryButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  webviewContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  emptyText: {
    color: "#96a1bc",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});
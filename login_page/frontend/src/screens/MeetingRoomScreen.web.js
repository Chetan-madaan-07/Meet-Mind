import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { BASE_URL, stopMeeting } from "../services/api";
import { getToken, getUser } from "../utils/storage";
import { TranscriptionSocketClient } from "../services/transcriptionSocket";

export default function MeetingRoomScreen({ navigation, route }) {
  const routeRoomId = route?.params?.roomId;
  const [roomId, setRoomId] = useState(routeRoomId || `room-${Math.random().toString(36).slice(2, 8)}`);
  const [name, setName] = useState("Guest");
  const [token, setToken] = useState("");
  const [joined, setJoined] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState("idle");
  const [transcriptInput, setTranscriptInput] = useState("");
  const [transcriptLines, setTranscriptLines] = useState([]);
  const transcriptScrollRef = useRef(null);
  const transcriptionClientRef = useRef(null);

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

  useEffect(() => {
    if (routeRoomId) {
      setRoomId(routeRoomId);
      setJoined(true);
      setWebViewKey((value) => value + 1);
    }
  }, [routeRoomId]);

  useEffect(() => {
    if (transcriptScrollRef.current && transcriptLines.length) {
      transcriptScrollRef.current.scrollToEnd({ animated: true });
    }
  }, [transcriptLines]);

  useEffect(() => {
    if (!joined || !token || !roomId) return undefined;

    const client = new TranscriptionSocketClient({
      meetingId: roomId.trim(),
      token: token.trim(),
      onStatus: (nextStatus) => setTranscriptionStatus(nextStatus),
      onPartialTranscript: (payload) => {
        setTranscriptLines((prev) => {
          const next = [...prev];
          const existingIndex = next.findIndex((line) => line.sequence === payload.sequence);
          const nextLine = {
            sequence: payload.sequence,
            text: payload.text,
            local: Boolean(payload.local_fallback),
          };
          if (existingIndex >= 0) {
            next[existingIndex] = nextLine;
          } else {
            next.push(nextLine);
            next.sort((a, b) => a.sequence - b.sequence);
          }
          return next;
        });
      },
      onError: (message) => {
        Alert.alert("Transcription", message || "Transcription connection issue");
      },
    });

    transcriptionClientRef.current = client;
    client.connect();

    return () => {
      client.disconnect();
      transcriptionClientRef.current = null;
    };
  }, [joined, token, roomId]);

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
    setTranscriptLines([]);
    setTranscriptInput("");
    transcriptionClientRef.current?.disconnect();
    transcriptionClientRef.current = null;
  };

  const sendTranscriptChunk = () => {
    const text = transcriptInput.trim();
    if (!text) return;
    if (!transcriptionClientRef.current) {
      Alert.alert("Transcription", "Join room with a valid token to start transcription.");
      return;
    }
    transcriptionClientRef.current.sendChunkText(text);
    setTranscriptInput("");
  };

  const handleStopAndSummarize = async () => {
    if (!roomId) return;
    try {
      await stopMeeting(roomId.trim());
      setJoined(false);
      navigation.navigate("MeetingSummary", { meetingId: roomId.trim() });
    } catch (error) {
      Alert.alert(
        "Stop failed",
        error?.response?.data?.detail || "Could not stop and summarize meeting."
      );
    }
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
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.stopButton} onPress={handleStopAndSummarize}>
                <Text style={styles.stopButtonText}>Stop & Summarize</Text>
              </TouchableOpacity>
              <Ionicons name="videocam" size={28} color="#e94560" />
            </View>
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

          <View style={styles.transcriptCard}>
            <View style={styles.transcriptHeader}>
              <Text style={styles.transcriptTitle}>Live Transcript</Text>
              <Text style={styles.transcriptStatus}>{transcriptionStatus}</Text>
            </View>
            <ScrollView ref={transcriptScrollRef} style={styles.transcriptScroll}>
              {transcriptLines.length ? (
                transcriptLines.map((line, index) => (
                  <Text key={`${index}-${line.sequence}`} style={styles.transcriptLine}>
                    {line.sequence}: {line.text}
                    {line.local ? " (local)" : ""}
                  </Text>
                ))
              ) : (
                <Text style={styles.transcriptEmpty}>
                  No transcript yet. Send chunks after joining.
                </Text>
              )}
            </ScrollView>
            <View style={styles.transcriptInputRow}>
              <TextInput
                style={styles.transcriptInput}
                value={transcriptInput}
                onChangeText={setTranscriptInput}
                placeholder="Simulated chunk text"
                placeholderTextColor="#6f7a97"
              />
              <TouchableOpacity style={styles.transcriptSend} onPress={sendTranscriptChunk}>
                <Text style={styles.transcriptSendText}>Send</Text>
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stopButton: {
    backgroundColor: "#08bdbd",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  stopButtonText: {
    color: "#032325",
    fontWeight: "700",
    fontSize: 12,
  },
  transcriptCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  transcriptHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  transcriptTitle: {
    color: "#fff",
    fontWeight: "700",
  },
  transcriptStatus: {
    color: "#8dd3ff",
    fontSize: 12,
    textTransform: "capitalize",
  },
  transcriptScroll: {
    maxHeight: 120,
    marginBottom: 8,
  },
  transcriptLine: {
    color: "#e5edff",
    fontSize: 12,
    marginBottom: 6,
  },
  transcriptEmpty: {
    color: "#96a1bc",
    fontSize: 12,
  },
  transcriptInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  transcriptInput: {
    flex: 1,
    backgroundColor: "rgba(8, 14, 32, 0.6)",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#fff",
  },
  transcriptSend: {
    backgroundColor: "#08bdbd",
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  transcriptSendText: {
    color: "#032325",
    fontWeight: "700",
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

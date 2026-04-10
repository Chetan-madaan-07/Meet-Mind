import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { getMeetingSummary, stopMeeting, updateTaskStatus } from "../services/api";

const STATUS_FLOW = ["todo", "in_progress", "done"];
const STATUS_LABELS = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
}

function getNextStatus(status) {
  const index = STATUS_FLOW.indexOf(status);
  if (index < 0) return "todo";
  return STATUS_FLOW[(index + 1) % STATUS_FLOW.length];
}

export default function MeetingSummaryScreen({ navigation, route }) {
  const meetingId = route?.params?.meetingId;
  const [loading, setLoading] = useState(true);
  const [summaryState, setSummaryState] = useState(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    const fetchSummary = async () => {
      if (!meetingId) {
        setError("Missing meeting id.");
        setLoading(false);
        return;
      }

      try {
        const data = await getMeetingSummary(meetingId);
        if (cancelled) return;
        setSummaryState(data);
        setError("");
        setLoading(false);

        if (data.status === "processing") {
          timer = setTimeout(fetchSummary, 3000);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.detail || "Could not fetch meeting summary.");
        setLoading(false);
      }
    };

    fetchSummary();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [meetingId, retrying]);

  const meetingDateText = useMemo(() => {
    if (!summaryState?.meeting_date) return "N/A";
    return new Date(summaryState.meeting_date).toLocaleString();
  }, [summaryState?.meeting_date]);

  const onRetry = async () => {
    if (!meetingId) return;
    try {
      setRetrying(true);
      setError("");
      await stopMeeting(meetingId);
      const refreshed = await getMeetingSummary(meetingId);
      setSummaryState(refreshed);
      setLoading(false);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not retry summarization.");
    } finally {
      setRetrying(false);
    }
  };

  const onTaskPress = async (task) => {
    const nextStatus = getNextStatus(task.status);
    setSummaryState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: (prev.tasks || []).map((item) =>
          item.id === task.id ? { ...item, status: nextStatus } : item
        ),
      };
    });

    try {
      await updateTaskStatus(task.id, nextStatus);
    } catch (err) {
      setSummaryState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: (prev.tasks || []).map((item) =>
            item.id === task.id ? { ...item, status: task.status } : item
          ),
        };
      });
      Alert.alert("Task update failed", err?.response?.data?.detail || "Could not update task status.");
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={styles.gradient}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate("Home")}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backButtonText}>Home</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Meeting Summary</Text>
          <View style={{ width: 56 }} />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading summary...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRetry} disabled={retrying}>
              {retrying ? (
                <ActivityIndicator color="#032325" size="small" />
              ) : (
                <Text style={styles.retryButtonText}>Retry</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.metaCard}>
              <Text style={styles.metaTitle}>{summaryState?.meeting_title || "Untitled Meeting"}</Text>
              <Text style={styles.metaText}>Date: {meetingDateText}</Text>
              <Text style={styles.metaText}>
                Duration: {formatDuration(summaryState?.duration_seconds)}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={styles.statusValue}>{summaryState?.status || "unknown"}</Text>
            </View>

            {summaryState?.status === "processing" ? (
              <View style={styles.processingBox}>
                <ActivityIndicator color="#8dd3ff" />
                <Text style={styles.processingText}>Summarization in progress. Auto-refresh every 3 seconds.</Text>
              </View>
            ) : null}

            {summaryState?.status === "failed" ? (
              <View style={styles.failedBox}>
                <Text style={styles.failedText}>Summarization failed for this meeting.</Text>
                <TouchableOpacity style={styles.retryButton} onPress={onRetry} disabled={retrying}>
                  {retrying ? (
                    <ActivityIndicator color="#032325" size="small" />
                  ) : (
                    <Text style={styles.retryButtonText}>Retry</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Summary</Text>
              <Text style={styles.cardBody}>{summaryState?.summary || "No summary available."}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Decisions</Text>
              {(summaryState?.decisions || []).length ? (
                summaryState.decisions.map((item, index) => (
                  <Text key={`decision-${index}`} style={styles.listItem}>
                    {index + 1}. {item}
                  </Text>
                ))
              ) : (
                <Text style={styles.emptyText}>No decisions detected.</Text>
              )}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Tasks</Text>
              {(summaryState?.tasks || []).length ? (
                summaryState.tasks.map((task, index) => (
                  <TouchableOpacity
                    key={`task-${task.id}`}
                    style={styles.taskRow}
                    onPress={() => onTaskPress(task)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.listItem}>
                        {index + 1}. {task.text}
                      </Text>
                      <Text style={styles.assigneeText}>
                        Assignee: {task.assignee || "Unassigned"}
                      </Text>
                    </View>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>{STATUS_LABELS[task.status] || task.status}</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyText}>No tasks detected.</Text>
              )}
            </View>
          </ScrollView>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, paddingTop: 54, paddingHorizontal: 16, paddingBottom: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  backButtonText: { color: "#fff", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, gap: 12 },
  loadingText: { color: "#b9c3dd", marginTop: 10 },
  errorText: { color: "#ff9aa8", textAlign: "center" },
  content: { paddingBottom: 30, gap: 12 },
  metaCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  metaTitle: { color: "#fff", fontSize: 16, fontWeight: "800", marginBottom: 6 },
  metaText: { color: "#c7d3ef", fontSize: 13, marginBottom: 2 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 12,
  },
  statusLabel: { color: "#b9c3dd", fontSize: 12, fontWeight: "600" },
  statusValue: { color: "#fff", fontWeight: "700", textTransform: "capitalize" },
  processingBox: {
    backgroundColor: "rgba(141, 211, 255, 0.12)",
    borderColor: "rgba(141, 211, 255, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  processingText: { color: "#d8efff", flex: 1 },
  failedBox: {
    backgroundColor: "rgba(255, 154, 168, 0.12)",
    borderColor: "rgba(255, 154, 168, 0.3)",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  failedText: { color: "#ffd5dc" },
  retryButton: {
    backgroundColor: "#08bdbd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minWidth: 96,
    alignItems: "center",
  },
  retryButtonText: { color: "#032325", fontWeight: "700" },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  cardTitle: { color: "#fff", fontWeight: "700", marginBottom: 8 },
  cardBody: { color: "#dfe7fb", lineHeight: 20 },
  listItem: { color: "#dfe7fb", marginBottom: 6, lineHeight: 20 },
  emptyText: { color: "#8fa0c2" },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  assigneeText: {
    color: "#94a4c8",
    fontSize: 12,
    marginBottom: 6,
  },
  statusPill: {
    backgroundColor: "rgba(8, 189, 189, 0.2)",
    borderColor: "rgba(8, 189, 189, 0.5)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    color: "#9ff6f6",
    fontSize: 11,
    fontWeight: "700",
  },
});

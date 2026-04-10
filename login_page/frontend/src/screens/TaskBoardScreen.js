import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { getTaskBoard, updateTaskStatus } from "../services/api";

const STATUS_ORDER = ["todo", "in_progress", "done"];
const STATUS_LABELS = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
};

const FILTER_OPTIONS = [
  { key: "all", label: "All" },
  { key: "todo", label: "Todo" },
  { key: "in_progress", label: "In Progress" },
  { key: "done", label: "Done" },
];

const nextStatus = (current) => {
  const index = STATUS_ORDER.indexOf(current);
  if (index < 0) return "todo";
  return STATUS_ORDER[(index + 1) % STATUS_ORDER.length];
};

export default function TaskBoardScreen({ navigation }) {
  const [board, setBoard] = useState({
    todo: [],
    in_progress: [],
    done: [],
    total: 0,
  });
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingTaskId, setUpdatingTaskId] = useState(null);

  const fetchBoard = async (nextFilter = statusFilter) => {
    try {
      setLoading(true);
      setError("");
      const params = nextFilter === "all" ? {} : { status: nextFilter };
      const data = await getTaskBoard(params);
      setBoard(data);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load task board.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBoard(statusFilter);
  }, [statusFilter]);

  const columnData = useMemo(
    () => ({
      todo: board.todo || [],
      in_progress: board.in_progress || [],
      done: board.done || [],
    }),
    [board]
  );

  const handleMoveTask = async (task) => {
    const target = nextStatus(task.status);
    try {
      setUpdatingTaskId(task.id);
      await updateTaskStatus(task.id, target);
      await fetchBoard(statusFilter);
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not update task status.");
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={styles.gradient}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate("Home")}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backText}>Home</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Task Board</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.topBar}>
          <Text style={styles.totalText}>Total Tasks: {board.total || 0}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {FILTER_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.filterChip, statusFilter === option.key && styles.filterChipActive]}
                onPress={() => setStatusFilter(option.key)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    statusFilter === option.key && styles.filterChipTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.infoText}>Loading tasks...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.boardRow}>
            {STATUS_ORDER.map((statusKey) => (
              <View key={statusKey} style={styles.column}>
                <View style={styles.columnHeader}>
                  <Text style={styles.columnTitle}>{STATUS_LABELS[statusKey]}</Text>
                  <Text style={styles.columnCount}>{columnData[statusKey].length}</Text>
                </View>

                {(columnData[statusKey] || []).length ? (
                  columnData[statusKey].map((task) => (
                    <View key={task.id} style={styles.taskCard}>
                      <Text style={styles.taskText}>{task.text}</Text>
                      <Text style={styles.taskMeta}>Assignee: {task.assignee || "Unassigned"}</Text>
                      <Text style={styles.taskMeta}>Meeting: {task.meeting_title}</Text>

                      <TouchableOpacity
                        style={styles.moveButton}
                        onPress={() => handleMoveTask(task)}
                        disabled={updatingTaskId === task.id}
                      >
                        {updatingTaskId === task.id ? (
                          <ActivityIndicator size="small" color="#032325" />
                        ) : (
                          <Text style={styles.moveButtonText}>
                            Move to {STATUS_LABELS[nextStatus(task.status)]}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>No tasks</Text>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1, paddingTop: 54, paddingHorizontal: 16, paddingBottom: 12 },
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
  backText: { color: "#fff", fontWeight: "600" },
  topBar: {
    marginBottom: 10,
    gap: 8,
  },
  totalText: {
    color: "#c6d4f4",
    fontSize: 12,
    fontWeight: "600",
  },
  filterRow: {
    gap: 8,
    paddingRight: 6,
  },
  filterChip: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: "rgba(8, 189, 189, 0.2)",
    borderColor: "rgba(8, 189, 189, 0.5)",
  },
  filterChipText: { color: "#c6d4f4", fontSize: 12, fontWeight: "600" },
  filterChipTextActive: { color: "#baf5f2" },
  boardRow: {
    gap: 12,
    paddingRight: 10,
    paddingBottom: 20,
  },
  column: {
    width: 290,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    alignSelf: "flex-start",
  },
  columnHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  columnTitle: { color: "#fff", fontWeight: "700" },
  columnCount: { color: "#8dd3ff", fontWeight: "700", fontSize: 12 },
  taskCard: {
    backgroundColor: "rgba(8, 14, 32, 0.68)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  taskText: { color: "#fff", fontWeight: "600", marginBottom: 6, lineHeight: 18 },
  taskMeta: { color: "#98a8cf", fontSize: 12, marginBottom: 3 },
  moveButton: {
    marginTop: 6,
    backgroundColor: "#08bdbd",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  moveButtonText: { color: "#032325", fontWeight: "700", fontSize: 12 },
  emptyCard: {
    backgroundColor: "rgba(8, 14, 32, 0.45)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  emptyText: { color: "#8fa2c8", fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  infoText: { color: "#c6d4f4", marginTop: 10 },
  errorText: { color: "#ffb0bb", textAlign: "center" },
});

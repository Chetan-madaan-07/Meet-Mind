import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { deleteMeeting, getMeetingHistory } from "../services/api";

const PAGE_SIZE = 10;

const isValidDateInput = (value) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
};

const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined) return "N/A";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}m ${rem}s`;
};

export default function MeetingHistoryScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");

  const filterValidationError = useMemo(() => {
    if (!isValidDateInput(dateFrom.trim())) return "Date From must be YYYY-MM-DD";
    if (!isValidDateInput(dateTo.trim())) return "Date To must be YYYY-MM-DD";
    if (dateFrom && dateTo && dateFrom > dateTo) return "Date From must be before Date To";
    return "";
  }, [dateFrom, dateTo]);

  const fetchMeetings = async (nextPage = 1, replace = true) => {
    if (filterValidationError) {
      setError(filterValidationError);
      setLoading(false);
      setLoadingMore(false);
      return;
    }

    const params = {
      page: nextPage,
      page_size: PAGE_SIZE,
    };
    const query = search.trim();
    if (query) params.search = query;
    if (dateFrom.trim()) params.date_from = dateFrom.trim();
    if (dateTo.trim()) params.date_to = dateTo.trim();

    try {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      setError("");

      const data = await getMeetingHistory(params);
      setItems((prev) => (replace ? data.items || [] : [...prev, ...(data.items || [])]));
      setPage(data.page || nextPage);
      setTotal(data.total || 0);
      setHasMore(Boolean(data.has_more));
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not load meeting history.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMeetings(1, true);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, dateFrom, dateTo]);

  const loadMore = () => {
    if (!hasMore || loadingMore || loading) return;
    fetchMeetings(page + 1, false);
  };

  const onDeleteMeeting = (meetingId) => {
    Alert.alert("Delete Meeting", "Are you sure you want to delete this meeting?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setDeletingId(meetingId);
            await deleteMeeting(meetingId);
            await fetchMeetings(1, true);
          } catch (err) {
            setError(err?.response?.data?.detail || "Could not delete meeting.");
          } finally {
            setDeletingId("");
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.meetingCard}>
      <View style={styles.meetingHeader}>
        <Text style={styles.meetingTitle} numberOfLines={1}>
          {item.title || "Untitled Meeting"}
        </Text>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>
      <Text style={styles.metaText}>
        {new Date(item.created_at).toLocaleString()}
      </Text>
      <Text style={styles.metaText}>Duration: {formatDuration(item.duration_seconds)}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.openButton}
          onPress={() => navigation.navigate("MeetingSummary", { meetingId: item.meeting_id })}
        >
          <Text style={styles.openButtonText}>Open Summary</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDeleteMeeting(item.meeting_id)}
          disabled={deletingId === item.meeting_id}
        >
          {deletingId === item.meeting_id ? (
            <ActivityIndicator color="#ffd9df" size="small" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={14} color="#ffd9df" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} style={styles.gradient}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate("Home")}>
            <Ionicons name="arrow-back" size={18} color="#fff" />
            <Text style={styles.backText}>Home</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Meeting History</Text>
          <View style={{ width: 56 }} />
        </View>

        <View style={styles.filterCard}>
          <TextInput
            style={styles.input}
            placeholder="Search title or transcript"
            placeholderTextColor="#8494ba"
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.filterRow}>
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="From (YYYY-MM-DD)"
              placeholderTextColor="#8494ba"
              value={dateFrom}
              onChangeText={setDateFrom}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, styles.halfInput]}
              placeholder="To (YYYY-MM-DD)"
              placeholderTextColor="#8494ba"
              value={dateTo}
              onChangeText={setDateTo}
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.totalText}>{total} meetings found</Text>
        </View>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.infoText}>Loading history...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.meeting_id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Text style={styles.infoText}>No meetings found for current filters.</Text>
              </View>
            }
            ListFooterComponent={
              hasMore ? (
                <TouchableOpacity style={styles.loadMoreButton} onPress={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <ActivityIndicator color="#032325" size="small" />
                  ) : (
                    <Text style={styles.loadMoreText}>Load More</Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
          />
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
  filterCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  filterRow: { flexDirection: "row", gap: 8 },
  input: {
    backgroundColor: "rgba(8, 14, 32, 0.62)",
    borderColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderRadius: 10,
    color: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
  },
  halfInput: { flex: 1 },
  totalText: { color: "#a5b3d4", fontSize: 12 },
  listContent: { paddingBottom: 22, gap: 10 },
  meetingCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  meetingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
    gap: 10,
  },
  meetingTitle: { color: "#fff", fontWeight: "700", flex: 1 },
  statusText: {
    color: "#91e5dd",
    fontSize: 11,
    textTransform: "capitalize",
    backgroundColor: "rgba(8, 189, 189, 0.15)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: { color: "#b7c4e3", fontSize: 12, marginBottom: 2 },
  actionRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  openButton: {
    flex: 1,
    backgroundColor: "rgba(8, 189, 189, 0.2)",
    borderColor: "rgba(8, 189, 189, 0.45)",
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  openButtonText: {
    color: "#baf5f2",
    fontWeight: "700",
    fontSize: 12,
  },
  deleteButton: {
    minWidth: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255, 76, 109, 0.2)",
    borderColor: "rgba(255, 76, 109, 0.45)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteButtonText: {
    color: "#ffd9df",
    fontWeight: "700",
    fontSize: 12,
  },
  centerBox: { padding: 22, alignItems: "center" },
  infoText: { color: "#b7c4e3", marginTop: 8, textAlign: "center" },
  errorText: { color: "#ffb0bb", textAlign: "center" },
  loadMoreButton: {
    marginTop: 6,
    backgroundColor: "#08bdbd",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  loadMoreText: { color: "#032325", fontWeight: "700" },
});

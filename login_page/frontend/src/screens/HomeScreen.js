import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getProfile, startMeeting } from "../services/api";
import { removeToken } from "../utils/storage";

export default function HomeScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (user) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [user]);

  const loadUserData = async () => {
    try {
      const profileData = await getProfile();
      setUser(profileData);
    } catch {
      await removeToken();
      navigation.replace("Login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Logout", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        onPress: async () => {
          await removeToken();
          navigation.replace("Login");
        },
      },
    ]);
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const launchMeetingRoom = async () => {
    try {
      const meeting = await startMeeting();
      navigation.navigate("MeetingRoom", { roomId: meeting.meeting_id });
    } catch (error) {
      const message = error?.response?.data?.detail || "Could not start meeting right now.";
      Alert.alert("Unable to start meeting", message);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={["#1a1a2e", "#16213e", "#0f3460"]}
          style={styles.gradient}
        >
          <Animated.View style={styles.loadingContent}>
            <View style={styles.logoCircleSmall}>
              <Ionicons name="people" size={32} color="#e94560" />
            </View>
            <Text style={styles.loadingText}>Loading...</Text>
          </Animated.View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        style={styles.gradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.userName}>{user?.name || "User"}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={24} color="#e94560" />
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <Animated.View
          style={[
            styles.profileCard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={["rgba(233,69,96,0.15)", "rgba(233,69,96,0.05)"]}
            style={styles.profileCardGradient}
          >
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{getInitials(user?.name)}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
            <View style={styles.profileBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#2ed573" />
              <Text style={styles.badgeText}>Verified</Text>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Quick Actions */}
        <Animated.View
          style={[
            styles.sectionContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {[
              {
                icon: "videocam-outline",
                label: "Meeting Room",
                color: "#e94560",
                onPress: launchMeetingRoom,
              },
              {
                icon: "mic-outline",
                label: "Record",
                color: "#ffa502",
                onPress: launchMeetingRoom,
              },
              {
                icon: "time-outline",
                label: "History",
                color: "#7bed9f",
                onPress: () => navigation.navigate("MeetingHistory"),
              },
              {
                icon: "albums-outline",
                label: "Task Board",
                color: "#70a1ff",
                onPress: () => navigation.navigate("TaskBoard"),
              },
            ].map((action, index) => (
              <TouchableOpacity
                key={index}
                style={styles.actionCard}
                activeOpacity={0.7}
                onPress={action.onPress}
              >
                <View
                  style={[
                    styles.actionIconCircle,
                    { backgroundColor: `${action.color}20` },
                  ]}
                >
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* Account Info */}
        <Animated.View
          style={[
            styles.accountCard,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <Text style={styles.sectionTitle}>Account Details</Text>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={18} color="#8892b0" />
            <Text style={styles.detailLabel}>Name</Text>
            <Text style={styles.detailValue}>{user?.name}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Ionicons name="mail-outline" size={18} color="#8892b0" />
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{user?.email}</Text>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={18} color="#8892b0" />
            <Text style={styles.detailLabel}>Joined</Text>
            <Text style={styles.detailValue}>
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "N/A"}
            </Text>
          </View>
        </Animated.View>
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
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoCircleSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(233, 69, 96, 0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "rgba(233, 69, 96, 0.3)",
  },
  loadingText: {
    color: "#8892b0",
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 24,
  },
  greeting: {
    fontSize: 15,
    color: "#8892b0",
    marginBottom: 4,
  },
  userName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#fff",
  },
  logoutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(233, 69, 96, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(233, 69, 96, 0.2)",
  },
  profileCard: {
    borderRadius: 20,
    overflow: "hidden",
    marginBottom: 24,
  },
  profileCardGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(233, 69, 96, 0.15)",
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#e94560",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 13,
    color: "#8892b0",
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(46, 213, 115, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  badgeText: {
    color: "#2ed573",
    fontSize: 11,
    fontWeight: "600",
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 16,
  },
  actionsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  actionIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  actionLabel: {
    color: "#c8cfe0",
    fontSize: 12,
    fontWeight: "600",
  },
  accountCard: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.06)",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  detailLabel: {
    color: "#8892b0",
    fontSize: 14,
    marginLeft: 12,
    flex: 1,
  },
  detailValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  detailDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
  },
});

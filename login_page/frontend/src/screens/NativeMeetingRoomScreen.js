import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BASE_URL } from "../services/api";

let RTCPeerConnection, RTCIceCandidate, RTCSessionDescription, RTCView, mediaDevices, MediaStream;

try {
  const webrtc = require("react-native-webrtc");
  RTCPeerConnection = webrtc.RTCPeerConnection;
  RTCIceCandidate = webrtc.RTCIceCandidate;
  RTCSessionDescription = webrtc.RTCSessionDescription;
  RTCView = webrtc.RTCView;
  mediaDevices = webrtc.mediaDevices;
  MediaStream = webrtc.MediaStream;
} catch (error) {
  // WebRTC not available in this build (e.g., Expo Go)
}

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function socketUrlFromBase(roomId, name, token) {
  const wsBase = BASE_URL.replace(/^http/, "ws");
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  return `${wsBase}/ws/meeting/${encodeURIComponent(roomId)}?name=${encodeURIComponent(name)}${tokenQuery}`;
}

export default function NativeMeetingRoomScreen({ roomId, name, token, onLeave }) {
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const participantsRef = useRef(new Map());

  const [self, setSelf] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [localStreamUrl, setLocalStreamUrl] = useState("");
  const [remoteTick, setRemoteTick] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const roomLabel = useMemo(() => roomId || "room-default", [roomId]);

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        if (!mediaDevices) {
          setStatus("Dev Build Required");
          return;
        }
        setStatus("Requesting camera and microphone...");
        const localStream = await mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: "user",
            frameRate: 24,
            width: 1280,
            height: 720,
          },
        });

        if (cancelled) return;

        localStreamRef.current = localStream;
        setLocalStreamUrl(localStream.toURL());
        setStatus(`Joining ${roomLabel}...`);

        const socket = new WebSocket(socketUrlFromBase(roomLabel, name || "Guest", token));
        wsRef.current = socket;

        socket.onopen = () => {
          setStatus(`Connected to ${roomLabel}`);
          appendMessage("System", `Joined room ${roomLabel}`);
        };

        socket.onmessage = async (event) => {
          const payload = JSON.parse(event.data);

          if (payload.type === "room_state") {
            setSelf(payload.self);
            const nextParticipants = payload.participants || [];
            participantsRef.current = new Map(nextParticipants.map((participant) => [participant.id, participant]));
            setParticipants(nextParticipants);
            setStatus(`In room ${payload.roomId}`);

            for (const participant of nextParticipants) {
              await createOffer(participant.id, participant.name, socket, localStream);
            }
          }

          if (payload.type === "participant_joined") {
            const nextParticipants = [...participantsRef.current.values()];
            if (!participantsRef.current.has(payload.participant.id)) {
              nextParticipants.push(payload.participant);
              participantsRef.current.set(payload.participant.id, payload.participant);
              setParticipants(nextParticipants);
            }
            appendMessage("System", `${payload.participant.name} joined.`);
            await createOffer(payload.participant.id, payload.participant.name, socket, localStream);
          }

          if (payload.type === "participant_left") {
            participantsRef.current.delete(payload.participant.id);
            setParticipants([...participantsRef.current.values()]);
            closePeer(payload.participant.id);
            appendMessage("System", `${payload.participant.name} left.`);
          }

          if (payload.type === "signal") {
            await handleSignal(payload.from, payload.signal, socket, localStream);
          }

          if (payload.type === "chat") {
            appendMessage(payload.from.name, payload.text);
          }
        };

        socket.onerror = () => {
          setStatus("Connection error");
        };

        socket.onclose = () => {
          setStatus("Disconnected");
        };
      } catch (error) {
        if (!mediaDevices) {
          setStatus("Dev Build Required");
          return;
        }
        setStatus("Could not start native call");
        Alert.alert(
          "Native WebRTC required",
          "This mobile call screen needs a development build. Expo Go cannot run the native WebRTC module."
        );
        if (onLeave) onLeave();
      }
    };

    connect();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [roomLabel, name, token]);

  const appendMessage = (sender, text) => {
    setMessages((current) => [...current, { sender, text, id: `${Date.now()}-${Math.random()}` }]);
  };

  const safeSend = (payload) => {
    const socket = wsRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  };

  const createPeer = (remoteId, remoteName, localStream) => {
    const existing = peersRef.current.get(remoteId);
    if (existing) return existing;

    const peerConnection = new RTCPeerConnection(rtcConfig);
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

    const remoteStream = new MediaStream();
    peerConnection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => remoteStream.addTrack(track));
      remoteStreamsRef.current.set(remoteId, { stream: remoteStream, name: remoteName });
      setRemoteTick((value) => value + 1);
    };

    peerConnection.onicecandidate = ({ candidate }) => {
      if (!candidate) return;
      safeSend({
        type: "signal",
        target: remoteId,
        signal: { type: "ice", candidate },
      });
    };

    peersRef.current.set(remoteId, { peerConnection, remoteStream, remoteName });
    return peersRef.current.get(remoteId);
  };

  const createOffer = async (remoteId, remoteName, socket, localStream) => {
    const peer = createPeer(remoteId, remoteName, localStream);
    const offer = await peer.peerConnection.createOffer();
    await peer.peerConnection.setLocalDescription(offer);

    socket.send(
      JSON.stringify({
        type: "signal",
        target: remoteId,
        signal: { type: "offer", sdp: offer },
      })
    );
  };

  const handleSignal = async (sender, signal, socket, localStream) => {
    const remoteId = sender.id;
    const remoteName = sender.name;
    const peer = createPeer(remoteId, remoteName, localStream);

    if (signal.type === "offer") {
      await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      const answer = await peer.peerConnection.createAnswer();
      await peer.peerConnection.setLocalDescription(answer);

      socket.send(
        JSON.stringify({
          type: "signal",
          target: remoteId,
          signal: { type: "answer", sdp: answer },
        })
      );
    }

    if (signal.type === "answer") {
      await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    }

    if (signal.type === "ice" && signal.candidate) {
      try {
        await peer.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } catch {
        // ICE candidate can arrive before the description is fully applied.
      }
    }
  };

  const closePeer = (remoteId) => {
    const peer = peersRef.current.get(remoteId);
    if (!peer) return;
    peer.peerConnection.close();
    peersRef.current.delete(remoteId);
    remoteStreamsRef.current.delete(remoteId);
    setRemoteTick((value) => value + 1);
  };

  const teardown = () => {
    peersRef.current.forEach((peer) => peer.peerConnection.close());
    peersRef.current.clear();
    remoteStreamsRef.current.clear();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  };

  const sendChat = () => {
    const text = chatText.trim();
    if (!text) return;
    safeSend({ type: "chat", text });
    setChatText("");
  };

  const toggleAudio = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setAudioEnabled(track.enabled);
  };

  const toggleVideo = () => {
    if (!localStreamRef.current) return;
    const track = localStreamRef.current.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setVideoEnabled(track.enabled);
  };

  return (
    <View style={styles.callShell}>
      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{status}</Text>
        <Text style={styles.roomText}>{roomLabel}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.videoGrid}>
        {localStreamUrl ? (
          <View style={styles.videoCard}>
            <RTCView streamURL={localStreamUrl} style={styles.rtcView} objectFit="cover" />
            <View style={styles.cardLabel}>
              <Text style={styles.cardLabelText}>{self?.name || name || "You"}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.videoCard, styles.placeholderCard]}>
            <Text style={styles.placeholderText}>Starting camera...</Text>
          </View>
        )}

        {[...remoteStreamsRef.current.entries()].map(([id, item]) => (
          <View style={styles.videoCard} key={`${id}-${remoteTick}`}>
            <RTCView streamURL={item.stream.toURL()} style={styles.rtcView} objectFit="cover" />
            <View style={styles.cardLabel}>
              <Text style={styles.cardLabelText}>{item.name}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Participants</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.participantRow}>
          <View style={styles.participantPill}>
            <Text style={styles.participantText}>{self?.name || name || "You"}</Text>
          </View>
          {participants.map((participant) => (
            <View style={styles.participantPill} key={participant.id}>
              <Text style={styles.participantText}>{participant.name}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.chatPanel}>
        <ScrollView style={styles.chatList}>
          {messages.map((message) => (
            <View key={message.id} style={styles.chatBubble}>
              <Text style={styles.chatSender}>{message.sender}</Text>
              <Text style={styles.chatText}>{message.text}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={styles.chatInputRow}>
          <TextInput
            style={styles.chatInput}
            placeholder="Message room"
            placeholderTextColor="#7581a6"
            value={chatText}
            onChangeText={setChatText}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendChat}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <TouchableOpacity style={styles.controlButton} onPress={toggleAudio}>
          <Ionicons name={audioEnabled ? "mic" : "mic-off"} size={18} color="#fff" />
          <Text style={styles.controlText}>{audioEnabled ? "Mute" : "Unmute"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={toggleVideo}>
          <Ionicons name={videoEnabled ? "videocam" : "videocam-off"} size={18} color="#fff" />
          <Text style={styles.controlText}>{videoEnabled ? "Camera Off" : "Camera On"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.controlButton, styles.leaveButton]} onPress={onLeave}>
          <Ionicons name="exit" size={18} color="#fff" />
          <Text style={styles.controlText}>Leave</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  callShell: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  statusRow: {
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  statusText: {
    color: "#fff",
    fontWeight: "700",
  },
  roomText: {
    color: "#aeb8d4",
    marginTop: 4,
    fontSize: 12,
  },
  videoGrid: {
    gap: 12,
    paddingBottom: 12,
  },
  videoCard: {
    height: 220,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  rtcView: {
    width: "100%",
    height: "100%",
  },
  cardLabel: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cardLabelText: {
    color: "#fff",
    fontWeight: "700",
  },
  placeholderCard: {
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#c3cce5",
  },
  panel: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 12,
    marginBottom: 10,
  },
  panelTitle: {
    color: "#fff",
    fontWeight: "700",
    marginBottom: 10,
  },
  participantRow: {
    gap: 8,
  },
  participantPill: {
    backgroundColor: "rgba(8,189,189,0.16)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(8,189,189,0.25)",
  },
  participantText: {
    color: "#e8fbfb",
    fontWeight: "600",
  },
  chatPanel: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    padding: 12,
    flex: 1,
    marginBottom: 10,
  },
  chatList: {
    flex: 1,
  },
  chatBubble: {
    backgroundColor: "rgba(6,11,25,0.55)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  chatSender: {
    color: "#82f0dc",
    fontWeight: "700",
    marginBottom: 4,
  },
  chatText: {
    color: "#fff",
  },
  chatInputRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  chatInput: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "rgba(8, 14, 32, 0.6)",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    width: 46,
    borderRadius: 12,
    backgroundColor: "#e94560",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
  },
  controlButton: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingVertical: 12,
  },
  leaveButton: {
    backgroundColor: "#e94560",
  },
  controlText: {
    color: "#fff",
    fontWeight: "700",
  },
});

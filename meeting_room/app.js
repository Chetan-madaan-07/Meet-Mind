const state = {
  ws: null,
  roomId: "",
  self: null,
  joined: false,
  localStream: null,
  peers: new Map(),
  participants: new Map(),
  screenTrack: null,
};

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const elements = {
  nameInput: document.getElementById("nameInput"),
  roomInput: document.getElementById("roomInput"),
  tokenInput: document.getElementById("tokenInput"),
  randomRoomBtn: document.getElementById("randomRoomBtn"),
  joinBtn: document.getElementById("joinBtn"),
  leaveBtn: document.getElementById("leaveBtn"),
  muteBtn: document.getElementById("muteBtn"),
  videoBtn: document.getElementById("videoBtn"),
  shareBtn: document.getElementById("shareBtn"),
  participantsList: document.getElementById("participantsList"),
  statusBar: document.getElementById("statusBar"),
  videoGrid: document.getElementById("videoGrid"),
  chatMessages: document.getElementById("chatMessages"),
  chatInput: document.getElementById("chatInput"),
  sendBtn: document.getElementById("sendBtn"),
};

function setStatus(message) {
  elements.statusBar.textContent = message;
}

function randomRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}`;
}

function parseQueryDefaults() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room") || "";
  const name = params.get("name") || "";
  const token = params.get("token") || "";

  if (room) elements.roomInput.value = room;
  if (name) elements.nameInput.value = name;
  if (token) elements.tokenInput.value = token;
}

function updateControls() {
  const enabled = state.joined;
  elements.leaveBtn.disabled = !enabled;
  elements.muteBtn.disabled = !enabled;
  elements.videoBtn.disabled = !enabled;
  elements.shareBtn.disabled = !enabled;
  elements.sendBtn.disabled = !enabled;
  elements.joinBtn.disabled = enabled;
}

function upsertParticipant(participant) {
  state.participants.set(participant.id, participant.name);
  renderParticipants();
}

function removeParticipant(participantId) {
  state.participants.delete(participantId);
  renderParticipants();
}

function renderParticipants() {
  elements.participantsList.innerHTML = "";
  if (!state.participants.size) {
    const li = document.createElement("li");
    li.textContent = "No one yet";
    elements.participantsList.appendChild(li);
    return;
  }

  [...state.participants.entries()].forEach(([id, name]) => {
    const li = document.createElement("li");
    li.textContent = `${name} (${id === state.self?.id ? "You" : id})`;
    elements.participantsList.appendChild(li);
  });
}

function appendChatLine(senderName, text) {
  const line = document.createElement("div");
  line.className = "chat-line";
  line.innerHTML = `<strong>${senderName}:</strong> ${text}`;
  elements.chatMessages.appendChild(line);
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function createVideoCard(participantId, name, stream, muted = false) {
  const existing = document.getElementById(`video-${participantId}`);
  if (existing) {
    const video = existing.querySelector("video");
    video.srcObject = stream;
    return;
  }

  const card = document.createElement("article");
  card.id = `video-${participantId}`;
  card.className = "video-card";

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = muted;
  video.srcObject = stream;

  const footer = document.createElement("footer");
  footer.textContent = name;

  card.appendChild(video);
  card.appendChild(footer);
  elements.videoGrid.appendChild(card);
}

function removeVideoCard(participantId) {
  const card = document.getElementById(`video-${participantId}`);
  if (card) {
    card.remove();
  }

  if (elements.videoGrid.children.length === 0) {
    const placeholder = document.createElement("article");
    placeholder.className = "video-card placeholder";
    placeholder.innerHTML = "<p>Waiting for participants...</p>";
    elements.videoGrid.appendChild(placeholder);
  }
}

function clearPlaceholderCard() {
  const placeholder = elements.videoGrid.querySelector(".placeholder");
  if (placeholder) {
    placeholder.remove();
  }
}

async function createLocalMedia() {
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24 },
      },
    });
  } catch {
    // Fallback to audio-only so users can still join the room.
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  }

  clearPlaceholderCard();
  createVideoCard(state.self.id, `${state.self.name} (You)`, state.localStream, true);
}

function createPeerConnection(remoteId, remoteName) {
  const existing = state.peers.get(remoteId);
  if (existing) return existing;

  const pc = new RTCPeerConnection(config);

  state.localStream.getTracks().forEach((track) => {
    pc.addTrack(track, state.localStream);
  });

  const remoteStream = new MediaStream();
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
    clearPlaceholderCard();
    createVideoCard(remoteId, remoteName, remoteStream);
  };

  pc.onicecandidate = ({ candidate }) => {
    if (!candidate || !state.ws) return;
    state.ws.send(
      JSON.stringify({
        type: "signal",
        target: remoteId,
        signal: { type: "ice", candidate },
      })
    );
  };

  state.peers.set(remoteId, { pc, remoteStream, remoteName });
  return state.peers.get(remoteId);
}

async function createOfferFor(remoteId, remoteName) {
  const peer = createPeerConnection(remoteId, remoteName);
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);

  state.ws.send(
    JSON.stringify({
      type: "signal",
      target: remoteId,
      signal: {
        type: "offer",
        sdp: offer,
      },
    })
  );
}

async function handleIncomingSignal(sender, signal) {
  const remoteId = sender.id;
  const remoteName = sender.name;
  const peer = createPeerConnection(remoteId, remoteName);

  if (signal.type === "offer") {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);

    state.ws.send(
      JSON.stringify({
        type: "signal",
        target: remoteId,
        signal: {
          type: "answer",
          sdp: answer,
        },
      })
    );
  }

  if (signal.type === "answer") {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
  }

  if (signal.type === "ice" && signal.candidate) {
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch {
      // ICE candidates can race with remote descriptions.
    }
  }
}

function closePeer(remoteId) {
  const peer = state.peers.get(remoteId);
  if (!peer) return;
  peer.pc.close();
  state.peers.delete(remoteId);
  removeVideoCard(remoteId);
}

async function joinRoom() {
  if (!navigator.mediaDevices || !window.RTCPeerConnection) {
    alert("This browser does not support WebRTC calls.");
    return;
  }

  const roomId = elements.roomInput.value.trim() || randomRoomId();
  const name = elements.nameInput.value.trim() || "Guest";
  const token = elements.tokenInput.value.trim();

  elements.roomInput.value = roomId;
  state.roomId = roomId;

  setStatus("Requesting camera and microphone...");

  try {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${proto}://${window.location.host}/ws/meeting/${encodeURIComponent(roomId)}?name=${encodeURIComponent(name)}${token ? `&token=${encodeURIComponent(token)}` : ""}`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = async () => {
      try {
        setStatus(`Connected to ${roomId}. Setting up media...`);
        await createLocalMedia();
        state.joined = true;
        updateControls();
        appendChatLine("System", `Joined room: ${roomId}`);
      } catch {
        setStatus("Could not access microphone/camera");
        appendChatLine("System", "Media permission denied. Join cancelled.");
        teardown(true);
      }
    };

    state.ws.onmessage = async (event) => {
      const payload = JSON.parse(event.data);

      if (payload.type === "room_state") {
        state.self = payload.self;
        state.participants.clear();
        upsertParticipant(payload.self);
        payload.participants.forEach((participant) => {
          upsertParticipant(participant);
        });

        setStatus(`In room ${payload.roomId} as ${payload.self.name}`);

        for (const participant of payload.participants) {
          await createOfferFor(participant.id, participant.name);
        }
      }

      if (payload.type === "participant_joined") {
        upsertParticipant(payload.participant);
        appendChatLine("System", `${payload.participant.name} joined.`);
        await createOfferFor(payload.participant.id, payload.participant.name);
      }

      if (payload.type === "participant_left") {
        removeParticipant(payload.participant.id);
        closePeer(payload.participant.id);
        appendChatLine("System", `${payload.participant.name} left.`);
      }

      if (payload.type === "signal") {
        await handleIncomingSignal(payload.from, payload.signal);
      }

      if (payload.type === "chat") {
        appendChatLine(payload.from.name, payload.text);
      }
    };

    state.ws.onclose = () => {
      if (state.joined) {
        appendChatLine("System", "Disconnected from room.");
      }
      setStatus("Disconnected");
      teardown(false);
    };

    state.ws.onerror = () => {
      setStatus("Connection error. Check URL and network.");
    };
  } catch (error) {
    setStatus("Failed to join room");
    alert(error.message || "Failed to join room.");
  }
}

function teardown(sendClose = true) {
  if (sendClose && state.ws) {
    state.ws.close();
  }

  state.peers.forEach((_, remoteId) => {
    closePeer(remoteId);
  });

  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
  }

  state.ws = null;
  state.localStream = null;
  state.joined = false;
  state.screenTrack = null;
  state.participants.clear();

  elements.videoGrid.innerHTML =
    '<article class="video-card placeholder"><p>Join a room to start your call</p></article>';
  renderParticipants();
  updateControls();
}

function leaveRoom() {
  appendChatLine("System", "Leaving room...");
  teardown(true);
  setStatus("Idle");
}

function toggleMute() {
  if (!state.localStream) return;
  const audioTrack = state.localStream.getAudioTracks()[0];
  if (!audioTrack) return;
  audioTrack.enabled = !audioTrack.enabled;
  elements.muteBtn.textContent = audioTrack.enabled ? "Mute" : "Unmute";
}

function toggleVideo() {
  if (!state.localStream) return;
  const videoTrack = state.localStream.getVideoTracks()[0];
  if (!videoTrack) return;
  videoTrack.enabled = !videoTrack.enabled;
  elements.videoBtn.textContent = videoTrack.enabled ? "Video Off" : "Video On";
}

async function toggleScreenShare() {
  if (!state.localStream) return;

  if (state.screenTrack) {
    const cameraTrack = state.localStream.getVideoTracks()[0];
    state.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
    });
    state.screenTrack.stop();
    state.screenTrack = null;
    elements.shareBtn.textContent = "Share Screen";
    return;
  }

  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const track = screenStream.getVideoTracks()[0];
    if (!track) return;

    state.peers.forEach(({ pc }) => {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) sender.replaceTrack(track);
    });

    track.onended = () => {
      if (state.screenTrack) {
        toggleScreenShare();
      }
    };

    state.screenTrack = track;
    elements.shareBtn.textContent = "Stop Share";
  } catch {
    // User may deny permission.
  }
}

function sendChat() {
  const text = elements.chatInput.value.trim();
  if (!text || !state.ws) return;

  state.ws.send(
    JSON.stringify({
      type: "chat",
      text,
    })
  );

  elements.chatInput.value = "";
}

elements.randomRoomBtn.addEventListener("click", () => {
  elements.roomInput.value = randomRoomId();
});

elements.joinBtn.addEventListener("click", joinRoom);
elements.leaveBtn.addEventListener("click", leaveRoom);
elements.muteBtn.addEventListener("click", toggleMute);
elements.videoBtn.addEventListener("click", toggleVideo);
elements.shareBtn.addEventListener("click", toggleScreenShare);
elements.sendBtn.addEventListener("click", sendChat);
elements.chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendChat();
  }
});

window.addEventListener("beforeunload", () => {
  teardown(true);
});

parseQueryDefaults();
if (!elements.roomInput.value) {
  elements.roomInput.value = randomRoomId();
}
renderParticipants();
updateControls();

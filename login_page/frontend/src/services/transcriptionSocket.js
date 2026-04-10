import { BASE_URL } from "./api";

const toWebSocketBase = (httpBaseUrl) => httpBaseUrl.replace(/^http/, "ws");

export class TranscriptionSocketClient {
  constructor({
    meetingId,
    token,
    onStatus,
    onPartialTranscript,
    onError,
    onSyncComplete,
  }) {
    this.meetingId = meetingId;
    this.token = token;
    this.onStatus = onStatus;
    this.onPartialTranscript = onPartialTranscript;
    this.onError = onError;
    this.onSyncComplete = onSyncComplete;

    this.socket = null;
    this.buffer = [];
    this.sequence = 1;
    this.reconnectTimer = null;
    this.closedManually = false;
  }

  connect() {
    if (!this.meetingId || !this.token) return;
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;

    const wsBase = toWebSocketBase(BASE_URL);
    const url = `${wsBase}/ws/transcription/${encodeURIComponent(
      this.meetingId
    )}?token=${encodeURIComponent(this.token)}`;

    this.onStatus?.("connecting");
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      this.onStatus?.("connected");
      this.flushBuffer();
    };

    this.socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "partial_transcript") {
          this.onPartialTranscript?.(payload);
        } else if (payload.type === "chunk_error") {
          this.onError?.(payload.message || "Chunk processing failed");
        } else if (payload.type === "sync_complete") {
          this.onSyncComplete?.(payload);
        } else if (payload.type === "error") {
          this.onError?.(payload.message || "Transcription websocket error");
        }
      } catch {
        this.onError?.("Failed to parse transcription message");
      }
    };

    this.socket.onerror = () => {
      this.onStatus?.("error");
    };

    this.socket.onclose = () => {
      this.socket = null;
      if (this.closedManually) {
        this.onStatus?.("closed");
        return;
      }
      this.onStatus?.("reconnecting");
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  disconnect() {
    this.closedManually = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Ignore close failures.
      }
      this.socket = null;
    }
  }

  sendChunkText(text) {
    const chunk = {
      type: "chunk",
      chunk_id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sequence: this.sequence++,
      text: text ?? "",
    };

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(chunk));
      return chunk;
    }

    this.buffer.push(chunk);
    // Offline fallback approximation: expose local partial immediately while queued.
    this.onPartialTranscript?.({
      type: "partial_transcript",
      chunk_id: chunk.chunk_id,
      sequence: chunk.sequence,
      text: chunk.text,
      duplicate: false,
      local_fallback: true,
    });
    return chunk;
  }

  flushBuffer() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (!this.buffer.length) return;

    const buffered = [...this.buffer].sort((a, b) => a.sequence - b.sequence);
    this.buffer = [];

    this.socket.send(
      JSON.stringify({
        type: "sync_buffer",
        chunks: buffered,
      })
    );
  }

  requestFullTranscript() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "get_full_transcript" }));
  }
}

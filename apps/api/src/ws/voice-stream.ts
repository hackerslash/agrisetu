import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";
import { transcribeAudioStream } from "../services/transcribe-streaming.js";
import {
  buildUnprocessableVoiceOrderResult,
  processVoiceOrderForFarmer,
} from "../services/voice-order-processing.js";
import { transcribeAudioBuffer } from "../services/transcribe.js";

const VOICE_STREAM_PATH = "/api/v1/farmer/voice/stream";
const DEFAULT_SAMPLE_RATE_HZ = 16000;
const MAX_SAMPLE_RATE_HZ = 48000;
const MIN_SAMPLE_RATE_HZ = 8000;
const MAX_CHUNK_BYTES = 16384;
const MAX_STREAM_DURATION_MS = 2 * 60 * 1000;
const MAX_BATCH_FALLBACK_AUDIO_BYTES = 12 * 1024 * 1024;
const REALTIME_SUPPORTED_LANGUAGE_CODES = new Set(["en-IN", "hi-IN"]);

const LANGUAGE_CODE_ALIASES: Record<string, string> = {
  en: "en-IN",
  "en-in": "en-IN",
  english: "en-IN",
  hi: "hi-IN",
  "hi-in": "hi-IN",
  hindi: "hi-IN",
  bn: "bn-IN",
  "bn-in": "bn-IN",
  bengali: "bn-IN",
  mr: "mr-IN",
  "mr-in": "mr-IN",
  marathi: "mr-IN",
  ta: "ta-IN",
  "ta-in": "ta-IN",
  tamil: "ta-IN",
  te: "te-IN",
  "te-in": "te-IN",
  telugu: "te-IN",
  kn: "kn-IN",
  "kn-in": "kn-IN",
  kannada: "kn-IN",
  gu: "gu-IN",
  "gu-in": "gu-IN",
  gujarati: "gu-IN",
  ml: "ml-IN",
  "ml-in": "ml-IN",
  malayalam: "ml-IN",
  pa: "pa-IN",
  "pa-in": "pa-IN",
  punjabi: "pa-IN",
  or: "or-IN",
  "or-in": "or-IN",
  odia: "or-IN",
  oriya: "or-IN",
};

type AuthedRequest = IncomingMessage & {
  voiceUser?: JwtPayload;
};

type ClientStartMessage = {
  type: "start";
  languageCode?: string;
  sampleRateHertz?: number;
  conversationSessionId?: string;
};

type ClientEndMessage = {
  type: "end";
};

type ClientCancelMessage = {
  type: "cancel";
};

type ClientPingMessage = {
  type: "ping";
};

type ClientMessage =
  | ClientStartMessage
  | ClientEndMessage
  | ClientCancelMessage
  | ClientPingMessage;

class AudioChunkQueue implements AsyncIterable<Buffer> {
  private queue: Buffer[] = [];
  private nextResolvers: Array<(value: IteratorResult<Buffer>) => void> = [];
  private ended = false;
  private streamError: Error | null = null;

  push(chunk: Buffer) {
    if (this.ended || this.streamError) return;

    if (this.nextResolvers.length > 0) {
      const resolve = this.nextResolvers.shift();
      resolve?.({ value: chunk, done: false });
      return;
    }

    this.queue.push(chunk);
  }

  end() {
    if (this.ended) return;
    this.ended = true;
    while (this.nextResolvers.length > 0) {
      const resolve = this.nextResolvers.shift();
      resolve?.({ value: undefined, done: true });
    }
  }

  fail(error: Error) {
    if (this.streamError) return;
    this.streamError = error;
    while (this.nextResolvers.length > 0) {
      const resolve = this.nextResolvers.shift();
      resolve?.({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<Buffer> {
    return {
      next: () => {
        if (this.streamError) {
          return Promise.reject(this.streamError);
        }

        if (this.queue.length > 0) {
          const value = this.queue.shift();
          return Promise.resolve({ value: value as Buffer, done: false });
        }

        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true });
        }

        return new Promise<IteratorResult<Buffer>>((resolve) => {
          this.nextResolvers.push(resolve);
        });
      },
    };
  }
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\n\r\n`,
  );
  socket.destroy();
}

function extractToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  try {
    const requestUrl = new URL(req.url ?? "", "http://localhost");
    const queryToken = requestUrl.searchParams.get("token")?.trim();
    return queryToken || null;
  } catch {
    return null;
  }
}

function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const type = (parsed as { type?: unknown }).type;
    if (type === "start") {
      return {
        type,
        languageCode:
          typeof (parsed as { languageCode?: unknown }).languageCode === "string"
            ? (parsed as { languageCode: string }).languageCode
            : undefined,
        sampleRateHertz:
          typeof (parsed as { sampleRateHertz?: unknown }).sampleRateHertz ===
          "number"
            ? (parsed as { sampleRateHertz: number }).sampleRateHertz
            : undefined,
        conversationSessionId:
          typeof (parsed as { conversationSessionId?: unknown })
            .conversationSessionId === "string"
            ? (parsed as { conversationSessionId: string }).conversationSessionId
            : undefined,
      };
    }

    if (type === "end" || type === "cancel" || type === "ping") {
      return { type } as ClientMessage;
    }

    return null;
  } catch {
    return null;
  }
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  throw new Error("Unsupported websocket payload format.");
}

function validateSampleRate(sampleRate?: number) {
  if (sampleRate == null) return DEFAULT_SAMPLE_RATE_HZ;
  if (!Number.isFinite(sampleRate) || !Number.isInteger(sampleRate)) {
    throw new Error("sampleRateHertz must be an integer.");
  }
  if (sampleRate < MIN_SAMPLE_RATE_HZ || sampleRate > MAX_SAMPLE_RATE_HZ) {
    throw new Error(
      `sampleRateHertz must be between ${MIN_SAMPLE_RATE_HZ} and ${MAX_SAMPLE_RATE_HZ}.`,
    );
  }
  return sampleRate;
}

function normalizeLanguageHint(input?: string) {
  if (!input) return null;
  const normalized = input.trim().toLowerCase().replace(/_/g, "-");
  return LANGUAGE_CODE_ALIASES[normalized] ?? null;
}

function normalizeConversationSessionId(input?: string) {
  if (!input) return null;
  const normalized = input.trim();
  if (!normalized) return null;
  if (normalized.length > 120) {
    throw new Error("conversationSessionId is too long.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error(
      "conversationSessionId can only include letters, numbers, underscores, and dashes.",
    );
  }
  return normalized;
}

function pcm16MonoToWavBuffer(pcm: Buffer, sampleRateHertz: number) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRateHertz * blockAlign;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRateHertz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

function setupVoiceConnection(ws: WebSocket, req: AuthedRequest) {
  const farmerId = req.voiceUser?.id;
  if (!farmerId) {
    sendJson(ws, { type: "error", message: "Unauthorized" });
    ws.close(1008, "unauthorized");
    return;
  }

  let started = false;
  let finished = false;
  let mode: "streaming" | "batch" = "streaming";
  let queue: AudioChunkQueue | null = null;
  let streamTimeout: NodeJS.Timeout | null = null;
  let sampleRateHertz = DEFAULT_SAMPLE_RATE_HZ;
  let languageHintCode: string | null = null;
  let conversationSessionId: string | null = null;
  let latestTranscript = "";
  let latestDetectedLanguageCode: string | null = null;
  const capturedChunks: Buffer[] = [];
  let capturedBytes = 0;
  let endSignalResolve: (() => void) | null = null;
  const endSignal = new Promise<void>((resolve) => {
    endSignalResolve = resolve;
  });

  const closeTimeout = () => {
    if (!streamTimeout) return;
    clearTimeout(streamTimeout);
    streamTimeout = null;
  };

  const failSession = (message: string) => {
    if (finished) return;
    finished = true;
    queue?.fail(new Error(message));
    endSignalResolve?.();
    sendJson(ws, { type: "error", message });
    ws.close(1011, "voice_stream_error");
    closeTimeout();
  };

  const startStream = (message: ClientStartMessage) => {
    if (started) {
      failSession("Voice stream already started.");
      return;
    }

    try {
      sampleRateHertz = validateSampleRate(message.sampleRateHertz);
      conversationSessionId = normalizeConversationSessionId(
        message.conversationSessionId,
      );
    } catch (err) {
      failSession(err instanceof Error ? err.message : "Invalid stream config");
      return;
    }
    languageHintCode = normalizeLanguageHint(message.languageCode);
    mode =
      languageHintCode && !REALTIME_SUPPORTED_LANGUAGE_CODES.has(languageHintCode)
        ? "batch"
        : "streaming";

    started = true;
    if (mode === "streaming") {
      queue = new AudioChunkQueue();
    }

    sendJson(ws, {
      type: "ready",
      sampleRateHertz,
      mediaEncoding: mode === "streaming" ? "pcm" : "pcm_batch",
      mode,
      languageHintCode,
      conversationSessionId,
    });

    streamTimeout = setTimeout(() => {
      failSession("Voice stream timed out. Please try again.");
    }, MAX_STREAM_DURATION_MS);

    void (async () => {
      const processCapturedBatchAudio = async () => {
        if (capturedBytes === 0 || capturedChunks.length === 0) {
          return null;
        }
        logger.info("[voice-stream] processing captured batch audio", {
          farmerId,
          capturedBytes,
        });

        const pcm = Buffer.concat(capturedChunks);
        const wavBuffer = pcm16MonoToWavBuffer(pcm, sampleRateHertz);
        const transcribed = await transcribeAudioBuffer({
          audioBuffer: wavBuffer,
          fileName: "voice-stream.wav",
          mimeType: "audio/wav",
          languageCode: languageHintCode ?? message.languageCode,
        });
        latestTranscript = transcribed.transcript;
        latestDetectedLanguageCode = transcribed.detectedLanguageCode;

        return processVoiceOrderForFarmer({
          farmerId,
          transcript: transcribed.transcript,
          transcribedFromAudio: true,
          languageCode: languageHintCode ?? message.languageCode ?? null,
          detectedLanguageCode: transcribed.detectedLanguageCode,
          conversationSessionId,
        });
      };

      try {
        if (mode === "batch") {
          sendJson(ws, {
            type: "processing",
            phase: "batch_fallback",
            reason: "language_not_supported_realtime",
            languageHintCode,
          });
          await endSignal;
          const batchResult = await processCapturedBatchAudio();
          if (!batchResult) {
            const unprocessable = buildUnprocessableVoiceOrderResult({
              transcript: latestTranscript,
              transcribedFromAudio: true,
              detectedLanguageCode:
                latestDetectedLanguageCode ?? languageHintCode,
              languageCode: languageHintCode ?? message.languageCode ?? null,
            });
            finished = true;
            sendJson(ws, {
              type: "final_result",
              data: unprocessable,
            });
            closeTimeout();
            ws.close(1000, "completed_with_unprocessable_result");
            return;
          }
          finished = true;
          sendJson(ws, {
            type: "final_result",
            data: batchResult,
          });
          closeTimeout();
          ws.close(1000, "completed_with_batch_mode");
          return;
        }

        const transcribed = await transcribeAudioStream({
          audioChunks: queue as AudioChunkQueue,
          mediaEncoding: "pcm",
          sampleRateHertz,
          languageCode: languageHintCode ?? message.languageCode,
          onTranscriptUpdate: (event) => {
            sendJson(ws, {
              type: "transcript",
              transcript: event.transcript,
              isPartial: event.isPartial,
              detectedLanguageCode: event.detectedLanguageCode,
            });
            latestTranscript = event.transcript;
            latestDetectedLanguageCode = event.detectedLanguageCode;
          },
        });
        latestTranscript = transcribed.transcript;
        latestDetectedLanguageCode = transcribed.detectedLanguageCode;

        sendJson(ws, {
          type: "processing",
          transcript: transcribed.transcript,
          detectedLanguageCode: transcribed.detectedLanguageCode,
        });

        const result = await processVoiceOrderForFarmer({
          farmerId,
          transcript: transcribed.transcript,
          transcribedFromAudio: true,
          languageCode: languageHintCode ?? message.languageCode ?? null,
          detectedLanguageCode: transcribed.detectedLanguageCode,
          conversationSessionId,
        });

        finished = true;
        sendJson(ws, {
          type: "final_result",
          data: result,
        });
        closeTimeout();
        ws.close(1000, "completed");
      } catch (err) {
        logger.warn("[voice-stream] processing failure", {
          farmerId,
          err,
        });
        const unprocessable = buildUnprocessableVoiceOrderResult({
          transcript: latestTranscript,
          transcribedFromAudio: true,
          detectedLanguageCode: latestDetectedLanguageCode ?? languageHintCode,
          languageCode: languageHintCode ?? message.languageCode ?? null,
        });
        finished = true;
        sendJson(ws, {
          type: "final_result",
          data: unprocessable,
        });
        closeTimeout();
        ws.close(1000, "completed_with_unprocessable_result");
      }
    })();
  };

  ws.on("message", (data, isBinary) => {
    if (finished) return;

    if (isBinary) {
      if (!started) {
        failSession("Send a start message before audio chunks.");
        return;
      }

      const chunk = toBuffer(data);
      if (chunk.length === 0) return;
      if (chunk.length > MAX_CHUNK_BYTES) {
        failSession(
          `Audio chunk is too large. Max per frame is ${MAX_CHUNK_BYTES} bytes.`,
        );
        return;
      }
      if (capturedBytes < MAX_BATCH_FALLBACK_AUDIO_BYTES) {
        const remaining = MAX_BATCH_FALLBACK_AUDIO_BYTES - capturedBytes;
        const part = remaining >= chunk.length ? chunk : chunk.subarray(0, remaining);
        capturedChunks.push(part);
        capturedBytes += part.length;
      }
      if (mode === "streaming") {
        if (!queue) {
          failSession("Streaming queue is not initialized.");
          return;
        }
        queue.push(chunk);
      }
      return;
    }

    const message = parseClientMessage(data.toString());
    if (!message) {
      failSession("Invalid message format.");
      return;
    }

    if (message.type === "ping") {
      sendJson(ws, { type: "pong", timestamp: Date.now() });
      return;
    }

    if (message.type === "start") {
      startStream(message);
      return;
    }

    if (message.type === "cancel") {
      failSession("Voice stream cancelled.");
      return;
    }

    if (message.type === "end") {
      if (!started) {
        failSession("Stream has not started.");
        return;
      }
      if (mode === "streaming") {
        queue?.end();
      } else {
        endSignalResolve?.();
      }
      return;
    }
  });

  ws.on("close", () => {
    queue?.end();
    endSignalResolve?.();
    closeTimeout();
  });

  ws.on("error", (err) => {
    logger.warn("[voice-stream] websocket error", { farmerId, err });
    queue?.fail(new Error("WebSocket closed unexpectedly."));
    endSignalResolve?.();
    closeTimeout();
  });
}

export function attachVoiceStreamServer(wss: WebSocketServer) {
  wss.on("connection", (ws, req) => {
    setupVoiceConnection(ws, req as AuthedRequest);
  });
}

export function handleVoiceStreamUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
): boolean {
  let pathname = "";
  try {
    pathname = new URL(req.url ?? "", "http://localhost").pathname;
  } catch {
    pathname = "";
  }

  if (pathname !== VOICE_STREAM_PATH) {
    return false;
  }

  const token = extractToken(req);
  if (!token) {
    rejectUpgrade(socket, 401, "Unauthorized");
    return true;
  }

  let payload: JwtPayload;
  try {
    payload = verifyToken(token);
  } catch {
    rejectUpgrade(socket, 401, "Unauthorized");
    return true;
  }

  if (payload.role !== "farmer") {
    rejectUpgrade(socket, 403, "Forbidden");
    return true;
  }

  (req as AuthedRequest).voiceUser = payload;

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });

  return true;
}

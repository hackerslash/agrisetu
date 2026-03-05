import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
  type LanguageCode,
  type MediaEncoding,
} from "@aws-sdk/client-transcribe-streaming";
import { logger } from "../lib/logger.js";

const DEFAULT_REGION = "ap-south-1";
const DEFAULT_PCM_SAMPLE_RATE = 16000;
const PCM_CHUNK_BYTES = 3200;

const AWS_LANGUAGE_OPTIONS: LanguageCode[] = [
  "en-IN",
  "hi-IN",
];

const SUPPORTED_LANGUAGE_CODES: Record<string, LanguageCode> = {
  "en-in": "en-IN",
  "hi-in": "hi-IN",
};

type AwsConfig = {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

export type StreamingTranscribeResult = {
  transcript: string;
  detectedLanguageCode: string | null;
};

export type StreamTranscribeParams = {
  audioChunks: AsyncIterable<Uint8Array | Buffer>;
  mediaEncoding: MediaEncoding;
  sampleRateHertz: number;
  languageCode?: string;
  onTranscriptUpdate?: (event: {
    transcript: string;
    isPartial: boolean;
    detectedLanguageCode: string | null;
  }) => void;
};

function getAwsConfig(): AwsConfig {
  const region = process.env.AWS_REGION?.trim() || DEFAULT_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither.",
    );
  }

  if (accessKeyId && secretAccessKey) {
    return {
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    };
  }

  return { region };
}

function resolveLanguageCode(input?: string): LanguageCode | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase().replace(/_/g, "-");
  return SUPPORTED_LANGUAGE_CODES[normalized] ?? null;
}

function concatTranscript(parts: string[]) {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeRawChunk(chunk: Uint8Array | Buffer) {
  if (Buffer.isBuffer(chunk)) return chunk;
  return Buffer.from(chunk);
}

async function* toAudioEventStream(chunks: AsyncIterable<Uint8Array | Buffer>) {
  for await (const chunk of chunks) {
    const normalized = normalizeRawChunk(chunk);
    if (normalized.length === 0) continue;
    yield {
      AudioEvent: {
        AudioChunk: normalized,
      },
    };
  }
}

export async function transcribeAudioStream(
  params: StreamTranscribeParams,
): Promise<StreamingTranscribeResult> {
  const aws = getAwsConfig();
  const languageCode = resolveLanguageCode(params.languageCode);
  if (params.languageCode && !languageCode) {
    logger.warn("[transcribe-streaming] unsupported language hint; using auto-detect", {
      languageCode: params.languageCode,
    });
  }
  const transcribe = new TranscribeStreamingClient({
    region: aws.region,
    credentials: aws.credentials,
  });

  const command = new StartStreamTranscriptionCommand({
    MediaEncoding: params.mediaEncoding,
    MediaSampleRateHertz: params.sampleRateHertz,
    AudioStream: toAudioEventStream(params.audioChunks),
    EnablePartialResultsStabilization: true,
    PartialResultsStability: "medium",
    ...(languageCode
      ? {
          LanguageCode: languageCode,
        }
      : {
          IdentifyLanguage: true,
          LanguageOptions: AWS_LANGUAGE_OPTIONS.join(","),
          PreferredLanguage: "en-IN",
        }),
  });

  const response = await transcribe.send(command);
  const resultStream = response.TranscriptResultStream;

  if (!resultStream) {
    throw new Error("Transcription stream failed to initialize");
  }

  let detectedLanguageCode: string | null = languageCode ?? null;
  const finalizedSegments: string[] = [];
  let lastPartialSegment = "";
  const seenResultIds = new Set<string>();

  try {
    for await (const event of resultStream) {
      const transcriptEvent = event.TranscriptEvent;
      const results = transcriptEvent?.Transcript?.Results ?? [];

      for (const result of results) {
        const best = result.Alternatives?.[0]?.Transcript?.trim() ?? "";
        if (!best) continue;

        const resultLanguage =
          result.LanguageCode ??
          result.LanguageIdentification?.[0]?.LanguageCode ??
          detectedLanguageCode;
        detectedLanguageCode = resultLanguage ?? detectedLanguageCode;

        if (result.IsPartial) {
          lastPartialSegment = best;
          params.onTranscriptUpdate?.({
            transcript: concatTranscript([...finalizedSegments, best]),
            isPartial: true,
            detectedLanguageCode,
          });
          continue;
        }

        const resultId =
          result.ResultId ??
          `${result.StartTime ?? ""}-${result.EndTime ?? ""}-${best}`;
        if (seenResultIds.has(resultId)) continue;

        seenResultIds.add(resultId);
        finalizedSegments.push(best);
        lastPartialSegment = "";
        params.onTranscriptUpdate?.({
          transcript: concatTranscript(finalizedSegments),
          isPartial: false,
          detectedLanguageCode,
        });
      }
    }
  } finally {
    transcribe.destroy();
  }

  const transcript = concatTranscript(
    lastPartialSegment
      ? [...finalizedSegments, lastPartialSegment]
      : finalizedSegments,
  );

  if (!transcript) {
    throw new Error("Speech not detected. Please speak clearly and retry.");
  }

  return {
    transcript,
    detectedLanguageCode,
  };
}

async function* bufferToChunks(buffer: Buffer, chunkBytes: number) {
  let offset = 0;
  while (offset < buffer.length) {
    const next = Math.min(offset + chunkBytes, buffer.length);
    yield buffer.subarray(offset, next);
    offset = next;
  }
}

type ParsedWavPcm = {
  pcm: Buffer;
  sampleRateHertz: number;
};

function parseWavPcm16(buffer: Buffer): ParsedWavPcm | null {
  if (buffer.length < 44) return null;
  if (buffer.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buffer.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let audioFormat = 0;
  let bitsPerSample = 0;
  let sampleRateHertz = DEFAULT_PCM_SAMPLE_RATE;
  let dataOffset = 0;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;

    if (chunkEnd > buffer.length) break;

    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = buffer.readUInt16LE(chunkStart);
      sampleRateHertz = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    }

    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataLength = chunkSize;
      break;
    }

    offset = chunkEnd + (chunkSize % 2 === 1 ? 1 : 0);
  }

  if (!dataOffset || dataLength <= 0) return null;
  if (audioFormat !== 1 || bitsPerSample !== 16) {
    throw new Error(
      "Only 16-bit PCM WAV audio is supported for streaming transcription.",
    );
  }

  return {
    pcm: buffer.subarray(dataOffset, dataOffset + dataLength),
    sampleRateHertz,
  };
}

function resolveUploadedAudioFormat(params: {
  fileName?: string;
  mimeType?: string;
}): "pcm" | "flac" | "ogg-opus" | "wav" | "unsupported" {
  const lowerName = (params.fileName ?? "").toLowerCase();
  const lowerMime = (params.mimeType ?? "").toLowerCase();

  if (
    lowerName.endsWith(".wav") ||
    lowerMime.includes("audio/wav") ||
    lowerMime.includes("audio/x-wav")
  ) {
    return "wav";
  }

  if (lowerName.endsWith(".pcm") || lowerMime.includes("audio/pcm")) {
    return "pcm";
  }

  if (lowerName.endsWith(".flac") || lowerMime.includes("audio/flac")) {
    return "flac";
  }

  if (lowerName.endsWith(".ogg") || lowerMime.includes("audio/ogg")) {
    return "ogg-opus";
  }

  return "unsupported";
}

export async function transcribeAudioBufferStreaming(params: {
  audioBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
  languageCode?: string;
}): Promise<StreamingTranscribeResult> {
  if (!params.audioBuffer || params.audioBuffer.length === 0) {
    throw new Error("Audio payload is empty");
  }

  const format = resolveUploadedAudioFormat({
    fileName: params.fileName,
    mimeType: params.mimeType,
  });

  if (format === "unsupported") {
    logger.warn("[transcribe-streaming] unsupported uploaded audio format", {
      fileName: params.fileName,
      mimeType: params.mimeType,
    });
    throw new Error(
      "Unsupported audio format. Please record in WAV (PCM16), PCM, OGG, or FLAC.",
    );
  }

  if (format === "wav") {
    const parsed = parseWavPcm16(params.audioBuffer);
    if (!parsed || parsed.pcm.length === 0) {
      throw new Error("Invalid WAV payload. Could not decode PCM audio stream.");
    }

    return transcribeAudioStream({
      audioChunks: bufferToChunks(parsed.pcm, PCM_CHUNK_BYTES),
      mediaEncoding: "pcm",
      sampleRateHertz: parsed.sampleRateHertz,
      languageCode: params.languageCode,
    });
  }

  return transcribeAudioStream({
    audioChunks: bufferToChunks(params.audioBuffer, PCM_CHUNK_BYTES),
    mediaEncoding: format,
    sampleRateHertz: DEFAULT_PCM_SAMPLE_RATE,
    languageCode: params.languageCode,
  });
}

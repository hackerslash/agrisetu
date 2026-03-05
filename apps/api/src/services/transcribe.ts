import crypto from "crypto";
import {
  DeleteTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  type LanguageCode,
  StartTranscriptionJobCommand,
  type StartTranscriptionJobCommandInput,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_REGION = "ap-south-1";
const POLL_INTERVAL_MS = 500;
const MAX_POLLS = 180;

const AWS_LANGUAGE_OPTIONS: LanguageCode[] = [
  "en-IN",
  "hi-IN",
  "gu-IN",
  "ml-IN",
  "mr-IN",
  "or-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
  "bn-IN",
  "kn-IN",
];

type AwsConfig = {
  region: string;
  bucket: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

const SUPPORTED_LANGUAGE_CODES: Record<string, LanguageCode> = {
  "en-in": "en-IN",
  "hi-in": "hi-IN",
  "gu-in": "gu-IN",
  "ml-in": "ml-IN",
  "mr-in": "mr-IN",
  "or-in": "or-IN",
  "pa-in": "pa-IN",
  "ta-in": "ta-IN",
  "te-in": "te-IN",
  "bn-in": "bn-IN",
  "kn-in": "kn-IN",
  gujarati: "gu-IN",
  malayalam: "ml-IN",
  marathi: "mr-IN",
  odia: "or-IN",
  oriya: "or-IN",
  punjabi: "pa-IN",
  tamil: "ta-IN",
  telugu: "te-IN",
  bengali: "bn-IN",
  kannada: "kn-IN",
  hindi: "hi-IN",
  english: "en-IN",
};

export type TranscribeResult = {
  transcript: string;
  detectedLanguageCode: string | null;
  jobName: string;
};

function resolveLanguageCode(input?: string): LanguageCode | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  return SUPPORTED_LANGUAGE_CODES[normalized] ?? null;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAwsConfig(): AwsConfig {
  const region = process.env.AWS_REGION?.trim() || DEFAULT_REGION;
  const bucket = process.env.AWS_TRANSCRIBE_BUCKET?.trim();

  if (!bucket) {
    throw new Error(
      "AWS transcribe bucket is not configured. Set AWS_TRANSCRIBE_BUCKET.",
    );
  }

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
      bucket,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    };
  }

  return { region, bucket };
}

function resolveMediaFormat(params: {
  fileName?: string;
  mimeType?: string;
}): "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm" {
  const lowerName = (params.fileName ?? "").toLowerCase();
  const lowerMime = (params.mimeType ?? "").toLowerCase();

  if (lowerName.endsWith(".wav") || lowerMime.includes("wav")) return "wav";
  if (lowerName.endsWith(".flac") || lowerMime.includes("flac")) return "flac";
  if (lowerName.endsWith(".ogg") || lowerMime.includes("ogg")) return "ogg";
  if (lowerName.endsWith(".amr") || lowerMime.includes("amr")) return "amr";
  if (lowerName.endsWith(".webm") || lowerMime.includes("webm")) return "webm";
  if (lowerName.endsWith(".mp3") || lowerMime.includes("mp3")) return "mp3";
  return "mp4";
}

function resolveContentType(mediaFormat: string) {
  switch (mediaFormat) {
    case "wav":
      return "audio/wav";
    case "flac":
      return "audio/flac";
    case "ogg":
      return "audio/ogg";
    case "amr":
      return "audio/amr";
    case "webm":
      return "audio/webm";
    case "mp3":
      return "audio/mpeg";
    case "mp4":
    default:
      return "audio/mp4";
  }
}

function extensionForFormat(mediaFormat: string) {
  switch (mediaFormat) {
    case "wav":
      return "wav";
    case "flac":
      return "flac";
    case "ogg":
      return "ogg";
    case "amr":
      return "amr";
    case "webm":
      return "webm";
    case "mp3":
      return "mp3";
    case "mp4":
    default:
      return "m4a";
  }
}

export async function transcribeAudioBuffer(params: {
  audioBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
  languageCode?: string;
}): Promise<TranscribeResult> {
  if (!params.audioBuffer || params.audioBuffer.length === 0) {
    throw new Error("Audio payload is empty");
  }

  const aws = getAwsConfig();
  const mediaFormat = resolveMediaFormat({
    fileName: params.fileName,
    mimeType: params.mimeType,
  });
  const languageCode = resolveLanguageCode(params.languageCode);
  const extension = extensionForFormat(mediaFormat);
  const random = crypto.randomBytes(6).toString("hex");
  const timestamp = Date.now();
  const objectKey = `voice-orders/input/${timestamp}-${random}.${extension}`;
  const jobName = `agrisetu-voice-${timestamp}-${random}`;

  const s3 = new S3Client({
    region: aws.region,
    credentials: aws.credentials,
  });
  const transcribe = new TranscribeClient({
    region: aws.region,
    credentials: aws.credentials,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: aws.bucket,
      Key: objectKey,
      Body: params.audioBuffer,
      ContentType: resolveContentType(mediaFormat),
    }),
  );

  let uploaded = true;
  try {
    const startInput: StartTranscriptionJobCommandInput = languageCode
      ? {
          TranscriptionJobName: jobName,
          Media: {
            MediaFileUri: `s3://${aws.bucket}/${objectKey}`,
          },
          MediaFormat: mediaFormat,
          LanguageCode: languageCode,
        }
      : {
          TranscriptionJobName: jobName,
          Media: {
            MediaFileUri: `s3://${aws.bucket}/${objectKey}`,
          },
          MediaFormat: mediaFormat,
          IdentifyLanguage: true,
          LanguageOptions: AWS_LANGUAGE_OPTIONS,
        };

    await transcribe.send(new StartTranscriptionJobCommand(startInput));

    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const statusRes = await transcribe.send(
        new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }),
      );
      const job = statusRes.TranscriptionJob;
      if (!job) {
        throw new Error("Transcription job not found");
      }
      const status = job?.TranscriptionJobStatus;

      if (status === "COMPLETED") {
        const transcriptUri = job.Transcript?.TranscriptFileUri;
        if (!transcriptUri) {
          throw new Error("Transcription completed without transcript URI");
        }
        const transcriptResp = await fetch(transcriptUri);
        if (!transcriptResp.ok) {
          throw new Error("Unable to download transcription output");
        }
        const transcriptData = (await transcriptResp.json()) as {
          results?: { transcripts?: Array<{ transcript?: string }> };
        };
        const transcriptText =
          transcriptData.results?.transcripts?.[0]?.transcript?.trim() ?? "";
        if (!transcriptText) {
          throw new Error("Speech not detected. Please speak clearly and retry.");
        }
        return {
          transcript: transcriptText,
          detectedLanguageCode: job.LanguageCode ?? languageCode ?? null,
          jobName,
        };
      }

      if (status === "FAILED") {
        throw new Error(
          job?.FailureReason ??
            "Transcription failed. Please retry with a clearer recording.",
        );
      }

      await wait(POLL_INTERVAL_MS);
    }

    throw new Error("Transcription timed out. Please try a shorter recording.");
  } finally {
    if (uploaded) {
      await s3
        .send(
          new DeleteObjectCommand({
            Bucket: aws.bucket,
            Key: objectKey,
          }),
        )
        .catch(() => null);
    }
    await transcribe
      .send(
        new DeleteTranscriptionJobCommand({
          TranscriptionJobName: jobName,
        }),
      )
      .catch(() => null);
  }
}

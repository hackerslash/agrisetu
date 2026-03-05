import {
  DescribeVoicesCommand,
  PollyClient,
  SynthesizeSpeechCommand,
  type Voice,
} from "@aws-sdk/client-polly";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";
import { logger } from "../lib/logger.js";

const DEFAULT_REGION = "ap-south-1";
const DEFAULT_LANGUAGE_CODE = "en-IN";

const LANGUAGE_CODE_ALIASES: Record<string, string> = {
  en: "en-IN",
  "en-in": "en-IN",
  english: "en-IN",
  hi: "hi-IN",
  "hi-in": "hi-IN",
  hindi: "hi-IN",
  mr: "mr-IN",
  "mr-in": "mr-IN",
  marathi: "mr-IN",
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
  ta: "ta-IN",
  "ta-in": "ta-IN",
  tamil: "ta-IN",
  te: "te-IN",
  "te-in": "te-IN",
  telugu: "te-IN",
  bn: "bn-IN",
  "bn-in": "bn-IN",
  bengali: "bn-IN",
  kn: "kn-IN",
  "kn-in": "kn-IN",
  kannada: "kn-IN",
};

const TRANSLATE_LANGUAGE_CODES: Record<string, string> = {
  "en-IN": "en",
  "hi-IN": "hi",
  "mr-IN": "mr",
  "gu-IN": "gu",
  "ml-IN": "ml",
  "pa-IN": "pa",
  "or-IN": "or",
  "ta-IN": "ta",
  "te-IN": "te",
  "bn-IN": "bn",
  "kn-IN": "kn",
};

type AwsConfig = {
  region: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

export type ClarificationSpeechResult = {
  languageCode: string;
  localizedQuestion: string;
  audioBase64: string;
  mimeType: string;
};

const voiceCache = new Map<string, Voice>();

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

function normalizeLanguageCode(input?: string | null) {
  if (!input) return DEFAULT_LANGUAGE_CODE;
  const normalized = input.trim().toLowerCase().replace(/_/g, "-");
  return LANGUAGE_CODE_ALIASES[normalized] ?? DEFAULT_LANGUAGE_CODE;
}

function pickPreferredVoice(voices: Voice[]) {
  const neuralVoice = voices.find((voice) =>
    (voice.SupportedEngines ?? []).includes("neural"),
  );
  if (neuralVoice) return neuralVoice;
  return voices[0] ?? null;
}

async function resolveVoiceForLanguage(polly: PollyClient, languageCode: string) {
  const cached = voiceCache.get(languageCode);
  if (cached?.Id) return cached;

  const describe = await polly.send(new DescribeVoicesCommand({}));
  const voices = describe.Voices ?? [];
  const normalizedTarget = languageCode.toLowerCase();
  const languagePrefix = normalizedTarget.split("-")[0];

  const exactMatches = voices.filter(
    (voice) => voice.LanguageCode?.toLowerCase() === normalizedTarget && voice.Id,
  );
  const prefixMatches = voices.filter(
    (voice) =>
      voice.LanguageCode?.toLowerCase().startsWith(`${languagePrefix}-`) && voice.Id,
  );
  const englishIndiaMatches = voices.filter(
    (voice) => voice.LanguageCode?.toLowerCase() === "en-in" && voice.Id,
  );
  const fallbackEnglish = voices.filter(
    (voice) => voice.LanguageCode?.toLowerCase().startsWith("en-") && voice.Id,
  );

  const selected =
    pickPreferredVoice(exactMatches) ??
    pickPreferredVoice(prefixMatches) ??
    pickPreferredVoice(englishIndiaMatches) ??
    pickPreferredVoice(fallbackEnglish);

  if (!selected?.Id) return null;
  voiceCache.set(languageCode, selected);
  return selected;
}

async function audioStreamToBuffer(audioStream: unknown) {
  if (!audioStream) {
    throw new Error("Polly returned empty audio stream");
  }

  if (
    typeof audioStream === "object" &&
    audioStream !== null &&
    "transformToByteArray" in audioStream &&
    typeof (audioStream as { transformToByteArray?: unknown }).transformToByteArray ===
      "function"
  ) {
    const bytes = await (
      audioStream as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (audioStream instanceof Uint8Array) {
    return Buffer.from(audioStream);
  }

  if (typeof audioStream === "string") {
    return Buffer.from(audioStream);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of audioStream as AsyncIterable<Uint8Array | string | Buffer>) {
    if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk));
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  if (chunks.length === 0) {
    throw new Error("Polly returned no audio chunks");
  }

  return Buffer.concat(chunks);
}

export async function buildLocalizedClarificationSpeech(params: {
  question: string;
  languageHint?: string | null;
}): Promise<ClarificationSpeechResult | null> {
  const question = params.question.trim();
  if (!question) return null;

  const languageCode = normalizeLanguageCode(params.languageHint);
  const translateTarget = TRANSLATE_LANGUAGE_CODES[languageCode] ?? "en";
  const aws = getAwsConfig();

  const translate = new TranslateClient({
    region: aws.region,
    credentials: aws.credentials,
  });
  const polly = new PollyClient({
    region: aws.region,
    credentials: aws.credentials,
  });

  let localizedQuestion = question;
  if (translateTarget !== "en") {
    try {
      const translated = await translate.send(
        new TranslateTextCommand({
          SourceLanguageCode: "en",
          TargetLanguageCode: translateTarget,
          Text: question,
        }),
      );
      localizedQuestion = translated.TranslatedText?.trim() || question;
    } catch (err) {
      logger.warn("[clarification-speech] translate failed, using source question", {
        languageCode,
        err,
      });
    }
  }

  try {
    const voice = await resolveVoiceForLanguage(polly, languageCode);
    if (!voice?.Id) {
      throw new Error(`No Polly voice found for ${languageCode}`);
    }

    const engine = (voice.SupportedEngines ?? []).includes("neural")
      ? "neural"
      : "standard";

    const speech = await polly.send(
      new SynthesizeSpeechCommand({
        Text: localizedQuestion,
        OutputFormat: "mp3",
        VoiceId: voice.Id,
        Engine: engine,
      }),
    );
    const audioBuffer = await audioStreamToBuffer(speech.AudioStream);

    return {
      languageCode,
      localizedQuestion,
      audioBase64: audioBuffer.toString("base64"),
      mimeType: "audio/mpeg",
    };
  } catch (err) {
    logger.warn("[clarification-speech] polly synthesis failed", {
      languageCode,
      err,
    });
    return null;
  }
}

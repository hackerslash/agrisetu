import { readFileSync } from "fs";
import { join } from "path";
import { callManifestAI } from "../lib/manifest-ai.js";
import { logger } from "../lib/logger.js";

export type VoiceAssistantIntent =
  | "PLACE_ORDER"
  | "TRACK_ORDERS"
  | "PENDING_PAYMENTS"
  | "CLUSTER_STATUS"
  | "VOTING_STATUS"
  | "UPDATE_PROFILE"
  | "GENERAL_QUESTION"
  | "UNKNOWN";

export type VoiceOrderExtraction = {
  product: string | null;
  quantity: number | null;
  unit: string | null;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  source: "model" | "fallback";
};

export type VoiceAssistantExtraction = {
  intent: VoiceAssistantIntent;
  intentConfidence: number;
  assistantMessage: string | null;
  extraction: VoiceOrderExtraction;
};

export type VoiceOrderDraft = {
  product?: string | null;
  quantity?: number | null;
  unit?: string | null;
};

const SUPPORTED_UNITS = ["kg", "quintal", "ton", "bag", "litre"] as const;

const FALLBACK_PROCESSING_MESSAGE =
  "I could not process this request. Please repeat your order with product, quantity, and unit.";

const ASSISTANT_INTENTS: VoiceAssistantIntent[] = [
  "PLACE_ORDER",
  "TRACK_ORDERS",
  "PENDING_PAYMENTS",
  "CLUSTER_STATUS",
  "VOTING_STATUS",
  "UPDATE_PROFILE",
  "GENERAL_QUESTION",
  "UNKNOWN",
];

let staticKbContext = "";
try {
  staticKbContext = readFileSync(
    join(__dirname, "../../knowledgebase", "farmer_voice_assistant_guide.md"),
    "utf-8",
  );
} catch {
  console.warn("[ai-order-parser] Could not load local knowledge base guide.");
}

function normalizeTextForMatch(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function logAiJson(label: string, payload: unknown) {
  try {
    console.log(`[ai-order-parser] ${label}: ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[ai-order-parser] ${label}:`, payload);
  }
}

function clampConfidence(input: unknown, fallback = 0.4) {
  if (typeof input !== "number" || Number.isNaN(input)) return fallback;
  return Math.max(0, Math.min(1, input));
}

function normalizeUnit(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const key = input.trim().toLowerCase();
  return SUPPORTED_UNITS.includes(key as never) ? key : null;
}

function sanitizeProduct(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  return value.length > 0 ? value : null;
}

function coerceQuantity(input: unknown): number | null {
  if (typeof input === "number" && input > 0) return input;
  if (typeof input === "string") {
    const parsed = Number.parseFloat(input.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function extractJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    const first = content.indexOf("{");
    const last = content.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) return null;

    try {
      const parsed = JSON.parse(content.slice(first, last + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
}

function buildClarificationQuestion(params: {
  product: string | null;
  quantity: number | null;
  unit: string | null;
}) {
  const missingProduct = !params.product;
  const missingQuantity = !params.quantity;
  const missingUnit = !params.unit;

  if (!missingProduct && !missingQuantity && !missingUnit) return null;
  if (missingProduct && missingQuantity && missingUnit) {
    return "Which product do you need, and what quantity in which unit?";
  }
  if (missingProduct && missingQuantity) {
    return "Which product do you need, and how much quantity?";
  }
  if (missingProduct && missingUnit) {
    return "Which product do you need, and what unit should we use?";
  }
  if (missingQuantity && missingUnit) {
    return "How much do you need, and in which unit (kg, quintal, ton, bag, litre)?";
  }
  if (missingProduct) return "Which product do you need?";
  if (missingQuantity) return "How much quantity do you need?";
  return "Please confirm the unit (kg, quintal, ton, bag, or litre).";
}

function buildOrderFallbackExtraction(): VoiceOrderExtraction {
  return {
    product: null,
    quantity: null,
    unit: null,
    confidence: 0,
    needsClarification: true,
    clarificationQuestion: FALLBACK_PROCESSING_MESSAGE,
    source: "fallback",
  };
}

function buildNonOrderExtraction(
  source: "model" | "fallback",
): VoiceOrderExtraction {
  return {
    product: null,
    quantity: null,
    unit: null,
    confidence: source === "model" ? 0.72 : 0.4,
    needsClarification: false,
    clarificationQuestion: null,
    source,
  };
}

const INTENT_ALIAS_MAP: Record<string, VoiceAssistantIntent> = {
  // Exact matches
  PLACE_ORDER: "PLACE_ORDER",
  TRACK_ORDERS: "TRACK_ORDERS",
  PENDING_PAYMENTS: "PENDING_PAYMENTS",
  CLUSTER_STATUS: "CLUSTER_STATUS",
  VOTING_STATUS: "VOTING_STATUS",
  UPDATE_PROFILE: "UPDATE_PROFILE",
  GENERAL_QUESTION: "GENERAL_QUESTION",
  UNKNOWN: "UNKNOWN",

  // PLACE_ORDER aliases
  ORDER: "PLACE_ORDER",
  PLACE: "PLACE_ORDER",
  PLACE_ORDER_INTENT: "PLACE_ORDER",
  CREATE_ORDER: "PLACE_ORDER",
  NEW_ORDER: "PLACE_ORDER",
  BUY: "PLACE_ORDER",
  PURCHASE: "PLACE_ORDER",
  BUYING: "PLACE_ORDER",
  ORDERING: "PLACE_ORDER",
  ORDER_PLACEMENT: "PLACE_ORDER",
  MAKE_ORDER: "PLACE_ORDER",
  BOOK_ORDER: "PLACE_ORDER",
  BOOK: "PLACE_ORDER",
  PLACE_AN_ORDER: "PLACE_ORDER",

  // TRACK_ORDERS aliases
  TRACK_ORDER: "TRACK_ORDERS",
  TRACK: "TRACK_ORDERS",
  TRACKING: "TRACK_ORDERS",
  ORDER_TRACKING: "TRACK_ORDERS",
  CHECK_ORDERS: "TRACK_ORDERS",
  CHECK_ORDER: "TRACK_ORDERS",
  ORDER_STATUS: "TRACK_ORDERS",
  MY_ORDERS: "TRACK_ORDERS",
  VIEW_ORDERS: "TRACK_ORDERS",
  SHOW_ORDERS: "TRACK_ORDERS",
  ORDER_HISTORY: "TRACK_ORDERS",
  ORDERS: "TRACK_ORDERS",
  TRACK_MY_ORDERS: "TRACK_ORDERS",
  TRACK_DELIVERY: "TRACK_ORDERS",
  DELIVERY_STATUS: "TRACK_ORDERS",

  // PENDING_PAYMENTS aliases
  PENDING_PAYMENT: "PENDING_PAYMENTS",
  PAYMENT_PENDING: "PENDING_PAYMENTS",
  PAYMENTS: "PENDING_PAYMENTS",
  PAYMENT: "PENDING_PAYMENTS",
  CHECK_PAYMENTS: "PENDING_PAYMENTS",
  CHECK_PAYMENT: "PENDING_PAYMENTS",
  PAYMENT_STATUS: "PENDING_PAYMENTS",
  DUE_PAYMENTS: "PENDING_PAYMENTS",
  UNPAID: "PENDING_PAYMENTS",
  PAYMENT_DUE: "PENDING_PAYMENTS",
  PAY: "PENDING_PAYMENTS",
  MY_PAYMENTS: "PENDING_PAYMENTS",
  VIEW_PAYMENTS: "PENDING_PAYMENTS",

  // CLUSTER_STATUS aliases
  CLUSTER: "CLUSTER_STATUS",
  CLUSTER_TRACK: "CLUSTER_STATUS",
  CLUSTERS: "CLUSTER_STATUS",
  CHECK_CLUSTER: "CLUSTER_STATUS",
  CHECK_CLUSTERS: "CLUSTER_STATUS",
  GROUP_ORDER: "CLUSTER_STATUS",
  GROUP_ORDERS: "CLUSTER_STATUS",
  GROUP_STATUS: "CLUSTER_STATUS",
  GROUP: "CLUSTER_STATUS",
  MY_CLUSTERS: "CLUSTER_STATUS",
  VIEW_CLUSTERS: "CLUSTER_STATUS",
  CLUSTER_INFO: "CLUSTER_STATUS",

  // VOTING_STATUS aliases
  VOTE: "VOTING_STATUS",
  VOTING: "VOTING_STATUS",
  VENDOR_VOTING: "VOTING_STATUS",
  BID: "VOTING_STATUS",
  BIDDING: "VOTING_STATUS",
  VOTING_PENDING: "VOTING_STATUS",
  PENDING_VOTES: "VOTING_STATUS",
  CHECK_VOTING: "VOTING_STATUS",
  MY_VOTES: "VOTING_STATUS",
  VOTE_STATUS: "VOTING_STATUS",

  // UPDATE_PROFILE aliases
  PROFILE: "UPDATE_PROFILE",
  EDIT_PROFILE: "UPDATE_PROFILE",
  PROFILE_UPDATE: "UPDATE_PROFILE",
  MY_PROFILE: "UPDATE_PROFILE",
  CHANGE_PROFILE: "UPDATE_PROFILE",
  MODIFY_PROFILE: "UPDATE_PROFILE",
  ACCOUNT: "UPDATE_PROFILE",
  EDIT_ACCOUNT: "UPDATE_PROFILE",
  SETTINGS: "UPDATE_PROFILE",
  PROFILE_EDIT: "UPDATE_PROFILE",
  UPDATE_DETAILS: "UPDATE_PROFILE",

  // GENERAL_QUESTION aliases
  QUESTION: "GENERAL_QUESTION",
  GENERAL: "GENERAL_QUESTION",
  GENERAL_QUERY: "GENERAL_QUESTION",
  QUERY: "GENERAL_QUESTION",
  ASK: "GENERAL_QUESTION",
  HELP: "GENERAL_QUESTION",
  INFO: "GENERAL_QUESTION",
  INFORMATION: "GENERAL_QUESTION",
  FAQ: "GENERAL_QUESTION",
  ENQUIRY: "GENERAL_QUESTION",
  INQUIRY: "GENERAL_QUESTION",
};

function normalizeAssistantIntent(
  input: unknown,
  transcript?: string,
): VoiceAssistantIntent {
  if (typeof input === "string") {
    const key = input
      .trim()
      .toUpperCase()
      .replace(/[^A-Z]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const directMatch = INTENT_ALIAS_MAP[key];
    if (directMatch) {
      return directMatch;
    }

    // Substring matching: check if any known alias is contained within the key
    // or if the key is contained within a known alias.
    // This handles cases like "PLACE_ORDER_ACTION" or "INTENT_TRACK_ORDERS" etc.
    for (const [alias, intent] of Object.entries(INTENT_ALIAS_MAP)) {
      if (alias.length >= 4 && (key.includes(alias) || alias.includes(key))) {
        return intent;
      }
    }
  }

  if (!transcript) return "UNKNOWN";
  return inferIntentFromTranscriptFallback(transcript);
}

function firstSentence(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const sentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) return sentenceMatch[1].trim();
  return normalized;
}

function sanitizeAssistantMessage(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const oneLine = firstSentence(input);
  if (!oneLine) return null;

  if (oneLine.length <= 200) return oneLine;
  return `${oneLine.slice(0, 197).trim()}...`;
}

function inferIntentFromTranscriptFallback(
  transcript: string,
): VoiceAssistantIntent {
  const normalized = normalizeTextForMatch(transcript);
  if (!normalized) return "UNKNOWN";

  if (
    /\b(update|edit|change|badlo|badalna|sudharo)\b.*\b(profile|account|phone|name|address|naam|pata)\b/.test(
      normalized,
    ) ||
    /\b(profile|profail)\b/.test(normalized)
  ) {
    return "UPDATE_PROFILE";
  }

  if (
    /\b(track|status|show|check|where|dikhao|dikha|kahan|kab|batao)\b.*\b(order|orders|delivery|aaya|pohcha|pohoch)\b/.test(
      normalized,
    ) ||
    /\b(mera|mere|my)\b.*\b(order|orders)\b/.test(normalized) ||
    /\b(order|orders)\b.*\b(kahan|kab|status|track)\b/.test(normalized)
  ) {
    return "TRACK_ORDERS";
  }

  if (
    (/\b(payment|payments|pay|due|pending|paisa|paise|bhugtan|baki)\b/.test(normalized) &&
      /\b(pending|due|remaining|left|unpaid|status|which|kitna|kab|baki|bacha)\b/.test(normalized)) ||
    /\b(pending)\b.*\b(payment|payments)\b/.test(normalized)
  ) {
    return "PENDING_PAYMENTS";
  }

  if (/\b(vote|voting|bid|bidding|matdan)\b/.test(normalized)) {
    return "VOTING_STATUS";
  }

  if (/\b(cluster|group order|group|samuh|samooh)\b/.test(normalized)) {
    return "CLUSTER_STATUS";
  }

  if (
    /\b(order|buy|need|require|purchase|book|chahiye|chahie|chaiye|chiye|mujhe|hame|humein|kharidna|mangwao|mangao|lena|dedo|bhejo|bhejdo)\b/.test(
      normalized,
    ) ||
    (/\b\d+(?:\.\d+)?\b/.test(normalized) &&
      /\b(kg|kilo|quintal|ton|bag|litre|liter|liters|litres|bags|bori|bora)\b/.test(
        normalized,
      ))
  ) {
    return "PLACE_ORDER";
  }

  if (/^(what|which|when|how|who|why|kya|kaun|kab|kaise|kyun)\b/.test(normalized)) {
    return "GENERAL_QUESTION";
  }

  return "UNKNOWN";
}

function buildFallbackAssistantResult(
  transcript: string,
): VoiceAssistantExtraction {
  const inferredIntent = inferIntentFromTranscriptFallback(transcript);

  if (inferredIntent === "PLACE_ORDER") {
    return {
      intent: "PLACE_ORDER",
      intentConfidence: 0.38,
      assistantMessage: null,
      extraction: buildOrderFallbackExtraction(),
    };
  }

  return {
    intent: inferredIntent,
    intentConfidence: 0.42,
    assistantMessage: null,
    extraction: buildNonOrderExtraction("fallback"),
  };
}

async function callModelForAssistantExtraction(params: {
  transcript: string;
  activeClusterProducts: string[];
  farmerLanguage?: string | null;
  conversationContext?: string[];
  pendingDraft?: VoiceOrderDraft | null;
}) {
  const normalizedTranscript = normalizeTextForMatch(params.transcript);
  const kbContext = staticKbContext;

  const promptPayload = {
    transcript: params.transcript,
    normalizedTranscript,
    farmerLanguage: params.farmerLanguage ?? "unknown",
    conversationContext: params.conversationContext ?? [],
    pendingDraft: params.pendingDraft ?? null,
    activeClusterProducts: params.activeClusterProducts,
  };

  const systemPrompt =
    "You are an AI farmer voice assistant for AgriSetu. Classify user intent and extract order details only when needed.\n\n" +
    "CRITICAL RULES:\n" +
    "1. Respond with ONLY one valid JSON object and NO other text, NO markdown, NO explanation.\n" +
    '2. JSON must have this EXACT shape: { "intent": "<INTENT>", "intentConfidence": <number>, "assistantMessage": <string|null>, "product": <string|null>, "quantity": <number|null>, "unit": <string|null>, "confidence": <number>, "needsClarification": <boolean>, "clarificationQuestion": <string|null> }\n' +
    '3. "intent" MUST be EXACTLY one of these strings (copy the value exactly): "PLACE_ORDER", "TRACK_ORDERS", "PENDING_PAYMENTS", "CLUSTER_STATUS", "VOTING_STATUS", "UPDATE_PROFILE", "GENERAL_QUESTION", "UNKNOWN". Do NOT use any other value.\n' +
    '4. "unit" when present MUST be one of: "kg", "quintal", "ton", "bag", "litre".\n' +
    "5. If intent is not PLACE_ORDER: set product/quantity/unit to null, needsClarification=false, clarificationQuestion=null.\n" +
    "6. For GENERAL_QUESTION, assistantMessage must be one concise sentence and must not trigger navigation/action.\n" +
    "7. For PLACE_ORDER, use activeClusterProducts to understand available product vocabulary. Answer 'what products are available?' using activeClusterProducts only.\n" +
    "8. For PLACE_ORDER, if product/quantity/unit are incomplete, set needsClarification=true and ask one short question.\n" +
    "9. Use conversationContext and pendingDraft to complete PLACE_ORDER details across turns.\n" +
    "10. Follow guidance in <knowledge_base> for behavior and extraction policy.\n\n" +
    "INTENT CLASSIFICATION GUIDE:\n" +
    '- User wants to buy/order/need something → "PLACE_ORDER"\n' +
    '- User asks about order status/tracking/delivery → "TRACK_ORDERS"\n' +
    '- User asks about payments/dues/pending money → "PENDING_PAYMENTS"\n' +
    '- User asks about cluster/group order status → "CLUSTER_STATUS"\n' +
    '- User asks about vendor voting/bidding → "VOTING_STATUS"\n' +
    '- User wants to edit/update profile → "UPDATE_PROFILE"\n' +
    '- User has a general informational question → "GENERAL_QUESTION"\n' +
    '- Cannot determine intent → "UNKNOWN"\n\n' +
    "<knowledge_base>\n" +
    (kbContext || "No knowledge base context available for this request.") +
    "\n</knowledge_base>"

  try {
    const contentText = await callManifestAI({
      systemPrompt,
      userContent: JSON.stringify(promptPayload),
      temperature: 0.1,
      maxTokens: 1000,
    });

    logAiJson("raw-model-text", contentText);
    const parsed = extractJsonObject(contentText);
    logAiJson("parsed-model-json", parsed);
    if (parsed) {
      logAiJson("model-intent-field", parsed.intent);
    }
    return parsed;
  } catch (error) {
    logger.error("[ai-order-parser] Error calling Manifest AI:", error);
    return null;
  }
}

function mergeWithPendingDraft(params: {
  extraction: VoiceOrderExtraction;
  pendingDraft?: VoiceOrderDraft | null;
}): VoiceOrderExtraction {
  const { extraction, pendingDraft } = params;
  const draft = pendingDraft ?? null;

  if (!draft) {
    const question = buildClarificationQuestion({
      product: extraction.product,
      quantity: extraction.quantity,
      unit: extraction.unit,
    });

    return {
      ...extraction,
      needsClarification: Boolean(question),
      clarificationQuestion: question,
      confidence: clampConfidence(
        extraction.confidence,
        question ? 0.45 : 0.75,
      ),
    };
  }

  const mergedProduct =
    extraction.product ?? sanitizeProduct(draft.product) ?? null;
  const mergedQuantity =
    extraction.quantity ?? coerceQuantity(draft.quantity) ?? null;
  const mergedUnit = extraction.unit ?? normalizeUnit(draft.unit) ?? null;

  const clarificationQuestion = buildClarificationQuestion({
    product: mergedProduct,
    quantity: mergedQuantity,
    unit: mergedUnit,
  });

  const usedPendingContext =
    (!extraction.product && Boolean(draft.product)) ||
    (!extraction.quantity && Boolean(draft.quantity)) ||
    (!extraction.unit && Boolean(draft.unit));

  return {
    product: mergedProduct,
    quantity: mergedQuantity,
    unit: mergedUnit,
    confidence: clampConfidence(
      extraction.confidence,
      clarificationQuestion ? 0.45 : usedPendingContext ? 0.72 : 0.8,
    ),
    needsClarification: Boolean(clarificationQuestion),
    clarificationQuestion,
    source: extraction.source,
  };
}

export async function extractVoiceAssistantFromTranscript(params: {
  transcript: string;
  activeClusterProducts: string[];
  farmerLanguage?: string | null;
  conversationContext?: string[];
  pendingDraft?: VoiceOrderDraft | null;
}): Promise<VoiceAssistantExtraction> {
  const transcript = params.transcript.trim();

  try {
    const parsed = await callModelForAssistantExtraction({
      transcript,
      activeClusterProducts: params.activeClusterProducts,
      farmerLanguage: params.farmerLanguage,
      conversationContext: params.conversationContext,
      pendingDraft: params.pendingDraft,
    });

    if (!parsed) {
      return buildFallbackAssistantResult(transcript);
    }

    const intent = normalizeAssistantIntent(parsed.intent, transcript);
    logAiJson("intent-resolution", { raw: parsed.intent, resolved: intent });
    const intentConfidence = clampConfidence(parsed.intentConfidence, 0.6);
    const assistantMessage = sanitizeAssistantMessage(parsed.assistantMessage);

    if (intent !== "PLACE_ORDER") {
      return {
        intent,
        intentConfidence,
        assistantMessage,
        extraction: buildNonOrderExtraction("model"),
      };
    }

    const product = sanitizeProduct(parsed.product);
    const quantity = coerceQuantity(parsed.quantity);
    const unit = normalizeUnit(parsed.unit);

    const mergedExtraction = mergeWithPendingDraft({
      extraction: {
        product,
        quantity,
        unit,
        confidence: clampConfidence(parsed.confidence, 0.5),
        needsClarification: false,
        clarificationQuestion: null,
        source: "model",
      },
      pendingDraft: params.pendingDraft,
    });

    return {
      intent,
      intentConfidence,
      assistantMessage,
      extraction: mergedExtraction,
    };
  } catch {
    return buildFallbackAssistantResult(transcript);
  }
}

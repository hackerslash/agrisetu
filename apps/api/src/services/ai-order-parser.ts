import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { logger } from "../lib/logger.js";

type GigContext = {
  id: string;
  product: string;
  variety: string | null;
  unit: string;
  minQuantity: number;
  pricePerUnit: number;
  vendorBusinessName: string;
  vendorState: string | null;
};

export type VoiceOrderExtraction = {
  product: string | null;
  quantity: number | null;
  unit: string | null;
  matchedGigId: string | null;
  matchedGigLabel: string | null;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  source: "model" | "fallback";
};

export type VoiceOrderDraft = {
  product?: string | null;
  quantity?: number | null;
  unit?: string | null;
  matchedGigId?: string | null;
  matchedGigLabel?: string | null;
};

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg",
  kilo: "kg",
  kilos: "kg",
  kilogram: "kg",
  kilograms: "kg",
  quintal: "quintal",
  quintals: "quintal",
  qtl: "quintal",
  q: "quintal",
  ton: "ton",
  tons: "ton",
  tonne: "ton",
  tonnes: "ton",
  bag: "bag",
  bags: "bag",
  litre: "litre",
  liter: "litre",
  liters: "litre",
  litres: "litre",
};

const SUPPORTED_UNITS = ["kg", "quintal", "ton", "bag", "litre"] as const;
const FALLBACK_PROCESSING_MESSAGE =
  "I could not process this request. Please repeat your order with product, quantity, and unit.";

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
  return UNIT_ALIASES[key] ?? (SUPPORTED_UNITS.includes(key as never) ? key : null);
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

function buildGigLabel(gig?: GigContext | null) {
  if (!gig) return null;
  const productLabel = gig.variety
    ? `${gig.product} (${gig.variety})`
    : gig.product;
  return `${productLabel} • ${gig.vendorBusinessName} • ₹${gig.pricePerUnit.toFixed(0)}/${gig.unit}`;
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

function findGigById(gigs: GigContext[], gigId: string | null | undefined) {
  if (!gigId) return null;
  const normalizedId = gigId.trim();
  if (!normalizedId) return null;
  return gigs.find((gig) => gig.id === normalizedId) ?? null;
}

function buildFallbackExtraction(): VoiceOrderExtraction {
  return {
    product: null,
    quantity: null,
    unit: null,
    matchedGigId: null,
    matchedGigLabel: null,
    confidence: 0,
    needsClarification: true,
    clarificationQuestion: FALLBACK_PROCESSING_MESSAGE,
    source: "fallback",
  };
}

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });
const bedrockAgentClient = new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });

async function fetchKnowledgeBaseContext(transcript: string): Promise<string> {
  const kbId = process.env.KNOWLEDGE_BASE_ID?.trim();
  if (!kbId) {
    console.log("[ai-order-parser] KNOWLEDGE_BASE_ID not set, skipping KB retrieval.");
    return "";
  }

  try {
    console.log(`[ai-order-parser] Fetching KB context for transcript: "${transcript}" using KB ID: ${kbId}`);
    const response = await bedrockAgentClient.send(
      new RetrieveCommand({
        knowledgeBaseId: kbId,
        retrievalQuery: { text: transcript },
        retrievalConfiguration: {
          vectorSearchConfiguration: {
            numberOfResults: 5,
          },
        },
      })
    );

    const chunks = response.retrievalResults?.map(r => r.content?.text).filter(Boolean) ?? [];
    console.log(`[ai-order-parser] Retrieved ${chunks.length} chunks from Knowledge Base.`);
    if (chunks.length > 0) {
      console.log(`[ai-order-parser] KB Chunk 1 Preview: ${chunks[0]?.substring(0, 150)}...`);
    }
    return chunks.join("\n\n");
  } catch (error) {
    logger.error("[ai-order-parser] Error fetching Knowledge Base context:", error);
    return "";
  }
}

async function callModelForExtraction(params: {
  transcript: string;
  gigs: GigContext[];
  farmerLanguage?: string | null;
  conversationContext?: string[];
  pendingDraft?: VoiceOrderDraft | null;
}) {
  const modelId = process.env.BEDROCK_MODEL_ID?.trim() || "anthropic.claude-3-sonnet-20240229-v1:0";

  // Step A: Normalize transcript and metadata
  const normalizedTranscript = normalizeTextForMatch(params.transcript);

  // Step B: Fetch retrieval context from Knowledge Base
  const kbContext = await fetchKnowledgeBaseContext(normalizedTranscript);

  const promptPayload = {
    transcript: params.transcript,
    normalizedTranscript,
    farmerLanguage: params.farmerLanguage ?? "unknown",
    conversationContext: params.conversationContext ?? [],
    pendingDraft: params.pendingDraft ?? null,
    availableGigs: params.gigs.map((gig) => ({
      id: gig.id,
      product: gig.product,
      variety: gig.variety,
      unit: gig.unit,
      minQuantity: gig.minQuantity,
      pricePerUnit: gig.pricePerUnit,
      vendorBusinessName: gig.vendorBusinessName,
      vendorState: gig.vendorState,
    })),
  };

  const systemPrompt =
    "You are an AI order extraction assistant for agriculture. Extract agricultural order intent based on the user transcript and available context.\n\n" +
    "CRITICAL RULES:\n" +
    "1. Respond with ONLY one valid JSON object and absolutely no extra text, markdown formatting, or preamble.\n" +
    "2. JSON schema: { \"product\": string|null, \"quantity\": number|null, \"unit\": \"kg\"|\"quintal\"|\"ton\"|\"bag\"|\"litre\"|null, " +
    "\"matchedGigId\": string|null, \"confidence\": number, \"needsClarification\": boolean, \"clarificationQuestion\": string|null }\n" +
    "3. Prefer matching to `availableGigs` product/unit/variety. Use `matchedGigId` ONLY from `availableGigs` IDs.\n" +
    "4. When multiple gigs share the same product, use variety mentioned in transcript to pick the right gig.\n" +
    "5. If transcript is ambiguous or missing quantity/unit, set `needsClarification` to true and ask one short clarification question.\n" +
    "6. If `conversationContext` or `pendingDraft` are provided, chain with them to fill missing fields across turns before asking clarification.\n" +
    "7. MUST USE KNOWLEDGE BASE: You MUST strictly adhere to the rules, definitions, policies, and unavailability constraints provided in the <knowledge_base> section below. It overrides all other information.\n\n" +
    "<knowledge_base>\n" +
    (kbContext || "No knowledge base context available for this request.") +
    "\n</knowledge_base>";

  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages: [
          {
            role: "user",
            content: [{ text: JSON.stringify(promptPayload) }],
          },
        ],
        inferenceConfig: {
          temperature: 0.1,
          maxTokens: 1000,
        },
      })
    );

    let contentText = "";
    if (response.output?.message?.content) {
      for (const part of response.output.message.content) {
        if (part.text) {
          contentText += part.text;
        }
      }
    }

    const parsed = extractJsonObject(contentText);
    logAiJson("parsed-model-json", parsed);
    return parsed;
  } catch (error) {
    logger.error("[ai-order-parser] Error calling Bedrock model:", error);
    return null;
  }
}

function mergeWithPendingDraft(params: {
  extraction: VoiceOrderExtraction;
  pendingDraft?: VoiceOrderDraft | null;
  gigs: GigContext[];
}): VoiceOrderExtraction {
  const { extraction, pendingDraft, gigs } = params;
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

  const explicitGigId =
    extraction.matchedGigId ??
    (typeof draft.matchedGigId === "string" ? draft.matchedGigId : null);

  const matchedGig =
    findGigById(gigs, explicitGigId);

  const resolvedProduct = matchedGig?.product ?? mergedProduct;
  const resolvedUnit = matchedGig?.unit ?? mergedUnit;
  const clarificationQuestion = buildClarificationQuestion({
    product: resolvedProduct,
    quantity: mergedQuantity,
    unit: resolvedUnit,
  });

  const usedPendingContext =
    (!extraction.product && Boolean(draft.product)) ||
    (!extraction.quantity && Boolean(draft.quantity)) ||
    (!extraction.unit && Boolean(draft.unit));

  return {
    product: resolvedProduct,
    quantity: mergedQuantity,
    unit: resolvedUnit,
    matchedGigId: matchedGig?.id ?? explicitGigId ?? null,
    matchedGigLabel:
      buildGigLabel(matchedGig) ??
      (typeof draft.matchedGigLabel === "string" ? draft.matchedGigLabel : null),
    confidence: clampConfidence(
      extraction.confidence,
      clarificationQuestion ? 0.45 : usedPendingContext ? 0.72 : 0.8,
    ),
    needsClarification: Boolean(clarificationQuestion),
    clarificationQuestion,
    source: extraction.source,
  };
}

export async function extractVoiceOrderFromTranscript(params: {
  transcript: string;
  gigs: GigContext[];
  farmerLanguage?: string | null;
  conversationContext?: string[];
  pendingDraft?: VoiceOrderDraft | null;
}): Promise<VoiceOrderExtraction> {
  const transcript = params.transcript.trim();
  const fallback = buildFallbackExtraction();

  try {
    const parsed = await callModelForExtraction({
      transcript,
      gigs: params.gigs,
      farmerLanguage: params.farmerLanguage,
      conversationContext: params.conversationContext,
      pendingDraft: params.pendingDraft,
    });
    if (!parsed) return fallback;

    const product = sanitizeProduct(parsed.product);
    const quantity = coerceQuantity(parsed.quantity);
    const unit = normalizeUnit(parsed.unit);

    const modelGigId =
      typeof parsed.matchedGigId === "string" ? parsed.matchedGigId : null;
    const matchedGig = findGigById(params.gigs, modelGigId);
    const resolvedProduct = matchedGig?.product ?? product;
    const resolvedUnit = matchedGig?.unit ?? unit;

    const merged = mergeWithPendingDraft({
      extraction: {
        product: resolvedProduct,
        quantity,
        unit: resolvedUnit,
        matchedGigId: matchedGig?.id ?? null,
        matchedGigLabel: buildGigLabel(matchedGig),
        confidence: clampConfidence(parsed.confidence, 0.5),
        needsClarification: false,
        clarificationQuestion: null,
        source: "model",
      },
      pendingDraft: params.pendingDraft,
      gigs: params.gigs,
    });

    return merged;
  } catch {
    return fallback;
  }
}

export type { GigContext };

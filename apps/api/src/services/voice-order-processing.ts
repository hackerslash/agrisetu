import { GigStatus, OrderStatus } from "@prisma/client";
import { isValidCoordinate, isWithinRadiusKm } from "../lib/geo.js";
import { prisma } from "../lib/prisma.js";
import {
  extractVoiceAssistantFromTranscript,
  type GigContext,
  type VoiceAssistantIntent,
} from "./ai-order-parser.js";
import { buildLocalizedClarificationSpeech } from "./clarification-speech.js";
import {
  clearFarmerPendingOrderDraft,
  getFarmerPendingOrderDraft,
  indexFarmerProfileMemory,
  rememberFarmerConversationTurn,
  searchFarmerConversationMemory,
  setFarmerPendingOrderDraft,
} from "./conversation-memory.js";

function isGigServiceableForFarmer(params: {
  farmerLatitude?: number | null;
  farmerLongitude?: number | null;
  farmerState?: string | null;
  vendorLatitude?: number | null;
  vendorLongitude?: number | null;
  vendorState?: string | null;
  serviceRadiusKm?: number | null;
}) {
  const {
    farmerLatitude,
    farmerLongitude,
    farmerState,
    vendorLatitude,
    vendorLongitude,
    vendorState,
    serviceRadiusKm,
  } = params;

  const farmerHasCoords = isValidCoordinate(farmerLatitude, farmerLongitude);
  const vendorHasCoords = isValidCoordinate(vendorLatitude, vendorLongitude);

  if (farmerHasCoords && vendorHasCoords) {
    const radiusKm =
      typeof serviceRadiusKm === "number" && serviceRadiusKm > 0
        ? serviceRadiusKm
        : 0;
    if (radiusKm <= 0) return false;
    return isWithinRadiusKm(
      {
        latitude: farmerLatitude as number,
        longitude: farmerLongitude as number,
      },
      {
        latitude: vendorLatitude as number,
        longitude: vendorLongitude as number,
      },
      radiusKm,
    );
  }

  if (farmerState && vendorState) {
    return farmerState.toLowerCase() === vendorState.toLowerCase();
  }

  return true;
}

async function getAvailableGigContextForFarmer(farmerId: string): Promise<{
  farmerLanguage: string | null;
  farmerProfile: {
    name: string | null;
    village: string | null;
    district: string | null;
    state: string | null;
    language: string | null;
    cropsGrown: string[];
  };
  gigs: GigContext[];
}> {
  const [farmer, gigs] = await Promise.all([
    prisma.farmer.findUnique({
      where: { id: farmerId },
      select: {
        name: true,
        village: true,
        district: true,
        language: true,
        cropsGrown: true,
        state: true,
        latitude: true,
        longitude: true,
      },
    }),
    prisma.gig.findMany({
      where: {
        status: GigStatus.PUBLISHED,
        availableQuantity: { gt: 0 },
      },
      include: {
        vendor: {
          select: {
            businessName: true,
            state: true,
            latitude: true,
            longitude: true,
            serviceRadiusKm: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 120,
    }),
  ]);

  if (!farmer) {
    throw new Error("Farmer profile not found");
  }

  const serviceableGigs = gigs
    .filter((gig) =>
      isGigServiceableForFarmer({
        farmerLatitude: farmer.latitude,
        farmerLongitude: farmer.longitude,
        farmerState: farmer.state,
        vendorLatitude: gig.vendor.latitude,
        vendorLongitude: gig.vendor.longitude,
        vendorState: gig.vendor.state,
        serviceRadiusKm: gig.vendor.serviceRadiusKm,
      }),
    )
    .slice(0, 60)
    .map((gig) => ({
      id: gig.id,
      product: gig.product,
      variety: gig.variety,
      unit: gig.unit,
      minQuantity: gig.minQuantity,
      pricePerUnit: gig.pricePerUnit,
      vendorBusinessName: gig.vendor.businessName,
      vendorState: gig.vendor.state,
    }));

  return {
    farmerLanguage: farmer.language,
    farmerProfile: {
      name: farmer.name ?? null,
      village: farmer.village ?? null,
      district: farmer.district ?? null,
      state: farmer.state ?? null,
      language: farmer.language ?? null,
      cropsGrown: farmer.cropsGrown ?? [],
    },
    gigs: serviceableGigs,
  };
}

export type ProcessVoiceOrderForFarmerParams = {
  farmerId: string;
  transcript: string;
  transcribedFromAudio: boolean;
  languageCode?: string | null;
  detectedLanguageCode?: string | null;
  conversationSessionId?: string | null;
};

export type ProcessVoiceOrderForFarmerResult = {
  transcript: string;
  assistant: {
    intent: VoiceAssistantIntent;
    intentConfidence: number;
    message: string | null;
  };
  extraction: {
    product: string | null;
    quantity: number | null;
    unit: string | null;
    matchedGigId: string | null;
    matchedGigLabel: string | null;
    confidence: number;
    needsClarification: boolean;
    clarificationQuestion: string | null;
    clarificationQuestionLocalized: string | null;
    source: "model" | "fallback";
  };
  clarificationSpeech: {
    languageCode: string;
    mimeType: string;
    audioBase64: string;
  } | null;
  assistantSpeech: {
    languageCode: string;
    mimeType: string;
    audioBase64: string;
  } | null;
  context: {
    availableGigCount: number;
    transcribedFromAudio: boolean;
    detectedLanguageCode: string | null;
    clarificationLanguageCode: string | null;
    memoryMatchesUsed: number;
    usedPendingDraft: boolean;
    pendingDraftActive: boolean;
  };
};

const UNPROCESSABLE_REQUEST_MESSAGE =
  "I could not process your request. Please repeat it clearly.";

function normalizeConversationSessionId(input?: string | null) {
  const normalized = input?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function firstSentence(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const sentenceMatch = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  if (sentenceMatch?.[1]) return sentenceMatch[1].trim();
  return normalized;
}

function oneSentenceOrNull(input?: string | null) {
  const text = input?.trim();
  if (!text) return null;
  const sentence = firstSentence(text);
  if (!sentence) return null;
  if (sentence.length <= 200) return sentence;
  return `${sentence.slice(0, 197).trim()}...`;
}

function defaultMessageForIntent(intent: VoiceAssistantIntent): string | null {
  switch (intent) {
    case "TRACK_ORDERS":
      return "Here are your latest orders.";
    case "PENDING_PAYMENTS":
      return "Here are the payments that need your action.";
    case "CLUSTER_STATUS":
      return "Here is your current cluster status.";
    case "VOTING_STATUS":
      return "Here are the clusters where voting may be pending for you.";
    case "UPDATE_PROFILE":
      return "Opening your profile editor.";
    case "GENERAL_QUESTION":
      return "I can help with quick questions about products and delivery status.";
    case "UNKNOWN":
      return "I could not map that request to an action, please try asking in a different way.";
    case "PLACE_ORDER":
    default:
      return null;
  }
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAvailableProductsQuestion(transcript: string) {
  const normalized = normalizeText(transcript);
  if (!normalized) return false;

  return (
    /\b(what|which|show|list|tell)\b/.test(normalized) &&
    /\b(product|products|available|sell|catalog|item|items|stock)\b/.test(
      normalized,
    )
  );
}

function isDeliveryQuestion(transcript: string) {
  const normalized = normalizeText(transcript);
  if (!normalized) return false;

  return (
    /\b(when|where|status|track|delivery|arrive|reaching|reach)\b/.test(
      normalized,
    ) && /\b(delivery|order|dispatch|dispatched)\b/.test(normalized)
  );
}

function formatProductList(products: string[]) {
  if (products.length === 0) return "";
  if (products.length === 1) return products[0] as string;
  if (products.length === 2) {
    return `${products[0]} and ${products[1]}`;
  }
  return `${products.slice(0, -1).join(", ")}, and ${products[products.length - 1]}`;
}

function normalizeProductClusterKey(input: string) {
  return normalizeText(input)
    .replace(
      /\b(seed|seeds|fertilizer|fertilizers|pesticide|pesticides)\b/g,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayProductName(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((word) => {
      if (word.length <= 1) return word.toUpperCase();
      return `${word[0]?.toUpperCase() ?? ""}${word.substring(1)}`;
    })
    .join(" ");
}

function collectDistinctProducts(gigs: GigContext[]) {
  const grouped = new Map<string, string>();

  for (const gig of gigs) {
    const rawProduct = gig.product.trim();
    if (!rawProduct) continue;

    const key = normalizeProductClusterKey(rawProduct);
    if (!key) continue;

    if (!grouped.has(key)) {
      grouped.set(key, toDisplayProductName(rawProduct));
    }
  }

  return Array.from(grouped.values());
}

async function buildGeneralQuestionAnswer(params: {
  farmerId: string;
  transcript: string;
  gigs: GigContext[];
  fallbackMessage?: string | null;
}) {
  if (isAvailableProductsQuestion(params.transcript)) {
    const products = collectDistinctProducts(params.gigs).slice(0, 5);

    if (products.length === 0) {
      return "No products are available in your area right now.";
    }

    return `Right now you can order ${formatProductList(products)}.`;
  }

  if (isDeliveryQuestion(params.transcript)) {
    const latestOrder = await prisma.order.findFirst({
      where: { farmerId: params.farmerId },
      orderBy: { createdAt: "desc" },
      select: {
        product: true,
        status: true,
      },
    });

    if (!latestOrder) {
      return "You do not have any orders yet, so there is no delivery scheduled right now.";
    }

    const product = latestOrder.product;

    switch (latestOrder.status) {
      case OrderStatus.DELIVERED:
        return `Your latest order for ${product} has already been delivered.`;
      case OrderStatus.OUT_FOR_DELIVERY:
      case OrderStatus.DISPATCHED:
        return `Your latest order for ${product} is on the way and should arrive soon.`;
      case OrderStatus.PROCESSING:
      case OrderStatus.PAID:
        return `Your latest order for ${product} is being prepared and will be dispatched soon.`;
      case OrderStatus.PAYMENT_PENDING:
        return `Your latest order for ${product} is waiting for payment confirmation before delivery can start.`;
      case OrderStatus.PENDING:
      case OrderStatus.CLUSTERED:
        return `Your latest order for ${product} is still in cluster formation, so delivery timing is not fixed yet.`;
      case OrderStatus.REJECTED:
      case OrderStatus.FAILED:
        return `Your latest order for ${product} is not active, so there is no delivery timeline for it.`;
      default:
        return "I can see your order, but delivery timing is not confirmed yet.";
    }
  }

  return (
    oneSentenceOrNull(params.fallbackMessage) ??
    "I can answer quick questions about available products and your delivery status."
  );
}

export function buildUnprocessableVoiceOrderResult(params: {
  transcript: string;
  transcribedFromAudio: boolean;
  detectedLanguageCode?: string | null;
  languageCode?: string | null;
}): ProcessVoiceOrderForFarmerResult {
  const transcript = params.transcript.trim();
  return {
    transcript,
    assistant: {
      intent: "UNKNOWN",
      intentConfidence: 0,
      message: UNPROCESSABLE_REQUEST_MESSAGE,
    },
    extraction: {
      product: null,
      quantity: null,
      unit: null,
      matchedGigId: null,
      matchedGigLabel: null,
      confidence: 0,
      needsClarification: false,
      clarificationQuestion: null,
      clarificationQuestionLocalized: null,
      source: "fallback",
    },
    clarificationSpeech: null,
    assistantSpeech: null,
    context: {
      availableGigCount: 0,
      transcribedFromAudio: params.transcribedFromAudio,
      detectedLanguageCode: params.detectedLanguageCode ?? null,
      clarificationLanguageCode:
        params.detectedLanguageCode ?? params.languageCode ?? null,
      memoryMatchesUsed: 0,
      usedPendingDraft: false,
      pendingDraftActive: false,
    },
  };
}

export async function processVoiceOrderForFarmer(
  params: ProcessVoiceOrderForFarmerParams,
): Promise<ProcessVoiceOrderForFarmerResult> {
  const transcript = params.transcript.trim();
  if (!transcript) {
    throw new Error("Speech not detected. Please speak clearly and retry.");
  }

  const context = await getAvailableGigContextForFarmer(params.farmerId);
  const conversationSessionId = normalizeConversationSessionId(
    params.conversationSessionId,
  );

  if (conversationSessionId) {
    indexFarmerProfileMemory(
      {
        farmerId: params.farmerId,
        conversationSessionId,
      },
      context.farmerProfile,
    );
  }

  const pendingDraft = conversationSessionId
    ? getFarmerPendingOrderDraft({
        farmerId: params.farmerId,
        conversationSessionId,
      })
    : null;

  const memoryMatches = conversationSessionId
    ? searchFarmerConversationMemory({
        farmerId: params.farmerId,
        conversationSessionId,
        query: transcript,
        limit: 5,
      })
    : [];

  const assistantExtraction = await extractVoiceAssistantFromTranscript({
    transcript,
    gigs: context.gigs,
    farmerLanguage: context.farmerLanguage,
    conversationContext: memoryMatches.map((match) => match.text),
    pendingDraft,
  });

  const extraction = assistantExtraction.extraction;
  const isPlaceOrderIntent = assistantExtraction.intent === "PLACE_ORDER";

  let clarificationQuestionLocalized = extraction.clarificationQuestion;
  let clarificationSpeech: {
    languageCode: string;
    mimeType: string;
    audioBase64: string;
  } | null = null;

  if (conversationSessionId) {
    rememberFarmerConversationTurn({
      farmerId: params.farmerId,
      conversationSessionId,
      transcript,
      extraction,
    });
  }

  if (isPlaceOrderIntent && extraction.needsClarification) {
    if (conversationSessionId) {
      setFarmerPendingOrderDraft({
        farmerId: params.farmerId,
        conversationSessionId,
        extraction,
      });
    }

    if (extraction.clarificationQuestion) {
      const speech = await buildLocalizedClarificationSpeech({
        question: extraction.clarificationQuestion,
        languageHint:
          params.detectedLanguageCode ??
          params.languageCode ??
          context.farmerLanguage,
      });

      if (speech) {
        clarificationQuestionLocalized = speech.localizedQuestion;
        clarificationSpeech = {
          languageCode: speech.languageCode,
          mimeType: speech.mimeType,
          audioBase64: speech.audioBase64,
        };
      }
    }
  } else if (conversationSessionId) {
    clearFarmerPendingOrderDraft({
      farmerId: params.farmerId,
      conversationSessionId,
    });
  }

  const rawAssistantMessage = oneSentenceOrNull(
    assistantExtraction.assistantMessage,
  );
  let assistantMessage =
    assistantExtraction.intent === "GENERAL_QUESTION"
      ? await buildGeneralQuestionAnswer({
          farmerId: params.farmerId,
          transcript,
          gigs: context.gigs,
          fallbackMessage: rawAssistantMessage,
        })
      : (rawAssistantMessage ??
        defaultMessageForIntent(assistantExtraction.intent));

  let assistantSpeech: {
    languageCode: string;
    mimeType: string;
    audioBase64: string;
  } | null = null;

  const shouldGenerateAssistantSpeech =
    assistantExtraction.intent !== "PLACE_ORDER" &&
    assistantMessage != null &&
    assistantMessage.trim().length > 0;

  if (shouldGenerateAssistantSpeech) {
    const assistantPrompt = assistantMessage as string;
    const assistantSpeechResult = await buildLocalizedClarificationSpeech({
      question: assistantPrompt,
      languageHint:
        params.detectedLanguageCode ??
        params.languageCode ??
        context.farmerLanguage,
    });
    if (assistantSpeechResult) {
      assistantMessage = assistantSpeechResult.localizedQuestion;
      assistantSpeech = {
        languageCode: assistantSpeechResult.languageCode,
        mimeType: assistantSpeechResult.mimeType,
        audioBase64: assistantSpeechResult.audioBase64,
      };
    }
  }

  return {
    transcript,
    assistant: {
      intent: assistantExtraction.intent,
      intentConfidence: assistantExtraction.intentConfidence,
      message: assistantMessage,
    },
    extraction: {
      ...extraction,
      clarificationQuestionLocalized,
    },
    clarificationSpeech,
    assistantSpeech,
    context: {
      availableGigCount: context.gigs.length,
      transcribedFromAudio: params.transcribedFromAudio,
      detectedLanguageCode: params.detectedLanguageCode ?? null,
      clarificationLanguageCode:
        clarificationSpeech?.languageCode ??
        params.detectedLanguageCode ??
        params.languageCode ??
        context.farmerLanguage,
      memoryMatchesUsed: memoryMatches.length,
      usedPendingDraft: Boolean(pendingDraft),
      pendingDraftActive: isPlaceOrderIntent && extraction.needsClarification,
    },
  };
}

import { GigStatus } from "@prisma/client";
import { isValidCoordinate, isWithinRadiusKm } from "../lib/geo.js";
import { prisma } from "../lib/prisma.js";
import {
  extractVoiceOrderFromTranscript,
  type GigContext,
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
      { latitude: farmerLatitude as number, longitude: farmerLongitude as number },
      { latitude: vendorLatitude as number, longitude: vendorLongitude as number },
      radiusKm,
    );
  }

  if (farmerState && vendorState) {
    return farmerState.toLowerCase() === vendorState.toLowerCase();
  }

  return true;
}

async function getAvailableGigContextForFarmer(
  farmerId: string,
): Promise<{
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
      cropName: gig.cropName,
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
  extraction: {
    cropName: string | null;
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
  "I could not process this request. Please repeat your order with crop, quantity, and unit.";

function normalizeConversationSessionId(input?: string | null) {
  const normalized = input?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
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
    extraction: {
      cropName: null,
      quantity: null,
      unit: null,
      matchedGigId: null,
      matchedGigLabel: null,
      confidence: 0,
      needsClarification: true,
      clarificationQuestion: UNPROCESSABLE_REQUEST_MESSAGE,
      clarificationQuestionLocalized: UNPROCESSABLE_REQUEST_MESSAGE,
      source: "fallback",
    },
    clarificationSpeech: null,
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

  const extraction = await extractVoiceOrderFromTranscript({
    transcript,
    gigs: context.gigs,
    farmerLanguage: context.farmerLanguage,
    conversationContext: memoryMatches.map((match) => match.text),
    pendingDraft,
  });

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

  if (extraction.needsClarification) {
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
  } else {
    if (conversationSessionId) {
      clearFarmerPendingOrderDraft({
        farmerId: params.farmerId,
        conversationSessionId,
      });
    }
  }

  return {
    transcript,
    extraction: {
      ...extraction,
      clarificationQuestionLocalized,
    },
    clarificationSpeech,
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
      pendingDraftActive: extraction.needsClarification,
    },
  };
}

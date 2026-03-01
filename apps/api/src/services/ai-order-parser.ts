type GigContext = {
  id: string;
  cropName: string;
  variety: string | null;
  unit: string;
  minQuantity: number;
  pricePerUnit: number;
  vendorBusinessName: string;
  vendorState: string | null;
};

export type VoiceOrderExtraction = {
  cropName: string | null;
  quantity: number | null;
  unit: string | null;
  matchedGigId: string | null;
  matchedGigLabel: string | null;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion: string | null;
  source: "model" | "fallback";
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function containsWholePhrase(haystack: string, phrase: string) {
  if (!haystack || !phrase) return false;
  return ` ${haystack} `.includes(` ${phrase} `);
}

function countTokenOverlap(left: string, right: string) {
  if (!left || !right) return 0;
  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap;
}

function containsUnitAlias(text: string, alias: string) {
  if (!text || !alias) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}])${escapeRegExp(alias)}([^\\p{L}]|$)`,
    "iu",
  );
  return pattern.test(text);
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

function sanitizeCropName(input: unknown): string | null {
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
    ? `${gig.cropName} (${gig.variety})`
    : gig.cropName;
  return `${productLabel} • ${gig.vendorBusinessName} • ₹${gig.pricePerUnit.toFixed(0)}/${gig.unit}`;
}

function findGigById(gigs: GigContext[], gigId: string | null | undefined) {
  if (!gigId) return null;
  const normalizedId = gigId.trim();
  if (!normalizedId) return null;
  return gigs.find((gig) => gig.id === normalizedId) ?? null;
}

function findBestGigByIntent(params: {
  gigs: GigContext[];
  cropName: string | null;
  unit: string | null;
  transcriptLower: string;
}) {
  const { gigs, cropName, unit, transcriptLower } = params;
  const transcriptNormalized = normalizeTextForMatch(transcriptLower);
  const cropNormalized = cropName ? normalizeTextForMatch(cropName) : "";
  const normalizedUnit = unit?.toLowerCase().trim() ?? null;

  const scored = gigs.map((gig) => {
    const gigCropNormalized = normalizeTextForMatch(gig.cropName);
    const gigVarietyNormalized = gig.variety
      ? normalizeTextForMatch(gig.variety)
      : "";
    const gigProductNormalized = normalizeTextForMatch(
      gig.variety ? `${gig.cropName} ${gig.variety}` : gig.cropName,
    );
    let score = 0;

    if (cropNormalized && gigProductNormalized === cropNormalized) score += 120;
    if (containsWholePhrase(transcriptNormalized, gigProductNormalized)) score += 100;

    if (cropNormalized && gigCropNormalized === cropNormalized) score += 80;
    if (cropNormalized && containsWholePhrase(gigCropNormalized, cropNormalized)) score += 30;
    if (cropNormalized && containsWholePhrase(cropNormalized, gigCropNormalized)) score += 25;
    if (containsWholePhrase(transcriptNormalized, gigCropNormalized)) score += 60;

    if (gigVarietyNormalized) {
      if (cropNormalized && gigVarietyNormalized === cropNormalized) score += 45;
      if (cropNormalized && containsWholePhrase(cropNormalized, gigVarietyNormalized)) score += 30;
      if (containsWholePhrase(transcriptNormalized, gigVarietyNormalized)) score += 80;
    }

    const overlapFromCrop = countTokenOverlap(gigCropNormalized, cropNormalized);
    const overlapFromTranscript = countTokenOverlap(gigCropNormalized, transcriptNormalized);
    const overlapProductFromCrop = countTokenOverlap(gigProductNormalized, cropNormalized);
    const overlapProductFromTranscript = countTokenOverlap(
      gigProductNormalized,
      transcriptNormalized,
    );
    score += overlapFromCrop * 6;
    score += overlapFromTranscript * 4;
    score += overlapProductFromCrop * 8;
    score += overlapProductFromTranscript * 6;

    if (normalizedUnit && gig.unit.toLowerCase().trim() === normalizedUnit) {
      score += 20;
    } else if (normalizedUnit) {
      score -= 4;
    }

    return { gig, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.gig.cropName.length - a.gig.cropName.length ||
      a.gig.minQuantity - b.gig.minQuantity,
  );
  const top = scored[0];
  return top && top.score >= 12 ? top.gig : null;
}

function fallbackExtraction(
  transcript: string,
  gigs: GigContext[],
): VoiceOrderExtraction {
  const transcriptLower = transcript.toLowerCase();
  const transcriptNormalized = normalizeTextForMatch(transcriptLower);

  const quantityMatch = transcriptLower.match(/(\d+(?:\.\d+)?)/);
  const quantityToken = quantityMatch?.[1];
  const quantity = quantityToken ? Number.parseFloat(quantityToken) : null;

  let unit: string | null = null;
  for (const alias of Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length)) {
    if (containsUnitAlias(transcriptLower, alias)) {
      unit = UNIT_ALIASES[alias] ?? null;
      break;
    }
  }

  const mentionedGigs = gigs
    .filter((gig) => {
      const product = normalizeTextForMatch(
        gig.variety ? `${gig.cropName} ${gig.variety}` : gig.cropName,
      );
      const crop = normalizeTextForMatch(gig.cropName);
      const variety = gig.variety ? normalizeTextForMatch(gig.variety) : "";
      return (
        containsWholePhrase(transcriptNormalized, product) ||
        containsWholePhrase(transcriptNormalized, crop) ||
        (variety.length > 0 &&
          containsWholePhrase(transcriptNormalized, variety))
      );
    })
    .sort((a, b) => {
      const aVariety = a.variety ? normalizeTextForMatch(a.variety) : "";
      const bVariety = b.variety ? normalizeTextForMatch(b.variety) : "";
      const aVarietyMentioned =
        aVariety.length > 0 && containsWholePhrase(transcriptNormalized, aVariety);
      const bVarietyMentioned =
        bVariety.length > 0 && containsWholePhrase(transcriptNormalized, bVariety);

      if (aVarietyMentioned !== bVarietyMentioned) {
        return aVarietyMentioned ? -1 : 1;
      }

      const aProductLength = normalizeTextForMatch(
        a.variety ? `${a.cropName} ${a.variety}` : a.cropName,
      ).length;
      const bProductLength = normalizeTextForMatch(
        b.variety ? `${b.cropName} ${b.variety}` : b.cropName,
      ).length;
      return bProductLength - aProductLength || a.minQuantity - b.minQuantity;
    });
  const gigFromText = mentionedGigs[0] ?? null;

  const cropName = gigFromText?.cropName ?? null;
  const matchedGig = findBestGigByIntent({
    gigs,
    cropName,
    unit,
    transcriptLower,
  });
  const resolvedCropName = matchedGig?.cropName ?? cropName;
  const resolvedUnit = matchedGig?.unit ?? unit;

  const needsClarification = !resolvedCropName || !quantity || !resolvedUnit;
  return {
    cropName: resolvedCropName,
    quantity: quantity && quantity > 0 ? quantity : null,
    unit: resolvedUnit,
    matchedGigId: matchedGig?.id ?? null,
    matchedGigLabel: buildGigLabel(matchedGig),
    confidence: needsClarification ? 0.35 : 0.65,
    needsClarification,
    clarificationQuestion: needsClarification
      ? "Please confirm product, quantity, and unit."
      : null,
    source: "fallback",
  };
}

async function callModelForExtraction(params: {
  transcript: string;
  gigs: GigContext[];
  farmerLanguage?: string | null;
}) {
  const baseUrl = process.env.BASE_URL?.trim();
  const apiKey = process.env.API_KEY?.trim();
  const modelId = process.env.MODEL_ID?.trim();

  if (!baseUrl || !apiKey || !modelId) {
    return null;
  }

  const promptPayload = {
    transcript: params.transcript,
    farmerLanguage: params.farmerLanguage ?? "unknown",
    availableGigs: params.gigs.map((gig) => ({
      id: gig.id,
      cropName: gig.cropName,
      variety: gig.variety,
      unit: gig.unit,
      minQuantity: gig.minQuantity,
      pricePerUnit: gig.pricePerUnit,
      vendorBusinessName: gig.vendorBusinessName,
      vendorState: gig.vendorState,
    })),
  };

  const systemPrompt =
    "You extract agricultural order intent. Respond with ONLY one JSON object and no extra text. " +
    "JSON schema: { cropName: string|null, quantity: number|null, unit: 'kg'|'quintal'|'ton'|'bag'|'litre'|null, " +
    "matchedGigId: string|null, confidence: number, needsClarification: boolean, clarificationQuestion: string|null }. " +
    "Rules: prefer matching to availableGigs crop/unit/variety. Use matchedGigId only from availableGigs IDs. " +
    "When multiple gigs share the same cropName, use variety mentioned in transcript to pick the right gig. " +
    "If transcript is ambiguous or missing quantity/unit, set needsClarification=true and ask one short question.";

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(promptPayload) },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Record<string, unknown>;
  const choices = Array.isArray(data.choices) ? data.choices : [];
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  const message = firstChoice?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  let contentText = "";

  if (typeof content === "string") {
    contentText = content;
  } else if (Array.isArray(content)) {
    const textParts = content
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part === "object" &&
              part &&
              "text" in part &&
              typeof (part as Record<string, unknown>).text === "string"
            ? ((part as Record<string, unknown>).text as string)
            : "",
      )
      .filter((part) => part.length > 0);
    contentText = textParts.join("\n");
  }

  const parsed = extractJsonObject(contentText);
  logAiJson("parsed-model-json", parsed);
  return parsed;
}

export async function extractVoiceOrderFromTranscript(params: {
  transcript: string;
  gigs: GigContext[];
  farmerLanguage?: string | null;
}): Promise<VoiceOrderExtraction> {
  const transcript = params.transcript.trim();
  const fallback = fallbackExtraction(transcript, params.gigs);

  try {
    const parsed = await callModelForExtraction({
      transcript,
      gigs: params.gigs,
      farmerLanguage: params.farmerLanguage,
    });
    if (!parsed) return fallback;

    const cropName = sanitizeCropName(parsed.cropName);
    const quantity = coerceQuantity(parsed.quantity);
    const unit = normalizeUnit(parsed.unit);

    const modelGigId = typeof parsed.matchedGigId === "string" ? parsed.matchedGigId : null;
    const matchedGig =
      findGigById(params.gigs, modelGigId) ??
      findBestGigByIntent({
        gigs: params.gigs,
        cropName,
        unit,
        transcriptLower: transcript.toLowerCase(),
      });
    const resolvedCropName = matchedGig?.cropName ?? cropName;
    const resolvedUnit = matchedGig?.unit ?? unit;

    const explicitNeedsClarification =
      typeof parsed.needsClarification === "boolean" ? parsed.needsClarification : false;
    const inferredNeedsClarification = !resolvedCropName || !quantity || !resolvedUnit;
    const needsClarification = explicitNeedsClarification || inferredNeedsClarification;

    return {
      cropName: resolvedCropName,
      quantity,
      unit: resolvedUnit,
      matchedGigId: matchedGig?.id ?? null,
      matchedGigLabel: buildGigLabel(matchedGig),
      confidence: clampConfidence(parsed.confidence, needsClarification ? 0.5 : 0.8),
      needsClarification,
      clarificationQuestion:
        typeof parsed.clarificationQuestion === "string"
          ? parsed.clarificationQuestion.trim() || null
          : needsClarification
            ? "Please confirm product, quantity, and unit."
            : null,
      source: "model",
    };
  } catch {
    return fallback;
  }
}

export type { GigContext };

import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { ClusterStatus } from "@prisma/client";
import { isValidCoordinate, isWithinRadiusKm } from "../lib/geo.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";

const DEFAULT_CLUSTER_CONTEXT_RADIUS_KM = 50;

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
});

export type ResolvedRequirement = {
  requirementProduct: string;
  requirementKey: string;
  quantity: number;
  unit: string;
  rawProduct: string;
  needsClarification: boolean;
  clarificationQuestion: string | null;
};

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

async function callModel(
  systemPrompt: string,
  userContent: string,
): Promise<Record<string, unknown> | null> {
  const modelId =
    process.env.BEDROCK_MODEL_ID?.trim() ||
    "anthropic.claude-3-sonnet-20240229-v1:0";
  try {
    const response = await bedrockClient.send(
      new ConverseCommand({
        modelId,
        system: [{ text: systemPrompt }],
        messages: [{ role: "user", content: [{ text: userContent }] }],
        inferenceConfig: { temperature: 0.1, maxTokens: 500 },
      }),
    );
    let text = "";
    for (const part of response.output?.message?.content ?? []) {
      if (part.text) text += part.text;
    }
    return extractJsonObject(text);
  } catch (err) {
    logger.error("[requirement-resolution] Bedrock error:", err);
    return null;
  }
}

async function getActiveClusterProducts(params: {
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<string[]> {
  const clusters = await prisma.cluster.findMany({
    where: { status: { in: [ClusterStatus.FORMING, ClusterStatus.VOTING] } },
    select: {
      product: true,
      district: true,
      latitude: true,
      longitude: true,
    },
  });

  const filtered = clusters.filter((cluster) => {
    if (
      isValidCoordinate(params.latitude, params.longitude) &&
      isValidCoordinate(cluster.latitude, cluster.longitude)
    ) {
      return isWithinRadiusKm(
        {
          latitude: params.latitude as number,
          longitude: params.longitude as number,
        },
        {
          latitude: cluster.latitude as number,
          longitude: cluster.longitude as number,
        },
        DEFAULT_CLUSTER_CONTEXT_RADIUS_KM,
      );
    }
    if (params.district && cluster.district) {
      return (
        cluster.district.toLowerCase() === params.district.toLowerCase()
      );
    }
    return true;
  });

  return Array.from(new Set(filtered.map((c) => c.product).filter(Boolean)));
}

async function extractRawRequirement(params: {
  rawInput: string;
  farmerProfile: {
    name?: string | null;
    district?: string | null;
    state?: string | null;
    language?: string | null;
    cropsGrown?: string[];
  };
  conversationContext?: string[];
  activeClusterProducts: string[];
}): Promise<{
  rawProduct: string | null;
  quantity: number | null;
  unit: string | null;
  needsClarification: boolean;
  clarificationQuestion: string | null;
}> {
  const systemPrompt =
    "You are an agricultural input requirement extractor for Indian farmers. " +
    "Extract the product, quantity, and unit from farmer input. " +
    "Farmer may use Hindi/regional words mixed with English — always output English. " +
    "RULES:\n" +
    '1. Return ONLY a JSON object: { "rawProduct": string|null, "quantity": number|null, "unit": "kg"|"quintal"|"ton"|"bag"|"litre"|null, "needsClarification": boolean, "clarificationQuestion": string|null }\n' +
    "2. If all three fields are clear, set needsClarification=false and clarificationQuestion=null.\n" +
    "3. If anything is missing or ambiguous, set needsClarification=true and ask one concise question.\n" +
    "4. Do NOT force-match to active cluster products — only extract what the farmer said.\n" +
    `5. Active cluster products for reference only: ${params.activeClusterProducts.join(", ") || "none"}\n` +
    `6. Farmer crops grown: ${params.farmerProfile.cropsGrown?.join(", ") || "unknown"}`;

  const userContent = JSON.stringify({
    input: params.rawInput,
    farmerLanguage: params.farmerProfile.language ?? "unknown",
    conversationContext: params.conversationContext ?? [],
  });

  const parsed = await callModel(systemPrompt, userContent);
  if (!parsed) {
    return {
      rawProduct: null,
      quantity: null,
      unit: null,
      needsClarification: true,
      clarificationQuestion:
        "I could not understand your request. Please repeat with product, quantity, and unit.",
    };
  }

  return {
    rawProduct:
      typeof parsed.rawProduct === "string" && parsed.rawProduct.trim()
        ? parsed.rawProduct.trim()
        : null,
    quantity:
      typeof parsed.quantity === "number" && parsed.quantity > 0
        ? parsed.quantity
        : typeof parsed.quantity === "string"
          ? (() => {
              const n = Number.parseFloat(parsed.quantity);
              return Number.isFinite(n) && n > 0 ? n : null;
            })()
          : null,
    unit:
      typeof parsed.unit === "string" && parsed.unit.trim()
        ? parsed.unit.trim().toLowerCase()
        : null,
    needsClarification: Boolean(parsed.needsClarification),
    clarificationQuestion:
      typeof parsed.clarificationQuestion === "string"
        ? parsed.clarificationQuestion
        : null,
  };
}

async function canonicalizeRequirement(params: {
  rawProduct: string;
  activeClusterProducts: string[];
}): Promise<{ requirementProduct: string; requirementKey: string }> {
  if (params.activeClusterProducts.length === 0) {
    return buildRequirementFromRaw(params.rawProduct);
  }

  const systemPrompt =
    "You are a requirement canonicalizer for an agricultural procurement platform. " +
    "Decide if the raw product name semantically matches any active cluster product (accounting for language variants/translations). " +
    "If yes, use that cluster product name. If no, create a clean canonical English name.\n" +
    "RULES:\n" +
    '1. Return ONLY a JSON object: { "requirementProduct": string, "requirementKey": string }\n' +
    '2. requirementProduct: proper-cased display name (e.g. "Paddy Seed", "Urea Fertilizer")\n' +
    '3. requirementKey: lowercase hyphen-separated stable slug (e.g. "paddy-seed", "urea-fertilizer")\n' +
    "4. Prefer matching to an existing cluster product when semantically close.\n" +
    `Active cluster products: ${params.activeClusterProducts.map((p, i) => `${i + 1}. "${p}"`).join(", ")}`;

  const parsed = await callModel(
    systemPrompt,
    JSON.stringify({ rawProduct: params.rawProduct }),
  );

  if (
    !parsed ||
    typeof parsed.requirementProduct !== "string" ||
    typeof parsed.requirementKey !== "string"
  ) {
    return buildRequirementFromRaw(params.rawProduct);
  }

  return {
    requirementProduct: parsed.requirementProduct.trim(),
    requirementKey: parsed.requirementKey.trim().toLowerCase(),
  };
}

function buildRequirementFromRaw(rawProduct: string): {
  requirementProduct: string;
  requirementKey: string;
} {
  const display = rawProduct
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1).toLowerCase()}`)
    .join(" ");
  const key = rawProduct
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return { requirementProduct: display, requirementKey: key };
}

export async function resolveRequirement(params: {
  rawInput: string;
  farmerId: string;
  conversationContext?: string[];
}): Promise<ResolvedRequirement> {
  const farmer = await prisma.farmer.findUnique({
    where: { id: params.farmerId },
    select: {
      name: true,
      district: true,
      state: true,
      language: true,
      cropsGrown: true,
      latitude: true,
      longitude: true,
    },
  });

  const activeClusterProducts = await getActiveClusterProducts({
    district: farmer?.district,
    latitude: farmer?.latitude,
    longitude: farmer?.longitude,
  });

  const step1 = await extractRawRequirement({
    rawInput: params.rawInput,
    farmerProfile: {
      name: farmer?.name,
      district: farmer?.district,
      state: farmer?.state,
      language: farmer?.language,
      cropsGrown: farmer?.cropsGrown ?? [],
    },
    conversationContext: params.conversationContext,
    activeClusterProducts,
  });

  if (
    step1.needsClarification ||
    !step1.rawProduct ||
    !step1.quantity ||
    !step1.unit
  ) {
    return {
      requirementProduct: step1.rawProduct ?? "",
      requirementKey: "",
      quantity: step1.quantity ?? 0,
      unit: step1.unit ?? "",
      rawProduct: step1.rawProduct ?? "",
      needsClarification: true,
      clarificationQuestion: step1.clarificationQuestion,
    };
  }

  const { requirementProduct, requirementKey } =
    await canonicalizeRequirement({
      rawProduct: step1.rawProduct,
      activeClusterProducts,
    });

  return {
    requirementProduct,
    requirementKey,
    quantity: step1.quantity,
    unit: step1.unit,
    rawProduct: step1.rawProduct,
    needsClarification: false,
    clarificationQuestion: null,
  };
}

export { getActiveClusterProducts };

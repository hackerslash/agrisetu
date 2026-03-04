import type { VoiceOrderExtraction } from "./ai-order-parser.js";

type FarmerProfileSnapshot = {
  name?: string | null;
  village?: string | null;
  district?: string | null;
  state?: string | null;
  language?: string | null;
  cropsGrown?: string[] | null;
};

export type PendingOrderDraft = {
  cropName: string | null;
  quantity: number | null;
  unit: string | null;
  matchedGigId: string | null;
  matchedGigLabel: string | null;
  updatedAt: string;
};

type MemoryKind = "profile" | "conversation";

type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  text: string;
  vector: Float32Array;
  createdAt: number;
};

type FarmerMemoryStore = {
  entries: MemoryEntry[];
  pendingDraft: PendingOrderDraft | null;
  sequence: number;
};

export type MemorySearchHit = {
  text: string;
  score: number;
  kind: MemoryKind;
};

const VECTOR_DIMENSION = 256;
const MAX_CONVERSATION_ENTRIES = 80;

const farmerMemoryStore = new Map<string, FarmerMemoryStore>();

function getStore(farmerId: string): FarmerMemoryStore {
  const existing = farmerMemoryStore.get(farmerId);
  if (existing) return existing;

  const created: FarmerMemoryStore = {
    entries: [],
    pendingDraft: null,
    sequence: 0,
  };
  farmerMemoryStore.set(farmerId, created);
  return created;
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hashToken(token: string) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedText(input: string) {
  const vector = new Float32Array(VECTOR_DIMENSION);
  const normalized = normalizeText(input);
  if (!normalized) return vector;

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) return vector;

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % VECTOR_DIMENSION;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }

  let magnitude = 0;
  for (const value of vector) {
    magnitude += value * value;
  }
  magnitude = Math.sqrt(magnitude);
  if (magnitude === 0) return vector;

  for (let i = 0; i < vector.length; i += 1) {
    vector[i] = (vector[i] ?? 0) / magnitude;
  }

  return vector;
}

function cosineSimilarity(left: Float32Array, right: Float32Array) {
  let dot = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += (left[i] ?? 0) * (right[i] ?? 0);
  }
  return dot;
}

function addEntry(farmerId: string, kind: MemoryKind, text: string) {
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const store = getStore(farmerId);
  const id = `${kind}-${Date.now()}-${store.sequence}`;
  store.sequence += 1;

  store.entries.push({
    id,
    kind,
    text: trimmedText,
    vector: embedText(trimmedText),
    createdAt: Date.now(),
  });

  // Keep one profile snapshot and a bounded number of conversational turns.
  const profileEntries = store.entries.filter((entry) => entry.kind === "profile");
  const conversationEntries = store.entries
    .filter((entry) => entry.kind === "conversation")
    .sort((a, b) => b.createdAt - a.createdAt);

  const bounded: MemoryEntry[] = [];
  const latestProfile = profileEntries[0];
  if (latestProfile) bounded.push(latestProfile);
  bounded.push(...conversationEntries.slice(0, MAX_CONVERSATION_ENTRIES));
  bounded.sort((a, b) => a.createdAt - b.createdAt);

  store.entries = bounded;
}

function summarizeExtraction(extraction: VoiceOrderExtraction) {
  const product = extraction.cropName ?? "unknown";
  const quantity =
    extraction.quantity == null ? "unknown" : extraction.quantity.toString();
  const unit = extraction.unit ?? "unknown";
  return [
    `Parsed order details -> product: ${product}, quantity: ${quantity}, unit: ${unit}.`,
    extraction.matchedGigLabel
      ? `Matched gig: ${extraction.matchedGigLabel}.`
      : "Matched gig: unknown.",
    extraction.needsClarification
      ? `Needs clarification: yes. Question: ${extraction.clarificationQuestion ?? "not provided"}.`
      : "Needs clarification: no.",
  ].join(" ");
}

export function indexFarmerProfileMemory(
  farmerId: string,
  profile: FarmerProfileSnapshot,
) {
  const store = getStore(farmerId);
  store.entries = store.entries.filter((entry) => entry.kind !== "profile");

  const crops = (profile.cropsGrown ?? []).filter(Boolean).join(", ");
  const profileText = [
    `Farmer profile for ${profile.name?.trim() || "farmer"}.`,
    `Preferred language: ${profile.language?.trim() || "unknown"}.`,
    `Location: village ${profile.village?.trim() || "unknown"}, district ${profile.district?.trim() || "unknown"}, state ${profile.state?.trim() || "unknown"}.`,
    `Crops grown: ${crops || "unknown"}.`,
  ].join(" ");

  addEntry(farmerId, "profile", profileText);
}

export function searchFarmerConversationMemory(params: {
  farmerId: string;
  query: string;
  limit?: number;
}): MemorySearchHit[] {
  const limit = params.limit ?? 4;
  if (limit <= 0) return [];

  const store = getStore(params.farmerId);
  const queryVector = embedText(params.query);
  const scored = store.entries
    .map((entry) => ({
      entry,
      score: cosineSimilarity(queryVector, entry.vector),
    }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)
    .slice(0, limit)
    .filter((item) => item.score > 0.04);

  return scored.map(({ entry, score }) => ({
    text: entry.text,
    score,
    kind: entry.kind,
  }));
}

export function getFarmerPendingOrderDraft(
  farmerId: string,
): PendingOrderDraft | null {
  return getStore(farmerId).pendingDraft;
}

export function setFarmerPendingOrderDraft(params: {
  farmerId: string;
  extraction: VoiceOrderExtraction;
}) {
  const store = getStore(params.farmerId);
  store.pendingDraft = {
    cropName: params.extraction.cropName ?? null,
    quantity: params.extraction.quantity ?? null,
    unit: params.extraction.unit ?? null,
    matchedGigId: params.extraction.matchedGigId ?? null,
    matchedGigLabel: params.extraction.matchedGigLabel ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function clearFarmerPendingOrderDraft(farmerId: string) {
  const store = getStore(farmerId);
  store.pendingDraft = null;
}

export function rememberFarmerConversationTurn(params: {
  farmerId: string;
  transcript: string;
  extraction: VoiceOrderExtraction;
}) {
  addEntry(params.farmerId, "conversation", `Farmer said: ${params.transcript}`);
  addEntry(
    params.farmerId,
    "conversation",
    `Assistant result: ${summarizeExtraction(params.extraction)}`,
  );
}

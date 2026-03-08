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
  product: string | null;
  quantity: number | null;
  unit: string | null;
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
  lastTouchedAt: number;
};

export type MemorySearchHit = {
  text: string;
  score: number;
  kind: MemoryKind;
};

const VECTOR_DIMENSION = 256;
const MAX_CONVERSATION_ENTRIES = 80;
const SESSION_TTL_MS = 30 * 60 * 1000;

const farmerMemoryStore = new Map<string, FarmerMemoryStore>();

function buildSessionKey(farmerId: string, conversationSessionId: string) {
  return `${farmerId}::${conversationSessionId}`;
}

function pruneExpiredStores(now: number) {
  for (const [key, store] of farmerMemoryStore) {
    if (now - store.lastTouchedAt > SESSION_TTL_MS) {
      farmerMemoryStore.delete(key);
    }
  }
}

function getStore(
  farmerId: string,
  conversationSessionId: string,
): FarmerMemoryStore {
  const now = Date.now();
  pruneExpiredStores(now);
  const key = buildSessionKey(farmerId, conversationSessionId);
  const existing = farmerMemoryStore.get(key);
  if (existing) return existing;

  const created: FarmerMemoryStore = {
    entries: [],
    pendingDraft: null,
    sequence: 0,
    lastTouchedAt: now,
  };
  farmerMemoryStore.set(key, created);
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

function addEntry(params: {
  farmerId: string;
  conversationSessionId: string;
  kind: MemoryKind;
  text: string;
}) {
  const { farmerId, conversationSessionId, kind, text } = params;
  const trimmedText = text.trim();
  if (!trimmedText) return;

  const store = getStore(farmerId, conversationSessionId);
  store.lastTouchedAt = Date.now();
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
  const product = extraction.product ?? "unknown";
  const quantity =
    extraction.quantity == null ? "unknown" : extraction.quantity.toString();
  const unit = extraction.unit ?? "unknown";
  return [
    `Parsed order details -> product: ${product}, quantity: ${quantity}, unit: ${unit}.`,
    extraction.needsClarification
      ? `Needs clarification: yes. Question: ${extraction.clarificationQuestion ?? "not provided"}.`
      : "Needs clarification: no.",
  ].join(" ");
}

export function indexFarmerProfileMemory(
  params: {
    farmerId: string;
    conversationSessionId: string;
  },
  profile: FarmerProfileSnapshot,
) {
  const store = getStore(params.farmerId, params.conversationSessionId);
  store.lastTouchedAt = Date.now();
  store.entries = store.entries.filter((entry) => entry.kind !== "profile");

  const crops = (profile.cropsGrown ?? []).filter(Boolean).join(", ");
  const profileText = [
    `Farmer profile for ${profile.name?.trim() || "farmer"}.`,
    `Preferred language: ${profile.language?.trim() || "unknown"}.`,
    `Location: village ${profile.village?.trim() || "unknown"}, district ${profile.district?.trim() || "unknown"}, state ${profile.state?.trim() || "unknown"}.`,
    `Crops grown: ${crops || "unknown"}.`,
  ].join(" ");

  addEntry({
    farmerId: params.farmerId,
    conversationSessionId: params.conversationSessionId,
    kind: "profile",
    text: profileText,
  });
}

export function searchFarmerConversationMemory(params: {
  farmerId: string;
  conversationSessionId: string;
  query: string;
  limit?: number;
}): MemorySearchHit[] {
  const limit = params.limit ?? 4;
  if (limit <= 0) return [];

  const store = getStore(params.farmerId, params.conversationSessionId);
  store.lastTouchedAt = Date.now();
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
  params: {
    farmerId: string;
    conversationSessionId: string;
  },
): PendingOrderDraft | null {
  const store = getStore(params.farmerId, params.conversationSessionId);
  store.lastTouchedAt = Date.now();
  return store.pendingDraft;
}

export function setFarmerPendingOrderDraft(params: {
  farmerId: string;
  conversationSessionId: string;
  extraction: VoiceOrderExtraction;
}) {
  const store = getStore(params.farmerId, params.conversationSessionId);
  store.lastTouchedAt = Date.now();
  store.pendingDraft = {
    product: params.extraction.product ?? null,
    quantity: params.extraction.quantity ?? null,
    unit: params.extraction.unit ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function clearFarmerPendingOrderDraft(params: {
  farmerId: string;
  conversationSessionId: string;
}) {
  const store = getStore(params.farmerId, params.conversationSessionId);
  store.lastTouchedAt = Date.now();
  store.pendingDraft = null;
}

export function clearAllFarmerPendingOrderDrafts(farmerId: string) {
  const prefix = `${farmerId}::`;
  const now = Date.now();
  for (const [key, store] of farmerMemoryStore) {
    if (!key.startsWith(prefix)) continue;
    store.pendingDraft = null;
    store.lastTouchedAt = now;
  }
}

export function rememberFarmerConversationTurn(params: {
  farmerId: string;
  conversationSessionId: string;
  transcript: string;
  extraction: VoiceOrderExtraction;
}) {
  addEntry({
    farmerId: params.farmerId,
    conversationSessionId: params.conversationSessionId,
    kind: "conversation",
    text: `Farmer said: ${params.transcript}`,
  });
  addEntry(
    {
      farmerId: params.farmerId,
      conversationSessionId: params.conversationSessionId,
      kind: "conversation",
      text: `Assistant result: ${summarizeExtraction(params.extraction)}`,
    },
  );
}

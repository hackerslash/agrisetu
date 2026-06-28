import { logger } from "./logger.js";

export type ManifestMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ManifestRequestPayload = {
  model: string;
  input: string | ManifestMessage[];
  instructions?: string;
  store: boolean;
  temperature?: number;
  max_output_tokens?: number;
};

export type ManifestResponsePayload = {
  id: string;
  output: Array<{
    type: string;
    content?: Array<{ type: string; text: string }>;
    text?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

const MANIFEST_API_URL = "https://app.manifest.build/v1/responses";

/**
 * Call the Manifest AI API as a drop-in replacement for Bedrock ConverseCommand.
 *
 * Maps the Bedrock-style system/messages/inferenceConfig pattern to the
 * Manifest responses API format.
 */
export async function callManifestAI(params: {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.MANIFEST_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "[manifest-ai] MANIFEST_API_KEY is not set in environment variables",
    );
  }

  const model = "auto";

  const payload: ManifestRequestPayload = {
    model,
    input: params.userContent,
    instructions: params.systemPrompt,
    store: false,
    ...(params.temperature !== undefined
      ? { temperature: params.temperature }
      : {}),
    ...(params.maxTokens !== undefined
      ? { max_output_tokens: params.maxTokens }
      : {}),
  };

  const response = await fetch(MANIFEST_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `[manifest-ai] API returned ${response.status}: ${errorBody}`,
    );
  }

  const data = (await response.json()) as ManifestResponsePayload;

  // Extract text from the response output array
  let resultText = "";
  for (const outputItem of data.output ?? []) {
    // Handle { type: "message", content: [{ type: "output_text", text: "..." }] }
    if (outputItem.content && Array.isArray(outputItem.content)) {
      for (const contentPart of outputItem.content) {
        if (contentPart.text) {
          resultText += contentPart.text;
        }
      }
    }
    // Handle { type: "text", text: "..." } (flat format)
    if (outputItem.text) {
      resultText += outputItem.text;
    }
  }

  if (!resultText) {
    logger.warn("[manifest-ai] Empty response from Manifest API", {
      responseId: data.id,
    });
  }

  return resultText;
}

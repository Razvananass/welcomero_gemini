// AI provider layer. The rest of the server code only knows the `AiProvider` interface,
// so switching to another model provider later means adding one object here and changing getProvider().
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export interface ChatAttachment {
  mimeType: string;
  data: string; // base64 without data: prefix
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  attachment?: ChatAttachment;
}

export interface CompleteArgs {
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
}

export interface AiProvider {
  name: string;
  /** True when the secret key for this provider is present in the server environment. */
  isConfigured(): boolean;
  complete(args: CompleteArgs): Promise<string>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "rate_limited" | "upstream",
  ) {
    super(message);
  }
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 12_000;

/** Sends one JSON request and turns every failure into a ProviderError with a safe, generic message. */

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");

    throw new ProviderError(
      timedOut ? "Request timed out" : "Network error",
      timedOut ? "timeout" : "upstream",
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    let detail = "No error details returned";

    try {
      const parsed = JSON.parse(responseText);
      detail = parsed.error?.message || detail;
    } catch {
      // Ignore invalid JSON error responses.
    }

    if (response.status === 429) {
      throw new ProviderError(`HTTP 429: ${detail}`, "rate_limited");
    }

    throw new ProviderError(`HTTP ${response.status}: ${detail}`, "upstream");
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new ProviderError("Invalid response JSON", "upstream");
  }
}

function nonEmpty(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new ProviderError("Empty response", "upstream");
  return trimmed;
}

function readEnvKey(name: string): string {
  const raw = process.env[name];
  if (!raw) return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

// ---- Anthropic (paid) ------------------------------------------------------------------------
const anthropicProvider: AiProvider = {
  name: "anthropic",

  isConfigured() {
    return Boolean(readEnvKey("ANTHROPIC_API_KEY"));
  },

  async complete({ system, messages, maxTokens }) {
    const apiKey = readEnvKey("ANTHROPIC_API_KEY");
    if (!apiKey) throw new ProviderError("Missing API key", "upstream");
    const mapped = messages.map((m) => ({
      role: m.role,
      content: m.attachment
        ? [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: m.attachment.mimeType,
                data: m.attachment.data,
              },
            },
            { type: "text", text: m.content },
          ]
        : m.content,
    }));
    const data = (await postJson(
      ANTHROPIC_URL,
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      {
        model: process.env.AI_MODEL || "claude-sonnet-5-5",
        max_tokens: maxTokens,
        system,
        messages: mapped,
      },
    )) as { content?: Array<{ type: string; text?: string }> };
    return nonEmpty(
      (data.content ?? [])
        .filter(
          (block) => block.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text)
        .join("\n"),
    );
  },
};

// ---- Google Gemini (default, supports text + multimodal images) -------------------------------
const geminiProvider: AiProvider = {
  name: "gemini",

  isConfigured() {
    return Boolean(readEnvKey("GEMINI_API_KEY"));
  },

  async complete({ system, messages, maxTokens }) {
    const apiKey = readEnvKey("GEMINI_API_KEY");
    if (!apiKey) throw new ProviderError("Missing API key", "upstream");
    const model =
      process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.8-flash";
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const isGemini4 = model.startsWith("gemini-4");
    const isGemini3 = model.startsWith("gemini-3");

    try {
      const response = await ai.models.generateContent({
        model,
        contents: messages.map((m) => {
          const parts: Array<
            { text: string } | { inlineData: { mimeType: string; data: string } }
          > = [];
          if (m.attachment) {
            parts.push({
              inlineData: {
                mimeType: m.attachment.mimeType,
                data: m.attachment.data,
              },
            });
          }
          parts.push({ text: m.content });
          return {
            role: m.role === "assistant" ? "model" : "user",
            parts,
          };
        }),
        config: {
          systemInstruction: system,
          ...(isGemini4
            ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
            : isGemini3
              ? {
                  maxOutputTokens: maxTokens,
                  thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                }
              : model.startsWith("gemini-2.5-flash")
                ? {
                    maxOutputTokens: maxTokens,
                    thinkingConfig: { thinkingBudget: 0 },
                  }
                : { maxOutputTokens: maxTokens }),
          abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      });
      return nonEmpty(response.text ?? "");
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      if (timedOut) {
        throw new ProviderError("Request timed out", "timeout");
      }
      const status =
        typeof (error as { status?: unknown })?.status === "number"
          ? (error as { status: number }).status
          : undefined;
      const msg = error instanceof Error ? error.message : String(error);
      if (
        status === 429 ||
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED")
      ) {
        throw new ProviderError(`HTTP 429: ${msg}`, "rate_limited");
      }
      throw new ProviderError(msg || "Upstream error", "upstream");
    }
  },
};

// ---- Groq (has a free tier; OpenAI-compatible API) ---------------------------------------------
const groqProvider: AiProvider = {
  name: "groq",

  isConfigured() {
    return Boolean(readEnvKey("GROQ_API_KEY"));
  },

  async complete({ system, messages, maxTokens }) {
    const apiKey = readEnvKey("GROQ_API_KEY");
    if (!apiKey) throw new ProviderError("Missing API key", "upstream");
    const model =
      process.env.GROQ_MODEL ||
      (!readEnvKey("GEMINI_API_KEY") ||
      process.env.AI_PROVIDER?.trim().toLowerCase() === "groq"
        ? process.env.AI_MODEL
        : undefined) ||
      "openai/gpt-oss-20b";
    const textMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const body: Record<string, unknown> = {
      model,
      messages: [{ role: "system", content: system }, ...textMessages],
      max_completion_tokens: maxTokens,
      temperature: 0.3,
    };
    // gpt-oss models reason before answering; keep that short so the answer is not cut off.
    if (model.includes("gpt-oss")) body.reasoning_effort = "low";
    const data = (await postJson(
      GROQ_URL,
      { authorization: `Bearer ${apiKey}` },
      body,
    )) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    return nonEmpty(data.choices?.[0]?.message?.content ?? "");
  },
};

const PROVIDERS: Record<string, AiProvider> = {
  gemini: geminiProvider,
  groq: groqProvider,
  anthropic: anthropicProvider,
};

/**
 * Choose the provider.
 * - AI_PROVIDER=gemini | groq | anthropic picks one explicitly.
 * - Otherwise the first one that has a key is used, free options first: gemini, groq, anthropic.
 * With no key at all the (unconfigured) Gemini provider is returned, so the app reports "not available".
 */
export function getProviders(): AiProvider[] {
  const wanted = (process.env.AI_PROVIDER ?? "gemini").trim().toLowerCase();

  const ordered = [
    PROVIDERS[wanted],
    ...Object.values(PROVIDERS).filter(
      (provider) => provider !== PROVIDERS[wanted],
    ),
  ].filter((provider): provider is AiProvider => Boolean(provider));

  return ordered.filter((provider) => provider.isConfigured());
}

export function getProvider(): AiProvider {
  return getProviders()[0] ?? geminiProvider;
}

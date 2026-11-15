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

/** Fixed, safe categories returned to the browser. Never built from upstream text. */
export type FailureReason =
  | "invalid_key"
  | "model_unavailable"
  | "bad_request"
  | "quota_exceeded"
  | "blocked"
  | "empty_response"
  | "timeout"
  | "network"
  | "upstream_5xx"
  | "unknown";

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "rate_limited" | "upstream",
    public readonly reason: FailureReason = kind === "timeout"
      ? "timeout"
      : kind === "rate_limited"
        ? "quota_exceeded"
        : "unknown",
    public readonly status?: number,
  ) {
    super(message);
  }
}

/** Map an upstream HTTP status and message to a safe category. The message is only inspected, never returned. */
export function classifyFailure(
  status: number | undefined,
  message: string,
): FailureReason {
  const msg = message.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    msg.includes("api key not valid") ||
    msg.includes("api_key_invalid") ||
    msg.includes("permission_denied") ||
    msg.includes("unauthenticated") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid x-api-key")
  )
    return "invalid_key";
  if (
    status === 429 ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota")
  )
    return "quota_exceeded";
  if (
    status === 404 ||
    msg.includes("is not found") ||
    msg.includes("model_not_found") ||
    msg.includes("not supported for generatecontent") ||
    msg.includes("does not exist")
  )
    return "model_unavailable";
  if (status === 400) return "bad_request";
  if (status !== undefined && status >= 500) return "upstream_5xx";
  return "unknown";
}

function failureFor(
  status: number | undefined,
  message: string,
): ProviderError {
  const reason = classifyFailure(status, message);
  const kind = reason === "quota_exceeded" ? "rate_limited" : "upstream";
  return new ProviderError(
    `${status !== undefined ? `HTTP ${status}: ` : ""}${message}`,
    kind,
    reason,
    status,
  );
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 12_000;
const GEMINI_THINKING_HEADROOM = 1024;

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
      timedOut ? "timeout" : "network",
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

    throw failureFor(response.status, detail);
  }

  try {
    return JSON.parse(responseText);
  } catch {
    throw new ProviderError("Invalid response JSON", "upstream", "unknown");
  }
}

function nonEmpty(text: string): string {
  const trimmed = text.trim();
  if (!trimmed)
    throw new ProviderError("Empty response", "upstream", "empty_response");
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
    if (!apiKey) throw new ProviderError("Missing API key", "upstream", "invalid_key");
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
    if (!apiKey) throw new ProviderError("Missing API key", "upstream", "invalid_key");
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
                  // Thinking tokens count against maxOutputTokens, so leave room for them.
                  maxOutputTokens: maxTokens + GEMINI_THINKING_HEADROOM,
                  // LOW works on every Gemini 3 model. MINIMAL is rejected by 3.8 Flash (the default model).
                  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
      const text = (response.text ?? "").trim();
      if (!text) {
        const blocked =
          Boolean(response.promptFeedback?.blockReason) ||
          (response.candidates ?? []).some((c) =>
            ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(
              String(c?.finishReason ?? ""),
            ),
          );
        if (blocked)
          throw new ProviderError("Response blocked", "upstream", "blocked");
      }
      return nonEmpty(text);
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
      const failure = failureFor(status, msg || "Upstream error");
      if (failure.reason === "unknown" && status === undefined) {
        const lower = msg.toLowerCase();
        if (
          (error instanceof Error && error.name === "TypeError") ||
          lower.includes("fetch failed") ||
          lower.includes("econn") ||
          lower.includes("enotfound") ||
          lower.includes("network")
        ) {
          throw new ProviderError(msg, "upstream", "network");
        }
      }
      throw failure;
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
    if (!apiKey) throw new ProviderError("Missing API key", "upstream", "invalid_key");
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

/** Effective model name for a provider (not secret). Mirrors the selection inside each provider. */
export function effectiveModel(name: string): string | undefined {
  if (name === "gemini")
    return process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.8-flash";
  if (name === "anthropic") return process.env.AI_MODEL || "claude-sonnet-5-5";
  if (name === "groq")
    return (
      process.env.GROQ_MODEL ||
      (!readEnvKey("GEMINI_API_KEY") ||
      process.env.AI_PROVIDER?.trim().toLowerCase() === "groq"
        ? process.env.AI_MODEL
        : undefined) ||
      "openai/gpt-oss-20b"
    );
  return undefined;
}

export function getProvider(): AiProvider {
  return getProviders()[0] ?? geminiProvider;
}

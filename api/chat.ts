// Serverless endpoint used by the AI assistant, document explainer, and custom Romanian message feature.
//
//   GET  /api/chat  -> { configured: boolean, provider?: string }
//   POST /api/chat  -> { reply: string }
//
// The API key is read from process.env on the SERVER only. It is never sent to the browser.
import {
  getProviders,
  ProviderError,
  type ChatAttachment,
  type ChatMessage,
} from "./_lib/provider.js";
import { buildKnowledge, procedureTitle } from "./_lib/knowledge.js";
import {
  buildSystemPrompt,
  type Direction,
  type Language,
  type Mode,
  type UserContextSummary,
} from "./_lib/prompt.js";
import { getLiveUpdatesPromptBlock } from "./_lib/sourcesMonitor.js";

const MAX_BODY_CHARS = 6_000_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_ATTACHMENT_BASE64 = 5_500_000;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LANGUAGES: Language[] = ["en", "ro", "fr", "ar", "uk", "ne"];
const DIRECTIONS: Direction[] = ["to_user", "to_ro"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function parseAttachment(value: unknown): ChatAttachment | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") return null;
  const { mimeType, data } = value as { mimeType?: unknown; data?: unknown };
  if (typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return null;
  }
  if (
    typeof data !== "string" ||
    data.length === 0 ||
    data.length > MAX_ATTACHMENT_BASE64 ||
    !/^[A-Za-z0-9+/=]+$/.test(data)
  ) {
    return null;
  }
  return { mimeType, data };
}

function parseMessages(value: unknown): ChatMessage[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_MESSAGES
  )
    return null;
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { role, content, attachment } = item as {
      role?: unknown;
      content?: unknown;
      attachment?: unknown;
    };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_MESSAGE_CHARS) return null;
    const parsedAttachment = parseAttachment(attachment);
    if (parsedAttachment === null) return null;
    if (parsedAttachment && role !== "user") return null;
    messages.push(
      parsedAttachment
        ? { role, content: trimmed, attachment: parsedAttachment }
        : { role, content: trimmed },
    );
  }
  return messages[messages.length - 1].role === "user" ? messages : null;
}

function parseUserContext(value: unknown): UserContextSummary | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const safeStr = (v: unknown, max = 40) =>
    typeof v === "string" ? v.trim().slice(0, max) : undefined;
  return {
    situation: safeStr(raw.situation, 20),
    citizenship: safeStr(raw.citizenship, 20),
    accommodation: safeStr(raw.accommodation, 24),
    arrival: safeStr(raw.arrival, 16),
    expiry: safeStr(raw.expiry, 16),
    completedCount:
      typeof raw.completedCount === "number" && Number.isFinite(raw.completedCount)
        ? Math.max(0, Math.min(20, raw.completedCount))
        : undefined,
    totalCount:
      typeof raw.totalCount === "number" && Number.isFinite(raw.totalCount)
        ? Math.max(0, Math.min(20, raw.totalCount))
        : undefined,
  };
}

export function GET(): Response {
  const providers = getProviders();
  return json({
    configured: providers.length > 0,
    ...(providers[0] ? { provider: providers[0].name } : {}),
  });
}

export async function POST(request: Request): Promise<Response> {
  let payload: {
    mode?: unknown;
    language?: unknown;
    messages?: unknown;
    procedureId?: unknown;
    userContext?: unknown;
    direction?: unknown;
  };

  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS)
      return json({ error: "bad_request" }, 400);
    payload = JSON.parse(text);
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const mode: Mode =
    payload.mode === "phrase"
      ? "phrase"
      : payload.mode === "document"
        ? "document"
        : payload.mode === "form"
          ? "form"
          : payload.mode === "interpret"
            ? "interpret"
            : payload.mode === "translate"
              ? "translate"
              : "chat";
  const language = LANGUAGES.find((l) => l === payload.language);
  const messages = parseMessages(payload.messages);
  if (!language || !messages) return json({ error: "bad_request" }, 400);
  const direction = DIRECTIONS.find((d) => d === payload.direction);
  if (mode === "interpret" && (!direction || messages.length !== 1)) {
    return json({ error: "bad_request" }, 400);
  }

  const providers = getProviders();
  if (providers.length === 0) return json({ error: "not_configured" }, 503);

  const focusProcedure =
    typeof payload.procedureId === "string"
      ? procedureTitle(payload.procedureId)
      : null;

  const hasAttachment = messages.some((m) => Boolean(m.attachment));
  // Only vision-capable providers (Gemini / Anthropic) can inspect images; skip text-only Groq if image attached.
  const eligibleProviders = hasAttachment
    ? providers.filter((p) => p.name !== "groq")
    : providers;
  if (eligibleProviders.length === 0) {
    return json({ error: "not_configured" }, 503);
  }

  const input = {
    system: buildSystemPrompt({
      mode,
      language,
      knowledge: buildKnowledge(),
      focusProcedure,
      userContext: parseUserContext(payload.userContext),
      liveUpdates: getLiveUpdatesPromptBlock(),
      direction,
    }),
    messages,
    maxTokens:
      mode === "phrase"
        ? 200
        : mode === "document"
          ? 700
          : mode === "form"
            ? 2000
            : mode === "interpret"
              ? 600
              : mode === "translate"
                ? 4000
                : 500,
  };

  let lastError: unknown;

  for (const provider of eligibleProviders) {
    try {
      const reply = await provider.complete(input);
      return json({ reply });
    } catch (error) {
      lastError = error;
      const kind = error instanceof ProviderError ? error.kind : "upstream";

      console.error(
        `[api/chat] ${provider.name} failed:`,
        error instanceof Error ? error.message : kind,
      );
    }
  }

  const kind = lastError instanceof ProviderError ? lastError.kind : "upstream";

  if (kind === "rate_limited") return json({ error: "rate_limited" }, 429);
  if (kind === "timeout") return json({ error: "upstream_timeout" }, 504);

  return json({ error: "upstream_error" }, 502);
}

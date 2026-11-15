// Server-side ElevenLabs Text-to-Speech proxy (/api/tts).
// Keeps ELEVENLABS_API_KEY strictly on the server and returns audio/mpeg for natural Romanian pronunciation.
import { checkRateLimit, rateLimitedResponse } from './_lib/rateLimit.js';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const MAX_TEXT_CHARS = 600;
const TTS_TIMEOUT_MS = 12_000;

export const CURATED_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Warm & Clear', key: 'warm' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'Calm & Steady', key: 'calm' },
] as const;

function readEnv(name: string): string {
  const raw = process.env[name];
  if (!raw) return '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function resolveVoiceId(requestedKey: unknown): string {
  const envVoice = readEnv('ELEVENLABS_VOICE_ID');
  if (requestedKey === 'calm') return CURATED_VOICES[1].id;
  if (requestedKey === 'warm') return CURATED_VOICES[0].id;
  return envVoice || CURATED_VOICES[0].id;
}

function sanitizeSpeechText(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function GET(): Response {
  const configured = Boolean(readEnv('ELEVENLABS_API_KEY'));
  return json({
    configured,
    provider: configured ? 'elevenlabs' : 'browser',
    voices: CURATED_VOICES.map((v) => ({ key: v.key, label: v.label })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = checkRateLimit(request, 'tts', 60, 10 * 60_000);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit.retryAfterSeconds);

  const apiKey = readEnv('ELEVENLABS_API_KEY');
  if (!apiKey) {
    return json({ error: 'not_configured' }, 503);
  }

  let payload: { text?: unknown; speed?: unknown; voice?: unknown };
  try {
    payload = (await request.json()) as { text?: unknown; speed?: unknown; voice?: unknown };
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  if (typeof payload.text !== 'string') {
    return json({ error: 'bad_request' }, 400);
  }

  const cleanText = sanitizeSpeechText(payload.text);
  if (!cleanText || cleanText.length > MAX_TEXT_CHARS) {
    return json({ error: 'bad_request' }, 400);
  }

  const speed = payload.speed === 'slow' ? 0.78 : 1.0;
  const voiceId = resolveVoiceId(payload.voice);
  const modelId = readEnv('ELEVENLABS_MODEL_ID') || 'eleven_flash_v2_5';

  const body: Record<string, unknown> = {
    text: cleanText,
    model_id: modelId,
    voice_settings: {
      stability: 0.55,
      similarity_boost: 0.78,
      speed,
    },
  };

  if (modelId.includes('flash') || modelId.includes('turbo')) {
    body.language_code = 'ro';
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${ELEVENLABS_BASE}/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return json({ error: timedOut ? 'upstream_timeout' : 'upstream_error' }, timedOut ? 504 : 502);
  }

  if (upstream.status === 429) {
    return json({ error: 'rate_limited' }, 429);
  }

  if (!upstream.ok) {
    console.error('[api/tts] ElevenLabs upstream status:', upstream.status);
    return json({ error: 'upstream_error' }, 502);
  }

  const audioBuffer = await upstream.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    return json({ error: 'upstream_error' }, 502);
  }

  return new Response(audioBuffer, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
      'cache-control': 'private, max-age=3600',
    },
  });
}

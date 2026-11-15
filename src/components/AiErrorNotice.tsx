import { useI18n } from '../context/useI18n';
import type { MessageKey } from '../i18n';
import { AiError } from '../lib/ai';
import { Notice } from './ui';

// Short English explanations for the site owner. The reason codes come from the server (api/chat.ts)
// and are fixed strings, so they are shown as-is and not translated.
const EXPLANATIONS: Record<string, string> = {
  invalid_key: 'The AI key was rejected. Create a new key in Google AI Studio, paste only the key into GEMINI_API_KEY in Vercel (no quotes, no spaces), and redeploy.',
  key_blocked: 'Google blocked this key (leaked, suspended or denied). Create a new key in Google AI Studio, replace GEMINI_API_KEY in Vercel, and redeploy.',
  api_disabled: 'The Gemini API is not enabled for the project that owns this key. Create the key in Google AI Studio, or enable the Generative Language API in Google Cloud.',
  model_unavailable: 'The AI model was not found. Remove AI_MODEL/GEMINI_MODEL, or set a model your key can use.',
  bad_request: 'The AI service rejected the request. Check GEMINI_MODEL / AI_MODEL in Vercel (or leave them empty) and redeploy. The exact reason is in the Vercel function log for /api/chat.',
  region_unsupported: 'The AI service is not available from the server region. Change the Vercel function region (e.g. to an EU or US region).',
  quota_exceeded: 'The AI quota is used up. Wait a while or check the quota in Google AI Studio.',
  blocked: 'The AI blocked this answer for safety reasons. Try rephrasing.',
  empty_response: 'The AI returned an empty answer. Try again.',
  timeout: 'The AI took too long to answer. Try again.',
  network: 'The server could not reach the AI service.',
  upstream_5xx: 'The AI service had a temporary error. Try again later.',
  unknown: 'Unknown AI error. Check the server log in Vercel.',
};

/** The technical reason carried by an AI error, if the server sent one. */
export function aiErrorReason(caught: unknown): string | null {
  return caught instanceof AiError && caught.reason ? caught.reason : null;
}

/** Error box for failed AI calls: the usual message plus a technical "Details: reason" line and an English hint. */
export function AiErrorNotice({ messageKey, reason }: { messageKey: MessageKey; reason?: string | null }) {
  const { t } = useI18n();
  return (
    <Notice tone="error" role="alert">
      {t(messageKey)}
      {reason ? (
        <span className="mt-1 block text-sm opacity-80">
          <span dir="auto" className="block">{t('ai.errorDetail', { reason })}</span>
          <span dir="ltr" className="block text-start">{EXPLANATIONS[reason] ?? EXPLANATIONS.unknown}</span>
        </span>
      ) : null}
    </Notice>
  );
}

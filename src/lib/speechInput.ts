// Thin wrapper over the browser's Web Speech API (SpeechRecognition) for the counter mode.
// Support varies a lot: Chrome/Edge (incl. Android) work; Safari/iOS and Firefox often do not.
// When it is not available, the UI falls back to typing, so nothing here is required.

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};

function getConstructor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechInputSupported(): boolean {
  return getConstructor() !== null;
}

/** BCP-47 tags the recogniser understands, per app language. */
const RECOGNITION_LOCALES: Record<string, string> = {
  en: 'en-US',
  ro: 'ro-RO',
  fr: 'fr-FR',
  ar: 'ar',
  uk: 'uk-UA',
  ne: 'ne-NP',
  ru: 'ru-RU',
  es: 'es-ES',
  tr: 'tr-TR',
  hi: 'hi-IN',
  bn: 'bn-BD',
  fa: 'fa-IR',
  ur: 'ur-PK',
  vi: 'vi-VN',
  zh: 'zh-CN',
  de: 'de-DE',
};

export interface Listener {
  stop: () => void;
}

/**
 * Listen once and report the recognised text. `onPartial` fires with live guesses,
 * `onResult` with the final text, `onError`/`onEnd` to reset the UI. Returns a handle to stop early.
 */
export function listenOnce(args: {
  lang: string;
  onPartial?: (text: string) => void;
  onResult: (text: string) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}): Listener | null {
  const Ctor = getConstructor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = RECOGNITION_LOCALES[args.lang] ?? 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finalText = '';
  recognition.onresult = (event) => {
    let interim = '';
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) finalText += transcript;
      else interim += transcript;
    }
    if (interim && args.onPartial) args.onPartial((finalText + interim).trim());
  };
  recognition.onerror = (event) => args.onError?.(event.error ?? 'error');
  recognition.onend = () => {
    if (finalText.trim()) args.onResult(finalText.trim());
    args.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
  };
}

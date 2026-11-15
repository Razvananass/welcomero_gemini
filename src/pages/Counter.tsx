import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { AiError, checkAvailability, interpret, type AiAvailability, type InterpretDirection } from '../lib/ai';
import { listenOnce, speechInputSupported, type Listener } from '../lib/speechInput';
import { speakRomanianAsync, stopSpeaking } from '../lib/speech';
import { btnPrimary, btnSecondary, cardClass, inputClass, Notice, PageHeader, SpeakButtons } from '../components/ui';
import { Icon } from '../components/Icon';
import type { MessageKey } from '../i18n';

interface Turn {
  id: number;
  direction: InterpretDirection;
  /** What was said or typed. */
  source: string;
  /** The translation. */
  result: string;
}

const MAX_TURNS = 30;

function MicButton({
  listening,
  disabled,
  onClick,
  label,
  stopLabel,
}: {
  listening: boolean;
  disabled: boolean;
  onClick: () => void;
  label: string;
  stopLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
        listening ? 'border-red-700 bg-red-700 text-white' : 'border-brand-700 bg-white text-brand-800 hover:bg-brand-50'
      }`}
    >
      <Icon name="volume" className="size-4" />
      {listening ? stopLabel : label}
    </button>
  );
}

export function Counter() {
  const { language } = useApp();
  const { t } = useI18n();
  const [availability, setAvailability] = useState<AiAvailability | 'checking'>('checking');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [userText, setUserText] = useState('');
  const [clerkText, setClerkText] = useState('');
  const [busy, setBusy] = useState<InterpretDirection | null>(null);
  const [listening, setListening] = useState<InterpretDirection | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [fullscreen, setFullscreen] = useState<number | null>(null);
  const listenerRef = useRef<Listener | null>(null);
  const nextId = useRef(1);
  const micSupported = speechInputSupported();

  useEffect(() => {
    let cancelled = false;
    checkAvailability().then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => {
      cancelled = true;
      listenerRef.current?.stop();
      stopSpeaking();
    };
  }, []);

  const unavailable = availability === 'not_configured' || availability === 'unreachable';
  const latestToRo = turns.find((turn) => turn.direction === 'to_ro');
  const fullscreenTurn = turns.find((turn) => turn.id === fullscreen) ?? null;

  async function translate(direction: InterpretDirection, text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(direction);
    setError(null);
    try {
      const result = await interpret({ text: clean, language, direction });
      const turn: Turn = { id: nextId.current++, direction, source: clean, result };
      setTurns((current) => [turn, ...current].slice(0, MAX_TURNS));
      if (direction === 'to_ro') {
        setUserText('');
        if (autoSpeak && result && result !== '?') void speakRomanianAsync(result, {});
      } else {
        setClerkText('');
      }
    } catch (caught) {
      const code = caught instanceof AiError ? caught.code : 'failed';
      if (code === 'not_configured') setAvailability('not_configured');
      else if (code === 'unreachable') setAvailability('unreachable');
      else setError(code === 'rate_limited' ? 'ai.rateLimited' : 'ai.error');
    } finally {
      setBusy(null);
    }
  }

  function toggleListening(direction: InterpretDirection) {
    if (listening) {
      listenerRef.current?.stop();
      return;
    }
    stopSpeaking();
    setError(null);
    const setText = direction === 'to_ro' ? setUserText : setClerkText;
    const handle = listenOnce({
      // The clerk speaks Romanian; the user speaks their own language.
      lang: direction === 'to_ro' ? language : 'ro',
      onPartial: setText,
      onResult: (text) => {
        setText(text);
        void translate(direction, text);
      },
      onError: (code) => setError(code === 'not-allowed' || code === 'service-not-allowed' ? 'counter.micDenied' : 'counter.micError'),
      onEnd: () => {
        setListening(null);
        listenerRef.current = null;
      },
    });
    if (!handle) {
      setError('counter.micError');
      return;
    }
    listenerRef.current = handle;
    setListening(direction);
  }

  function submit(direction: InterpretDirection) {
    return (event: FormEvent) => {
      event.preventDefault();
      void translate(direction, direction === 'to_ro' ? userText : clerkText);
    };
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('counter.title')} subtitle={t('counter.subtitle')} />
      <Notice>{t('counter.disclaimer')}</Notice>

      {unavailable ? (
        <Notice tone="warning" title={t('ai.unavailable.title')} role="status">
          {availability === 'not_configured' ? t('ai.unavailable.body') : t('ai.unreachable.body')}
        </Notice>
      ) : null}
      {!micSupported ? <p className="text-sm text-muted">{t('counter.noMic')}</p> : null}

      {/* 1. The newcomer says something, the app shows it in Romanian. */}
      <section className={cardClass} aria-labelledby="counter-me-title">
        <h2 id="counter-me-title" className="text-lg font-bold text-brand-900">
          {t('counter.me.title')}
        </h2>
        <form onSubmit={submit('to_ro')} className="mt-3 space-y-3">
          <label htmlFor="counter-me" className="sr-only">
            {t('counter.me.placeholder')}
          </label>
          <textarea
            id="counter-me"
            rows={3}
            maxLength={600}
            value={userText}
            onChange={(event) => setUserText(event.target.value)}
            placeholder={t('counter.me.placeholder')}
            disabled={unavailable || busy !== null}
            className={`${inputClass} resize-y disabled:bg-slate-100`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className={btnPrimary} disabled={unavailable || busy !== null || userText.trim() === ''}>
              {busy === 'to_ro' ? t('ai.thinking') : t('counter.me.submit')}
            </button>
            {micSupported ? (
              <MicButton
                listening={listening === 'to_ro'}
                disabled={unavailable || busy !== null || listening === 'to_user'}
                onClick={() => toggleListening('to_ro')}
                label={t('counter.mic')}
                stopLabel={t('counter.micStop')}
              />
            ) : null}
            <label className="ms-auto inline-flex items-center gap-2 text-sm font-medium text-brand-900">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(event) => setAutoSpeak(event.target.checked)}
                className="size-4 accent-brand-700"
              />
              {t('counter.autoSpeak')}
            </label>
          </div>
        </form>

        {latestToRo ? (
          <div className="mt-4 rounded-xl border-2 border-brand-700 bg-brand-50 p-4" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-wide text-brand-800">{t('counter.showClerk')}</p>
            <p lang="ro" dir="ltr" className="mt-1 whitespace-pre-wrap text-2xl font-extrabold leading-snug text-ink">
              {latestToRo.result}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <SpeakButtons text={latestToRo.result} />
              <button type="button" className={btnSecondary} onClick={() => setFullscreen(latestToRo.id)}>
                {t('counter.fullscreen')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* 2. The clerk speaks Romanian, the app shows it in the user's language. */}
      <section className={cardClass} aria-labelledby="counter-clerk-title">
        <h2 id="counter-clerk-title" className="text-lg font-bold text-brand-900">
          {t('counter.clerk.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('counter.clerk.hint')}</p>
        <form onSubmit={submit('to_user')} className="mt-3 space-y-3">
          <label htmlFor="counter-clerk" className="sr-only">
            {t('counter.clerk.placeholder')}
          </label>
          <textarea
            id="counter-clerk"
            lang="ro"
            rows={2}
            maxLength={600}
            value={clerkText}
            onChange={(event) => setClerkText(event.target.value)}
            placeholder={t('counter.clerk.placeholder')}
            disabled={unavailable || busy !== null}
            className={`${inputClass} resize-y disabled:bg-slate-100`}
          />
          <div className="flex flex-wrap items-center gap-2">
            {micSupported ? (
              <MicButton
                listening={listening === 'to_user'}
                disabled={unavailable || busy !== null || listening === 'to_ro'}
                onClick={() => toggleListening('to_user')}
                label={t('counter.clerk.mic')}
                stopLabel={t('counter.micStop')}
              />
            ) : null}
            <button type="submit" className={btnSecondary} disabled={unavailable || busy !== null || clerkText.trim() === ''}>
              {busy === 'to_user' ? t('ai.thinking') : t('counter.clerk.submit')}
            </button>
          </div>
        </form>
      </section>

      {error ? (
        <Notice tone="error" role="alert">
          {t(error)}
        </Notice>
      ) : null}

      {/* The conversation, newest first. */}
      {turns.length > 0 ? (
        <section aria-labelledby="counter-history-title" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="counter-history-title" className="text-base font-bold text-brand-900">
              {t('counter.history')}
            </h2>
            <button type="button" className="text-sm font-semibold text-brand-700 underline underline-offset-2" onClick={() => setTurns([])}>
              {t('counter.clear')}
            </button>
          </div>
          <ul className="space-y-3">
            {turns.map((turn) => (
              <li
                key={turn.id}
                className={`rounded-2xl border p-4 ${turn.direction === 'to_ro' ? 'border-brand-200 bg-brand-50' : 'border-slate-200 bg-white'}`}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-muted">
                  {turn.direction === 'to_ro' ? t('counter.history.me') : t('counter.history.clerk')}
                </p>
                <p lang={turn.direction === 'to_ro' ? language : 'ro'} className="mt-1 text-sm text-muted">
                  {turn.source}
                </p>
                <p lang={turn.direction === 'to_ro' ? 'ro' : language} className="mt-1 whitespace-pre-wrap text-lg font-semibold text-ink">
                  {turn.result}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {fullscreenTurn ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('counter.showClerk')}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center"
        >
          <p lang="ro" dir="ltr" className="max-w-3xl whitespace-pre-wrap text-4xl font-extrabold leading-snug text-ink sm:text-5xl">
            {fullscreenTurn.result}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" className={btnPrimary} onClick={() => void speakRomanianAsync(fullscreenTurn.result, {})}>
              <Icon name="volume" className="size-4" />
              {t('help.listen')}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setFullscreen(null)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

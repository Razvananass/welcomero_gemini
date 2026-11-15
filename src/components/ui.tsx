// Small reusable building blocks, so every page looks and behaves the same.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../context/useI18n';
import { Icon } from './Icon';
import { copyText } from '../lib/clipboard';
import {
  checkTtsStatus,
  getSupport,
  speakRomanianAsync,
  speechSupported,
  stopSpeaking,
  type SpeechSupport,
} from '../lib/speech';
import type { Reliability, TaskStatus } from '../types';

export const btnPrimary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-5 py-2.5 text-base font-semibold text-white shadow-sm hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50';
export const btnSecondary =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-brand-700 bg-white px-5 py-2.5 text-base font-semibold text-brand-800 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50';
export const linkClass = 'font-medium text-brand-700 underline underline-offset-2 hover:text-brand-900';
export const cardClass = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';
export const inputClass =
  'block w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-base text-ink placeholder:text-slate-500';

/** An arrow that flips automatically in right-to-left languages. */
export function Arrow() {
  return <Icon name="arrow" className="size-4" flip />;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{title}</h1>
      {subtitle ? <p className="mt-2 max-w-3xl text-muted">{subtitle}</p> : null}
    </header>
  );
}

const LEVEL_STYLES: Record<Reliability, { box: string; symbol: string }> = {
  verified: { box: 'bg-emerald-100 text-emerald-900', symbol: '✓' },
  recommended: { box: 'bg-brand-100 text-brand-900', symbol: '★' },
  confirm: { box: 'bg-amber-100 text-amber-900', symbol: '!' },
};

/** Shows how reliable a piece of information is. The symbol means it is not communicated by colour alone. */
export function LevelBadge({ level }: { level: Reliability }) {
  const { t } = useI18n();
  const style = LEVEL_STYLES[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.box}`}>
      <span aria-hidden="true">{style.symbol}</span>
      {t(`level.${level}`)}
    </span>
  );
}

const STATUS_STYLES: Record<TaskStatus, string> = {
  'not-started': 'bg-slate-100 text-slate-800',
  'in-progress': 'bg-sky-100 text-sky-900',
  completed: 'bg-emerald-100 text-emerald-900',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useI18n();
  const symbol = status === 'completed' ? '✓ ' : status === 'in-progress' ? '… ' : '';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {symbol}
      {t(`status.${status}`)}
    </span>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div className="h-full rounded-full bg-brand-700 transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Circular progress. The number in the middle is decorative; the percentage is also read out by the progressbar role. */
export function ProgressRing({ percent, label, size = 132 }: { percent: number; label: string; size?: number }) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-slate-200)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-brand-700)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
        />
      </svg>
      <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-3xl font-extrabold text-brand-900" dir="ltr">
        {percent}%
      </span>
    </div>
  );
}

const NOTICE_STYLES = {
  info: 'border-brand-200 bg-brand-50 text-brand-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  error: 'border-red-300 bg-red-50 text-red-900',
} as const;

export function Notice({
  tone = 'info',
  title,
  children,
  role,
}: {
  tone?: keyof typeof NOTICE_STYLES;
  title?: string;
  children: ReactNode;
  role?: 'alert' | 'status';
}) {
  return (
    <div role={role} className={`rounded-xl border px-4 py-3 text-sm ${NOTICE_STYLES[tone]}`}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function handleCopy() {
    const ok = await copyText(text);
    if (!ok) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={handleCopy} className={className ?? btnSecondary} aria-live="polite">
      {copied ? `✓ ${t('common.copied')}` : t('common.copy')}
    </button>
  );
}

function AudioWave() {
  return (
    <span className="inline-flex items-end gap-0.5" aria-hidden="true">
      <span className="audio-wave-bar" />
      <span className="audio-wave-bar" />
      <span className="audio-wave-bar" />
      <span className="audio-wave-bar" />
    </span>
  );
}

/** Listen buttons (normal + slow) for Romanian text: ElevenLabs natural voice first, browser fallback. */
export function SpeakButtons({ text }: { text: string }) {
  const { t } = useI18n();
  const [activeMode, setActiveMode] = useState<'normal' | 'slow' | null>(null);
  const [loadingMode, setLoadingMode] = useState<'normal' | 'slow' | null>(null);
  const support = useSpeechSupport();
  useEffect(() => () => stopSpeaking(), []);

  if (support === 'unsupported') return null;
  const disabled = support === 'no-romanian-voice';

  async function play(slow: boolean) {
    const mode = slow ? 'slow' : 'normal';
    if (activeMode === mode || loadingMode === mode) {
      stopSpeaking();
      setActiveMode(null);
      setLoadingMode(null);
      return;
    }
    setLoadingMode(mode);
    setActiveMode(null);

    const engine = await speakRomanianAsync(text, {
      slow,
      onStart: () => {
        setLoadingMode((cur) => (cur === mode ? null : cur));
        setActiveMode(mode);
      },
      onEnd: () => {
        setLoadingMode((cur) => (cur === mode ? null : cur));
        setActiveMode((cur) => (cur === mode ? null : cur));
      },
    });

    if (!engine) {
      setLoadingMode(null);
      setActiveMode(null);
    }
  }

  const normalActive = activeMode === 'normal';
  const slowActive = activeMode === 'slow';

  return (
    <>
      <button
        type="button"
        className={`${normalActive ? `${btnPrimary} ring-2 ring-brand-200 animate-pop` : btnSecondary} transition-all active:scale-95`}
        onClick={() => void play(false)}
        disabled={disabled}
        aria-pressed={normalActive}
      >
        {normalActive ? (
          <>
            <AudioWave />
            <span>{t('help.stop')}</span>
          </>
        ) : (
          <>
            <Icon name={loadingMode === 'normal' ? 'timer' : 'volume'} className="size-4" />
            <span>{loadingMode === 'normal' ? t('help.speech.loading') : t('help.listen')}</span>
          </>
        )}
      </button>
      <button
        type="button"
        className={`${slowActive ? `${btnPrimary} ring-2 ring-brand-200 animate-pop` : btnSecondary} transition-all active:scale-95`}
        onClick={() => void play(true)}
        disabled={disabled}
        aria-pressed={slowActive}
      >
        {slowActive ? (
          <>
            <AudioWave />
            <span>{t('help.stop')}</span>
          </>
        ) : (
          <>
            <Icon name="timer" className="size-4" />
            <span>{loadingMode === 'slow' ? t('help.speech.loading') : t('help.listenSlow')}</span>
          </>
        )}
      </button>
    </>
  );
}

/** Voices load asynchronously in most browsers, and ElevenLabs availability is checked once from /api/tts. */
export function useSpeechSupport(): SpeechSupport {
  const [support, setSupport] = useState<SpeechSupport>(getSupport);
  useEffect(() => {
    let cancelled = false;
    checkTtsStatus().then((status) => {
      if (!cancelled && status.elevenLabsConfigured) {
        setSupport('elevenlabs');
      }
    });
    if (speechSupported()) {
      const update = () => {
        if (!cancelled) setSupport(getSupport());
      };
      update();
      window.speechSynthesis.addEventListener?.('voiceschanged', update);
      return () => {
        cancelled = true;
        window.speechSynthesis.removeEventListener?.('voiceschanged', update);
      };
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return support;
}

/** The label that explains the three reliability levels. */
export function LevelLegend() {
  const { t } = useI18n();
  const levels: Reliability[] = ['verified', 'recommended', 'confirm'];
  return (
    <details className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-brand-900">{t('level.legend')}</summary>
      <ul className="mt-3 space-y-2">
        {levels.map((level) => (
          <li key={level} className="flex flex-wrap items-start gap-2">
            <LevelBadge level={level} />
            <span className="text-muted">{t(`level.${level}.desc`)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

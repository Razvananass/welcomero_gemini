import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import {
  buildQuiz,
  DECKS,
  deckProgress,
  rateAttempt,
  sanitizeKnown,
  toggleKnown,
  totalProgress,
  type Card,
  type Question,
  type Rating,
} from '../lib/practice';
import { listenOnce, speechInputSupported, type Listener } from '../lib/speechInput';
import { stopSpeaking } from '../lib/speech';
import { localData, STORAGE_KEYS } from '../lib/storage';
import { btnPrimary, btnSecondary, cardClass, Notice, PageHeader, ProgressBar, SpeakButtons } from '../components/ui';
import { Icon } from '../components/Icon';
import type { MessageKey } from '../i18n';

type Mode = 'cards' | 'quiz';

const RATING_TEXT: Record<Rating, { key: MessageKey; symbol: string; box: string }> = {
  great: { key: 'practice.rate.great', symbol: '✓', box: 'bg-emerald-100 text-emerald-900' },
  close: { key: 'practice.rate.close', symbol: '~', box: 'bg-amber-100 text-amber-900' },
  again: { key: 'practice.rate.again', symbol: '!', box: 'bg-slate-100 text-slate-800' },
};

function Meaning({ card }: { card: Card }) {
  const { loc, lang } = useI18n();
  return (
    <div>
      <p lang={lang === 'ro' ? 'en' : lang} className="text-lg font-semibold text-ink">
        {loc(card.meaning)}
      </p>
      {lang !== 'en' && lang !== 'ro' && card.meaning.en ? (
        <p lang="en" dir="ltr" className="mt-1 text-sm text-muted">
          {card.meaning.en}
        </p>
      ) : null}
    </div>
  );
}

export function Practice() {
  const { language } = useApp();
  const { t, loc } = useI18n();
  const [deckId, setDeckId] = useState(DECKS[0].id);
  const [mode, setMode] = useState<Mode>('cards');
  const [known, setKnown] = useState<string[]>(() => sanitizeKnown(localData.read<unknown>(STORAGE_KEYS.practice, [])));
  const [index, setIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(false);
  const [listening, setListening] = useState(false);
  const [attempt, setAttempt] = useState<{ heard: string; rating: Rating } | null>(null);
  const [micError, setMicError] = useState(false);
  const listenerRef = useRef<Listener | null>(null);
  const micSupported = speechInputSupported();

  // Quiz state.
  const [quizRun, setQuizRun] = useState(0);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const deck = DECKS.find((d) => d.id === deckId) ?? DECKS[0];
  const card = deck.cards[Math.min(index, deck.cards.length - 1)];
  const overall = totalProgress(known);
  const questions = useMemo<Question[]>(() => buildQuiz(deck, known, 5), [deck, quizRun]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    localData.write(STORAGE_KEYS.practice, known);
  }, [known]);

  useEffect(
    () => () => {
      listenerRef.current?.stop();
      stopSpeaking();
    },
    [],
  );

  function resetCardState() {
    listenerRef.current?.stop();
    stopSpeaking();
    setShowMeaning(false);
    setAttempt(null);
    setMicError(false);
  }

  function chooseDeck(id: string) {
    setDeckId(id);
    setIndex(0);
    resetCardState();
    restartQuiz();
  }

  function move(delta: number) {
    resetCardState();
    setIndex((current) => (current + delta + deck.cards.length) % deck.cards.length);
  }

  function restartQuiz() {
    setQuizRun((n) => n + 1);
    setStep(0);
    setPicked(null);
    setScore(0);
  }

  function sayIt() {
    if (listening) {
      listenerRef.current?.stop();
      return;
    }
    stopSpeaking();
    setAttempt(null);
    setMicError(false);
    const handle = listenOnce({
      lang: 'ro',
      onResult: (heard) => setAttempt({ heard, rating: rateAttempt(card.ro, heard) }),
      onError: () => setMicError(true),
      onEnd: () => {
        setListening(false);
        listenerRef.current = null;
      },
    });
    if (!handle) {
      setMicError(true);
      return;
    }
    listenerRef.current = handle;
    setListening(true);
  }

  function answer(optionIndex: number) {
    if (picked !== null) return;
    const question = questions[step];
    setPicked(optionIndex);
    if (optionIndex === question.correctIndex) {
      setScore((current) => current + 1);
      setKnown((current) => toggleKnown(current, question.card.id, true));
    }
  }

  const finished = mode === 'quiz' && step >= questions.length;
  const question = mode === 'quiz' && !finished ? questions[step] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('practice.title')} subtitle={t('practice.subtitle')} />

      <section className={cardClass} aria-labelledby="practice-progress-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="practice-progress-title" className="text-base font-bold text-brand-900">
            {t('practice.progress', { known: overall.known, total: overall.total })}
          </h2>
          <span className="text-sm font-semibold text-muted">{overall.percent}%</span>
        </div>
        <div className="mt-2">
          <ProgressBar percent={overall.percent} label={t('practice.progress', { known: overall.known, total: overall.total })} />
        </div>
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('practice.decks')}>
        {DECKS.map((d) => {
          const p = deckProgress(d, known);
          const active = d.id === deck.id;
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={active}
              onClick={() => chooseDeck(d.id)}
              className={`rounded-lg border px-3 py-2 text-start text-sm font-semibold ${
                active ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white text-brand-900 hover:bg-brand-50'
              }`}
            >
              <span className="block">{loc(d.title)}</span>
              <span className={`text-xs font-medium ${active ? 'text-white/90' : 'text-muted'}`}>
                {p.known}/{p.total}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('practice.mode')}>
        {(['cards', 'quiz'] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              resetCardState();
              if (m === 'quiz') restartQuiz();
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${
              mode === m ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-400 bg-white text-brand-900 hover:bg-brand-50'
            }`}
          >
            <Icon name={m === 'cards' ? 'book' : 'check'} className="size-4" />
            {m === 'cards' ? t('practice.mode.cards') : t('practice.mode.quiz')}
          </button>
        ))}
      </div>

      {mode === 'cards' && card ? (
        <article className={cardClass} aria-labelledby="practice-card-title">
          <p className="text-sm font-semibold text-muted">
            {t('practice.cardOf', { current: Math.min(index, deck.cards.length - 1) + 1, total: deck.cards.length })}
          </p>
          <div className="mt-2 rounded-lg bg-brand-50 p-5">
            <p className="text-sm font-semibold text-brand-800">{t('help.romanian')}</p>
            <p id="practice-card-title" lang="ro" dir="ltr" className="mt-1 whitespace-pre-wrap text-2xl font-bold text-ink">
              {card.ro}
            </p>
            {card.pron ? (
              <p dir="ltr" className="mt-2 text-base italic text-ink">
                {card.pron}
              </p>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <SpeakButtons text={card.ro} />
          </div>

          <div className="mt-4">
            {showMeaning ? (
              <>
                <p className="text-sm font-semibold text-muted">{t('help.meaning')}</p>
                <Meaning card={card} />
              </>
            ) : (
              <button type="button" className={btnSecondary} onClick={() => setShowMeaning(true)}>
                {t('practice.showMeaning')}
              </button>
            )}
          </div>

          {micSupported ? (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={sayIt}
                aria-pressed={listening}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-base font-semibold ${
                  listening ? 'border-red-700 bg-red-700 text-white' : 'border-brand-700 bg-white text-brand-800 hover:bg-brand-50'
                }`}
              >
                <Icon name="volume" className="size-4" />
                {listening ? t('practice.sayStop') : t('practice.say')}
              </button>
              {attempt ? (
                <div className="mt-3 space-y-1" aria-live="polite">
                  <p className="text-sm text-muted">
                    {t('practice.heard')} <span lang="ro" dir="ltr" className="font-semibold text-ink">{attempt.heard}</span>
                  </p>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${RATING_TEXT[attempt.rating].box}`}>
                    <span aria-hidden="true">{RATING_TEXT[attempt.rating].symbol}</span>
                    {t(RATING_TEXT[attempt.rating].key)}
                  </span>
                </div>
              ) : null}
              {micError ? <p role="alert" className="mt-2 text-sm font-semibold text-red-800">{t('counter.micError')}</p> : null}
              <p className="mt-2 text-xs text-muted">{t('practice.sayNote')}</p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted">{t('practice.noMic')}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <button type="button" className={btnSecondary} onClick={() => move(-1)}>
              {t('common.back')}
            </button>
            <button
              type="button"
              aria-pressed={known.includes(card.id)}
              onClick={() => setKnown((current) => toggleKnown(current, card.id))}
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2.5 text-base font-semibold ${
                known.includes(card.id) ? 'border-emerald-700 bg-emerald-100 text-emerald-900' : 'border-slate-400 bg-white text-brand-900 hover:bg-brand-50'
              }`}
            >
              {known.includes(card.id) ? <Icon name="check" className="size-4" /> : null}
              {known.includes(card.id) ? t('practice.known') : t('practice.markKnown')}
            </button>
            <button type="button" className={btnPrimary} onClick={() => move(1)}>
              {t('common.continue')}
            </button>
          </div>
        </article>
      ) : null}

      {mode === 'quiz' && question ? (
        <article className={cardClass} aria-labelledby="practice-quiz-title">
          <p className="text-sm font-semibold text-muted">
            {t('practice.cardOf', { current: step + 1, total: questions.length })}
          </p>
          <h2 id="practice-quiz-title" className="mt-1 text-base font-bold text-brand-900">
            {t('practice.quiz.question')}
          </h2>
          <div className="mt-2 rounded-lg bg-brand-50 p-5">
            <p lang="ro" dir="ltr" className="whitespace-pre-wrap text-2xl font-bold text-ink">
              {question.card.ro}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <SpeakButtons text={question.card.ro} />
          </div>
          <ul className="mt-4 grid gap-3">
            {question.options.map((option, optionIndex) => {
              const isCorrect = optionIndex === question.correctIndex;
              const isPicked = picked === optionIndex;
              const revealed = picked !== null;
              const style = !revealed
                ? 'border-slate-300 bg-white hover:border-brand-500'
                : isCorrect
                  ? 'border-emerald-700 bg-emerald-100'
                  : isPicked
                    ? 'border-red-700 bg-red-50'
                    : 'border-slate-200 bg-white opacity-70';
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    disabled={revealed}
                    onClick={() => answer(optionIndex)}
                    className={`w-full rounded-lg border p-4 text-start text-base ${style}`}
                  >
                    {revealed && isCorrect ? <span aria-hidden="true">✓ </span> : null}
                    {revealed && isPicked && !isCorrect ? <span aria-hidden="true">✗ </span> : null}
                    <span lang={language === 'ro' ? 'en' : language}>{loc(option.meaning)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {picked !== null ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-live="polite">
              <p className="font-semibold text-brand-900">
                {picked === question.correctIndex ? t('practice.quiz.correct') : t('practice.quiz.wrong')}
              </p>
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  setStep((current) => current + 1);
                  setPicked(null);
                }}
              >
                {t('common.continue')}
              </button>
            </div>
          ) : null}
        </article>
      ) : null}

      {finished ? (
        <section className={`${cardClass} text-center`} aria-live="polite">
          <p className="text-2xl font-bold text-brand-900">{t('practice.quiz.score', { score, total: questions.length })}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" className={btnPrimary} onClick={restartQuiz}>
              {t('practice.quiz.again')}
            </button>
            <button type="button" className={btnSecondary} onClick={() => setMode('cards')}>
              {t('practice.mode.cards')}
            </button>
          </div>
        </section>
      ) : null}

      <Notice tone="info">{t('practice.note')}</Notice>
    </div>
  );
}

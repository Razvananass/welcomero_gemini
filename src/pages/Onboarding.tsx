import { Icon, type IconName } from '../components/Icon';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { LANGUAGES, isLang, type MessageKey } from '../i18n';
import {
  ACCOMMODATIONS,
  CITIZENSHIPS,
  COMPLETED_KEYS,
  ONBOARDING_STEPS,
  SITUATIONS,
  draftToProfile,
  emptyDraft,
  isDraft,
  profileToDraft,
  toggleCompleted,
  validateStep,
  type OnboardingError,
} from '../lib/profile';
import { localData, STORAGE_KEYS } from '../lib/storage';
import { btnPrimary, btnSecondary, cardClass, Notice, ProgressBar } from '../components/ui';
import type { ProfileDraft } from '../types';

const STEP_ICONS: IconName[] = ['globe', 'user', 'home', 'list'];

type SavedDraft = ProfileDraft & { step?: number };

function Choice({
  type,
  name,
  checked,
  onChange,
  label,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${
        checked ? 'border-brand-700 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-500'
      }`}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="mt-1 size-5 shrink-0 accent-brand-700" />
      <span className="text-base">{label}</span>
    </label>
  );
}

function Question({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-lg font-bold text-brand-900">{legend}</legend>
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
      <div className="grid gap-3">{children}</div>
    </fieldset>
  );
}

function loadInitial(profileDraft: ProfileDraft | null): { draft: ProfileDraft; step: number } {
  const saved = localData.read<unknown>(STORAGE_KEYS.draft, null);
  if (isDraft(saved)) {
    const step = Number((saved as SavedDraft).step);
    return {
      draft: { situation: saved.situation, citizenship: saved.citizenship, accommodation: saved.accommodation, completed: saved.completed },
      step: Number.isInteger(step) && step >= 1 && step <= ONBOARDING_STEPS ? step : 1,
    };
  }
  return { draft: profileDraft ?? emptyDraft(), step: 1 };
}

export function Onboarding() {
  const { profile, language, setLanguage, completeOnboarding } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Start from a saved draft (so a refresh keeps your answers), or from your existing profile when editing.
  const [initial] = useState(() => loadInitial(profile ? profileToDraft(profile) : null));
  const [draft, setDraft] = useState<ProfileDraft>(initial.draft);
  const [step, setStep] = useState(initial.step);
  const [error, setError] = useState<OnboardingError | null>(null);

  useEffect(() => {
    localData.write(STORAGE_KEYS.draft, { ...draft, step });
  }, [draft, step]);

  function update(patch: Partial<ProfileDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  }

  function goBack() {
    setError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateStep(step, draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (step < ONBOARDING_STEPS) {
      setStep(step + 1);
      return;
    }
    const finished = draftToProfile(draft);
    if (!finished) {
      setError('onb.error.required');
      return;
    }
    completeOnboarding(finished);
    localData.remove(STORAGE_KEYS.draft);
    navigate('/dashboard');
  }

  const stepTitles: MessageKey[] = ['onb.step1.title', 'onb.step2.title', 'onb.step3.title', 'onb.step4.title'];
  const percent = Math.round(((step - 1) / ONBOARDING_STEPS) * 100);
  const isLast = step === ONBOARDING_STEPS;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-brand-900 sm:text-3xl">{t('onb.title')}</h1>
      {profile ? <p className="mt-1 text-muted">{t('onb.editing')}</p> : null}

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm font-semibold text-brand-900">
          <span>{t('common.step', { current: step, total: ONBOARDING_STEPS })}</span>
          <span>{t(stepTitles[step - 1])}</span>
        </div>
        <ol aria-hidden="true" className="mb-3 flex items-center">
          {STEP_ICONS.map((icon, index) => {
            const number = index + 1;
            const done = number < step;
            const current = number === step;
            return (
              <li key={icon} className="flex flex-1 items-center last:flex-none">
                <span
                  className={`grid size-10 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    done
                      ? 'border-brand-700 bg-brand-700 text-white'
                      : current
                        ? 'border-brand-700 bg-white text-brand-700 ring-4 ring-brand-100'
                        : 'border-slate-300 bg-white text-slate-500'
                  }`}
                >
                  <Icon name={done ? 'check' : icon} className="size-5" />
                </span>
                {number < ONBOARDING_STEPS ? (
                  <span className={`mx-2 h-1 flex-1 rounded-full transition-colors ${done ? 'bg-brand-700' : 'bg-slate-200'}`} />
                ) : null}
              </li>
            );
          })}
        </ol>
        <ProgressBar percent={percent} label={t('common.step', { current: step, total: ONBOARDING_STEPS })} />
      </div>

      <form onSubmit={handleSubmit} noValidate className={`${cardClass} mt-6 space-y-6`}>
        {step === 1 ? (
          <Question legend={t('onb.q.language')}>
            {LANGUAGES.map((lang) => (
              <Choice
                key={lang.code}
                type="radio"
                name="language"
                checked={language === lang.code}
                onChange={() => {
                  if (isLang(lang.code)) setLanguage(lang.code);
                }}
                label={lang.nativeName}
              />
            ))}
          </Question>
        ) : null}

        {step === 2 ? (
          <>
            <Question legend={t('onb.q.situation')}>
              {SITUATIONS.map((value) => (
                <Choice
                  key={value}
                  type="radio"
                  name="situation"
                  checked={draft.situation === value}
                  onChange={() => update({ situation: value })}
                  label={t(`onb.situation.${value}`)}
                />
              ))}
            </Question>
            <Question legend={t('onb.q.citizenship')}>
              {CITIZENSHIPS.map((value) => (
                <Choice
                  key={value}
                  type="radio"
                  name="citizenship"
                  checked={draft.citizenship === value}
                  onChange={() => update({ citizenship: value })}
                  label={t(`onb.citizenship.${value}`)}
                />
              ))}
            </Question>
          </>
        ) : null}

        {step === 3 ? (
          <Question legend={t('onb.q.accommodation')}>
            {ACCOMMODATIONS.map((value) => (
              <Choice
                key={value}
                type="radio"
                name="accommodation"
                checked={draft.accommodation === value}
                onChange={() => update({ accommodation: value })}
                label={t(`onb.accommodation.${value}`)}
              />
            ))}
          </Question>
        ) : null}

        {step === 4 ? (
          <Question legend={t('onb.q.completed')} hint={t('onb.completed.hint')}>
            {COMPLETED_KEYS.map((value) => (
              <Choice
                key={value}
                type="checkbox"
                name="completed"
                checked={draft.completed.includes(value)}
                onChange={() => update({ completed: toggleCompleted(draft.completed, value) })}
                label={t(`onb.completed.${value}`)}
              />
            ))}
          </Question>
        ) : null}

        {error ? (
          <Notice tone="error" role="alert">
            {t(error)}
          </Notice>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <button type="button" className={btnSecondary} onClick={goBack} disabled={step === 1}>
            {t('common.back')}
          </button>
          <button type="submit" className={btnPrimary}>
            {isLast ? t('onb.finish') : t('common.continue')}
          </button>
        </div>
      </form>

      <div className="mt-4 space-y-1 text-sm text-muted">
        <p className="flex items-start gap-2">
          <Icon name="shield" className="mt-0.5 size-4 text-brand-700" />
          <span>{t('onb.privacy')}</span>
        </p>
        <p>{t('onb.disclaimer')}</p>
      </div>
    </div>
  );
}

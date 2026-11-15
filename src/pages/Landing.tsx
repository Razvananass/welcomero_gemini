import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import type { MessageKey } from '../i18n';
import { LanguagePicker } from '../components/LanguagePicker';
import { Arrow, btnPrimary, btnSecondary, Notice } from '../components/ui';
import { Icon } from '../components/Icon';
import { SAMPLE_STUDENT_PROFILE } from '../lib/journey';
import { localData, STORAGE_KEYS } from '../lib/storage';

const STEPS: Array<{ title: MessageKey; body: MessageKey }> = [
  { title: 'landing.how.1.title', body: 'landing.how.1.body' },
  { title: 'landing.how.2.title', body: 'landing.how.2.body' },
  { title: 'landing.how.3.title', body: 'landing.how.3.body' },
];

const FEATURES: Array<{ title: MessageKey; body: MessageKey }> = [
  { title: 'landing.feature.checklist.title', body: 'landing.feature.checklist.body' },
  { title: 'landing.feature.guides.title', body: 'landing.feature.guides.body' },
  { title: 'landing.feature.ai.title', body: 'landing.feature.ai.body' },
  { title: 'landing.feature.helper.title', body: 'landing.feature.helper.body' },
  { title: 'landing.feature.kit.title', body: 'landing.feature.kit.body' },
  { title: 'landing.feature.plan.title', body: 'landing.feature.plan.body' },
  { title: 'landing.feature.sources.title', body: 'landing.feature.sources.body' },
];

export function Landing() {
  const { profile, user, authReady, authLoading, authError, signInWithGoogle, completeOnboarding } = useApp();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const justDeleted = (location.state as { deleted?: boolean } | null)?.deleted === true;

  const ctaTarget = profile ? '/dashboard' : '/onboarding';
  const ctaLabel = profile ? t('landing.cta.continue') : t('landing.cta');

  function startSampleJourney() {
    localData.remove(STORAGE_KEYS.draft);
    completeOnboarding(SAMPLE_STUDENT_PROFILE);
    navigate('/dashboard');
  }

  return (
    <div className="space-y-14">
      <LanguagePicker />
      {justDeleted ? (
        <Notice role="status" tone="info">
          {t('set.deleted')}
        </Notice>
      ) : null}

      <section className="max-w-2xl">
        <p className="text-base font-semibold text-brand-700">{t('landing.eyebrow')}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-900 sm:text-4xl">{t('app.tagline')}</h1>
        <p className="mt-5 text-lg text-muted">{t('landing.hero.body')}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link to={ctaTarget} className={`${btnPrimary} px-6 py-3 text-lg`}>
            {ctaLabel} <Arrow />
          </Link>
          {authReady && !user ? (
            <button type="button" onClick={signInWithGoogle} disabled={authLoading} className={`${btnSecondary} px-6 py-3`}>
              <Icon name="user" className="size-4" />
              {authLoading ? t('auth.signingIn') : t('auth.signIn')}
            </button>
          ) : null}
        </div>
        {authError ? (
          <div className="mt-4">
            <Notice role="alert" tone="error">
              {authError === 'unauthorized-domain'
                ? t('auth.error.domain', { domain: typeof window !== 'undefined' ? window.location.hostname : 'localhost' })
                : authError === 'popup-blocked'
                  ? t('auth.error')
                  : t('auth.error.generic')}
            </Notice>
          </div>
        ) : null}
        <p className="mt-4 text-base text-muted">{t('landing.audience')}</p>

        {!profile ? (
          <div className="mt-7 max-w-xl rounded-lg border border-brand-200 bg-brand-50/70 p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-700">{t('landing.sample.label')}</p>
            <h2 className="mt-1 text-xl font-bold text-brand-900">{t('landing.sample.title')}</h2>
            <p className="mt-2 text-muted">{t('landing.sample.body')}</p>
            <button type="button" onClick={startSampleJourney} className={`${btnSecondary} mt-4`}>
              {t('landing.sample.cta')} <Arrow />
            </button>
            <p className="mt-2 text-sm text-muted">{t('landing.sample.note')}</p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="how-title" className="border-t border-slate-200 pt-10">
        <h2 id="how-title" className="text-2xl font-bold text-brand-900">
          {t('landing.how.title')}
        </h2>
        <ol className="mt-6 max-w-2xl space-y-6">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="w-6 shrink-0 text-xl font-bold text-brand-700" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <h3 className="text-lg font-semibold text-brand-900">{t(step.title)}</h3>
                <p className="mt-1 text-muted">{t(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features-title" className="border-t border-slate-200 pt-10">
        <h2 id="features-title" className="text-2xl font-bold text-brand-900">
          {t('landing.features.title')}
        </h2>
        <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <h3 className="text-lg font-semibold text-brand-900">{t(feature.title)}</h3>
              <p className="mt-1 text-muted">{t(feature.body)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="max-w-2xl border-s-4 border-brand-600 ps-5">
        <h2 className="text-xl font-bold text-brand-900">{t('landing.honesty.title')}</h2>
        <p className="mt-2">{t('landing.honesty.body')}</p>
      </section>

      <section>
        <Link to={ctaTarget} className={`${btnPrimary} px-6 py-3 text-lg`}>
          {ctaLabel} <Arrow />
        </Link>
      </section>
    </div>
  );
}

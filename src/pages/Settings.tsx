import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { Icon } from '../components/Icon';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { ThemeChoice } from '../components/ThemeToggle';
import { TEXT_SIZES } from '../lib/textSize';
import { btnPrimary, btnSecondary, cardClass, inputClass, Notice, PageHeader } from '../components/ui';

export function Settings() {
  const {
    profile,
    resetAll,
    user,
    authReady,
    authLoading,
    authError,
    syncStatus,
    signInWithGoogle,
    signOutUser,
    textSize,
    setTextSize,
  } = useApp();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleConfirmDelete() {
    resetAll();
    navigate('/', { state: { deleted: true } });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={t('set.title')} />

      <section className={cardClass} aria-labelledby="account-title">
        <div className="flex items-center gap-2">
          <Icon name="user" className="size-5 text-brand-700" />
          <h2 id="account-title" className="text-lg font-bold text-brand-900">
            {t('auth.title')}
          </h2>
        </div>

        {authError ? (
          <div className="mt-3">
            <Notice role="alert" tone="error">
              {authError === 'unauthorized-domain'
                ? t('auth.error.domain', { domain: typeof window !== 'undefined' ? window.location.hostname : 'localhost' })
                : authError === 'popup-blocked'
                  ? t('auth.error')
                  : t('auth.error.generic')}
            </Notice>
          </div>
        ) : null}

        {user && syncStatus === 'error' ? (
          <div className="mt-3">
            <Notice role="status" tone="warning">
              {t('auth.syncError')}
            </Notice>
          </div>
        ) : null}

        {user ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">
              {t('auth.signedIn.body', { account: user.email || user.displayName || user.uid })}
            </p>
            {syncStatus === 'syncing' ? <p className="text-xs font-medium text-brand-700">{t('auth.syncing')}</p> : null}
            {syncStatus === 'synced' ? <p className="text-xs font-medium text-emerald-800">{t('auth.synced')}</p> : null}
            <div>
              <button type="button" onClick={signOutUser} disabled={authLoading} className={btnSecondary}>
                {t('auth.signOut')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-muted">{t('auth.signedOut.body')}</p>
            <div>
              <button type="button" onClick={signInWithGoogle} disabled={!authReady || authLoading} className={btnPrimary}>
                <Icon name="user" className="size-4" />
                {authLoading ? t('auth.signingIn') : t('auth.signIn')}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className={cardClass} aria-labelledby="answers-title">
        <h2 id="answers-title" className="text-lg font-bold text-brand-900">
          {t('set.answers')}
        </h2>
        {profile ? (
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="font-semibold text-brand-900">{t('onb.q.situation')}</dt>
              <dd>{t(`onb.situation.${profile.situation}`)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-900">{t('onb.q.citizenship')}</dt>
              <dd>{t(`onb.citizenship.${profile.citizenship}`)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-900">{t('onb.q.accommodation')}</dt>
              <dd>{t(`onb.accommodation.${profile.accommodation}`)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-brand-900">{t('onb.q.completed')}</dt>
              <dd>
                <ul className="list-disc ps-5">
                  {profile.completed.map((key) => (
                    <li key={key}>{t(`onb.completed.${key}`)}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-muted">{t('set.none')}</p>
        )}
        <div className="mt-4">
          <Link to="/onboarding" className={btnPrimary}>
            {t('set.edit')}
          </Link>
        </div>
      </section>

      <section className={cardClass} aria-labelledby="language-title">
        <h2 id="language-title" className="text-lg font-bold text-brand-900">
          {t('set.language')}
        </h2>
        <div className="mt-3 max-w-xs">
          <LanguageSwitcher className={inputClass} />
        </div>
      </section>

      <section className={cardClass} aria-labelledby="theme-title">
        <h2 id="theme-title" className="text-lg font-bold text-brand-900">
          {t('theme.title')}
        </h2>
        <p className="mt-2 text-sm text-muted">{t('theme.body')}</p>
        <div className="mt-3">
          <ThemeChoice />
        </div>
      </section>

      <section className={cardClass} aria-labelledby="text-title">
        <h2 id="text-title" className="text-lg font-bold text-brand-900">
          {t('text.title')}
        </h2>
        <p className="mt-2 text-sm text-muted">{t('text.body')}</p>
        <div role="group" aria-label={t('text.title')} className="mt-3 flex flex-wrap gap-2">
          {TEXT_SIZES.map((size) => {
            const selected = textSize === size;
            return (
              <button
                key={size}
                type="button"
                aria-pressed={selected}
                onClick={() => setTextSize(size)}
                className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 font-semibold ${
                  selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-400 bg-white text-brand-900 hover:bg-brand-50'
                }`}
              >
                {selected ? <Icon name="check" className="size-4" /> : null}
                {t(`text.${size}`)}
              </button>
            );
          })}
        </div>
      </section>

      <section className={cardClass} aria-labelledby="data-title">
        <h2 id="data-title" className="text-lg font-bold text-brand-900">
          {t('set.data.title')}
        </h2>
        <p className="mt-2 text-muted">{user ? t('set.data.bodyCloud') : t('set.data.body')}</p>
        <div className="mt-4">
          {confirmingDelete ? (
            <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4" role="alertdialog" aria-labelledby="delete-confirm-text">
              <p id="delete-confirm-text" className="text-sm font-semibold text-red-900">
                {t('set.delete.confirm')}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="inline-flex min-h-11 items-center rounded-lg bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800"
                >
                  {t('set.delete')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className={btnSecondary}
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex min-h-11 items-center rounded-lg border border-red-700 bg-white px-5 py-2.5 font-semibold text-red-800 hover:bg-red-50"
            >
              {t('set.delete')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

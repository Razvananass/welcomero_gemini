import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { getInstitution } from '../data';
import { buildHelpMessage, HELP_ORG_ID, helpMailto } from '../lib/helpRequest';
import { Icon } from './Icon';
import { btnPrimary, btnSecondary, cardClass, CopyButton, linkClass } from './ui';

/** "Stuck? Ask a person": LOGS contact details plus a ready-made message in Romanian describing the user's case. */
export function HumanHelpCard() {
  const { profile, tasks, progress, language } = useApp();
  const { t, loc } = useI18n();
  const org = getInstitution(HELP_ORG_ID);
  if (!org || !profile) return null;

  const message = buildHelpMessage(profile, tasks, progress, language);

  return (
    <section aria-labelledby="human-help-title" className={cardClass}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Icon name="community" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="human-help-title" className="text-lg font-bold text-brand-900">
            {t('human.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('human.body', { org: loc(org.name) })}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {org.email ? (
          <a href={helpMailto(org.email, message)} className={btnPrimary}>
            <Icon name="inbox" className="size-4" />
            {t('human.email')}
          </a>
        ) : null}
        {org.phone ? (
          <a href={`tel:${org.phone.replace(/[^\d+]/g, '')}`} className={btnSecondary}>
            <span dir="ltr">{t('human.call', { phone: org.phone })}</span>
          </a>
        ) : null}
        <CopyButton text={message} />
      </div>

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-900">{t('human.preview')}</summary>
        <p className="mt-2 text-muted">{t('human.preview.hint')}</p>
        <pre lang="ro" dir="ltr" className="mt-2 whitespace-pre-wrap break-words font-sans text-ink">
          {message}
        </pre>
      </details>

      <p className="mt-3 text-xs text-muted">
        {org.address ? <span>{org.address} · </span> : null}
        <a href={org.website} target="_blank" rel="noreferrer noopener" className={linkClass}>
          {t('human.website')}
        </a>
        {' · '}
        <Link to="/institutions" className={linkClass}>
          {t('nav.institutions')}
        </Link>
        {' · '}
        {t('human.note')}
      </p>
    </section>
  );
}

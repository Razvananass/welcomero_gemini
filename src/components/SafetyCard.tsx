import { Link } from 'react-router-dom';
import { useI18n } from '../context/useI18n';
import { btnPrimary, btnSecondary, cardClass, linkClass } from './ui';

/** Emergency number and the free anti-trafficking helpline. Numbers: 112 (EU emergency number) and the helpline listed on e-Justice. */
export function SafetyCard() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="safety-title" className={cardClass}>
      <h2 id="safety-title" className="text-lg font-bold text-brand-900">
        {t('safe.title')}
      </h2>
      <p className="mt-2">{t('safe.112')}</p>
      <p className="mt-2">{t('safe.traffic')}</p>
      <p className="mt-2 text-muted">
        {t('safe.logs')}{' '}
        <Link to="/institutions?focus=logs-timisoara" className={linkClass}>
          {t('nav.institutions')}
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="tel:112" className={btnPrimary}>
          <span dir="ltr">{t('safe.call112')}</span>
        </a>
        <a href="tel:0800800678" className={btnSecondary}>
          <span dir="ltr">{t('safe.callTraffic')}</span>
        </a>
      </div>
    </section>
  );
}

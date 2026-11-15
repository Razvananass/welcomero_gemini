import { Link } from 'react-router-dom';
import { useI18n } from '../context/useI18n';

/**
 * Simple geometric mark for welcomeRo: a clean doorway arch over a warm yellow threshold
 * on a flat deep-blue tile.
 */
export function LogoMark({ className = 'size-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true" focusable="false">
      <rect width="36" height="36" rx="8" fill="#0b5a86" />
      <path
        d="M11 26V16a7 7 0 0 1 14 0v10"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="10" y="27.5" width="16" height="3" rx="1.5" fill="#fcd116" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      welcome<span className="text-sun-600">Ro</span>
    </span>
  );
}

export function Logo() {
  const { t } = useI18n();
  return (
    <Link to="/" aria-label={t('nav.home')} className="flex items-center gap-2.5 text-xl text-brand-900">
      <LogoMark />
      <Wordmark />
    </Link>
  );
}

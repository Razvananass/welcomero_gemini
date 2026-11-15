import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import type { MessageKey } from '../i18n';
import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { linkClass } from './ui';

const NAV_ITEMS: Array<{ to: string; key: MessageKey }> = [
  { to: '/dashboard', key: 'nav.dashboard' },
  { to: '/checklist', key: 'nav.checklist' },
  { to: '/plan', key: 'nav.plan' },
  { to: '/guides', key: 'nav.guides' },
  { to: '/institutions', key: 'nav.institutions' },
  { to: '/assistant', key: 'nav.assistant' },
  { to: '/helper', key: 'nav.helper' },
  { to: '/settings', key: 'nav.settings' },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${
    isActive ? 'bg-brand-700 text-white' : 'text-brand-900 hover:bg-brand-50'
  }`;

function Header() {
  const { profile, user, authReady, authLoading, signInWithGoogle } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo />
        {profile ? (
          <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {t(item.key)}
              </NavLink>
            ))}
          </nav>
        ) : null}
        <div className="flex items-center gap-2">
          <ThemeToggle className={profile ? 'hidden sm:inline-flex' : 'inline-flex'} />
          <LanguageSwitcher />
          {authReady && user ? (
            <Link
              to="/settings"
              aria-label={t('auth.navAccount')}
              className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-brand-900 hover:bg-brand-50"
            >
              <Icon name="user" className="size-4 text-brand-700" />
              <span className="hidden sm:inline">{user.displayName?.split(' ')[0] || t('auth.navAccount')}</span>
            </Link>
          ) : null}
          {authReady && !user ? (
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={authLoading}
              className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-700 bg-white px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="user" className="size-4" />
              <span>{authLoading ? t('auth.signingIn') : t('auth.navSignIn')}</span>
            </button>
          ) : null}
          {profile ? (
            <button
              type="button"
              className="min-h-10 rounded-lg border border-slate-400 px-3 text-sm font-semibold text-brand-900 xl:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? t('common.close') : t('common.menu')}
            </button>
          ) : null}
        </div>
      </div>
      {profile && open ? (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-slate-200 bg-white px-4 py-3 xl:hidden">
          <ul className="mx-auto grid max-w-6xl gap-1 sm:grid-cols-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={navLinkClass}>
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-3 max-w-6xl border-t border-slate-200 pt-3 sm:hidden">
            <ThemeToggle showLabel className="inline-flex gap-2 px-3 text-sm font-semibold" />
          </div>
        </nav>
      ) : null}
    </header>
  );
}

function Footer() {
  const { profile, user } = useApp();
  const { t } = useI18n();
  return (
    <footer className="no-print mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div>
          <p className="font-bold text-brand-900">{t('app.name')}</p>
          <p className="mt-2 text-sm text-muted">{t('footer.about')}</p>
          <p className="mt-2 text-sm text-muted">{user ? t('set.data.bodyCloud') : t('footer.storage')}</p>
        </div>
        <div>
          <p className="font-semibold text-brand-900">{t('footer.links')}</p>
          <ul className="mt-2 space-y-1 text-sm">
            <li>
              <a className={linkClass} href="https://igi.mai.gov.ro/" target="_blank" rel="noreferrer noopener">
                IGI
              </a>
            </li>
            <li>
              <a className={linkClass} href="https://www.anaf.ro/" target="_blank" rel="noreferrer noopener">
                ANAF
              </a>
            </li>
            <li>
              <a className={linkClass} href="https://cnas.ro/" target="_blank" rel="noreferrer noopener">
                CNAS
              </a>
            </li>
            <li>
              <a className={linkClass} href="https://www.primariatm.ro/" target="_blank" rel="noreferrer noopener">
                Primăria Timișoara
              </a>
            </li>
            {profile ? (
              <li>
                <Link className={linkClass} to="/institutions">
                  {t('nav.institutions')}
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-brand-900">{t('footer.contact')}</p>
          <p className="mt-2 text-sm text-muted">{t('footer.contactPlaceholder')}</p>
          <p className="mt-4 text-sm text-muted">{t('footer.disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  const { t } = useI18n();
  const location = useLocation();

  useEffect(() => {
    document.title = `${t('app.name')}`;
  }, [t]);

  // Start each page at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-30 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold"
      >
        {t('nav.skip')}
      </a>
      <Header />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div key={location.pathname} className="animate-fade-up">
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

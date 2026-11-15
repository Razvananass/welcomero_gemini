import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getProcedure } from '../data';
import { routeTitleKey } from '../lib/journey';
import { useI18n } from '../context/useI18n';
import type { MessageKey } from '../i18n';
import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import { linkClass } from './ui';

// Everyday pages are always visible; the helper tools sit under "More" so the bar stays short and readable.
const MAIN_ITEMS: Array<{ to: string; key: MessageKey }> = [
  { to: '/dashboard', key: 'nav.dashboard' },
  { to: '/checklist', key: 'nav.checklist' },
  { to: '/guides', key: 'nav.guides' },
  { to: '/plan', key: 'nav.plan' },
  { to: '/institutions', key: 'nav.institutions' },
];
const MORE_ITEMS: Array<{ to: string; key: MessageKey }> = [
  { to: '/counter', key: 'nav.counter' },
  { to: '/assistant', key: 'nav.assistant' },
  { to: '/helper', key: 'nav.helper' },
  { to: '/practice', key: 'nav.practice' },
  { to: '/settings', key: 'nav.settings' },
];
const NAV_ITEMS = [...MAIN_ITEMS, ...MORE_ITEMS];

// The current page is shown with an underline, not a filled button.
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block whitespace-nowrap border-b-2 px-3 py-2 text-base font-medium ${
    isActive ? 'border-brand-700 text-brand-900' : 'border-transparent text-slate-700 hover:text-brand-900'
  }`;

const menuLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block px-4 py-2.5 text-base ${isActive ? 'bg-slate-100 font-semibold text-brand-900' : 'text-ink hover:bg-slate-50'}`;

/** "More" menu: a button that opens a short list. Closes on Escape, on a click outside, and after choosing a page. */
function MoreMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const anyActive = MORE_ITEMS.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`));
  return (
    <div ref={box} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="more-navigation"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-base font-medium ${
          anyActive ? 'border-brand-700 text-brand-900' : 'border-transparent text-slate-700 hover:text-brand-900'
        }`}
      >
        {t('nav.more')}
        <Icon name="arrow" className="size-3.5 rotate-90" />
      </button>
      {open ? (
        <ul id="more-navigation" className="absolute end-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1">
          {MORE_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={menuLinkClass}>
                {t(item.key)}
              </NavLink>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Header() {
  const { profile, user, authReady, authLoading, signInWithGoogle } = useApp();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile menu after navigating.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-3 sm:px-4">
        <Logo />
        {profile ? (
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {MAIN_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navLinkClass}>
                {t(item.key)}
              </NavLink>
            ))}
            <MoreMenu />
          </nav>
        ) : null}
        <div className="ms-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle className={profile ? 'hidden sm:inline-flex' : 'inline-flex'} />
          <LanguageSwitcher className="min-h-10 w-auto min-w-0 max-w-28 rounded-lg border border-slate-400 bg-white px-2 py-1.5 text-sm font-medium text-ink sm:max-w-none" />
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
              aria-label={authLoading ? t('auth.signingIn') : t('auth.navSignIn')}
              className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-700 bg-white px-3 text-sm font-semibold text-brand-800 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="user" className="size-4" />
              <span className="hidden sm:inline">{authLoading ? t('auth.signingIn') : t('auth.navSignIn')}</span>
            </button>
          ) : null}
          {profile ? (
            <button
              type="button"
              className="min-h-10 rounded-lg border border-slate-400 px-3 text-base font-medium text-brand-900 lg:hidden"
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
        <nav id="mobile-nav" aria-label="Main" className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <ul className="mx-auto grid max-w-5xl gap-x-6 sm:grid-cols-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to} className="border-b border-slate-100">
                <NavLink to={item.to} className={menuLinkClass}>
                  {t(item.key)}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-3 max-w-5xl border-t border-slate-200 pt-3 sm:hidden">
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
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-3">
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
          <p className="mt-2 text-sm">
            <a className={linkClass} href="mailto:welcomero.contact@gmail.com">
              {t('footer.contactPlaceholder')}
            </a>
          </p>
          <p className="mt-4 text-sm text-muted">{t('footer.disclaimer')}</p>
        </div>
      </div>
    </footer>
  );
}

export function Layout() {
  const { t, loc } = useI18n();
  const location = useLocation();
  const main = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const guideMatch = location.pathname.match(/^\/guides\/([^/]+)$/);
    const kitMatch = location.pathname.match(/^\/kit\/([^/]+)$/);
    const procedure = getProcedure(guideMatch?.[1] ?? kitMatch?.[1] ?? '');
    const pageTitle = guideMatch
      ? procedure
        ? loc(procedure.title)
        : t('guide.notFound')
      : kitMatch
        ? procedure
          ? `${t('kit.title')}: ${loc(procedure.title)}`
          : t('kit.notFound')
        : t(routeTitleKey(location.pathname));
    document.title = `${pageTitle} | ${t('app.name')}`;
  }, [loc, location.pathname, t]);

  // Focus the requested section, or start the new page at the top and announce its main region.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (location.hash) {
        let id = location.hash.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch {
          // Use the literal fragment when it is not valid URI encoding.
        }
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          target.focus({ preventScroll: true });
          return;
        }
      }
      window.scrollTo(0, 0);
      main.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="no-print sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-30 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold"
      >
        {t('nav.skip')}
      </a>
      <Header />
      <main ref={main} id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

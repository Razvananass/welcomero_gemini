import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useApp } from './context/AppContext';
import { useI18n } from './context/useI18n';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Assistant } from './pages/Assistant';
import { Checklist } from './pages/Checklist';
import { Counter } from './pages/Counter';
import { Dashboard } from './pages/Dashboard';
import { GuideDetail } from './pages/GuideDetail';
import { Guides } from './pages/Guides';
import { Helper } from './pages/Helper';
import { Institutions } from './pages/Institutions';
import { Landing } from './pages/Landing';
import { NotFound } from './pages/NotFound';
import { Kit } from './pages/Kit';
import { Onboarding } from './pages/Onboarding';
import { Plan } from './pages/Plan';
import { Practice } from './pages/Practice';
import { Settings } from './pages/Settings';
import { profileNeedsDetails } from './lib/profile';

/** Pages that need a profile send new visitors to onboarding first. */
function RequireProfile() {
  const { profile } = useApp();
  return profile && !profileNeedsDetails(profile) ? <Outlet /> : <Navigate to="/onboarding" replace />;
}

export default function App() {
  const { t } = useI18n();

  return (
    <ErrorBoundary title={t('err.title')} body={t('err.body')} reload={t('err.reload')}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="onboarding" element={<Onboarding />} />
          <Route element={<RequireProfile />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="checklist" element={<Checklist />} />
            <Route path="guides" element={<Guides />} />
            <Route path="guides/:id" element={<GuideDetail />} />
            <Route path="plan" element={<Plan />} />
            <Route path="kit/:id" element={<Kit />} />
            <Route path="institutions" element={<Institutions />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="helper" element={<Helper />} />
            <Route path="counter" element={<Counter />} />
            <Route path="practice" element={<Practice />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}

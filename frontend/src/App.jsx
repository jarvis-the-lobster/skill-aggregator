import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { StreakProvider } from './contexts/StreakContext';
import analytics from './services/analytics';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function AdminGuard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || !ADMIN_EMAILS.includes(user.email)) return <Navigate to="/" replace />;
  return children;
}
import { HomePage } from './pages/HomePage';
import { SkillPage } from './pages/SkillPage';
import { AboutPage } from './pages/AboutPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AuthCallback } from './pages/AuthCallback';
import { AdminPage } from './pages/AdminPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { EarlyAccessPage } from './pages/EarlyAccessPage';
import { LearningPlanPage } from './pages/LearningPlanPage';
import { WelcomePage } from './pages/WelcomePage';
import { PremiumPage } from './pages/PremiumPage';
import { PremiumSuccessPage } from './pages/PremiumSuccessPage';
import { AccountPage } from './pages/AccountPage';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

const ROUTE_NAMES = {
  '/': 'Home',
  '/about': 'About',
  '/login': 'Login',
  '/signup': 'Signup',
  '/auth/callback': 'AuthCallback',
  '/admin': 'Admin',
  '/my-courses': 'MyCourses',
  '/early-access': 'EarlyAccess',
  '/welcome': 'Welcome',
  '/premium': 'Premium',
  '/premium/success': 'PremiumSuccess',
  '/account': 'Account',
};

function derivePageName(pathname) {
  if (ROUTE_NAMES[pathname]) return ROUTE_NAMES[pathname];
  if (/^\/skills\/[^/]+\/plan$/.test(pathname)) return 'LearningPlan';
  if (/^\/skills\/[^/]+$/.test(pathname)) return 'Skill';
  return pathname;
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    analytics.track('page_view', {
      path: location.pathname,
      search: location.search || undefined,
      page_name: derivePageName(location.pathname),
    });
  }, [location.pathname, location.search]);
  return null;
}

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

function LayoutShell({ children }) {
  return (
    <div className="min-h-screen bg-dark-bg text-slate-100 flex flex-col">
      <Header />
      <main className="flex-grow pt-[72px]">{children}</main>
      <Footer />
    </div>
  );
}

export function AppContent() {
  return (
    <AuthProvider>
      <StreakProvider>
      <RouteTracker />
      <ScrollToTop />
      <LayoutShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/skills/:id" element={<SkillPage />} />
          <Route path="/skills/:skillId/plan" element={<LearningPlanPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/admin" element={<AdminGuard><AdminPage /></AdminGuard>} />
          <Route path="/my-courses" element={<MyCoursesPage />} />
          <Route path="/early-access" element={<EarlyAccessPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/premium" element={<PremiumPage />} />
          <Route path="/premium/success" element={<PremiumSuccessPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Routes>
      </LayoutShell>
      </StreakProvider>
    </AuthProvider>
  );
}

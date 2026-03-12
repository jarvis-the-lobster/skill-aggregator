import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import analytics from './services/analytics';
import { HomePage } from './pages/HomePage';
import { SkillPage } from './pages/SkillPage';
import { AboutPage } from './pages/AboutPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AuthCallback } from './pages/AuthCallback';
import { AdminPage } from './pages/AdminPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { Header } from './components/Header';
import { Footer } from './components/Footer';

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    analytics.track('page_view', { path: location.pathname });
  }, [location.pathname]);
  return null;
}

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return null;
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <RouteTracker />
        <ScrollToTop />
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Header />

          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/skills/:id" element={<SkillPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/my-courses" element={<MyCoursesPage />} />
            </Routes>
          </main>

          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;

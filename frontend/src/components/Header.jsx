import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StreakBadge } from './StreakBadge';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[1000] py-4 backdrop-blur-[20px] transition-all duration-300 ${
        scrolled
          ? 'bg-[rgba(10,15,30,0.9)] border-b border-white/[0.08]'
          : 'bg-[rgba(10,15,30,0.7)] border-b border-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight">
          <div className="w-8 h-8 bg-teal rounded-lg flex items-center justify-center text-white text-base font-extrabold">
            L
          </div>
          <span className="text-slate-100">Learn<span className="text-teal">Stack</span></span>
        </Link>

        {/* Navigation */}
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="hidden md:inline-block relative text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors py-1 nav-link-premium"
          >
            Home
          </Link>
          <Link
            to="/about"
            className="hidden md:inline-block relative text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors py-1 nav-link-premium"
          >
            About
          </Link>
          {user && (
            <Link
              to="/my-courses"
              className="hidden md:inline-block relative text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors py-1 nav-link-premium"
            >
              My Courses
            </Link>
          )}

          {/* Auth area */}
          {user ? (
            <div className="flex items-center gap-3">
              <StreakBadge />
              <div className="flex items-center gap-2 bg-white/[0.08] border border-white/[0.1] rounded-full pl-4 pr-2 py-1.5">
                <span className="text-sm font-medium text-slate-200">
                  {user.name || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-slate-100 transition-colors p-1 rounded-full hover:bg-white/[0.08]"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 bg-teal text-dark-bg font-semibold text-sm px-5 py-2.5 rounded-lg hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)] transition-all duration-250 hover:-translate-y-px hover:scale-[1.02]"
              >
                Get Started Free
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { StreakBadge } from './StreakBadge';
import { Logo } from './Logo';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [user]);

  function handleLogout() {
    setMobileMenuOpen(false);
    logout();
    navigate('/');
  }

  function handleMobileNav() {
    setMobileMenuOpen(false);
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[1000] backdrop-blur-[20px] transition-all duration-300 ${
        scrolled
          ? 'bg-[rgba(10,15,30,0.9)] border-b border-white/[0.08]'
          : 'bg-[rgba(10,15,30,0.7)] border-b border-transparent'
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
        <div className="flex min-h-[72px] items-center justify-between gap-3 sm:gap-6">
          <div className="min-w-0 flex-shrink">
            <Logo />
          </div>

          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/"
              className="relative py-1 text-sm font-medium text-slate-400 transition-colors hover:text-slate-100 nav-link-premium"
            >
              Home
            </Link>
            <Link
              to="/about"
              className="relative py-1 text-sm font-medium text-slate-400 transition-colors hover:text-slate-100 nav-link-premium"
            >
              About
            </Link>
            {user && (
              <Link
                to="/my-courses"
                className="relative py-1 text-sm font-medium text-slate-400 transition-colors hover:text-slate-100 nav-link-premium"
              >
                My Courses
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                <StreakBadge />
                <div className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.08] py-1.5 pl-4 pr-2">
                  <span className="text-sm font-medium text-slate-200">
                    {user.name || user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-slate-100"
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
                  className="text-sm font-medium text-slate-400 transition-colors hover:text-slate-100"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-dark-bg transition-all duration-250 hover:-translate-y-px hover:scale-[1.02] hover:bg-teal-light hover:shadow-[0_8px_24px_rgba(0,191,166,0.35)]"
                >
                  Get Started Free
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 md:hidden">
            {user && <StreakBadge compact />}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06] text-slate-100 transition-colors hover:bg-white/[0.1]"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-white/[0.08] pb-4 pt-3 md:hidden">
            <nav className="flex flex-col gap-2">
              <Link
                to="/"
                onClick={handleMobileNav}
                className="rounded-xl px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06]"
              >
                Home
              </Link>
              <Link
                to="/about"
                onClick={handleMobileNav}
                className="rounded-xl px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06]"
              >
                About
              </Link>
              {user && (
                <Link
                  to="/my-courses"
                  onClick={handleMobileNav}
                  className="rounded-xl px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.06]"
                >
                  My Courses
                </Link>
              )}

              {user ? (
                <div className="mt-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4">
                  <div className="mb-3 text-sm font-medium text-slate-200 break-words">
                    {user.name || user.email}
                  </div>
                  <button
                    onClick={handleLogout}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.1] px-4 py-3 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.06]"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  <Link
                    to="/login"
                    onClick={handleMobileNav}
                    className="inline-flex items-center justify-center rounded-xl border border-white/[0.1] px-4 py-3 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.06]"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    onClick={handleMobileNav}
                    className="inline-flex items-center justify-center rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-dark-bg transition-all hover:bg-teal-light"
                  >
                    Get Started Free
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

import { Link, useNavigate } from 'react-router-dom';
import { Zap, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="p-2 bg-primary-500 rounded-lg">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">SkillAggregator</span>
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex space-x-8">
            <Link
              to="/"
              className="text-gray-700 hover:text-primary-600 font-medium transition-colors"
            >
              Home
            </Link>
            <Link
              to="/about"
              className="text-gray-700 hover:text-primary-600 font-medium transition-colors"
            >
              About
            </Link>
          </nav>

          {/* Auth area */}
          <div className="flex items-center space-x-3">
            {user ? (
              <>
                {/* Avatar + name */}
                <div className="flex items-center space-x-2">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name || user.email}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center text-white text-sm font-semibold">
                      {(user.name || user.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-700 hidden sm:block">
                    {user.name || user.email}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 transition-colors text-sm"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:block">Sign out</span>
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium text-sm transition-colors">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-primary text-sm">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function AuthCallback() {
  const { loadUserFromCookie } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Cookie was set server-side before this redirect; just load the user
    loadUserFromCookie().then(user => {
      if (user) {
        navigate('/');
      } else {
        navigate('/login?error=oauth');
      }
    });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner />
        <p className="mt-4 text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}

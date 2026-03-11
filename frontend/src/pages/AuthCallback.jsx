import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const { setTokenAndUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      navigate('/login?error=oauth');
      return;
    }

    // Verify token and load user info
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setTokenAndUser(token, data.user);
          navigate('/');
        } else {
          navigate('/login?error=oauth');
        }
      })
      .catch(() => navigate('/login?error=oauth'));
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

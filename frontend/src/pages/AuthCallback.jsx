import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function AuthCallback() {
  const { loadUserFromToken } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) { navigate('/login?error=oauth'); return; }
    loadUserFromToken(token).then(async (user) => {
      if (!user) { navigate('/login?error=oauth'); return; }
      try {
        const { completed } = await apiService.getOnboardingStatus();
        navigate(completed ? '/' : '/welcome');
      } catch {
        navigate('/');
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

import { createContext, useContext, useState, useEffect } from 'react';
import analytics from '../services/analytics';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '/api';

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from localStorage token
  useEffect(() => {
    const token = getToken();
    if (!token) { setLoading(false); return; }
    fetch(`${API_BASE}/auth/me`, { headers: authHeaders() })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.user) { setUser(data.user); analytics.identify(data.user.id, { email: data.user.email, name: data.user.name }); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    setUser(data.user);
    analytics.identify(data.user.id, { email: data.user.email, name: data.user.name });
    return data;
  }

  async function register(email, password, name) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setToken(data.token);
    setUser(data.user);
    analytics.identify(data.user.id, { email: data.user.email, name: data.user.name });
    return data;
  }

  function loginWithGoogle() {
    window.location.href = `${API_BASE}/auth/google`;
  }

  // Called after Google OAuth redirect — token is in the URL param
  async function loadUserFromToken(token) {
    try {
      setToken(token);
      const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        analytics.identify(data.user.id, { email: data.user.email, name: data.user.name });
        return data.user;
      }
    } catch {}
    removeToken();
    return null;
  }

  async function logout() {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders() });
    removeToken();
    setUser(null);
    analytics.reset();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, loadUserFromToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

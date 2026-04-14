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

function withDerived(rawUser) {
  if (!rawUser) return null;
  return {
    ...rawUser,
    isPremium: rawUser.subscription_status === 'active'
      || (rawUser.subscription_status === 'cancelled' && !!rawUser.subscription_end_date && new Date(rawUser.subscription_end_date) > new Date()),
  };
}

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setUser = (u) => setUserState(withDerived(u));

  async function refreshUser() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.user) {
        setUser(data.user);
        return data.user;
      }
    } catch {}
    return null;
  }

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
    const utmRaw = localStorage.getItem('utm_params');
    const utm = utmRaw ? JSON.parse(utmRaw) : {};
    analytics.identify(data.user.id, { email: data.user.email, name: data.user.name, ...utm });
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
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, loadUserFromToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

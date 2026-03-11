import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = '/api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('auth_token');
    if (stored) {
      verifyAndSetUser(stored);
    } else {
      setLoading(false);
    }
  }, []);

  async function verifyAndSetUser(t) {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${t}` }
      });
      if (res.ok) {
        const data = await res.json();
        setToken(t);
        setUser(data.user);
      } else {
        localStorage.removeItem('auth_token');
      }
    } catch {
      localStorage.removeItem('auth_token');
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
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
    localStorage.setItem('auth_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  function loginWithGoogle() {
    window.location.href = `${API_BASE}/auth/google`;
  }

  function setTokenAndUser(t, u) {
    localStorage.setItem('auth_token', t);
    setToken(t);
    setUser(u);
  }

  function logout() {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, loginWithGoogle, logout, setTokenAndUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('bt_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('bt_token'));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) localStorage.setItem('bt_token', token);
    else localStorage.removeItem('bt_token');
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem('bt_user', JSON.stringify(user));
    else localStorage.removeItem('bt_user');
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const register = async (payload) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', payload);
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const claim = async (email, password, claim_code) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/claim', { email, password, claim_code });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (current_password, new_password) => {
    // The server ends every older session on a password change and returns a
    // fresh token, so swap it in to keep this browser logged in.
    const { data } = await api.post('/auth/change-password', { current_password, new_password });
    setToken(data.token);
    setUser(data.user);
  };

  // Only deletes on the server; the caller navigates away and then calls logout(),
  // so a protected page doesn't redirect to the login screen mid-way.
  const deleteAccount = async (password) => {
    await api.delete('/auth/account', { data: { password } });
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      claim,
      changePassword,
      updateUser: setUser,
      deleteAccount,
      logout,
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

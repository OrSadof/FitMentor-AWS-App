import React, { createContext, useContext, useState, useEffect } from 'react';
import { fitmentorApi } from '../api/fitmentorApi';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('fitmentor_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) {
      localStorage.setItem('fitmentor_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('fitmentor_user');
    }
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fitmentorApi.login(email, password);
      const userData = {
        email,
        userName: res.userName || email,
        role: res.role || 'User',
        token: res.token,
        groups: res.groups || []
      };
      setUser(userData);
      return userData;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password, name) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fitmentorApi.register(email, password, name);
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const confirmRegister = async (email, code) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fitmentorApi.confirmRegister(email, code);
      return res;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('fitmentor_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        register,
        confirmRegister,
        logout,
        setUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

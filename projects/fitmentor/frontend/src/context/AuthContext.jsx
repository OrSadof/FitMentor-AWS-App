import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('fitmentor_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      localStorage.setItem('fitmentor_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('fitmentor_user');
    }
  }, [user]);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await authApi.login(email, password);
      // Construct user state
      const userData = {
        email: res.email || email,
        name: res.name || email.split('@')[0],
        userId: res.email || email,
        idToken: res.idToken,
        accessToken: res.accessToken,
        groups: res.groups || [],
        isAdmin: (res.groups || []).includes('Admins') || (res.email || '').toLowerCase().includes('admin'),
      };
      setUser(userData);
      return { success: true, user: userData };
    } catch (err) {
      console.error("Login failed:", err);
      return { success: false, message: err.message || err.error || "Login failed" };
    } finally {
      setLoading(false);
    }
  };

  const register = async (email, password, name) => {
    setLoading(true);
    try {
      const res = await authApi.register(email, password, name);
      return { success: true, message: res.message || "Registration successful! Check your email for confirmation." };
    } catch (err) {
      return { success: false, message: err.message || "Registration failed" };
    } finally {
      setLoading(false);
    }
  };

  const confirmRegister = async (email, code) => {
    setLoading(true);
    try {
      const res = await authApi.confirmRegister(email, code);
      return { success: true, message: "Email verified successfully!" };
    } catch (err) {
      return { success: false, message: err.message || "Confirmation failed" };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('fitmentor_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, confirmRegister, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Dumbbell, Lock, Mail, User, CheckCircle2, ArrowRight } from 'lucide-react';

export const AuthPage = () => {
  const { login, register, confirmRegister, loading } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'confirm'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'login') {
      const res = await login(email, password);
      if (!res.success) setError(res.message);
    } else if (mode === 'register') {
      const res = await register(email, password, name);
      if (res.success) {
        setInfo(res.message);
        setMode('confirm');
      } else {
        setError(res.message);
      }
    } else if (mode === 'confirm') {
      const res = await confirmRegister(email, code);
      if (res.success) {
        setInfo("Email verified! You can now log in.");
        setMode('login');
      } else {
        setError(res.message);
      }
    }
  };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '2.5rem' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ background: 'var(--accent-gradient)', width: '54px', height: '54px', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Dumbbell size={28} color="#fff" />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700' }}>
            {mode === 'login' && 'Welcome Back'}
            {mode === 'register' && 'Create Your Account'}
            {mode === 'confirm' && 'Verify Your Email'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {mode === 'login' && 'Sign in to access your AI fitness & cloud progress'}
            {mode === 'register' && 'Start tracking workouts and generating AI plans'}
            {mode === 'confirm' && `Enter verification code sent to ${email}`}
          </p>
        </div>

        {/* Notifications */}
        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#fca5a5', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#6ee7b7', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem', textAlign: 'center' }}>
            {info}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Full Name</label>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>
          )}

          {mode !== 'confirm' && (
            <>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  className="form-input"
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}

          {mode === 'confirm' && (
            <div className="form-group">
              <label>Verification Code / Link Confirmation</label>
              <input
                type="text"
                required
                className="form-input"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.85rem' }}>
            {loading ? 'Processing...' : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Verify Email'}
            <ArrowRight size={18} />
          </button>
        </form>

        {/* Toggle Mode Footer */}
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <span onClick={() => { setMode('register'); setError(''); setInfo(''); }} style={{ color: 'var(--accent-primary)', fontWeight: '600', cursor: 'pointer' }}>
                Sign Up
              </span>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <span onClick={() => { setMode('login'); setError(''); setInfo(''); }} style={{ color: 'var(--accent-primary)', fontWeight: '600', cursor: 'pointer' }}>
                Sign In
              </span>
            </p>
          )}
        </div>

      </div>
    </div>
  );
};

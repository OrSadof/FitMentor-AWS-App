import React from 'react';
import { useAuth } from '../context/AuthContext';

export function Navbar({ activeTab, setActiveTab, onOpenAuthModal }) {
  const { user, logout } = useAuth();

  const handleNavClick = (sectionId) => {
    setActiveTab('landing');
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  };

  return (
    <nav className="main-header">
      <div className="container nav-container">
        <a className="logo" onClick={() => setActiveTab('landing')} aria-label="FitMentor Home">
          <span className="logo-icon-text">💪</span>
          <span>Fit<span>Mentor</span></span>
        </a>

        {user && (
          <div className="user-greeting">
            שלום, {user.userName || user.email}
          </div>
        )}
        
        <div className="nav-links">
          {user ? (
            <>
              <button
                type="button"
                className={`btn-nav-register ${activeTab === 'dashboard' ? 'btn-nav-register' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                לדשבורד
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('training')}
              >
                לוג אימונים
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('progress')}
              >
                מעקב התקדמות
              </button>
              {user.role === 'Admin' && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  style={{ color: 'var(--accent-yellow)', fontWeight: 'bold' }}
                >
                  אדמין
                </button>
              )}
              <button
                type="button"
                className="btn-nav-logout"
                onClick={logout}
              >
                התנתקות
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-nav-register"
                onClick={onOpenAuthModal}
              >
                הרשמה / התחברות
              </button>
              <button type="button" onClick={() => handleNavClick('about')}>
                הבעיה והצורך
              </button>
              <button type="button" onClick={() => handleNavClick('features')}>
                פיצ'רים
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

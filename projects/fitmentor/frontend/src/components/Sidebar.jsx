import React from 'react';
import { useAuth } from '../context/AuthContext';

export const Sidebar = ({ isOpen, onClose, currentPage, setCurrentPage }) => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <>
      <div 
        className={`sidebar-overlay ${isOpen ? 'active' : ''}`} 
        onClick={onClose}
      />
      <aside className={`modern-sidebar ${isOpen ? 'active' : ''}`} aria-label="תפריט ניווט">
        <div className="sidebar-header">
          <a className="logo sidebar-logo" onClick={(e) => { e.preventDefault(); setCurrentPage('home'); onClose(); }} href="#">
            <span className="logo-icon-text">💪</span>
            <span>Fit<span>Mentor</span></span>
          </a>
          <button type="button" className="sidebar-close-btn" onClick={onClose} aria-label="סגור תפריט">×</button>
        </div>

        <nav className="sidebar-nav-container" aria-label="ניווט צד">
          <div 
            className={`sidebar-link ${currentPage === 'dashboard' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('dashboard'); onClose(); }}
          >
            <span className="icon">🏋️</span> דשבורד
          </div>
          
          <div 
            className={`sidebar-link ${currentPage === 'training' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('training'); onClose(); }}
          >
            <span className="icon">📝</span> לוג אימונים
          </div>
          
          <div 
            className={`sidebar-link ${currentPage === 'progress' ? 'active' : ''}`}
            onClick={() => { setCurrentPage('progress'); onClose(); }}
          >
            <span className="icon">📈</span> מעקב התקדמות
          </div>

          {user.isAdmin && (
            <div 
              className={`sidebar-link ${currentPage === 'admin' ? 'active' : ''}`}
              onClick={() => { setCurrentPage('admin'); onClose(); }}
            >
              <span className="icon">👑</span> אדמין מנהל
            </div>
          )}

          <div 
            className="sidebar-link"
            style={{ marginTop: 'auto', color: '#f43f5e' }}
            onClick={() => { logout(); setCurrentPage('home'); onClose(); }}
          >
            <span className="icon">🚪</span> התנתקות
          </div>
        </nav>
      </aside>
    </>
  );
};

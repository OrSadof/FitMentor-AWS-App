import React from 'react';
import { useAuth } from '../context/AuthContext';

export const Navbar = ({ onOpenAuthModal, currentPage, setCurrentPage, toggleSidebar }) => {
  const { user } = useAuth();

  return (
    <nav className="main-header">
      <div className="container nav-container">
        
        {/* Hamburger for dashboard pages */}
        {currentPage !== 'home' && (
          <button 
            type="button" 
            className="hamburger-btn" 
            onClick={toggleSidebar}
            aria-label="פתח תפריט"
          >
            <span className="hamburger-lines">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        )}

        {/* Logo */}
        <a className="logo" onClick={(e) => { e.preventDefault(); setCurrentPage('home'); }} href="#" aria-label="FitMentor Home">
          <span className="logo-icon-text">💪</span>
          <span>Fit<span>Mentor</span></span>
        </a>

        {/* User Greeting */}
        <div id="userGreeting" className="user-greeting">
          {user ? `שלום, ${user.name || user.email?.split('@')[0] || ''}` : ''}
        </div>

        {/* Nav Links */}
        <div className="nav-links">
          {currentPage !== 'home' && (
            <button 
              type="button" 
              className="btn-nav-register" 
              onClick={() => setCurrentPage('home')}
            >
              דף הבית
            </button>
          )}

          {user ? (
            <button 
              type="button" 
              className="btn-nav-register"
              onClick={() => setCurrentPage(currentPage === 'home' ? 'dashboard' : 'dashboard')}
            >
              {currentPage === 'home' ? 'לדשבורד' : 'דשבורד'}
            </button>
          ) : (
            <button 
              type="button" 
              className="btn-nav-register"
              onClick={onOpenAuthModal}
            >
              הרשמה / התחברות
            </button>
          )}

          {currentPage === 'home' && (
            <>
              <a href="#about">הבעיה והצורך</a>
              <a href="#features">פיצ'רים</a>
            </>
          )}
        </div>

      </div>
    </nav>
  );
};

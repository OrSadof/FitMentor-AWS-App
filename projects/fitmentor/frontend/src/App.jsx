import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';

import { HomePage } from './pages/HomePage';
import { DashboardPage } from './pages/DashboardPage';
import { ProgressPage } from './pages/ProgressPage';
import { TrainingLogPage } from './pages/TrainingLogPage';
import { AdminPage } from './pages/AdminPage';

import './styles/index.css';

const MainContent = () => {
  const [currentPage, setCurrentPage] = useState('home'); // 'home' | 'dashboard' | 'progress' | 'training' | 'admin'
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', direction: 'rtl' }}>
      
      {/* Top Main Navigation Header */}
      <Navbar 
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        toggleSidebar={() => setIsSidebarOpen(prev => !prev)}
      />

      {/* Slide-out Navigation Drawer for Dashboard pages */}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
      />

      {/* Main View Router */}
      <div style={{ flex: 1 }}>
        {currentPage === 'home' && (
          <HomePage 
            onOpenAuthModal={() => setIsAuthModalOpen(true)} 
            onGoToDashboard={() => setCurrentPage('dashboard')}
          />
        )}
        {currentPage === 'dashboard' && <DashboardPage />}
        {currentPage === 'progress' && <ProgressPage />}
        {currentPage === 'training' && <TrainingLogPage />}
        {currentPage === 'admin' && <AdminPage />}
      </div>

      {/* Login / Registration / Reset Password Modal */}
      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => setCurrentPage('dashboard')}
      />

    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}

export default App;

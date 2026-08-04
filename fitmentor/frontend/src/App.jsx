import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProgressPage } from './pages/ProgressPage';
import { TrainingLogPage } from './pages/TrainingLogPage';
import { AdminPage } from './pages/AdminPage';

function AppContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('landing');
  const [showAuthModal, setShowAuthModal] = useState(false);

  // If user logs in while on landing, redirect to dashboard
  const handleAuthSuccess = () => {
    setActiveTab('dashboard');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenAuthModal={() => {
          setActiveTab('landing');
          setShowAuthModal(true);
        }}
      />

      <main style={{ flex: 1 }}>
        {(!user || activeTab === 'landing') && (
          <LandingPage onAuthSuccess={handleAuthSuccess} />
        )}

        {user && activeTab === 'dashboard' && <DashboardPage />}
        {user && activeTab === 'progress' && <ProgressPage />}
        {user && activeTab === 'training' && <TrainingLogPage />}
        {user && activeTab === 'admin' && <AdminPage />}
      </main>

      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

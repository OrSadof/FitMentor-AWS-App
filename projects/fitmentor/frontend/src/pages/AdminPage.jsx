import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { authApi } from '../services/api';

export const AdminPage = () => {
  const { user } = useAuth();

  const [adminData, setAdminData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (user?.userId && user?.isAdmin) {
      loadAdminData();
    }
  }, [user]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const res = await authApi.getAdminDashboard(user.userId);
      setAdminData(res);
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      setMsg("שגיאה בטעינת נתוני אדמין.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUser = async (username, currentEnabled) => {
    try {
      await authApi.toggleUserStatus(user.userId, username, !currentEnabled);
      setMsg(`סטטוס המשתמש ${username} עודכן בהצלחה!`);
      loadAdminData();
    } catch (err) {
      setMsg("שגיאה בעדכון סטטוס המשתמש.");
    }
  };

  if (!user?.isAdmin) {
    return (
      <main className="hero" style={{ paddingTop: '120px', minHeight: '80vh', textAlign: 'center' }}>
        <div className="container">
          <h2 style={{ color: '#f43f5e' }}>גישה מוגבלת 🛑</h2>
          <p style={{ color: '#cbd5e1', marginTop: '10px' }}>רק משתמשים בעלי הרשאות אדמין (Admins Group) רשאים לצפות בדף זה.</p>
        </div>
      </main>
    );
  }

  const usersList = adminData?.users || adminData?.rows || [];
  const metrics = adminData?.metrics || {};

  return (
    <main className="hero" style={{ paddingTop: '110px', paddingBottom: '60px', minHeight: '100vh' }}>
      <div className="container hero-content" style={{ width: '100%', maxWidth: '1000px' }}>
        
        <h1 className="hero-title" style={{ marginBottom: '10px' }}>
          <span className="hero-title-main">דשבורד מנהל מערכת</span>
          <span className="gradient-text">Admin Dashboard</span>
        </h1>
        <p className="hero-subtitle" style={{ opacity: 1, animation: 'none', marginBottom: '35px' }}>
          ניהול משתמשים ב-AWS Cognito ומעקב אחר ביצועי המערכת בענן!
        </p>

        {msg && (
          <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid #34d399', color: '#34d399', padding: '12px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
            {msg}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>סה"כ משתמשים רשומים</span>
            <h3 style={{ fontSize: '2rem', color: '#22d3ee', marginTop: '5px' }}>{usersList.length || '--'}</h3>
          </div>

          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>קריאות AI שבוצעו</span>
            <h3 style={{ fontSize: '2rem', color: '#34d399', marginTop: '5px' }}>{metrics.aiCallsTotal || 12}</h3>
          </div>

          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>אזור AWS פעיל</span>
            <h3 style={{ fontSize: '1.5rem', color: '#f8fafc', marginTop: '5px' }}>eu-north-1</h3>
          </div>
        </div>

        {/* Users Table */}
        <div className="dashboard-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'white' }}>👥 ניהול משתמשים ב-Cognito User Pool</h3>
            <button onClick={loadAdminData} className="btn-nav-register" style={{ padding: '6px 14px', fontSize: '0.85rem' }}>
              רענן נתונים
            </button>
          </div>

          {loading ? (
            <p style={{ color: '#cbd5e1' }}>טוען משתמשים מ-AWS...</p>
          ) : usersList.length === 0 ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>לא נמצאו משתמשים במאגר.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155', color: '#22d3ee' }}>
                    <th style={{ padding: '12px' }}>אימייל / משתמש</th>
                    <th style={{ padding: '12px' }}>שם מלא</th>
                    <th style={{ padding: '12px' }}>סטטוס</th>
                    <th style={{ padding: '12px' }}>תאריך הרשמה</th>
                    <th style={{ padding: '12px' }}>פעולה</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '12px', fontWeight: 'bold' }}>{u.username || u.email}</td>
                      <td style={{ padding: '12px' }}>{u.name || '-'}</td>
                      <td style={{ padding: '12px' }}>
                        {u.enabled !== false ? (
                          <span style={{ color: '#34d399', fontWeight: 'bold' }}>✅ פעיל</span>
                        ) : (
                          <span style={{ color: '#f43f5e', fontWeight: 'bold' }}>⛔ חסום</span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>{u.joined || u.createdAt || 'לאחרונה'}</td>
                      <td style={{ padding: '12px' }}>
                        <button 
                          onClick={() => handleToggleUser(u.username, u.enabled !== false)}
                          style={{ 
                            background: u.enabled !== false ? 'rgba(244,63,94,0.2)' : 'rgba(52,211,153,0.2)', 
                            color: u.enabled !== false ? '#f43f5e' : '#34d399', 
                            border: '1px solid ' + (u.enabled !== false ? '#f43f5e' : '#34d399'), 
                            borderRadius: '6px', 
                            padding: '4px 12px', 
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          {u.enabled !== false ? 'חסום גישה' : 'בטל חסימה'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
};

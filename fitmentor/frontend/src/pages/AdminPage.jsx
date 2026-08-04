import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fitmentorApi } from '../api/fitmentorApi';

export function AdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (user?.email && user?.role === 'Admin') {
      loadAdminDashboard();
    }
  }, [user]);

  const loadAdminDashboard = async () => {
    setLoading(true);
    try {
      const res = await fitmentorApi.adminGetDashboardData(user.email, user.token);
      setData(res);
    } catch (err) {
      console.error('Error loading admin dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleBlock = async (username, currentlyBlocked) => {
    setActionLoading(true);
    try {
      await fitmentorApi.adminSetUserBlocked(user.email, username, !currentlyBlocked, user.token);
      await loadAdminDashboard();
    } catch (err) {
      alert('שגיאה בשינוי סטאטוס משתמש: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (user?.role !== 'Admin') {
    return (
      <div className="container" style={{ paddingTop: '120px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--accent-red)' }}>אין הרשאה</h2>
        <p className="text-muted">עליך להתחבר כמנהל מערכת (Admin) כדי לצפות בדף זה.</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: '100px', paddingBottom: '50px' }}>
      <div className="dashboard-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              🛡️ פאנל ניהול מערכת FitMentor Admin
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              ניהול משתמשים בזמן אמת ב-Cognito User Pool ומטריקות DynamoDB.
            </p>
          </div>
          <button className="btn-nav-register" onClick={loadAdminDashboard} disabled={loading}>
            רענן נתונים
          </button>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-card" style={{ textAlign: 'center', padding: '50px' }}>
          <p className="text-muted">טוען נתוני אדמין מ-AWS Cognito ו-DynamoDB...</p>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
            <div className="stat-card">
              <div className="stat-data">
                <span className="stat-value">{data?.stats?.usersRegistered || 0}</span>
                <span className="stat-label">משתמשים רשומים</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-data">
                <span className="stat-value" style={{ color: 'var(--accent-green)' }}>{data?.stats?.activeToday || 0}</span>
                <span className="stat-label">פעילים היום</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-data">
                <span className="stat-value" style={{ color: 'var(--accent-yellow)' }}>{data?.stats?.workoutsSaved || 0}</span>
                <span className="stat-label">אימונים שנשמרו</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-data">
                <span className="stat-value" style={{ color: 'var(--accent-cyan)' }}>{data?.stats?.aiCallsTotal || 0}</span>
                <span className="stat-label">קריאות AI סה"כ</span>
              </div>
            </div>
          </div>

          {/* User Management Table */}
          <div className="dashboard-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', color: 'var(--accent-cyan)' }}>
              👥 ניהול חשבונות משתמשים
            </h2>

            {data?.users?.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px' }}>שם מלא</th>
                    <th style={{ padding: '12px' }}>אימייל</th>
                    <th style={{ padding: '12px' }}>תאריך הצטרפות</th>
                    <th style={{ padding: '12px' }}>סטאטוס</th>
                    <th style={{ padding: '12px', textAlign: 'left' }}>פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{u.name}</td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{u.email}</td>
                      <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{u.joined}</td>
                      <td style={{ padding: '12px' }}>
                        <span className="text-cyan fw-bold">
                          {u.status === 'blocked' ? 'חסימה' : u.status === 'unconfirmed' ? 'לא מאומת' : 'פעיל'}
                        </span>
                      </td>
                      <td style={{ padding: '12px', textAlign: 'left' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleBlock(u.username, u.status === 'blocked')}
                          disabled={actionLoading}
                          style={{
                            background: u.status === 'blocked' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            border: u.status === 'blocked' ? '1px solid var(--accent-green)' : '1px solid #ef4444',
                            color: u.status === 'blocked' ? 'var(--accent-green)' : '#ef4444',
                            padding: '4px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 700
                          }}
                        >
                          {u.status === 'blocked' ? 'ביטול חסימה' : 'חסימת משתמש'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>לא נמצאו משתמשים רגילים במערכת.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

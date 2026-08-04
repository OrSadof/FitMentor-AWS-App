import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fitmentorApi } from '../api/fitmentorApi';

export function ProgressPage() {
  const { user } = useAuth();
  const [progressData, setProgressData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [daysFilter, setDaysFilter] = useState(30);

  useEffect(() => {
    if (user?.email) {
      fetchProgress();
    }
  }, [user, daysFilter]);

  const fetchProgress = async () => {
    setLoading(true);
    try {
      const data = await fitmentorApi.getProgressData(user.email, daysFilter);
      setProgressData(data);
    } catch (err) {
      console.error('Error fetching progress:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: '100px', paddingBottom: '50px' }}>
      <div className="dashboard-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              📈 מעקב התקדמות ושיאים אישיים (PR)
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              וויזואליזציה של עקביות אימונים, עומסים מצטברים ושיאי משקל וחזרות.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {[7, 30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setDaysFilter(d)}
                style={{
                  background: daysFilter === d ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)',
                  color: daysFilter === d ? 'var(--bg-dark)' : 'var(--text-main)',
                  border: '1px solid var(--border-color)',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.85rem'
                }}
              >
                {d} ימים
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-card" style={{ textAlign: 'center', padding: '50px' }}>
          <p className="text-muted">טוען נתוני התקדמות מ-DynamoDB...</p>
        </div>
      ) : (
        <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Consistency Heatmap */}
          <div className="dashboard-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', color: 'var(--accent-green)' }}>
              🔥 מפת עקביות אימונים (Heatmap)
            </h2>
            {progressData?.heatmap?.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '16px' }}>
                {progressData.heatmap.map((item, idx) => (
                  <div
                    key={idx}
                    title={`${item.date}: ${item.count} אימונים, ${item.calories} קלוריות`}
                    style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: '3px',
                      background: item.count > 0 ? 'var(--accent-green)' : 'rgba(255,255,255,0.05)',
                      boxShadow: item.count > 0 ? '0 0 8px rgba(52, 211, 153, 0.4)' : 'none'
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                עדיין אין אימונים מתועדים בפרק הזמן שנבחר. תעד אימונים בלוג האימונים כדי לראות את המפה!
              </p>
            )}
          </div>

          {/* All-Time PRs */}
          <div className="dashboard-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', color: 'var(--accent-yellow)' }}>
              🏆 שיאים אישיים בכל הזמנים (PR)
            </h2>
            {progressData?.summary?.allTimePRs?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {progressData.summary.allTimePRs.map((pr, idx) => (
                  <div
                    key={idx}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'rgba(15, 23, 42, 0.7)', borderRadius: '8px', border: '1px solid var(--border-color)' }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{pr.exercise}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>תאריך: {pr.date}</div>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--accent-yellow)' }}>
                      {pr.weight} ק"ג × {pr.reps} חזרות
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                עדיין לא נרשמו שיאים אישיים. תעד משקלים וחזרות בלוג האימונים!
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { fitmentorApi } from '../api/fitmentorApi';

function fmtNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '--';
  try { return n.toLocaleString(); } catch { return String(n); }
}

function safeDateFromYmd(ymd) {
  const s = String(ymd || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeDateFromYm(ym) {
  const s = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}-01T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatHebrewWeekdayLabelFromYmd(ymd) {
  const d = safeDateFromYmd(ymd);
  if (!d) return String(ymd || '');
  try {
    return new Intl.DateTimeFormat('he-IL', { weekday: 'long', timeZone: 'Asia/Jerusalem' }).format(d);
  } catch {
    return String(ymd || '');
  }
}

function formatHebrewMonthLabelFromYm(ym) {
  const d = safeDateFromYm(ym);
  if (!d) return String(ym || '');
  try {
    return new Intl.DateTimeFormat('he-IL', { month: 'long', timeZone: 'Asia/Jerusalem' }).format(d);
  } catch {
    return String(ym || '');
  }
}

// Executive Vector SVG Icons
function AdminShieldSVG() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="url(#shield-grad)" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="shield-grad" x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f59e0b" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function UsersGroupSVG() {
  return (
    <div className="admin-stat-icon-wrapper icon-cyan">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="url(#cyan-grad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="7" r="4" stroke="url(#cyan-grad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="cyan-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#06b6d4" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function ActiveFireSVG() {
  return (
    <div className="admin-stat-icon-wrapper icon-orange">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z" fill="url(#fire-grad)" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="fire-grad" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fbbf24" />
            <stop offset="0.5" stopColor="#f97316" />
            <stop offset="1" stopColor="#ef4444" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function WorkoutDumbbellSVG() {
  return (
    <div className="admin-stat-icon-wrapper icon-green">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M18 8v8M6 8v8M9 4v16M15 4v16" stroke="url(#green-grad)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="green-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#34d399" />
            <stop offset="1" stopColor="#059669" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function AiBrainSVG() {
  return (
    <div className="admin-stat-icon-wrapper icon-purple">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" fill="url(#purple-grad)" opacity="0.2" />
        <path d="M12 6v12M6 12h12M8 8l8 8M16 8l-8 8" stroke="url(#purple-grad)" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="12" cy="12" r="3" fill="url(#purple-grad)" />
        <defs>
          <linearGradient id="purple-grad" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c084fc" />
            <stop offset="1" stopColor="#e879f9" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function TrendLineSVG() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 6h6v6" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChartSVG() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M12 20V10M18 20V4M6 20v-4" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UserManagementSVG() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="#38bdf8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 11l-3 3-1.5-1.5" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AdminDashboardPage({ user, onNavigate, showToast, onLogout }) {
  const adminEmail = user?.email || localStorage.getItem('fitmentor_userEmail') || localStorage.getItem('fitmentor_userId') || localStorage.getItem('fitmentor_email') || 'orsadof@gmail.com';
  const token = localStorage.getItem('fitmentor_idToken') || localStorage.getItem('fitmentor_accessToken') || '';

  const [stats, setStats] = useState({ usersRegistered: 0, activeToday: 0, workoutsSaved: 0, aiCallsTotal: 0 });
  const [usersList, setUsersList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, user: null });
  const [isSubmittingBlock, setIsSubmittingBlock] = useState(false);

  // Chart Canvas Refs
  const joinCanvasRef = useRef(null);
  const activityCanvasRef = useRef(null);

  // Chart Instance Refs
  const joinChartInst = useRef(null);
  const activityChartInst = useRef(null);

  useEffect(() => {
    // Check Role Access
    const role = localStorage.getItem('fitmentor_role') || '';
    const emailNorm = (adminEmail || '').toLowerCase().trim();
    const isAdmin = role === 'Admin' || emailNorm === 'orsadof@gmail.com' || emailNorm === 'orhupro@gmail.com' || emailNorm === 'admin' || emailNorm.includes('admin');

    if (!isAdmin) {
      if (showToast) showToast('אין לך הרשאה לצפות בדף ניהול זה.', 'error');
      if (onNavigate) onNavigate('landing');
      return;
    }

    loadAdminDashboard();
  }, [adminEmail]);

  const [apiError, setApiError] = useState(null);

  const isUserAdminRow = (u) => {
    const email = (u?.email || u?.username || '').toLowerCase().trim();
    const role = (u?.role || u?.userRole || '').toLowerCase().trim();
    return role === 'admin' || email === 'orsadof@gmail.com' || email === 'admin@fitmentor.com';
  };

  const isTestOrDebugUser = (u) => {
    const email = (u?.email || u?.username || '').toLowerCase().trim();
    return email.includes('check') || email.includes('test') || email.includes('nosymbols') || email.includes('user12345');
  };

  const getRealChartsData = (users, apiCharts) => {
    // 1. Join Trend from Cloud or dynamically computed from actual Cognito registration dates
    let joinTrend = apiCharts?.joinTrend;
    if (!joinTrend || !Array.isArray(joinTrend.labels) || joinTrend.labels.length === 0) {
      const now = new Date();
      const monthKeys = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        monthKeys.push(key);
      }
      const joinCounts = Object.fromEntries(monthKeys.map(k => [k, 0]));
      users.forEach(u => {
        if (!u?.joined && !u?.createdAt) return;
        const key = String(u.joined || u.createdAt).substring(0, 7);
        if (key in joinCounts) {
          joinCounts[key] += 1;
        }
      });
      joinTrend = {
        labels: monthKeys,
        data: monthKeys.map(k => joinCounts[k])
      };
    }

    // 2. Daily Activity from Cloud API
    let dailyActivity = apiCharts?.dailyActivity;
    if (!dailyActivity || !Array.isArray(dailyActivity.labels) || dailyActivity.labels.length === 0) {
      const dayKeys = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dayKeys.push(d.toISOString().split('T')[0]);
      }
      dailyActivity = {
        labels: dayKeys,
        data: dayKeys.map(() => 0)
      };
    }

    return {
      joinTrend,
      dailyActivity
    };
  };

  const loadAdminDashboard = async () => {
    setLoading(true);
    setApiError(null);

    const storedToken = localStorage.getItem('fitmentor_idToken') || localStorage.getItem('fitmentor_accessToken') || token;

    try {
      let data = await fitmentorApi.adminGetDashboardData(adminEmail, storedToken);

      if (data && typeof data.body === 'string') {
        try {
          const parsed = JSON.parse(data.body);
          data = { ...data, ...parsed };
        } catch { }
      }

      if (!data || (data?.statusCode && data.statusCode >= 400)) {
        throw new Error(data?.message || data?.error || 'שגיאה בקבלת נתונים מהשרת ב-AWS');
      }

      const statsObj = data?.stats || {};
      const rawUsers = Array.isArray(data?.users) ? data.users : [];
      const nonAdminUsers = rawUsers.filter(u => !isUserAdminRow(u) && !isTestOrDebugUser(u));

      const computedChartData = getRealChartsData(nonAdminUsers, data?.charts);

      const finalStats = {
        usersRegistered: typeof statsObj.usersRegistered === 'number' ? statsObj.usersRegistered : nonAdminUsers.length,
        activeToday: typeof statsObj.activeToday === 'number' ? statsObj.activeToday : nonAdminUsers.filter(u => u.status === 'active').length,
        workoutsSaved: typeof statsObj.workoutsSaved === 'number' ? statsObj.workoutsSaved : 0,
        aiCallsTotal: typeof statsObj.aiCallsTotal === 'number' ? statsObj.aiCallsTotal : 0
      };

      setStats(finalStats);
      setUsersList(nonAdminUsers);
      initCharts(computedChartData);
    } catch (err) {
      console.error('Failed to fetch admin dashboard from AWS:', err);
      const errMsg = err?.message || 'לא ניתן לתקשר עם בסיס הנתונים ב-AWS';
      setApiError(errMsg);
      setUsersList([]);
      setStats({ usersRegistered: 0, activeToday: 0, workoutsSaved: 0, aiCallsTotal: 0 });
      initCharts({ joinTrend: { labels: [], data: [] }, dailyActivity: { labels: [], data: [] } });
      if (showToast) showToast(`שגיאה בטעינת נתונים מ-AWS: ${errMsg}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const initCharts = (chartsData) => {
    const join = chartsData?.joinTrend || {};
    const daily = chartsData?.dailyActivity || {};

    const joinLabels = Array.isArray(join.labels) ? join.labels : [];
    const joinData = Array.isArray(join.data) ? join.data : [];
    const dailyLabels = Array.isArray(daily.labels) ? daily.labels : [];
    const dailyData = Array.isArray(daily.data) ? daily.data : [];

    const joinLabelsPretty = joinLabels.map(formatHebrewMonthLabelFromYm);
    const dailyLabelsPretty = dailyLabels.map(formatHebrewWeekdayLabelFromYmd);

    // Destroy existing instances
    if (joinChartInst.current) {
      try { joinChartInst.current.destroy(); } catch { }
      joinChartInst.current = null;
    }
    if (activityChartInst.current) {
      try { activityChartInst.current.destroy(); } catch { }
      activityChartInst.current = null;
    }

    // Render Join Trend Chart
    if (joinCanvasRef.current) {
      const ctx1 = joinCanvasRef.current.getContext('2d');

      const gradient = ctx1.createLinearGradient(0, 0, 0, 240);
      gradient.addColorStop(0, 'rgba(251, 191, 36, 0.45)');
      gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0.12)');
      gradient.addColorStop(1, 'rgba(251, 191, 36, 0.00)');

      joinChartInst.current = new Chart(ctx1, {
        type: 'line',
        data: {
          labels: joinLabelsPretty.length > 0 ? joinLabelsPretty : ['מאי', 'יוני', 'יולי'],
          datasets: [{
            label: 'מצטרפים חדשים',
            data: joinData.length > 0 ? joinData : [0, 0, 0],
            borderColor: '#fbbf24',
            backgroundColor: gradient,
            borderWidth: 3.5,
            fill: true,
            tension: 0.35,
            pointRadius: 6,
            pointHoverRadius: 9,
            pointBackgroundColor: '#fbbf24',
            pointBorderColor: '#0f172a',
            pointBorderWidth: 2.5,
            pointHoverBackgroundColor: '#ffffff',
            pointHoverBorderColor: '#fbbf24',
            pointHoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: '#f8fafc',
              bodyColor: '#fbbf24',
              borderColor: 'rgba(251, 191, 36, 0.3)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 10,
              displayColors: false,
              bodyFont: { weight: 'bold', size: 14 }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#94a3b8', font: { size: 12, weight: '600' }, padding: 8 }
            },
            y: {
              position: 'left',
              beginAtZero: true,
              suggestedMax: Math.max(...joinData, 3) + 1,
              grid: {
                color: 'rgba(255, 255, 255, 0.06)',
                drawBorder: false,
                drawTicks: false
              },
              border: { display: false },
              ticks: {
                color: '#94a3b8',
                padding: 12,
                precision: 0,
                stepSize: 1,
                font: { size: 12, weight: '600' },
                callback: function (val) {
                  return Number.isInteger(val) ? val : '';
                }
              }
            }
          }
        }
      });
    }

    // Render Daily Activity Chart
    if (activityCanvasRef.current) {
      const ctx2 = activityCanvasRef.current.getContext('2d');

      const barGradient = ctx2.createLinearGradient(0, 0, 0, 240);
      barGradient.addColorStop(0, 'rgba(52, 211, 153, 0.95)');
      barGradient.addColorStop(1, 'rgba(16, 185, 129, 0.25)');

      const barHoverGradient = ctx2.createLinearGradient(0, 0, 0, 240);
      barHoverGradient.addColorStop(0, '#34d399');
      barHoverGradient.addColorStop(1, 'rgba(52, 211, 153, 0.6)');

      activityChartInst.current = new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: dailyLabelsPretty.length > 0 ? dailyLabelsPretty : ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'],
          datasets: [{
            label: 'התחברויות ייחודיות',
            data: dailyData.length > 0 ? dailyData : [0, 0, 0, 0, 0, 0, 0],
            backgroundColor: barGradient,
            hoverBackgroundColor: barHoverGradient,
            borderRadius: 8,
            borderSkipped: false,
            maxBarThickness: 32,
            categoryPercentage: 0.65,
            barPercentage: 0.8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              titleColor: '#f8fafc',
              bodyColor: '#34d399',
              borderColor: 'rgba(52, 211, 153, 0.3)',
              borderWidth: 1,
              padding: 12,
              cornerRadius: 10,
              displayColors: false,
              bodyFont: { weight: 'bold', size: 14 }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { color: '#94a3b8', font: { size: 12, weight: '600' }, padding: 8 }
            },
            y: {
              position: 'left',
              beginAtZero: true,
              suggestedMax: Math.max(...dailyData, 3) + 1,
              grid: {
                color: 'rgba(255, 255, 255, 0.06)',
                drawBorder: false,
                drawTicks: false
              },
              border: { display: false },
              ticks: {
                color: '#94a3b8',
                padding: 12,
                precision: 0,
                stepSize: 1,
                font: { size: 12, weight: '600' },
                callback: function (val) {
                  return Number.isInteger(val) ? val : '';
                }
              }
            }
          }
        }
      });
    }
  };

  const handleToggleUserBlock = (targetUser) => {
    const status = String(targetUser.status || 'active');
    if (status === 'unconfirmed') return;

    if (status === 'active') {
      // Show Confirmation Modal
      setConfirmModal({ isOpen: true, user: targetUser });
    } else {
      // Unblock directly
      executeUserBlock(targetUser.username, false);
    }
  };

  const executeUserBlock = async (username, blocked) => {
    setIsSubmittingBlock(true);
    const storedToken = localStorage.getItem('fitmentor_idToken') || localStorage.getItem('fitmentor_accessToken') || token;
    try {
      const targetUser = usersList.find(u => u.username === username || u.email === username);
      const email = targetUser?.email || username;

      // 1. Live call to AWS cloud
      await fitmentorApi.adminSetUserBlocked(adminEmail, username, blocked, storedToken);

      // 2. Update UI state on successful response
      setUsersList(prev => prev.map(u => {
        if (u.username === username || u.email === email) {
          return { ...u, status: blocked ? 'blocked' : 'active' };
        }
        return u;
      }));

      // Close modal
      setConfirmModal({ isOpen: false, user: null });

      if (showToast) {
        showToast(blocked ? `המשתמש ${email} נחסם בהצלחה ב-AWS ✅` : `המשתמש ${email} הופעל בהצלחה ב-AWS ✅`);
      }
    } catch (err) {
      console.error('Failed to block/unblock user:', err);
      if (showToast) showToast(err?.message || 'שגיאה בעדכון סטטוס משתמש ב-AWS', 'error');
    } finally {
      setIsSubmittingBlock(false);
    }
  };

  const filteredUsers = usersList.filter(u => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    return (
      (u.name || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.username || '').toLowerCase().includes(term)
    );
  });

  return (
    <main className="admin-page">
      <div className="container admin-container">

        {/* Header */}
        <header className="page-intro">
          <div className="admin-eyebrow">ממשק ניהול</div>
          <div className="admin-header-row">
            <div>
              <h1 className="page-title">לוח ניהול מערכת</h1>
              <p className="text-muted">סקירת משתמשים, סטטיסטיקות ובקרת גישה</p>
            </div>
            {onLogout && (
              <button
                type="button"
                className="admin-logout-btn"
                onClick={onLogout}
                title="התנתקות"
              >
                <span>התנתק</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {apiError && (
          <div className="admin-error-banner" style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fca5a5',
            fontSize: '0.95rem',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>⚠️</span>
              <span><strong>שגיאת תקשורת עם AWS:</strong> {apiError}</span>
            </div>
            <button
              onClick={loadAdminDashboard}
              style={{
                background: 'rgba(239, 68, 68, 0.3)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s ease'
              }}
            >
              נסה שוב
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="admin-section-label">סקירה כללית</div>
        <section className="admin-section stats-grid">
          <div className="stat-card">
            <UsersGroupSVG />
            <div className="stat-data">
              <span className={`stat-value ${loading ? 'stat-value--loading' : ''}`}>{loading ? '' : fmtNumber(stats.usersRegistered)}</span>
              <span className="stat-label">משתמשים רשומים</span>
            </div>
          </div>
          <div className="stat-card">
            <ActiveFireSVG />
            <div className="stat-data">
              <span className={`stat-value ${loading ? 'stat-value--loading' : ''}`}>{loading ? '' : fmtNumber(stats.activeToday)}</span>
              <span className="stat-label">פעילים היום</span>
            </div>
          </div>
          <div className="stat-card">
            <WorkoutDumbbellSVG />
            <div className="stat-data">
              <span className={`stat-value ${loading ? 'stat-value--loading' : ''}`}>{loading ? '' : fmtNumber(stats.workoutsSaved)}</span>
              <span className="stat-label">אימונים שנשמרו</span>
            </div>
          </div>
          <div className="stat-card">
            <AiBrainSVG />
            <div className="stat-data">
              <span className={`stat-value ${loading ? 'stat-value--loading' : ''}`}>{loading ? '' : fmtNumber(stats.aiCallsTotal)}</span>
              <span className="stat-label">שימוש כולל ב-AI</span>
            </div>
          </div>
        </section>

        {/* Charts Row */}
        <div className="admin-section-label">ניתוח נתונים</div>
        <section className="admin-section charts-row">
          <div className="chart-container">
            <div className="chart-header-row">
              <h3 className="chart-header-h3">
                <span className="chart-icon-badge icon-gold">
                  <TrendLineSVG />
                </span>
                <span>מגמת הצטרפות (חצי שנה אחרונה)</span>
              </h3>
            </div>
            <div className="chart-wrapper">
              <canvas ref={joinCanvasRef} />
            </div>
          </div>

          <div className="chart-container">
            <div className="chart-header-row">
              <h3 className="chart-header-h3">
                <span className="chart-icon-badge icon-emerald">
                  <BarChartSVG />
                </span>
                <span>התחברויות יומיות (שבעה ימים אחרונים)</span>
              </h3>
            </div>
            <div className="chart-wrapper">
              <canvas ref={activityCanvasRef} />
            </div>
          </div>
        </section>

        {/* Users Table Section */}
        <div className="admin-section-label">ניהול משתמשים</div>
        <section className="admin-section">
          <div className="section-head">
            <div className="section-title-group">
              <div className="section-icon-badge icon-sky">
                <UserManagementSVG />
              </div>
              <h2>ניהול משתמשים</h2>
            </div>
            <div className="search-wrap">
              <input
                type="text"
                placeholder="חיפוש לפי אימייל או שם..."
                className="admin-input"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="table-frame">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>שם משתמש</th>
                  <th>אימייל</th>
                  <th>תאריך הצטרפות</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      {loading ? 'טוען משתמשים...' : 'לא נמצאו משתמשים'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, i) => {
                    const status = String(u.status || 'active');
                    const statusClass = status === 'active' ? 'status-active' : (status === 'unconfirmed' ? 'status-unconfirmed' : 'status-blocked');
                    const statusText = status === 'active' ? 'פעיל' : (status === 'unconfirmed' ? 'לא מאומת' : 'חסום');
                    const isUnconfirmed = status === 'unconfirmed';

                    return (
                      <tr key={u.username || u.email || i}>
                        <td><strong>{u.name || u.displayName || 'מתאמן'}</strong></td>
                        <td>{u.email}</td>
                        <td dir="ltr">{u.joined || u.createdAt || '--'}</td>
                        <td>
                          <span className={`status-badge ${statusClass}`}>{statusText}</span>
                        </td>
                        <td>
                          {isUnconfirmed ? (
                            <button className="btn-action btn-disabled" disabled>לא ניתן</button>
                          ) : status === 'active' ? (
                            <button className="btn-action btn-block" onClick={() => handleToggleUserBlock(u)}>
                              חסום משתמש
                            </button>
                          ) : (
                            <button className="btn-action btn-activate" onClick={() => handleToggleUserBlock(u)}>
                              הפעל משתמש
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="confirmation-modal-overlay show" onClick={() => setConfirmModal({ isOpen: false, user: null })}>
          <div className="confirmation-modal" onClick={e => e.stopPropagation()}>
            <div className="confirmation-header">
              <span className="confirmation-icon">⚠️</span>
              <h3>אישור חסימת משתמש</h3>
            </div>
            <div className="confirmation-body">
              <p>האם אתה בטוח שברצונך לחסום את <strong>{confirmModal.user?.name || confirmModal.user?.email}</strong>?</p>
              <p className="confirmation-note">לאחר חסימה, המשתמש לא יוכל להתחבר למערכת.</p>
            </div>
            <div className="confirmation-footer">
              <button
                type="button"
                className="btn-cancel"
                onClick={() => setConfirmModal({ isOpen: false, user: null })}
                disabled={isSubmittingBlock}
              >
                ביטול
              </button>
              <button
                type="button"
                className="btn-confirm-danger"
                onClick={() => executeUserBlock(confirmModal.user?.username, true)}
                disabled={isSubmittingBlock}
              >
                {isSubmittingBlock ? 'חוסם...' : 'חסום משתמש'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

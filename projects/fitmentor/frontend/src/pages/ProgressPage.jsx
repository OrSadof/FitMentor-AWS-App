import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { progressApi } from '../services/api';

export const ProgressPage = () => {
  const { user } = useAuth();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [waist, setWaist] = useState('');
  const [chest, setChest] = useState('');
  const [biceps, setBiceps] = useState('');

  useEffect(() => {
    if (user?.userId) loadProgress();
  }, [user]);

  const loadProgress = async () => {
    setLoading(true);
    try {
      const res = await progressApi.getProgress(user.userId);
      const items = res.items || res.progress || [];
      items.sort((a, b) => new Date(b.date || b.DataType) - new Date(a.date || a.DataType));
      setEntries(items);
    } catch (err) {
      console.error("Progress fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProgress = async (e) => {
    e.preventDefault();
    if (!weight) return;

    try {
      const newEntry = {
        date,
        weight: Number(weight),
        waist: waist ? Number(waist) : null,
        chest: chest ? Number(chest) : null,
        biceps: biceps ? Number(biceps) : null,
      };

      await progressApi.addProgressEntry(user.userId, newEntry);
      setWeight('');
      setWaist('');
      setChest('');
      setBiceps('');
      loadProgress();
    } catch (err) {
      alert("אירעה שגיאה בשמירת התיעוד.");
    }
  };

  const handleDeleteProgress = async (entryDate) => {
    try {
      await progressApi.deleteProgressEntry(user.userId, entryDate);
      loadProgress();
    } catch (err) {
      console.error("Delete progress error:", err);
    }
  };

  const latestWeight = entries[0]?.weight || '--';
  const startWeight = entries[entries.length - 1]?.weight || '--';

  return (
    <main className="hero" style={{ paddingTop: '110px', paddingBottom: '60px', minHeight: '100vh' }}>
      <div className="container hero-content" style={{ width: '100%', maxWidth: '1000px' }}>
        
        {/* Title */}
        <h1 className="hero-title" style={{ marginBottom: '10px' }}>
          <span className="hero-title-main">מעקב התקדמות</span>
          <span className="gradient-text">משקל והיקפים</span>
        </h1>
        <p className="hero-subtitle" style={{ opacity: 1, animation: 'none', marginBottom: '35px' }}>
          עקוב אחר השינוי במשקל הגוף ובהיקפים לאורך זמן!
        </p>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>משקל עדכני</span>
            <h3 style={{ fontSize: '2rem', color: '#22d3ee', marginTop: '5px' }}>{latestWeight} ק"ג</h3>
          </div>

          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>משקל התחלתי</span>
            <h3 style={{ fontSize: '2rem', color: '#f8fafc', marginTop: '5px' }}>{startWeight} ק"ג</h3>
          </div>

          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <span style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>סה"כ תיעודים</span>
            <h3 style={{ fontSize: '2rem', color: '#34d399', marginTop: '5px' }}>{entries.length}</h3>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '25px' }}>
          
          {/* Add Entry Form */}
          <div className="dashboard-card" style={{ height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '20px' }}>➕ הוסף שקילה / היקף</h3>

            <form onSubmit={handleAddProgress}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">תאריך</label>
                <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} required />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">משקל (ק"ג)*</label>
                <input type="number" step="0.1" className="form-input" placeholder="75.5" value={weight} onChange={e => setWeight(e.target.value)} required />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">היקף מותניים (ס"מ)</label>
                <input type="number" step="0.5" className="form-input" placeholder="82" value={waist} onChange={e => setWaist(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">היקף חזה (ס"מ)</label>
                <input type="number" step="0.5" className="form-input" placeholder="100" value={chest} onChange={e => setChest(e.target.value)} />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label className="form-label">היקף זרוע (ס"מ)</label>
                <input type="number" step="0.5" className="form-input" placeholder="38" value={biceps} onChange={e => setBiceps(e.target.value)} />
              </div>

              <button type="submit" className="btn-cta" style={{ width: '100%', opacity: 1, animation: 'none' }}>
                שמור תיעוד
              </button>
            </form>
          </div>

          {/* Table */}
          <div className="dashboard-card">
            <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '20px' }}>📋 היסטוריית התקדמות</h3>

            {loading ? (
              <p style={{ color: '#cbd5e1' }}>טוען נתונים...</p>
            ) : entries.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>טרם הוספת תיעודים.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#22d3ee' }}>
                      <th style={{ padding: '12px' }}>תאריך</th>
                      <th style={{ padding: '12px' }}>משקל (ק"ג)</th>
                      <th style={{ padding: '12px' }}>מותניים</th>
                      <th style={{ padding: '12px' }}>חזה</th>
                      <th style={{ padding: '12px' }}>זרוע</th>
                      <th style={{ padding: '12px' }}>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((item, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{item.date || item.DataType?.replace('PROGRESS#', '')}</td>
                        <td style={{ padding: '12px' }}>{item.weight} ק"ג</td>
                        <td style={{ padding: '12px' }}>{item.waist ? `${item.waist} ס"מ` : '-'}</td>
                        <td style={{ padding: '12px' }}>{item.chest ? `${item.chest} ס"מ` : '-'}</td>
                        <td style={{ padding: '12px' }}>{item.biceps ? `${item.biceps} ס"מ` : '-'}</td>
                        <td style={{ padding: '12px' }}>
                          <button 
                            onClick={() => handleDeleteProgress(item.date || item.DataType?.replace('PROGRESS#', ''))}
                            style={{ background: 'rgba(244,63,94,0.2)', color: '#f43f5e', border: '1px solid #f43f5e', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
                          >
                            מחק
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

      </div>
    </main>
  );
};

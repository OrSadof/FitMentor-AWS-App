import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fitmentorApi } from '../api/fitmentorApi';

export function TrainingLogPage() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bodyWeightKg, setBodyWeightKg] = useState(75);
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState([
    { name: 'לחיצת חזה כנגד מוט', category: 'chest', sets: [{ weight: 60, reps: 10 }, { weight: 70, reps: 8 }] }
  ]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (user?.email && date) {
      loadLogForDate(date);
    }
  }, [user, date]);

  const loadLogForDate = async (selectedDate) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fitmentorApi.getWorkoutLog(user.email, selectedDate);
      if (res?.log) {
        if (res.log.bodyWeightKg) setBodyWeightKg(res.log.bodyWeightKg);
        if (res.log.notes) setNotes(res.log.notes);
        if (Array.isArray(res.log.exercises)) setExercises(res.log.exercises);
      }
    } catch (err) {
      console.error('Error loading workout log:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddExercise = () => {
    setExercises(prev => [...prev, { name: '', category: 'chest', sets: [{ weight: 0, reps: 0 }] }]);
  };

  const handleAddSet = (exerciseIdx) => {
    setExercises(prev => {
      const updated = [...prev];
      updated[exerciseIdx].sets.push({ weight: 0, reps: 0 });
      return updated;
    });
  };

  const handleSetChange = (exerciseIdx, setIdx, field, val) => {
    setExercises(prev => {
      const updated = [...prev];
      updated[exerciseIdx].sets[setIdx][field] = Number(val);
      return updated;
    });
  };

  const handleSaveLog = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      await fitmentorApi.saveWorkoutLog(user.email, date, {
        bodyWeightKg,
        notes,
        exercises
      });
      setMsg('לוג האימון נשמר בהצלחה ב-DynamoDB!');
    } catch (err) {
      alert('שגיאה בשמירת לוג האימון: ' + err.message);
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
              🏋️ יומן אימונים ותיעוד עומסים
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              תעד את התרגילים, המשקלים והחזרות שביצעת בכל אימון.
            </p>
          </div>

          <div style={{ width: '220px' }}>
            <label className="form-label" style={{ textAlign: 'right' }}>בחר תאריך אימון</label>
            <input
              className="form-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ background: 'rgba(52, 211, 153, 0.15)', border: '1px solid var(--accent-green)', color: 'var(--accent-green)', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
          {msg}
        </div>
      )}

      <form onSubmit={handleSaveLog}>
        <div className="dashboard-card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">משקל גוף (ק"ג)</label>
              <input className="form-input" type="number" step="0.1" value={bodyWeightKg} onChange={e => setBodyWeightKg(Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">הערות כלליות לאימון</label>
              <input className="form-input" type="text" placeholder="אנרגיה טובה, עליה במשקל בלחיצת חזה ב-2.5 ק''ג" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Exercises List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
          {exercises.map((ex, exIdx) => (
            <div key={exIdx} className="dashboard-card" style={{ borderRight: '4px solid var(--accent-cyan)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="שם התרגיל (למשל: לחיצת חזה בשיפוע חיובי)"
                    value={ex.name}
                    onChange={e => {
                      const val = e.target.value;
                      setExercises(prev => {
                        const copy = [...prev];
                        copy[exIdx].name = val;
                        return copy;
                      });
                    }}
                    style={{ fontWeight: 700, maxWidth: '320px' }}
                  />
                  <select
                    className="form-select"
                    value={ex.category || 'chest'}
                    onChange={e => {
                      const val = e.target.value;
                      setExercises(prev => {
                        const copy = [...prev];
                        copy[exIdx].category = val;
                        return copy;
                      });
                    }}
                    style={{ maxWidth: '140px' }}
                  >
                    <option value="chest">חזה</option>
                    <option value="back">גב</option>
                    <option value="legs">רגליים</option>
                    <option value="shoulders">כתפיים</option>
                    <option value="arms">זרועות</option>
                    <option value="core">בטן</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setExercises(prev => prev.filter((_, i) => i !== exIdx))}
                  style={{ background: 'none', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer' }}
                >
                  מחק תרגיל
                </button>
              </div>

              {/* Sets */}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                {ex.sets.map((s, sIdx) => (
                  <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-muted)', width: '60px' }}>סט {sIdx + 1}:</span>
                    <input
                      className="form-input"
                      type="number"
                      placeholder="משקל (ק''ג)"
                      value={s.weight}
                      onChange={e => handleSetChange(exIdx, sIdx, 'weight', e.target.value)}
                      style={{ maxWidth: '140px' }}
                    />
                    <span>ק"ג ×</span>
                    <input
                      className="form-input"
                      type="number"
                      placeholder="חזרות"
                      value={s.reps}
                      onChange={e => handleSetChange(exIdx, sIdx, 'reps', e.target.value)}
                      style={{ maxWidth: '140px' }}
                    />
                    <span>חזרות</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => handleAddSet(exIdx)}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-color)', color: 'var(--text-main)', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                + הוסף סט
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button type="button" onClick={handleAddExercise} style={{ background: 'rgba(34, 211, 238, 0.1)', border: '1px solid var(--accent-cyan)', color: 'var(--accent-cyan)', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>
            + הוסף תרגיל נוסף
          </button>
          <button type="submit" className="btn-register-action" disabled={loading} style={{ marginTop: 0, width: 'auto', padding: '0 32px' }}>
            {loading ? 'שומר ב-DynamoDB...' : 'שמור לוג אימון'}
          </button>
        </div>
      </form>
    </div>
  );
}

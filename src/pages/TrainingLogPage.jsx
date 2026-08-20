import React, { useCallback, useState, useEffect } from 'react';
import { fitmentorApi } from '../api/fitmentorApi';

/* ─── Vector SVG Icons ─── */
const SvgCheckSuccess = ({ size = 84 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <circle cx="50" cy="50" r="46" fill="url(#successGradBg)" opacity="0.18" />
    <circle cx="50" cy="50" r="42" stroke="url(#successGradBorder)" strokeWidth="4" />
    <path d="M30 52L44 66L70 36" stroke="url(#successGradCheck)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    <defs>
      <linearGradient id="successGradBg" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#22d3ee" />
      </linearGradient>
      <linearGradient id="successGradBorder" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#22d3ee" />
      </linearGradient>
      <linearGradient id="successGradCheck" x1="0" y1="0" x2="100" y2="100">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
  </svg>
);

const SvgCloudSync = ({ size = 64 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" stroke="url(#cloudGrad)" />
    <path d="M12 13v4m0-4l-2 2m2-2l2 2" stroke="url(#cloudGrad2)" />
    <defs>
      <linearGradient id="cloudGrad" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#22d3ee" />
        <stop offset="100%" stopColor="#a855f7" />
      </linearGradient>
      <linearGradient id="cloudGrad2" x1="0" y1="0" x2="24" y2="24">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#22d3ee" />
      </linearGradient>
    </defs>
  </svg>
);

const SvgGraphTrend = ({ size = 22, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const SvgWorkoutLog = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M9 12h6" />
    <path d="M9 16h6" />
  </svg>
);

const SvgDumbbell = ({ size = 28, color = "#22d3ee" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 6.5h11M6.5 17.5h11M3 9.5v5M21 9.5v5M4.5 8v8M19.5 8v8M9.5 4.5v15M14.5 4.5v15" />
  </svg>
);

const SvgLightning = ({ size = 28, color = "#facc15" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const SvgCounter = ({ size = 28, color = "#a855f7" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M9 12h6M12 9v6" />
  </svg>
);

const PREDEFINED_EXERCISES = [
  "לחיצת חזה כנגד מוט (Bench Press)",
  "לחיצת חזה כנגד משקוליות (Dumbbell Bench Press)",
  "לחיצת חזה בשיפוע חיובי (Incline Bench Press)",
  "סקוואט כנגד מוט (Barbell Squat)",
  "סקוואט גביע (Goblet Squat)",
  "דדליפט קלאסי (Classic Deadlift)",
  "דדליפט רומני (Romanian Deadlift)",
  "מתח (Pull-ups)",
  "חתירה כנגד מוט (Barbell Row)",
  "חתירה כנגד משקולת יד (Dumbbell Row)",
  "פולי עליון (Lat Pulldown)",
  "לחיצת כתפיים כנגד מוט (Overhead Press)",
  "לחיצת כתפיים כנגד משקוליות (Dumbbell Shoulder Press)",
  "הרחקת זרועות לצדדים (Lateral Raises)",
  "כפילת מרפקים כנגד מוט (Barbell Curls)",
  "כפילת מרפקים כנגד משקוליות (Dumbbell Curls)",
  "פשיטת מרפקים כנגד פולי (Tricep Pushdown)",
  "מקבילים (Dips)",
  "מכרעים / לאנצ'ים (Lunges)",
  "פשיטת ברכיים במכונה (Leg Extension)",
  "כפילת ברכיים במכונה (Leg Curl)",
  "הרמת עקבים בעמידה (Calf Raises)",
  "כפיפות בטן (Crunches)",
  "פלאנק (Plank)"
];

function formatLocalYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function TrainingLogPage({ user, onNavigate }) {
  const effectiveEmail = user?.email || '';
  const [date, setDate] = useState(() => formatLocalYmd());
  const [bodyWeightKg, setBodyWeightKg] = useState('');
  const [notes, setNotes] = useState('');
  const [exercises, setExercises] = useState([
    { name: '', sets: [{ weight: '', reps: '', notes: '' }] }
  ]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [saveModal, setSaveModal] = useState({
    isOpen: false,
    status: 'idle', // 'loading' | 'success' | 'error'
    title: '',
    subtitle: '',
    error: null
  });

  const loadLogForDate = useCallback(async (selectedDate) => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fitmentorApi.getWorkoutLog(effectiveEmail, selectedDate);
      const foundLog = res?.log;

      if (foundLog) {
        setBodyWeightKg(foundLog.bodyWeightKg ?? '');
        setNotes(foundLog.notes || '');
        if (Array.isArray(foundLog.exercises) && foundLog.exercises.length > 0) {
          setExercises(foundLog.exercises);
        } else {
          setExercises([{ name: '', sets: [{ weight: '', reps: '', notes: '' }] }]);
        }
      } else {
        // Reset state for dates without existing logs
        setBodyWeightKg('');
        setNotes('');
        setExercises([{ name: '', sets: [{ weight: '', reps: '', notes: '' }] }]);
      }
    } catch (err) {
      console.error('Error loading workout log:', err);
      setMsg({ type: 'error', text: err?.message || 'טעינת האימון מ-AWS נכשלה' });
      setBodyWeightKg('');
      setNotes('');
      setExercises([{ name: '', sets: [{ weight: '', reps: '', notes: '' }] }]);
    } finally {
      setLoading(false);
    }
  }, [effectiveEmail]);

  useEffect(() => {
    if (effectiveEmail && date) {
      loadLogForDate(date);
    }
  }, [date, effectiveEmail, loadLogForDate]);

  const handleAddExercise = () => {
    setExercises(prev => [...prev, { name: '', sets: [{ weight: '', reps: '', notes: '' }] }]);
  };

  const handleRemoveExercise = (index) => {
    setExercises(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddSet = (exerciseIdx) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exerciseIdx
          ? { ...ex, sets: [...ex.sets, { weight: '', reps: '', notes: '' }] }
          : ex
      )
    );
  };

  const handleRemoveSet = (exerciseIdx, setIdx) => {
    setExercises(prev =>
      prev.map((ex, i) =>
        i === exerciseIdx
          ? { ...ex, sets: ex.sets.filter((_, sI) => sI !== setIdx) }
          : ex
      )
    );
  };

  const handleSetChange = (exerciseIdx, setIdx, field, val) => {
    setExercises(prev =>
      prev.map((ex, i) => {
        if (i !== exerciseIdx) return ex;
        const updatedSets = ex.sets.map((s, sI) => {
          if (sI !== setIdx) return s;
          return { ...s, [field]: val };
        });
        return { ...ex, sets: updatedSets };
      })
    );
  };

  const handleSaveLog = async (e) => {
    e.preventDefault();
    const todayStr = formatLocalYmd();
    if (date > todayStr) {
      setSaveModal({
        isOpen: true,
        status: 'error',
        title: 'שגיאה בתאריך האימון',
        subtitle: 'לא ניתן לתעד אימון עבור תאריך עתידי ❌',
        error: 'אנא בחר את תאריך היום או תאריך מהעבר בלבד'
      });
      return;
    }

    setLoading(true);
    setMsg(null);

    setSaveModal({
      isOpen: true,
      status: 'loading',
      title: 'שומר את הביצועים שלך...',
      subtitle: 'מעדכן את הענן האישי שלך ומסנכרן את נתוני ה-AI 🧠',
      error: null
    });

    const payloadLog = {
      bodyWeightKg,
      notes,
      exercises
    };

    try {
      await fitmentorApi.saveWorkoutLog(effectiveEmail, date, payloadLog);

      setTimeout(() => {
        setSaveModal({
          isOpen: true,
          status: 'success',
          title: 'האימון נרשם בהצלחה! 🎉',
          subtitle: 'כל הביצועים והתרגילים עודכנו בפרופיל האישי ובדף המעקב 🚀',
          error: null
        });
      }, 700);

    } catch (err) {
      console.error('Error saving workout log:', err);

      setSaveModal({
        isOpen: true,
        status: 'error',
        title: 'שמירת האימון נכשלה',
        subtitle: 'הנתונים לא נשמרו. נסה שוב כשהחיבור ל-AWS זמין.',
        error: err?.message || 'שגיאה בשמירה לענן'
      });
    } finally {
      setLoading(false);
    }
  };

  // Live Statistics
  const totalExercises = exercises.length;
  const totalSets = exercises.reduce((acc, ex) => acc + (ex.sets ? ex.sets.length : 0), 0);
  const totalVolume = exercises.reduce((acc, ex) => {
    return acc + (ex.sets ? ex.sets.reduce((sAcc, s) => sAcc + (Number(s.weight || 0) * Number(s.reps || 0)), 0) : 0);
  }, 0);

  return (
    <main className="training-log-page">
      <div className="tl-container">
        
        {/* Header */}
        <header className="tl-header">
          <div className="tl-title-row">
            <div className="tl-title-icon">
              <SvgWorkoutLog size={32} color="#22d3ee" />
            </div>
            <h1 className="tl-title">תיעוד אימון חדש</h1>
          </div>
          <p className="tl-subtitle">
            תעד את הביצועים שלך בזמן אמת כדי שה-AI ינתח וישפר את התוכנית שלך בהתאם.
          </p>
        </header>

        {/* Live Workout Stats Bar */}
        <div className="tl-stats-bar">
          <div className="tl-stat-card">
            <div className="tl-stat-icon">
              <SvgDumbbell size={28} color="#22d3ee" />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">תרגילים באימון</span>
              <span className="tl-stat-value">{totalExercises}</span>
            </div>
          </div>

          <div className="tl-stat-card">
            <div className="tl-stat-icon">
              <SvgCounter size={28} color="#a855f7" />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">סה"כ סטים</span>
              <span className="tl-stat-value">{totalSets}</span>
            </div>
          </div>

          <div className="tl-stat-card">
            <div className="tl-stat-icon">
              <SvgLightning size={28} color="#facc15" />
            </div>
            <div className="tl-stat-info">
              <span className="tl-stat-label">נפח עבודה משוער</span>
              <span className="tl-stat-value">{totalVolume.toLocaleString()} ק"ג</span>
            </div>
          </div>
        </div>

        {/* Date Selection Box */}
        <div className="tl-date-picker-card">
          <div className="tl-date-label">
            <span>📅</span>
            <span>תאריך האימון:</span>
          </div>
          <input
            type="date"
            id="workoutDate"
            className="tl-date-input"
            value={date}
            max={formatLocalYmd()}
            onChange={e => {
              const selected = e.target.value;
              const today = formatLocalYmd();
              if (selected > today) {
                alert('לא ניתן לבחור תאריך עתידי לתיעוד אימון');
                setDate(today);
              } else {
                setDate(selected);
              }
            }}
            required
          />
        </div>

        {/* Status Message */}
        {msg && (
          <div style={{
            background: 'rgba(52, 211, 153, 0.15)',
            border: '1px solid var(--accent-green)',
            color: 'var(--accent-green)',
            padding: '14px 20px',
            borderRadius: '14px',
            marginBottom: '25px',
            textAlign: 'right',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span>✨</span> {msg}
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSaveLog}>
          
          {/* Exercises List (scrollable when multiple exercises) */}
          <div className={`tl-exercises-list${exercises.length >= 2 ? ' tl-exercises-list--scroll' : ''}`}>
            {exercises.map((ex, exIdx) => (
              <div key={exIdx} className="tl-exercise-card">
                
                {/* Exercise Card Header */}
                <div className="tl-exercise-header">
                  <div className="tl-exercise-title-group">
                    <span className="tl-exercise-badge">{exIdx + 1}</span>
                    <input
                      type="text"
                      className="tl-exercise-name-input"
                      placeholder="בחר תרגיל מהרשימה או הקלד תרגיל מותאם..."
                      list="exercises-suggestions-list"
                      value={ex.name}
                      onChange={e => {
                        const val = e.target.value;
                        setExercises(prev => {
                          const copy = [...prev];
                          copy[exIdx].name = val;
                          return copy;
                        });
                      }}
                      required
                    />
                    <datalist id="exercises-suggestions-list">
                      {PREDEFINED_EXERCISES.map((item, idx) => (
                        <option key={idx} value={item} />
                      ))}
                    </datalist>
                  </div>
                  {exercises.length > 1 && (
                    <button
                      type="button"
                      className="tl-btn-delete-exercise"
                      onClick={() => handleRemoveExercise(exIdx)}
                      title="מחק תרגיל"
                    >
                      🗑️
                    </button>
                  )}
                </div>

                {/* Sets Table (scrollable when 4+ sets) */}
                <div className={`tl-sets-table${ex.sets.length > 3 ? ' tl-sets-table--scroll' : ''}`}>
                  <div className="tl-sets-header">
                    <span>סט</span>
                    <span>משקל (ק"ג)</span>
                    <span>חזרות</span>
                    <span>הערות</span>
                    <span></span>
                  </div>

                  {ex.sets.map((s, sIdx) => (
                    <div key={sIdx} className="tl-set-row">
                      <span className="tl-set-num">#{sIdx + 1}</span>
                      
                      <input
                        type="number"
                        className="tl-input"
                        placeholder='ק"ג'
                        step="0.5"
                        min="0"
                        value={s.weight}
                        onChange={e => handleSetChange(exIdx, sIdx, 'weight', e.target.value)}
                      />
                      
                      <input
                        type="number"
                        className="tl-input"
                        placeholder="חזרות"
                        min="0"
                        value={s.reps}
                        onChange={e => handleSetChange(exIdx, sIdx, 'reps', e.target.value)}
                      />
                      
                      <input
                        type="text"
                        className="tl-input"
                        placeholder="הערה לסט..."
                        value={s.notes || ''}
                        onChange={e => handleSetChange(exIdx, sIdx, 'notes', e.target.value)}
                      />

                      <button
                        type="button"
                        className="tl-btn-remove-set"
                        onClick={() => handleRemoveSet(exIdx, sIdx)}
                        title="מחק סט"
                        disabled={ex.sets.length <= 1}
                        style={{ opacity: ex.sets.length <= 1 ? 0.3 : 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Set Button */}
                <button
                  type="button"
                  className="tl-btn-add-set"
                  onClick={() => handleAddSet(exIdx)}
                >
                  <span>+</span> הוסף סט
                </button>
              </div>
            ))}
          </div>

          {/* Add Exercise Button */}
          <div className="tl-add-exercise-btn-wrapper">
            <button type="button" onClick={handleAddExercise} className="tl-btn-add-exercise">
              <span>➕</span> הוסף תרגיל נוסף
            </button>
          </div>

          {/* Workout Summary (Bodyweight & Notes) */}
          <div className="tl-summary-card">
            <div className="tl-summary-grid">
              
              <div className="tl-field-group">
                <label className="tl-field-label" htmlFor="bodyWeightKg">
                  <span>⚖️</span> משקל גוף (ק"ג):
                </label>
                <input
                  type="number"
                  id="bodyWeightKg"
                  className="tl-input"
                  step="0.1"
                  min="20"
                  max="400"
                  placeholder="לדוגמה: 75"
                  value={bodyWeightKg}
                  onChange={e => setBodyWeightKg(e.target.value)}
                />
              </div>

              <div className="tl-field-group">
                <label className="tl-field-label" htmlFor="workoutNotes">
                  <span>📝</span> הערות כלליות לאימון:
                </label>
                <textarea
                  id="workoutNotes"
                  className="tl-textarea"
                  rows="3"
                  placeholder="כתוב כאן תרשומת כללית על האימון... (תחושת אנרגיה, עייפות, כאבים, או דגשים)."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>

            </div>
          </div>

          {/* Save Button */}
          <button type="submit" className="tl-btn-save" disabled={loading}>
            {loading ? 'שומר לוג אימון...' : 'שמור לוג אימון 💾'}
          </button>

        </form>
      </div>

      {/* ===== NON-DISMISSIBLE SAVE POP-UP MODAL ===== */}
      {saveModal.isOpen && (
        <div
          className="modal show"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(10px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="modal-content confirmation-card"
            style={{
              maxWidth: '460px',
              width: '100%',
              textAlign: 'center',
              padding: '35px 25px',
              background: 'rgba(30, 41, 59, 0.95)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '24px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Loading State */}
            {saveModal.status === 'loading' && (
              <div style={{ padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                  <SvgCloudSync size={70} />
                </div>
                <h2 className="modal-title" style={{ fontSize: '1.6rem', marginBottom: '10px' }}>
                  {saveModal.title}
                </h2>
                <p className="modal-subtitle" style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '25px' }}>
                  {saveModal.subtitle}
                </p>
                <div className="registering-spinner" aria-hidden="true">
                  <div className="register-status is-loading" style={{ width: '48px', height: '48px' }}></div>
                </div>
              </div>
            )}

            {/* Success State */}
            {saveModal.status === 'success' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
                  <SvgCheckSuccess size={90} />
                </div>

                <h2 className="confirmation-title" style={{ fontSize: '1.6rem', marginBottom: '10px' }}>
                  {saveModal.title}
                </h2>
                <p className="confirmation-subtitle" style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '25px' }}>
                  {saveModal.subtitle}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {onNavigate && (
                    <button
                      type="button"
                      className="btn-register-action"
                      style={{
                        padding: '14px',
                        fontSize: '1rem',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                        border: 'none',
                        borderRadius: '14px',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        boxShadow: '0 4px 20px rgba(6, 182, 212, 0.4)'
                      }}
                      onClick={() => {
                        setSaveModal({ isOpen: false, status: 'idle', title: '', subtitle: '', error: null });
                        onNavigate('progress');
                      }}
                    >
                      <span>עבור לדף מעקב התקדמות</span>
                      <SvgGraphTrend size={22} color="#fff" />
                    </button>
                  )}

                  <button
                    type="button"
                    style={{
                      padding: '12px',
                      fontSize: '0.95rem',
                      fontWeight: '600',
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '14px',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    onClick={() => setSaveModal({ isOpen: false, status: 'idle', title: '', subtitle: '', error: null })}
                  >
                    <span>השאר בלוג האימונים</span>
                    <SvgWorkoutLog size={20} color="var(--text-muted)" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

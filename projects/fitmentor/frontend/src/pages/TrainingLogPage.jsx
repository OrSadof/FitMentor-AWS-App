import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { trainingApi } from '../services/api';

export const TrainingLogPage = () => {
  const { user } = useAuth();

  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [workoutName, setWorkoutName] = useState('');
  const [duration, setDuration] = useState('45');
  const [exerciseName, setExerciseName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [weight, setWeight] = useState('60');

  useEffect(() => {
    if (user?.userId) loadWorkouts();
  }, [user]);

  const loadWorkouts = async () => {
    setLoading(true);
    try {
      const res = await trainingApi.getWorkoutLogs(user.userId);
      setWorkouts(res.items || res.logs || []);
    } catch (err) {
      console.error("Failed loading workouts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWorkout = async (e) => {
    e.preventDefault();
    if (!workoutName || !exerciseName) return;

    try {
      const newWorkout = {
        workoutId: `WORKOUT#${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        name: workoutName,
        durationMinutes: Number(duration),
        exercises: [
          {
            name: exerciseName,
            sets: Number(sets),
            reps: Number(reps),
            weightKg: Number(weight)
          }
        ]
      };

      await trainingApi.addWorkoutLog(user.userId, newWorkout);
      setWorkoutName('');
      setExerciseName('');
      loadWorkouts();
    } catch (err) {
      alert("אירעה שגיאה ברישום האימון.");
    }
  };

  const handleDeleteWorkout = async (workoutId) => {
    try {
      await trainingApi.deleteWorkoutLog(user.userId, workoutId);
      loadWorkouts();
    } catch (err) {
      console.error("Delete workout error:", err);
    }
  };

  return (
    <main className="hero" style={{ paddingTop: '110px', paddingBottom: '60px', minHeight: '100vh' }}>
      <div className="container hero-content" style={{ width: '100%', maxWidth: '1000px' }}>
        
        <h1 className="hero-title" style={{ marginBottom: '10px' }}>
          <span className="hero-title-main">לוג אימונים</span>
          <span className="gradient-text">תיעוד ביצועים</span>
        </h1>
        <p className="hero-subtitle" style={{ opacity: 1, animation: 'none', marginBottom: '35px' }}>
          תעד את אימוני השריר, הסטים, החזרות והמשקלים שהורמת!
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '25px' }}>
          
          {/* Form */}
          <div className="dashboard-card" style={{ height: 'fit-content' }}>
            <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '20px' }}>📝 תיעוד אימון חדש</h3>

            <form onSubmit={handleAddWorkout}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">שם האימון</label>
                <input type="text" className="form-input" placeholder="אימון חזה וזרועות" value={workoutName} onChange={e => setWorkoutName(e.target.value)} required />
              </div>

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">משך אימון (דקות)</label>
                <input type="number" className="form-input" value={duration} onChange={e => setDuration(e.target.value)} required />
              </div>

              <hr style={{ borderColor: '#334155', margin: '15px 0' }} />

              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label className="form-label">תרגיל מרכזי</label>
                <input type="text" className="form-input" placeholder="לחיצת חזה במוט" value={exerciseName} onChange={e => setExerciseName(e.target.value)} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                <div>
                  <label className="form-label">סטים</label>
                  <input type="number" className="form-input" value={sets} onChange={e => setSets(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">חזרות</label>
                  <input type="number" className="form-input" value={reps} onChange={e => setReps(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">משקל (ק"ג)</label>
                  <input type="number" className="form-input" value={weight} onChange={e => setWeight(e.target.value)} required />
                </div>
              </div>

              <button type="submit" className="btn-cta" style={{ width: '100%', opacity: 1, animation: 'none' }}>
                שמור אימון
              </button>
            </form>
          </div>

          {/* History */}
          <div className="dashboard-card">
            <h3 style={{ fontSize: '1.2rem', color: 'white', marginBottom: '20px' }}>🏋️ אימונים שמורים</h3>

            {loading ? (
              <p style={{ color: '#cbd5e1' }}>טוען נתונים מסד הנתונים AWS...</p>
            ) : workouts.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px' }}>טרם תועדו אימונים.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {workouts.map((w, idx) => (
                  <div key={idx} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div>
                        <h4 style={{ color: '#22d3ee', fontSize: '1.1rem' }}>{w.name || w.workoutName || 'אימון כושר'}</h4>
                        <span style={{ color: '#cbd5e1', fontSize: '0.85rem' }}>{w.date || 'היום'} | {w.durationMinutes || 45} דקות</span>
                      </div>
                      <button 
                        onClick={() => handleDeleteWorkout(w.workoutId || w.DataType)}
                        style={{ background: 'rgba(244,63,94,0.2)', color: '#f43f5e', border: '1px solid #f43f5e', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        מחק
                      </button>
                    </div>

                    {(w.exercises || []).map((ex, exIdx) => (
                      <div key={exIdx} style={{ background: '#1e293b', padding: '8px 12px', borderRadius: '6px', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>{ex.name}</strong></span>
                        <span style={{ color: '#34d399' }}>{ex.sets} סטים × {ex.reps} חזרות ({ex.weightKg} ק"ג)</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </main>
  );
};

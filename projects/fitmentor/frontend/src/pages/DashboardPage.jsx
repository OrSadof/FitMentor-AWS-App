import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardApi } from '../services/api';

export const DashboardPage = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [viewState, setViewState] = useState('noPlan'); // 'noPlan' | 'builder' | 'planView'

  // Plan Builder Form
  const [age, setAge] = useState('25');
  const [gender, setGender] = useState('male');
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('175');
  const [fitnessLevel, setFitnessLevel] = useState('beginner');
  const [goal, setGoal] = useState('חיטוב וירידה במשקל');
  const [days, setDays] = useState('3');
  const [equipment, setEquipment] = useState('gym');

  // Plan Data
  const [currentPlan, setCurrentPlan] = useState(null);
  const [planHistory, setPlanHistory] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState('');

  // AI Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatSending, setChatSending] = useState(false);

  useEffect(() => {
    if (user?.userId) {
      fetchUserPlan();
    }
  }, [user]);

  const fetchUserPlan = async () => {
    setLoading(true);
    try {
      const res = await dashboardApi.getPlan(user.userId);
      if (res?.item || res?.planHtml || res?.html) {
        setCurrentPlan(res.item || res);
        setViewState('planView');
      } else {
        setViewState('noPlan');
      }
    } catch (err) {
      console.log("No plan found for user:", err);
      setViewState('noPlan');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async () => {
    setGenerating(true);
    setMsg('מייצר תוכנית אימונים מותאמת אישית מול בינה מלאכותית...');
    
    try {
      const payload = {
        age: Number(age),
        gender,
        weight: Number(weight),
        height: Number(height),
        fitnessLevel,
        goal,
        days: Number(days),
        equipment
      };

      const res = await dashboardApi.generatePlan(user.userId, payload);
      setCurrentPlan(res);
      setViewState('planView');
      setMsg('תוכנית האימונים נוצרה בהצלחה!');
    } catch (err) {
      setMsg('אירעה שגיאה ביצירת התוכנית. נסה שוב.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePlan = async () => {
    if (!currentPlan) return;
    try {
      await dashboardApi.savePlan(user.userId, currentPlan);
      setMsg('התוכנית נשמרה בהצלחה במסד הנתונים AWS!');
    } catch (err) {
      setMsg('שגיאה בשמירת התוכנית.');
    }
  };

  const handleDeletePlan = async () => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את תוכנית האימונים?')) return;
    try {
      await dashboardApi.deletePlan(user.userId);
      setCurrentPlan(null);
      setViewState('noPlan');
      setMsg('התוכנית נמחקה.');
    } catch (err) {
      setMsg('שגיאה במחיקת התוכנית.');
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { sender: 'user', text: userText }]);
    setChatSending(true);

    try {
      const res = await dashboardApi.chat(user.userId, { message: userText });
      setChatMessages(prev => [...prev, { sender: 'ai', text: res.reply || res.text || 'מומלץ להתמקד בעומס פרוגרסיבי ולשמור על חלבון מספק.' }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { sender: 'ai', text: 'מצטער, אירעה שגיאה בתקשורת מול המאמן.' }]);
    } finally {
      setChatSending(false);
    }
  };

  return (
    <main className="hero" style={{ paddingTop: '110px', paddingBottom: '60px', minHeight: '100vh' }}>
      <div className="container hero-content" style={{ width: '100%', maxWidth: '1000px' }}>
        
        {/* Title */}
        <h1 className="hero-title" style={{ marginBottom: '10px' }}>
          <span className="hero-title-main">Dashboard</span>
          <span className="gradient-text">תוכנית האימונים והמאמן האישי</span>
        </h1>
        <p className="hero-subtitle" style={{ opacity: 1, animation: 'none', marginBottom: '35px' }}>
          כאן תוכל לראות את תוכנית האימונים הנוכחית שלך ולשוחח עם המאמן האישי 24/7!
        </p>

        {msg && (
          <div style={{ background: 'rgba(34, 211, 238, 0.15)', border: '1px solid #22d3ee', color: '#22d3ee', padding: '12px 18px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
            {msg}
          </div>
        )}

        {/* 1. Loader */}
        {loading && (
          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <div className="register-status is-loading" style={{ margin: '0 auto', width: '50px', height: '50px', borderWidth: '4px' }}></div>
            <h3 style={{ marginTop: '18px', color: '#22d3ee' }}>טוען נתונים...</h3>
            <p style={{ color: '#cbd5e1' }}>בודק אם קיימת תוכנית אימונים עבורך במסד הנתונים AWS.</p>
          </div>
        )}

        {/* 2. No Plan State */}
        {!loading && viewState === 'noPlan' && (
          <div className="dashboard-card" style={{ textAlign: 'center' }}>
            <h2 style={{ color: 'white', marginBottom: '10px' }}>אין לך עדיין תוכנית אימונים</h2>
            <p style={{ color: '#cbd5e1', marginBottom: '20px' }}>
              נראה שלא נמצאה תוכנית עבורך במערכת. בוא נבנה אחת עכשיו.
            </p>
            <button onClick={() => setViewState('builder')} className="btn-cta" style={{ opacity: 1, animation: 'none' }}>
              התחל בבניית תוכנית אימונים
            </button>
          </div>
        )}

        {/* 3. Plan Builder State */}
        {!loading && viewState === 'builder' && (
          <div className="dashboard-card">
            <h2 style={{ marginBottom: '10px', color: 'white' }}>בניית תוכנית אימונים</h2>
            <p style={{ marginBottom: '25px', color: '#cbd5e1', fontSize: '0.95rem' }}>מלא פרטים כדי שה-AI יבנה תוכנית מותאמת.</p>

            <div className="form-row" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                <label className="form-label">גיל</label>
                <input type="number" className="form-input" value={age} onChange={e => setAge(e.target.value)} min="12" max="100" />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                <label className="form-label">מגדר</label>
                <select className="form-select" value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="male">זכר</option>
                  <option value="female">נקבה</option>
                </select>
              </div>
            </div>

            <div className="form-row" style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                <label className="form-label">משקל (ק"ג)</label>
                <input type="number" className="form-input" value={weight} onChange={e => setWeight(e.target.value)} min="30" max="250" />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: '120px' }}>
                <label className="form-label">גובה (ס"מ)</label>
                <input type="number" className="form-input" value={height} onChange={e => setHeight(e.target.value)} min="100" max="250" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">רמת כושר נוכחית</label>
              <select className="form-select" value={fitnessLevel} onChange={e => setFitnessLevel(e.target.value)}>
                <option value="beginner">מתחיל (0-6 חודשים)</option>
                <option value="intermediate">מתקדם (6 חודשים - שנתיים)</option>
                <option value="advanced">מקצועי (מעל שנתיים)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">מה המטרה העיקרית?</label>
              <select className="form-select" value={goal} onChange={e => setGoal(e.target.value)}>
                <option value="חיטוב וירידה במשקל">🔥 חיטוב וירידה במשקל</option>
                <option value="עלייה במסת שריר">💪 עלייה במסת שריר (היפרטרופיה)</option>
                <option value="שיפור כושר כללי">🏃 שיפור כושר כללי וסיבולת</option>
                <option value="אימוני כוח">🏋️ אימוני כוח מירבי (Powerlifting)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">כמה ימים בשבוע אתה פנוי?</label>
              <select className="form-select" value={days} onChange={e => setDays(e.target.value)}>
                <option value="2">פעמיים בשבוע (מינימום)</option>
                <option value="3">3 פעמים בשבוע (מומלץ למתחילים)</option>
                <option value="4">4 פעמים בשבוע (מתקדם)</option>
                <option value="5">5 פעמים בשבוע (אינטנסיבי)</option>
                <option value="6">6 פעמים בשבוע (מקצועי)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">איזה ציוד זמין לך?</label>
              <select className="form-select" value={equipment} onChange={e => setEquipment(e.target.value)}>
                <option value="gym">🏢 מנוי לחדר כושר מלא</option>
                <option value="home_dumbbells">🏠 בית - משקולות יד בלבד</option>
                <option value="bodyweight">🌳 משקל גוף בלבד (פארק/בית)</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
              <button onClick={handleCreatePlan} disabled={generating} className="btn-cta" style={{ opacity: 1, animation: 'none' }}>
                {generating ? 'בונה תוכנית...' : 'צור לי תוכנית 🚀'}
              </button>
              <button onClick={() => setViewState(currentPlan ? 'planView' : 'noPlan')} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#cbd5e1', padding: '12px 22px', borderRadius: '50px', cursor: 'pointer', fontWeight: '700' }}>
                ביטול
              </button>
            </div>
          </div>
        )}

        {/* 4. Plan Display View */}
        {!loading && viewState === 'planView' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            <div className="dashboard-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <h2 style={{ color: 'white', fontSize: '1.4rem' }}>תוכנית האימונים האישית שלך</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setViewState('builder')} className="btn-nav-register" style={{ padding: '8px 16px' }}>
                    🔄 תוכנית חדשה
                  </button>
                  <button onClick={handleSavePlan} className="btn-nav-register" style={{ background: 'rgba(52, 211, 153, 0.2)', color: '#34d399', borderColor: '#34d399', padding: '8px 16px' }}>
                    💾 שמור תוכנית
                  </button>
                  <button onClick={handleDeletePlan} style={{ background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', border: '1px solid #f43f5e', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer' }}>
                    🗑️ מחק
                  </button>
                </div>
              </div>

              {/* Render Plan HTML */}
              <div 
                className="ai-plan-container"
                style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '25px', borderRadius: '12px', border: '1px solid #334155', lineHeight: '1.8' }}
                dangerouslySetInnerHTML={{ 
                  __html: currentPlan?.planHtml || currentPlan?.html || `
                    <div class="ai-plan-result">
                      <h3 style="color:#22d3ee; margin-bottom:15px;">תוכנית אימונים שבועית</h3>
                      <p><strong>אימון A (חזה וכתפיים):</strong></p>
                      <ul>
                        <li>לחיצת חזה כנגד מוט: 4 סטים × 8-10 חזרות</li>
                        <li>לחיצת כתפיים במשקולות: 3 סטים × 10-12 חזרות</li>
                        <li>פרפר בשיפוע חיובי: 3 סטים × 12 חזרות</li>
                      </ul>
                      <p style="margin-top:15px;"><strong>אימון B (גב וזרועות):</strong></p>
                      <ul>
                        <li>מתח / פולי עליון: 4 סטים × 8-10 חזרות</li>
                        <li>חתירה במשקולת יד: 3 סטים × 10 חזרות</li>
                        <li>כפילת מרפקים במוט: 3 סטים × 12 חזרות</li>
                      </ul>
                    </div>
                  ` 
                }}
              />
            </div>

            {/* AI Assistant Chat Box */}
            <div className="dashboard-card">
              <h3 style={{ color: '#34d399', fontSize: '1.3rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                💬 שאל את המאמן האישי (AI Chat)
              </h3>

              <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '15px', minHeight: '160px', maxHeight: '280px', overflowY: 'auto', marginBottom: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chatMessages.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', margin: 'auto' }}>
                    שאל את המאמן כל שאלה לגבי תרגילים, טכניקה או תזונה!
                  </p>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        alignSelf: msg.sender === 'user' ? 'flex-start' : 'flex-end', 
                        maxWidth: '80%', 
                        background: msg.sender === 'user' ? 'rgba(34, 211, 238, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid ' + (msg.sender === 'user' ? '#22d3ee' : '#334155'),
                        padding: '10px 14px', 
                        borderRadius: '12px',
                        fontSize: '0.95rem'
                      }}
                    >
                      <strong>{msg.sender === 'user' ? 'אתה: ' : 'FitMentor AI: '}</strong>
                      {msg.text}
                    </div>
                  ))
                )}
                {chatSending && <div style={{ color: '#22d3ee', fontSize: '0.85rem' }}>המאמן מקליד תשובה...</div>}
              </div>

              <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="כמה חלבון מומלץ לצרוך ביום?" 
                  value={chatInput} 
                  onChange={e => setChatInput(e.target.value)}
                />
                <button type="submit" disabled={chatSending} className="btn-nav-register" style={{ padding: '0 24px', background: '#34d399', color: '#0f172a', fontWeight: 'bold' }}>
                  שלח
                </button>
              </form>
            </div>

          </div>
        )}

      </div>
    </main>
  );
};

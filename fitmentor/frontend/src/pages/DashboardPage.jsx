import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { fitmentorApi } from '../api/fitmentorApi';

export function DashboardPage() {
  const { user } = useAuth();
  const [planHtml, setPlanHtml] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Form parameters
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState('male');
  const [weight, setWeight] = useState(75);
  const [height, setHeight] = useState(178);
  const [goal, setGoal] = useState('בניית מסת שריר (היפרטרופיה)');
  const [days, setDays] = useState(4);
  const [equipment, setEquipment] = useState('חדר כושר מלא');
  const [fitnessLevel, setFitnessLevel] = useState('בינוני');

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (user?.email) {
      loadPlan();
      loadChatHistory();
    }
  }, [user]);

  const loadPlan = async () => {
    setLoadingPlan(true);
    try {
      const res = await fitmentorApi.getPlan(user.email);
      if (res?.plan?.planHtml) {
        setPlanHtml(res.plan.planHtml);
      }
    } catch (err) {
      console.error('Error loading plan:', err);
    } finally {
      setLoadingPlan(false);
    }
  };

  const loadChatHistory = async () => {
    try {
      const res = await fitmentorApi.getChatHistory(user.email);
      if (res?.messages) {
        setChatMessages(res.messages);
      }
    } catch (err) {
      console.error('Error loading chat:', err);
    }
  };

  const handleGeneratePlan = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await fitmentorApi.generatePlan(user.email, {
        age, gender, weight, height, goal, days, equipment, fitnessLevel
      });
      if (res?.plan?.planHtml) {
        setPlanHtml(res.plan.planHtml);
      }
    } catch (err) {
      alert('שגיאה ביצירת תוכנית אימונים: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg, timestamp: Date.now() }]);
    setChatLoading(true);

    try {
      const res = await fitmentorApi.chat(user.email, userMsg, user.userName);
      if (res?.reply) {
        setChatMessages(prev => [...prev, { role: 'ai', text: res.reply, timestamp: Date.now() }]);
      }
      if (res?.updatedPlanHtml) {
        setPlanHtml(res.updatedPlanHtml);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'ai', text: 'שגיאה: ' + err.message, timestamp: Date.now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Macro calculation helper
  const bmr = gender === 'male' 
    ? (10 * weight) + (6.25 * height) - (5 * age) + 5
    : (10 * weight) + (6.25 * height) - (5 * age) - 161;
  const maintenance = Math.round(bmr * 1.55);
  const targetCalories = goal.includes('ירידה') ? maintenance - 400 : maintenance + 300;
  const protein = Math.round(weight * 2.0);
  const fats = Math.round((targetCalories * 0.25) / 9);
  const carbs = Math.round((targetCalories - (protein * 4) - (fats * 9)) / 4);

  return (
    <div className="container" style={{ paddingTop: '100px', paddingBottom: '50px' }}>
      {/* Header Banner */}
      <div className="dashboard-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '4px' }}>
              שלום, {user.userName || user.email}! 👋
            </h1>
            <p style={{ color: 'var(--text-muted)' }}>
              הנה מרכז בקרה ותוכנית האימונים האישית שלך.
            </p>
          </div>
          <span className="text-cyan fw-bold" style={{ border: '1px solid var(--accent-cyan)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem' }}>
            Pay-Per-Request DynamoDB
          </span>
        </div>
      </div>

      {/* Macro Breakdown Cards */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: '24px' }}>
        <div className="dashboard-card" style={{ borderTop: '4px solid var(--accent-cyan)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>קלוריות יומית</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-cyan)' }}>{targetCalories} <span style={{ fontSize: '0.9rem' }}>קלוריות</span></div>
        </div>
        <div className="dashboard-card" style={{ borderTop: '4px solid var(--accent-green)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>חלבון</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-green)' }}>{protein} <span style={{ fontSize: '0.9rem' }}>גרם</span></div>
        </div>
        <div className="dashboard-card" style={{ borderTop: '4px solid var(--accent-yellow)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>פחמימות</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-yellow)' }}>{carbs} <span style={{ fontSize: '0.9rem' }}>גרם</span></div>
        </div>
        <div className="dashboard-card" style={{ borderTop: '4px solid var(--accent-red)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>שומנים</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--accent-red)' }}>{fats} <span style={{ fontSize: '0.9rem' }}>גרם</span></div>
        </div>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        {/* Left Column: AI Form & Active Plan */}
        <div>
          <div className="dashboard-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', color: 'var(--accent-cyan)' }}>
              ⚡ מחולל תוכנית אימונים AI
            </h2>

            <form onSubmit={handleGeneratePlan}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">גיל</label>
                  <input className="form-input" type="number" value={age} onChange={e => setAge(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">מגדר</label>
                  <select className="form-select" value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="male">זכר</option>
                    <option value="female">נקבה</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">משקל (ק"ג)</label>
                  <input className="form-input" type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">גובה (ס"מ)</label>
                  <input className="form-input" type="number" value={height} onChange={e => setHeight(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">ימי אימון בשבוע</label>
                  <input className="form-input" type="number" min="1" max="7" value={days} onChange={e => setDays(Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">רמת כושר</label>
                  <select className="form-select" value={fitnessLevel} onChange={e => setFitnessLevel(e.target.value)}>
                    <option value="מתחיל">מתחיל</option>
                    <option value="בינוני">בינוני</option>
                    <option value="מתקדם">מתקדם</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">מטרה עיקרית</label>
                <input className="form-input" type="text" value={goal} onChange={e => setGoal(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">ציוד זמין</label>
                <input className="form-input" type="text" value={equipment} onChange={e => setEquipment(e.target.value)} />
              </div>

              <button className="btn-register-action" type="submit" disabled={generating}>
                {generating ? 'מייצר תוכנית בעזרת Gemini AI...' : 'צור תוכנית אימונים חדשה'}
              </button>
            </form>
          </div>

          {/* HTML Active Plan */}
          <div className="dashboard-card">
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', color: 'var(--accent-green)' }}>
              📋 תוכנית האימונים הפעילה שלך
            </h2>
            {loadingPlan ? (
              <p className="text-muted">טוען תוכנית מ-DynamoDB...</p>
            ) : planHtml ? (
              <div dangerouslySetInnerHTML={{ __html: planHtml }} />
            ) : (
              <p className="text-muted">עדיין לא יוצרה תוכנית אימונים. מלא את הפרטים בטופס מעלה וצור תוכנית חדשה!</p>
            )}
          </div>
        </div>

        {/* Right Column: AI Chat Assistant */}
        <div className="dashboard-card" style={{ display: 'flex', flexDirection: 'column', height: '780px' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '16px', color: 'var(--accent-green)' }}>
            💬 צ'אט מאמן אישי (FitMentor AI)
          </h2>

          {/* Chat Messages */}
          <div className="chat-messages" style={{ flex: 1 }}>
            {chatMessages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: '40px' }}>
                שאל את המאמן האישי כל שאלה לגבי תרגילים, תזונה או שינוי תוכנית האימונים!
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  <strong style={{ display: 'block', fontSize: '0.8rem', marginBottom: '2px' }}>
                    {msg.role === 'user' ? 'אתה:' : 'FitMentor AI:'}
                  </strong>
                  {msg.text}
                </div>
              ))
            )}
            {chatLoading && (
              <div className="chat-bubble ai" style={{ color: 'var(--text-muted)' }}>
                FitMentor AI חושב...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px' }}>
            <input
              className="form-input"
              type="text"
              placeholder="שאל את המאמן האישי..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
            />
            <button className="btn-register-action" type="submit" disabled={chatLoading} style={{ width: 'auto', padding: '0 20px', marginTop: 0 }}>
              שלח
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fitmentorApi } from '../api/fitmentorApi';

export function LandingPage({ onAuthSuccess, showAuthModalDefault = false }) {
  const { login, register, confirmRegister } = useAuth();
  const [showModal, setShowModal] = useState(showAuthModalDefault);
  const [view, setView] = useState('login'); // 'login', 'register', 'verify', 'forgot', 'reset'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      await login(email, password);
      setShowModal(false);
      onAuthSuccess();
    } catch (error) {
      setErr(error.message || 'התחברות נכשלה');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      await register(email, password, name || 'מתאמן');
      setMsg('קוד אימות נשלח לאימייל שלך. הזן אותו להלן להשלמת ההרשמה.');
      setView('verify');
    } catch (error) {
      setErr(error.message || 'הרשמה נכשלה');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      await confirmRegister(email, code);
      setMsg('האימייל אומת בהצלחה! מתחבר למערכת...');
      await login(email, password);
      setShowModal(false);
      onAuthSuccess();
    } catch (error) {
      setErr(error.message || 'אימות קוד נכשל');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      await fitmentorApi.forgotPassword(email);
      setMsg('קוד איפוס סיסמה נשלח לאימייל שלך.');
      setView('reset');
    } catch (error) {
      setErr(error.message || 'שליחת קוד איפוס נכשלה');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmResetPassword = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      await fitmentorApi.confirmForgotPassword(email, code, newPassword);
      setMsg('הסיסמה עודכנה בהצלחה! כעת תוכל להתחבר.');
      setView('login');
    } catch (error) {
      setErr(error.message || 'עדכון סיסמה נכשל');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Hero Header */}
      <header className="hero">
        <div className="container hero-content">
          <h1 className="hero-title">
            <span className="hero-title-main">מאמן הכושר האישי שלך</span>
            <span className="gradient-text">מונע ע"י בינה מלאכותית</span>
          </h1>
          <p className="hero-subtitle">
            FitMentor מייצר תוכניות אימון מותאמות אישית, עוקב אחר ההתקדמות שלך ועונה על כל שאלה – בדיוק כמו מאמן אנושי, רק חכם יותר וזמין תמיד.
          </p>
          <button className="btn-cta" onClick={() => { setView('register'); setShowModal(true); }}>
            התחל עכשיו בחינם
          </button>
        </div>
      </header>

      {/* Problem & Need Section with Glowing Hover Image */}
      <section id="about" className="section section-about">
        <div className="container">
          <div className="about-grid">
            <div>
              <h2 className="section-title">הבעיה והצורך</h2>
              <p className="about-desc">
                אנשים רבים מתקשים להתמיד בפעילות גופנית משום שהם <span className="text-highlight">לא יודעים מה לעשות</span>, כמה לבצע, ואיך לבנות תוכנית מותאמת להם.
              </p>
              <p className="about-desc-lg">
                הפתרונות הקיימים בשוק מסורבלים או יקרים מדי (מאמן אישי). ישנו פער עצום בין הרצון להתאמן לבין הידע והכלים הזמינים למתאמן הממוצע.
              </p>

              <div className="solution-box">
                <h3 className="solution-title">
                  <span className="icon-yellow" style={{ fontSize: '24px' }}>💡</span>
                  הפתרון של FitMentor
                </h3>
                <p className="solution-desc">
                  מערכת חכמה שמנגישה אימון איכותי לכל אחד. אלגוריתם AI לומד את המשתמש, בונה לו לו"ז, ומלווה אותו יד ביד לתוצאות – נוח, זול ובריא.
                </p>
              </div>
            </div>

            <div className="image-wrapper">
              <img
                src="https://images.unsplash.com/photo-1517836357463-d25dfeac3438?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80"
                alt="Workout App"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="section section-features">
        <div className="container">
          <div className="features-header">
            <h2 className="section-title features-header-title">Features עיקריים</h2>
            <p className="features-header-desc">חמשת עמודי התווך של המערכת שיביאו את המשתמש להצלחה</p>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <div className="icon-box"><span className="feature-emoji">📋</span></div>
              <h3 className="feature-title">1. תוכנית אימון מותאמת אישית</h3>
              <p className="feature-desc">יצירת תוכנית לפי מטרה (חיטוב/כוח), זמן פנוי וציוד זמין.</p>
              <div className="feature-footer">
                <span className="value-label">הערך למשתמש</span>
                <p className="feature-footer-text">חוסך ידע מקצועי ומונע בלבול בהתחלה.</p>
              </div>
            </div>

            <div className="feature-card">
              <div className="icon-box"><span className="feature-emoji">💬</span></div>
              <h3 className="feature-title">2. Chat AI למענה בזמן אמת</h3>
              <p className="feature-desc">שאלות כמו "מה לעשות במקום דדליפט?" נענות מיד.</p>
              <div className="feature-footer">
                <span className="value-label">הערך למשתמש</span>
                <p className="feature-footer-text">יוצר תחושת ביטחון ומאמן צמוד.</p>
              </div>
            </div>

            <div className="feature-card">
              <div className="icon-box"><span className="feature-emoji">✅</span></div>
              <h3 className="feature-title">3. יומן מעקב</h3>
              <p className="feature-desc">תיעוד סטים, חזרות, משקלים וזמני אימון ביומן דיגיטלי.</p>
              <div className="feature-footer">
                <span className="value-label">הערך למשתמש</span>
                <p className="feature-footer-text">משפר התמדה ונותן תחושת הישג מדידה.</p>
              </div>
            </div>

            <div className="feature-card">
              <div className="icon-box"><span className="feature-emoji">📊</span></div>
              <h3 className="feature-title">4. מעקב התקדמות</h3>
              <p className="feature-desc">פאנל עם נתונים וגרפים להמחשת ההתקדמות.</p>
              <div className="feature-footer">
                <span className="value-label">הערך למשתמש</span>
                <p className="feature-footer-text">תחושה של התקדמות שהמתאמן לא נתקע במקום.</p>
              </div>
            </div>

            <div className="feature-card">
              <div className="icon-box"><span className="feature-emoji">📈</span></div>
              <h3 className="feature-title">5. המלצות חכמות לשיפור</h3>
              <p className="feature-desc">הצעות פרואקטיביות: "תעלה 2.5 קילו במשקל" או "הוסף אירובי".</p>
              <div className="feature-footer">
                <span className="value-label">הערך למשתמש</span>
                <p className="feature-footer-text">התקדמות ליניארית ומניעת 'דריכה במקום'.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="main-footer">
        <div className="footer-logo">
          <span className="logo-icon-text" style={{ fontSize: '24px', marginLeft: '5px' }}>💪</span>
          <span>FitMentor Project</span>
        </div>
        <p className="copyright">© כל הזכויות שמורות לצוות הפרויקט</p>
      </footer>

      {/* Auth Modal */}
      {(showModal || showAuthModalDefault) && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setShowModal(false)}>&times;</span>

            {err && <div style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem' }}>{err}</div>}
            {msg && <div style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399', padding: '10px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.9rem' }}>{msg}</div>}

            {view === 'login' && (
              <form onSubmit={handleLogin}>
                <h2 className="modal-title">התחברות</h2>
                <p className="modal-subtitle">ברוכים השבים ל-FitMentor</p>

                <label className="text-right-label">אימייל</label>
                <input type="email" className="modal-input" placeholder="example@email.com" required value={email} onChange={e => setEmail(e.target.value)} />

                <label className="text-right-label">סיסמה</label>
                <input type="password" className="modal-input" placeholder="********" required value={password} onChange={e => setPassword(e.target.value)} />

                <button type="submit" className="btn-register-action" disabled={loading}>
                  {loading ? 'מתחבר...' : 'התחברות'}
                </button>

                <div className="modal-footer">
                  <a href="#" onClick={(e) => { e.preventDefault(); setView('forgot'); }} className="text-cyan link-block">שכחת את הסיסמה?</a>
                  <div style={{ marginTop: '10px' }}>
                    <span className="text-muted">עדיין לא נרשמת? </span>
                    <a href="#" onClick={(e) => { e.preventDefault(); setView('register'); }} className="text-green fw-bold">הירשם כאן</a>
                  </div>
                </div>
              </form>
            )}

            {view === 'register' && (
              <form onSubmit={handleRegister}>
                <h2 className="modal-title-register">הרשמה חדשה</h2>
                <p className="modal-subtitle">הכנס פרטים כדי להתחיל להתאמן</p>

                <label className="text-right-label">שם מלא</label>
                <input type="text" className="modal-input" placeholder="שם מלא" value={name} onChange={e => setName(e.target.value)} required />

                <label className="text-right-label">אימייל</label>
                <input type="email" className="modal-input" placeholder="example@email.com" value={email} onChange={e => setEmail(e.target.value)} required />

                <label className="text-right-label">סיסמה</label>
                <input type="password" className="modal-input" placeholder="לפחות 8 תווים, אות גדולה ומספר" value={password} onChange={e => setPassword(e.target.value)} required />

                <button type="submit" className="btn-register-action" disabled={loading}>
                  {loading ? 'נרשם...' : 'רישום'}
                </button>

                <div className="modal-footer">
                  <span className="text-muted">כבר רשום? </span>
                  <a href="#" onClick={(e) => { e.preventDefault(); setView('login'); }} className="text-cyan fw-bold">התחבר כאן</a>
                </div>
              </form>
            )}

            {view === 'verify' && (
              <form onSubmit={handleVerify}>
                <h2 className="modal-title-register">אימות אימייל</h2>
                <p className="modal-subtitle">הזן את קוד האימות שנשלח ל-{email}</p>

                <label className="text-right-label">קוד אימות</label>
                <input type="text" className="modal-input" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required />

                <button type="submit" className="btn-register-action" disabled={loading}>
                  {loading ? 'מאמת...' : 'אימות קוד'}
                </button>
              </form>
            )}

            {view === 'forgot' && (
              <form onSubmit={handleForgotPassword}>
                <h2 className="modal-title-register">איפוס סיסמה</h2>
                <p className="modal-subtitle">הזן את האימייל שלך ונשלח לך הודעת איפוס</p>

                <label className="text-right-label">אימייל</label>
                <input type="email" className="modal-input" placeholder="example@email.com" value={email} onChange={e => setEmail(e.target.value)} required />

                <button type="submit" className="btn-register-action" disabled={loading}>
                  {loading ? 'שולח...' : 'שלח איפוס סיסמה'}
                </button>

                <div className="modal-footer">
                  <a href="#" onClick={(e) => { e.preventDefault(); setView('login'); }} className="text-muted link-block">חזרה להתחברות</a>
                </div>
              </form>
            )}

            {view === 'reset' && (
              <form onSubmit={handleConfirmResetPassword}>
                <h2 className="modal-title-register">עדכון סיסמה</h2>
                <p className="modal-subtitle">הזן קוד איפוס וסיסמה חדשה</p>

                <label className="text-right-label">קוד איפוס מהאימייל</label>
                <input type="text" className="modal-input" placeholder="123456" value={code} onChange={e => setCode(e.target.value)} required />

                <label className="text-right-label">סיסמה חדשה</label>
                <input type="password" className="modal-input" placeholder="לפחות 8 תווים, אות גדולה ומספר" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />

                <button type="submit" className="btn-register-action" disabled={loading}>
                  {loading ? 'מעדכן...' : 'עדכן סיסמה'}
                </button>

                <div className="modal-footer">
                  <a href="#" onClick={(e) => { e.preventDefault(); setView('login'); }} className="text-muted link-block">חזרה להתחברות</a>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

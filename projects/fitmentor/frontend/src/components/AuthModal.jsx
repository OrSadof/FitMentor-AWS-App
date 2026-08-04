import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export const AuthModal = ({ isOpen, onClose, onSuccess }) => {
  const { login, register, confirmRegister, loading } = useAuth();

  const [view, setView] = useState('login'); // 'login' | 'register' | 'forgot' | 'confirm' | 'registering'
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('מתאמן חדש');
  const [code, setCode] = useState('');
  
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (!email || !password) {
      setErrorMsg('נא להזין אימייל וסיסמה');
      return;
    }

    const res = await login(email, password);
    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.message || 'התחברות נכשלה');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    if (!email || !password) {
      setErrorMsg('נא למלא את כל שדות החובה');
      return;
    }

    setView('registering');
    setStatusMsg('מבצע הרשמה מול AWS Cognito...');

    const res = await register(email, password, name);
    if (res.success) {
      setStatusMsg('ההרשמה הצליחה! הזן קוד אימות או לחץ על הקישור שנשלח במייל');
      setView('confirm');
    } else {
      setErrorMsg(res.message || 'ההרשמה נכשלה');
      setView('register');
    }
  };

  const handleConfirmSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');

    const res = await confirmRegister(email, code);
    if (res.success) {
      setStatusMsg('האימייל אומת בהצלחה! כעת תוכל להתחבר.');
      setView('login');
    } else {
      setErrorMsg(res.message || 'אימות הקוד נכשל');
    }
  };

  return (
    <div id="registerModal" className="modal">
      <div className="modal-content">
        <span className="close-btn" onClick={onClose}>&times;</span>

        {errorMsg && (
          <div style={{ background: 'rgba(244,63,94,0.15)', border: '1px solid #f43f5e', color: '#fca5a5', padding: '10px', borderRadius: '8px', marginBottom: '15px', textAlign: 'center', fontSize: '0.85rem' }}>
            {errorMsg}
          </div>
        )}

        {statusMsg && (
          <div style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid #34d399', color: '#6ee7b7', padding: '10px', borderRadius: '8px', marginBottom: '15px', textAlign: 'center', fontSize: '0.85rem' }}>
            {statusMsg}
          </div>
        )}

        {/* 1. Login View */}
        {view === 'login' && (
          <form id="loginView" onSubmit={handleLoginSubmit}>
            <h2 className="modal-title">התחברות</h2>
            <p className="modal-subtitle">ברוכים השבים ל-FitMentor</p>

            <label className="text-right-label">אימייל</label>
            <input 
              type="email" 
              className="modal-input" 
              placeholder="example@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required 
            />

            <label className="text-right-label">סיסמה</label>
            <input 
              type="password" 
              className="modal-input" 
              placeholder="********" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required 
              minLength={8} 
            />

            <button type="submit" disabled={loading} className="btn-register-action" style={{ cursor: 'pointer' }}>
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

        {/* 2. Register View */}
        {view === 'register' && (
          <form id="registerView" onSubmit={handleRegisterSubmit}>
            <h2 className="modal-title-register">הרשמה חדשה</h2>
            <p className="modal-subtitle">הכנס פרטים כדי להתחיל להתאמן</p>

            <label className="text-right-label">שם מלא</label>
            <input 
              type="text" 
              className="modal-input" 
              placeholder="שם מלא" 
              value={name} 
              onChange={e => setName(e.target.value)}
            />

            <label className="text-right-label">אימייל</label>
            <input 
              type="email" 
              className="modal-input" 
              placeholder="example@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required 
            />

            <label className="text-right-label">סיסמה (8 תווים, אות גדולה ומספר)</label>
            <input 
              type="password" 
              className="modal-input" 
              placeholder="בחר סיסמה" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              required 
              minLength={8} 
            />

            <button type="submit" disabled={loading} className="btn-register-action" style={{ cursor: 'pointer' }}>
              רישום
            </button>

            <div className="modal-footer">
              <span className="text-muted">כבר רשום? </span>
              <a href="#" onClick={(e) => { e.preventDefault(); setView('login'); }} className="text-cyan fw-bold">התחבר כאן</a>
            </div>
          </form>
        )}

        {/* 3. Confirm Code View */}
        {view === 'confirm' && (
          <form id="confirmView" onSubmit={handleConfirmSubmit}>
            <h2 className="modal-title-register">אימות אימייל</h2>
            <p className="modal-subtitle">הזן את קוד האימות שנשלח אל {email}</p>

            <label className="text-right-label">קוד אימות</label>
            <input 
              type="text" 
              className="modal-input" 
              placeholder="123456" 
              value={code} 
              onChange={e => setCode(e.target.value)}
              required 
            />

            <button type="submit" disabled={loading} className="btn-register-action" style={{ cursor: 'pointer' }}>
              אימות קוד
            </button>

            <div className="modal-footer">
              <a href="#" onClick={(e) => { e.preventDefault(); setView('login'); }} className="text-muted link-block">חזרה להתחברות</a>
            </div>
          </form>
        )}

        {/* 4. Forgot Password View */}
        {view === 'forgot' && (
          <div id="forgotPasswordView">
            <h2 className="modal-title-register">איפוס סיסמה</h2>
            <p className="modal-subtitle">הזן את האימייל שלך ונשלח לך קוד איפוס</p>

            <label className="text-right-label">אימייל</label>
            <input 
              type="email" 
              className="modal-input" 
              placeholder="example@email.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required 
            />

            <button 
              type="button" 
              className="btn-register-action"
              onClick={() => { setStatusMsg('קוד איפוס נשלח למייל.'); setView('confirm'); }}
            >
              שלח איפוס סיסמה
            </button>

            <div className="modal-footer">
              <a href="#" onClick={(e) => { e.preventDefault(); setView('login'); }} className="text-muted link-block">חזרה להתחברות</a>
            </div>
          </div>
        )}

        {/* 5. Registering Spinner View */}
        {view === 'registering' && (
          <div id="registeringView" style={{ textAlign: 'center', padding: '20px 0' }}>
            <h2 className="modal-title-register">ההרשמה מתחילה...</h2>
            <div className="registering-spinner" style={{ margin: '20px auto' }}>
              <div className="register-status is-loading" style={{ margin: '0 auto', width: '40px', height: '40px', borderWidth: '4px' }}></div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

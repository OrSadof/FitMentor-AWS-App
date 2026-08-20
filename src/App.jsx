import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import './App.css'
import { fitmentorApi } from './api/fitmentorApi'

const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const TrainingLogPage = lazy(() => import('./pages/TrainingLogPage').then((module) => ({ default: module.TrainingLogPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })));

/* ─── Helpers ─── */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_VALIDATION_MESSAGE = "האימייל צריך להיות בצורה הזאת: example@email.com";
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_VALIDATION_MESSAGE = "הסיסמה חייבת להכיל לפחות 8 תווים, אות גדולה, אות קטנה ומספר";

function fmNormalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64url = parts[1];
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
    const json = atob(b64);
    const utf8 = decodeURIComponent(
      Array.prototype.map
        .call(json, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(utf8);
  } catch {
    return null;
  }
}

function extractDisplayNameFromIdToken(idToken) {
  const payload = decodeJwtPayload(idToken);
  if (!payload || typeof payload !== "object") return "";
  const name = payload.name || payload.given_name || payload["cognito:username"] || "";
  return typeof name === "string" ? name.trim() : "";
}

function getTokenIdentity(idToken) {
  const payload = decodeJwtPayload(idToken);
  if (!payload || typeof payload !== 'object') return null;
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) * 1000 <= Date.now()) return null;
  const groups = Array.isArray(payload['cognito:groups']) ? payload['cognito:groups'] : [];
  const email = fmNormalizeEmail(payload.email || payload['cognito:username'] || payload.username);
  if (!email) return null;
  return { email, groups, isAdmin: groups.includes('Admins') };
}

function checkIsAdminUser() {
  return Boolean(getTokenIdentity(localStorage.getItem('fitmentor_idToken'))?.isAdmin);
}

function clearStoredAuth() {
  localStorage.removeItem('fitmentor_idToken');
  localStorage.removeItem('fitmentor_accessToken');
  localStorage.removeItem('fitmentor_refreshToken');
  localStorage.removeItem('fitmentor_userId');
  localStorage.removeItem('fitmentor_displayName');
  localStorage.removeItem('fitmentor_role');
}

/* ─── Toast Component ─── */
function Toast({ message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!message) return null;
  return (
    <div className={`toast ${type === 'error' ? 'is-danger' : ''}`}>
      {message}
    </div>
  );
}

/* ─── Auth Modal Component ─── */
function AuthModal({ isOpen, onClose, onLoginSuccess, showToast, initialView = 'login', resetCodeFromUrl = '', resetEmailFromUrl = '' }) {
  const [view, setView] = useState('login'); // login | loggingIn | register | registering | forgotPassword | resetPassword
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [registeringTitle, setRegisteringTitle] = useState('ההרשמה מתחילה...');
  const [registeringSubtitle, setRegisteringSubtitle] = useState('');
  const [statusClass, setStatusClass] = useState('is-loading');

  const [loginTitle, setLoginTitle] = useState('מתחבר לחשבון...');
  const [loginSubtitle, setLoginSubtitle] = useState('');
  const [loginStatusClass, setLoginStatusClass] = useState('is-loading');

  const [loginErrors, setLoginErrors] = useState({ email: '', password: '' });
  const [regErrors, setRegErrors] = useState({ name: '', email: '', password: '' });
  const [forgotErrors, setForgotErrors] = useState({ email: '' });
  const [resetErrors, setResetErrors] = useState({ newPassword: '', confirmPassword: '' });

  const resetUsernameRef = useRef('');
  const resetCodeRef = useRef('');
  const mouseDownOnBackdropRef = useRef(false);

  const clearErrors = () => {
    setLoginErrors({ email: '', password: '' });
    setRegErrors({ name: '', email: '', password: '' });
    setForgotErrors({ email: '' });
    setResetErrors({ newPassword: '', confirmPassword: '' });
  };

  const switchView = (newView) => {
    clearErrors();
    setView(newView);
  };

  useEffect(() => {
    if (isOpen) {
      setView(initialView || 'login');
      setLoginEmail('');
      setLoginPassword('');
      setRegName('');
      setRegEmail('');
      setRegPassword('');
      setForgotEmail('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      clearErrors();
      if (initialView === 'resetPassword' && resetCodeFromUrl) {
        resetCodeRef.current = resetCodeFromUrl;
        resetUsernameRef.current = resetEmailFromUrl;
      }
    }
  }, [isOpen, initialView, resetCodeFromUrl, resetEmailFromUrl]);

  const handleLogin = async () => {
    const email = fmNormalizeEmail(loginEmail);
    const errors = { email: '', password: '' };
    let hasError = false;

    if (!email) {
      errors.email = 'נא להזין אימייל';
      hasError = true;
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = EMAIL_VALIDATION_MESSAGE;
      hasError = true;
    }

    if (!loginPassword) {
      errors.password = 'נא להזין סיסמה';
      hasError = true;
    } else if (!PASSWORD_REGEX.test(loginPassword)) {
      errors.password = PASSWORD_VALIDATION_MESSAGE;
      hasError = true;
    }

    setLoginErrors(errors);
    if (hasError) return;

    setView('loggingIn');
    setLoginTitle('מתחבר לחשבון...');
    setLoginSubtitle('מאמת פרטים מול AWS Cognito 🔐');
    setLoginStatusClass('is-loading');

    try {
      const res = await fitmentorApi.login(email, loginPassword);
      if (res.status === 'blocked' || res.isBlocked) {
        setLoginStatusClass('is-error');
        setLoginTitle('שגיאה בהתחברות');
        setLoginSubtitle('משהו השתבש, או שהאימייל או הסיסמה אינם נכונים.');

        setTimeout(() => {
          switchView('login');
        }, 1500);
        return;
      }
      const token = res.idToken || res.token || res.accessToken;
      if (token) {
        const identity = getTokenIdentity(token);
        if (!identity) throw new Error('לא התקבל אסימון התחברות תקין');
        localStorage.setItem("fitmentor_idToken", token);
        localStorage.setItem("fitmentor_accessToken", res.accessToken || token);
        localStorage.setItem("fitmentor_refreshToken", res.refreshToken || "");
        localStorage.setItem("fitmentor_userId", identity.email);

        const role = identity.isAdmin ? "Admin" : "User";
        localStorage.setItem("fitmentor_role", role);

        const displayName = res.userName || extractDisplayNameFromIdToken(token) || email;
        if (displayName) localStorage.setItem("fitmentor_displayName", displayName);

        setLoginStatusClass('is-success');
        setLoginTitle('התחברת בהצלחה! 🎉');
        setLoginSubtitle(`ברוך הבא, ${displayName}! מכין את סביבת העבודה 💪`);

        setTimeout(() => {
          onLoginSuccess(displayName, identity.email);
          onClose();
          showToast(`שלום ${displayName}! התחברת בהצלחה ✅`);
        }, 1200);
      } else {
        throw new Error(res.message || 'לא התקבל אסימון התחברות');
      }
    } catch {
      setLoginStatusClass('is-error');
      setLoginTitle('שגיאה בהתחברות');
      setLoginSubtitle('משהו השתבש, או שהאימייל או הסיסמה אינם נכונים.');

      setTimeout(() => {
        switchView('login');
      }, 1500);
    }
  };

  const handleRegister = async () => {
    const email = fmNormalizeEmail(regEmail);
    const errors = { name: '', email: '', password: '' };
    let hasError = false;

    if (!regName.trim()) {
      errors.name = 'נא להזין שם מלא';
      hasError = true;
    }

    if (!email) {
      errors.email = 'נא להזין אימייל';
      hasError = true;
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = EMAIL_VALIDATION_MESSAGE;
      hasError = true;
    }

    if (!regPassword) {
      errors.password = 'נא להזין סיסמה';
      hasError = true;
    } else if (!PASSWORD_REGEX.test(regPassword)) {
      errors.password = PASSWORD_VALIDATION_MESSAGE;
      hasError = true;
    }

    setRegErrors(errors);
    if (hasError) return;

    setView('registering');
    setRegisteringTitle('ההרשמה מתחילה...');
    setRegisteringSubtitle('');
    setStatusClass('is-loading');

    try {
      await fitmentorApi.register(email, regPassword, regName.trim());
      setStatusClass('is-success');
      setRegisteringTitle('נרשמת בהצלחה! 🎉');
      setRegisteringSubtitle('נשלח אליך מייל מעוצב עם קישור לאימות החשבון 📧');

      setTimeout(() => {
        showToast('נשלח אליך מייל מעוצב! לחץ על הקישור במייל כדי לאמת ולהתחבר 🚀');
        switchView('login');
      }, 2500);
    } catch (err) {
      setStatusClass('is-error');
      setRegisteringTitle('שגיאה ברישום');
      setRegisteringSubtitle(err.message || 'אנא נסו שוב');
    }
  };

  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = setTimeout(() => setForgotCooldown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [forgotCooldown]);

  const handleForgotPassword = async () => {
    if (forgotSubmitting || forgotCooldown > 0) return;

    const email = fmNormalizeEmail(forgotEmail);
    const errors = { email: '' };
    let hasError = false;

    if (!email) {
      errors.email = 'נא להזין אימייל';
      hasError = true;
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = EMAIL_VALIDATION_MESSAGE;
      hasError = true;
    }

    setForgotErrors(errors);
    if (hasError) return;

    setForgotSubmitting(true);
    try {
      await fitmentorApi.forgotPassword(email);
      resetUsernameRef.current = email;
    } catch {
      // Suppress error for security against user enumeration
    } finally {
      setForgotSubmitting(false);
      setForgotCooldown(60);
    }

    showToast('אם האימייל אכן קיים במערכת, נשלחה אליו הודעה לאיפוס הסיסמה 📧');
    switchView('forgotSent');
  };

  const handleResetPassword = async () => {
    const errors = { newPassword: '', confirmPassword: '' };
    let hasError = false;

    if (!resetNewPassword) {
      errors.newPassword = 'נא להזין סיסמה חדשה';
      hasError = true;
    } else if (!PASSWORD_REGEX.test(resetNewPassword)) {
      errors.newPassword = PASSWORD_VALIDATION_MESSAGE;
      hasError = true;
    }

    if (!resetConfirmPassword) {
      errors.confirmPassword = 'נא לאשר את הסיסמה';
      hasError = true;
    } else if (resetNewPassword !== resetConfirmPassword) {
      errors.confirmPassword = 'הסיסמאות לא תואמות';
      hasError = true;
    }

    setResetErrors(errors);
    if (hasError) return;

    try {
      await fitmentorApi.confirmForgotPassword(
        resetUsernameRef.current,
        resetCodeRef.current,
        resetNewPassword
      );
      showToast('הסיסמה עודכנה בהצלחה! ✅');
      switchView('login');
    } catch (err) {
      showToast(err.message || 'שגיאה בעדכון הסיסמה', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal show"
      onMouseDown={(e) => {
        mouseDownOnBackdropRef.current = (e.target === e.currentTarget);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && mouseDownOnBackdropRef.current) {
          onClose();
        }
      }}
    >
      <div className="modal-content" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        {/* Login View */}
        {view === 'login' && (
          <div>
            <h2 className="modal-title">התחברות</h2>
            <p className="modal-subtitle">ברוכים השבים ל-FitMentor</p>

            <label htmlFor="loginEmail" className="text-right-label">אימייל</label>
            <input
              type="email"
              id="loginEmail"
              className={`modal-input ${loginErrors.email ? 'is-invalid' : ''}`}
              placeholder="example@email.com"
              value={loginEmail}
              onChange={(e) => {
                setLoginEmail(e.target.value);
                if (loginErrors.email) setLoginErrors(prev => ({ ...prev, email: '' }));
              }}
            />
            {loginErrors.email && <span className="field-error-msg">{loginErrors.email}</span>}

            <label htmlFor="loginPassword" className="text-right-label">סיסמה</label>
            <input
              type="password"
              id="loginPassword"
              className={`modal-input ${loginErrors.password ? 'is-invalid' : ''}`}
              placeholder="********"
              value={loginPassword}
              onChange={(e) => {
                setLoginPassword(e.target.value);
                if (loginErrors.password) setLoginErrors(prev => ({ ...prev, password: '' }));
              }}
            />
            {loginErrors.password && <span className="field-error-msg">{loginErrors.password}</span>}

            <button className="btn-register-action" onClick={handleLogin}>התחברות</button>

            <div className="modal-footer">
              <a className="text-cyan link-block" onClick={(e) => { e.preventDefault(); switchView('forgotPassword'); }}>שכחת את הסיסמה?</a>
              <div style={{ marginTop: '10px' }}>
                <span className="text-muted">עדיין לא נרשמת? </span>
                <a className="text-green fw-bold" onClick={() => switchView('register')}>הירשם כאן</a>
              </div>
            </div>
          </div>
        )}

        {/* Forgot Password View */}
        {view === 'forgotPassword' && (
          <div>
            <h2 className="modal-title-register">איפוס סיסמה</h2>
            <p className="modal-subtitle">הזן את האימייל שלך ונשלח לך הודעת איפוס</p>

            <label htmlFor="forgotEmail" className="text-right-label">אימייל</label>
            <input
              type="email"
              id="forgotEmail"
              className={`modal-input ${forgotErrors.email ? 'is-invalid' : ''}`}
              placeholder="example@email.com"
              value={forgotEmail}
              onChange={(e) => {
                setForgotEmail(e.target.value);
                if (forgotErrors.email) setForgotErrors(prev => ({ ...prev, email: '' }));
              }}
            />
            {forgotErrors.email && <span className="field-error-msg">{forgotErrors.email}</span>}

            <button className="btn-register-action" onClick={handleForgotPassword} disabled={forgotSubmitting || forgotCooldown > 0}>
              {forgotSubmitting ? 'שולח... ⏳' : forgotCooldown > 0 ? `נשלח! המתן ${forgotCooldown} שניות` : 'שלח איפוס סיסמה'}
            </button>

            <div className="modal-footer">
              <a className="text-muted link-block" style={{ fontSize: '0.9rem' }} onClick={() => switchView('login')}>חזרה להתחברות</a>
            </div>
          </div>
        )}

        {/* Forgot Password Sent Confirmation */}
        {view === 'forgotSent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '4rem', marginBottom: '16px' }}>📧</div>
            <h2 className="modal-title-register">בדוק את המייל שלך</h2>
            <p className="modal-subtitle" style={{ lineHeight: '1.6' }}>
              אם האימייל קיים במערכת, שלחנו לך הודעה מעוצבת עם קישור לאיפוס הסיסמה.<br/>
              <strong style={{ color: 'var(--accent-cyan)' }}>לחץ על הכפתור במייל</strong> כדי לבחור סיסמה חדשה.
            </p>
            <div style={{ marginTop: '20px', padding: '14px', background: 'rgba(250, 204, 21, 0.08)', border: '1px solid rgba(250, 204, 21, 0.2)', borderRadius: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              💡 לא קיבלת? בדוק את תיקיית הספאם. ניתן לשלוח שוב בעוד {forgotCooldown > 0 ? `${forgotCooldown} שניות` : 'עכשיו'}.
            </div>
            <div className="modal-footer" style={{ marginTop: '20px' }}>
              {forgotCooldown <= 0 && (
                <a className="text-muted link-block" style={{ fontSize: '0.9rem' }} onClick={() => switchView('forgotPassword')}>שלח שוב</a>
              )}
              <a className="text-muted link-block" style={{ fontSize: '0.9rem' }} onClick={() => switchView('login')}>חזרה להתחברות</a>
            </div>
          </div>
        )}

        {/* Reset Password View */}
        {view === 'resetPassword' && (
          <div>
            <h2 className="modal-title-register">איפוס סיסמה</h2>
            <p className="modal-subtitle">בחר סיסמה חדשה</p>

            <label htmlFor="resetNewPassword" className="text-right-label">סיסמה חדשה</label>
            <input
              type="password"
              id="resetNewPassword"
              className={`modal-input ${resetErrors.newPassword ? 'is-invalid' : ''}`}
              placeholder="לפחות 8 תווים, אות גדולה ומספר"
              value={resetNewPassword}
              onChange={(e) => {
                setResetNewPassword(e.target.value);
                if (resetErrors.newPassword) setResetErrors(prev => ({ ...prev, newPassword: '' }));
              }}
            />
            {resetErrors.newPassword && <span className="field-error-msg">{resetErrors.newPassword}</span>}

            <label htmlFor="resetConfirmPassword" className="text-right-label">אימות סיסמה חדשה</label>
            <input
              type="password"
              id="resetConfirmPassword"
              className={`modal-input ${resetErrors.confirmPassword ? 'is-invalid' : ''}`}
              placeholder="חזור על הסיסמה"
              value={resetConfirmPassword}
              onChange={(e) => {
                setResetConfirmPassword(e.target.value);
                if (resetErrors.confirmPassword) setResetErrors(prev => ({ ...prev, confirmPassword: '' }));
              }}
            />
            {resetErrors.confirmPassword && <span className="field-error-msg">{resetErrors.confirmPassword}</span>}

            <button className="btn-register-action" onClick={handleResetPassword}>עדכן סיסמה</button>

            <div className="modal-footer">
              <a className="text-muted link-block" style={{ fontSize: '0.9rem' }} onClick={() => switchView('login')}>חזרה להתחברות</a>
            </div>
          </div>
        )}

        {/* Register View */}
        {view === 'register' && (
          <div>
            <h2 className="modal-title-register">הרשמה חדשה</h2>
            <p className="modal-subtitle">הכנס פרטים כדי להתחיל להתאמן</p>

            <label htmlFor="regName" className="text-right-label">שם מלא</label>
            <input
              type="text"
              id="regName"
              className={`modal-input ${regErrors.name ? 'is-invalid' : ''}`}
              placeholder="שם מלא"
              value={regName}
              onChange={(e) => {
                setRegName(e.target.value);
                if (regErrors.name) setRegErrors(prev => ({ ...prev, name: '' }));
              }}
            />
            {regErrors.name && <span className="field-error-msg">{regErrors.name}</span>}

            <label htmlFor="regEmail" className="text-right-label">אימייל</label>
            <input
              type="email"
              id="regEmail"
              className={`modal-input ${regErrors.email ? 'is-invalid' : ''}`}
              placeholder="example@email.com"
              value={regEmail}
              onChange={(e) => {
                setRegEmail(e.target.value);
                if (regErrors.email) setRegErrors(prev => ({ ...prev, email: '' }));
              }}
            />
            {regErrors.email && <span className="field-error-msg">{regErrors.email}</span>}

            <label htmlFor="regPassword" className="text-right-label">סיסמה</label>
            <input
              type="password"
              id="regPassword"
              className={`modal-input ${regErrors.password ? 'is-invalid' : ''}`}
              placeholder="בחר סיסמה"
              value={regPassword}
              onChange={(e) => {
                setRegPassword(e.target.value);
                if (regErrors.password) setRegErrors(prev => ({ ...prev, password: '' }));
              }}
            />
            {regErrors.password && <span className="field-error-msg">{regErrors.password}</span>}

            <button className="btn-register-action" onClick={handleRegister}>רישום</button>

            <div className="modal-footer">
              <span className="text-muted">כבר רשום? </span>
              <a className="text-cyan fw-bold" onClick={() => switchView('login')}>התחבר כאן</a>
            </div>
          </div>
        )}

        {/* Logging In View */}
        {view === 'loggingIn' && (
          <div className="auth-status-view">
            <div className="logout-icon-wrapper">
              {loginStatusClass === 'is-loading' && (
                <div className="logout-spinner">
                  <svg viewBox="0 0 50 50" className="logout-spinner-svg">
                    <circle cx="25" cy="25" r="20" fill="none" strokeWidth="3" />
                  </svg>
                </div>
              )}
              {loginStatusClass === 'is-success' && (
                <div className="logout-success-container">
                  <div className="logout-particles">
                    {[...Array(8)].map((_, i) => (
                      <span key={i} className="logout-particle" style={{ '--i': i }} />
                    ))}
                  </div>
                  <svg viewBox="0 0 80 80" className="logout-ring-svg">
                    <circle cx="40" cy="40" r="34" className="logout-ring-circle" />
                  </svg>
                  <svg viewBox="0 0 80 80" className="logout-check-svg">
                    <polyline points="24,42 35,53 56,29" className="logout-check-path" />
                  </svg>
                </div>
              )}
              {loginStatusClass === 'is-error' && (
                <div className="auth-error-icon-container">
                  <svg viewBox="0 0 80 80" className="logout-ring-svg">
                    <circle cx="40" cy="40" r="34" className="auth-error-ring" />
                  </svg>
                  <svg viewBox="0 0 80 80" className="auth-error-x-svg">
                    <line x1="30" y1="30" x2="50" y2="50" className="auth-error-x-line" />
                    <line x1="50" y1="30" x2="30" y2="50" className="auth-error-x-line auth-error-x-line-2" />
                  </svg>
                </div>
              )}
            </div>
            <h2 className="logout-modal-title">{loginTitle}</h2>
            <p className="logout-modal-subtitle">{loginSubtitle}</p>
          </div>
        )}

        {/* Registering View */}
        {view === 'registering' && (
          <div className="auth-status-view">
            <div className="logout-icon-wrapper">
              {statusClass === 'is-loading' && (
                <div className="logout-spinner">
                  <svg viewBox="0 0 50 50" className="logout-spinner-svg">
                    <circle cx="25" cy="25" r="20" fill="none" strokeWidth="3" />
                  </svg>
                </div>
              )}
              {statusClass === 'is-success' && (
                <div className="logout-success-container">
                  <div className="logout-particles">
                    {[...Array(8)].map((_, i) => (
                      <span key={i} className="logout-particle" style={{ '--i': i }} />
                    ))}
                  </div>
                  <svg viewBox="0 0 80 80" className="logout-ring-svg">
                    <circle cx="40" cy="40" r="34" className="logout-ring-circle" />
                  </svg>
                  <svg viewBox="0 0 80 80" className="logout-check-svg">
                    <polyline points="24,42 35,53 56,29" className="logout-check-path" />
                  </svg>
                </div>
              )}
              {statusClass === 'is-error' && (
                <div className="auth-error-icon-container">
                  <svg viewBox="0 0 80 80" className="logout-ring-svg">
                    <circle cx="40" cy="40" r="34" className="auth-error-ring" />
                  </svg>
                  <svg viewBox="0 0 80 80" className="auth-error-x-svg">
                    <line x1="30" y1="30" x2="50" y2="50" className="auth-error-x-line" />
                    <line x1="50" y1="30" x2="30" y2="50" className="auth-error-x-line auth-error-x-line-2" />
                  </svg>
                </div>
              )}
            </div>
            <h2 className="logout-modal-title">{registeringTitle}</h2>
            <p className="logout-modal-subtitle">{registeringSubtitle}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Confirmation Success Modal ─── */
function ConfirmationSuccessModal({ isOpen, onClose, onOpenLogin }) {
  const mouseDownRef = useRef(false);
  if (!isOpen) return null;

  return (
    <div
      className="modal show"
      onMouseDown={(e) => { mouseDownRef.current = (e.target === e.currentTarget); }}
      onClick={(e) => { if (e.target === e.currentTarget && mouseDownRef.current) onClose(); }}
    >
      <div className="modal-content confirmation-card" onMouseDown={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>&times;</button>

        <div className="confirmation-icon-wrapper">
          <div className="confirmation-pulse-ring"></div>
          <div className="confirmation-icon">🎉</div>
        </div>

        <h2 className="confirmation-title">ההרשמה שלך אושרה בהצלחה!</h2>
        <p className="confirmation-subtitle">
          ברוכים הבאים ל-<strong>FitMentor</strong> 💪<br />
          האימייל שלך אומת במערכת, והחשבון שלך מוכן לפעילות מלאה.
        </p>

        <div className="confirmation-features-preview">
          <div className="conf-feat-item">
            <span className="conf-feat-icon">📋</span>
            <span>תוכנית אימונים מותאמת אישית</span>
          </div>
          <div className="conf-feat-item">
            <span className="conf-feat-icon">💬</span>
            <span>Chat AI למענה בזמן אמת</span>
          </div>
          <div className="conf-feat-item">
            <span className="conf-feat-icon">📈</span>
            <span>מעקב התקדמות וגרפים</span>
          </div>
        </div>

        <button
          className="btn-register-action btn-start-now"
          onClick={() => {
            onClose();
            onOpenLogin();
          }}
        >
          התחבר עכשיו והתחל להתאמן 🚀
        </button>
      </div>
    </div>
  );
}

/* ─── Logout Modal Component ─── */
function LogoutModal({ isOpen, status, title, subtitle }) {
  if (!isOpen) return null;

  return (
    <div
      className="logout-modal-overlay"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="logout-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated Icon Area */}
        <div className="logout-icon-wrapper">
          {status === 'loading' && (
            <div className="logout-spinner">
              <svg viewBox="0 0 50 50" className="logout-spinner-svg">
                <circle cx="25" cy="25" r="20" fill="none" strokeWidth="3" />
              </svg>
            </div>
          )}

          {status === 'success' && (
            <div className="logout-success-container">
              {/* Particle burst */}
              <div className="logout-particles">
                {[...Array(8)].map((_, i) => (
                  <span key={i} className="logout-particle" style={{ '--i': i }} />
                ))}
              </div>

              {/* Glowing ring */}
              <svg viewBox="0 0 80 80" className="logout-ring-svg">
                <circle cx="40" cy="40" r="34" className="logout-ring-circle" />
              </svg>

              {/* Checkmark */}
              <svg viewBox="0 0 80 80" className="logout-check-svg">
                <polyline
                  points="24,42 35,53 56,29"
                  className="logout-check-path"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Text */}
        <h2 className="logout-modal-title">{title}</h2>
        <p className="logout-modal-subtitle">{subtitle}</p>
      </div>
    </div>
  );
}

/* ─── Main App Component ─── */
function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showConfirmedModal, setShowConfirmedModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [activeTab, setActiveTab] = useState('landing'); // landing | dashboard | training | progress
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });

  const [logoutModal, setLogoutModal] = useState({
    isOpen: false,
    status: 'idle', // 'loading' | 'success'
    title: '',
    subtitle: ''
  });

  const [authInitialView, setAuthInitialView] = useState('login');

  const [resetCodeFromUrl, setResetCodeFromUrl] = useState('');
  const [resetEmailFromUrl, setResetEmailFromUrl] = useState('');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const resetCode = urlParams.get('reset_code') || urlParams.get('code');
    const resetEmail = urlParams.get('email');
    const action = urlParams.get('action');
    const isConfirmation = urlParams.get('confirmed') === 'true' || window.location.search.includes('confirmUser');
    const isResetLink = action === 'resetPassword' && resetCode;

    if (isConfirmation) {
      setShowConfirmedModal(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (isResetLink) {
      setResetCodeFromUrl(resetCode);
      setResetEmailFromUrl(resetEmail || '');
      setAuthInitialView('resetPassword');
      setIsModalOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const idToken = localStorage.getItem('fitmentor_idToken');
    const identity = getTokenIdentity(idToken);
    if (identity) {
      const userEmail = identity.email;
      localStorage.setItem('fitmentor_userId', userEmail);
      const name = extractDisplayNameFromIdToken(idToken) || localStorage.getItem('fitmentor_displayName') || userEmail || '';
      if (name) {
        setIsLoggedIn(true);
        setDisplayName(name);
        setCurrentUserEmail(userEmail);
        setActiveTab(identity.isAdmin ? 'admin' : 'dashboard');
      }
    } else if (idToken) {
      clearStoredAuth();
    }
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      clearStoredAuth();
      setIsLoggedIn(false);
      setDisplayName('');
      setCurrentUserEmail('');
      setActiveTab('landing');
      setIsSidebarOpen(false);
      setToast({ message: 'פג תוקף ההתחברות. יש להתחבר מחדש.', type: 'error' });
    };
    window.addEventListener('fitmentor:auth-expired', handleExpiredSession);
    return () => window.removeEventListener('fitmentor:auth-expired', handleExpiredSession);
  }, []);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const handleLoginSuccess = (name, userEmail) => {
    setIsLoggedIn(true);
    setDisplayName(name);
    setCurrentUserEmail(userEmail || getTokenIdentity(localStorage.getItem('fitmentor_idToken'))?.email || '');
    const isAdmin = checkIsAdminUser();
    setActiveTab(isAdmin ? 'admin' : 'dashboard');
  };

  const handleLogout = () => {
    // 1. Open Logout modal with loading animation
    setLogoutModal({
      isOpen: true,
      status: 'loading',
      title: 'מתנתק מהחשבון...',
      subtitle: 'מאבטח את נתוני האימון וסוגר את הגישה... 🔒'
    });

    // 2. Transition to success step with green V checkmark animation after 900ms
    setTimeout(() => {
      setLogoutModal({
        isOpen: true,
        status: 'success',
        title: 'התנתקת בהצלחה! 👋',
        subtitle: 'תודה שהתאמנת עם FitMentor. נתראה באימון הבא! 🚀'
      });

      // 3. Keep success view open for 2.2s so user can comfortably read it, then redirect to landing
      setTimeout(() => {
        clearStoredAuth();
        setIsLoggedIn(false);
        setDisplayName('');
        setCurrentUserEmail('');
        setActiveTab('landing');
        setIsSidebarOpen(false);
        setLogoutModal({ isOpen: false, status: 'idle', title: '', subtitle: '' });
      }, 2200);

    }, 900);
  };

  const isAdmin = checkIsAdminUser();

  return (
    <>
      {/* Toast */}
      {toast.message && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        showToast={showToast}
        initialView={authInitialView}
        resetCodeFromUrl={resetCodeFromUrl}
        resetEmailFromUrl={resetEmailFromUrl}
      />

      {/* Confirmation Success Modal */}
      <ConfirmationSuccessModal
        isOpen={showConfirmedModal}
        onClose={() => setShowConfirmedModal(false)}
        onOpenLogin={() => setIsModalOpen(true)}
      />

      {/* Animated Logout Modal */}
      <LogoutModal
        isOpen={logoutModal.isOpen}
        status={logoutModal.status}
        title={logoutModal.title}
        subtitle={logoutModal.subtitle}
      />

      {/* ===== MODERN SIDEBAR & OVERLAY ===== */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'is-active' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      <aside className={`modern-sidebar ${isSidebarOpen ? 'is-open' : ''}`} aria-label="תפריט ניווט">
        <div className="sidebar-header">
          <a className="logo sidebar-logo" href="#" onClick={(e) => { e.preventDefault(); setActiveTab(isAdmin ? 'admin' : 'dashboard'); setIsSidebarOpen(false); }}>
            <span className="logo-icon-text">💪</span>
            <span>Fit<span>Mentor</span></span>
          </a>
          <button type="button" className="sidebar-close-btn" onClick={() => setIsSidebarOpen(false)} aria-label="סגור תפריט">×</button>
        </div>

        <nav className="sidebar-nav-container" aria-label="ניווט צד">
          {!isAdmin ? (
            <>
              <div
                className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
              >
                <span className="icon">🏋️</span> דשבורד
              </div>
              <div
                className={`sidebar-link ${activeTab === 'training' ? 'active' : ''}`}
                onClick={() => { setActiveTab('training'); setIsSidebarOpen(false); }}
              >
                <span className="icon">📝</span> לוג אימונים
              </div>
              <div
                className={`sidebar-link ${activeTab === 'progress' ? 'active' : ''}`}
                onClick={() => { setActiveTab('progress'); setIsSidebarOpen(false); }}
              >
                <span className="icon">📈</span> מעקב התקדמות
              </div>
            </>
          ) : (
            <div
              className={`sidebar-link ${activeTab === 'admin' ? 'active' : ''}`}
              style={{ color: '#fbbf24' }}
              onClick={() => { setActiveTab('admin'); setIsSidebarOpen(false); }}
            >
              <span className="icon">🛡️</span> ממשק אדמין
            </div>
          )}
        </nav>
      </aside>

      {/* ===== NAVBAR (hidden on admin page) ===== */}
      {activeTab !== 'admin' && (
      <nav className="main-header">
        <div className="container nav-container">
          {/* Brand — start (right in RTL) */}
          <a
            className="logo nav-brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(isLoggedIn ? (isAdmin ? 'admin' : 'dashboard') : 'landing');
            }}
            aria-label="FitMentor Home"
          >
            <span className="logo-icon-text">💪</span>
            <span>Fit<span>Mentor</span></span>
          </a>

          {/* Header greeting — pinned to the center of the bar */}
          {isLoggedIn && activeTab !== 'landing' && (
            <div className="nav-greeting">
              <span className="nav-greeting-line">ברוך הבא</span>
              <strong className="nav-user-name">{displayName}</strong>
            </div>
          )}

          {/* Actions — end (left in RTL), grouped & vertically centered */}
          <div className="nav-actions">
            {!isLoggedIn ? (
              <>
                <a href="#about">הבעיה והצורך</a>
                <a href="#features">פיצ'רים</a>
                <button type="button" className="btn-nav-primary" onClick={() => setIsModalOpen(true)}>
                  הרשמה / התחברות
                </button>
              </>
            ) : activeTab === 'landing' ? (
              <>
                <a href="#about">הבעיה והצורך</a>
                <a href="#features">פיצ'רים</a>
                <button type="button" className="btn-nav-primary" onClick={() => setActiveTab(isAdmin ? 'admin' : 'dashboard')}>
                  {isAdmin ? 'לממשק אדמין' : 'לדשבורד'}
                </button>
                <button type="button" className="btn-nav-logout" onClick={handleLogout}>
                  התנתקות
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn-nav-logout" onClick={handleLogout}>
                  התנתקות
                </button>
                <button
                  type="button"
                  className={`hamburger-btn ${isSidebarOpen ? 'is-active' : ''}`}
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  aria-label="פתח תפריט"
                  data-tooltip="תפריט ניווט"
                  title="תפריט ניווט"
                >
                  <span className="hamburger-lines">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
      )}

      {/* ===== PAGE ROUTING ===== */}
      <Suspense fallback={<main className="page-loading" aria-live="polite">טוען את הנתונים מהענן...</main>}>
      {isLoggedIn && !isAdmin && activeTab === 'dashboard' && (
        <DashboardPage user={{ email: currentUserEmail, displayName }} />
      )}

      {isLoggedIn && !isAdmin && activeTab === 'training' && (
        <TrainingLogPage
          user={{ email: currentUserEmail, displayName }}
          onNavigate={(tab) => setActiveTab(tab)}
        />
      )}

      {isLoggedIn && !isAdmin && activeTab === 'progress' && (
        <ProgressPage user={{ email: currentUserEmail, displayName }} />
      )}

      {isLoggedIn && isAdmin && (
        <AdminDashboardPage
          user={{ email: currentUserEmail, displayName, isAdmin }}
          onNavigate={(tab) => setActiveTab(tab)}
          showToast={showToast}
          onLogout={handleLogout}
        />
      )}
      </Suspense>

      {(!isLoggedIn || activeTab === 'landing') && (
        <>
          {/* ===== HERO ===== */}
          <header className="hero">
            <div className="container hero-content">
              <h1 className="hero-title">
                <span className="hero-title-main">מאמן הכושר האישי שלך</span>
                <span className="gradient-text">מונע ע"י בינה מלאכותית</span>
              </h1>
              <p className="hero-subtitle">
                FitMentor מייצר תוכניות אימון מותאמות אישית, עוקב אחר ההתקדמות שלך ועונה על כל שאלה – בדיוק כמו מאמן אנושי, רק חכם יותר וזמין תמיד.
              </p>
              {!isLoggedIn && (
                <button type="button" className="btn-cta" onClick={() => setIsModalOpen(true)}>
                  התחל להתאמן עכשיו 🚀
                </button>
              )}
            </div>
          </header>

          {/* ===== ABOUT SECTION ===== */}
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

          {/* ===== FEATURES SECTION ===== */}
          <section id="features" className="section section-features">
            <div className="container">
              <div className="features-header">
                <h2 className="section-title features-header-title">Features עיקריים</h2>
                <p className="features-header-desc">חמשת עמודי התווך של המערכת שיביאו את המשתמש להצלחה</p>
              </div>

              <div className="features-grid">
                <div className="feature-card">
                  <div className="icon-box">
                    <span className="feature-emoji">📋</span>
                  </div>
                  <h3 className="feature-title">1. תוכנית אימון מותאמת אישית</h3>
                  <p className="feature-desc">יצירת תוכנית לפי מטרה (חיטוב/כוח), זמן פנוי וציוד זמין.</p>
                  <div className="feature-footer">
                    <span className="value-label">הערך למשתמש</span>
                    <p className="feature-footer-text">חוסך ידע מקצועי ומונע בלבול בהתחלה.</p>
                  </div>
                </div>

                <div className="feature-card">
                  <div className="icon-box">
                    <span className="feature-emoji">💬</span>
                  </div>
                  <h3 className="feature-title">2. Chat AI למענה בזמן אמת</h3>
                  <p className="feature-desc">שאלות כמו "מה לעשות במקום דדליפט?" נענות מיד.</p>
                  <div className="feature-footer">
                    <span className="value-label">הערך למשתמש</span>
                    <p className="feature-footer-text">יוצר תחושת ביטחון ומאמן צמוד.</p>
                  </div>
                </div>

                <div className="feature-card">
                  <div className="icon-box">
                    <span className="feature-emoji">✅</span>
                  </div>
                  <h3 className="feature-title">3. יומן מעקב</h3>
                  <p className="feature-desc">תיעוד סטים, חזרות, משקלים וזמני אימון ביומן דיגיטלי.</p>
                  <div className="feature-footer">
                    <span className="value-label">הערך למשתמש</span>
                    <p className="feature-footer-text">משפר התמדה ונותן תחושת הישג מדידה.</p>
                  </div>
                </div>

                <div className="feature-card">
                  <div className="icon-box">
                    <span className="feature-emoji">📊</span>
                  </div>
                  <h3 className="feature-title">4. מעקב התקדמות</h3>
                  <p className="feature-desc">פאנל עם נתונים וגרפים להמחשת ההתקדמות.</p>
                  <div className="feature-footer">
                    <span className="value-label">הערך למשתמש</span>
                    <p className="feature-footer-text">תחושה של התקדמות שהמתאמן לא נתקע במקום.</p>
                  </div>
                </div>

                <div className="feature-card">
                  <div className="icon-box">
                    <span className="feature-emoji">📈</span>
                  </div>
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
        </>
      )}

      {/* ===== FOOTER (hidden on admin page) ===== */}
      {activeTab !== 'admin' && (
      <footer className="main-footer">
        <div className="footer-logo">
          <span className="logo-icon-text" style={{ fontSize: '24px', marginLeft: '5px' }}>💪</span>
          <span>FitMentor Project</span>
        </div>
        <p className="copyright">© כל הזכויות שמורות לצוות הפרויקט</p>
      </footer>
      )}
    </>
  );
}

export default App

import React from 'react';
import { useAuth } from '../context/AuthContext';

export const HomePage = ({ onOpenAuthModal, onGoToDashboard }) => {
  const { user } = useAuth();

  return (
    <>
      {/* Hero Section */}
      <header className="hero" style={{ paddingTop: '120px' }}>
        <div className="container hero-content">
          <h1 className="hero-title">
            <span className="hero-title-main">מאמן הכושר האישי שלך</span>
            <span className="gradient-text">מונע ע"י בינה מלאכותית</span>
          </h1>
          <p className="hero-subtitle">
            FitMentor מייצר תוכניות אימון מותאמות אישית, עוקב אחר ההתקדמות שלך ועונה על כל שאלה – בדיוק כמו מאמן אנושי, רק חכם יותר וזמין תמיד.
          </p>

          <div style={{ marginTop: '30px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
            {user ? (
              <button onClick={onGoToDashboard} className="btn-cta" style={{ opacity: 1, animation: 'none' }}>
                כנס לדשבורד שלי 🏋️
              </button>
            ) : (
              <button onClick={onOpenAuthModal} className="btn-cta" style={{ opacity: 1, animation: 'none' }}>
                התחל עכשיו בחינם 🚀
              </button>
            )}
          </div>
        </div>
      </header>

      {/* About Section */}
      <section id="about" className="section section-about">
        <div className="container">
          <div className="about-grid">
            <div>
              <h2 className="section-title">הבעיה והצורך</h2>
              <p className="about-desc">
                אנשים רבים מתקשים להתמיד בפעילות גופנית משום שהם <span className="text-highlight">לא יודעים מה לעשות</span>, כמה לבצע, ואיך לבנות תוכנית מותאמת להם.
              </p>
              <p className="about-desc-lg" style={{ marginTop: '15px' }}>
                הפתרונות הקיימים בשוק מסורבלים או יקרים מדי (מאמן אישי). ישנו פער עצום בין הרצון להתאמן לבין הידע והכלים הזמינים למתאמן הממוצע.
              </p>
            </div>
            
            <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '30px', borderRadius: '16px' }}>
              <h3 style={{ color: '#22d3ee', fontSize: '1.4rem', marginBottom: '15px' }}>💡 הפתרון של FitMentor</h3>
              <ul style={{ lineHeight: '2', color: '#cbd5e1' }}>
                <li>✅ <strong>בניית תוכנית AI אישית:</strong> מותאמת לגיל, משקל, ציוד וימי אימון בשבוע.</li>
                <li>✅ <strong>מאמן AI אישי 24/7:</strong> מענה בזמן אמת לכל שאלה בנושאי כושר ותזונה.</li>
                <li>✅ <strong>מעקב וגרפים:</strong> תיעוד שקילות, היקפים ולוג אימונים מלא בענן AWS.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="section" style={{ background: '#020617', padding: '80px 0' }}>
        <div className="container">
          <h2 className="section-title" style={{ textAlign: 'center', marginBottom: '50px' }}>
            פיצ'רים מרכזיים
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '25px' }}>
            
            <div className="feature-card" style={{ background: '#1e293b', border: '1px solid #334155', padding: '25px', borderRadius: '16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>🤖</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#fff' }}>תוכנית אימונים מותאמת</h3>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
                מחולל AI חכם הבונה תוכנית מפורטת (ימי אימון, תרגילים, סטים וחזרות) תוך שניות.
              </p>
            </div>

            <div className="feature-card" style={{ background: '#1e293b', border: '1px solid #334155', padding: '25px', borderRadius: '16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>💬</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#fff' }}>צ'אט מאמן אישי 24/7</h3>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
                התייעץ בכל זמן לגבי טכניקת ביצוע, חלופות לתרגילים או המלצות תזונה.
              </p>
            </div>

            <div className="feature-card" style={{ background: '#1e293b', border: '1px solid #334155', padding: '25px', borderRadius: '16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>📈</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#fff' }}>מעקב התקדמות ויזואלי</h3>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
                גרפים דינמיים המראים את מגמת המשקל, היקפי הגוף והשיפור לאורך זמן.
              </p>
            </div>

            <div className="feature-card" style={{ background: '#1e293b', border: '1px solid #334155', padding: '25px', borderRadius: '16px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '15px' }}>📝</div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '10px', color: '#fff' }}>לוג אימונים חכם</h3>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
                תיעוד ביצוע האימונים בזמן אמת, משקלים שהורמו ומעקב אחר שיאים אישיים (PR).
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#090d16', padding: '30px 0', borderTop: '1px solid #1e293b', textAlign: 'center', color: '#64748b', fontSize: '0.9rem' }}>
        <div className="container">
          FitMentor © 2026 – פרויקט יישומים בענן | AWS Cloud Serverless Stack
        </div>
      </footer>
    </>
  );
};

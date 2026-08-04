import React from 'react';

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border-color)', padding: '2.5rem 0', marginTop: '4rem', background: 'var(--bg-dark)' }}>
      <div className="container flex flex-col items-center justify-between gap-4" style={{ textAlign: 'center' }}>
        <div className="flex items-center gap-2">
          <div style={{ fontWeight: 800, color: 'var(--primary)' }}>FitMentor</div>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>— Powered by AWS & Google Gemini AI</span>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          © {new Date().getFullYear()} FitMentor App. All rights reserved. Single-table DynamoDB + Serverless Architecture.
        </p>
      </div>
    </footer>
  );
}

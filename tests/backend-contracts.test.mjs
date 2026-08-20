import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAuthenticatedIdentity,
  requireAdmin,
} from '../projects/fitmentor/backend/src/dashboard/auth.mjs';
import { __testOnly } from '../projects/fitmentor/backend/src/dashboard/index.mjs';

const {
  deepSeekModel,
  openRouterEndpoint,
  extractChatReply,
  normalizeRecommendations,
  sanitizeAndValidatePlan,
  validatePlanRequest,
} = __testOnly;

test('AI provider contract is pinned to the required DeepSeek model', () => {
  assert.equal(deepSeekModel, 'deepseek/deepseek-v4-flash-0731');
  assert.equal(openRouterEndpoint, 'https://openrouter.ai/api/v1/chat/completions');
});

function validExercise(name, weights = [30, 27.5, 25]) {
  return `
    <p>🏋️ <strong>${name} (${name} English)</strong></p>
    <p><strong>סטים:</strong> 3 סטים | <strong>חזרות:</strong> 8-12 חזרות | <strong>מנוחה:</strong> 60 שניות</p>
    <p><strong>משקל מומלץ:</strong> סט 1: ${weights[0]} ק"ג | סט 2: ${weights[1]} ק"ג | סט 3: ${weights[2]} ק"ג</p>
    <p><strong>דגש טכניקה:</strong> שמור על גב ניטרלי, נשימה מבוקרת וטווח תנועה מלא לאורך כל החזרה כדי לבצע את התרגיל בצורה יציבה ובטוחה.</p>
    <p><strong>התקדמות עומס:</strong> לאחר השלמת כל החזרות בטכניקה נקייה, העלה את העומס בהדרגה ושמור על שליטה מלאה בכל סט.</p>`;
}

function validPlan(days = 2) {
  const dayHtml = Array.from({ length: days }, (_, index) => `
    <h3>יום ${index + 1}: אימון כוח מלא</h3>
    ${validExercise(`תרגיל ${index + 1}-א`)}
    ${validExercise(`תרגיל ${index + 1}-ב`, [24, 22, 20])}
    ${validExercise(`תרגיל ${index + 1}-ג`, [18, 16, 14])}
  `).join('');
  return `<div class="ai-plan-result" onclick="bad()"><script>bad()</script>${dayHtml}
    <div class="plan-tips"><p>טיפ תזונה מפורט ומעשי.</p><p>טיפ התאוששות מפורט ומעשי.</p><p>טיפ שינה מפורט ומעשי.</p></div>
  </div>`;
}

test('authenticated identity comes only from API Gateway Cognito claims', () => {
  assert.throws(
    () => getAuthenticatedIdentity({ body: JSON.stringify({ userId: 'victim@example.com' }) }),
    (error) => error.statusCode === 401,
  );

  const identity = getAuthenticatedIdentity({
    body: JSON.stringify({ userId: 'victim@example.com' }),
    requestContext: {
      authorizer: {
        claims: {
          email: 'Real.User@Example.com',
          name: 'Real User',
          'cognito:groups': '["Admins"]',
        },
      },
    },
  });
  assert.equal(identity.userId, 'real.user@example.com');
  assert.equal(identity.name, 'Real User');
  assert.equal(identity.isAdmin, true);
  assert.doesNotThrow(() => requireAdmin(identity));
  assert.throws(() => requireAdmin({ isAdmin: false }), (error) => error.statusCode === 403);
});

test('plan sanitizer preserves a complete plan and removes executable markup', () => {
  const sanitized = sanitizeAndValidatePlan(validPlan(2), 2);
  assert.match(sanitized, /class="ai-plan-result"/);
  assert.match(sanitized, /class="plan-tips"/);
  assert.doesNotMatch(sanitized, /onclick|script|bad\(\)/i);
});

test('plan validation rejects incomplete and incorrectly ordered output', () => {
  const incomplete = validPlan(2).replace(validExercise('תרגיל 1-ג', [18, 16, 14]), '');
  assert.throws(() => sanitizeAndValidatePlan(incomplete, 2), (error) => error.statusCode === 422);

  const ascending = validPlan(1).replace('סט 1: 30 ק"ג | סט 2: 27.5 ק"ג | סט 3: 25 ק"ג', 'סט 1: 20 ק"ג | סט 2: 25 ק"ג | סט 3: 30 ק"ג');
  assert.throws(() => sanitizeAndValidatePlan(ascending, 1), (error) => error.statusCode === 422);
});

test('plan request contract rejects missing or out-of-range profile data', () => {
  assert.doesNotThrow(() => validatePlanRequest({
    age: 30,
    gender: 'male',
    weight: 80,
    height: 180,
    fitnessLevel: 'intermediate',
    goal: 'אימוני כוח',
    days: 4,
    equipment: 'gym',
  }));
  assert.throws(() => validatePlanRequest({ age: 5, days: 4 }), (error) => error.statusCode === 400);
});

test('chat and insight parsers accept only the required DeepSeek JSON contracts', () => {
  assert.deepEqual(extractChatReply('{"reply":"תשובה אמיתית","updatedPlanHtml":null,"uiAction":null}'), {
    reply: 'תשובה אמיתית',
    updatedPlanHtml: null,
    uiAction: null,
  });
  assert.throws(() => extractChatReply('plain text fallback'), (error) => error.statusCode === 502);

  assert.deepEqual(normalizeRecommendations({ recommendations: [
    { type: 'tip', title: 'כותרת 1', text: 'המלצה מפורטת אחת' },
    { type: 'progression', title: 'כותרת 2', text: 'המלצה מפורטת שנייה' },
  ] }).length, 2);
  assert.throws(() => normalizeRecommendations({ recommendations: [] }), (error) => error.statusCode === 502);
});

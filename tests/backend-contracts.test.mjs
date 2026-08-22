import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAuthenticatedIdentity,
  requireAdmin,
  requireRegularUser,
} from '../projects/fitmentor/backend/src/dashboard/auth.mjs';
import { __testOnly } from '../projects/fitmentor/backend/src/dashboard/index.mjs';
import { handler as dashboardHandler } from '../projects/fitmentor/backend/src/dashboard/index.mjs';
import { handler as logicHandler } from '../projects/fitmentor/backend/src/logic/index.mjs';
import { __testOnly as progressTestOnly } from '../projects/fitmentor/backend/src/progress/index.mjs';
import { handler as progressHandler } from '../projects/fitmentor/backend/src/progress/index.mjs';
import { handler as trainingHandler } from '../projects/fitmentor/backend/src/training/index.mjs';

const {
  deepSeekModel,
  openRouterEndpoint,
  getDeepSeekCallType,
  parseDeepSeekJsonObject,
  fetchTextWithHardTimeout,
  extractChatReply,
  normalizeRecommendations,
  buildChatProfileContext,
  buildChatTrainingContext,
  buildChatTrainingWindowFacts,
  sanitizeAndValidatePlan,
  validatePlanRequest,
  buildPlanGenerationPrompt,
  buildPlanExercisePrompt,
  buildPlanExerciseLanguageReviewPrompt,
  buildPlanResponseFormat,
  buildPlanDayResponseFormat,
  buildPlanExerciseLanguageReviewResponseFormat,
  normalizePlanDayDetails,
  normalizePlanExerciseDetails,
  validatePlanData,
  renderPlanHtml,
  LOAD_PROFILE,
  computeSuggestedLoads,
  assertWeightsMatchSuggestion,
  mergeReviewedExerciseLanguage,
} = __testOnly;

test('AI provider contract is pinned to the required DeepSeek model', () => {
  assert.equal(deepSeekModel, 'deepseek/deepseek-v4-flash-0731');
  assert.equal(openRouterEndpoint, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(getDeepSeekCallType(), 'planGeneration');
  assert.equal(getDeepSeekCallType({ isChatCall: true }), 'chat');
  assert.equal(getDeepSeekCallType({ systemPromptOverride: 'json-only' }), 'progressSummary');
});

test('progress records expose understandable structured facts from real workout sets', () => {
  const today = new Date(2026, 7, 20);
  const records = progressTestOnly.buildPrCards({
    allTimeBest1rm: new Map([
      ['bench', { value: 116.666, weight: 100, reps: 5, date: '2026-08-15' }],
    ]),
    allTimeBestSet: new Map([
      ['לחיצת כתפיים כנגד מוט (Overhead Press)', { weight: 50, reps: 8, date: '2026-08-15' }],
    ]),
    today,
  });

  assert.deepEqual(records[0], {
    id: 'estimated-1rm:bench',
    recordType: 'estimated1RM',
    title: 'לחיצת חזה כנגד מוט',
    metricLabel: '1RM משוער',
    metricValue: 116.7,
    unit: 'ק״ג',
    value: '116.7 ק״ג',
    weightKg: 116.7,
    sourceWeightKg: 100,
    reps: 5,
    date: '2026-08-15',
    meta: '1RM משוער · 2026-08-15',
    groupKey: 'chest',
    groupLabel: 'חזה',
    isNew: true,
  });
  assert.equal(records[1].recordType, 'bestSet');
  assert.equal(records[1].metricLabel, 'הסט הכבד ביותר');
  assert.equal(records[1].groupKey, 'shoulders');
  assert.equal(records[1].value, '50 ק״ג × 8 חזרות');
  assert.equal(progressTestOnly.mainLiftKey('Overhead Press'), null);
  assert.equal(progressTestOnly.mainLiftKey('פרפר חזה (Chest Fly)'), null);
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

function validStructuredPlan(days = 2) {
  return {
    days: Array.from({ length: days }, (_, dayIndex) => ({
      dayNumber: dayIndex + 1,
      title: `אימון גוף מלא ${dayIndex + 1}`,
      focus: 'חיזוק כללי, טכניקה ושיפור הדרגתי של הכושר',
      exercises: Array.from({ length: 3 }, (__, exerciseIndex) => ({
        nameHe: `תרגיל ${dayIndex + 1}-${exerciseIndex + 1}`,
        nameEn: `Exercise ${dayIndex + 1}-${exerciseIndex + 1}`,
        repsMin: 8,
        repsMax: 12,
        prescriptionUnit: 'repetitions',
        restSeconds: 60,
        loadType: 'external',
        setStrategy: 'straight',
        loadUnit: 'total_kg',
        weightsKg: [30, 30, 30],
        technique: 'מקם את הגב במנח ניטרלי, הצמד את השכמות ושמור על כפות הרגליים יציבות לפני תחילת הסט. בצע את התנועה בטווח מלא ובשליטה, נשוף במאמץ והימנע מתנופה או מנעילת המפרקים.',
        progression: 'כאשר אתה משלים 12 חזרות בכל 3 הסטים ובטכניקה נקייה, הוסף 2.5 ק״ג באימון הבא. אם אינך משלים את הטווח, שמור על אותו משקל וחזור עליו באימון הבא.',
      })),
    })),
    tips: {
      nutrition: 'העדף ארוחות מאוזנות עם חלבון, ירקות ושתייה מספקת לאורך היום.',
      recovery: 'השאר זמן התאוששות מספק בין אימונים עצימים של אותה קבוצת שריר.',
      sleep: 'שאף לשבע עד תשע שעות שינה עקביות בכל לילה כדי לתמוך בהתאוששות.',
    },
  };
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
  assert.throws(() => requireRegularUser(identity), (error) => error.statusCode === 403);
  assert.throws(() => requireAdmin({ isAdmin: false }), (error) => error.statusCode === 403);
  assert.doesNotThrow(() => requireRegularUser({ isAdmin: false }));
});

test('administrator and regular-user APIs are mutually exclusive', async () => {
  const adminClaims = {
    email: 'admin@example.com',
    'cognito:groups': '["Admins"]',
  };
  const adminEvent = (action) => ({
    requestContext: { authorizer: { claims: adminClaims } },
    body: JSON.stringify({ action }),
  });

  const userEndpointResponses = await Promise.all([
    dashboardHandler(adminEvent('getPlan')),
    progressHandler(adminEvent('getProgressData')),
    trainingHandler(adminEvent('getWorkoutLog')),
  ]);
  for (const response of userEndpointResponses) assert.equal(response.statusCode, 403);

  const regularUserAdminResponse = await logicHandler({
    requestContext: { authorizer: { claims: { email: 'user@example.com' } } },
    body: JSON.stringify({ action: 'adminGetDashboardData' }),
  });
  assert.equal(regularUserAdminResponse.statusCode, 403);
});

test('plan sanitizer preserves a complete plan and removes executable markup', () => {
  const sanitized = sanitizeAndValidatePlan(validPlan(2), 2);
  assert.match(sanitized, /class="ai-plan-result"/);
  assert.match(sanitized, /class="plan-tips"/);
  assert.doesNotMatch(sanitized, /onclick|script|bad\(\)/i);
});

test('structured DeepSeek plan data is validated and rendered with the exact submitted profile', () => {
  const params = validatePlanRequest({
    age: 25,
    gender: 'male',
    weight: 70,
    height: 175,
    days: 2,
    goal: 'חיטוב וירידה במשקל',
    fitnessLevel: 'beginner',
    equipment: 'gym',
  });
  const prompt = buildPlanGenerationPrompt(params);
  assert.match(prompt, /גיל=25/);
  assert.match(prompt, /משקל=70 ק״ג/);
  assert.match(prompt, /גובה=175 ס״מ/);
  assert.match(prompt, /בדיוק 2 ימים/);
  assert.match(prompt, /ימי אימון=2/);
  assert.match(prompt, /שני אימוני גוף מלא A\/B/);
  assert.match(prompt, /שלושה exerciseId בלבד/);
  assert.match(prompt, /אסור לבחור הליכון.*מכונת מדרגות/);
  assert.match(prompt, /JSON Schema/);
  assert.match(prompt, /אין HTML, Markdown, נימוקים/);
  assert.doesNotMatch(prompt, /אימונים אמיתיים אחרונים|BMI/);
  assert.doesNotMatch(prompt, /<h3>|<div class=/);
  const responseFormat = buildPlanResponseFormat(2);
  assert.equal(responseFormat.type, 'json_schema');
  assert.equal(responseFormat.json_schema.strict, true);
  assert.equal(responseFormat.json_schema.schema.properties.days.minItems, 2);
  assert.equal(responseFormat.json_schema.schema.properties.days.items.properties.exercises.minItems, 3);
  assert.deepEqual(responseFormat.json_schema.schema.properties.days.items.properties.exercises.items.required, ['exerciseId']);
  assert.equal(responseFormat.json_schema.schema.properties.tips.properties.nutrition.minLength, 40);

  // Outline exercises are catalog identities; the per-exercise call receives
  // the full catalog entry so the mandatory opening load can be computed.
  const outline = {
    days: [{
      dayNumber: 1,
      title: 'דחיפה',
      focus: 'חזה, כתפיים ויד אחורית',
      exercises: [
        { exerciseId: 'barbell_bench_press', nameHe: 'לחיצת חזה עם מוט', nameEn: 'Barbell Bench Press', equipment: ['gym'], loadUnits: ['total_kg'] },
        { exerciseId: 'dumbbell_shoulder_press', nameHe: 'לחיצת כתפיים עם משקולות', nameEn: 'Dumbbell Shoulder Press', equipment: ['gym'], loadUnits: ['per_hand_kg'] },
        { exerciseId: 'triceps_pushdown', nameHe: 'פשיטת מרפקים בפולי', nameEn: 'Cable Triceps Pushdown', equipment: ['gym'], loadUnits: ['machine_kg'] },
      ],
    }],
    tips: { nutrition: 'טיפ', recovery: 'טיפ', sleep: 'טיפ' },
  };
  const dayParams = { ...params, days: 1 };
  const dayPrompt = buildPlanExercisePrompt(dayParams, outline, outline.days[0], outline.days[0].exercises[0], 0);
  const suggestedBench = computeSuggestedLoads(outline.days[0].exercises[0], dayParams);
  assert.deepEqual(suggestedBench.weightsKg, [20, 22.5, 25]);
  assert.equal(suggestedBench.setStrategy, 'ramp');
  assert.equal(suggestedBench.incrementKg, 2.5);
  assert.match(dayPrompt, /עומס הפתיחה המחייב[^.]*סט 1 = 20 ק״ג, סט 2 = 22\.5 ק״ג, סט 3 = 25 ק״ג/);
  assert.match(dayPrompt, /עלייה הדרגתית מתוכננת בין הסטים/);
  assert.match(dayPrompt, /שני משפטים מלאים, טבעיים, זורמים ותקניים בעברית, 22-45 מילים/);
  assert.match(dayPrompt, /20-40 מילים/);
  assert.match(dayPrompt, /דוגמה לסגנון הנדרש/);
  assert.match(dayPrompt, /לחיצת חזה עם מוט \(Barbell Bench Press\)/);
  const straightDayPrompt = buildPlanExercisePrompt(dayParams, outline, outline.days[0], outline.days[0].exercises[1], 1);
  assert.match(straightDayPrompt, /סטים ישרים/);
  const dayFormat = buildPlanDayResponseFormat();
  assert.equal(dayFormat.json_schema.schema.properties.weightsKg.minItems, 3);
  assert.equal(dayFormat.json_schema.schema.properties.technique.minLength, 120);
  assert.equal(dayFormat.json_schema.schema.properties.progression.minLength, 110);
  assert.deepEqual(
    dayFormat.json_schema.schema.required,
    ['repsMin', 'repsMax', 'prescriptionUnit', 'restSeconds', 'loadUnit', 'weightsKg', 'technique', 'progression'],
  );
  const languageReviewPrompt = buildPlanExerciseLanguageReviewPrompt(dayParams, outline.days[0], validStructuredPlan(1).days[0].exercises[0]);
  assert.match(languageReviewPrompt, /אל תשנה את התרגיל/);
  assert.match(languageReviewPrompt, /12 חזרות בכל 3 הסטים/);
  assert.match(languageReviewPrompt, /העומס הכולל/);
  assert.match(languageReviewPrompt, /אל תקצר את הטקסט/);
  assert.deepEqual(buildPlanExerciseLanguageReviewResponseFormat().json_schema.schema.required, ['technique', 'progression']);

  // Mandatory opening loads are profile-aware and rounded to real increments.
  assert.equal(LOAD_PROFILE.push_up.pctOfBodyweight, 0);
  assert.ok(LOAD_PROFILE.back_squat.ramp);
  assert.deepEqual(computeSuggestedLoads(
    { exerciseId: 'dumbbell_lateral_raise', loadUnits: ['per_hand_kg'] },
    { age: 30, gender: 'female', weight: 60, fitnessLevel: 'beginner', goal: 'חיטוב וירידה במשקל' },
  ), { loadUnit: 'per_hand_kg', weightsKg: [2, 2, 2], setStrategy: 'straight', incrementKg: 1 });
  assert.deepEqual(computeSuggestedLoads(
    { exerciseId: 'leg_press', loadUnits: ['machine_kg'] },
    { age: 30, gender: 'male', weight: 80, fitnessLevel: 'intermediate', goal: 'עלייה במסת שריר' },
  ).weightsKg, [90, 95, 100]);
  assert.deepEqual(computeSuggestedLoads(
    { exerciseId: 'back_squat', loadUnits: ['total_kg'] },
    { age: 30, gender: 'male', weight: 90, fitnessLevel: 'advanced', goal: 'אימוני כוח' },
  ).weightsKg, [97.5, 100, 102.5]);
  assert.deepEqual(computeSuggestedLoads(
    { exerciseId: 'push_up', loadUnits: ['bodyweight'] },
    { age: 40, gender: 'other', weight: 70, fitnessLevel: 'advanced', goal: 'אימוני כוח' },
  ), { loadUnit: 'bodyweight', weightsKg: [0, 0, 0], setStrategy: 'straight', incrementKg: 0 });

  // Returned weights must track the mandatory suggestion within one increment.
  assert.doesNotThrow(() => assertWeightsMatchSuggestion([20, 25, 25], suggestedBench, 'Barbell Bench Press'));
  assert.throws(
    () => assertWeightsMatchSuggestion([30, 32.5, 35], suggestedBench, 'Barbell Bench Press'),
    (error) => error.statusCode === 422 && /required opening load/.test(error.message),
  );
  assert.throws(
    () => assertWeightsMatchSuggestion([5, 5, 5], { ...suggestedBench, weightsKg: [0, 0, 0], incrementKg: 0 }, 'Push-Up'),
    (error) => error.statusCode === 422 && /required opening load/.test(error.message),
  );

  // The language review returns only the two Hebrew fields; catalog names and
  // any field it omits must survive untouched.
  const mergedFromReview = mergeReviewedExerciseLanguage(
    validStructuredPlan(1).days[0].exercises[0],
    { technique: validStructuredPlan(1).days[0].exercises[1].technique },
  );
  assert.equal(mergedFromReview.nameHe, validStructuredPlan(1).days[0].exercises[0].nameHe);
  assert.equal(mergedFromReview.nameEn, validStructuredPlan(1).days[0].exercises[0].nameEn);
  assert.equal(mergedFromReview.technique, validStructuredPlan(1).days[0].exercises[1].technique);
  assert.equal(mergedFromReview.progression, validStructuredPlan(1).days[0].exercises[0].progression);

  const providerDay = normalizePlanDayDetails({
    day: {
      exercises: [
        {
          exercise_index: '1', reps_min: '8', reps_max: '12', prescription_unit: 'חזרות',
          rest_seconds: '90', load_unit: 'total', weights_kg: ['30', '30', '30'],
          technique_instructions: validStructuredPlan(1).days[0].exercises[0].technique,
          progression_instructions: validStructuredPlan(1).days[0].exercises[0].progression,
        },
        {
          repsMin: 10, repsMax: 15, prescriptionUnit: 'reps', restSeconds: 60,
          loadUnit: 'per hand', weightsKg: [12.5, 12.5, 12.5],
          technique: validStructuredPlan(1).days[0].exercises[1].technique,
          progression: validStructuredPlan(1).days[0].exercises[1].progression,
        },
        {
          index: 3, repsMin: 30, repsMax: 45, unit: 'שניות', rest: 45,
          weight_unit: 'משקל גוף', weights: [0, 0, 0],
          technique: validStructuredPlan(1).days[0].exercises[2].technique,
          progression: validStructuredPlan(1).days[0].exercises[2].progression,
        },
      ],
    },
  }, 1);
  assert.deepEqual(providerDay.map(({ exerciseIndex, repsMin, repsMax, prescriptionUnit, restSeconds, loadUnit, weightsKg }) => ({
    exerciseIndex, repsMin, repsMax, prescriptionUnit, restSeconds, loadUnit, weightsKg,
  })), [
    { exerciseIndex: 1, repsMin: 8, repsMax: 12, prescriptionUnit: 'repetitions', restSeconds: 90, loadUnit: 'total_kg', weightsKg: [30, 30, 30] },
    { exerciseIndex: 2, repsMin: 10, repsMax: 15, prescriptionUnit: 'repetitions', restSeconds: 60, loadUnit: 'per_hand_kg', weightsKg: [12.5, 12.5, 12.5] },
    { exerciseIndex: 3, repsMin: 30, repsMax: 45, prescriptionUnit: 'seconds', restSeconds: 45, loadUnit: 'bodyweight', weightsKg: [0, 0, 0] },
  ]);
  assert.equal(normalizePlanExerciseDetails({
    repsMin: '8', repsMax: '12', prescriptionUnit: 'repetitions', restSeconds: '90',
    loadUnit: 'machine', weightsKg: ['45', '45', '45'],
    technique: validStructuredPlan(1).days[0].exercises[0].technique,
    progression: validStructuredPlan(1).days[0].exercises[0].progression,
  }, 1, 2).exerciseIndex, 2);

  const structuredPlan = validStructuredPlan(2);
  structuredPlan.days[0].exercises[0].nameHe = 'פלאנק';
  structuredPlan.days[0].exercises[0].nameEn = 'Plank';
  structuredPlan.days[0].exercises[0].repsMin = 45;
  structuredPlan.days[0].exercises[0].repsMax = 60;
  structuredPlan.days[0].exercises[0].prescriptionUnit = 'seconds';
  structuredPlan.days[0].exercises[0].loadType = 'bodyweight';
  structuredPlan.days[0].exercises[0].setStrategy = 'straight';
  structuredPlan.days[0].exercises[0].loadUnit = 'bodyweight';
  structuredPlan.days[0].exercises[0].weightsKg = [0, 0, 0];
  structuredPlan.days[0].exercises[0].technique = 'מקם את האמות מתחת לכתפיים, כווץ את הבטן ושמור על קו ישר מהראש עד העקבים. נשום בקצב אחיד לאורך ההחזקה והימנע מקריסת האגן או מהרמתו מעל קו הכתפיים.';
  structuredPlan.days[0].exercises[0].progression = 'כאשר אתה משלים את כל 3 הסטים למשך 60 שניות בטכניקה נקייה, הוסף 5 שניות בכל סט באימון הבא. אם האגן קורס לפני הזמן, שמור על אותו משך עד שתשלים אותו בשליטה.';
  structuredPlan.days[0].exercises[1].setStrategy = 'ramp';
  structuredPlan.days[0].exercises[1].loadUnit = 'per_hand_kg';
  structuredPlan.days[0].exercises[1].weightsKg = [25.005, 27.55, 30.125];
  structuredPlan.tips.nutrition = 'טיפ';
  const validated = validatePlanData(JSON.stringify(structuredPlan), params);
  assert.deepEqual(validated, structuredPlan);
  const html = renderPlanHtml(validated, params);
  const validatedHtml = sanitizeAndValidatePlan(html, 2);
  assert.match(validatedHtml, /גיל 25 · 175 ס״מ · 70 ק״ג · מתחיל · חדר כושר מלא/);
  assert.match(validatedHtml, /<strong>משך:<\/strong> 45-60 שניות/);
  assert.match(validatedHtml, /<strong>שיטת סטים:<\/strong> סטים ישרים/);
  assert.match(validatedHtml, /<strong>דגש טכניקה:<\/strong> מקם את האמות/);
  assert.match(validatedHtml, /25\.005 ק״ג \| סט 2: 27\.55 ק״ג \| סט 3: 30\.125 ק״ג/);
  assert.equal((validatedHtml.match(/<h3>/g) || []).length, 2);
  assert.equal((validatedHtml.match(/🏋️/gu) || []).length, 6);
  assert.match(validatedHtml, /<strong>משקל מומלץ:<\/strong> משקל גוף \(ללא עומס חיצוני\)<\/p>/);
  assert.doesNotMatch(validatedHtml, /סט 1: 0 ק״ג/);
  assert.doesNotMatch(validatedHtml, /undefined|null/);

  const shortTechnique = validStructuredPlan(2);
  shortTechnique.days[0].exercises[0].technique = 'שמור על גב ישר ויציב. בצע את התנועה לאט בשליטה מלאה.';
  assert.throws(
    () => validatePlanData(shortTechnique, params),
    (error) => error.statusCode === 422 && /low-quality Hebrew/.test(error.message),
  );

  const shortProgression = validStructuredPlan(2);
  shortProgression.days[0].exercises[0].progression = 'העלה 2.5 ק״ג לאחר 12 חזרות בכל הסטים. חזור על אותו משקל באימון הבא.';
  assert.throws(
    () => validatePlanData(shortProgression, params),
    (error) => error.statusCode === 422 && /low-quality Hebrew/.test(error.message),
  );

  const wrongDayCount = validStructuredPlan(2);
  wrongDayCount.days.pop();
  assert.throws(
    () => validatePlanData(wrongDayCount, params),
    (error) => error.statusCode === 422,
  );

  const missingWeight = validStructuredPlan(2);
  missingWeight.days[0].exercises[0].weightsKg = [30, null, 20];
  assert.throws(
    () => validatePlanData(missingWeight, params),
    (error) => error.statusCode === 422,
  );

  const identicalPositiveWeights = validStructuredPlan(2);
  identicalPositiveWeights.days[0].exercises[0].weightsKg = [30, 30, 30];
  assert.deepEqual(validatePlanData(identicalPositiveWeights, params).days[0].exercises[0].weightsKg, [30, 30, 30]);

  const partiallyRepeatedPositiveWeights = validStructuredPlan(2);
  partiallyRepeatedPositiveWeights.days[0].exercises[0].weightsKg = [30, 30, 27.5];
  assert.throws(
    () => validatePlanData(partiallyRepeatedPositiveWeights, params),
    (error) => error.statusCode === 422 && /working-set progression/.test(error.message),
  );

  const externalWeightOnBodyweightExercise = validStructuredPlan(2);
  externalWeightOnBodyweightExercise.days[0].exercises[0].loadUnit = 'bodyweight';
  assert.throws(
    () => validatePlanData(externalWeightOnBodyweightExercise, params),
    (error) => error.statusCode === 422 && /bodyweight/.test(error.message),
  );

  const reversedReps = validStructuredPlan(2);
  reversedReps.days[0].exercises[0].repsMin = 12;
  reversedReps.days[0].exercises[0].repsMax = 8;
  assert.throws(
    () => validatePlanData(reversedReps, params),
    (error) => error.statusCode === 422,
  );

  const reorderedWeights = validStructuredPlan(2);
  reorderedWeights.days[0].exercises[0].setStrategy = 'ramp';
  reorderedWeights.days[0].exercises[0].weightsKg = [20, 30, 25];
  assert.throws(
    () => validatePlanData(reorderedWeights, params),
    (error) => error.statusCode === 422 && /working-set progression/.test(error.message),
  );

  const excessiveWeightJump = validStructuredPlan(2);
  excessiveWeightJump.days[0].exercises[0].setStrategy = 'ramp';
  excessiveWeightJump.days[0].exercises[0].weightsKg = [40, 55, 70];
  assert.throws(
    () => validatePlanData(excessiveWeightJump, params),
    (error) => error.statusCode === 422 && /working-set progression/.test(error.message),
  );

  const shortBrokenHebrew = validStructuredPlan(2);
  shortBrokenHebrew.days[0].exercises[0].technique = 'אל תקפוץ, נוע לאט.';
  assert.throws(
    () => validatePlanData(shortBrokenHebrew, params),
    (error) => error.statusCode === 422,
  );

  const vagueProgression = validStructuredPlan(2);
  vagueProgression.days[0].exercises[0].progression = 'הוסף מעט משקל כאשר התרגיל קל. נסה שוב באימון הבא.';
  assert.throws(
    () => validatePlanData(vagueProgression, params),
    (error) => error.statusCode === 422,
  );

  const betweenSetProgression = validStructuredPlan(2);
  betweenSetProgression.days[0].exercises[0].progression = 'כאשר תשלים 12 חזרות בכל 3 הסטים בטכניקה נקייה, הוסף 2.5 ק״ג לסט הבא. אם הטווח לא הושלם, שמור על אותו משקל באימון הבא.';
  assert.throws(
    () => validatePlanData(betweenSetProgression, params),
    (error) => error.statusCode === 422 && /between-set/.test(error.message),
  );

  const missingHebrewName = validStructuredPlan(2);
  missingHebrewName.days[0].exercises[0].nameHe = '';
  assert.throws(
    () => validatePlanData(missingHebrewName, params),
    (error) => error.statusCode === 422,
  );

  const unsuitableTechnicalLift = validStructuredPlan(2);
  unsuitableTechnicalLift.days[0].exercises[0].nameHe = 'הנפה אולימפית';
  unsuitableTechnicalLift.days[0].exercises[0].nameEn = 'Snatch';
  assert.throws(
    () => validatePlanData(unsuitableTechnicalLift, params),
    (error) => error.statusCode === 422 && /technical lift/.test(error.message),
  );
});

test('plan validation rejects incomplete output and preserves API-authored set order', () => {
  const incomplete = validPlan(2).replace(validExercise('תרגיל 1-ג', [18, 16, 14]), '');
  assert.throws(() => sanitizeAndValidatePlan(incomplete, 2), (error) => error.statusCode === 422);

  const ascending = validPlan(1).replace('סט 1: 30 ק"ג | סט 2: 27.5 ק"ג | סט 3: 25 ק"ג', 'סט 1: 20 ק"ג | סט 2: 25 ק"ג | סט 3: 30 ק"ג');
  const preserved = sanitizeAndValidatePlan(ascending, 1);
  assert.match(preserved, /סט 1: 20 ק"ג \| סט 2: 25 ק"ג \| סט 3: 30 ק"ג/);
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

test('chat and insight parsers accept the required DeepSeek JSON contracts even when fenced', () => {
  assert.deepEqual(extractChatReply('{"reply":"תשובה אמיתית","updatedPlanHtml":null,"uiAction":null}'), {
    reply: 'תשובה אמיתית',
    updatedPlanHtml: null,
    uiAction: null,
  });
  assert.deepEqual(extractChatReply('```json\n{"reply":"תשובה עטופה","updatedPlanHtml":null,"uiAction":null}\n```').reply, 'תשובה עטופה');
  assert.deepEqual(extractChatReply('תשובה אמיתית וישירה מהמודל'), {
    reply: 'תשובה אמיתית וישירה מהמודל',
    updatedPlanHtml: null,
    uiAction: null,
  });
  assert.deepEqual(extractChatReply('{"reply":"שורה ראשונה\\nשורה שנייה","updatedPlanHtml":null,"uiAction":null}').reply, 'שורה ראשונה\nשורה שנייה');
  assert.deepEqual(parseDeepSeekJsonObject('<think>brief internal work</think>\n{"recommendations":[]}'), { recommendations: [] });
  assert.deepEqual(parseDeepSeekJsonObject('<think>{"draft":true}</think>\n{"recommendations":[1,2]}'), { recommendations: [1, 2] });
  assert.throws(() => extractChatReply(''), (error) => error.statusCode === 502);

  assert.deepEqual(normalizeRecommendations({ recommendations: [
    { type: 'tip', title: 'כותרת 1', text: 'המלצה מפורטת אחת' },
    { type: 'progression', title: 'כותרת 2', text: 'המלצה מפורטת שנייה' },
  ] }).length, 2);
  assert.deepEqual(normalizeRecommendations({ recommendations: { items: [
    { type: 'custom', title: 'כותרת יחידה', text: 'תוכן אמיתי מהמודל' },
  ] } }), [{ type: 'tip', title: 'כותרת יחידה', text: 'תוכן אמיתי מהמודל' }]);
  assert.throws(() => normalizeRecommendations({ recommendations: [] }), (error) => error.statusCode === 502);
});

test('DeepSeek hard timeout covers a slow response body, not only response headers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      setTimeout(() => {
        controller.enqueue(new TextEncoder().encode('{"ok":true}'));
        controller.close();
      }, 60);
    },
  }), { status: 200 });
  try {
    await assert.rejects(
      fetchTextWithHardTimeout('https://example.test', {}, 10),
      /timed out after 10ms/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('chat context is intentionally bounded and excludes unrelated profile fields', () => {
  const profile = buildChatProfileContext({ age: 30, goal: 'כוח', email: 'private@example.com', secret: 'hidden' });
  assert.match(profile, /גיל: 30/);
  assert.match(profile, /מטרה: כוח/);
  assert.doesNotMatch(profile, /private|hidden|email|secret/i);

  const logs = Array.from({ length: 8 }, (_, index) => ({
    date: `2026-08-${String(20 - index).padStart(2, '0')}`,
    data: {
      exercises: Array.from({ length: 10 }, (__, exerciseIndex) => ({
        name: `תרגיל ${exerciseIndex + 1}`,
        sets: Array.from({ length: 7 }, (___, setIndex) => ({ weight: 50 + setIndex, reps: 8 })),
      })),
      notes: 'a'.repeat(500),
    },
  }));
  const context = buildChatTrainingContext(logs);
  assert.match(context, /אימון 5/);
  assert.doesNotMatch(context, /אימון 6/);
  assert.match(context, /תרגיל 8/);
  assert.doesNotMatch(context, /תרגיל 9/);
  assert.doesNotMatch(context, /סט 6/);

  const facts = buildChatTrainingWindowFacts(logs.slice(0, 4).map((log, index) => ({
    ...log,
    data: { ...log.data, bodyWeightKg: [108, 103, 105, 105][index] },
  })));
  assert.match(facts, /מספר אימונים מדויק בחלון: 4/);
  assert.match(facts, /גבול ישן: 2026-08-17/);
  assert.match(facts, /גבול חדש: 2026-08-20/);
  assert.match(facts, /שינוי גבול-לגבול: \+3 ק״ג/);
});

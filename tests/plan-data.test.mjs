import test from 'node:test';
import assert from 'node:assert/strict';

import {
  structuredPlanToDisplayDays,
  validateStructuredPlanForDisplay,
} from '../src/utils/planData.js';

function validStructuredPlan() {
  return {
    days: [
      {
        dayNumber: 1,
        title: 'אימון גוף מלא',
        focus: 'מיקוד היום נשאר נתון של היום ולא הופך לתרגיל רביעי',
        exercises: [
          {
            nameHe: 'פלאנק',
            nameEn: 'Plank',
            repsMin: 45,
            repsMax: 60,
            prescriptionUnit: 'seconds',
            restSeconds: 60,
            loadType: 'bodyweight',
            setStrategy: 'straight',
            loadUnit: 'bodyweight',
            weightsKg: [0, 0, 0],
            technique: 'שמור על גוף בקו ישר ונשום באופן מבוקר.',
            progression: 'הארך את משך ההחזקה בהדרגה.',
          },
          {
            nameHe: 'לחיצת חזה',
            nameEn: 'Bench Press',
            repsMin: 8,
            repsMax: 12,
            prescriptionUnit: 'repetitions',
            restSeconds: 90,
            loadType: 'external',
            setStrategy: 'ramp',
            loadUnit: 'per_hand_kg',
            weightsKg: [30, 27, 24],
            technique: 'שמור על שכמות יציבות לאורך כל טווח התנועה.',
            progression: 'העלה עומס לאחר השלמת כל החזרות בטכניקה נקייה.',
          },
          {
            nameHe: 'סקוואט גביע',
            nameEn: 'Goblet Squat',
            repsMin: 10,
            repsMax: 14,
            prescriptionUnit: 'repetitions',
            restSeconds: 75,
            loadType: 'external',
            setStrategy: 'ramp',
            loadUnit: 'total_kg',
            weightsKg: [25, 22, 19],
            technique: 'שמור על חזה פתוח וברכיים בקו האצבעות.',
            progression: 'התקדם לפי איכות הביצוע בלי לשנות את סדר הסטים.',
          },
        ],
      },
    ],
    tips: {
      nutrition: 'אכול ארוחה מאוזנת לאחר האימון.',
      recovery: 'השאר זמן להתאוששות בין האימונים.',
      sleep: 'שמור על שגרת שינה עקבית.',
    },
  };
}

test('structured plan validation accepts focus plus exactly three exercises and returns the original object', () => {
  const planData = validStructuredPlan();

  const validated = validateStructuredPlanForDisplay(planData, 1);

  assert.strictEqual(validated, planData);
  assert.equal(validated.days[0].focus, planData.days[0].focus);
  assert.equal(validated.days[0].exercises.length, 3);
});

test('display conversion preserves seconds and API-authored weights exactly', () => {
  const planData = validStructuredPlan();

  const displayDays = structuredPlanToDisplayDays(
    validateStructuredPlanForDisplay(planData, 1),
  );

  assert.equal(displayDays[0].exercises.length, 3);
  assert.deepEqual(displayDays[0].exercises[0].statsBadges[1], {
    label: 'משך',
    val: '45-60 שניות',
    type: 'emerald',
  });
  // Bodyweight exercises render a plain label instead of per-set weights.
  assert.deepEqual(displayDays[0].exercises[0].setWeights, []);
  assert.equal(displayDays[0].exercises[0].weightText, 'משקל גוף');
  assert.equal(displayDays[0].exercises[1].weightText, '');
  assert.deepEqual(displayDays[0].exercises[1].setWeights, [30, 27, 24]);
  assert.equal(displayDays[0].exercises[0].loadUnitLabel, 'משקל גוף');
  assert.equal(displayDays[0].exercises[1].loadUnitLabel, 'ק״ג לכל יד');
  assert.match(displayDays[0].exercises[1].setStrategyLabel, /ירידה הדרגתית/);
  assert.match(displayDays[0].exercises[2].setStrategyLabel, /ירידה הדרגתית/);
  assert.deepEqual(displayDays[0].exercises[2].setWeights, [25, 22, 19]);
  assert.deepEqual(planData.days[0].exercises[2].weightsKg, [25, 22, 19]);
});

test('structured plan validation rejects a day without exactly three exercises', () => {
  const planData = validStructuredPlan();
  planData.days[0].exercises.pop();

  assert.throws(
    () => validateStructuredPlanForDisplay(planData, 1),
    /בדיוק 3 תרגילים מובנים/,
  );
});

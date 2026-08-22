function requireText(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`חסר ${label} בנתוני התוכנית`);
  }
}

export function validateStructuredPlanForDisplay(planData, expectedDays) {
  const days = Number(expectedDays);
  if (!planData || typeof planData !== 'object' || !Array.isArray(planData.days)) {
    throw new Error('DeepSeek לא החזיר נתוני תוכנית מובנים');
  }
  if (Number.isInteger(days) && planData.days.length !== days) {
    throw new Error(`DeepSeek החזיר ${planData.days.length} מתוך ${days} ימי האימון שנדרשו`);
  }

  planData.days.forEach((day, dayIndex) => {
    if (!day || typeof day !== 'object' || !Array.isArray(day.exercises) || day.exercises.length !== 3) {
      throw new Error(`יום ${dayIndex + 1} אינו כולל בדיוק 3 תרגילים מובנים`);
    }
    if (!Number.isInteger(day.dayNumber) || day.dayNumber !== dayIndex + 1) {
      throw new Error(`מספר יום ${dayIndex + 1} אינו תקין`);
    }
    requireText(day.title, `שם יום ${dayIndex + 1}`);
    requireText(day.focus, `מיקוד יום ${dayIndex + 1}`);
    day.exercises.forEach((exercise, exerciseIndex) => {
      requireText(exercise?.nameHe, `שם התרגיל בעברית ${exerciseIndex + 1}`);
      requireText(exercise?.nameEn, `שם התרגיל באנגלית ${exerciseIndex + 1}`);
      requireText(exercise?.technique, `דגש הטכניקה ${exerciseIndex + 1}`);
      requireText(exercise?.progression, `הנחיית ההתקדמות ${exerciseIndex + 1}`);
      if (!Number.isInteger(exercise.repsMin) || !Number.isInteger(exercise.repsMax)
        || exercise.repsMin < 1 || exercise.repsMax > 180 || exercise.repsMin > exercise.repsMax) {
        throw new Error(`טווח התרגיל ${exerciseIndex + 1} אינו מספרי`);
      }
      if (exercise.prescriptionUnit !== 'repetitions' && exercise.prescriptionUnit !== 'seconds') {
        throw new Error(`יחידת התרגיל ${exerciseIndex + 1} אינה תקינה`);
      }
      if (!Number.isInteger(exercise.restSeconds) || exercise.restSeconds < 30 || exercise.restSeconds > 300) {
        throw new Error(`זמן המנוחה בתרגיל ${exerciseIndex + 1} אינו תקין`);
      }
      if (!Array.isArray(exercise.weightsKg) || exercise.weightsKg.length !== 3
        || exercise.weightsKg.some(weight => typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0 || weight > 400)) {
        throw new Error(`משקלי התרגיל ${exerciseIndex + 1} אינם תקינים`);
      }
      if (exercise.setStrategy != null && exercise.setStrategy !== 'straight' && exercise.setStrategy !== 'ramp') {
        throw new Error(`שיטת הסטים בתרגיל ${exerciseIndex + 1} אינה תקינה`);
      }
      if (exercise.loadUnit != null && !['total_kg', 'per_hand_kg', 'machine_kg', 'bodyweight'].includes(exercise.loadUnit)) {
        throw new Error(`יחידת העומס בתרגיל ${exerciseIndex + 1} אינה תקינה`);
      }
    });
  });

  if (!planData.tips || typeof planData.tips !== 'object') {
    throw new Error('חסרים טיפים בנתוני התוכנית');
  }
  requireText(planData.tips.nutrition, 'טיפ תזונה');
  requireText(planData.tips.recovery, 'טיפ התאוששות');
  requireText(planData.tips.sleep, 'טיפ שינה');
  return planData;
}

export function structuredPlanToDisplayDays(planData) {
  return (planData?.days || []).map((day) => ({
    title: `יום ${day.dayNumber}: ${day.title}`,
    focus: day.focus,
    exercises: (day.exercises || []).map((exercise) => {
      const isDuration = exercise.prescriptionUnit === 'seconds';
      const inferredStrategy = exercise.weightsKg[0] === exercise.weightsKg[1]
        && exercise.weightsKg[1] === exercise.weightsKg[2]
        ? 'straight'
        : 'ramp';
      const setStrategy = exercise.setStrategy || inferredStrategy;
      const loadUnit = exercise.loadUnit || (exercise.loadType === 'bodyweight' ? 'bodyweight' : 'total_kg');
      const loadUnitLabel = {
        total_kg: 'ק״ג סה״כ',
        per_hand_kg: 'ק״ג לכל יד',
        machine_kg: 'ק״ג בסימון המכונה',
        bodyweight: 'משקל גוף',
      }[loadUnit];
      const setStrategyLabel = setStrategy === 'ramp'
        ? 'עלייה הדרגתית — העומס עולה בכוונה בין הסטים'
        : 'סטים ישרים — אותו עומס נשמר בכוונה בכל שלושת הסטים';
      return {
        title: `${exercise.nameHe} (${exercise.nameEn})`,
        statsBadges: [
          { label: 'סטים', val: '3', type: 'cyan' },
          {
            label: isDuration ? 'משך' : 'חזרות',
            val: `${exercise.repsMin}-${exercise.repsMax} ${isDuration ? 'שניות' : 'חזרות'}`,
            type: 'emerald',
          },
          { label: 'מנוחה', val: `${exercise.restSeconds} שניות`, type: 'purple' },
        ],
        technique: exercise.technique,
        progression: exercise.progression,
        loadType: exercise.loadType || null,
        setStrategy,
        setStrategyLabel,
        loadUnit,
        loadUnitLabel,
        extraDetails: [],
        setWeights: [...exercise.weightsKg],
        weightText: '',
      };
    }),
  }));
}

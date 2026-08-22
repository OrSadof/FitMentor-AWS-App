import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { fitmentorApi } from '../api/fitmentorApi';
import { structuredPlanToDisplayDays, validateStructuredPlanForDisplay } from '../utils/planData';

/* ─── Helper: clean AI-generated plan HTML ─── */
function cleanPlanHtml(html) {
  if (!html) return '';
  let cleaned = html;
  // Strip markdown code fences: ```html ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:html)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  cleaned = cleaned.replace(/```(?:html)?\s*\n/gi, '');
  cleaned = cleaned.replace(/\n\s*```/gi, '');
  return DOMPurify.sanitize(cleaned.trim(), {
    ALLOWED_TAGS: ['div', 'h2', 'h3', 'h4', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'span', 'br', 'hr'],
    ALLOWED_ATTR: ['class'],
  });
}

function validatePlanForDisplay(html, expectedDays) {
  const safeHtml = cleanPlanHtml(html);
  const days = Number(expectedDays);
  if (!safeHtml || !Number.isInteger(days) || days < 1 || days > 7) {
    throw new Error('תוכנית האימון שהתקבלה אינה תקינה');
  }
  const parsed = parsePlanIntoDays(safeHtml);
  if (parsed.days.length !== days) {
    throw new Error(`DeepSeek החזיר ${parsed.days.length} מתוך ${days} ימי האימון שנדרשו`);
  }
  parsed.days.forEach((day, dayIndex) => {
    const exercises = parseExercisesFromContent(day.content);
    if (exercises.length !== 3) throw new Error(`יום ${dayIndex + 1} אינו כולל בדיוק 3 תרגילים`);
    exercises.forEach((exercise) => {
      const labels = new Set((exercise.statsBadges || []).map((badge) => badge.label));
      const hasPrescription = labels.has('חזרות') || labels.has('משך');
      if (!labels.has('סטים') || !hasPrescription || !labels.has('מנוחה')) {
        throw new Error(`חסרים נתוני סטים, חזרות או מנוחה בתרגיל ${exercise.title}`);
      }
      if (!Array.isArray(exercise.setWeights) || exercise.setWeights.length !== 3) {
        throw new Error(`חסרים משקלים מלאים בתרגיל ${exercise.title}`);
      }
      const weights = exercise.setWeights.map(Number);
      if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
        throw new Error(`המשקלים בתרגיל ${exercise.title} חייבים להיות מספרים לא-שליליים`);
      }
      if (!exercise.technique || !exercise.progression) {
        throw new Error(`חסרים דגשי טכניקה או התקדמות בתרגיל ${exercise.title}`);
      }
    });
  });
  return safeHtml;
}

/* ─── Helper: parse plan HTML/text into day-sections ───
   Robust to any heading level and to the AI adding a closing
   "plan-tips" block (whose <h3> must never be treated as a day). */
function looksLikeDayTitle(text) {
  if (!text) return false;
  const t = text.replace(/<[^>]*>/g, '').replace(/[*#`]/g, '').trim();
  if (!t || t.length < 2 || t.length > 130) return false;

  // Filter out tips / nutrition / intro false positives
  if (/\b(?:טיפים?|תזונה|התאוששות|סיכום|הקדמה|plan-tips)\b/i.test(t)) {
    return false;
  }

  return (
    /^(?:יום|אימון|Day|Workout|Session|חלוקה|חלק)\b/i.test(t) ||
    /^\s*(?:\d+|[A-Za-z])[.:)\-–—]/i.test(t) ||
    /^(?:אימון|יום)/i.test(t)
  );
}

function parsePlanIntoDays(html) {
  if (!html) return { intro: null, days: [] };

  let cleaned = html.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();

  // Remove the trailing plan-tips block entirely, so its <h3> heading can
  // never be mis-read as another workout day (this caused day-count inflation).
  cleaned = cleaned.replace(/<div\s+class=["']plan-tips["'][\s\S]*$/i, '').trim();
  cleaned = cleaned.replace(/(?:<\/div>)+\s*$/i, '').trim();

  // Strategy 1: any <h1>–<h6> heading whose text clearly marks a workout day
  const headerRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headerMatches = [];
  let m;
  while ((m = headerRegex.exec(cleaned)) !== null) {
    const title = m[2].replace(/<[^>]*>/g, '').replace(/[*#`]/g, '').trim();
    if (title.length >= 2 && title.length < 140 && looksLikeDayTitle(title)) {
      headerMatches.push({ title, index: m.index, endIndex: m.index + m[0].length });
    }
  }

  // Strategy 2: fall back to a free-form "יום X / אימון X" heading regex
  let matches = headerMatches;
  if (matches.length < 2) {
    const dayHeaderRegex = /(?:<[a-zA-Z][^>]*>|###?\s*|^\s*\*\*\s*|^|\n)\s*(?:<\w+[^>]*>)*\s*((?:יום|אימון|Day|Workout)\s*(?:\d+|[א-ת]['']?|[A-Z]|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)[^<\n*]*)/gi;
    const alternativeMatches = [];
    while ((m = dayHeaderRegex.exec(cleaned)) !== null) {
      const candidate = (m[1] || m[0]).replace(/<[^>]*>/g, '').replace(/[*#`]/g, '').trim();
      if (candidate.length >= 3 && candidate.length < 110 && looksLikeDayTitle(candidate)) {
        if (!alternativeMatches.some(f => Math.abs(f.index - m.index) < 10)) {
          alternativeMatches.push({ title: candidate, index: m.index, endIndex: m.index + m[0].length });
        }
      }
    }
    if (alternativeMatches.length >= 2) {
      matches = alternativeMatches;
    }
  }

  if (matches.length === 0) return { intro: null, days: [] };

  const days = [];
  let intro = null;
  const firstMatchIdx = matches[0].index;

  if (firstMatchIdx > 0) {
    const rawIntro = cleaned.substring(0, firstMatchIdx).trim();
    if (rawIntro.replace(/<[^>]*>/g, '').trim().length > 0) {
      intro = rawIntro;
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].endIndex;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
    const rawContent = cleaned.substring(contentStart, contentEnd)
      .replace(/<\/?div[^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    days.push({ title: matches[i].title, content: rawContent });
  }

  return { intro, days };
}

/* Parse a "משקל מומלץ: סט 1: 30 ק"ג | סט 2: 35 ק"ג | סט 3: 40 ק"ג" line into [30, 35, 40] */
function parseSetWeightsFromLine(line) {
  const setPattern = /סט\s*\d+\s*[:\-–—]?\s*(\d+(?:[.,]\d+)?)\s*(?:ק"ג|kg|קילו)?/gi;
  const matches = [];
  let m;
  while ((m = setPattern.exec(line)) !== null) {
    matches.push(Number(m[1].replace(',', '.')));
  }
  if (matches.length > 0) return matches;
  const sep = line.match(/(\d+(?:[.,]\d+)?)\s*(?:ק"ג|kg)/gi);
  if (sep) return sep.map(s => Number(s.replace(/[^\d.,]/g, '').replace(',', '.')));
  return null;
}

/* ─── Exercise Parser & Structured Formatter ───
   Parses the structured HTML workout plan generated directly by the DeepSeek AI API.
   Extracts exercise title, stats badges (sets/reps/rest), recommended set weights,
   technique cue (דגש טכניקה), and progressive overload instructions. */
function parseExercisesFromContent(rawContent) {
  if (!rawContent) return [];

  // Strip all HTML tags cleanly while replacing block closing tags with linebreaks
  const cleanedText = String(rawContent)
    .replace(/<\/(?:p|h[1-6]|li|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const lines = cleanedText
    .split('\n')
    .map(l => l.replace(/\*+/g, '').replace(/#+/g, '').trim())
    .filter(l => {
      if (!l || l.length === 0) return false;
      const lower = l.toLowerCase();
      if (/^(?:strong>|<strong|p>|<p|\/p>|div>|<div|span>|<span|br>|hr>)$/.test(lower)) return false;
      return true;
    });

  const isStatsLine = (line) =>
    (line.includes('סטים') || line.includes('חזרות') || line.includes('משך') || line.includes('מנוחה')) &&
    !line.includes('העלה') && !line.includes('כשתבצע') && !line.includes('כשאתה') && !line.includes('טכניקה');

  const isWeightLine = (line) => line.includes('משקל') || /^weight/i.test(line);
  const isTechLine = (line) =>
    /^(?:דגש(?:י)?\s*טכניקה|טכניקה|איך\s*מבצעים|הנחיות|הוראות(?:\s*ביצוע)?|טיפ\s*טכני)\s*[:\-–—]/i.test(line);

  const isProgLine = (line) =>
    /^(?:התקדמות(?:\s*עומס)?|עומס\s*פרוגרסיבי|הסבר\s*התקדמות)\s*[:\-–—]/i.test(line);

  const isFocusLine = (line) => /^מיקוד\s*האימון\s*[:\-–—]/i.test(line);

  const isDetailLine = (line) =>
    isWeightLine(line) || isTechLine(line) || isProgLine(line) || isStatsLine(line) || isFocusLine(line);

  const broadExerciseKeyword =
    /(?:סקוואט|דדליפט|לחיצת|חתירה|משיכת|מתח|כפילת|פשיטת|הרמת|מכרעים|מקבילים|פרפר|היפ|תלת|דו\s*-?\s*ראשי|בייספס|טרייספס|כתפיי?ם|יד\s*(אחורית|קדמית)|רגליי?ם|שוקיי?ם|חזה|גב|זרוע|בטן|פלאנק|תרגיל|אופניים|פולי|כבלים|משקולות)/i;

  const exercises = [];
  let currentEx = null;

  const startExercise = (title) => {
    let cleanTitle = (title || '(תרגיל)')
      .replace(/^🏋️?\s*/, '')
      .replace(/^\d+(?:[.):]|-)\s*/, '')
      .replace(/^תרגיל\s*\d*\s*[:.-]?\s*/i, '')
      .replace(/^strong>\s*/i, '')
      .replace(/[:–—-]$/, '')
      .trim();

    if (!cleanTitle || cleanTitle.toLowerCase() === 'strong' || cleanTitle.toLowerCase() === 'strong>') {
      cleanTitle = '(תרגיל)';
    }

    if (currentEx) exercises.push(currentEx);
    currentEx = {
      title: cleanTitle,
      statsBadges: [],
      technique: '',
      progression: '',
      extraDetails: [],
      setWeights: [],
      weightText: ''
    };
  };

  const parseStatsPart = (line, ex) => {
    if (!line || !ex) return;

    // 1. Direct Regex Extraction for Sets, Reps, and Rest
    const sMatch = line.match(/(?:סטים|סטים\s*וחזרות)\s*[:\-–—]?\s*(\d+(?:\s*סטים)?)/i);
    if (sMatch && !ex.statsBadges.some(b => b.label === 'סטים')) {
      ex.statsBadges.push({ label: 'סטים', val: sMatch[1].trim(), type: 'cyan' });
    }

    const rMatch = line.match(/חזרות\s*[:\-–—]?\s*([\d\-–—\s]+(?:חזרות)?)/i);
    if (rMatch && !ex.statsBadges.some(b => b.label === 'חזרות')) {
      const cleanReps = rMatch[1].trim();
      if (cleanReps && !['נקיות', '.', 'נקיות.'].includes(cleanReps)) {
        ex.statsBadges.push({ label: 'חזרות', val: cleanReps, type: 'emerald' });
      }
    }

    const durationMatch = line.match(/משך\s*[:\-–—]?\s*([\d\-–—\s]+(?:שניות|דקות)?)/i);
    if (durationMatch && !ex.statsBadges.some(b => b.label === 'משך')) {
      const cleanDuration = durationMatch[1].trim();
      if (cleanDuration) ex.statsBadges.push({ label: 'משך', val: cleanDuration, type: 'emerald' });
    }

    const mMatch = line.match(/מנוחה\s*[:\-–—]?\s*([\d\-–—\s\w]+(?:שניות|דקות|sec|min)?)/i);
    if (mMatch && !ex.statsBadges.some(b => b.label === 'מנוחה')) {
      ex.statsBadges.push({ label: 'מנוחה', val: mMatch[1].trim(), type: 'purple' });
    }

    // 2. Fallback Split Parsing if separated by | or ;
    const parts = line.split(/\||;/);
    parts.forEach(p => {
      const trimmedP = p.trim();
      if (!trimmedP) return;

      if (trimmedP.includes('סטים') && !ex.statsBadges.some(b => b.label === 'סטים')) {
        const val = trimmedP.replace(/^.*סטים\s*[:-]?\s*/i, '').trim();
        if (val) ex.statsBadges.push({ label: 'סטים', val, type: 'cyan' });
      } else if ((trimmedP.includes('חזרות') || trimmedP.includes('משך')) && !ex.statsBadges.some(b => b.label === 'חזרות' || b.label === 'משך')) {
        const isDuration = trimmedP.includes('משך');
        const val = trimmedP.replace(/^.*(?:חזרות|משך)\s*[:-]?\s*/i, '').trim();
        const cleanVal = val.replace(/\s+/g, ' ').replace(/^[\s.,]+|[\s.,]+$/g, '');
        if (cleanVal && !['נקיות', '.', 'נקיות.'].includes(cleanVal)) {
          ex.statsBadges.push({ label: isDuration ? 'משך' : 'חזרות', val: cleanVal, type: 'emerald' });
        }
      } else if (trimmedP.includes('מנוחה') && !ex.statsBadges.some(b => b.label === 'מנוחה')) {
        const val = trimmedP.replace(/^.*מנוחה\s*[:-]?\s*/i, '').trim();
        if (val) ex.statsBadges.push({ label: 'מנוחה', val, type: 'purple' });
      }
    });
  };

  lines.forEach(line => {
    // Explicit Exercise Header Criteria:
    const isHeader =
      line.includes('🏋️') || line.includes('🏋') ||
      /^\d+(?:[.):]|-)\s*/.test(line) ||
      /^תרגיל\s*\d*/i.test(line) ||
      (!isDetailLine(line) && broadExerciseKeyword.test(line) && line.length <= 80);

    if (isHeader) {
      let rawTitle = line;
      let inlineStats = '';
      if (rawTitle.includes('|')) {
        const parts = rawTitle.split('|');
        rawTitle = parts[0].trim();
        inlineStats = parts.slice(1).join('|').trim();
      }

      startExercise(rawTitle);
      if (inlineStats) {
        parseStatsPart(inlineStats, currentEx);
      }
      return;
    }

    if (!currentEx) {
      if (!isDetailLine(line) && line.length > 2) {
        startExercise(line);
      }
      return;
    }

    if (isTechLine(line)) {
      currentEx.technique = line.replace(/^(?:דגש(?:י)?\s*טכניקה|טכניקה|איך\s*מבצעים|הנחיות|הוראות(?:\s*ביצוע)?|טיפ\s*טכני)\s*[:\-–—]?\s*/i, '').trim();
      return;
    }

    if (isProgLine(line)) {
      currentEx.progression = line.replace(/^(?:התקדמות(?:\s*עומס)?|עומס\s*פרוגרסיבי|הסבר\s*התקדמות)\s*[:\-–—]?\s*/i, '').trim();
      return;
    }

    if (isWeightLine(line)) {
      if (/משקל\s*גוף/i.test(line) || /body\s*weight/i.test(line)) {
        currentEx.weightText = 'משקל גוף';
        currentEx.setWeights = [];
        return;
      }
      let setWeights = parseSetWeightsFromLine(line);
      if (setWeights && setWeights.length > 0) {
        currentEx.setWeights = setWeights;
      } else {
        const nums = line.match(/\d+(?:[.,]\d+)?/g);
        if (nums && nums.length > 0) {
          currentEx.setWeights = nums.map(n => Number(n.replace(',', '.')));
        } else {
          const weightDesc = line.replace(/^.*(?:משקל\s*מומלץ)\s*[:\-–—]?\s*/i, '').trim();
          if (weightDesc) {
            currentEx.weightText = weightDesc;
          } else {
            currentEx.extraDetails.push(line);
          }
        }
      }
      return;
    }

    if (isStatsLine(line)) {
      parseStatsPart(line, currentEx);
      return;
    }

    currentEx.extraDetails.push(line);
  });

  if (currentEx) exercises.push(currentEx);

  const cleanExercises = exercises.filter(ex => ex.title && ex.title !== 'strong>' && ex.title !== '<strong' && ex.title !== 'strong');

  return cleanExercises;
}

function PlanExerciseItem({ ex }) {
  const [isOpen, setIsOpen] = useState(false);

  // Display only values returned and validated from the DeepSeek response.
  const setWeights = (ex.setWeights && ex.setWeights.length > 0) ? ex.setWeights : null;
  const hasWeightText = ex.weightText && ex.weightText.length > 0;

  return (
    <div className="plan-exercise-card" data-open={isOpen}>
      {/* Header Button - Clicking this toggles exercise details */}
      <button
        type="button"
        className="plan-ex-header-btn"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="plan-ex-header-left">
          <span className="plan-ex-icon">🏋️</span>
          <h4 className="plan-ex-title">{ex.title}</h4>
        </div>
        <span className={`plan-ex-chevron ${isOpen ? 'open' : ''}`}>‹</span>
      </button>

      {/* Details Dropdown Body */}
      {isOpen && (
        <div className="plan-ex-body">
          {/* Badges Bar */}
          {ex.statsBadges.length > 0 && (
            <div className="plan-ex-badges-row">
              {ex.statsBadges.map((badge, bIdx) => (
                <span key={bIdx} className={`plan-ex-badge plan-ex-badge--${badge.type}`}>
                  <span className="badge-label">{badge.label}:</span>
                  <span className="badge-value">{badge.val}</span>
                </span>
              ))}
            </div>
          )}

          {/* Recommended weight per set — displayed exactly as returned by AI API */}
          {setWeights && (
            <div className="plan-ex-weights">
              <span className="plan-ex-weights-label">🏋️ עומס פתיחה מוצע לכל סט ({ex.loadUnitLabel || 'ק״ג'}):</span>
              <div className="plan-ex-weights-sets">
                {setWeights.map((w, i) => (
                  <span key={i} className="plan-ex-weight-set">
                    סט {i + 1} — {ex.loadUnit === 'bodyweight' ? 'משקל גוף' : `${w} ${ex.loadUnitLabel || 'ק״ג'}`}
                  </span>
                ))}
              </div>
              {ex.setStrategyLabel && (
                <div className="plan-ex-set-strategy">
                  <strong>שיטת הסטים:</strong> {ex.setStrategyLabel}
                </div>
              )}
            </div>
          )}

          {/* Recommended weight — text description from AI (e.g. "משקל גוף") */}
          {!setWeights && hasWeightText && (
            <div className="plan-ex-weights">
              <span className="plan-ex-weights-label">🏋️ משקל עבודה מומלץ:</span>
              <div className="plan-ex-weights-sets">
                <span className="plan-ex-weight-set">{ex.weightText}</span>
              </div>
            </div>
          )}

          {/* Technique Focus Box - Rendered directly from DeepSeek AI */}
          {ex.technique ? (
            <div className="plan-ex-box plan-ex-box--tech">
              <div className="plan-ex-box-title">
                <span className="box-icon">🎯</span>
                <span>דגש טכניקה:</span>
              </div>
              <p className="plan-ex-box-text">{ex.technique}</p>
            </div>
          ) : null}

          {/* Progressive Overload Box */}
          {ex.progression && (
            <div className="plan-ex-box plan-ex-box--prog">
              <div className="plan-ex-box-title">
                <span className="box-icon">📈</span>
                <span>מתי להעלות משקל או חזרות?</span>
              </div>
              <p className="plan-ex-box-text">{ex.progression}</p>
            </div>
          )}

          {/* Extra Details */}
          {ex.extraDetails && ex.extraDetails.length > 0 && (
            <div className="plan-ex-extra">
              {ex.extraDetails.map((det, dIdx) => (
                <p key={dIdx}>{det}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanExercisesList({ exercises }) {
  if (exercises.length === 0) {
    return <div className="plan-validation-error">מבנה יום האימון אינו תקין.</div>;
  }

  return (
    <div className="plan-exercises-list">
      {exercises.map((ex, i) => (
        <PlanExerciseItem key={i} ex={ex} />
      ))}
    </div>
  );
}

function RenderFormattedDayContent({ rawContent }) {
  if (!rawContent) return null;
  return <PlanExercisesList exercises={parseExercisesFromContent(rawContent)} />;
}

/* ─── Plan Day Accordion Card ─── */
function PlanDayCard({ day, index, isOpen, onToggle }) {
  const dayIcons = ['🏋️', '💪', '🔥', '⚡', '🎯', '🚀', '🌟'];
  const icon = dayIcons[index % dayIcons.length];

  return (
    <div className="plan-day-card" data-open={isOpen}>
      <button className="plan-day-header" onClick={onToggle} type="button">
        <div className="plan-day-header-left">
          <span className="plan-day-icon">{icon}</span>
          <span className="plan-day-title">{day.title}</span>
        </div>
        <span className={`plan-day-chevron ${isOpen ? 'open' : ''}`}>
          ‹
        </span>
      </button>
      {isOpen && (
        <div className="plan-day-body">
          {day.focus && <p className="plan-day-focus"><strong>מיקוד האימון:</strong> {day.focus}</p>}
          {Array.isArray(day.exercises)
            ? <PlanExercisesList exercises={day.exercises} />
            : <RenderFormattedDayContent rawContent={day.content} />}
        </div>
      )}
    </div>
  );
}

/* ─── Print-Only, Fully Expanded Plan Document ───
   A self-contained, white, print-ready layout that lists EVERY day and
   renders every exercise in full (sets / reps / rest, technique focus,
   progressive-overload notes and extra details) — independent of which
   accordions are open on screen. Hidden normally, shown only under @media print. */
function PrintablePlan({ name, intro, days }) {
  const today = new Date().toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });

  const findBadge = (ex, label) => ex.statsBadges.find(b => b.label === label);

  return (
    <div className="printable-plan" dir="rtl">
      {/* Document header */}
      <header className="pp-header">
        <div className="pp-brand">
          <div className="pp-brand-text">
            <div className="pp-brand-name">תוכנית אימונים אישית</div>
          </div>
        </div>
        <div className="pp-meta">
          <div className="pp-user">{name}</div>
          <div className="pp-date">{today}</div>
        </div>
      </header>

      {/* Plan intro / summary (if any content precedes the first day) */}
      {intro && (
        <section className="pp-intro">
          <div className="pp-section-title">תקציר התוכנית</div>
          <div className="pp-intro-body" dangerouslySetInnerHTML={{ __html: intro }} />
        </section>
      )}

      {/* Overview strip: quick list of all days */}
      {days.length > 0 && (
        <section className="pp-summary">
          <div className="pp-section-title">ימי האימון ({days.length})</div>
          <div className="pp-summary-grid">
            {days.map((d, i) => (
              <div className="pp-summary-chip" key={i}>
                <span className="pp-summary-num">{i + 1}</span>
                <span className="pp-summary-name">{d.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Every day, fully expanded */}
      {days.length > 0 ? (
        days.map((day, idx) => {
          const exercises = Array.isArray(day.exercises)
            ? day.exercises
            : parseExercisesFromContent(day.content);
          return (
            <section className="pp-day" key={idx}>
              <div className="pp-day-header">
                <span className="pp-day-badge">יום {idx + 1}</span>
                <h2 className="pp-day-title">{day.title}</h2>
              </div>

              {exercises.length === 0 ? (
                <div className="plan-validation-error">מבנה יום האימון אינו תקין להדפסה.</div>
              ) : (
                <>
                  <table className="pp-table">
                    <thead>
                      <tr>
                        <th className="pp-col-num">#</th>
                        <th className="pp-col-ex">תרגיל</th>
                        <th className="pp-col-stat">סטים</th>
                        <th className="pp-col-stat">חזרות</th>
                        <th className="pp-col-stat">מנוחה</th>
                        <th className="pp-col-stat">משקל (ק"ג)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exercises.map((ex, j) => {
                        const sets = findBadge(ex, 'סטים');
                        const reps = findBadge(ex, 'חזרות') || findBadge(ex, 'משך');
                        const rest = findBadge(ex, 'מנוחה');
                        const weights = (ex.setWeights && ex.setWeights.length > 0) ? ex.setWeights : null;
                        const weightStr = weights
                          ? (new Set(weights).size === 1 ? `${weights[0]}` : weights.join(' / '))
                          : '—';
                        return (
                          <tr key={j}>
                            <td className="pp-col-num">{j + 1}</td>
                            <td className="pp-col-ex">
                              <div className="pp-ex-name">{ex.title}</div>
                              {ex.setStrategyLabel && <div className="pp-ex-detail"><span className="pp-detail-tag">שיטת הסטים</span>{ex.setStrategyLabel}</div>}
                              {ex.technique && <div className="pp-ex-detail"><span className="pp-detail-tag">דגש טכניקה</span>{ex.technique}</div>}
                              {ex.progression && <div className="pp-ex-detail"><span className="pp-detail-tag">מתי להעלות משקל או חזרות?</span>{ex.progression}</div>}
                              {ex.extraDetails.map((det, k) => (
                                <div className="pp-ex-detail" key={k}>{det}</div>
                              ))}
                            </td>
                            <td className="pp-col-stat">{sets ? sets.val : '—'}</td>
                            <td className="pp-col-stat">{reps ? reps.val : '—'}</td>
                            <td className="pp-col-stat">{rest ? rest.val : '—'}</td>
                            <td className="pp-col-stat">{weightStr}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          );
        })
      ) : (
        <section className="pp-day">
          <div className="pp-day-header">
            <h2 className="pp-day-title">תוכנית האימונים</h2>
          </div>
          <div className="plan-validation-error">לא ניתן להדפיס תוכנית שמבנהּ אינו תקין.</div>
        </section>
      )}
    </div>
  );
}

function renderMarkdownInline(str) {
  if (!str) return '';
  let formatted = str;
  formatted = formatted.replace(/==([^=\n]+)==/g, '<mark class="chat-key-highlight">$1</mark>');
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="chat-bold-highlight">$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="chat-italic-highlight">$1</em>');
  return formatted;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatChatResponseToHtml(text) {
  if (!text) return '';

  const lines = escapeHtml(text).replace(/\r\n?/g, '\n').split('\n');
  let htmlResult = '<div class="chat-markdown-container">';
  let activeList = null;

  const closeList = () => {
    if (!activeList) return;
    htmlResult += `</${activeList}>`;
    activeList = null;
  };

  const appendListItem = (type, content) => {
    if (activeList !== type) {
      closeList();
      activeList = type;
      htmlResult += `<${type} class="chat-ai-list chat-ai-list-${type}">`;
    }
    htmlResult += `<li>${renderMarkdownInline(content)}</li>`;
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }

    if (/^(---|[*]{3})$/.test(trimmed)) {
      closeList();
      htmlResult += '<hr class="chat-md-divider" />';
      return;
    }

    const h2Match = trimmed.match(/^##\s+(.*)/);
    const h3Match = trimmed.match(/^###\s+(.*)/);

    if (h2Match) {
      closeList();
      const title = renderMarkdownInline(h2Match[1]);
      htmlResult += `<h2 class="chat-md-h2">${title}</h2>`;
      return;
    }

    if (h3Match) {
      closeList();
      const title = renderMarkdownInline(h3Match[1]);
      htmlResult += `<h3 class="chat-md-h3">${title}</h3>`;
      return;
    }

    const quoteMatch = trimmed.match(/^>\s*(.*)/);
    if (quoteMatch) {
      closeList();
      const quoteContent = renderMarkdownInline(quoteMatch[1]);
      htmlResult += `<blockquote class="chat-md-blockquote">${quoteContent}</blockquote>`;
      return;
    }

    const numMatch = trimmed.match(/^(\d+)[.)]\s*(.*)/);
    if (numMatch) {
      appendListItem('ol', numMatch[2]);
      return;
    }

    const bulletMatch = trimmed.match(/^([•\-*])\s*(.*)/);
    if (bulletMatch) {
      appendListItem('ul', bulletMatch[2]);
      return;
    }

    closeList();
    const content = renderMarkdownInline(trimmed);
    htmlResult += `<p class="chat-ai-paragraph">${content}</p>`;
  });

  closeList();
  htmlResult += '</div>';
  return DOMPurify.sanitize(htmlResult, {
    ALLOWED_TAGS: ['div', 'h2', 'h3', 'p', 'strong', 'em', 'mark', 'blockquote', 'hr', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['class'],
  });
}

function sanitizeAiMessageText(text) {
  if (!text) return '';
  let str = String(text).trim();

  // Strip markdown backticks block wrapper if any
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  // Check if text is raw JSON string or contains JSON fields
  if (str.startsWith('{') || str.includes('"reply":')) {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed.reply === 'string' && parsed.reply.trim().length > 0) {
        return parsed.reply.trim();
      }
    } catch {}
  }

  return str;
}

function FormattedChatMessage({ text, role }) {
  const cleanText = role === 'user' ? text : sanitizeAiMessageText(text);

  if (role === 'user') {
    return <div className="chat-msg-text">{cleanText}</div>;
  }

  const htmlContent = formatChatResponseToHtml(cleanText);
  return (
    <div
      className="chat-msg-text-rich"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}

/* ─── Floating AI Chat Panel with History Drawer ─── */
function AIChatPanel({ effectiveEmail, effectiveName, onPlanUpdate, onOpenNewPlanForm }) {
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isHidingScrollBtn, setIsHidingScrollBtn] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isClickScrollingRef = useRef(false);

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior
      });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: behavior === 'smooth' ? 'smooth' : 'auto' });
    }
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const scrollDifference = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (scrollDifference <= 70) {
      isClickScrollingRef.current = false;
      setShowScrollBottom(false);
      setIsHidingScrollBtn(false);
    } else if (!isClickScrollingRef.current && !isHidingScrollBtn) {
      setShowScrollBottom(true);
    }
  };

  // Load the conversation history exclusively from AWS DynamoDB.
  useEffect(() => {
    if (!effectiveEmail) return;
    let isMounted = true;
    setChatError('');
    fitmentorApi.getChatHistory(effectiveEmail)
      .then(res => {
        if (!isMounted) return;
        let cloudSessions = Array.isArray(res?.sessions) ? res.sessions : [];

        // If cloud only has legacy flat messages array
        if (cloudSessions.length === 0 && Array.isArray(res?.messages) && res.messages.length > 0) {
          const firstUser = res.messages.find(m => m.role === 'user');
          const initTitle = firstUser ? (firstUser.text.slice(0, 28) + (firstUser.text.length > 28 ? '...' : '')) : 'שיחה קודמת';
          cloudSessions = [{
            id: 'session_cloud',
            title: initTitle,
            updatedAt: Date.now(),
            messages: res.messages
          }];
        }

        if (cloudSessions.length > 0) {
          setSessions(cloudSessions);
          setActiveSessionId(prev => (cloudSessions.some(s => s.id === prev) ? prev : cloudSessions[0].id));
        } else {
          const newId = 'session_' + Date.now();
          const fresh = [{ id: newId, title: 'שיחה חדשה', updatedAt: Date.now(), messages: [] }];
          setSessions(fresh);
          setActiveSessionId(newId);
        }
      })
      .catch(err => {
        console.error('Error syncing cloud chat history:', err);
        if (isMounted) {
          setChatError(err?.message || 'טעינת היסטוריית השיחות מ-AWS נכשלה');
          const newId = 'session_' + Date.now();
          const fresh = [{ id: newId, title: 'שיחה חדשה', updatedAt: Date.now(), messages: [] }];
          setSessions(fresh);
          setActiveSessionId(newId);
        }
      });

    return () => { isMounted = false; };
  }, [effectiveEmail]);

  // Active session object & messages
  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) || sessions[0] || { id: 'default', messages: [] },
    [activeSessionId, sessions]
  );
  const currentMessages = useMemo(() => activeSession.messages || [], [activeSession]);

  // Scroll to bottom on message update
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom('smooth');
    }, 60);
    return () => clearTimeout(timer);
  }, [currentMessages, chatLoading]);

  // Focus input & scroll down when panel opens or view changes
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        scrollToBottom('auto');
      }, 100);
      if (inputRef.current && !showHistory) {
        inputRef.current.focus();
      }
      return () => clearTimeout(timer);
    }
  }, [isOpen, showHistory, activeSessionId]);

  // Lock body scroll when chat is maximized in fullscreen mode
  useEffect(() => {
    if (isOpen && isMaximized) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, isMaximized]);

  const updateAndSaveSessions = async (newList) => {
    if (!effectiveEmail) return;
    setChatError('');
    try {
      await fitmentorApi.saveChatHistory(effectiveEmail, newList);
      setSessions(newList);
    } catch (err) {
      console.error('Error saving chat history to AWS:', err);
      setChatError(err?.message || 'שמירת היסטוריית השיחות ב-AWS נכשלה');
    }
  };

  const handleNewChat = () => {
    const newId = 'session_' + Date.now();
    const newSession = {
      id: newId,
      title: 'שיחה חדשה',
      updatedAt: Date.now(),
      messages: []
    };
    const updated = [newSession, ...sessions];
    setActiveSessionId(newId);
    void updateAndSaveSessions(updated);
    setShowHistory(false);
  };

  const handleDeleteSession = (sessionId, e) => {
    if (e) e.stopPropagation();
    const updated = sessions.filter(s => s.id !== sessionId);
    if (updated.length === 0) {
      const newId = 'session_' + Date.now();
      const fresh = [{
        id: newId,
        title: 'שיחה חדשה',
        updatedAt: Date.now(),
        messages: []
      }];
      setActiveSessionId(newId);
      void updateAndSaveSessions(fresh);
    } else {
      if (activeSessionId === sessionId) {
        setActiveSessionId(updated[0].id);
      }
      void updateAndSaveSessions(updated);
    }
  };

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    const now = Date.now();
    const userMsgObj = { role: 'user', text: userMsg, timestamp: now };

    let sessionTitle = activeSession.title;
    if (!sessionTitle || sessionTitle === 'שיחה חדשה' || !activeSession.messages || activeSession.messages.length === 0) {
      sessionTitle = userMsg.slice(0, 28) + (userMsg.length > 28 ? '...' : '');
    }

    const updatedMessages = [...(activeSession.messages || []), userMsgObj];
    const updatedSession = {
      ...activeSession,
      title: sessionTitle,
      updatedAt: now,
      messages: updatedMessages
    };

    const updatedSessionsList = sessions.map(s => s.id === activeSession.id ? updatedSession : s);
    setSessions(updatedSessionsList);
    setChatError('');
    setChatLoading(true);

    try {
      const res = await fitmentorApi.chat(effectiveEmail, userMsg, effectiveName, updatedSessionsList, activeSession.id);
      if (!Array.isArray(res?.sessions) || !res?.activeSessionId || !res?.reply) throw new Error('AWS returned an invalid chat response');
      setSessions(res.sessions);
      setActiveSessionId(res.activeSessionId);
      if (res?.updatedPlanHtml) onPlanUpdate(res.updatedPlanHtml);
      if (res?.uiAction === 'openNewPlanForm') onOpenNewPlanForm();
    } catch (err) {
      setSessions(sessions);
      setChatInput(userMsg);
      const rawError = String(err?.message || '');
      const isInfrastructureError = /AWS|Unable to reach|Internal Server Error|invalid response/i.test(rawError);
      setChatError(isInfrastructureError
        ? 'DeepSeek לא החזיר תשובה כרגע. ההודעה נשמרה בשדה כדי שתוכל לנסות שוב.'
        : (rawError || 'השיחה עם DeepSeek נכשלה'));
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        className={`chat-fab ${isOpen ? 'chat-fab--open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="מאמן אישי AI"
        type="button"
      >
        {isOpen ? '✕' : '🤖'}
        {!isOpen && currentMessages.length === 0 && (
          <span className="chat-fab-pulse" />
        )}
      </button>

      {/* Fullscreen Backdrop when Maximized */}
      {isOpen && isMaximized && (
        <div className="chat-fullscreen-backdrop" onClick={() => setIsMaximized(false)} />
      )}

      {/* Chat Panel */}
      <div className={`chat-panel ${isOpen ? 'chat-panel--open' : ''} ${isMaximized ? 'chat-panel--fullscreen' : ''}`}>
        {/* Header */}
        <div className="chat-panel-header">
          <div className="chat-panel-header-info">
            <div className="chat-panel-avatar">🤖</div>
            <div>
              <div className="chat-panel-name">FitMentor AI</div>
              <div className="chat-panel-status">
                <span className="chat-status-dot" />
                DeepSeek עם נתוני AWS האישיים שלך
              </div>
            </div>
          </div>
          <div className="chat-header-right-btns">
            <button
              className="chat-panel-maximize"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "צמצם חלון" : "מסך מלא"}
              type="button"
            >
              {isMaximized ? '🗗' : '⤢'}
            </button>
            <button className="chat-panel-close" onClick={() => setIsOpen(false)} type="button">✕</button>
          </div>
        </div>

        {/* Sub Header Navigation Bar */}
        <div className="chat-sub-navbar">
          <div className="chat-nav-tabs">
            <button
              type="button"
              className={`chat-nav-tab ${!showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory(false)}
            >
              💬 צ'אט
            </button>
            <button
              type="button"
              className={`chat-nav-tab ${showHistory ? 'active' : ''}`}
              onClick={() => setShowHistory(true)}
            >
              📜 היסטוריה ({sessions.length})
            </button>
          </div>
          <button
            className="chat-btn-new-glow"
            onClick={handleNewChat}
            title="שיחה חדשה"
            type="button"
          >
            <span>+</span> שיחה חדשה
          </button>
        </div>

        {/* History Drawer Overlay (when history is opened) */}
        {showHistory ? (
          <div className="chat-history-drawer">
            <div className="chat-history-header">
              <h4>📜 היסטוריית שיחות ({sessions.length})</h4>
            </div>
            <div className="chat-history-list">
              {sessions.map(s => {
                const isActive = s.id === activeSessionId;
                const msgCount = (s.messages || []).length;
                const d = s.updatedAt ? new Date(s.updatedAt) : new Date();
                const dayMonth = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
                const timeStr = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                const dateFormatted = `${dayMonth} • ${timeStr}`;

                return (
                  <div
                    key={s.id}
                    className={`chat-history-item ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      setActiveSessionId(s.id);
                      setShowHistory(false);
                    }}
                  >
                    <div className="chat-history-item-main">
                      <div className="chat-history-icon-badge">💬</div>
                      <div className="chat-history-text">
                        <div className="chat-history-title-row">
                          <span className="chat-history-title">{s.title || 'שיחה ללא כותרת'}</span>
                          {isActive && <span className="chat-history-active-badge">פעילה</span>}
                        </div>
                        <div className="chat-history-meta">{dateFormatted} · {msgCount} הודעות</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="chat-history-delete-btn"
                      title="מחק שיחה זו"
                      onClick={(e) => handleDeleteSession(s.id, e)}
                    >
                      🗑️
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            {/* Messages Container with Floating Scroll-To-Bottom Arrow */}
            <div className="chat-messages-wrapper">
              <div
                className="chat-panel-messages"
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
              >
                {currentMessages.length === 0 && (
                  <div className="chat-welcome">
                    <div className="chat-welcome-icon">💪</div>
                    <h4>היי {effectiveName}!</h4>
                    <p>אני המאמן האישי שלך. שאל אותי כל שאלה על אימונים, תזונה, או בקש לשנות את התוכנית!</p>
                    <div className="chat-suggestions">
                      {['מה לאכול אחרי אימון?', 'איך לשפר סקוואט?', 'שנה תוכנית ל-4 ימים'].map((s, i) => (
                        <button key={i} className="chat-suggestion-chip" onClick={() => { setChatInput(s); }} type="button">{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {currentMessages.map((msg, idx) => (
                  <div key={idx} className={`chat-msg ${msg.role}`}>
                    <div className="chat-msg-avatar">
                      {msg.role === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="chat-msg-bubble">
                      <FormattedChatMessage text={msg.text} role={msg.role} />
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="chat-msg ai">
                    <div className="chat-msg-avatar">🤖</div>
                    <div className="chat-msg-bubble">
                      <div className="chat-typing">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                )}
                {chatError && (
                  <div className="chat-msg ai" role="alert">
                    <div className="chat-msg-avatar">⚠️</div>
                    <div className="chat-msg-bubble">{chatError}</div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {showScrollBottom && (
                <button
                  type="button"
                  className={`chat-scroll-bottom-btn ${isHidingScrollBtn ? 'hiding' : ''}`}
                  disabled={isHidingScrollBtn}
                  onClick={() => {
                    if (isHidingScrollBtn || isClickScrollingRef.current) return;
                    isClickScrollingRef.current = true;
                    setIsHidingScrollBtn(true);
                    scrollToBottom('smooth');
                    setTimeout(() => {
                      setShowScrollBottom(false);
                      setIsHidingScrollBtn(false);
                      isClickScrollingRef.current = false;
                    }, 650);
                  }}
                  title="רד לתחתית השיחה"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 4v16m-7-7l7 7 7-7" />
                  </svg>
                </button>
              )}
            </div>

            {/* Input */}
            <form className="chat-panel-input" onSubmit={handleSend}>
              <input
                ref={inputRef}
                type="text"
                placeholder="שאל את המאמן האישי..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={chatLoading}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
              </button>
            </form>
          </>
        )}
      </div>
    </>
  );
}

/* ─── Plan Builder Form Component ─── */
function PlanBuilderForm({ generating, onSubmit, onCancel }) {
  const [dAge, setDAge] = useState(25);
  const [dGender, setDGender] = useState('male');
  const [dWeight, setDWeight] = useState(70);
  const [dHeight, setDHeight] = useState(175);
  const [dFitnessLevel, setDFitnessLevel] = useState('beginner');
  const [dGoal, setDGoal] = useState('חיטוב וירידה במשקל');
  const [dDays, setDDays] = useState('3');
  const [dEquipment, setDEquipment] = useState('gym');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (generating) return;
    onSubmit({ age: dAge, gender: dGender, weight: dWeight, height: dHeight, fitnessLevel: dFitnessLevel, goal: dGoal, days: dDays, equipment: dEquipment });
  };

  return (
    <form onSubmit={handleSubmit} className="plan-builder-form">
      <div className="plan-form-grid">
        <div className="form-group">
          <label className="form-label">גיל</label>
          <input type="number" className="form-input" placeholder="25" min="13" max="100" value={dAge} onChange={e => setDAge(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">מגדר</label>
          <select className="form-select" value={dGender} onChange={e => setDGender(e.target.value)}>
            <option value="male">זכר</option>
            <option value="female">נקבה</option>
            <option value="other">אחר / מעדיף לא לציין</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">משקל (ק"ג)</label>
          <input type="number" className="form-input" placeholder="70" min="30" max="400" value={dWeight} onChange={e => setDWeight(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">גובה (ס"מ)</label>
          <input type="number" className="form-input" placeholder="175" min="120" max="230" value={dHeight} onChange={e => setDHeight(Number(e.target.value))} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">רמת כושר נוכחית</label>
        <select className="form-select" value={dFitnessLevel} onChange={e => setDFitnessLevel(e.target.value)}>
          <option value="beginner">מתחיל (0-6 חודשים)</option>
          <option value="intermediate">מתקדם (6 חודשים - שנתיים)</option>
          <option value="advanced">מקצועי (מעל שנתיים)</option>
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">מה המטרה העיקרית?</label>
        <select className="form-select" value={dGoal} onChange={e => setDGoal(e.target.value)}>
          <option value="חיטוב וירידה במשקל">🔥 חיטוב וירידה במשקל</option>
          <option value="עלייה במסת שריר">💪 עלייה במסת שריר (היפרטרופיה)</option>
          <option value="שיפור כושר כללי">🏃 שיפור כושר כללי וסיבולת</option>
          <option value="אימוני כוח">🏋️ אימוני כוח מירבי (Powerlifting)</option>
        </select>
      </div>

      <div className="plan-form-grid">
        <div className="form-group">
          <label className="form-label">כמה ימים בשבוע?</label>
          <select className="form-select" value={dDays} onChange={e => setDDays(e.target.value)}>
            <option value="2">2 פעמים</option>
            <option value="3">3 פעמים (מומלץ)</option>
            <option value="4">4 פעמים</option>
            <option value="5">5 פעמים</option>
            <option value="6">6 פעמים</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">ציוד זמין</label>
          <select className="form-select" value={dEquipment} onChange={e => setDEquipment(e.target.value)}>
            <option value="gym">🏢 חדר כושר מלא</option>
            <option value="dumbbells">🏠 משקולות יד</option>
            <option value="bodyweight">🌳 משקל גוף בלבד</option>
            <option value="minimal">🧰 ציוד ביתי מינימלי</option>
          </select>
        </div>
      </div>

      <div className="plan-form-actions">
        <button type="submit" className="btn-plan-generate" disabled={generating}>
          {generating ? (
            <>
              <span className="btn-spinner" />
              מייצר תוכנית בעזרת AI...
            </>
          ) : (
            <>צור תוכנית אימונים 🚀</>
          )}
        </button>
        {onCancel && (
          <button type="button" className="btn-plan-cancel" onClick={onCancel} disabled={generating}>ביטול</button>
        )}
      </div>
    </form>
  );
}


/* ═══════════════════════════════════════════════ */
/* ─── MAIN DASHBOARD PAGE ─── */
/* ═══════════════════════════════════════════════ */
function serializeDaysToHtml(days, intro, tips) {
  let html = '<div class="ai-plan-result">\n';
  if (intro) {
    html += `${intro}\n\n`;
  }

  (days || []).forEach((day) => {
    html += `<h3>${escapeHtml(day.title)}</h3>\n`;
    (day.exercises || []).forEach((ex) => {
      html += `<p>🏋️ <strong>${escapeHtml(ex.title)}</strong></p>\n`;

      const stats = [];
      if (ex.setsCount) stats.push(`<strong>סטים:</strong> ${escapeHtml(ex.setsCount)}`);
      if (ex.repsVal) stats.push(`<strong>חזרות:</strong> ${escapeHtml(ex.repsVal)}`);
      if (ex.restVal) stats.push(`<strong>מנוחה:</strong> ${escapeHtml(ex.restVal)}`);
      if (stats.length > 0) {
        html += `<p>${stats.join(' | ')}</p>\n`;
      }

      if (Array.isArray(ex.setWeights) && ex.setWeights.length > 0) {
        const setStr = ex.setWeights.map((w, idx) => `סט ${idx + 1}: ${escapeHtml(w)} ק"ג`).join(' | ');
        html += `<p><strong>משקל מומלץ:</strong> ${setStr}</p>\n`;
      } else if (ex.weightText) {
        html += `<p><strong>משקל מומלץ:</strong> ${escapeHtml(ex.weightText)}</p>\n`;
      }

      if (ex.technique) {
        html += `<p><strong>דגש טכניקה:</strong> ${escapeHtml(ex.technique)}</p>\n`;
      }
      if (ex.progression) {
        html += `<p><strong>התקדמות עומס:</strong> ${escapeHtml(ex.progression)}</p>\n`;
      }
      if (Array.isArray(ex.extraDetails) && ex.extraDetails.length > 0) {
        ex.extraDetails.forEach(det => {
          if (det) html += `<p>${escapeHtml(det)}</p>\n`;
        });
      }
      html += '\n';
    });
  });

  if (tips) {
    html += `<div class="plan-tips">\n${tips}\n</div>\n`;
  }
  html += '</div>';
  return html;
}

function EditableExerciseCard({ ex, dIdx, eIdx, onUpdateField, onUpdateWeight }) {
  return (
    <div className="editable-ex-card">
      <div className="editable-ex-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
          <span style={{ fontSize: '1.2rem' }}>🏋️</span>
          <input
            type="text"
            className="editable-ex-title-input"
            value={ex.title}
            onChange={(e) => onUpdateField(dIdx, eIdx, 'title', e.target.value)}
            placeholder="שם התרגיל"
          />
        </div>
      </div>

      <div className="editable-ex-badges-grid">
        <div className="editable-badge-field">
          <label className="editable-badge-label">סטים:</label>
          <input
            type="text"
            className="editable-badge-input"
            value={ex.setsCount}
            onChange={(e) => onUpdateField(dIdx, eIdx, 'setsCount', e.target.value)}
          />
        </div>
        <div className="editable-badge-field">
          <label className="editable-badge-label">חזרות:</label>
          <input
            type="text"
            className="editable-badge-input"
            value={ex.repsVal}
            onChange={(e) => onUpdateField(dIdx, eIdx, 'repsVal', e.target.value)}
          />
        </div>
        <div className="editable-badge-field">
          <label className="editable-badge-label">מנוחה:</label>
          <input
            type="text"
            className="editable-badge-input"
            value={ex.restVal}
            onChange={(e) => onUpdateField(dIdx, eIdx, 'restVal', e.target.value)}
          />
        </div>
      </div>

      <div className="editable-weights-box">
        <div className="editable-weights-header">
          <span>🏋️ משקלי עבודה מומלצים לפי סטים (ק"ג):</span>
        </div>
        <div className="editable-sets-row">
          {ex.setWeights.map((w, sIdx) => (
            <div key={sIdx} className="editable-set-item">
              <span>סט {sIdx + 1}:</span>
              <input
                type="number"
                step="0.5"
                className="editable-weight-input"
                value={w}
                onChange={(e) => onUpdateWeight(dIdx, eIdx, sIdx, e.target.value)}
              />
              <span>ק"ג</span>
            </div>
          ))}
        </div>
      </div>

      <div className="editable-text-group">
        <label className="editable-text-label">🎯 דגש טכניקה:</label>
        <textarea
          className="editable-textarea"
          value={ex.technique}
          onChange={(e) => onUpdateField(dIdx, eIdx, 'technique', e.target.value)}
          placeholder="דגשי טכניקה..."
        />
      </div>

      <div className="editable-text-group">
        <label className="editable-text-label">📈 מתי להעלות משקל או חזרות?</label>
        <textarea
          className="editable-textarea"
          value={ex.progression}
          onChange={(e) => onUpdateField(dIdx, eIdx, 'progression', e.target.value)}
          placeholder="מתי וכמה להעלות, ומה לעשות אם הטווח לא הושלם..."
        />
      </div>
    </div>
  );
}

function EditableDayCard({ day, dIdx, isOpen, onToggle, onUpdateField, onUpdateWeight }) {
  const dayIcons = ['🏋️', '💪', '🔥', '⚡', '🎯', '🚀', '🌟'];
  const icon = dayIcons[dIdx % dayIcons.length];

  return (
    <div className="plan-day-card" data-open={isOpen} style={{ borderColor: 'rgba(245, 158, 11, 0.4)' }}>
      <button className="plan-day-header" onClick={onToggle} type="button">
        <div className="plan-day-header-left">
          <span className="plan-day-icon">{icon}</span>
          <span className="plan-day-title">{day.title}</span>
        </div>
        <span className={`plan-day-chevron ${isOpen ? 'open' : ''}`}>‹</span>
      </button>

      {isOpen && (
        <div className="plan-day-body">
          {day.exercises.map((ex, eIdx) => (
            <EditableExerciseCard
              key={eIdx}
              ex={ex}
              dIdx={dIdx}
              eIdx={eIdx}
              onUpdateField={onUpdateField}
              onUpdateWeight={onUpdateWeight}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function DashboardPage({ user }) {
  const effectiveEmail = user?.email || '';
  const effectiveName = user?.name || user?.displayName || 'משתמש';

  const [planHtml, setPlanHtml] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [planParams, setPlanParams] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [isBuildingPlan, setIsBuildingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [openDayIndices, setOpenDayIndices] = useState({});
  const modalMouseDownRef = useRef(false);

  // Editable plan states
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [editableDays, setEditableDays] = useState([]);
  const [savingEdits, setSavingEdits] = useState(false);

  const pollForGeneratedPlan = useCallback(async (requestId, expectedDays) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 900000) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      const response = await fitmentorApi.getPlan(effectiveEmail);
      const generation = response?.generation;
      if (generation?.requestId !== requestId) continue;
      if (generation.status === 'error') {
        throw new Error(generation.message || 'DeepSeek לא הצליח ליצור תוכנית תקינה');
      }
      if (generation.status === 'complete' && response?.plan?.planHtml) {
        const structuredPlan = response.plan.planData
          ? validateStructuredPlanForDisplay(response.plan.planData, expectedDays)
          : null;
        return {
          planHtml: structuredPlan
            ? cleanPlanHtml(response.plan.planHtml)
            : validatePlanForDisplay(response.plan.planHtml, expectedDays),
          planData: structuredPlan,
          params: response.plan.params,
        };
      }
    }
    throw new Error('יצירת התוכנית לא הסתיימה בזמן. לא נשמרו נתוני דמה.');
  }, [effectiveEmail]);

  const loadPlan = useCallback(async () => {
    setLoadingPlan(true);
    setPlanError('');
    let loadedPlanHtml = null;
    try {
      const res = await fitmentorApi.getPlan(effectiveEmail);
      if (res?.plan?.planHtml) {
        try {
          const structuredPlan = res.plan.planData
            ? validateStructuredPlanForDisplay(res.plan.planData, Number(res.plan?.params?.days))
            : null;
          loadedPlanHtml = structuredPlan
            ? cleanPlanHtml(res.plan.planHtml)
            : validatePlanForDisplay(res.plan.planHtml, Number(res.plan?.params?.days));
          setPlanHtml(loadedPlanHtml);
          setPlanData(structuredPlan);
          setPlanParams(res.plan.params);
        } catch (validationError) {
          console.warn('Saved plan validation failed:', validationError);
          setPlanHtml(null);
          setPlanData(null);
          setPlanParams(null);
          setPlanError(validationError?.message || 'תוכנית האימון השמורה אינה תקינה');
        }
      } else {
        setPlanHtml(null);
        setPlanData(null);
        setPlanParams(null);
      }

      if (res?.generation?.status === 'processing' && res.generation.requestId) {
        setIsBuildingPlan(true);
        const generated = await pollForGeneratedPlan(res.generation.requestId, Number(res.generation.days));
        setPlanHtml(generated.planHtml);
        setPlanData(generated.planData);
        setPlanParams(generated.params);
      }
    } catch (err) {
      console.error('Error loading plan:', err);
      if (!loadedPlanHtml) setPlanHtml(null);
      setPlanError(err?.message || 'טעינת התוכנית מ-AWS נכשלה');
    } finally {
      setIsBuildingPlan(false);
      setLoadingPlan(false);
    }
  }, [effectiveEmail, pollForGeneratedPlan]);

  useEffect(() => {
    if (effectiveEmail) {
      loadPlan();
    }
  }, [effectiveEmail, loadPlan]);

  const startEditingPlan = () => {
    if (planData) {
      const structuredDays = structuredPlanToDisplayDays(planData).map((day) => ({
        title: day.title,
        exercises: day.exercises.map((exercise) => {
          const setsBadge = exercise.statsBadges.find(badge => badge.label === 'סטים');
          const prescriptionBadge = exercise.statsBadges.find(badge => badge.label === 'חזרות' || badge.label === 'משך');
          const restBadge = exercise.statsBadges.find(badge => badge.label === 'מנוחה');
          return {
            title: exercise.title,
            setsCount: setsBadge?.val || '',
            repsVal: prescriptionBadge?.val || '',
            restVal: restBadge?.val || '',
            setWeights: [...exercise.setWeights],
            weightText: exercise.weightText,
            technique: exercise.technique,
            progression: exercise.progression,
            extraDetails: [],
          };
        }),
      }));
      setEditableDays(structuredDays);
      setIsEditingPlan(true);
      const allOpen = {};
      structuredDays.forEach((_, index) => { allOpen[index] = true; });
      setOpenDayIndices(allOpen);
      return;
    }
    const parsed = parsePlanIntoDays(cleanPlanHtml(planHtml));
    const daysWithStructuredExercises = (parsed.days || []).map(day => ({
      title: day.title,
      exercises: parseExercisesFromContent(day.content).map(ex => {
        const sBadge = ex.statsBadges?.find(b => b.label === 'סטים');
        const rBadge = ex.statsBadges?.find(b => b.label === 'חזרות');
        const mBadge = ex.statsBadges?.find(b => b.label === 'מנוחה');
        return {
          title: ex.title,
          setsCount: sBadge?.val || '',
          repsVal: rBadge?.val || '',
          restVal: mBadge?.val || '',
          setWeights: Array.isArray(ex.setWeights) ? [...ex.setWeights] : [],
          weightText: ex.weightText || '',
          technique: ex.technique || '',
          progression: ex.progression || '',
          extraDetails: Array.isArray(ex.extraDetails) ? [...ex.extraDetails] : []
        };
      })
    }));
    setEditableDays(daysWithStructuredExercises);
    setIsEditingPlan(true);
    const allOpen = {};
    (parsed.days || []).forEach((_, i) => { allOpen[i] = true; });
    setOpenDayIndices(allOpen);
  };

  const handleSavePlanEdits = async () => {
    setSavingEdits(true);
    try {
      const safeCurrentPlan = cleanPlanHtml(planHtml);
      const parsed = parsePlanIntoDays(safeCurrentPlan);
      const tipsMatch = safeCurrentPlan.match(/<div\s+class=["']plan-tips["'][^>]*>([\s\S]*?)<\/div>/i);
      if (!tipsMatch?.[1]) throw new Error('חסרים טיפים מקוריים בתוכנית');
      const newHtml = validatePlanForDisplay(
        serializeDaysToHtml(editableDays, parsed.intro, tipsMatch[1]),
        Number(planParams?.days)
      );
      const response = await fitmentorApi.savePlan(effectiveEmail, newHtml, planParams);
      setPlanHtml(validatePlanForDisplay(response?.plan?.planHtml, Number(planParams?.days)));
      setPlanData(null);
      setPlanError('');
      setIsEditingPlan(false);
    } catch (err) {
      console.error('Error saving plan edits:', err);
      setPlanError(err?.message || 'שגיאה בשמירת השינויים בתוכנית');
    } finally {
      setSavingEdits(false);
    }
  };

  const handleCancelPlanEdits = () => {
    setIsEditingPlan(false);
    setEditableDays([]);
  };

  const updateExerciseField = (dIdx, eIdx, field, val) => {
    setEditableDays(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      copy[dIdx].exercises[eIdx][field] = val;
      return copy;
    });
  };

  const updateSetWeight = (dIdx, eIdx, setIdx, val) => {
    setEditableDays(prev => {
      const copy = JSON.parse(JSON.stringify(prev));
      const num = Number(val);
      copy[dIdx].exercises[eIdx].setWeights[setIdx] = val === '' || Number.isNaN(num) ? '' : num;
      return copy;
    });
  };

  const handleCreatePlan = async (params) => {
    const previousPlanHtml = planHtml;
    const previousPlanData = planData;
    const previousPlanParams = planParams;
    setGenerating(true);
    setIsBuildingPlan(true);
    setPlanError('');
    setPlanHtml(null);
    setPlanData(null);
    const reqDays = Number(params?.days);
    try {
      const response = await fitmentorApi.generatePlan(effectiveEmail, params);
      if (response?.status !== 'processing' || !response?.requestId) throw new Error('AWS לא התחיל את יצירת התוכנית');
      const generated = await pollForGeneratedPlan(response.requestId, reqDays);
      setPlanHtml(generated.planHtml);
      setPlanData(generated.planData);
      setPlanParams(generated.params);
      setIsBuildingPlan(false);
      setShowNewPlanModal(false);
      setOpenDayIndices({});
    } catch (err) {
      console.error('AI plan generation failed:', err);
      setPlanHtml(previousPlanHtml);
      setPlanData(previousPlanData);
      setPlanParams(previousPlanParams);
      setPlanError(err?.message || 'DeepSeek לא הצליח ליצור תוכנית תקינה');
    } finally {
      setIsBuildingPlan(false);
      setGenerating(false);
    }
  };

  const handlePrintPlan = () => {
    if (planDays.length > 0) {
      const allObj = {};
      planDays.forEach((_, idx) => { allObj[idx] = true; });
      setOpenDayIndices(allObj);
    }
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // New plans render from DeepSeek's validated structured response. HTML parsing
  // remains only for plans saved before the structured contract was introduced.
  const parsedPlan = planData
    ? { intro: null, days: [] }
    : parsePlanIntoDays(cleanPlanHtml(planHtml));
  const planDays = planData
    ? structuredPlanToDisplayDays(planData)
    : (parsedPlan.days || []);
  const planIntro = parsedPlan.intro || null;

  return (
    <>
      <main className="hero dashboard-page dashboard-typography" style={{ paddingTop: '120px', paddingBottom: '100px', minHeight: '100vh' }}>
        <div className="container hero-content" style={{ width: '100%', maxWidth: '920px' }}>
          {/* Title */}
          <div className="dashboard-header-welcome" style={{ marginBottom: '16px' }}>
            <h1 className="hero-title" style={{ marginBottom: '6px' }}>
              <span className="gradient-text" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.4rem)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35em', fontWeight: 900 }}>
                <span>שלום {effectiveName}!</span>
                <span
                  className="dash-hello-wave"
                  style={{ display: 'inline-block', WebkitBackgroundClip: 'initial', backgroundClip: 'initial', color: '#fbbf24', textShadow: 'none' }}
                  aria-hidden="true"
                >👋</span>
              </span>
              <span className="hero-title-main" style={{ fontSize: '1.25rem', letterSpacing: '0.5px', opacity: 0.9 }}>
                תוכנית האימונים והמאמן האישי שלך
              </span>
            </h1>
          </div>
          <p className="hero-subtitle" style={{ opacity: 1, animation: 'none', marginBottom: '35px', fontSize: '1.15rem' }}>
            כאן תוכל לצפות בתוכנית האימונים המותאמת אישית ולשוחח עם מאמן ה-AI שלך 24/7!
          </p>

          {planError && (
            <div className="dash-empty-state" role="alert" style={{ marginBottom: '24px' }}>
              <div className="dash-empty-icon">⚠️</div>
              <h2>לא ניתן להציג תוכנית</h2>
              <p>{planError}</p>
            </div>
          )}

          {/* 1. Loader State */}
          {loadingPlan && (
            <div className="dash-loader">
              <div className="dash-loader-ring">
                <div className="dash-loader-ring-inner" />
              </div>
              <h3>טוען את התוכנית שלך...</h3>
              <p>בודק אם קיימת תוכנית אימונים עבורך</p>
            </div>
          )}

          {/* 2. No Plan State */}
          {!loadingPlan && !planHtml && !isBuildingPlan && !planError && (
            <div className="dash-empty-state">
              <div className="dash-empty-icon">🏋️</div>
              <h2>עדיין אין לך תוכנית אימונים</h2>
              <p>בוא ניצור תוכנית מותאמת אישית בעזרת AI בכמה שניות!</p>
              <button className="btn-plan-generate" onClick={() => setIsBuildingPlan(true)} style={{ marginTop: '20px' }}>
                התחל בבניית תוכנית 🚀
              </button>
            </div>
          )}

          {/* 3. Plan Builder Form State */}
          {!loadingPlan && !planHtml && isBuildingPlan && (
            <div className="dash-builder">
              <div className="dash-builder-header">
                <div className="dash-builder-icon">⚡</div>
                <div>
                  <h2>בניית תוכנית אימונים</h2>
                  <p>מלא פרטים כדי שה-AI יבנה תוכנית מותאמת אישית</p>
                </div>
              </div>
              <PlanBuilderForm
                generating={generating}
                onSubmit={handleCreatePlan}
                onCancel={() => setIsBuildingPlan(false)}
              />
            </div>
          )}

          {/* 4. Active Plan Display */}
          {!loadingPlan && planHtml && (
            <>
            <div id="printPlanWrapper">
              {/* Single Unified Header Card */}
              <div className="plan-unified-header-card">
                {/* User Hero Banner */}
                <div className="plan-user-banner">
                  <div className="plan-user-avatar">
                    <span>{effectiveName ? effectiveName[0].toUpperCase() : '🏋️'}</span>
                  </div>
                  <div className="plan-user-info">
                    <h2 className="plan-user-title">תוכנית האימונים של {effectiveName}</h2>
                    <p className="plan-user-subtitle">מדריך ביצוע מקיף, דגשי טכניקה מדויקים והוראות עומס להתקדמות מרבית</p>
                  </div>
                </div>

                <div className="plan-header-divider" />

                {/* Action Bar */}
                <div className="dash-action-bar">
                  <div className="dash-action-bar-title">
                    <h2>📋 פירוט ימי האימונים</h2>
                  </div>
                  <div className="dash-action-bar-buttons">
                    {!isEditingPlan ? (
                      <>
                        <button className="dash-action-btn dash-action-btn--edit" onClick={startEditingPlan}>
                          ✏️ עריכת תוכנית
                        </button>
                        <button className="dash-action-btn" onClick={handlePrintPlan}>
                          🖨️ הדפס תוכנית
                        </button>
                        <button className="dash-action-btn dash-action-btn--primary" onClick={() => setShowNewPlanModal(true)}>
                          ✨ תוכנית חדשה
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="dash-action-btn dash-action-btn--save" onClick={handleSavePlanEdits} disabled={savingEdits}>
                          {savingEdits ? '⏳ שומר...' : '💾 שמור שינויים'}
                        </button>
                        <button className="dash-action-btn dash-action-btn--cancel" onClick={handleCancelPlanEdits}>
                          ❌ ביטול
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Plan Intro Summary */}
                {planIntro && (
                  <>
                    <div className="plan-header-divider" />
                    <div className="plan-intro-section" dangerouslySetInnerHTML={{ __html: planIntro }} />
                  </>
                )}
              </div>

              {/* Edit Mode Banner */}
              {isEditingPlan && (
                <div className="plan-edit-banner">
                  <span>✏️ מצב עריכה פעיל — ערוך את פרטי שלושת התרגילים תוך שמירה על מבנה התוכנית.</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="dash-action-btn dash-action-btn--save" onClick={handleSavePlanEdits} disabled={savingEdits}>
                      {savingEdits ? '⏳ שומר...' : '💾 שמור שינויים'}
                    </button>
                    <button className="dash-action-btn dash-action-btn--cancel" onClick={handleCancelPlanEdits}>
                      ❌ ביטול
                    </button>
                  </div>
                </div>
              )}

              {/* Validated accordion days or constrained editable view */}
              {isEditingPlan ? (
                <div className="plan-days-container">
                  {editableDays.map((day, dIdx) => (
                    <EditableDayCard
                      key={dIdx}
                      day={day}
                      dIdx={dIdx}
                      isOpen={Boolean(openDayIndices[dIdx])}
                      onToggle={() => setOpenDayIndices(prev => ({ ...prev, [dIdx]: !prev[dIdx] }))}
                      onUpdateField={updateExerciseField}
                      onUpdateWeight={updateSetWeight}
                    />
                  ))}
                </div>
              ) : planDays.length > 0 ? (
                <div className="plan-days-container">
                  {planDays.map((day, idx) => (
                    <PlanDayCard
                      key={idx}
                      day={day}
                      index={idx}
                      isOpen={Boolean(openDayIndices[idx])}
                      onToggle={() => setOpenDayIndices(prev => ({ ...prev, [idx]: !prev[idx] }))}
                    />
                  ))}
                </div>
              ) : <div className="plan-validation-error">לא ניתן להציג תוכנית שמבנהּ אינו תקין.</div>}

              {/* Quick tip card */}
              <div className="dash-tip-card">
                <span className="dash-tip-icon">💡</span>
                <span>טיפ: לחץ על כפתור ה-AI למטה מימין כדי לשנות את התוכנית, לשאול שאלות על תזונה או לקבל ייעוץ אישי!</span>
              </div>
            </div>

            <PrintablePlan
              name={effectiveName}
              intro={planIntro}
              days={planDays}
            />
            </>
          )}
        </div>
      </main>

      {/* Floating AI Chat (always rendered when plan exists or building) */}
      {!loadingPlan && (
        <AIChatPanel
          effectiveEmail={effectiveEmail}
          effectiveName={effectiveName}
          onPlanUpdate={(updatedHtml) => {
            setPlanHtml(updatedHtml);
            setPlanData(null);
          }}
          onOpenNewPlanForm={() => setShowNewPlanModal(true)}
        />
      )}

      {/* New Plan Modal */}
      {showNewPlanModal && (
        <div
          className="fm-modal"
          onMouseDown={(e) => {
            modalMouseDownRef.current = (e.target === e.currentTarget);
          }}
          onClick={(e) => {
            if (!generating && e.target === e.currentTarget && modalMouseDownRef.current) {
              setShowNewPlanModal(false);
            }
          }}
        >
          <div
            className="fm-modal-content"
            style={{ textAlign: 'right' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="fm-modal-close"
              onClick={() => setShowNewPlanModal(false)}
              disabled={generating}
              aria-label={generating ? 'לא ניתן לסגור בזמן יצירת התוכנית' : 'סגירת החלון'}
            >×</button>
            <h2 className="fm-modal-title">בקשת תוכנית חדשה</h2>
            <p className="fm-modal-subtitle">עדכן פרטים כדי שה-AI יבנה לך תוכנית חדשה</p>
            <PlanBuilderForm
              generating={generating}
              onSubmit={handleCreatePlan}
              onCancel={() => setShowNewPlanModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

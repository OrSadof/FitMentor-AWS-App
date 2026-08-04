import React, { useState, useEffect, useRef } from 'react';
import { fitmentorApi } from '../api/fitmentorApi';

/* ─── Helper: clean AI-generated plan HTML ─── */
function cleanPlanHtml(html) {
  if (!html) return '';
  let cleaned = html;
  // Strip markdown code fences: ```html ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:html)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  cleaned = cleaned.replace(/```(?:html)?\s*\n/gi, '');
  cleaned = cleaned.replace(/\n\s*```/gi, '');
  return cleaned.trim();
}

/* ─── Helper: parse plan HTML/text into day-sections ─── */
function parsePlanIntoDays(html) {
  if (!html) return [];

  const cleaned = html.replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();

  // Strict Day Header Regex:
  // MUST start with an HTML header tag (<h1-4>), markdown header (###), bold header (**), or be at the very start of a line.
  // Must NOT match inline words like "3 ימי אימון בשבוע" inside regular paragraphs (<p>).
  const dayHeaderRegex = /(?:<h[1-4][^>]*>|###?\s*|^\s*\*\*\s*|^|\n)\s*(?:<\w+[^>]*>)*\s*((?:יום|אימון|Day|Workout)\s*(?:\d+|[א-ת]['']?|[A-Z]|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)[^<\n*]*)/gi;

  const matches = [];
  let match;
  while ((match = dayHeaderRegex.exec(cleaned)) !== null) {
    const rawMatchText = match[1] || match[0];
    const candidate = rawMatchText.replace(/<[^>]*>/g, '').replace(/\*+/g, '').trim();

    // Exclude false positives like "3 ימי אימון בשבוע"
    const isFalsePositive = candidate.includes('אימון בשבוע') || candidate.includes('ימי אימון') || candidate.includes('במטרת');

    if (candidate.length >= 3 && candidate.length < 110 && !isFalsePositive) {
      if (!matches.some(m => Math.abs(m.index - match.index) < 10)) {
        matches.push({
          title: candidate,
          index: match.index,
          fullLength: match[0].length
        });
      }
    }
  }

  // Fallback: If fewer than 2 days matched with keywords, try splitting by <h2> or <h3> HTML tags
  if (matches.length < 2) {
    const hRegex = /<h[2-3][^>]*>(.*?)<\/h[2-3]>/gi;
    const hMatches = [];
    while ((match = hRegex.exec(cleaned)) !== null) {
      const titleText = match[1].replace(/<[^>]*>/g, '').trim();
      const isFalsePos = titleText.includes('אימון בשבוע') || titleText.includes('ימי אימון');
      if (titleText.length > 2 && titleText.length < 100 && !isFalsePos) {
        hMatches.push({
          title: titleText,
          index: match.index,
          fullLength: match[0].length
        });
      }
    }
    if (hMatches.length >= 2) {
      matches.length = 0;
      matches.push(...hMatches);
    }
  }

  if (matches.length === 0) return { intro: null, days: [] }; // Fallback to raw plan view

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
    const title = matches[i].title;
    const contentStart = matches[i].index + matches[i].fullLength;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].index : cleaned.length;
    const rawContent = cleaned.substring(contentStart, contentEnd).trim();

    days.push({
      title,
      content: rawContent
    });
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
  // Fallback: bare kg values separated by separators
  const sep = line.match(/(\d+(?:[.,]\d+)?)\s*(?:ק"ג|kg)/gi);
  if (sep) return sep.map(s => Number(s.replace(/[^\d.,]/g, '').replace(',', '.')));
  return null;
}

/* ─── Exercise Parser & Structured Formatter ─── */
function parseExercisesFromContent(rawContent) {
  if (!rawContent) return [];

  const cleanStr = str => str ? str.replace(/<[^>]*>/g, '').replace(/\*+/g, '').trim() : '';

  // Standardize tag breaks into newlines
  const tagBreakRegex = new RegExp('</p>|<br\\s*/?>|</h[1-6]>|</li>|</div>', 'gi');
  const stripTagRegex = new RegExp('<[^>]*>', 'g');
  const formattedText = rawContent
    .replace(tagBreakRegex, '\n')
    .replace(stripTagRegex, ' ');

  const lines = formattedText
    .split('\n')
    .map(l => cleanStr(l))
    .filter(l => l.length > 0);

  const exercises = [];
  let currentEx = null;

  lines.forEach(line => {
    // Check if line is an Exercise Header
    const isHeader = line.includes('🏋️') ||
      (/^(?:תרגיל|\d+[\.\)]|לחיצת|סקוואט|דדליפט|משכת|מתח|חתירה|כפילת|פשיטת|הרמת|מכרעים|פלאנק|רומניאן|מקבילים)/.test(line) && !line.includes(':'));

    if (isHeader) {
      if (currentEx) exercises.push(currentEx);
      currentEx = {
        title: line.replace(/^🏋️\s*/, '').trim(),
        statsBadges: [],
        technique: '',
        progression: '',
        extraDetails: [],
        setWeights: []
      };
      return;
    }

    if (!currentEx) {
      currentEx = {
        title: line.includes('יום') ? 'תרגילי האימון' : line,
        statsBadges: [],
        technique: '',
        progression: '',
        extraDetails: [],
        setWeights: []
      };
      return;
    }

    // Parse Recommended Weight per set (KG) – provided by the AI in the plan
    if (line.includes('משקל') || /^weight\s*[:\-]/i.test(line)) {
      const setWeights = parseSetWeightsFromLine(line);
      if (setWeights && setWeights.length > 0) {
        currentEx.setWeights = setWeights;
      } else {
        currentEx.extraDetails.push(line);
      }
      return;
    }

    // Parse Technique Focus
    if (line.includes('דגש טכניקה') || line.includes('טכניקה:')) {
      currentEx.technique = line.replace(/^.*(?:דגש טכניקה|טכניקה)\s*[:\-]\s*/, '').trim();
      return;
    }

    // Parse Progressive Overload Focus
    if (line.includes('התקדמות עומס') || line.includes('עומס:')) {
      currentEx.progression = line.replace(/^.*(?:התקדמות עומס|עומס)\s*[:\-]\s*/, '').trim();
      return;
    }

    // Parse Stats (סטים, חזרות, מנוחה)
    if ((line.includes('סטים') || line.includes('חזרות') || line.includes('מנוחה')) && !line.includes('העלה') && !line.includes('כשתבצע')) {
      const parts = line.split(/\||;/);
      parts.forEach(p => {
        const trimmedP = p.trim();
        if (trimmedP.includes('סטים')) {
          const val = trimmedP.replace(/^.*סטים\s*[:\-]?\s*/, '').trim();
          if (val && !currentEx.statsBadges.some(b => b.label === 'סטים')) {
            currentEx.statsBadges.push({ label: 'סטים', val, type: 'cyan' });
          }
        } else if (trimmedP.includes('חזרות')) {
          const val = trimmedP.replace(/^.*חזרות\s*[:\-]?\s*/, '').trim();
          const cleanVal = val.replace(/\s+/g, ' ').replace(/^[\s\.\,]+|[\s\.\,]+$/g, '');
          if (cleanVal && !['נקיות', '.', 'נקיות.'].includes(cleanVal) && !currentEx.statsBadges.some(b => b.label === 'חזרות')) {
            currentEx.statsBadges.push({ label: 'חזרות', val: cleanVal, type: 'emerald' });
          }
        } else if (trimmedP.includes('מנוחה')) {
          const val = trimmedP.replace(/^.*מנוחה\s*[:\-]?\s*/, '').trim();
          if (val && !currentEx.statsBadges.some(b => b.label === 'מנוחה')) {
            currentEx.statsBadges.push({ label: 'מנוחה', val, type: 'purple' });
          }
        } else if (trimmedP.length > 0) {
          currentEx.extraDetails.push(trimmedP);
        }
      });
      return;
    }

    currentEx.extraDetails.push(line);
  });

  if (currentEx) exercises.push(currentEx);
  return exercises;
}

/* ─── Helper: recommend a starting weight (KG) per exercise ───
   Auto-computed from the user's body weight and fitness level.
   Returns null for bodyweight-only movements or when no weight is known. */
function getExerciseWeightPct(title) {
  const t = (title || '').toLowerCase();

  // Bodyweight-only movements – no external load needed
  if (/(פלאנק|plank|כפיפות בטן|crunch|שכיבות|push-?up|תלייה|הרמת (ברכיים|רגליים)|ליבה|core|סופרמן|jumping)/.test(t)) return null;

  // Lower-body compound lifts – heaviest relative to body weight
  if (/(סקוואט|squat|דדליפט|deadlift|leg ?press|לחיצת רגליים|thrust|glute|חטיפה)/.test(t)) return 0.9;

  // Chest press
  if (/(לחיצת חזה|bench|chest)/.test(t)) return 0.6;

  // Back: rows / pulldowns / pull-ups
  if (/(חתירה|row|משיכת פולי|pulldown|lat|מתח|pull-?up|chin)/.test(t)) return 0.55;

  // Shoulders: overhead press
  if (/(לחיצת כתפיים|shoulder|overhead|military)/.test(t)) return 0.4;

  // Legs isolation / lunges / calves
  if (/(מכרעים|lunge|כפילת ברכיים|leg ?curl|פשיטת ברכיים|leg ?extension|עקבים|calf|הרמת אגן|glute bridge)/.test(t)) return 0.35;

  // Arms isolation (biceps / triceps)
  if (/(כפילת|bicep|יד קדמית|פשיטת|tricep|יד אחורית|hammer|פטיש)/.test(t)) return 0.2;

  // Lateral raises
  if (/(הרחקת|lateral|side.?raise)/.test(t)) return 0.1;

  // Default for unclassified movements
  return 0.4;
}

function roundToPlate(kg) {
  return Math.max(1, Math.round(kg / 2.5) * 2.5);
}

// Compute a per-set weight ramp for a given number of sets: set 1 starts at the
// base weight and each following set adds a plate (2.5 kg) – a gradual build-up.
function computePerSetWeights(name, bodyWeightKg, fitnessLevel, numSets) {
  const pct = getExerciseWeightPct(name);
  if (pct === null || !bodyWeightKg || bodyWeightKg <= 0) return null;

  const levelFactor = { beginner: 0.8, intermediate: 1.0, advanced: 1.25 }[fitnessLevel] || 1.0;
  const base = roundToPlate(bodyWeightKg * pct * levelFactor);

  const count = Math.max(1, numSets || 1);
  return Array.from({ length: count }, (_, i) => Math.max(2.5, roundToPlate(base + i * 2.5)));
}

function getSuggestedSetWeights(exercise, bodyWeightKg, fitnessLevel) {
  const setsBadge = (exercise.statsBadges || []).find(b => b.label === 'סטים');
  const numSets = parseInt(String(setsBadge?.val || '3').replace(/[^\d]/g, ''), 10) || 3;
  return computePerSetWeights(exercise.title, bodyWeightKg, fitnessLevel, numSets);
}

function PlanExerciseItem({ ex, bodyWeightKg, fitnessLevel }) {
  const [isOpen, setIsOpen] = useState(false);
  // Prefer the exact per-set weights the AI provided in the plan; otherwise fall
  // back to auto-computed weights based on bodyweight & fitness level.
  const setWeights = (ex.setWeights && ex.setWeights.length > 0)
    ? ex.setWeights
    : getSuggestedSetWeights(ex, bodyWeightKg, fitnessLevel);

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

          {/* Recommended weight per set */}
          {setWeights && (
            <div className="plan-ex-weights">
              <span className="plan-ex-weights-label">🏋️ משקל מומלץ:</span>
              <div className="plan-ex-weights-sets">
                {setWeights.map((w, i) => (
                  <span key={i} className="plan-ex-weight-set">סט {i + 1} — {w} ק"ג</span>
                ))}
              </div>
            </div>
          )}

          {/* Technique Focus Box */}
          {ex.technique && (
            <div className="plan-ex-box plan-ex-box--tech">
              <div className="plan-ex-box-title">
                <span className="box-icon">🎯</span>
                <span>דגש טכניקה:</span>
              </div>
              <p className="plan-ex-box-text">{ex.technique}</p>
            </div>
          )}

          {/* Progressive Overload Box */}
          {ex.progression && (
            <div className="plan-ex-box plan-ex-box--prog">
              <div className="plan-ex-box-title">
                <span className="box-icon">📈</span>
                <span>התקדמות עומס:</span>
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

function RenderFormattedDayContent({ rawContent, bodyWeightKg, fitnessLevel }) {
  if (!rawContent) return null;

  const exercises = parseExercisesFromContent(rawContent);

  if (exercises.length === 0) {
    return <div className="plan-day-raw-fallback" dangerouslySetInnerHTML={{ __html: rawContent }} />;
  }

  return (
    <div className="plan-exercises-list">
      {exercises.map((ex, i) => (
        <PlanExerciseItem key={i} ex={ex} bodyWeightKg={bodyWeightKg} fitnessLevel={fitnessLevel} />
      ))}
    </div>
  );
}

/* ─── Plan Day Accordion Card ─── */
function PlanDayCard({ day, index, isOpen, onToggle, bodyWeightKg, fitnessLevel }) {
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
          <RenderFormattedDayContent rawContent={day.content} bodyWeightKg={bodyWeightKg} fitnessLevel={fitnessLevel} />
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
function PrintablePlan({ name, intro, days, rawHtml, bodyWeightKg, fitnessLevel }) {
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
          const exercises = parseExercisesFromContent(day.content);
          return (
            <section className="pp-day" key={idx}>
              <div className="pp-day-header">
                <span className="pp-day-badge">יום {idx + 1}</span>
                <h2 className="pp-day-title">{day.title}</h2>
              </div>

              {exercises.length === 0 ? (
                <div className="pp-day-raw" dangerouslySetInnerHTML={{ __html: day.content }} />
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
                        const reps = findBadge(ex, 'חזרות');
                        const rest = findBadge(ex, 'מנוחה');
                        const weights = (ex.setWeights && ex.setWeights.length > 0)
                          ? ex.setWeights
                          : getSuggestedSetWeights(ex, bodyWeightKg, fitnessLevel);
                        const weightStr = weights
                          ? (new Set(weights).size === 1 ? `${weights[0]}` : weights.join(' / '))
                          : '—';
                        return (
                          <tr key={j}>
                            <td className="pp-col-num">{j + 1}</td>
                            <td className="pp-col-ex">
                              <div className="pp-ex-name">{ex.title}</div>
                              {ex.technique && <div className="pp-ex-detail"><span className="pp-detail-tag">דגש טכניקה</span>{ex.technique}</div>}
                              {ex.progression && <div className="pp-ex-detail"><span className="pp-detail-tag">התקדמות עומס</span>{ex.progression}</div>}
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
        /* Fallback: raw plan HTML when day-parsing failed */
        <section className="pp-day">
          <div className="pp-day-header">
            <h2 className="pp-day-title">תוכנית האימונים</h2>
          </div>
          <div className="pp-day-raw" dangerouslySetInnerHTML={{ __html: rawHtml }} />
        </section>
      )}
    </div>
  );
}

/* ─── Clean & Elegant HTML Formatter for AI Chat Messages ─── */
function renderMarkdownInline(str) {
  if (!str) return '';
  let formatted = str;
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="chat-bold-highlight">$1</strong>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="chat-italic-highlight">$1</em>');
  formatted = formatted.replace(/(\b\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\s*(?:ק"ג|קילו|חזרות|סטים|שניות|קג)\b)/g, '<span class="chat-stat-pill">$1</span>');
  return formatted;
}

function formatChatResponseToHtml(text) {
  if (!text) return '';

  if (/<(div|h2|h3|blockquote|p|ul|ol)\b[^>]*>/i.test(text)) {
    return text;
  }

  let raw = text;
  raw = raw.replace(/\s+(#{2,3}\s+)/g, '\n$1');
  raw = raw.replace(/\s+(---|[*]{3})\s*/g, '\n$1\n');
  raw = raw.replace(/\s+(\d+[\.\)])\s+/g, '\n$1 ');
  raw = raw.replace(/\s+([•\-\*])\s+/g, '\n$1 ');

  const lines = raw.split('\n');
  let htmlResult = '<div class="chat-markdown-container">';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (/^(---|[*]{3})$/.test(trimmed)) {
      htmlResult += '<hr class="chat-md-divider" />';
      return;
    }

    const h2Match = trimmed.match(/^##\s+(.*)/);
    const h3Match = trimmed.match(/^###\s+(.*)/);

    if (h2Match) {
      const title = renderMarkdownInline(h2Match[1]);
      htmlResult += `<h2 class="chat-md-h2"><span>${title}</span></h2>`;
      return;
    }

    if (h3Match) {
      const title = renderMarkdownInline(h3Match[1]);
      htmlResult += `<h3 class="chat-md-h3"><span>${title}</span></h3>`;
      return;
    }

    const quoteMatch = trimmed.match(/^>\s*(.*)/);
    if (quoteMatch) {
      const quoteContent = renderMarkdownInline(quoteMatch[1]);
      htmlResult += `<blockquote class="chat-md-blockquote"><div class="chat-blockquote-content">${quoteContent}</div></blockquote>`;
      return;
    }

    const numMatch = trimmed.match(/^(\d+)[\.\)]\s*(.*)/);
    if (numMatch) {
      const numLabel = numMatch[1];
      const content = renderMarkdownInline(numMatch[2]);
      htmlResult += `<div class="chat-list-row"><span class="chat-list-num">${numLabel}.</span><div class="chat-list-content">${content}</div></div>`;
      return;
    }

    const bulletMatch = trimmed.match(/^([•\-\*])\s*(.*)/);
    if (bulletMatch) {
      const content = renderMarkdownInline(bulletMatch[2]);
      htmlResult += `<div class="chat-list-row chat-list-subrow"><div class="chat-list-content">${content}</div></div>`;
      return;
    }

    const content = renderMarkdownInline(trimmed);
    htmlResult += `<p class="chat-ai-paragraph">${content}</p>`;
  });

  htmlResult += '</div>';
  return htmlResult;
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
    } catch (e) {
      // Regex extract "reply": "..." if JSON parsing failed due to truncation
      const replyMatch = str.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (replyMatch && replyMatch[1]) {
        try {
          return JSON.parse(`"${replyMatch[1]}"`).trim();
        } catch {
          return replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
        }
      }
    }
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
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isHidingScrollBtn, setIsHidingScrollBtn] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isClickScrollingRef = useRef(false);

  const storageKey = `fitmentor_chat_sessions_${effectiveEmail}`;

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

  // Load chat sessions from localStorage & sync from AWS DynamoDB Cloud
  useEffect(() => {
    if (!effectiveEmail) return;

    // 1. Initial instant load from localStorage
    let initialSessions = [];
    try {
      const raw = localStorage.getItem(storageKey);
      initialSessions = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(initialSessions) || initialSessions.length === 0) {
        const legacyRaw = localStorage.getItem(`fitmentor_chat_messages_${effectiveEmail}`);
        if (legacyRaw) {
          try {
            const legacyMsgs = JSON.parse(legacyRaw);
            if (Array.isArray(legacyMsgs) && legacyMsgs.length > 0) {
              const firstUser = legacyMsgs.find(m => m.role === 'user');
              const initTitle = firstUser ? (firstUser.text.slice(0, 28) + (firstUser.text.length > 28 ? '...' : '')) : 'שיחה קודמת';
              initialSessions = [{
                id: 'session_legacy',
                title: initTitle,
                updatedAt: Date.now(),
                messages: legacyMsgs
              }];
            }
          } catch (e) { }
        }
      }

      if (Array.isArray(initialSessions) && initialSessions.length > 0) {
        setSessions(initialSessions);
        setActiveSessionId(initialSessions[0].id);
      }
    } catch (err) {
      console.error('Error reading local chat sessions:', err);
    }

    // 2. Async cloud fetch from AWS DynamoDB to sync sessions across devices
    let isMounted = true;
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
          try {
            localStorage.setItem(storageKey, JSON.stringify(cloudSessions));
          } catch (e) { }
        } else if (!initialSessions || initialSessions.length === 0) {
          const newId = 'session_' + Date.now();
          const fresh = [{ id: newId, title: 'שיחה חדשה', updatedAt: Date.now(), messages: [] }];
          setSessions(fresh);
          setActiveSessionId(newId);
          try {
            localStorage.setItem(storageKey, JSON.stringify(fresh));
          } catch (e) { }
        }
      })
      .catch(err => {
        console.error('Error syncing cloud chat history:', err);
        if (!initialSessions || initialSessions.length === 0) {
          const newId = 'session_' + Date.now();
          const fresh = [{ id: newId, title: 'שיחה חדשה', updatedAt: Date.now(), messages: [] }];
          setSessions(fresh);
          setActiveSessionId(newId);
        }
      });

    return () => { isMounted = false; };
  }, [effectiveEmail]);

  // Active session object & messages
  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0] || { id: 'default', messages: [] };
  const currentMessages = activeSession.messages || [];

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

  const updateAndSaveSessions = (newList) => {
    setSessions(newList);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newList));
    } catch (err) {
      console.error('Error saving local chat sessions:', err);
    }
    // Sync with AWS DynamoDB cloud asynchronously
    if (effectiveEmail) {
      fitmentorApi.saveChatHistory(effectiveEmail, newList).catch(err => {
        console.error('Error saving chat history to cloud:', err);
      });
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
    updateAndSaveSessions(updated);
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
      updateAndSaveSessions(fresh);
    } else {
      if (activeSessionId === sessionId) {
        setActiveSessionId(updated[0].id);
      }
      updateAndSaveSessions(updated);
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
    updateAndSaveSessions(updatedSessionsList);
    setChatLoading(true);

    try {
      const res = await fitmentorApi.chat(effectiveEmail, userMsg, effectiveName, updatedSessionsList, activeSession.id);
      if (res?.reply) {
        const cleanReply = sanitizeAiMessageText(res.reply);
        const aiMsgObj = { role: 'ai', text: cleanReply, timestamp: Date.now() };
        const finalMessages = [...updatedMessages, aiMsgObj];
        const finalSession = { ...updatedSession, updatedAt: Date.now(), messages: finalMessages };
        updateAndSaveSessions(sessions.map(s => s.id === activeSession.id ? finalSession : s));
      }
      if (res?.updatedPlanHtml) onPlanUpdate(res.updatedPlanHtml);
      if (res?.uiAction === 'openNewPlanForm') onOpenNewPlanForm();
    } catch (err) {
      const errObj = { role: 'ai', text: 'שגיאה בתקשורת עם ה-AI: ' + err.message, timestamp: Date.now() };
      const finalMessages = [...updatedMessages, errObj];
      const finalSession = { ...updatedSession, updatedAt: Date.now(), messages: finalMessages };
      updateAndSaveSessions(sessions.map(s => s.id === activeSession.id ? finalSession : s));
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
                מאמן אישי זמין 24/7
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
    onSubmit({ age: dAge, gender: dGender, weight: dWeight, height: dHeight, fitnessLevel: dFitnessLevel, goal: dGoal, days: dDays, equipment: dEquipment });
  };

  return (
    <form onSubmit={handleSubmit} className="plan-builder-form">
      <div className="plan-form-grid">
        <div className="form-group">
          <label className="form-label">גיל</label>
          <input type="number" className="form-input" placeholder="25" min="12" max="100" value={dAge} onChange={e => setDAge(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">מגדר</label>
          <select className="form-select" value={dGender} onChange={e => setDGender(e.target.value)}>
            <option value="male">זכר</option>
            <option value="female">נקבה</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">משקל (ק"ג)</label>
          <input type="number" className="form-input" placeholder="70" min="30" max="250" value={dWeight} onChange={e => setDWeight(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label className="form-label">גובה (ס"מ)</label>
          <input type="number" className="form-input" placeholder="175" min="100" max="250" value={dHeight} onChange={e => setDHeight(Number(e.target.value))} />
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
            <option value="home_dumbbells">🏠 משקולות יד</option>
            <option value="bodyweight">🌳 משקל גוף בלבד</option>
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
          <button type="button" className="btn-plan-cancel" onClick={onCancel}>ביטול</button>
        )}
      </div>
    </form>
  );
}


/* ═══════════════════════════════════════════════ */
/* ─── MAIN DASHBOARD PAGE ─── */
/* ═══════════════════════════════════════════════ */
export function DashboardPage({ user }) {
  const effectiveEmail = user?.email || localStorage.getItem('fitmentor_userId') || '';
  const effectiveName = user?.name || user?.displayName || localStorage.getItem('fitmentor_displayName') || 'מתאמן';

  const [planHtml, setPlanHtml] = useState(null);
  const [planParams, setPlanParams] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [isBuildingPlan, setIsBuildingPlan] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [openDayIndices, setOpenDayIndices] = useState({});
  const modalMouseDownRef = useRef(false);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    if (effectiveEmail) {
      loadPlan();
      loadChatHistory();
    }
  }, [effectiveEmail]);

  const loadPlan = async () => {
    setLoadingPlan(true);
    try {
      const res = await fitmentorApi.getPlan(effectiveEmail);
      if (res?.plan?.planHtml) {
        setPlanHtml(res.plan.planHtml);
      } else {
        setPlanHtml(null);
      }
      // Capture plan params (incl. body weight) if the backend returns them
      if (res?.plan?.params) {
        setPlanParams(res.plan.params);
        try { localStorage.setItem(`fitmentor_plan_params_${effectiveEmail}`, JSON.stringify(res.plan.params)); } catch (e) { }
      }
    } catch (err) {
      console.error('Error loading plan:', err);
      setPlanHtml(null);
    } finally {
      // Fallback: reuse last known plan params from localStorage
      try {
        const raw = localStorage.getItem(`fitmentor_plan_params_${effectiveEmail}`);
        if (raw) setPlanParams(JSON.parse(raw));
      } catch (e) { }
      setLoadingPlan(false);
    }
  };

  const loadChatHistory = async () => {
    try {
      const res = await fitmentorApi.getChatHistory(effectiveEmail);
      if (res?.messages) setChatMessages(res.messages);
    } catch (err) {
      console.error('Error loading chat:', err);
    }
  };

  /* ─── Tailored Multi-Day Workout Plan Generator ─── */
  function buildTailoredPlanHtml(params) {
    const { age = 25, gender = 'male', weight = 70, height = 175, fitnessLevel = 'beginner', goal = 'חיטוב וירידה במשקל', days = 3, equipment = 'gym' } = params || {};
    const numDays = Math.min(Math.max(parseInt(days, 10) || 3, 2), 6);

    const goalTitleMap = {
      'חיטוב וירידה במשקל': 'חיטוב, שריפת שומן ושימור מסת שריר',
      'עלייה במסת שריר': 'היפרטרופיה ועלייה במסת שריר נקייה',
      'שיפור כושר כללי': 'סיבולת לב-ריאה, כושר כללי ובריאות',
      'אימוני כוח': 'כוח מירבי והתנגדות מתקדמת'
    };

    const levelNameMap = {
      beginner: 'מתחילים (0-6 חודשים)',
      intermediate: 'מתקדמים (6 חודשים - שנתיים)',
      advanced: 'מקצועיים (מעל שנתיים)'
    };

    const equipNameMap = {
      gym: 'חדר כושר מלא',
      home_dumbbells: 'אימון ביתי עם משקולות יד',
      bodyweight: 'אימון משקל גוף בלבד'
    };

    const dayTemplates = [];

    if (numDays === 2) {
      dayTemplates.push(
        {
          title: 'יום 1: אימון גוף מלא (Full Body A) - פלג גוף עליון ותחתון',
          exercises: [
            { name: 'סקוואט כנגד ברבל / משקולות', sets: '3', reps: '10-12', rest: '90 שניות', tech: 'שמור על חזה מורם, ברכיים בקו קצות האצבעות, וירד עד 90 מעלות בצורה מבוקרת.', prog: 'העלה 2.5 ק"ג כשתבצע 12 חזרות נקיות בכל הסטים.' },
            { name: 'לחיצת חזה בשכיבה (Bench Press)', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'אחוז בברבל ברוחב כתפיים, הורד באיטיות לחזה התחתון ודחוף למעלה בנשיפה.', prog: 'העלה משקל כשתגיע ל-12 חזרות בקלות.' },
            { name: 'חתירה בהטיית גו / פולי תחתון', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'גב ישר ב-45 מעלות, משוך את הידיות לכיוון הטבור תוך כווץ שכמות.', prog: 'הוסף משקל לאחר השלמת 3 סטים של 12.' },
            { name: 'לחיצת כתפיים בעמידה / ישיבה', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'החזק משקולות בגובה הכתפיים, דחוף מעל הראש ללא נעילת מרפקים.', prog: 'העלה משקל כשתבצע 15 חזרות בקלות.' },
            { name: 'פלאנק סטטי ואימון ליבה', sets: '3', reps: '45-60 שניות', rest: '30 שניות', tech: 'בטן ואחוריים מתוחים, שמור על קו ישר מהראש ועד העקבים.', prog: 'הארך את זמן השהייה ב-10 שניות בכל שבוע.' }
          ]
        },
        {
          title: 'יום 2: אימון גוף מלא (Full Body B) - כוח וסיבולת שרירית',
          exercises: [
            { name: 'רומניאן דדליפט (RDL)', sets: '3', reps: '10-12', rest: '90 שניות', tech: 'כופף את האגן לאחור, גב ישר לגמרי, צמוד לברכיים עד מתיחת המהמסטרינג.', prog: 'הוסף משקל קל כשתבצע 12 חזרות נקיות.' },
            { name: 'משיכת פולי עליון / מתח באחיזה רחבה', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'חזה מורם קדימה, משוך את הכבל לכיוון החזה העליון תוך כווץ גב רחב.', prog: 'העלה פלטה אחת כשתצליח 12 חזרות.' },
            { name: 'מכרעים (Lunges) בהליכה עם משקולות', sets: '3', reps: '10 בכל רגל', rest: '60 שניות', tech: 'צעד רחב קדימה, ברך אחורית כמעט נוגעת ברצפה, שמור על גב זקוף.', prog: 'הגדל את משקל המשקולות ב-1-2 ק"ג.' },
            { name: 'מקבילים / פשיטת מרפקים כנגד כבל (יד אחורית)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'מרפקים צמודים לגוף, פשוט את הזרוע למטה עד כווץ מלא.', prog: 'הוסף משקל כשתבצע 15 חזרות.' },
            { name: 'כפילת זרועות עם דמבלים (יד קדמית)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'סיבוב פרק כף היד בשיא הכווץ, שמור על מרפקים קבועים בצדי הגוף.', prog: 'העלה משקל קל ברגע שהגעת ל-15 חזרות.' }
          ]
        }
      );
    } else if (numDays === 3) {
      dayTemplates.push(
        {
          title: 'יום 1: פלג גוף עליון (חזה, כתפיים, גב רחב)',
          exercises: [
            { name: 'לחיצת חזה בשכיבה עם ברבל / דמבלים', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'שכב על הספסל עם רגליים שטוחות, אחוז בברבל ברוחב הכתפיים. הורד לאט עד לגובה החזה ודחוף למעלה תוך נשיפה.', prog: 'העלה משקל כשתאתה מבצע 12 חזרות בקלות בשני סטים רצופים.' },
            { name: 'לחיצת כתפיים עם דמבלים בישיבה', sets: '3', reps: '10-12', rest: '45 שניות', tech: 'שב על ספסל עם משענת, החזק משקולות בגובה הכתפיים ודחוף מעל הראש תוך נשיפה.', prog: 'העלה משקל כשתאתה מבצע 12 חזרות בקלות.' },
            { name: 'משיכת פולי עליון (גב רחב באחיזה רחבה)', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'אחוז את הידיות ברוחב כף היד, משוך את הכבל כלפי החזה תוך שמירה על גב ישר וכווץ שכמות.', prog: 'העלה משקל כשתאתה מבצע 12 חזרות בקלות.' },
            { name: 'הרחקת זרועות לצדדים עם דמבלים (כתף אמצעית)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'מרפקים מכופפים קלות, הרם את המשקולות בגובה הכתפיים ללא הנפה של הגוף.', prog: 'הוסף חזרה אחת בכל אימון עד להגעה ל-15.' }
          ]
        },
        {
          title: 'יום 2: פלג גוף תחתון (רגליים, שוקיים, בטן וליבה)',
          exercises: [
            { name: 'סקוואט כנגד ברבל / פלג גוף תחתון', sets: '4', reps: '8-10', rest: '90 שניות', tech: 'עמוד ברוחב כתפיים, רד למטה כאילו אתה יושב על כיסא, שמור על גב ישר וברכיים יציבות.', prog: 'העלה משקל ב-2.5 ק"ג כשתגיע ל-10 חזרות נקיות.' },
            { name: 'לחיצת רגליים במכונה (Leg Press)', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'הנח רגליים במרכז הפלטה, דחוף דרך העקבים ואל תנעל ברכיים בקצה התנועה.', prog: 'הוסף פלטה ברגע שהשלמת 12 חזרות.' },
            { name: 'כפילת ברכיים במכונה (Hamstrings Curl)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'שכב / שב במכונה, כופף את הברכיים תוך כווץ מלא של החלק האחורי של הירך.', prog: 'העלה משקל כשתגיע ל-15 חזרות.' },
            { name: 'הרמת עקבים בעמידה (שוקיים)', sets: '4', reps: '15-20', rest: '45 שניות', tech: 'עמוד על קצה מדרגה, רד למתיחה מלאה ועלה על קצות האצבעות לכווץ מקסימלי.', prog: 'העלה משקל כשתגיע ל-20 חזרות.' },
            { name: 'הרמת ברכיים בתלייה / בטן על מזרן', sets: '3', reps: '15', rest: '30 שניות', tech: 'אגוד את השרירים הישרים של הבטן, בצע תנועה איטית ומבוקרת ללא תנופה.', prog: 'הוסף 2 חזרות בכל אימון.' }
          ]
        },
        {
          title: 'יום 3: אימון כוח וזרועות (גב, חזה, זרועות וכתפיים)',
          exercises: [
            { name: 'חתירה כנגד כבל / דמבלים (גב תחתון ואמצעי)', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'גב ישר, משוך את המשקולות / ידיות לכיוון המותניים תוך מהדק שכמות לאחור.', prog: 'העלה משקל כשתגיע ל-12 חזרות.' },
            { name: 'לחיצת חזה בשיפוע חיובי (Incline Press)', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'כוונו את הספסל ל-30 מעלות, דחוף את המשקולות כלפי מעלה בשיא הריכוז בחזה העליון.', prog: 'הוסף 1-2 ק"ג כשתבצע 12 חזרות.' },
            { name: 'פשיטת מרפקים כנגד כבל (יד אחורית - Triceps)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'מרפקים נעולים לצדי הגוף, יישר את הזרוע לחלוטין כלפי מטה.', prog: 'העלה משקל ברגע שהגעת ל-15 חזרות.' },
            { name: 'כפילת זרועות עם מוט / דמבלים (יד קדמית - Biceps)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'כופף את המרפקים לכיוון הכתפיים, שמור על גוו יציב ללא הנפה.', prog: 'העלה משקל כשתבצע 15 חזרות נקיות.' }
          ]
        }
      );
    } else if (numDays === 4) {
      dayTemplates.push(
        {
          title: 'יום 1: אימון A1 - חזה, כתפיים ויד אחורית (Push)',
          exercises: [
            { name: 'לחיצת חזה בשכיבה עם ברבל', sets: '4', reps: '8-10', rest: '90 שניות', tech: 'אחוז בברבל ברוחב כתפיים, הורד בצורה מבוקרת ודחוף למעלה בנשיפה.', prog: 'העלה משקל כשתשלים 10 חזרות.' },
            { name: 'לחיצת חזה בשיפוע חיובי עם דמבלים', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'ספסל ב-30 מעלות, דחוף מהחזה העליון ללא נעילת מרפקים.', prog: 'העלה משקל כשתגיע ל-12.' },
            { name: 'לחיצת כתפיים עם דמבלים', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'דחוף מעל הראש בגילוי יציב.', prog: 'הוסף משקל ברגע שתשלים 12.' },
            { name: 'פשיטת מרפקים כנגד כבל (יד אחורית)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'יישר את הזרוע למטה עד כווץ מלא.', prog: 'העלה משקל ב-15 חזרות.' }
          ]
        },
        {
          title: 'יום 2: אימון B1 - גב, יד קדמית ובטן (Pull)',
          exercises: [
            { name: 'משיכת פולי עליון / מתח', sets: '4', reps: '8-10', rest: '90 שניות', tech: 'אחוז רחב, משוך לחזה העליון תוך הידוק שכמות.', prog: 'העלה משקל ב-10 חזרות.' },
            { name: 'חתירה כנגד כבל', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'גב ישר, משוך למותניים.', prog: 'הוסף משקל ב-12 חזרות.' },
            { name: 'כפילת זרועות עם מוט (יד קדמית)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'מרפקים צמודים, כופף בשיא הריכוז.', prog: 'העלה משקל ב-15.' },
            { name: 'הרמת רגליים בתלייה (בטן)', sets: '3', reps: '15', rest: '30 שניות', tech: 'הרם רגליים / ברכיים אל החזה בצורה איטית.', prog: 'הוסף חזרות בכל אימון.' }
          ]
        },
        {
          title: 'יום 3: אימון C1 - רגליים ושוקיים (Legs)',
          exercises: [
            { name: 'סקוואט כנגד ברבל', sets: '4', reps: '8-10', rest: '90 שניות', tech: 'גב ישר, ירידה עד 90 מעלות, דחיפה דרך העקבים.', prog: 'העלה משקל ב-10 חזרות.' },
            { name: 'רומניאן דדליפט (RDL)', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'ציר אגן לאחור, מתיחה מלאה של המהמסטרינג.', prog: 'הוסף משקל ב-12.' },
            { name: 'לחיצת רגליים במכונה', sets: '3', reps: '10-12', rest: '60 שניות', tech: 'אל תנעל ברכיים בקצה התנועה.', prog: 'העלה משקל ב-12.' },
            { name: 'הרמת עקבים בעמידה (שוקיים)', sets: '4', reps: '15-20', rest: '45 שניות', tech: 'מתיחה וכווץ מקסימלי.', prog: 'הוסף משקל ב-20 חזרות.' }
          ]
        },
        {
          title: 'יום 4: אימון D1 - כתפיים, זרועות וליבה (Core & Arms Focus)',
          exercises: [
            { name: 'הרחקת זרועות לצדדים עם דמבלים', sets: '4', reps: '12-15', rest: '45 שניות', tech: 'הרם בגובה הכתפיים ללא תנופת גוף.', prog: 'העלה משקל ב-15 חזרות.' },
            { name: 'פשיטת מרפקים מעל הראש (Overhead Extension)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'מתיחה עמוקה של ראש היד האחורית.', prog: 'הוסף משקל ב-15.' },
            { name: 'כפילת זרועות פטישים (Hammer Curls)', sets: '3', reps: '12-15', rest: '45 שניות', tech: 'אחיזה ניטרלית, דגש על הזרוע והאמה.', prog: 'העלה משקל ב-15.' },
            { name: 'פלאנק דינמי והרמת אגן', sets: '3', reps: '60 שניות', rest: '30 שניות', tech: 'בטן מתוחה, גב ישר לגמרי.', prog: 'הארך את הזמן ב-10 שניות.' }
          ]
        }
      );
    } else {
      for (let d = 1; d <= numDays; d++) {
        const dayNames = [
          'יום 1: אימון חזה וזרוע אחורית (Push A)',
          'יום 2: אימון גב וזרוע קדמית (Pull A)',
          'יום 3: אימון רגליים ובטן (Legs A)',
          'יום 4: אימון כתפיים וחזה עליון (Push B)',
          'יום 5: אימון גב תחתון, זרועות וליבה (Pull B)',
          'יום 6: אימון רגליים ממוקד ושוקיים (Legs B)'
        ];
        dayTemplates.push({
          title: dayNames[d - 1] || `יום ${d}: אימון ממוקד ${d}`,
          exercises: [
            { name: `תרגיל מוביל ${d}.1 - כוח מירבי`, sets: '4', reps: '8-10', rest: '90 שניות', tech: 'בצע בטכניקה מדויקת ושמור על גב ישר.', prog: 'העלה משקל כשתגיע ל-10 חזרות.' },
            { name: `תרגיל משלים ${d}.2 - היפרטרופיה`, sets: '3', reps: '10-12', rest: '60 שניות', tech: 'כווץ מלא בשיא התנועה וירידה מבוקרת.', prog: 'הוסף משקל ב-12 חזרות.' },
            { name: `תרגיל בידוד ${d}.3 - חיזוק ממוקד`, sets: '3', reps: '12-15', rest: '45 שניות', tech: 'תנועה נקייה ללא הנפה.', prog: 'העלה משקל ב-15 חזרות.' },
            { name: `תרגיל ליבה / שוקיים ${d}.4`, sets: '3', reps: '15-20', rest: '30 שניות', tech: 'כווץ חזק ושליטה מלאה.', prog: 'הוסף חזרות בכל אימון.' }
          ]
        });
      }
    }

    let html = `<div class="ai-plan-result">
  <div class="plan-intro">
    <p>להלן תוכנית האימונים המותאמת אישית למתאמן/ת בגיל ${age}, משקל ${weight} ק"ג, גובה ${height} ס"מ (${levelNameMap[fitnessLevel] || fitnessLevel}) - <strong>${numDays} ימי אימון בשבוע</strong> במטרת <strong>${goalTitleMap[goal] || goal}</strong> (${equipNameMap[equipment] || equipment}):</p>
  </div>`;

    dayTemplates.forEach((dayObj) => {
      html += `\n<h3>${dayObj.title}</h3>\n`;
      dayObj.exercises.forEach((ex) => {
        const numSets = parseInt(String(ex.sets).replace(/[^\d]/g, ''), 10) || 3;
        const setW = computePerSetWeights(ex.name, weight, fitnessLevel, numSets);
        const weightLine = setW
          ? `<p><strong>משקל מומלץ:</strong> ${setW.map((w, i) => `סט ${i + 1}: ${w} ק"ג`).join(' | ')}</p>\n`
          : '';
        html += `<p>🏋️ <strong>${ex.name}</strong></p>
<p><strong>סטים:</strong> ${ex.sets} | <strong>חזרות:</strong> ${ex.reps} | <strong>מנוחה:</strong> ${ex.rest}</p>
${weightLine}<p><strong>דגש טכניקה:</strong> ${ex.tech}</p>
<p><strong>התקדמות עומס:</strong> ${ex.prog}</p>\n\n`;
      });
    });

    html += `\n</div>`;
    return html;
  }

  const handleCreatePlan = async (params) => {
    setGenerating(true);
    try {
      let finalPlanHtml = null;
      try {
        const res = await fitmentorApi.generatePlan(effectiveEmail, params);
        if (res?.plan?.planHtml) {
          const parsed = parsePlanIntoDays(res.plan.planHtml);
          const reqDays = parseInt(params.days, 10) || 3;
          if (parsed.length >= reqDays) {
            finalPlanHtml = res.plan.planHtml;
          }
        }
      } catch (e) {
        console.warn('Backend generatePlan call failed, falling back to rich tailored generator:', e);
      }

      if (!finalPlanHtml) {
        finalPlanHtml = buildTailoredPlanHtml(params);
        try {
          await fitmentorApi.savePlan(effectiveEmail, finalPlanHtml, params);
        } catch (saveErr) {
          console.error('Error saving generated plan:', saveErr);
        }
      }

      setPlanHtml(finalPlanHtml);
      setPlanParams(params);
      try { localStorage.setItem(`fitmentor_plan_params_${effectiveEmail}`, JSON.stringify(params)); } catch (e) { }
      setIsBuildingPlan(false);
      setShowNewPlanModal(false);
      setOpenDayIndices({});
    } catch (err) {
      alert('שגיאה ביצירת תוכנית אימונים: ' + err.message);
    } finally {
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

  // Clean and parse plan into days for accordion view
  const cleanedPlan = cleanPlanHtml(planHtml);
  const parsedPlan = parsePlanIntoDays(cleanedPlan);
  const planDays = parsedPlan.days || [];
  const planIntro = parsedPlan.intro || null;

  // Body weight & fitness level for the suggested weight-per-set
  const introWeightMatch = cleanedPlan.match(/משקל\s*(\d+(?:\.\d+)?)\s*ק"ג/);
  const bodyWeightKg = Number(planParams?.weight) || (introWeightMatch ? Number(introWeightMatch[1]) : 0) || 0;
  const fitnessLevel = planParams?.fitnessLevel || 'beginner';

  const isAllOpen = planDays.length > 0 && planDays.every((_, idx) => openDayIndices[idx] !== false);

  const toggleAllDays = () => {
    if (isAllOpen) {
      setOpenDayIndices({});
    } else {
      const allObj = {};
      planDays.forEach((_, idx) => { allObj[idx] = true; });
      setOpenDayIndices(allObj);
    }
  };

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
          {!loadingPlan && !planHtml && !isBuildingPlan && (
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
                    <button className="dash-action-btn" onClick={handlePrintPlan}>
                      🖨️ הדפס תוכנית
                    </button>
                    <button className="dash-action-btn dash-action-btn--primary" onClick={() => setShowNewPlanModal(true)}>
                      ✨ תוכנית חדשה
                    </button>
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

              {/* Accordion days OR raw fallback */}
              {planDays.length > 0 ? (
                <div className="plan-days-container">
                  {planDays.map((day, idx) => (
                    <PlanDayCard
                      key={idx}
                      day={day}
                      index={idx}
                      isOpen={Boolean(openDayIndices[idx])}
                      onToggle={() => setOpenDayIndices(prev => ({ ...prev, [idx]: !prev[idx] }))}
                      bodyWeightKg={bodyWeightKg}
                      fitnessLevel={fitnessLevel}
                    />
                  ))}
                </div>
              ) : (
                /* Fallback: raw HTML in a styled card */
                <div className="plan-raw-card">
                  <div className="ai-plan-result" dangerouslySetInnerHTML={{ __html: cleanedPlan }} />
                </div>
              )}

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
              rawHtml={cleanedPlan}
              bodyWeightKg={bodyWeightKg}
              fitnessLevel={fitnessLevel}
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
          onPlanUpdate={setPlanHtml}
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
            if (e.target === e.currentTarget && modalMouseDownRef.current) {
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
            <button type="button" className="fm-modal-close" onClick={() => setShowNewPlanModal(false)}>×</button>
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

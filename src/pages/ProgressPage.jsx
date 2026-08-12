import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { fitmentorApi } from '../api/fitmentorApi';

/* ─── Vector SVG Icons ─── */
const SvgFlame = ({ size = 28, color = "#f97316" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5Z" />
  </svg>
);

const SvgBarChart = ({ size = 28, color = "#22d3ee" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const SvgTrophy = ({ size = 28, color = "#facc15" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

const SvgBrain = ({ size = 28, color = "#a855f7" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
    <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
    <path d="M12 5v13" />
  </svg>
);

export function ProgressPage({ user }) {
  const effectiveEmail = String(user?.email || localStorage.getItem('fitmentor_userId') || localStorage.getItem('userId') || '').trim();
  
  const [progressData, setProgressData] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  
  // Achievements state
  const [achievements, setAchievements] = useState(null);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [activePrFilter, setActivePrFilter] = useState('all');

  // Calendar state
  const [calState, setCalState] = useState(() => {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      selectedIso: toISODate(now)
    };
  });

  // Chart 1RM selection
  const [selectedExercise1rm, setSelectedExercise1rm] = useState('');
  const [selectedDay1rm, setSelectedDay1rm] = useState('');

  // Chart Canvas Refs
  const weightCanvasRef = useRef(null);
  const chart1rmRef = useRef(null);
  const volumeCanvasRef = useRef(null);
  const balanceCanvasRef = useRef(null);

  // Chart Instances Refs
  const weightChartInst = useRef(null);
  const chart1rmInst = useRef(null);
  const volumeChartInst = useRef(null);
  const balanceChartInst = useRef(null);

  useEffect(() => {
    loadData();
  }, [effectiveEmail]);

  const loadData = async () => {
    setLoading(true);
    setAiInsightsLoading(true);
    setAchievementsLoading(true);
    try {
      let data = {};
      if (effectiveEmail) {
        data = await fitmentorApi.getProgressData(effectiveEmail).catch(() => ({}));
      }
      const normalized = normalizeProgressData(data);
      const merged = mergeLocalLogsWithProgressData(normalized, effectiveEmail);
      setProgressData(merged);

      // Hydrate AI Insights
      try {
        if (effectiveEmail) {
          const logs = getRecentTrainingLogs(effectiveEmail, 20);
          let insights = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            insights = await fitmentorApi.getAiInsights(effectiveEmail, 30, logs).catch(() => null);
            if (insights && Array.isArray(insights.recommendations) && insights.recommendations.length > 0) {
              break;
            }
          }
          if (insights) setAiInsights(insights);
        }
      } catch (err) {
        console.warn('AI Insights load error:', err);
      } finally {
        setAiInsightsLoading(false);
      }

      // Load AI Achievements from recent training logs
      try {
        const logs = getRecentTrainingLogs(effectiveEmail, 10);
        if (logs.length > 0 && effectiveEmail) {
          const achRes = await fitmentorApi.getAchievements(effectiveEmail, logs).catch(() => null);
          const list = Array.isArray(achRes?.achievements) ? achRes.achievements : fallbackExtractAchievements(logs);
          setAchievements(list);
        } else {
          setAchievements(fallbackExtractAchievements(logs));
        }
      } catch (err) {
        console.warn('Achievements load error:', err);
        const logs = getRecentTrainingLogs(effectiveEmail, 10);
        setAchievements(fallbackExtractAchievements(logs));
      } finally {
        setAchievementsLoading(false);
      }
    } catch (err) {
      console.error('Error loading progress:', err);
      const empty = normalizeProgressData({});
      const merged = mergeLocalLogsWithProgressData(empty, effectiveEmail);
      setProgressData(merged);
      setAchievements([]);
      setAchievementsLoading(false);
    } finally {
      setLoading(false);
    }
  };

  // Render Bodyweight Chart
  useEffect(() => {
    if (!weightCanvasRef.current) return;
    if (weightChartInst.current) weightChartInst.current.destroy();

    const overview = progressData?.overview || {};
    const series = overview.bodyWeight || overview.bodyweight || overview.weight || null;
    const labels = Array.isArray(series?.labels) ? series.labels : [];
    const data = (Array.isArray(series?.data) ? series.data : []).map(v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    });

    const hasPoints = labels.length > 0 && data.some(x => typeof x === 'number');

    if (!hasPoints) {
      // Render baseline empty chart placeholder
      const ctx = weightCanvasRef.current.getContext('2d');
      weightChartInst.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: ['שבוע 1', 'שבוע 2', 'שבוע 3', 'שבוע 4'],
          datasets: [{
            label: 'משקל גוף (ללא נתונים)',
            data: [null, null, null, null],
            borderColor: 'rgba(34, 211, 238, 0.3)',
            borderDash: [5, 5]
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: 'rgba(148, 163, 184, 0.16)' } },
            x: { grid: { display: false } }
          }
        }
      });
      return;
    }

    const ctx = weightCanvasRef.current.getContext('2d');
    const fill = ctx.createLinearGradient(0, 0, 0, 260);
    fill.addColorStop(0, 'rgba(34, 211, 238, 0.22)');
    fill.addColorStop(1, 'rgba(34, 211, 238, 0.02)');

    weightChartInst.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'משקל',
          data,
          borderColor: 'rgba(34, 211, 238, 0.95)',
          backgroundColor: fill,
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3.5,
          pointBackgroundColor: 'rgba(15, 23, 42, 0.85)',
          pointBorderColor: 'rgba(34, 211, 238, 0.95)',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            borderColor: 'rgba(255,255,255,0.10)',
            borderWidth: 1
          }
        },
        scales: {
          y: {
            grid: { color: 'rgba(148, 163, 184, 0.16)' },
            ticks: { color: 'rgba(148, 163, 184, 0.85)', maxTicksLimit: 5 }
          },
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(148, 163, 184, 0.75)', maxRotation: 0 }
          }
        }
      }
    });

    return () => {
      if (weightChartInst.current) weightChartInst.current.destroy();
    };
  }, [progressData]);

  // Render 1RM & Volume Charts
  useEffect(() => {
    if (!chart1rmRef.current || !volumeCanvasRef.current) return;
    if (chart1rmInst.current) chart1rmInst.current.destroy();
    if (volumeChartInst.current) volumeChartInst.current.destroy();

    const charts = progressData?.charts || {};
    const overview = progressData?.overview || {};
    const workoutDays30 = Array.isArray(overview.workoutDays30) ? overview.workoutDays30 : [];
    const ex1rmByDay30 = overview.exercise1rmByDay30 || {};

    // 1. Render 1RM Chart
    const ctx1 = chart1rmRef.current.getContext('2d');
    if (selectedDay1rm && ex1rmByDay30[selectedDay1rm]) {
      const rows = Object.entries(ex1rmByDay30[selectedDay1rm])
        .map(([name, v]) => ({ name, v: Number(v) }))
        .filter(x => x.name && Number.isFinite(x.v) && x.v > 0)
        .sort((a, b) => b.v - a.v)
        .slice(0, 18);

      if (rows.length > 0) {
        const grad = ctx1.createLinearGradient(0, 0, 0, 320);
        grad.addColorStop(0, 'rgba(34, 211, 238, 0.95)');
        grad.addColorStop(1, 'rgba(168, 85, 247, 0.85)');

        chart1rmInst.current = new Chart(ctx1, {
          type: 'bar',
          data: {
            labels: rows.map(r => r.name),
            datasets: [{
              label: 'Estimated 1RM',
              data: rows.map(r => Math.round(r.v)),
              backgroundColor: grad,
              borderRadius: 10
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: 'rgba(148, 163, 184, 0.18)' } },
              y: { grid: { display: false } }
            }
          }
        });
      }
    } else {
      const exercise1RM = charts.exercise1RM || charts.exerciseOneRM;
      const exercises = exercise1RM ? (Array.isArray(exercise1RM.exercises) ? exercise1RM.exercises : Object.keys(exercise1RM.seriesByExercise || {})) : [];
      
      const currentEx = selectedExercise1rm || exercises[0] || '';
      const series = currentEx && exercise1RM?.seriesByExercise ? exercise1RM.seriesByExercise[currentEx] : null;
      const labels = exercise1RM?.labels || ['אימון 1', 'אימון 2', 'אימון 3', 'אימון 4'];
      const dataPoints = Array.isArray(series) ? series : (exercise1RM ? labels.map(() => null) : [0, 0, 0, 0]);

      const grad = ctx1.createLinearGradient(0, 0, 600, 0);
      grad.addColorStop(0, '#22d3ee');
      grad.addColorStop(1, '#a855f7');

      chart1rmInst.current = new Chart(ctx1, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: currentEx || 'Estimated 1RM',
            data: dataPoints,
            borderColor: grad,
            backgroundColor: 'rgba(34, 211, 238, 0.08)',
            tension: 0.35,
            pointRadius: 3.5,
            borderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { grid: { color: 'rgba(148, 163, 184, 0.18)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

    // 2. Render Volume Chart
    const ctxV = volumeCanvasRef.current.getContext('2d');
    const volume = charts.volume || charts.volumeLoad;
    const vLabels = volume?.labels?.length > 0 ? volume.labels : ['אימון 1', 'אימון 2', 'אימון 3', 'אימון 4'];
    const vData = volume?.data?.length > 0 ? volume.data : [0, 0, 0, 0];

    const barGrad = ctxV.createLinearGradient(0, 0, 0, 320);
    barGrad.addColorStop(0, 'rgba(248, 113, 113, 0.95)');
    barGrad.addColorStop(1, 'rgba(168, 85, 247, 0.85)');

    volumeChartInst.current = new Chart(ctxV, {
      type: 'bar',
      data: {
        labels: vLabels,
        datasets: [{
          label: 'Total Volume',
          data: vData,
          backgroundColor: barGrad,
          borderRadius: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(148, 163, 184, 0.18)' } },
          x: { grid: { display: false } }
        }
      }
    });

    return () => {
      if (chart1rmInst.current) chart1rmInst.current.destroy();
      if (volumeChartInst.current) volumeChartInst.current.destroy();
    };
  }, [progressData, selectedExercise1rm, selectedDay1rm]);

  // Render Body Balance Radar Chart
  useEffect(() => {
    const canvas = balanceCanvasRef.current;
    if (!canvas) return;
    if (balanceChartInst.current) balanceChartInst.current.destroy();

    const ctx = canvas.getContext('2d');
    const balance = computeBodyBalance(progressData, aiInsights);
    const labels = balance.groups.map(g => g.label);
    const safeData = balance.groups.map(g => g.score);

    const strokeGrad = ctx.createLinearGradient(0, 0, 300, 300);
    strokeGrad.addColorStop(0, 'rgba(34, 211, 238, 1)');
    strokeGrad.addColorStop(1, 'rgba(168, 85, 247, 1)');

    const fillGrad = ctx.createLinearGradient(0, 0, 300, 300);
    fillGrad.addColorStop(0, 'rgba(34, 211, 238, 0.25)');
    fillGrad.addColorStop(1, 'rgba(168, 85, 247, 0.12)');

    // Custom Plugin to render a clear, glowing Center Point Dot at the exact center origin
    const centerPointDotPlugin = {
      id: 'centerPointDot',
      afterDatasetsDraw(chart) {
        if (!chart || !chart.chartArea) return;
        const { chartArea, ctx } = chart;
        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;

        ctx.save();
        // Glow aura
        ctx.beginPath();
        ctx.arc(centerX, centerY, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(34, 211, 238, 0.28)';
        ctx.fill();

        // Exact Center Dot
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#22d3ee';
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();
      }
    };

    const chartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: 'איזון גוף',
          data: safeData,
          borderColor: strokeGrad,
          backgroundColor: fillGrad,
          borderWidth: 2.5,
          pointRadius: 4.5,
          pointHoverRadius: 6.5,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#22d3ee',
          pointBorderWidth: 2
        }]
      },
      plugins: [centerPointDotPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        events: [], // Disable Chart.js native auto-hover so custom mousemove handler controls hover zones precisely
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            rtl: true,
            textDirection: 'rtl',
            titleAlign: 'right',
            bodyAlign: 'right',
            backgroundColor: 'rgba(15, 23, 42, 0.97)',
            borderColor: 'rgba(56, 189, 248, 0.4)',
            borderWidth: 1.5,
            padding: 14,
            titleColor: '#22d3ee',
            titleFont: { size: 14, weight: 'bold' },
            bodyColor: '#f8fafc',
            bodyFont: { size: 13, weight: '600' },
            displayColors: false,
            caretSize: 0,
            callbacks: {
              title: function(tooltipItems) {
                if (!tooltipItems || tooltipItems.length === 0) return '';
                if (tooltipItems.length > 1) {
                  return '💪 מדדי איזון קבוצות שרירים';
                }
                const idx = tooltipItems[0].dataIndex;
                const group = balance.groups[idx];
                return `${group?.icon || '💪'} ${tooltipItems[0].label || ''}`;
              },
              label: function(context) {
                const idx = context.dataIndex;
                const group = balance.groups[idx];
                const score = typeof group?.score === 'number' ? group.score : 0;
                const isMulti = context.chart?.tooltip?.dataPoints?.length > 1;
                if (isMulti) {
                  return `${group?.icon || '💪'} ${context.label}: ${score}/10`;
                }
                return `ציון איזון: ${score}/10`;
              }
            }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            suggestedMax: 10,
            grid: { color: 'rgba(148, 163, 184, 0.18)' },
            angleLines: { color: 'rgba(148, 163, 184, 0.20)' },
            pointLabels: {
              color: 'rgba(226, 232, 240, 0.95)',
              font: { size: 13, weight: '800' }
            },
            ticks: { display: false }
          }
        }
      }
    });

    balanceChartInst.current = chartInstance;

    const handleCanvasMouseMove = (e) => {
      const chart = balanceChartInst.current;
      if (!chart || !chart.chartArea) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const { chartArea } = chart;
      const centerX = (chartArea.left + chartArea.right) / 2;
      const centerY = (chartArea.top + chartArea.bottom) / 2;

      const dx = mouseX - centerX;
      const dy = mouseY - centerY;
      const distToCenter = Math.sqrt(dx * dx + dy * dy);

      // 1. Exact Center Dot Hover: ONLY triggers when cursor is directly on the middle point dot itself (8px radius)
      const centerRadius = 8;
      if (distToCenter <= centerRadius) {
        const allPoints = (chart.data?.labels || []).map((_, i) => ({
          datasetIndex: 0,
          index: i
        }));
        chart.setActiveElements(allPoints);
        chart.tooltip.setActiveElements(allPoints, { x: centerX, y: centerY });
        chart.update('none');
        return;
      }

      // 2. Specific Outer Muscle Point Hover: ONLY triggers when cursor is directly on an outer trained point (score > 0)
      const meta = chart.getDatasetMeta(0);
      if (meta && Array.isArray(meta.data)) {
        let nearestIndex = -1;
        let minPointDist = Infinity;

        meta.data.forEach((element, i) => {
          if (!element) return;
          const score = safeData[i] || 0;
          // Untrained muscles (score = 0) sit at the center origin, so ignore them for individual outer point hover!
          if (score <= 0) return;

          const px = element.x;
          const py = element.y;
          const pDist = Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2);
          if (pDist < minPointDist) {
            minPointDist = pDist;
            nearestIndex = i;
          }
        });

        if (nearestIndex >= 0 && minPointDist <= 10) {
          const singlePoint = [{ datasetIndex: 0, index: nearestIndex }];
          const pt = meta.data[nearestIndex];
          chart.setActiveElements(singlePoint);
          chart.tooltip.setActiveElements(singlePoint, { x: pt.x, y: pt.y });
          chart.update('none');
          return;
        }
      }

      // 3. Anywhere else -> SHOW NOTHING
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none');
    };

    const handleCanvasMouseLeave = () => {
      const chart = balanceChartInst.current;
      if (!chart) return;
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update('none');
    };

    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', handleCanvasMouseLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', handleCanvasMouseLeave);
      if (balanceChartInst.current) balanceChartInst.current.destroy();
    };
  }, [progressData, aiInsights]);

  // Calendar Helpers
  const normalizedHeat = coerceHeatmapYear(progressData?.heatmap);

  const prevMonth = () => {
    setCalState(prev => {
      let month = prev.month - 1;
      let year = prev.year;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
      return { ...prev, month, year };
    });
  };

  const nextMonth = () => {
    setCalState(prev => {
      let month = prev.month + 1;
      let year = prev.year;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      return { ...prev, month, year };
    });
  };

  const getCalendarTitle = () => {
    const d = new Date(calState.year, calState.month, 1);
    return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(d);
  };

  const renderCalendarCells = () => {
    const { year, month, selectedIso } = calState;
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysPrevMonth = new Date(year, month, 0).getDate();
    const todayIso = toISODate(new Date());

    // Calculate dynamic total cells (35 or 42) so months that fit in 5 rows don't display unnecessary trailing 6th row
    const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
    const cells = [];

    for (let i = 0; i < totalCells; i++) {
      let dateObj;
      let inMonth = true;

      if (i < firstDow) {
        const dayNum = daysPrevMonth - (firstDow - 1 - i);
        dateObj = new Date(year, month - 1, dayNum);
        inMonth = false;
      } else if (i >= firstDow + daysInMonth) {
        const dayNum = i - (firstDow + daysInMonth) + 1;
        dateObj = new Date(year, month + 1, dayNum);
        inMonth = false;
      } else {
        const dayNum = i - firstDow + 1;
        dateObj = new Date(year, month, dayNum);
      }

      const iso = toISODate(dateObj);
      const workoutCount = Number(normalizedHeat.byDateCount.get(iso) ?? 0);
      const isToday = iso === todayIso;
      const isSelected = iso === selectedIso;
      const isFuture = iso > todayIso;

      cells.push(
        <div
          key={i}
          className={`cal-cell ${!inMonth ? 'is-out' : ''} ${isFuture ? 'is-future' : ''} ${workoutCount > 0 ? 'has-workout' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
          onClick={() => {
            setCalState({
              year: dateObj.getFullYear(),
              month: dateObj.getMonth(),
              selectedIso: iso
            });
          }}
          title={`${formatHebrewFullDate(iso)}${workoutCount > 0 ? ` · ${workoutCount} אימונים` : ''}`}
        >
          {dateObj.getDate()}
        </div>
      );
    }
    return cells;
  };

  // Selected Day Calories & Metadata
  const selectedCount = Number(normalizedHeat.byDateCount.get(calState.selectedIso) ?? 0);
  const selectedCalories = getCaloriesForDate(calState.selectedIso, normalizedHeat.byDateCount, normalizedHeat.byDateCalories);
  const selectedDateLabel = formatHebrewFullDate(calState.selectedIso);

  // Weight Stats
  const weightSeries = progressData?.overview?.bodyWeight || progressData?.overview?.bodyweight || progressData?.overview?.weight;
  const weightDataPoints = (weightSeries?.data || []).map(Number).filter(Number.isFinite);
  const firstWeight = weightDataPoints[0];
  const lastWeight = weightDataPoints[weightDataPoints.length - 1];
  const weightNowStr = typeof lastWeight === 'number' ? `${lastWeight.toFixed(1)} ק"ג` : '--';
  
  let weightDeltaStr = '--';
  let isWeightUp = false;
  if (typeof firstWeight === 'number' && typeof lastWeight === 'number') {
    const diff = lastWeight - firstWeight;
    const arrow = diff <= 0 ? '↓' : '↑';
    weightDeltaStr = `${arrow} ${Math.abs(diff).toFixed(1)} ק"ג`;
    isWeightUp = diff > 0;
  }

  // 1RM Exercises & Days
  const exercise1RMObj = progressData?.charts?.exercise1RM || progressData?.charts?.exerciseOneRM;
  const availableExercises = exercise1RMObj ? (Array.isArray(exercise1RMObj.exercises) ? exercise1RMObj.exercises : Object.keys(exercise1RMObj.seriesByExercise || {})) : [];
  const workoutDays30 = Array.isArray(progressData?.overview?.workoutDays30) ? progressData.overview.workoutDays30 : [];

  // PRs & Recommendations
  const prs = progressData?.prs || progressData?.personalRecords || [];
  const recs = aiInsights?.recommendations || aiInsights?.recs || [];

  // Process and unify PR & achievement items for Hall of Fame
  const allPrItems = React.useMemo(() => {
    const list = [];
    const seenTitles = new Set();

    if (Array.isArray(achievements) && achievements.length > 0) {
      achievements.forEach(ach => {
        const title = ach.title || ach.category || '';
        if (title && !seenTitles.has(title)) {
          seenTitles.add(title);
          list.push({
            title,
            value: ach.description || 'הישג שושג בהצלחה',
            groupLabel: ach.category || 'הישג מפתח',
            icon: ach.icon || '🏆',
            date: ach.date || '',
            isNew: true,
            weight: 0
          });
        }
      });
    }

    if (Array.isArray(prs) && prs.length > 0) {
      prs.forEach(pr => {
        const title = pr.title || pr.exercise || '';
        if (title && !seenTitles.has(title)) {
          seenTitles.add(title);
          let w = 0;
          if (pr.value) {
            const m = String(pr.value).match(/(\d+(?:\.\d+)?)\s*ק"ג/);
            if (m) w = Number(m[1] || 0);
          }
          list.push({
            title,
            value: pr.value || 'שיא אישי',
            groupLabel: pr.groupLabel || 'תרגיל',
            icon: pr.icon || '🏋️‍♂️',
            date: pr.date || pr.meta || '',
            isNew: Boolean(pr.isNew),
            weight: w
          });
        }
      });
    }

    return list;
  }, [achievements, prs]);

  // Select Hero PR (highest weight / strongest achievement)
  const heroSpotlightPr = React.useMemo(() => {
    if (allPrItems.length === 0) return null;
    return [...allPrItems].sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
  }, [allPrItems]);

  // Secondary PR items (excluding hero when 'all' is active)
  const secondaryPrItems = React.useMemo(() => {
    if (!heroSpotlightPr) return allPrItems;
    return allPrItems.filter(item => item !== heroSpotlightPr);
  }, [allPrItems, heroSpotlightPr]);

  // Filtered PR items according to active tab
  const filteredPrItems = React.useMemo(() => {
    if (activePrFilter === 'all') return allPrItems;
    return allPrItems.filter(item => {
      const title = String(item.title).toLowerCase();
      const group = String(item.groupLabel).toLowerCase();

      if (activePrFilter === 'compound') {
        return title.includes('לחיצת חזה') || title.includes('סקוואט') || title.includes('דדליפט') ||
               title.includes('חתירה') || title.includes('לחיצת כתפיים') || title.includes('פולי עליון') ||
               title.includes('מתח') || title.includes('מקבילים') || title.includes('bench') || title.includes('squat') || title.includes('deadlift');
      }
      if (activePrFilter === 'lower') {
        return group.includes('רגליים') || group.includes('ליבה') || title.includes('סקוואט') || title.includes('ברכיים') || title.includes('בטן') || title.includes('מכרעים');
      }
      if (activePrFilter === 'upper') {
        return group.includes('חזה') || group.includes('גב') || group.includes('כתפיים') || group.includes('ידיים') || title.includes('לחיצת') || title.includes('חתירה');
      }
      return true;
    });
  }, [allPrItems, activePrFilter]);

  return (
    <main className="hero progress-hero" style={{ paddingTop: '120px', paddingBottom: '60px', minHeight: '100vh' }}>
      <div className="container hero-content progress-container">
        <header className="progress-header">
          <h1 className="page-title">מעקב התקדמות</h1>
          <p className="text-muted">הדופק של האימונים שלך, ביצועים, ותובנות חכמות.</p>
        </header>

        {/* Section 1: Consistency & Pulse */}
        <section className="section-block" aria-label="Consistency">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <SvgFlame size={32} color="#f97316" />
              <span>הדופק של האימון</span>
            </h2>
            <div className="section-hint text-muted">משקל גוף + רצף אימונים</div>
          </div>

          <div className="pulse-grid">
            {/* Bodyweight Chart Card */}
            <div className="card card-heatmap">
              <div className="card-head">
                <div className="weight-head">
                  <div className="card-title">משקל גוף</div>
                  <div className="card-subtitle text-muted">מגמה של 30 הימים האחרונים</div>
                </div>
                <div className="weight-stats">
                  <div className={`weight-pill ${isWeightUp ? 'is-up' : ''}`}>{weightDeltaStr}</div>
                  <div className="weight-now">{weightNowStr}</div>
                </div>
              </div>

              <div className="weight-chart">
                <canvas ref={weightCanvasRef} />
              </div>
            </div>

            {/* Calendar & Calories Stack */}
            <div className="stack">
              <div className="card card-streak calendar-card">
                <div className="cal-header">
                  <button type="button" className="cal-nav" onClick={prevMonth} title="חודש קודם">›</button>
                  <div className="cal-title">{getCalendarTitle()}</div>
                  <button type="button" className="cal-nav" onClick={nextMonth} title="חודש הבא">‹</button>
                </div>

                <div className="cal-weekdays">
                  <div>א</div><div>ב</div><div>ג</div><div>ד</div><div>ה</div><div>ו</div><div>ש</div>
                </div>

                <div className="cal-grid">
                  {renderCalendarCells()}
                </div>
              </div>

              <div className="card card-kudos">
                <div className="kudos-title">קלוריות משוערות שנשרפו ביום הנבחר</div>
                <div className="kudos-value"><span>{Math.round(selectedCalories)}</span> קלוריות</div>
                <div className="kudos-text">
                  {selectedCount > 0 ? `${selectedDateLabel} · ${selectedCount} אימונים` : `${selectedDateLabel} · לא התאמנת ביום זה`}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Performance Metrics */}
        <section className="section-block" aria-label="Performance Metrics">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <SvgBarChart size={32} color="#22d3ee" />
              <span>ביצועים</span>
            </h2>
            <div className="section-hint text-muted">כוח מירבי ונפח עבודה</div>
          </div>

          <div className="charts-grid">
            {/* 1RM Chart Card */}
            <div className="card chart-card chart-card--1rm">
              <div className="card-head">
                <div>
                  <div className="card-title">Estimated 1RM</div>
                  <div className="card-subtitle text-muted">
                    {selectedDay1rm ? `יום: ${formatYmdHe(selectedDay1rm)}` : (selectedExercise1rm ? `תרגיל: ${selectedExercise1rm}` : 'בחר תרגיל מיומן האימונים')}
                  </div>
                </div>
                <div className="chart-controls">
                  <div className="chart-select-wrap">
                    <select
                      className="chart-select"
                      value={selectedExercise1rm}
                      disabled={Boolean(selectedDay1rm) || availableExercises.length === 0}
                      onChange={e => setSelectedExercise1rm(e.target.value)}
                    >
                      {availableExercises.length === 0 ? (
                        <option value="">אין תרגילים מתועדים</option>
                      ) : (
                        availableExercises.map(ex => (
                          <option key={ex} value={ex}>{ex}</option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="chart-select-wrap">
                    <select
                      className="chart-select"
                      value={selectedDay1rm}
                      onChange={e => setSelectedDay1rm(e.target.value)}
                    >
                      <option value="">כל הימים (איזון תרגיל)</option>
                      {workoutDays30.map(ymd => (
                        <option key={ymd} value={ymd}>{formatYmdHe(ymd)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="chart-box">
                <canvas ref={chart1rmRef} />
              </div>
            </div>

            {/* Total Volume Load Card */}
            <div className="card chart-card">
              <div className="card-head">
                <div className="card-title">Total Volume Load</div>
                <div className="card-subtitle text-muted">חזרות × משקל לכל אימון</div>
              </div>
              <div className="chart-box chart-box--volume">
                <canvas ref={volumeCanvasRef} />
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Hall of Fame (היכל התהילה) - Redesigned Spotlight Showcase */}
        <section className="section-block hof-section" aria-label="Achievements">
          <div className="hof-header-row">
            <div className="section-title-row" style={{ margin: 0 }}>
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <SvgTrophy size={32} color="#facc15" />
                <span>היכל התהילה</span>
              </h2>
              <div className="section-hint text-muted">שיאים אישיים והישגי מפתח שזוהו מהאימונים</div>
            </div>

            {/* Quick Filter Tabs */}
            <div className="hof-filter-tabs">
              <button
                type="button"
                className={`hof-filter-btn ${activePrFilter === 'all' ? 'is-active' : ''}`}
                onClick={() => setActivePrFilter('all')}
              >
                <span>🌐 כל השיאים</span>
                <span className="hof-filter-count">{allPrItems.length}</span>
              </button>
              <button
                type="button"
                className={`hof-filter-btn ${activePrFilter === 'compound' ? 'is-active' : ''}`}
                onClick={() => setActivePrFilter('compound')}
              >
                <span>🏋️ תרגילי מפתח</span>
              </button>
              <button
                type="button"
                className={`hof-filter-btn ${activePrFilter === 'upper' ? 'is-active' : ''}`}
                onClick={() => setActivePrFilter('upper')}
              >
                <span>💪 פלג גוף עליון</span>
              </button>
              <button
                type="button"
                className={`hof-filter-btn ${activePrFilter === 'lower' ? 'is-active' : ''}`}
                onClick={() => setActivePrFilter('lower')}
              >
                <span>🦵 פלג גוף תחתון</span>
              </button>
            </div>
          </div>

          {achievementsLoading ? (
            <div className="card pr-card is-empty-pr" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="pr-title">מנתח הישגים...</div>
              <div className="pr-meta">בודק את האימונים האחרונים שלך 🔍</div>
            </div>
          ) : filteredPrItems.length > 0 ? (
            <>
              {/* Hero Spotlight Card (Featured Top PR) */}
              {heroSpotlightPr && activePrFilter === 'all' && (
                <div className="hof-hero-card">
                  <div className="hof-hero-top">
                    <div className="hof-hero-badge">
                      <span>👑</span>
                      <span>השיא המוביל במערכת</span>
                    </div>
                    <div className="hof-hero-time">{formatRelativeTimeHe(heroSpotlightPr.date || heroSpotlightPr.meta)}</div>
                  </div>

                  <div className="hof-hero-content">
                    <div className="hof-hero-icon-box">
                      <span>{heroSpotlightPr.icon || '🏋️‍♂️'}</span>
                    </div>
                    <div className="hof-hero-details">
                      <div className="hof-hero-group">{heroSpotlightPr.groupLabel || 'תרגיל מפתח'}</div>
                      <h3 className="hof-hero-title">{heroSpotlightPr.title}</h3>
                      <div className="hof-hero-metrics-row">
                        <div className="hof-hero-value-pill">
                          <span>⚡</span>
                          <span>{heroSpotlightPr.value}</span>
                        </div>
                        {heroSpotlightPr.isNew && (
                          <span className="hof-hero-tag">✨ שיא חדש!</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Secondary PR Grid */}
              <div className="hof-secondary-grid">
                {(activePrFilter === 'all' ? secondaryPrItems : filteredPrItems).map((item, idx) => (
                  <div key={idx} className="hof-card">
                    <div className="hof-card-header">
                      <span className="hof-card-group-tag">
                        <span>{item.icon || '🏋️'}</span>
                        <span>{item.groupLabel || item.category || 'שיא'}</span>
                      </span>
                      {item.isNew && (
                        <span className="hof-card-badge hof-card-badge--new">✨ NEW</span>
                      )}
                    </div>
                    <h4 className="hof-card-title">{item.title}</h4>
                    <div className="hof-card-footer">
                      <span className="hof-card-value">{item.value || item.description}</span>
                      <span className="hof-card-time">{formatRelativeTimeHe(item.date || item.meta)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="card pr-card is-empty-pr" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="pr-title">אין הישגים בקטגוריה זו</div>
              <div className="pr-meta">תעד אימונים בלוג האימונים וכאן יופיעו ההישגים שלך 🏋️</div>
            </div>
          )}
        </section>

        {/* Section 4: Smart Insights & Body Balance */}
        <section className="section-block" aria-label="Smart Insights">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <SvgBrain size={32} color="#a855f7" />
              <span>נתונים נוספים</span>
            </h2>
            <div className="section-hint text-muted">איזון גוף + המלצות חכמות</div>
          </div>

          <div className="insights-grid">
            {/* Body Balance Card */}
            <div className="card muscle-card">
              <div className="card-head">
                <div className="card-title">איזון גוף</div>
                <div className="card-subtitle text-muted">ציון איזון 0–10 · נפח עבודה שנצבר בכל האימונים</div>
              </div>
              <div className="balance-wrap">
                <div className="balance-box">
                  <canvas ref={balanceCanvasRef} />
                </div>
              </div>
            </div>

            {/* Smart Recommendations */}
            <div className={`card rec-card ${recs.length > 3 ? 'is-scroll' : ''}`}>
              <div className="card-head">
                <div className="card-title">המלצות חכמות</div>
                <div className="card-subtitle text-muted">המלצות מהמאמן האישי</div>
              </div>

              <div className="rec-list">
                {(loading || aiInsightsLoading) && recs.length === 0 ? (
                  <div className="rec-item">
                    <div className="rec-title">⏳ מנתח המלצות למתאמן...</div>
                    <div className="rec-text">מפיק המלצות חכמות בזמן אמת מתוך האימונים...</div>
                  </div>
                ) : recs.length === 0 ? (
                  <div className="rec-item">
                    <div className="rec-title">🤖 ממתין לניתוח המלצות למתאמן</div>
                    <div className="rec-text">תעד אימון ביומן לקבלת תובנות והמלצות מותאמות אישית.</div>
                  </div>
                ) : (
                  recs.map((rec, idx) => {
                    const type = (rec.type || 'tip').toLowerCase();
                    return (
                      <div key={idx} className={`rec-item ${type}`}>
                        <div className="rec-title">{rec.title || 'תובנת AI'}</div>
                        <div className="rec-text">{rec.text}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// Utility Functions
function normalizeProgressData(raw) {
  const overview = raw?.overview || raw?.stats || {};
  const heatmap = raw?.heatmap || raw?.heatmapYear || [];
  const charts = raw?.charts || {};
  let rawPrs = raw?.prs || raw?.personalRecords || raw?.summary?.allTimePRs || [];
  let prs = [];
  if (Array.isArray(rawPrs)) {
    prs = rawPrs.map(p => ({
      title: p.title || p.exercise || p.name || 'PR',
      value: p.value || (p.weight ? `${p.weight} ק"ג × ${p.reps}` : ''),
      meta: p.meta || (p.date ? `שיא אישי · ${formatHebrewFullDate(p.date)}` : 'שיא אישי'),
      weight: Number(p.weight || 0),
      reps: Number(p.reps || 0),
      date: p.date || '',
      isNew: p.isNew || false
    }));
  }
  const insights = raw?.insights || raw?.smartInsights || {};

  // Format bodyWeight labels from ISO dates to Hebrew if they are raw dates
  if (overview.bodyWeight && Array.isArray(overview.bodyWeight.labels)) {
    overview.bodyWeight.labels = overview.bodyWeight.labels.map(l => {
      if (typeof l === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l)) {
        return formatYmdHe(l) || l;
      }
      return l;
    });
  }

  // Format volume labels from ISO dates to Hebrew
  if (charts.volume && Array.isArray(charts.volume.labels)) {
    charts.volume.labels = charts.volume.labels.map(l => {
      if (typeof l === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l)) {
        return formatYmdHe(l) || l;
      }
      return l;
    });
  }

  // Format exercise1RM labels from ISO dates to Hebrew
  if (charts.exercise1RM && Array.isArray(charts.exercise1RM.labels)) {
    charts.exercise1RM.labels = charts.exercise1RM.labels.map(l => {
      if (typeof l === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(l)) {
        return formatYmdHe(l) || l;
      }
      return l;
    });
  }

  return { overview, heatmap, charts, prs, insights };
}

const CORE_MUSCLE_GROUPS = [
  { key: 'chest', label: 'חזה', icon: '🏋️‍♂️', defaultEx: 'לחיצת חזה' },
  { key: 'back', label: 'גב', icon: '🦅', defaultEx: 'פולי עליון / חתירה' },
  { key: 'legs', label: 'רגליים', icon: '🦵', defaultEx: 'סקוואט' },
  { key: 'shoulders', label: 'כתפיים', icon: '🎯', defaultEx: 'לחיצת כתפיים' },
  { key: 'arms', label: 'ידיים', icon: '💪', defaultEx: 'כפילת מרפקים' },
  { key: 'core', label: 'ליבה', icon: '⚡', defaultEx: 'פלאנק / כפיפות בטן' }
];

function buildUnifiedProgressMetrics(normalizedData, localLogsObj) {
  const muscleVolume = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
  const bestByGroup = new Map();
  const workoutVolumeByDate = new Map();

  const recordCandidate = (groupKey, candidate) => {
    const prev = bestByGroup.get(groupKey);
    const candW = candidate.weight || 0;
    const candR = candidate.reps || 0;
    const candScore = candW * 100 + candR;

    if (!prev) {
      bestByGroup.set(groupKey, candidate);
      return;
    }
    const prevW = prev.weight || 0;
    const prevR = prev.reps || 0;
    const prevScore = prevW * 100 + prevR;

    if (candScore > prevScore) {
      bestByGroup.set(groupKey, candidate);
    }
  };

  // 1. Process local logs (if any exist)
  const logEntries = Object.entries(localLogsObj || {});
  logEntries.forEach(([dateStr, log]) => {
    const exercises = Array.isArray(log?.exercises) ? log.exercises : [];
    let dayVol = 0;

    exercises.forEach(ex => {
      const exName = String(ex.name || ex.exercise || '').trim();
      if (!exName) return;

      const groupKey = categorizeExerciseMuscleGroup(exName);
      const sets = Array.isArray(ex.sets) ? ex.sets : [];

      sets.forEach(s => {
        const weight = Number(s.weight || 0);
        const reps = Number(s.reps || 0);
        if (weight > 0 || reps > 0) {
          const setVol = weight > 0 ? (weight * reps) : reps;
          dayVol += setVol;
          muscleVolume[groupKey] = (muscleVolume[groupKey] || 0) + setVol;
          const isRecent = dateStr && (new Date() - new Date(dateStr + 'T00:00:00')) < (14 * 24 * 60 * 60 * 1000);
          recordCandidate(groupKey, {
            groupKey,
            exercise: exName,
            weight,
            reps,
            value: weight > 0 ? `${weight} ק"ג × ${reps} חזרות` : `${reps} חזרות`,
            meta: dateStr ? `שיא אישי · ${formatHebrewFullDate(dateStr)}` : 'שיא אישי',
            isNew: Boolean(isRecent),
            date: dateStr
          });
        }
      });
    });

    if (dayVol > 0) {
      workoutVolumeByDate.set(dateStr, Math.round(dayVol));
    }
  });

  // 2. Process normalizedData.prs (from API or backend DB)
  const existingPrs = normalizedData?.prs || normalizedData?.personalRecords || [];
  (existingPrs || []).forEach(p => {
    const title = String(p.title || p.exercise || p.name || '').trim();
    if (!title) return;

    const groupKey = categorizeExerciseMuscleGroup(title);
    let weight = Number(p.weight || 0);
    let reps = Number(p.reps || 0);
    if (!weight && p.value) {
      const match = String(p.value).match(/(\d+(?:\.\d+)?)\s*ק"ג(?:\s*×\s*(\d+))?/);
      if (match) {
        weight = Number(match[1] || 0);
        reps = Number(match[2] || 1);
      }
    }

    const dateStr = p.date || p.meta || '';
    const isRecent = p.isNew || (dateStr && (new Date() - new Date(dateStr + 'T00:00:00')) < (14 * 24 * 60 * 60 * 1000));

    recordCandidate(groupKey, {
      groupKey,
      exercise: title,
      weight,
      reps,
      value: p.value || (weight > 0 ? `${weight} ק"ג × ${reps} חזרות` : 'שיא אישי'),
      meta: p.meta || (dateStr ? `שיא אישי · ${formatHebrewFullDate(dateStr)}` : 'שיא אישי'),
      isNew: Boolean(isRecent),
      date: dateStr
    });

    if (p.date && weight > 0 && reps > 0) {
      const dateOnly = p.date.includes('T') ? p.date.split('T')[0] : p.date;
      const vol = weight * reps * 3;
      workoutVolumeByDate.set(dateOnly, (workoutVolumeByDate.get(dateOnly) || 0) + vol);
    }
  });

  // 3. Construct ONLY active PR Cards (0 to 6 max based on actual user data)
  const finalPrs = [];
  CORE_MUSCLE_GROUPS.forEach(grp => {
    const best = bestByGroup.get(grp.key);
    if (best) {
      finalPrs.push({
        groupLabel: grp.label,
        icon: grp.icon,
        title: best.exercise,
        value: best.value,
        meta: best.meta,
        isNew: best.isNew,
        hasData: true,
        date: best.date
      });
    }
  });

  // 4. Construct Final Body Balance Radar Data (total volume per muscle group across all past trainings)
  const balanceData = [
    muscleVolume.chest,
    muscleVolume.back,
    muscleVolume.legs,
    muscleVolume.shoulders,
    muscleVolume.arms,
    muscleVolume.core
  ];

  // 5. Construct Final Volume Chart Data
  let volumeChart = normalizedData?.charts?.volume || normalizedData?.charts?.volumeLoad;
  if (!volumeChart || !Array.isArray(volumeChart.data) || volumeChart.data.length === 0) {
    if (workoutVolumeByDate.size > 0) {
      const sortedDates = Array.from(workoutVolumeByDate.keys()).sort();
      volumeChart = {
        labels: sortedDates.map(d => formatYmdHe(d) || d),
        data: sortedDates.map(d => workoutVolumeByDate.get(d))
      };
    }
  }

  return {
    prs: finalPrs,
    balance: {
      labels: ['חזה', 'גב', 'רגליים', 'כתפיים', 'ידיים', 'ליבה'],
      data: balanceData,
      rawVolume: muscleVolume
    },
    volumeChart
  };
}

function categorizeExerciseMuscleGroup(name) {
  const s = String(name || '').toLowerCase().trim();
  if (!s) return 'chest';

  if (s.includes('חזה') || s.includes('bench') || s.includes('chest') || s.includes('fly') || s.includes('פרפר') || s.includes('מקבילים') || s.includes('פושאפס') || s.includes('שכיבות שמיכה')) {
    return 'chest';
  }
  if (s.includes('גב') || s.includes('חתירה') || s.includes('row') || s.includes('pull') || s.includes('lat') || s.includes('מתח') || s.includes('דדליפט') || s.includes('deadlift') || s.includes('פולי')) {
    return 'back';
  }
  if (s.includes('רגליים') || s.includes('סקוואט') || s.includes('squat') || s.includes('lunge') || s.includes('מכרעים') || s.includes('פשטת ברכיים') || s.includes('כפופת ברכיים') || s.includes('ברכיים') || s.includes('תאומים') || s.includes('calf') || s.includes('leg') || s.includes('היפ תראסט') || s.includes('hip thrust')) {
    return 'legs';
  }
  if (s.includes('כתפיים') || s.includes('כתפיים') || s.includes('overhead') || s.includes('shoulder') || s.includes('lateral') || s.includes('ארנולד') || s.includes('לחיצת כתפיים') || s.includes('הרחקה')) {
    return 'shoulders';
  }
  if (s.includes('ידיים') || s.includes('יד קדמית') || s.includes('יד אחורית') || s.includes('curl') || s.includes('bicep') || s.includes('tricep') || s.includes('פטישים') || s.includes('hammer') || s.includes('פשטת מרפקים') || s.includes('כפילת מרפקים')) {
    return 'arms';
  }
  if (s.includes('ליבה') || s.includes('בטן') || s.includes('abs') || s.includes('plank') || s.includes('פלאנק') || s.includes('crunch') || s.includes('כפיפות בטן')) {
    return 'core';
  }

  return 'chest';
}

function getAllUserTrainingLogs(userId) {
  const combined = {};

  if (userId) {
    const keys = [
      `fitmentor_user_logs_${userId}`,
      `fitmentor_user_logs_${String(userId).toLowerCase().trim()}`,
      `fitmentor_user_logs_${String(userId).toUpperCase().trim()}`
    ];
    keys.forEach(k => {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') Object.assign(combined, parsed);
        }
      } catch {}
    });
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fitmentor_user_logs_')) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            Object.assign(combined, parsed);
          }
        }
      }
    }
  } catch (e) {
    console.error('Error scanning local logs:', e);
  }

  return combined;
}

function mergeLocalLogsWithProgressData(normalizedData, userId) {
  const localLogs = getAllUserTrainingLogs(userId);
  const localLogDates = Object.keys(localLogs).sort();
  const hasLocalData = localLogDates.length > 0;

  // Only compute unified metrics from local if we have local data
  const metrics = hasLocalData ? buildUnifiedProgressMetrics(normalizedData, localLogs) : null;

  // Start from the API/backend data
  const insights = { ...(normalizedData.insights || {}) };
  const charts = { ...(normalizedData.charts || {}) };
  const overview = { ...(normalizedData.overview || {}) };

  // Only override balance if local data produced non-zero values
  if (metrics?.balance?.data && metrics.balance.data.some(v => v > 0)) {
    insights.balance = metrics.balance;
  }

  // Only override volume if local data produced actual volume entries
  if (metrics?.volumeChart?.data && metrics.volumeChart.data.some(v => v > 0)) {
    charts.volume = metrics.volumeChart;
  }

  if (hasLocalData) {
    // 1. Heatmap (Calendar) — merge local workout dates into heatmap
    const existingHeatmap = Array.isArray(normalizedData.heatmap) ? [...normalizedData.heatmap] : [];
    const existingDates = new Set(existingHeatmap.map(h => h.date));
    localLogDates.forEach(d => {
      if (!existingDates.has(d)) {
        const log = localLogs[d];
        const exCount = Array.isArray(log?.exercises) ? log.exercises.length : 1;
        existingHeatmap.push({
          date: d,
          count: exCount,
          calories: 220 + (exCount * 70)
        });
      }
    });

    // 2. Body Weight Chart — supplement from local if API didn't provide it
    const apiHasBodyWeight = overview.bodyWeight?.data?.some(v => Number.isFinite(Number(v)) && Number(v) > 0);
    if (!apiHasBodyWeight) {
      const weightEntries = localLogDates
        .map(d => ({ date: d, weight: Number(localLogs[d]?.bodyWeightKg) }))
        .filter(x => Number.isFinite(x.weight) && x.weight > 0);

      if (weightEntries.length > 0) {
        overview.bodyWeight = {
          labels: weightEntries.map(e => formatYmdHe(e.date) || e.date),
          data: weightEntries.map(e => e.weight)
        };
      } else {
        let userWeight = null;
        try {
          const p = localStorage.getItem('fitmentor_user_profile');
          if (p) userWeight = Number(JSON.parse(p)?.weight);
        } catch {}
        if (userWeight && userWeight > 0) {
          overview.bodyWeight = {
            labels: localLogDates.map(d => formatYmdHe(d) || d),
            data: localLogDates.map(() => userWeight)
          };
        }
      }
    }

    // 3. 1RM Exercises & Series — supplement from local if API didn't provide it
    const apiHas1RM = charts.exercise1RM?.exercises?.length > 0;
    if (!apiHas1RM) {
      const seriesByExercise = {};
      const exercisesSet = new Set();
      const ex1rmByDay30 = {};

      localLogDates.forEach(d => {
        const log = localLogs[d];
        if (log && Array.isArray(log.exercises)) {
          ex1rmByDay30[d] = {};
          log.exercises.forEach(ex => {
            if (!ex.name && !ex.exercise) return;
            const exName = String(ex.name || ex.exercise).trim();
            if (!exName) return;
            exercisesSet.add(exName);

            let max1RM = 0;
            if (Array.isArray(ex.sets)) {
              ex.sets.forEach(s => {
                const w = Number(s.weight || 0);
                const r = Number(s.reps || 0);
                if (w > 0) {
                  const est1RM = r > 1 ? Math.round(w * (1 + r / 30)) : w;
                  if (est1RM > max1RM) max1RM = est1RM;
                }
              });
            }
            if (max1RM > 0) {
              ex1rmByDay30[d][exName] = max1RM;
            }
          });
        }
      });

      const exercisesList = Array.from(exercisesSet);
      exercisesList.forEach(exName => {
        seriesByExercise[exName] = localLogDates.map(d => {
          return ex1rmByDay30[d]?.[exName] || null;
        });
      });

      overview.workoutDays30 = localLogDates;
      overview.exercise1rmByDay30 = ex1rmByDay30;

      charts.exercise1RM = {
        exercises: exercisesList,
        seriesByExercise,
        labels: localLogDates.map(d => formatYmdHe(d) || d)
      };
    }

    const prs = metrics?.prs || normalizedData.prs || [];
    return { ...normalizedData, overview, heatmap: existingHeatmap, charts, prs, insights };
  }

  // No local data — just pass through the API data with the (preserved) insights/charts
  return { ...normalizedData, overview, charts, insights };
}

function coerceHeatmapYear(input) {
  const byDateCount = new Map();
  const byDateCalories = new Map();
  for (const item of Array.isArray(input) ? input : []) {
    if (!item || typeof item.date !== 'string') continue;
    const count = Number(item.count ?? 0);
    byDateCount.set(item.date, Number.isFinite(count) ? count : 0);
    const calories = Number(item.calories);
    if (Number.isFinite(calories)) byDateCalories.set(item.date, calories);
  }
  return { byDateCount, byDateCalories };
}

function getCaloriesForDate(iso, byDateCount, byDateCalories) {
  const fromData = Number(byDateCalories?.get(iso));
  if (Number.isFinite(fromData)) return fromData;
  const count = Number(byDateCount?.get(iso) ?? 0);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return 220 + count * 140;
}

function toISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatYmdHe(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  try {
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ymd + 'T00:00:00'));
  } catch {
    return ymd;
  }
}

function formatHebrewFullDate(iso) {
  try {
    return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso + 'T00:00:00'));
  } catch {
    return iso;
  }
}

function formatRelativeTimeHe(dateStr) {
  if (!dateStr) return 'שיא אישי';
  try {
    const cleanDate = String(dateStr).includes('T') ? String(dateStr).split('T')[0] : String(dateStr);
    const parts = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!parts) {
      if (cleanDate.includes('לפני') || cleanDate.includes('היום') || cleanDate.includes('אתמול') || cleanDate.includes('שיא')) {
        return cleanDate;
      }
      return cleanDate;
    }
    const now = new Date();
    const target = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
    const diffDays = Math.floor((now - target) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'היום 🔥';
    if (diffDays === 1) return 'אתמול ⚡';
    if (diffDays === 2) return 'לפני יומיים';
    if (diffDays > 2 && diffDays <= 7) return `לפני ${diffDays} ימים`;
    if (diffDays > 7 && diffDays <= 14) return 'לפני שבוע';
    if (diffDays > 14 && diffDays <= 30) return `לפני ${Math.floor(diffDays / 7)} שבועות`;
    return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short' }).format(target);
  } catch {
    return String(dateStr || 'שיא אישי');
  }
}

function defaultRecTitle(type) {
  if (type === 'neglect') return '⚠️ נקודת חולשה';
  if (type === 'stall') return '📉 זיהוי תקיעות';
  if (type === 'progression') return '🚀 הצעת התקדמות';
  return '💡 טיפ';
}

const BALANCE_MUSCLE_GROUPS = [
  { key: 'chest', label: 'חזה', icon: '🏋️‍♂️' },
  { key: 'back', label: 'גב', icon: '🦅' },
  { key: 'legs', label: 'רגליים', icon: '🦵' },
  { key: 'shoulders', label: 'כתפיים', icon: '🎯' },
  { key: 'arms', label: 'ידיים', icon: '💪' },
  { key: 'core', label: 'ליבה', icon: '⚡' }
];

// Summarizes ALL past trainings into a per-body-part "balance" score.
// Metric = total volume (tonnage) lifted per muscle group across the user's
// real training history, normalized to 0–10 (the strongest group = 10).
function computeBodyBalance(progressData, aiInsights) {
  const pBalance = progressData?.insights?.balance || progressData?.insights?.bodyBalance || progressData?.insights?.muscleBalance;
  const aBalance = aiInsights?.balance || aiInsights?.bodyBalance || aiInsights?.muscleBalance;

  const balance = (pBalance?.data && pBalance.data.some(v => Number(v) > 0))
    ? pBalance
    : ((aBalance?.data && aBalance.data.some(v => Number(v) > 0)) ? aBalance : (pBalance || aBalance));

  const rawByKey = {};
  BALANCE_MUSCLE_GROUPS.forEach((g, i) => {
    let v = null;
    if (balance?.data && Array.isArray(balance.data) && i < balance.data.length) {
      v = Number(balance.data[i]);
    } else if (balance) {
      v = Number(balance[g.key] ?? 0);
    }
    rawByKey[g.key] = Number.isFinite(v) ? Math.max(0, v) : 0;
  });

  const maxRaw = Math.max(1, ...Object.values(rawByKey));
  const groups = BALANCE_MUSCLE_GROUPS.map(g => {
    const volume = rawByKey[g.key];
    const score = Math.round((volume / maxRaw) * 10);
    return { key: g.key, label: g.label, icon: g.icon, volume, score };
  });

  return {
    groups,
    hasData: groups.some(g => g.volume > 0),
    maxRaw
  };
}

function formatVolume(v) {
  const n = Number(v) || 0;
  if (n >= 1000) {
    const tons = n / 1000;
    return `${(Math.round(tons * 10) / 10).toLocaleString('en-US')} טון`;
  }
  return `${Math.round(n).toLocaleString('en-US')} ק"ג`;
}

function getRecentTrainingLogs(userId, count = 10) {
  try {
    const logs = getAllUserTrainingLogs(userId);
    return Object.entries(logs)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .slice(0, count)
      .map(([date, log]) => ({
        date,
        notes: log?.notes || '',
        exercises: (log?.exercises || []).map(ex => ({
          name: ex.name || ex.exercise,
          sets: (ex.sets || []).map(s => ({
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 0
          }))
        }))
      }));
  } catch (e) {
    console.error('Error reading training logs for achievements:', e);
    return [];
  }
}

function fallbackExtractAchievements(logs) {
  const achievements = [];
  if (!Array.isArray(logs) || logs.length === 0) return achievements;

  const prMap = new Map();
  let totalVolumeAll = 0;

  logs.forEach(log => {
    const dateStr = log.date || '';
    (log.exercises || []).forEach(ex => {
      const exName = String(ex.name || '').trim();
      if (!exName) return;
      (ex.sets || []).forEach(s => {
        const w = Number(s.weight || 0);
        const r = Number(s.reps || 0);
        if (w > 0 || r > 0) {
          totalVolumeAll += (w * (r || 1));
          const prev = prMap.get(exName);
          if (!prev || w > prev.weight || (w === prev.weight && r > prev.reps)) {
            prMap.set(exName, { exercise: exName, weight: w, reps: r, date: dateStr });
          }
        }
      });
    });
  });

  // Top PRs
  const topPrs = Array.from(prMap.values())
    .sort((a, b) => (b.weight * 100 + b.reps) - (a.weight * 100 + a.reps))
    .slice(0, 4);

  topPrs.forEach(pr => {
    achievements.push({
      icon: '🏆',
      category: 'שיא אישי',
      title: `${pr.exercise} ${pr.weight > 0 ? pr.weight + ' ק"ג' : ''}`,
      description: `שברת שיא אישי עם ${pr.weight > 0 ? pr.weight + ' ק"ג × ' : ''}${pr.reps} חזרות!`,
      date: pr.date
    });
  });

  // Consistency achievement
  if (logs.length >= 3) {
    achievements.push({
      icon: '🔥',
      category: 'רצף אימונים',
      title: `${logs.length} אימונים שתועדו`,
      description: 'התמדה מרשימה באימונים! שומר על נפח עבודה גבוה.',
      date: logs[0]?.date || ''
    });
  }

  // Volume achievement
  if (totalVolumeAll > 1000) {
    achievements.push({
      icon: '⚡',
      category: 'נפח עבודה',
      title: `סה"כ ${Math.round(totalVolumeAll)} ק"ג`,
      description: 'נפח עבודה כולל מרשים ביותר שהורם באימונים האחרונים!',
      date: logs[0]?.date || ''
    });
  }

  return achievements;
}

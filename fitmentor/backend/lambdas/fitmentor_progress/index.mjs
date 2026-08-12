import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  };

  try {
    if (event?.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

    const body = parseBody(event);
    const { action, userId, payload = {} } = body || {};
    if (!action || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Missing fields" }) };
    }

    const normalizedUserId = String(userId).toLowerCase().trim();
    if (!normalizedUserId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Missing userId" }) };
    }

    switch (action) {
      case "getProgressData": {
        const result = await handleGetProgressData(normalizedUserId, payload);
        return { statusCode: 200, headers, body: JSON.stringify(result) };
      }
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid action: ${action}` }) };
    }
  } catch (error) {
    console.error("Handler Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: error?.message || "Internal Server Error" }),
    };
  }
};

function parseBody(event) {
  if (!event) return {};
  if (event.body) return typeof event.body === "string" ? JSON.parse(event.body) : event.body;
  return event;
}

async function handleGetProgressData(userId, payload) {
  const maxDays = Number.isFinite(Number(payload?.days)) ? Number(payload.days) : 365;
  const trainingLogs = await queryTrainingLogs(userId);
  return buildProgressFromTrainingLogs(trainingLogs, { maxDays });
}

async function queryTrainingLogs(userId) {
  const rawId = String(userId || "").trim();
  const lowerId = rawId.toLowerCase();
  const idsToTry = Array.from(new Set([lowerId, rawId])).filter(Boolean);

  for (const targetId of idsToTry) {
    const all = [];
    let lastKey;
    do {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "UserID = :userId AND begins_with(DataType, :prefix)",
          ExpressionAttributeValues: {
            ":userId": targetId,
            ":prefix": "TrainingLog_",
          },
          ExclusiveStartKey: lastKey,
        })
      );
      all.push(...(res.Items || []));
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    if (all.length > 0) {
      const logs = (all || [])
        .map((item) => {
          const { UserID, DataType, Data, ...rest } = item || {};
          const date = String(DataType || "").replace(/^TrainingLog_/, "");
          const data = Data ?? rest;
          return { date, data };
        })
        .filter((x) => isYmd(x.date));

      logs.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      return logs;
    }
  }

  return [];
}

function buildProgressFromTrainingLogs(logs, { maxDays = 365 } = {}) {
  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(today.getDate() - (Math.max(1, maxDays) - 1));

  const dayAgg = new Map();
  const allTimeBestSet = new Map(); 
  const allTimeBest1rm = new Map();
  // Track per-day per-exercise 1RM and per-day muscle set counts
  const exercise1rmByDay = {};  // { "2026-07-22": { "Bench Press": 95, ... } }
  const muscleSetsTotal = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
  const allExerciseNames = new Set();

  for (const log of logs) {
    if (!log || !isYmd(log.date)) continue;
    const d = parseYmd(log.date);
    if (!d) continue;
    if (d < start || d > today) continue;

    const data = log.data || {};
    const exercises = Array.isArray(data.exercises) ? data.exercises : [];
    const bodyWeightKg = toNumber(data.bodyWeightKg);

    let totalSets = 0;
    let totalVolume = 0;
    const muscle = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
    const oneRM = { bench: null, squat: null, deadlift: null };
    const dayExercise1rm = {};

    for (const ex of exercises) {
      const name = String(ex?.name || "").trim();
      if (!name) continue;
      allExerciseNames.add(name);
      const sets = Array.isArray(ex?.sets) ? ex.sets : [];
      let bestEst1rm = 0;

      for (const s of sets) {
        const reps = toNumber(s?.reps);
        const weight = toNumber(s?.weight);
        if (!Number.isFinite(reps) || reps <= 0) continue;
        totalSets += 1;
        const group = muscleGroupForExercise(name);
        muscleSetsTotal[group] = (muscleSetsTotal[group] || 0) + 1;

        if (Number.isFinite(weight) && weight > 0) {
          totalVolume += weight * reps;
          muscle[group] = (muscle[group] || 0) + (weight * reps);

          const prev = allTimeBestSet.get(name);
          if (!prev || weight > prev.weight || (weight === prev.weight && reps > prev.reps)) {
            allTimeBestSet.set(name, { weight, reps, date: log.date });
          }

          // Estimated 1RM for this set
          const est = estimate1rmEpley(weight, reps);
          if (Number.isFinite(est) && est > bestEst1rm) bestEst1rm = est;
        }

        const liftKey = mainLiftKey(name);
        if (liftKey && Number.isFinite(weight) && weight > 0) {
          const est = estimate1rmEpley(weight, reps);
          if (Number.isFinite(est)) {
            if (oneRM[liftKey] == null || est > oneRM[liftKey]) oneRM[liftKey] = est;
            const prev1 = allTimeBest1rm.get(liftKey);
            if (!prev1 || est > prev1.value) allTimeBest1rm.set(liftKey, { value: est, date: log.date });
          }
        }
      }

      if (bestEst1rm > 0) {
        dayExercise1rm[name] = Math.round(bestEst1rm);
      }
    }

    if (Object.keys(dayExercise1rm).length > 0) {
      exercise1rmByDay[log.date] = dayExercise1rm;
    }

    const calories = estimateCalories({ totalSets, totalVolume });
    const existing = dayAgg.get(log.date) || {
      workouts: 0,
      calories: 0,
      volume: 0,
      sets: 0,
      oneRM: { bench: null, squat: null, deadlift: null },
      muscle: { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 },
      bodyWeightKg: null,
    };
    existing.workouts += 1;
    existing.calories += calories;
    existing.volume += totalVolume;
    existing.sets += totalSets;
    existing.bodyWeightKg = Number.isFinite(bodyWeightKg) ? bodyWeightKg : existing.bodyWeightKg;
    for (const k of Object.keys(existing.muscle)) existing.muscle[k] += muscle[k] || 0;
    for (const k of Object.keys(existing.oneRM)) {
      const v = oneRM[k];
      if (v != null && (existing.oneRM[k] == null || v > existing.oneRM[k])) existing.oneRM[k] = v;
    }
    dayAgg.set(log.date, existing);
  }

  // Build heatmap
  const heatmap = [];
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ymd = toYmd(d);
    const a = dayAgg.get(ymd);
    if (!a) continue;
    heatmap.push({ date: ymd, count: a.workouts, calories: Math.round(a.calories) });
  }

  // Build sorted workout dates
  const workoutDays = Array.from(dayAgg.keys()).sort();

  // Build bodyWeight chart series
  const weightEntries = workoutDays
    .filter(d => Number.isFinite(dayAgg.get(d)?.bodyWeightKg) && dayAgg.get(d).bodyWeightKg > 0)
    .map(d => ({ date: d, weight: dayAgg.get(d).bodyWeightKg }));

  // Build volume chart series
  const volumeLabels = workoutDays.filter(d => dayAgg.get(d)?.volume > 0);
  const volumeData = volumeLabels.map(d => Math.round(dayAgg.get(d).volume));

  // Build exercise1RM series for line chart (per exercise over time)
  const exercisesList = Array.from(allExerciseNames);
  const seriesByExercise = {};
  exercisesList.forEach(exName => {
    seriesByExercise[exName] = workoutDays.map(d => exercise1rmByDay[d]?.[exName] || null);
  });

  // Build muscle balance (total sets per group)
  const balanceLabels = ["חזה", "גב", "רגליים", "כתפיים", "ידיים", "ליבה"];
  const balanceData = [
    muscleSetsTotal.chest,
    muscleSetsTotal.back,
    muscleSetsTotal.legs,
    muscleSetsTotal.shoulders,
    muscleSetsTotal.arms,
    muscleSetsTotal.core
  ];

  return {
    heatmap,
    overview: {
      bodyWeight: {
        labels: weightEntries.map(e => e.date),
        data: weightEntries.map(e => e.weight)
      },
      workoutDays30: workoutDays,
      exercise1rmByDay30: exercise1rmByDay
    },
    charts: {
      volume: {
        labels: volumeLabels,
        data: volumeData
      },
      exercise1RM: {
        exercises: exercisesList,
        seriesByExercise,
        labels: workoutDays
      }
    },
    insights: {
      balance: {
        labels: balanceLabels,
        data: balanceData
      }
    },
    summary: {
      totalWorkoutsLogged: dayAgg.size,
      allTimePRs: Array.from(allTimeBestSet.entries()).map(([exercise, pr]) => ({ exercise, ...pr }))
    }
  };
}

function isYmd(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
function parseYmd(s) {
  if (!isYmd(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfDay(d) {
  const res = new Date(d);
  res.setHours(0, 0, 0, 0);
  return res;
}
function toNumber(v) {
  if (v == null || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function muscleGroupForExercise(name) {
  const lower = String(name).toLowerCase();
  if (lower.includes("bench") || lower.includes("chest") || lower.includes("pushup") || lower.includes("חזה") || lower.includes("פרפר") || lower.includes("מקבילים") || lower.includes("פושאפס") || lower.includes("שכיבות")) return "chest";
  if (lower.includes("row") || lower.includes("pull") || lower.includes("lat") || lower.includes("גב") || lower.includes("חתירה") || lower.includes("מתח") || lower.includes("דדליפט") || lower.includes("deadlift") || lower.includes("פולי")) return "back";
  if (lower.includes("squat") || lower.includes("leg") || lower.includes("lunge") || lower.includes("רגליים") || lower.includes("סקוואט") || lower.includes("מכרעים") || lower.includes("ברכיים") || lower.includes("תאומים") || lower.includes("calf") || lower.includes("היפ") || lower.includes("hip")) return "legs";
  if (lower.includes("press") || lower.includes("delt") || lower.includes("shoulder") || lower.includes("overhead") || lower.includes("lateral") || lower.includes("כתפיים") || lower.includes("ארנולד") || lower.includes("הרחקה")) return "shoulders";
  if (lower.includes("curl") || lower.includes("tricep") || lower.includes("bicep") || lower.includes("hammer") || lower.includes("ידיים") || lower.includes("יד קדמית") || lower.includes("יד אחורית") || lower.includes("פטישים") || lower.includes("מרפקים")) return "arms";
  if (lower.includes("abs") || lower.includes("plank") || lower.includes("crunch") || lower.includes("ליבה") || lower.includes("בטן") || lower.includes("פלאנק") || lower.includes("כפיפות בטן")) return "core";
  return "core";
}
function mainLiftKey(name) {
  const lower = String(name).toLowerCase();
  if (lower.includes("bench")) return "bench";
  if (lower.includes("squat")) return "squat";
  if (lower.includes("deadlift")) return "deadlift";
  return null;
}
function estimate1rmEpley(weight, reps) {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}
function estimateCalories({ totalSets = 0, totalVolume = 0 }) {
  return Math.round(totalSets * 12 + totalVolume * 0.02);
}

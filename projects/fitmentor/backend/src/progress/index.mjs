import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
	const headers = {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Headers": "Content-Type",
		"Access-Control-Allow-Methods": "OPTIONS,POST,GET",
	};

	try {
		if (event?.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

		const body = event?.body ? (typeof event.body === "string" ? JSON.parse(event.body) : event.body) : event;
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
		return {
			statusCode: 500,
			headers,
			body: JSON.stringify({ message: error?.message || "Internal Server Error" }),
		};
	}
};

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
		const muscle = {
			chest: 0,
			back: 0,
			legs: 0,
			shoulders: 0,
			arms: 0,
			core: 0,
		};

		const oneRM = { bench: null, squat: null, deadlift: null };
		const ex1rm = {};

		for (const ex of exercises) {
			const name = String(ex?.name || "").trim();
			if (!name) continue;
			const sets = Array.isArray(ex?.sets) ? ex.sets : [];
			for (const s of sets) {
				const reps = toNumber(s?.reps);
				const weight = toNumber(s?.weight);
				if (!Number.isFinite(reps) || reps <= 0) continue;
				totalSets += 1;
				if (Number.isFinite(weight) && weight > 0) {
					totalVolume += weight * reps;
					const group = muscleGroupForExercise(name);
					muscle[group] += weight * reps;
					const estAny = estimate1rmEpley(weight, reps);
					if (Number.isFinite(estAny)) {
						const prevAny = ex1rm[name];
						if (prevAny == null || estAny > prevAny) ex1rm[name] = estAny;
					}
					const prev = allTimeBestSet.get(name);
					if (!prev || weight > prev.weight || (weight === prev.weight && reps > prev.reps)) {
						allTimeBestSet.set(name, { weight, reps, date: log.date });
					}
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
		}

		const calories = estimateCalories({ totalSets, totalVolume, exercisesCount: exercises.length });
		const existing = dayAgg.get(log.date) || {
			workouts: 0,
			calories: 0,
			volume: 0,
			oneRM: { bench: null, squat: null, deadlift: null },
			ex1rm: {},
			muscle: { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 },
			bodyWeightKg: null,
		};
		existing.workouts += 1;
		existing.calories += calories;
		existing.volume += totalVolume;
		existing.bodyWeightKg = Number.isFinite(bodyWeightKg) ? bodyWeightKg : existing.bodyWeightKg;
		for (const k of Object.keys(existing.muscle)) existing.muscle[k] += muscle[k] || 0;
		for (const k of Object.keys(existing.oneRM)) {
			const v = oneRM[k];
			if (v != null && (existing.oneRM[k] == null || v > existing.oneRM[k])) existing.oneRM[k] = v;
		}
		for (const [name, v] of Object.entries(ex1rm)) {
			if (!Number.isFinite(v)) continue;
			const prev = existing.ex1rm?.[name];
			if (prev == null || v > prev) existing.ex1rm[name] = v;
		}
		dayAgg.set(log.date, existing);
	}

	const heatmap = [];
	for (let i = 0; i < maxDays; i++) {
		const d = new Date(start);
		d.setDate(start.getDate() + i);
		const ymd = toYmd(d);
		const a = dayAgg.get(ymd);
		if (!a) continue;
		heatmap.push({ date: ymd, count: a.workouts, calories: Math.round(a.calories) });
	}

	const last30Start = new Date(today);
	last30Start.setDate(today.getDate() - 29);

	const workoutDays30 = [];
	const exercise1rmByDay30 = {};

	const bwLabels = [];
	const bwData = [];
	for (let i = 0; i < 30; i++) {
		const d = new Date(last30Start);
		d.setDate(last30Start.getDate() + i);
		const ymd = toYmd(d);
		const a = dayAgg.get(ymd);
		if (!a || !(a.workouts > 0)) continue;

		workoutDays30.push(ymd);
		exercise1rmByDay30[ymd] = a?.ex1rm || {};

		if (!Number.isFinite(a.bodyWeightKg)) continue;
		bwLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
		bwData.push(Number(a.bodyWeightKg));
	}

	workoutDays30.sort((a, b) => String(b).localeCompare(String(a)));

	const overview = {
		hasAnyWorkouts: dayAgg.size > 0,
		workoutDays30,
		exercise1rmByDay30,
		bodyWeight: bwLabels.length ? { labels: bwLabels, data: bwData } : null,
	};

	const workoutDays = Array.from(dayAgg.keys()).sort((a, b) => String(a).localeCompare(String(b)));
	const recentDays = workoutDays.slice(Math.max(0, workoutDays.length - 10));
	const chartLabels = recentDays.map((ymd) => {
		const d = parseYmd(ymd);
		return d ? `${d.getDate()}/${d.getMonth() + 1}` : ymd;
	});

	const bench = [];
	const squat = [];
	const deadlift = [];
	for (const ymd of recentDays) {
		const a = dayAgg.get(ymd);
		bench.push(a?.oneRM?.bench != null ? round1(a.oneRM.bench) : null);
		squat.push(a?.oneRM?.squat != null ? round1(a.oneRM.squat) : null);
		deadlift.push(a?.oneRM?.deadlift != null ? round1(a.oneRM.deadlift) : null);
	}

	const volStart = new Date(today);
	volStart.setDate(today.getDate() - 13);
	const volumeDays = workoutDays.filter((ymd) => {
		const d = parseYmd(ymd);
		return d && d >= volStart && d <= today;
	});
	const volumeLabels = volumeDays.map((ymd) => {
		const d = parseYmd(ymd);
		return d ? `${d.getDate()}/${d.getMonth() + 1}` : ymd;
	});
	const volumeData = volumeDays.map((ymd) => {
		const a = dayAgg.get(ymd);
		return a?.volume ? Math.round(a.volume) : 0;
	});

	const charts = {
		oneRM: {
			labels: chartLabels,
			datasets: [
				{ key: "bench", label: "Bench", data: bench },
				{ key: "squat", label: "Squat", data: squat },
				{ key: "deadlift", label: "Deadlift", data: deadlift },
			],
		},
		exercise1RM: buildExercise1rmChart({ dayAgg, recentDays, chartLabels }),
		volume: {
			labels: volumeLabels,
			data: volumeData,
		},
	};

	const prs = buildPrCards({ allTimeBestSet, allTimeBest1rm, today });
	const insights = buildInsights({ dayAgg, today });

	return { overview, heatmap, charts, prs, insights };
}

function buildExercise1rmChart({ dayAgg, recentDays, chartLabels }) {
	const stats = new Map();
	for (const a of dayAgg.values()) {
		const ex = a?.ex1rm || {};
		for (const [name, v] of Object.entries(ex)) {
			if (!name || !Number.isFinite(v) || v <= 0) continue;
			const s = stats.get(name) || { count: 0, max: 0 };
			s.count += 1;
			s.max = Math.max(s.max, v);
			stats.set(name, s);
		}
	}

	const exercises = Array.from(stats.entries())
		.sort((a, b) => {
			const ac = a[1].count;
			const bc = b[1].count;
			if (bc !== ac) return bc - ac;
			const am = a[1].max;
			const bm = b[1].max;
			if (bm !== am) return bm - am;
			return String(a[0]).localeCompare(String(b[0]));
		})
		.map(([name]) => name)
		.slice(0, 60);

	const seriesByExercise = {};
	for (const name of exercises) {
		seriesByExercise[name] = recentDays.map((ymd) => {
			const v = dayAgg.get(ymd)?.ex1rm?.[name];
			return v != null ? round1(v) : null;
		});
	}

	return { labels: chartLabels, exercises, seriesByExercise };
}

function buildPrCards({ allTimeBestSet, allTimeBest1rm, today }) {
	const prs = [];

	const liftLabels = {
		bench: "Bench 1RM",
		squat: "Squat 1RM",
		deadlift: "Deadlift 1RM",
	};

	for (const key of ["bench", "squat", "deadlift"]) {
		const rec = allTimeBest1rm.get(key);
		if (!rec || !Number.isFinite(rec.value)) continue;
		prs.push({
			title: liftLabels[key],
			value: `${Math.round(rec.value)} ק\"ג`,
			meta: `שיא אישי · ${rec.date}`,
			isNew: isWithinDays(rec.date, today, 14),
		});
	}

	const setPrs = Array.from(allTimeBestSet.entries())
		.map(([name, r]) => ({ name, ...r }))
		.filter((x) => Number.isFinite(x.weight) && x.weight > 0)
		.sort((a, b) => b.weight - a.weight)
		.slice(0, 6);

	for (const r of setPrs) {
		prs.push({
			title: r.name,
			value: `${Math.round(r.weight)} ק\"ג × ${Math.round(r.reps)}`,
			meta: `שיא סט · ${r.date}`,
			isNew: isWithinDays(r.date, today, 14),
		});
	}

	return prs.slice(0, 8);
}

function buildInsights({ dayAgg, today }) {
	const start = new Date(today);
	start.setDate(today.getDate() - 27);
	const totals = { chest: 0, back: 0, legs: 0, shoulders: 0, arms: 0, core: 0 };
	let workouts7 = 0;
	const start7 = new Date(today);
	start7.setDate(today.getDate() - 6);

	for (const [ymd, a] of dayAgg.entries()) {
		const d = parseYmd(ymd);
		if (!d) continue;
		if (d >= start && d <= today) {
			for (const k of Object.keys(totals)) totals[k] += a?.muscle?.[k] || 0;
		}
		if (d >= start7 && d <= today) workouts7 += a?.workouts || 0;
	}

	const max = Math.max(1, ...Object.values(totals));
	const balance = {};
	for (const [k, v] of Object.entries(totals)) {
		if (!v || v <= 0) balance[k] = 0;
		else balance[k] = Math.max(1, Math.round((v / max) * 10));
	}

	const recommendations = [];
	return { balance, recommendations };
}

function estimateCalories({ totalSets, totalVolume, exercisesCount }) {
	const base = 140;
	const bySets = Math.max(0, totalSets) * 22;
	const byExercises = Math.max(0, exercisesCount) * 18;
	const byVolume = Math.max(0, totalVolume) * 0.008;
	return clamp(base + bySets + byExercises + byVolume, 0, 1600);
}

function mainLiftKey(name) {
	const n = normalizeName(name);
	if (/(bench|press)/.test(n) || n.includes("לחיצת") || n.includes("בנץ") || n.includes("חזה")) return "bench";
	if (/(squat)/.test(n) || n.includes("סקוואט") || n.includes("רגל")) return "squat";
	if (/(deadlift)/.test(n) || n.includes("דדליפט")) return "deadlift";
	return null;
}

function muscleGroupForExercise(name) {
	const n = normalizeName(name);
	if (/(bench|press|chest)/.test(n) || n.includes("חזה") || n.includes("לחיצת")) return "chest";
	if (/(row|pull|lat|back)/.test(n) || n.includes("גב") || n.includes("חתירה") || n.includes("משיכה")) return "back";
	if (/(squat|lunge|leg|deadlift)/.test(n) || n.includes("רגל") || n.includes("סקוואט") || n.includes("דדליפט")) return "legs";
	if (/(shoulder|ohp|overhead)/.test(n) || n.includes("כתף") || n.includes("דחיקה")) return "shoulders";
	if (/(curl|tricep|bicep|arm)/.test(n) || n.includes("יד") || n.includes("בייס") || n.includes("טרייס")) return "arms";
	if (/(core|abs|plank)/.test(n) || n.includes("בטן") || n.includes("ליבה")) return "core";
	return "arms";
}

function estimate1rmEpley(weight, reps) {
	if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0) return null;
	const r = clamp(reps, 1, 20);
	return weight * (1 + r / 30);
}

function isYmd(s) {
	return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseYmd(ymd) {
	if (!isYmd(ymd)) return null;
	const [y, m, d] = ymd.split("-").map((x) => Number(x));
	if (!y || !m || !d) return null;
	return new Date(y, m - 1, d);
}

function toYmd(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function startOfDay(date) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function toNumber(v) {
	const n = typeof v === "string" && v.trim() !== "" ? Number(v) : Number(v);
	return Number.isFinite(n) ? n : null;
}

function normalizeName(name) {
	return String(name || "")
		.toLowerCase()
		.replace(/[()]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function round1(n) {
	return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function clamp(n, min, max) {
	return Math.min(max, Math.max(min, n));
}

function isWithinDays(ymd, today, days) {
	const d = parseYmd(ymd);
	if (!d) return false;
	const diffMs = startOfDay(today) - startOfDay(d);
	const diffDays = diffMs / (1000 * 60 * 60 * 24);
	return diffDays >= 0 && diffDays <= days;
}
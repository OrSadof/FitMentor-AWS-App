import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";
const GOOGLE_API_KEY1 = process.env.GOOGLE_API_KEY1;
const GOOGLE_API_KEY2 = process.env.GOOGLE_API_KEY2;
const GOOGLE_API_KEY3 = process.env.GOOGLE_API_KEY3;

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const METRICS_USER_ID = "__METRICS__";
const METRICS_TOTAL_KEY = "TOTAL";

async function incrementMetric(field, by = 1) {
  const safeBy = Number(by) || 0;
  if (!field || safeBy === 0) return;
  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { UserID: METRICS_USER_ID, DataType: METRICS_TOTAL_KEY },
      UpdateExpression: "SET #f = if_not_exists(#f, :zero) + :inc, updatedAt = :now",
      ExpressionAttributeNames: { "#f": String(field) },
      ExpressionAttributeValues: { ":zero": 0, ":inc": safeBy, ":now": new Date().toISOString() }
    }));
  } catch (e) {
    console.error("Increment metric error:", e);
  }
}

const PLAN_HISTORY_PREFIX = "PlanHistory_";
const MAX_PLAN_HISTORY_TO_FETCH = 5;

function isLikelyRealPlanHtml(planHtml, expectedDays = 1) {
  const s = String(planHtml || "").trim();
  if (!s) return false;
  if (s.startsWith("{") && (s.includes('"reply"') || s.includes('"updatedPlanHtml"') || s.includes('"uiAction"'))) {
    return false;
  }
  if (!s.includes("<") || !s.includes(">")) return false;
  if (!/class\s*=\s*["']ai-plan-result["']/i.test(s)) return false;

  const lower = s.toLowerCase();
  if (lower.includes("failed") || lower.includes("error") || lower.includes("לא הצלחתי")) {
    return false;
  }
  const dayHeadings = (s.match(/<h3[^>]*>[\s\S]*?<\/h3>/gi) || []);
  if (dayHeadings.length < expectedDays) {
    return false;
  }
  return true;
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };

  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (!event.body) throw new Error("No body provided");

    const body = JSON.parse(event.body);
    const { action, userId, payload } = body;

    if (!action || !userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: "Missing fields" }) };
    }

    const normalizedUserId = userId.toLowerCase().trim();
    let result = {};

    switch (action) {
      case "getPlan":
        result = await handleGetPlan(normalizedUserId);
        break;
      case "generatePlan":
        try { await incrementMetric("aiCallsTotal", 1); } catch {}
        result = await handleGeneratePlan(normalizedUserId, payload);
        break;
      case "savePlan":
        if (!payload?.planHtml || !isLikelyRealPlanHtml(payload.planHtml)) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid planHtml" }) };
        }
        await saveToDb(normalizedUserId, "Plan", { ...payload, updatedAt: new Date().toISOString() });
        await appendPlanHistorySnapshot(normalizedUserId, payload.planHtml, payload.params || null);
        result = { message: "Saved" };
        break;
      case "deletePlan":
        await deleteFromDb(normalizedUserId, "Plan");
        await deleteFromDb(normalizedUserId, "ChatHistory");
        result = { message: "Plan & Chat deleted" };
        break;
      case "chat":
        try { await incrementMetric("aiCallsTotal", 1); } catch {}
        result = await handleChat(normalizedUserId, payload);
        break;
      case "getChatHistory":
        result = await handleGetChatHistory(normalizedUserId);
        break;
      case "saveChatHistory":
        await handleSaveChatHistory(normalizedUserId, payload);
        result = { message: "Chat history saved" };
        break;
      case "getTrainingLogs":
        result = await handleGetTrainingLogs(normalizedUserId);
        break;
      case "getAiInsights":
        try { await incrementMetric("aiCallsTotal", 1); } catch {}
        result = await handleGetAiInsights(normalizedUserId, payload);
        break;
      case "getAchievements":
        try { await incrementMetric("aiCallsTotal", 1); } catch {}
        result = await handleGetAchievements(normalizedUserId, payload);
        break;
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (error) {
    console.error("Handler Error:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: error.message || "Internal Server Error" }) };
  }
};

async function handleGetPlan(userId) {
  const data = await getFromDb(userId, "Plan");
  return data ? { plan: { planHtml: data.planHtml, params: data.params } } : {};
}

async function handleGetChatHistory(userId) {
  const data = await getFromDb(userId, "ChatHistory");
  return {
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
    messages: Array.isArray(data?.messages) ? data.messages : []
  };
}

async function handleSaveChatHistory(userId, payload) {
  const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  await saveToDb(userId, "ChatHistory", {
    sessions,
    messages,
    updatedAt: new Date().toISOString()
  });
}

async function handleGetTrainingLogs(userId) {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "UserID = :userId AND begins_with(DataType, :TrainingLogPrefix)",
    ExpressionAttributeValues: {
      ":userId": userId,
      ":TrainingLogPrefix": "TrainingLog_"
    }
  };

  try {
    const result = await docClient.send(new QueryCommand(params));
    const logs = (result.Items || []).map((item) => {
      const { UserID: _UserID, DataType, UpdatedAt: _UpdatedAt, Data, ...rest } = item || {};
      const data = Data ?? rest;
      return {
        date: String(DataType || "").replace("TrainingLog_", ""),
        data
      };
    });

    logs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return { logs, error: null };
  } catch (error) {
    console.error("Error fetching training logs:", error);
    return { logs: [], error: error.message };
  }
}

async function handleGeneratePlan(userId, payload) {
  const { age, goal, days, equipment, weight, height, gender, fitnessLevel } = payload;
  const reqDays = Math.max(1, parseInt(days, 10) || 3);
  const history = await getPlanHistory(userId, MAX_PLAN_HISTORY_TO_FETCH);
  const historyContext = buildPlanHistoryPromptContext(history);

  const prompt = `You are a professional fitness mentor. Your goal: Build a customized weekly fitness plan.
User info:
- Age: ${age}
- Gender: ${gender}
- Weight: ${weight} kg
- Height: ${height} cm
- Fitness level: ${fitnessLevel}
- Goal: ${goal}
- Workout days/week REQUIRED (MUST build exactly ${reqDays} days!): ${reqDays} days
- Available equipment: ${equipment}

Previous plans summary:
${historyContext}

Instructions:
1. Return valid, clean HTML wrapped in <div class="ai-plan-result">.
2. Build EXACTLY ${reqDays} distinct workout days, using <h3> headers for each day (e.g. <h3>Day 1: Push</h3>, <h3>Day 2: Pull</h3>... up to <h3>Day ${reqDays}: ...</h3>).
3. Exercise count per day: For 2-3 days split, include 4-5 exercises/day. For 4-6 days split, include exactly 3 focused exercises per day with 1 short sentence for technique & progression overload so all ${reqDays} days generate ultra-fast without hitting timeouts.
4. Include a <div class="plan-tips"> section with nutrition and recovery advice.
5. Do not include markdown formatting, markdown backticks, or intro/outro text.

WEIGHTS (critical):
- For EVERY weightlifting exercise, prescribe the EXACT weight in kg (ק"ג) to use for EACH set, as a separate line in the exercise HTML exactly like this:
  <p><strong>משקל מומלץ:</strong> סט 1: 40 ק"ג | סט 2: 45 ק"ג | סט 3: 50 ק"ג</p>
- DECIDE the weights yourself, based on the user's full profile (age, gender, body weight, height, fitness level, goal, experience) and the exercise type (compound vs. isolation, upper vs. lower body).
- The weight MUST DIFFER per set, with a natural progression: set 1 is a lighter warm-up/feeler set, and later sets are heavier (the working sets). Do NOT repeat the same weight for every set.
- Use realistic barbell/dumbbell increments (2.5 kg or 5 kg steps). Weights must be sensible for the user's level (beginner → lighter, advanced → heavier) and should get progressively heavier across the working sets as they progress week to week.
- For BODYWEIGHT-only exercises (plank, crunches, push-ups, pull-ups, hanging knee raises, core), skip the "משקל מומלץ" line (or write "משקל גוף").`;

  let planHtml = await tryGenerateContent(prompt);
  if (!isLikelyRealPlanHtml(planHtml, reqDays)) {
    console.warn(`Initial plan output failed validation (expected ${reqDays} days). Retrying...`);
    planHtml = await tryGenerateContent(prompt + "\nCRITICAL: Do NOT stop mid-way. Complete all " + reqDays + " workout days fully.");
  }

  if (!isLikelyRealPlanHtml(planHtml, reqDays)) {
    throw new Error(`AI failed to generate a complete plan for ${reqDays} days. Please try again.`);
  }

  await deleteFromDb(userId, "ChatHistory");
  await saveToDb(userId, "Plan", { planHtml, params: payload, createdAt: new Date().toISOString() });
  await appendPlanHistorySnapshot(userId, planHtml, payload);
  return { plan: { planHtml } };
}

function normalizeUserDisplayName(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  return s.replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 40);
}

async function handleChat(userId, { message, userName }) {
  const planData = await getFromDb(userId, "Plan");
  const chatData = await getFromDb(userId, "ChatHistory");
  const history = await getPlanHistory(userId, MAX_PLAN_HISTORY_TO_FETCH);
  const historyContext = buildPlanHistoryPromptContext(history);
  const trainingLogsResult = await handleGetTrainingLogs(userId);
  const trainingLogs = trainingLogsResult.logs || [];
  const progress = computeProgressSignals(trainingLogs);
  const planParamsContext = planData?.params ? JSON.stringify(planData.params) : "No saved plan parameters.";
  const displayName = normalizeUserDisplayName(userName);

  let messages = chatData?.messages || [];
  const currentPlanHtml = planData?.planHtml || "No current plan.";
  let trainingLogsContext = "No training logs recorded yet.";

  if (trainingLogs.length > 0) {
    trainingLogsContext = "Recent Training History:\n";
    trainingLogs.slice(0, 10).forEach(log => {
      trainingLogsContext += `\nWorkout Date: ${log.date}\n`;
      if (Array.isArray(log.data.exercises)) {
        log.data.exercises.slice(0, 8).forEach(exercise => {
          trainingLogsContext += `Exercise: ${exercise.name}\n`;
          if (Array.isArray(exercise.sets)) {
            exercise.sets.forEach((s, i) => {
              trainingLogsContext += `  Set ${i + 1}: ${s.weight || 'Bodyweight'}kg x ${s.reps || '?'} reps\n`;
            });
          }
        });
      }
    });
  }

  const systemPrompt = `You are FitMentor AI, an expert virtual personal trainer and wellness mentor.
User name: ${displayName || "User"}
Tone: Friendly, motivating, professional.
Format requirement: Return JSON only in this exact structure:
{
  "reply": "Your response text here",
  "updatedPlanHtml": null or "Updated plan HTML if modifying plan",
  "uiAction": null or "openNewPlanForm"
}

Current Plan HTML:
${currentPlanHtml}

User Plan Profile:
${planParamsContext}

Progress Summary:
${progress.summary}

Training Logs:
${trainingLogsContext}

When you modify or regenerate the plan (updatedPlanHtml), every weightlifting exercise must include a "משקל מומלץ" line prescribing the exact kg to use for EACH set, e.g. <p><strong>משקל מומלץ:</strong> סט 1: 40 ק"ג | סט 2: 45 ק"ג | סט 3: 50 ק"ג</p>. Decide the weights yourself from the user's profile (age, gender, weight, height, fitness level, goal) and exercise type; the weight must differ per set (lighter first set, heavier working sets) using 2.5/5 kg plate increments. For bodyweight-only exercises, omit the line.`;

  const recentHistory = messages.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.text}`).join("\n");
  const fullPrompt = `${systemPrompt}\n\nChat History:\n${recentHistory}\n\nUser: ${message}\nAI (JSON):`;

  const rawResponse = await tryGenerateContent(fullPrompt);
  let parsedResponse;
  try {
    const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    parsedResponse = JSON.parse(cleanJson);
  } catch (e) {
    console.error("JSON parse error in chat AI response:", e);
    const replyMatch = rawResponse.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    let extractedReply = "";
    if (replyMatch && replyMatch[1]) {
      try {
        extractedReply = JSON.parse(`"${replyMatch[1]}"`);
      } catch {
        extractedReply = replyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
    } else {
      extractedReply = rawResponse.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').replace(/^\s*\{\s*"reply"\s*:\s*"/, '').replace(/"\s*,\s*"updatedPlanHtml".*$/s, '').trim();
    }
    parsedResponse = {
      reply: extractedReply || "הבנתי את הבקשה שלך. אעדכן את התוכנית בהתאם.",
      updatedPlanHtml: null,
      uiAction: null
    };
  }

  messages.push({ role: "user", text: message, timestamp: Date.now() });
  messages.push({ role: "ai", text: parsedResponse.reply, timestamp: Date.now() });

  await saveToDb(userId, "ChatHistory", { messages });

  if (parsedResponse.updatedPlanHtml) {
    await saveToDb(userId, "Plan", {
      planHtml: parsedResponse.updatedPlanHtml,
      params: planData?.params || {},
      updatedAt: new Date().toISOString()
    });
    await appendPlanHistorySnapshot(userId, parsedResponse.updatedPlanHtml, planData?.params || null);
  }

  return {
    reply: parsedResponse.reply,
    updatedPlanHtml: parsedResponse.updatedPlanHtml,
    uiAction: parsedResponse.uiAction || null
  };
}

function computeProgressSignals(trainingLogs) {
  const logs = Array.isArray(trainingLogs) ? trainingLogs : [];
  if (logs.length < 2) {
    return { hasProgress: false, summary: "Not enough training logs recorded to analyze progress trends." };
  }
  return { hasProgress: true, summary: "Consistent workouts logged over recent sessions." };
}

const DEEPSEEK_MODEL = "google/gemini-2.5-flash";
const API_TIMEOUT_MS = 22000; // 22-second timeout (safely under API Gateway 29s ceiling)
const MAX_OUTPUT_TOKENS = 2500;

async function tryGenerateContent(promptText) {
  const isJsonChat = /AI \(JSON\):\s*$/.test(String(promptText || "")) || /JSON/i.test(String(promptText || ""));
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "").trim();

  if (!openRouterKey) {
    console.error("Missing OPENROUTER_API_KEY for DeepSeek execution.");
    if (isJsonChat) {
      return JSON.stringify({
        reply: "Error: OPENROUTER_API_KEY environment variable is missing.",
        updatedPlanHtml: null,
        uiAction: null,
      });
    }
    return `<div class="ai-plan-result"><h3>AI Communication Error</h3><p>OPENROUTER_API_KEY is missing in AWS Lambda environment.</p></div>`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openRouterKey}`,
        "HTTP-Referer": "https://fitmentor.app",
        "X-Title": "FitMentor"
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: "user", content: promptText }],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        ...(isJsonChat ? { response_format: { type: "json_object" } } : {})
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      console.error(`DeepSeek API Error ${response.status}:`, errText);
      throw new Error(`DeepSeek API Returned Status ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (typeof text === "string" && text.trim().length > 0) {
      return text;
    }

    throw new Error("Empty response returned from DeepSeek API.");
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("DeepSeek API Execution Error:", err);

    const isTimeout = err.name === "AbortError";
    const errorMsg = isTimeout 
      ? "AI request timed out after 20 seconds."
      : `Error communicating with deepseek/deepseek-v4-flash-0731: ${err.message || 'Server did not respond'}`;

    if (isJsonChat) {
      return JSON.stringify({
        reply: errorMsg,
        updatedPlanHtml: null,
        uiAction: null,
      });
    }

    return `<div class="ai-plan-result"><h3>DeepSeek API Error</h3><p>${errorMsg}</p></div>`;
  }
}

async function saveToDb(userId, dataType, data) {
  const item = { UserID: userId, DataType: dataType, ...data };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}
async function getFromDb(userId, dataType) {
  return (await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }))).Item;
}
async function deleteFromDb(userId, dataType) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }));
}

async function handleGetAiInsights(userId, payload = {}) {
  const trainingLogsResult = await handleGetTrainingLogs(userId);
  const logs = trainingLogsResult.logs || [];
  return {
    recommendations: [
      { type: "progression", title: "Consistency", text: `You have logged ${logs.length} workout sessions.` },
      { type: "tip", title: "Recovery", text: "Maintain high protein intake and 7-8 hours of sleep for optimum recovery." }
    ]
  };
}

function buildPlanHistoryKey(iso = new Date().toISOString()) {
  return `${PLAN_HISTORY_PREFIX}${iso}`;
}
function summarizePlanForPrompt(planHtml) {
  return String(planHtml || "").replace(/<[^>]*>/g, " ").slice(0, 500);
}
function buildPlanHistoryPromptContext(historyItems) {
  return (historyItems || []).map((h, i) => `${i + 1}) Plan ${h.createdAt}: ${summarizePlanForPrompt(h.planHtml)}`).join("\n");
}
async function getPlanHistory(userId, limit = MAX_PLAN_HISTORY_TO_FETCH) {
  try {
    const res = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "UserID = :userId AND begins_with(DataType, :prefix)",
      ExpressionAttributeValues: { ":userId": userId, ":prefix": PLAN_HISTORY_PREFIX },
      ScanIndexForward: false,
      Limit: limit
    }));
    return res?.Items || [];
  } catch {
    return [];
  }
}
async function appendPlanHistorySnapshot(userId, planHtml, params) {
  const createdAt = new Date().toISOString();
  await saveToDb(userId, buildPlanHistoryKey(createdAt), { planHtml, params, summary: summarizePlanForPrompt(planHtml), createdAt });
}

async function handleGetAchievements(userId, payload = {}) {
  const logs = Array.isArray(payload.logs) ? payload.logs : [];
  if (logs.length === 0) {
    return { achievements: [] };
  }

  const logsContext = logs.slice(0, 10).map(l => {
    const exList = (l.exercises || []).map(e => `${e.name}: ${(e.sets || []).map(s => `${s.weight}kg x ${s.reps}`).join(", ")}`).join("; ");
    return `Date ${l.date || 'Recent'}: ${exList}`;
  }).join("\n");

  const prompt = `You are a professional fitness mentor analyzing a user's recent training logs.
Identify achievements to be proud of (e.g. personal records, high volume, consistency, great endurance).
User recent training logs:
${logsContext}

Format requirement: Return JSON only in this structure:
{
  "achievements": [
    {
      "icon": "🏆",
      "category": "שיא משקל",
      "title": "לחיצת חזה 120 ק\"ג",
      "description": "שברת שיא אישי בלחיצת חזה עם 120 ק\"ג ל-2 חזרות!",
      "date": "2026-07-24"
    }
  ]
}

If no notable achievements exist, return {"achievements": []}.
AI (JSON):`;

  try {
    const rawResponse = await tryGenerateContent(prompt);
    const cleanJson = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    if (Array.isArray(parsed.achievements)) {
      return { achievements: parsed.achievements };
    }
  } catch (e) {
    console.error("Error generating achievements:", e);
  }

  return { achievements: [] };
}

import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";

const GOOGLE_API_KEYS = [
  process.env.GOOGLE_API_KEY1,
  process.env.GOOGLE_API_KEY2,
  process.env.GOOGLE_API_KEY3
].map(k => k?.trim()).filter(Boolean);

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const METRICS_USER_ID = "__METRICS__";
const METRICS_TOTAL_KEY = "TOTAL";

async function incrementMetric(field, by = 1) {
  const safeBy = Number(by) || 0;
  if (!field || safeBy === 0) return;
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { UserID: METRICS_USER_ID, DataType: METRICS_TOTAL_KEY },
    UpdateExpression: "SET #f = if_not_exists(#f, :zero) + :inc, updatedAt = :now",
    ExpressionAttributeNames: { "#f": String(field) },
    ExpressionAttributeValues: { ":zero": 0, ":inc": safeBy, ":now": new Date().toISOString() }
  }));
}

const PLAN_HISTORY_PREFIX = "PlanHistory_";
const MAX_PLAN_HISTORY_TO_FETCH = 5;

function countDayHeadings(planHtml) {
  let s = String(planHtml || '').trim();
  s = s.replace(/<div\s+class=["']plan-tips["'][\s\S]*$/i, '').trim();
  const headings = (s.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi) || []);
  let count = 0;
  for (const h of headings) {
    const text = h.replace(/<[^>]*>/g, '').replace(/[*#`]/g, '').trim();
    if (!text || text.length < 2 || text.length > 130) continue;
    if (/\b(?:טיפים?|תזונה|התאוששות|סיכום|הקדמה|plan-tips)\b/i.test(text)) continue;
    count++;
  }
  return count;
}

function isLikelyRealPlanHtml(planHtml, expectedDays = 1) {
  let s = String(planHtml || "").replace(/```(?:html)?/gi, '').replace(/```/g, '').trim();
  if (!s) return false;
  if (s.startsWith("{") && (s.includes('"reply"') || s.includes('"updatedPlanHtml"') || s.includes('"uiAction"'))) {
    return false;
  }
  if (!s.includes("<") || !s.includes(">")) return false;
  if (!/class\s*=\s*["']ai-plan-result["']/i.test(s) && !s.includes("<h3") && !s.includes("<h2")) return false;
  const lower = s.toLowerCase();
  if (lower.includes("לא הצלחתי לייצר תוכנית") || lower.includes("לא הצלחתי לטעון תוכנית") || lower.includes("בעיה בתקשורת") || lower.includes("נסה שוב")) {
    return false;
  }
  const realDays = countDayHeadings(s);
  if (realDays < expectedDays) {
    return false;
  }

  return true;
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
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
        try {
          // Immediately wipe old plan from DB so polling won't fetch stale plan from previous requests
          await deleteFromDb(normalizedUserId, "Plan");

          const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "il-central-1" });
          await lambdaClient.send(new InvokeCommand({
            FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || "FitMentorDashboard",
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({
              body: JSON.stringify({
                action: "bgGeneratePlan",
                userId: normalizedUserId,
                payload
              })
            }))
          }));
          result = { status: "processing", message: "ה-AI במודל DeepSeek בונה עבורך תוכנית אימונים מפורטת. העמוד יתעדכן אוטומטית." };
        } catch (invErr) {
          console.warn("Async self-invocation failed, running synchronously...", invErr);
          result = await handleGeneratePlan(normalizedUserId, payload);
        }
        break;

      case "bgGeneratePlan":
        console.log(`[BG_GENERATE_PLAN_START] userId=${normalizedUserId}`);
        result = await handleGeneratePlan(normalizedUserId, payload);
        break;
      case "savePlan":
        if (!payload?.planHtml || !isLikelyRealPlanHtml(payload.planHtml)) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid planHtml (not saving)" }) };
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

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ message: `Invalid action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch (error) {
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
  const rawId = String(userId || "").trim();
  const lowerId = rawId.toLowerCase();
  const idsToTry = Array.from(new Set([lowerId, rawId])).filter(Boolean);
  const allLogsMap = new Map();

  for (const targetId of idsToTry) {
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: "UserID = :userId AND begins_with(DataType, :TrainingLogPrefix)",
      ExpressionAttributeValues: {
        ":userId": targetId,
        ":TrainingLogPrefix": "TrainingLog_"
      }
    };

    try {
      const result = await docClient.send(new QueryCommand(params));
      const items = result.Items || [];
      for (const item of items) {
        const { UserID: _UserID, DataType, UpdatedAt: _UpdatedAt, Data, ...rest } = item || {};
        const data = Data ?? rest;
        const date = String(DataType || "").replace("TrainingLog_", "");
        if (date && !allLogsMap.has(date)) {
          allLogsMap.set(date, { date, data });
        }
      }
    } catch (error) {
      console.warn("Query training logs error:", error);
    }
  }

  const logs = Array.from(allLogsMap.values());
  logs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { logs, error: null };
}

function sanitizeAndRepairPlan(rawHtml, reqDays) {
  let html = String(rawHtml || '').trim();

  html = html.replace(/<[^>]*$/g, '').trim();

  if (!html.includes('ai-plan-result')) {
    html = `<div class="ai-plan-result">\n${html}\n</div>`;
  }

  return html;
}

async function handleGeneratePlan(userId, payload) {
  const { age = 25, gender = 'male', weight = 70, height = 175, fitnessLevel = 'beginner', goal = 'חיטוב וירידה במשקל', equipment = 'gym', days = 3 } = payload || {};
  const reqDays = Math.max(1, Math.min(7, parseInt(days) || 3));

  const fitnessDesc = { 'beginner': 'מתחיל (0-6 חודשים)', 'intermediate': 'בינוני (6-24 חודשים)', 'advanced': 'מתקדם (2+ שנים)' }[fitnessLevel] || fitnessLevel;
  const equipmentDesc = { 'gym': 'חדר כושר מלא', 'dumbbells': 'משקולות בלבד', 'bodyweight': 'משקל גוף בלבד', 'minimal': 'ציוד ביתי מינימלי' }[equipment] || equipment;

  const prompt = `בנה תוכנית אימונים מקצועית של בדיוק ${reqDays} ימים נפרדים לחדר כושר.
מתאמן: גיל ${age}, משקל ${weight} ק"ג, גובה ${height} ס"מ, רמת כושר ${fitnessDesc}, ציוד ${equipmentDesc}, מטרה ${goal}.

⚠️ כללים מחייבים (100% חובה לעמוד בכולם!):
1. בדיוק ${reqDays} ימי אימון נפרדים! לכל יום כותרת <h3> בפורמט:
${Array.from({ length: reqDays }, (_, i) => `<h3>יום ${i + 1}: [שם האימון]</h3>`).join('\n')}

2. לכל יום אימון צור בדיוק 3 תרגילים בולטים. לכל תרגיל בדיוק 5 פסקאות <p>:
<p>🏋️ <strong>[שם התרגיל בעברית] (English Name)</strong></p>
<p><strong>סטים:</strong> 3 סטים | <strong>חזרות:</strong> 8-12 חזרות | <strong>מנוחה:</strong> 60 שניות מנוחה</p>
<p><strong>משקל מומלץ:</strong> סט 1: A ק"ג | סט 2: B ק"ג | סט 3: C ק"ג</p>
<p><strong>דגשי טכניקה:</strong> [הנחיה טכנית מפורטת ממוקדת בת 1-2 משפטים על מנח גוף, גב ישר וטווח תנועה]</p>
<p><strong>התקדמות עומס והסבר:</strong> [משפט 1 מפורט על ההיגיון בבחירת המשקלים ואיך להעלות עומס]</p>

3. כללי משקלים מחייבים:
• משקלים מספריים בלבד בק"ג לכל סט (לדוגמה: סט 1: 20 ק"ג | סט 2: 17.5 ק"ג | סט 3: 15 ק"ג).
• חוק הדעיכה (Set 1 >= Set 2 >= Set 3): המשקל בסט 1 חייב להיות הגבוה ביותר.
• חל איסור מוחלט לרשום "משקל גוף", וחל איסור מוחלט לרשום מילים סתמיות כמו "טובה" בדגשי הטכניקה!

4. בסוף <div class="plan-tips"> עם 3 טיפי תזונה והתאוששות. עטוף ב-<div class="ai-plan-result">.`;

  console.log(`[GENERATE_PLAN_START] reqDays=${reqDays}, userId=${userId}`);
  const MAX_ATTEMPTS = 2;
  let planHtml = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const t0 = Date.now();
    try {
      console.log(`[GENERATE_PLAN_ATTEMPT] attempt=${attempt}/${MAX_ATTEMPTS}, reqDays=${reqDays}`);
      const candidateHtml = await tryGenerateContent(prompt, false);
      const htmlLen = String(candidateHtml || '').length;
      const dayCount = countDayHeadings(candidateHtml);
      console.log(`[TRY_GENERATE_CONTENT_DONE] attempt=${attempt}, took ${Date.now() - t0}ms, htmlLength=${htmlLen}, dayHeadings=${dayCount}/${reqDays}`);

      if (htmlLen > 1200 && dayCount >= reqDays) {
        console.log(`[PLAN_VALIDATION_SUCCESS] attempt=${attempt}, reqDays=${reqDays}, dayHeadings=${dayCount}/${reqDays}`);
        planHtml = candidateHtml;
        break;
      }

      if (htmlLen > 800) {
        planHtml = candidateHtml;
        break;
      }
    } catch (attemptErr) {
      console.error(`[GENERATE_PLAN_ATTEMPT_ERR] attempt=${attempt}, took ${Date.now() - t0}ms:`, attemptErr.message || attemptErr);
    }
  }

  if (planHtml && countDayHeadings(planHtml) < reqDays) {
    const currentDays = countDayHeadings(planHtml);
    console.warn(`[PLAN_EXTENSION_API_CALL] API generated ${currentDays}/${reqDays} days. Requesting API completion for remaining days...`);
    const missingPrompt = `תוכנית האימונים שנבנתה עד כה מה-API כוללת ${currentDays} ימים out of ${reqDays}.\nבנה מה-API בלבד את הימים החסרים (יום ${currentDays + 1} עד יום ${reqDays}).\nלכל יום כותרת <h3>יום X: ...</h3> ו-3 תרגילים עם 5 פסקאות <p> כנדרש בפורמט HTML. החזר רק את ימים ${currentDays + 1} עד ${reqDays}!`;
    try {
      const extraDaysHtml = await tryGenerateContent(missingPrompt, false);
      if (extraDaysHtml && extraDaysHtml.length > 300) {
        const tipsIdx = planHtml.indexOf('<div class="plan-tips"');
        if (tipsIdx !== -1) {
          planHtml = planHtml.slice(0, tipsIdx) + '\n' + extraDaysHtml + '\n' + planHtml.slice(tipsIdx);
        } else {
          planHtml += '\n' + extraDaysHtml;
        }
      }
    } catch (e) {
      console.error('[PLAN_EXTENSION_ERR]', e.message);
    }
  }

  planHtml = sanitizeAndRepairPlan(planHtml, reqDays);

  await deleteFromDb(userId, "ChatHistory");

  await saveToDb(userId, "Plan", { planHtml, params: payload, createdAt: new Date().toISOString() });
  await appendPlanHistorySnapshot(userId, planHtml, payload);
  return { plan: { planHtml } };
}

function normalizeUserDisplayName(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  const cleaned = s.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 40);
}

async function handleChat(userId, payload) {
  const { message, userName, sessions: inputSessions, activeSessionId: inputActiveSessionId } = payload || {};
  const planData = await getFromDb(userId, "Plan");
  const chatData = await getFromDb(userId, "ChatHistory");

  const history = await getPlanHistory(userId, MAX_PLAN_HISTORY_TO_FETCH);
  const historyContext = buildPlanHistoryPromptContext(history);

  const trainingLogsResult = await handleGetTrainingLogs(userId);
  const trainingLogs = trainingLogsResult?.logs || [];
  const displayName = normalizeUserDisplayName(userName);

  if (trainingLogsResult?.error) {
    console.warn('[HANDLE_CHAT_LOGS_WARN]', trainingLogsResult.error);
  }

  const progress = computeProgressSignals(trainingLogs);
  const planParams = planData?.params || {};
  const planParamsContext = Object.keys(planParams).length > 0 ? JSON.stringify(planParams) : 'לא סופקו פרטים נוספים';

  let messages = chatData?.messages || [];
  const rawPlanHtml = planData?.planHtml || "אין תוכנית כרגע.";
  const currentPlanSummary = rawPlanHtml.length > 2500
    ? rawPlanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000)
    : rawPlanHtml;

  let trainingLogsContext = "אין לוגי אימונים מתועדים במערכת עדיין.";

  if (trainingLogs.length > 0) {
    const recentLogs = trainingLogs.slice(0, 20);

    trainingLogsContext = `נמצאו ${trainingLogs.length} אימונים מתועדים ב-DB (להלן ${recentLogs.length} האימונים האחרונים מהחדש לישן):\n`;

    recentLogs.forEach((log, logIdx) => {
      const exList = Array.isArray(log.data?.exercises) ? log.data.exercises : [];
      const weightInfo = log.data?.bodyWeightKg ? ` (משקל גוף שנשקל: ${log.data.bodyWeightKg} ק"ג)` : '';
      trainingLogsContext += `\n📅 אימון #${logIdx + 1} - תאריך: ${log.date}${weightInfo}\n`;

      if (exList.length > 0) {
        exList.forEach((exercise) => {
          const sets = Array.isArray(exercise.sets) ? exercise.sets : [];
          if (sets.length > 0) {
            const setsStr = sets.map((s, sIdx) => {
              const w = (s.weight != null && String(s.weight).trim() !== '') ? `${s.weight} ק"ג` : 'משקל גוף';
              const r = (s.reps != null && String(s.reps).trim() !== '') ? `${s.reps} חזרות` : '';
              return `סט ${sIdx + 1}: ${w}${r ? ` X ${r}` : ''}`;
            }).join(' | ');
            trainingLogsContext += `  • תרגיל: ${exercise.name || 'תרגיל ללא שם'} -> ${setsStr}\n`;
          } else {
            trainingLogsContext += `  • תרגיל: ${exercise.name || 'תרגיל ללא שם'} (ללא פירוט סטים)\n`;
          }
        });
      } else {
        trainingLogsContext += `  (לא נרשמו תרגילים ספציפיים)\n`;
      }

      if (log.data?.notes) {
        trainingLogsContext += `  הערות אימון: ${log.data.notes}\n`;
      }
    });
  }

  const systemPrompt = `
אתה FitMentor AI, מאמן כושר אישי מקצועי, חכם, קשוב ומעצים המכיר את כל נתוני המשתמש מתוך ה-Database (DynamoDB) של FitMentor.

שם המשתמש: ${displayName || "אור"}
פרטי המתאמן (גיל, משקל, גובה, מטרה, ציוד): ${planParamsContext}

══════════════════════════════════════
📊 נתוני אמת מתוך מסד הנתונים:
══════════════════════════════════════

1. 🏋️ תוכנית אימונים נוכחית של המתאמן:
${currentPlanSummary}

2. 📝 היסטוריית לוגי אימונים מלאה (מתוך לוג האימונים):
${trainingLogsContext}

3. 📈 סיכום סיגנלי התקדמות:
${progress.summary}

${historyContext ? `4. 📜 היסטוריית תוכניות עבר:\n${historyContext}\n` : ''}
══════════════════════════════════════
🎯 הנחיות מחייבות למענה:
══════════════════════════════════════
1. כאשר המשתמש שואל אותך על האימונים שלו, על התקדמות, על משקלים, על תרגילים שביצע או על תאריכים:
   - השתמש תמיד בנתונים המדויקים שנמצאים למעלה בלוגי האימונים!
   - אם יש אימונים מתועדים ברשימה למעלה, ציין תמיד מספרים מדויקים: תאריך, שם התרגיל, כמה סטים, איזה משקל בק"ג וכמה חזרות בוצעו. לעולם אל תטען שאין מידע כשמופיעים אימונים ברשימה!
   - אם אין עדיין אימונים מתועדים ברשימה, הסבר לו בנעימות שברגע שיתעד אימון בלשונית "לוג אימונים" תוכל לנתח לו את הביצועים וההתקדמות.

2. כללי שפה, הדגשה ועיצוב (חשוב ביותר ל-UX מעולה):
   - עברית חמה, מקצועית, ברורה ומעצימה.
   - השתמש תמיד ב-Markdown להדגשה: עטוף שמות תרגילים, תאריכים, משקלים והישגים ב-**בולד** (לדוגמה: **לחיצת חזה**, **108 ק"ג**, **3/8**).
   - השתמש ברשימות ממוספרות יפות (1. , 2. ) כשאתה מפרט אימונים או תרגילים.
   - שלב אימוג'ים מתאימים בצורה נעימה (💪, 🏋️‍♂️, 📅, 🔥, 🎯, ⚡, 🥗).
   - חלק לפסקאות קצרות ונקיות עם שורת רווח ביניהן לקריאות מושלמת.
   - אל תזכיר שמות קבצים, מסדי נתונים או מונחים טכניים.

3. אם המשתמש מבקש לשנות את התוכנית, שכתב את ה-HTML של התוכנית והחזר אותו ב-updatedPlanHtml.

4. פורמט תשובה חובה (החזר JSON תקין בלבד, ללא markdown וללא טקסט מחוץ ל-JSON):
{
  "reply": "הטקסט שאתה עונה למשתמש בעברית",
  "updatedPlanHtml": null,
  "uiAction": null
}
`;

  const recentHistory = messages.slice(-4).map(m => `${m.role === 'user' ? 'משתמש' : 'AI'}: ${m.text}`).join("\n");
  const fullPrompt = `${systemPrompt}\n\nהיסטוריית שיחה:\n${recentHistory}\n\nמשתמש: ${message}\nAI (JSON):`;

  const rawResponse = await tryGenerateContent(fullPrompt, true);

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
      reply: extractedReply || "הבנתי אותך. איך אוכל לעזור לך עוד היום?",
      updatedPlanHtml: null,
      uiAction: null
    };
  }

  const userMsgObj = { role: "user", text: message, timestamp: Date.now() };
  const aiMsgObj = { role: "ai", text: parsedResponse.reply, timestamp: Date.now() };

  let updatedSessions = Array.isArray(inputSessions) ? [...inputSessions] : null;
  if (updatedSessions && updatedSessions.length > 0) {
    const activeId = inputActiveSessionId || updatedSessions[0].id;
    const activeIdx = updatedSessions.findIndex(s => s.id === activeId);
    const targetIdx = activeIdx >= 0 ? activeIdx : 0;
    const targetSession = updatedSessions[targetIdx];

    let sessionTitle = targetSession.title;
    if (!sessionTitle || sessionTitle === 'שיחה חדשה' || !targetSession.messages || targetSession.messages.length === 0) {
      sessionTitle = message.slice(0, 28) + (message.length > 28 ? '...' : '');
    }

    const updatedMessages = [...(targetSession.messages || []), userMsgObj, aiMsgObj];
    updatedSessions[targetIdx] = {
      ...targetSession,
      title: sessionTitle,
      updatedAt: Date.now(),
      messages: updatedMessages
    };

    await saveToDb(userId, "ChatHistory", {
      sessions: updatedSessions,
      messages: updatedMessages,
      updatedAt: new Date().toISOString()
    });
  } else {
    messages.push(userMsgObj);
    messages.push(aiMsgObj);
    await saveToDb(userId, "ChatHistory", {
      messages,
      updatedAt: new Date().toISOString()
    });
  }

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
    return { hasProgress: false, summary: "אין מספיק אימונים מתועדים כדי לזהות התקדמות." };
  }
  const byExercise = new Map();

  for (const log of logs) {
    const date = String(log?.date || "");
    const exercises = Array.isArray(log?.data?.exercises) ? log.data.exercises : [];
    for (const ex of exercises) {
      const name = String(ex?.name || "").trim();
      if (!name) continue;
      const sets = Array.isArray(ex?.sets) ? ex.sets : [];

      let bestWeight = null;
      let bestReps = null;

      for (const s of sets) {
        const w = s?.weight;
        const r = s?.reps;
        const wNum = (w === "" || w == null) ? null : Number(w);
        const rNum = (r === "" || r == null) ? null : Number(r);
        if (wNum != null && Number.isFinite(wNum)) bestWeight = bestWeight == null ? wNum : Math.max(bestWeight, wNum);
        if (rNum != null && Number.isFinite(rNum)) bestReps = bestReps == null ? rNum : Math.max(bestReps, rNum);
      }

      if (bestWeight == null && bestReps == null) continue;
      if (!byExercise.has(name)) byExercise.set(name, []);
      byExercise.get(name).push({ date, bestWeight, bestReps });
    }
  }

  const progressFindings = [];
  for (const [name, entries] of byExercise.entries()) {
    const sorted = entries
      .filter(e => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (sorted.length < 2) continue;
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const w1 = first.bestWeight;
    const w2 = last.bestWeight;
    const r1 = first.bestReps;
    const r2 = last.bestReps;

    const weightProgress = (w1 != null && w2 != null && Number.isFinite(w1) && Number.isFinite(w2) && (w2 - w1) >= 2.5);
    const repsProgress = (r1 != null && r2 != null && Number.isFinite(r1) && Number.isFinite(r2) && (r2 - r1) >= 2);

    if (weightProgress) progressFindings.push(`${name}: משקל עלה מ-${w1} ל-${w2}`);
    else if (repsProgress) progressFindings.push(`${name}: חזרות עלו מ-${r1} ל-${r2}`);

    if (progressFindings.length >= 3) break;
  }

  if (progressFindings.length === 0) {
    return {
      hasProgress: false,
      summary: "לא זיהיתי סימני התקדמות ברורים לפי המשקלים/חזרות בלוגים (או שחסרים נתונים)."
    };
  }

  return {
    hasProgress: true,
    summary: `נראית התקדמות בלוגים: ${progressFindings.join("; ")}.`
  };
}

const FAST_AI_MODELS = [
  "deepseek/deepseek-chat",
  "deepseek/deepseek-v4-flash-0731"
];
const API_TIMEOUT_MS = 25000;
const MAX_OUTPUT_TOKENS = 4500;

async function fetchWithHardTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  let timerId = null;

  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      try { controller.abort(); } catch {}
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      timeoutPromise
    ]);
    if (timerId) clearTimeout(timerId);
    return response;
  } catch (err) {
    if (timerId) clearTimeout(timerId);
    try { controller.abort(); } catch {}
    throw err;
  }
}

async function tryGenerateContent(promptText, isChatCall = false, systemPromptOverride = null, maxTokensOverride = null) {
  const openRouterKey = (process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "").trim();

  if (!openRouterKey) {
    console.error("Missing OPENROUTER_API_KEY for AI execution.");
    if (isChatCall) {
      return JSON.stringify({
        reply: "מפתח OPENROUTER_API_KEY חסר במערכת. אנא הגדר את המפתח ב-AWS Lambda.",
        updatedPlanHtml: null,
        uiAction: null,
      });
    }
    return `
<div class="ai-plan-result">
  <h3>שגיאה בתקשורת עם ה-AI</h3>
  <p>מפתח OPENROUTER_API_KEY חסר במערכת. אנא הגדר את המפתח ב-AWS Lambda.</p>
</div>
`.trim();
  }

  const timeoutMs = isChatCall ? 15000 : (systemPromptOverride ? 10000 : 25000);
  const maxTokens = maxTokensOverride ? maxTokensOverride : (isChatCall ? 2500 : MAX_OUTPUT_TOKENS);
  const modelsToTry = FAST_AI_MODELS;
  let lastErr = null;

  let systemPrompt = "You are an elite master strength and conditioning sports scientist. Your exercise selections and recommended per-set weights must be 100% logically consistent, descending or equal across sets (Set 1 >= Set 2 >= Set 3) due to fatigue management (Set 1 is performed fresh with highest weight). Never output illogical weights like 0kg, 0.5kg, 1kg or 0,0,1 sequences for loaded exercises. Always provide realistic numerical kg values for every set of every loaded exercise. MANDATORY: For every single exercise without exception, you MUST include a dedicated paragraph <p><strong>דגשי טכניקה:</strong> ...</p> containing rich, 2-sentence technique instructions. Never omit technique focus for any exercise. Return complete, concise, rich HTML for the workout plan.";

  if (systemPromptOverride) {
    systemPrompt = systemPromptOverride;
  } else if (isChatCall) {
    systemPrompt = "You are FitMentor AI, an expert, friendly AI fitness coach. Reply ONLY with a single valid JSON object: {\"reply\": \"Your Hebrew reply here\", \"updatedPlanHtml\": null, \"uiAction\": null}. Do not include markdown codeblocks or text outside JSON.";
  }

  for (let idx = 0; idx < modelsToTry.length; idx++) {
    const model = modelsToTry[idx];
    const t0 = Date.now();

    try {
      console.log(`[AI_CALL_START] model=${model}, isChatCall=${isChatCall}`);
      const requestPayload = {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: promptText }
        ],
        max_tokens: maxTokens,
        temperature: systemPromptOverride ? 0.2 : 0.4
      };

      const response = await fetchWithHardTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": "https://fitmentor.app",
          "X-Title": "FitMentor"
        },
        body: JSON.stringify(requestPayload)
      }, timeoutMs);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.warn(`[AI_HTTP_ERR] model=${model}, status=${response.status}: ${errText.slice(0, 150)}`);
        throw new Error(`AI API returned HTTP ${response.status} for ${model}`);
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      const text = (typeof msg?.content === "string" && msg.content.trim().length > 0)
        ? msg.content
        : (typeof msg?.reasoning === "string" && msg.reasoning.trim().length > 0
          ? msg.reasoning
          : (typeof data.choices?.[0]?.text === "string" ? data.choices[0].text : ""));

      if (typeof text === "string" && text.trim().length > 0) {
        console.log(`[AI_SUCCESS] model=${model}, took ${Date.now() - t0}ms, responseLen=${text.length}`);
        return text;
      }

      throw new Error(`Empty response returned from model ${model}`);
    } catch (err) {
      lastErr = err;
      console.warn(`[AI_CALL_FAILED] model=${model}, took ${Date.now() - t0}ms:`, err.message || err);
    }
  }

  // Handle final failure
  if (!isChatCall) {
    throw new Error(lastErr?.message || "ה-API נקלע לקשיים של עומס, אנא נסה שוב מאוחר יותר");
  }

  return JSON.stringify({
    reply: `שגיאה בתקשורת עם ה-AI: ${lastErr?.message || "אנא נסה שוב מאוחר יותר."}`,
    updatedPlanHtml: null,
    uiAction: null
  });
}

async function saveToDb(userId, dataType, data) {
  const item = {
    UserID: userId,
    DataType: dataType,
    ...data
  };
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}
async function getFromDb(userId, dataType) {
  return (await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }))).Item;
}
async function deleteFromDb(userId, dataType) {
  await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { UserID: userId, DataType: dataType } }));
}

function filterLogsLastDays(logs, days = 30) {
  const maxDays = Math.max(1, Math.floor(Number(days) || 30));
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() - maxDays);
  const cutoffYmd = cutoff.toISOString().slice(0, 10);

  return (logs || []).filter((log) => {
    const d = String(log?.date || "");
    return d && d >= cutoffYmd;
  });
}

function safeParseJson(raw) {
  if (!raw) return null;
  let cleaned = String(raw).replace(/```json/gi, "").replace(/```/g, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeRecommendations(obj) {
  const recs = obj?.recommendations || obj?.recs || obj?.insights || obj?.items || [];
  if (!Array.isArray(recs)) return [];
  return recs
    .map((r) => {
      const type = String(r?.type || "tip").toLowerCase();
      const title = String(r?.title || "תובנה").trim();
      const text = String(r?.text || r?.message || "").trim();
      return { type, title, text };
    })
    .filter((r) => r.text && String(r.text).trim().length > 0)
    .slice(0, 4);
}

async function handleGetAiInsights(userId, payload = {}) {
  const trainingLogsResult = await handleGetTrainingLogs(userId);
  let trainingLogs = trainingLogsResult.logs || [];

  if (Array.isArray(payload?.logs) && payload.logs.length > 0) {
    const existingDates = new Set(trainingLogs.map((l) => l.date));
    payload.logs.forEach((l) => {
      if (l && l.date && !existingDates.has(l.date)) {
        trainingLogs.push({ date: l.date, data: { exercises: l.exercises || [] } });
      }
    });
  }

  // Sort logs by date descending (most recent workouts first)
  trainingLogs.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  // ALWAYS select the last 5-10 most recent workouts, regardless of how long ago they were logged!
  const recentLogs = trainingLogs.slice(0, 10);
  const todayYmd = new Date().toISOString().slice(0, 10);

  let trainingLogsContext = "";
  if (recentLogs.length > 0) {
    trainingLogsContext = `האימונים האחרונים של המתאמן (מהחדש לישן, תאריך נוכחי: ${todayYmd}):\n`;
    recentLogs.forEach((log) => {
      trainingLogsContext += `\n--- אימון בתאריך: ${log.date} ---\n`;
      const exercises = Array.isArray(log?.data?.exercises) ? log.data.exercises : [];
      for (const ex of exercises) {
        const exName = ex?.name ? String(ex.name) : "";
        if (!exName) continue;
        trainingLogsContext += `תרגיל: ${exName}\n`;
        const sets = Array.isArray(ex?.sets) ? ex.sets : [];
        for (let i = 0; i < Math.min(sets.length, 12); i++) {
          const s = sets[i] || {};
          const weight = (s.weight != null && s.weight !== "") ? `${s.weight}kg` : "משקל גוף";
          const reps = (s.reps != null && s.reps !== "") ? `${s.reps} חזרות` : "? חזרות";
          trainingLogsContext += `   סט ${i + 1}: ${weight} X ${reps}\n`;
        }
      }
      if (log?.data?.notes) trainingLogsContext += `הערות ותגובות המתאמן: ${log.data.notes}\n`;
    });
  } else {
    trainingLogsContext = "אין עדיין אימונים מתועדים ביומן.";
  }

  const prompt = `
אתה FitMentor AI, מאמן כושר אישי ומדען ספורט בכיר.
תפקידך לנתח את האימונים האחרונים של המתאמן ולהחזיר בין 2 ל-4 המלצות חכמות ומפורטות 100% מתוך ה-API בלבד!
אתה כ-API מחליט בעצמך בדיוק כמה המלצות להחזיר לפי העומס והתובנות באימונים (בין 2 ל-4 המלצות).

⚠️ כללים מחייבים (100% מתוך ה-API):
1. סיכום וניתוח האימונים האחרונים: נתח וסכם את התרגילים, המשקלים, העומסים והסטים מתוך האימונים האחרונים - ללא קשר לכמה זמן עבר מאז האימון האחרון!
2. עידוד עקביות: אם עבר זמן מה מאז האימון האחרון ביחס לתאריך הנוכחי (${todayYmd}), כלול המלצה מדרבנת ומעצימה להתמיד, לא לעצור ולחזור לשגרה.
3. כתיבה בעברית פשוטה, מקצועית וברורה, ללא Markdown.
4. החזר JSON בלבד במבנה מדויק של בין 2 ל-4 המלצות (ללא טקסט מחוץ ל-JSON):
{
  "recommendations": [
    {
      "type": "tip|warning|neglect|stall|progression",
      "title": "[כותרת ממוקדת מתוך ה-API]",
      "text": "[המלצה מפורטת בת 2 משפטים מתוך ה-API המסכמת את האימונים האחרונים או מדרבנת להתמיד]"
    }
  ]
}

נתוני האימונים האחרונים:
${trainingLogsContext}
`;

  const jsonSystemPrompt = "You are FitMentor AI. Your response must be ONLY a single raw valid JSON object starting with { and ending with }. Decide on the exact count of recommendations to return (between 2 to 4 items). Do not include markdown formatting like ```json or any explanations outside JSON.";

  const raw = await tryGenerateContent(prompt, false, jsonSystemPrompt, 1200);
  const parsed = safeParseJson(raw);
  const recommendations = normalizeRecommendations(parsed);

  return {
    recommendations,
    rawOutput: raw,
    meta: { workoutsConsidered: recentLogs.length },
  };
}

function buildPlanHistoryKey(iso = new Date().toISOString()) {
  return `${PLAN_HISTORY_PREFIX}${iso}`;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizePlanForPrompt(planHtml, maxChars = 900) {
  const text = stripHtml(planHtml);
  if (!text) return "";
  return text.length <= maxChars ? text : text.slice(0, maxChars) + "…";
}

function buildPlanHistoryPromptContext(historyItems) {
  const items = Array.isArray(historyItems) ? historyItems : [];
  if (items.length === 0) return "(אין היסטוריה)";

  return items
    .slice(0, MAX_PLAN_HISTORY_TO_FETCH)
    .map((h, i) => {
      const when = h?.createdAt ? `(${h.createdAt})` : "";
      const summary = h?.summary || summarizePlanForPrompt(h?.planHtml);
      return `${i + 1}) תוכנית קודמת ${when}: ${summary}`;
    })
    .join("\n");
}

async function getPlanHistory(userId, limit = MAX_PLAN_HISTORY_TO_FETCH) {
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: "UserID = :userId AND begins_with(DataType, :prefix)",
    ExpressionAttributeValues: {
      ":userId": userId,
      ":prefix": PLAN_HISTORY_PREFIX
    },
    ScanIndexForward: false,
    Limit: limit
  };

  try {
    const result = await docClient.send(new QueryCommand(params));
    return result?.Items || [];
  } catch (e) {
    return [];
  }
}

async function appendPlanHistorySnapshot(userId, planHtml, params) {
  const createdAt = new Date().toISOString();
  const dataType = buildPlanHistoryKey(createdAt);
  const summary = summarizePlanForPrompt(planHtml);
  await saveToDb(userId, dataType, { planHtml, params, summary, createdAt });
}
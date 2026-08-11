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
    const name = error?.name ? String(error.name) : "Error";
    const message = error?.message ? String(error.message) : "Unknown error";
    return { logs: [], error: `${name}: ${message}` };
  }
}

function sanitizeAndRepairPlan(rawHtml, reqDays) {
  let html = String(rawHtml || '').trim();

  // 0. Clean trailing unclosed HTML tags if truncated at token limit
  html = html.replace(/<[^>]*$/g, '').trim();

  // 1. Ensure wrapper exists
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

  const prompt = `חובה מוחלטת: צור תוכנית אימונים 100% מלאה של בדיוק ${reqDays} ימים נפרדים מתוך ה-API!
מתאמן: גיל ${age}, משקל ${weight} ק"ג, גובה ${height} ס"מ, רמת כושר ${fitnessDesc}, ציוד ${equipmentDesc}, מטרה ${goal}.

⚠️ כללים מחייבים (100% חובה לעמוד בכולם!):
1. בדיוק ${reqDays} ימי אימון נפרדים! לכל יום כותרת <h3> בפורמט:
${Array.from({ length: reqDays }, (_, i) => `<h3>יום ${i + 1}: [שם קבוצת שרירים / סוג אימון]</h3>`).join('\n')}

2. לכל יום אימון צור בדיוק 3 תרגילים בולטים. לכל תרגיל בדיוק 5 פסקאות <p>:
<p>🏋️ <strong>[שם התרגיל בעברית] (English Name)</strong></p>
<p><strong>סטים:</strong> 3 סטים | <strong>חזרות:</strong> 8-12 חזרות | <strong>מנוחה:</strong> 60 שניות מנוחה</p>
<p><strong>משקל מומלץ:</strong> סט 1: A ק"ג | סט 2: B ק"ג | סט 3: C ק"ג</p>
<p><strong>דגשי טכניקה:</strong> [הנחיה טכנית מפורטת ועשירה בת 2 משפטים על מנח גוף, גב ישר, נשימה וטווח תנועה]</p>
<p><strong>התקדמות עומס והסבר:</strong> [משפט 1-2 מפורט על אופן העלאת משקלי העבודה]</p>

3. כללי איכות ומשקלים מחייבים:
• חל איסור מוחלט על תשובות עצלניות של מילה אחת כמו "מושלמת.", "טובה.", "נכון" או "מעולה" בדגשי הטכניקה!
• חל איסור מוחלט על משקלים לא הגיוניים כמו 0 ק"ג, 0.5 ק"ג, 1 ק"ג, או רצפים כמו 0,0,1!
• לכל תרגיל טעון (חדר כושר/משקולות) חובה לתת משקלי עבודה הגיוניים וריאליסטיים בק"ג המתאימים למשקל המתאמן (${weight} ק"ג).
• חוק הדעיכה (Set 1 >= Set 2 >= Set 3): המשקל בסט 1 חייב להיות הגבוה ביותר (למשל: סט 1: 40 ק"ג | סט 2: 35 ק"ג | סט 3: 30 ק"ג).

4. בסוף <div class="plan-tips"> עם 3 טיפי תזונה והתאוששות. עטוף ב-<div class="ai-plan-result">.`;

  console.log(`[GENERATE_PLAN_START] reqDays=${reqDays}, userId=${userId}`);
  const MAX_ATTEMPTS = 3;
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

      if (htmlLen > 800 && dayCount > 0) {
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
  const history = await getPlanHistory(userId, MAX_PLAN_HISTORY_TO_FETCH);
  const historyContext = buildPlanHistoryPromptContext(history);

  const trainingLogsResult = await handleGetTrainingLogs(userId);
  const displayName = normalizeUserDisplayName(userName);

  if (trainingLogsResult.error) {
    return {
      reply:
        `אני לא מצליח לגשת ליומן האימונים ב-DynamoDB כרגע.\n` +
        `שגיאה: ${trainingLogsResult.error}\n\n` +
        `בדוק בבקשה את ההרשאות (DynamoDB Query) ואת מבנה הטבלה.`,
      updatedPlanHtml: null
    };
  }

  let messages = chatData?.messages || [];
  const rawPlanHtml = planData?.planHtml || "אין תוכנית כרגע.";
  // Convert heavy plan HTML to lightweight text summary for fast 2-second Chat AI responses
  const currentPlanSummary = rawPlanHtml.length > 2500
    ? rawPlanHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 2000)
    : rawPlanHtml;

  let trainingLogsContext = "אין לוגי אימונים עדיין.";

  if (trainingLogs.length > 0) {
    const recentLogs = trainingLogs.slice(0, 10);

    trainingLogsContext = "היסטוריית אימונים (מהחדש לישן):\n";

    recentLogs.forEach(log => {
      trainingLogsContext += `\n--- אימון בתאריך: ${log.date} ---\n`;

      if (log.data.exercises && Array.isArray(log.data.exercises)) {
        log.data.exercises.slice(0, 8).forEach(exercise => {
          trainingLogsContext += `תרגיל: ${exercise.name}\n`;

          if (Array.isArray(exercise.sets) && exercise.sets.length > 0) {
            const setsDetails = exercise.sets.slice(0, 8).map((s, i) => {
              const weight = s.weight ? `${s.weight}kg` : 'משקל גוף';
              const reps = s.reps ? `${s.reps} חזרות` : '? חזרות';
              return `   סט ${i + 1}: ${weight} X ${reps}`;
            }).join("\n");

            trainingLogsContext += setsDetails + "\n";
          } else {
            trainingLogsContext += `   (אין פירוט סטים)\n`;
          }
        });
      }

      if (log.data.notes) {
        trainingLogsContext += `הערות אימון: ${log.data.notes}\n`;
      }
    });
  }

  const systemPrompt = `
  אתה FitMentor AI, מאמן אישי חכם, שמכיר את הפיצ'רים של האתר FitMentor ומסביר למשתמש איך להשתמש בהם.

  שם המשתמש (אם קיים): ${displayName || "לא ידוע"}

  כללי פנייה לפי שם (חשוב):
  - אם יש שם משתמש, כשזו הודעה ראשונה בשיחה (אין היסטוריית צ'אט) פתח בברכה קצרה עם השם שלו.
  - בהמשך השיחה, השתמש בשם מדי פעם בצורה טבעית (לא בכל הודעה).
  - אם אין שם משתמש, אל תנחש שם ואל תמציא.

  כללי שפה וסגנון (חשוב):
  - כתוב למשתמש בעברית פשוטה וברורה.
  - אל תשתמש ב-Markdown בכלל (בלי **, בלי *, בלי כותרות ###, בלי backticks).
  - אל תזכיר שמות קבצים/סיומות או מונחים טכניים (כמו JSON/DynamoDB).
  - השתמש ברשימות בצורה ידידותית: למשל "1) ..." או "- ...".

  הקשר מוצר (Product Context):
  - האתר כולל "לוג אימונים" (בתפריט הצד) לתיעוד משקלים וחזרות.
  - האתר כולל "מעקב התקדמות" ו"המלצות חכמות".
  - הנתונים נשמרים ומאפשרים לך לנתח שיפור בכוח/נפח.

  המצב הנוכחי:
  1. תוכנית אימונים נוכחית (תמצית): ${currentPlanSummary}
  2. היסטוריית אימונים מפורטת (מצורפת למטה) - השתמש בה כדי לנתח התקדמות במשקלי עבודה!
  3. בקשת המשתמש.

  הוראות:
  1. אם המשתמש שואל על התקדמות, הסתכל על המשקלים והחזרות בלוגים וציין מספרים מדויקים ("אני רואה שבשבוע שעבר עשית 60 קילו ועכשיו 65").
  2. אם המשתמש מבקש לשנות את התוכנית, שכתב את ה-HTML בהתאם.
  3. אם המשתמש מבקש "תוכנית חדשה":
     - אם יש סימני התקדמות בלוגים, אל תרוץ ישר ליצור תוכנית חדשה: קודם שאל שאלה קצרה על המטרה שלו עכשיו (ולא רק "מה המטרה"—הצע 2–4 אפשרויות נפוצות).
     - אם המשתמש מתעקש על "תוכנית חדשה לגמרי" או אומר שהתוכנית לא מתאימה/נבנתה בטעות: אל תייצר תוכנית בתוך הצ'אט.
       במקום זה החזר uiAction = "openNewPlanForm" ובקש ממנו למלא מחדש את הטופס.
     - אם אין מספיק לוגים/אין סימני התקדמות, שאל 1–2 שאלות קצרות כדי להבין למה הוא רוצה להחליף, והצע פתרון פשוט.
  
  פורמט תשובה חובה (החזר JSON תקין בלבד, ללא markdown וללא טקסט מחוץ ל-JSON):
  {
    "reply": "הטקסט שאתה עונה למשתמש בעברית (ללא מילוט מורכב)",
    "updatedPlanHtml": null,
    "uiAction": null
  }

  פרטי המתאמן: ${planParamsContext}
  סיכום התקדמות: ${progress.summary}
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
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash",
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

async function tryGenerateContent(promptText, isChatCall = false) {
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

  const timeoutMs = isChatCall ? 12000 : 25000;
  const maxTokens = isChatCall ? 1200 : MAX_OUTPUT_TOKENS;
  const modelsToTry = isChatCall ? ["google/gemini-2.5-flash-lite", "openai/gpt-4o-mini"] : FAST_AI_MODELS;
  let lastErr = null;

  for (let idx = 0; idx < modelsToTry.length; idx++) {
    const model = modelsToTry[idx];
    const t0 = Date.now();

    try {
      console.log(`[AI_CALL_START] model=${model}, isChatCall=${isChatCall}`);
      const response = await fetchWithHardTimeout("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openRouterKey}`,
          "HTTP-Referer": "https://fitmentor.app",
          "X-Title": "FitMentor"
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: isChatCall
                ? "You are FitMentor AI, an expert, friendly AI fitness coach. Reply ONLY with a single valid JSON object: {\"reply\": \"Your Hebrew reply here\", \"updatedPlanHtml\": null, \"uiAction\": null}. Do not include markdown codeblocks or text outside JSON."
                : "You are an elite master strength and conditioning sports scientist. Your exercise selections and recommended per-set weights must be 100% logically consistent, descending or equal across sets (Set 1 >= Set 2 >= Set 3) due to fatigue management (Set 1 is performed fresh with highest weight). Never output illogical weights like 0kg, 0.5kg, 1kg or 0,0,1 sequences for loaded exercises. Always provide realistic numerical kg values for every set of every loaded exercise. Return complete, concise, rich HTML for the workout plan."
            },
            { role: "user", content: promptText }
          ],
          max_tokens: maxTokens,
          temperature: 0.4
        })
      }, timeoutMs);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.warn(`[AI_HTTP_ERR] model=${model}, status=${response.status}: ${errText.slice(0, 150)}`);
        throw new Error(`AI API returned HTTP ${response.status} for ${model}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content;
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

  // Friendly Hebrew fallback for Chat UI
  return JSON.stringify({
    reply: "סליחה, המערכת עמוסה מעט כרגע. תוכל לשאול אותי שוב בעוד מספר שניות, אשמח לעזור!",
    updatedPlanHtml: null,
    uiAction: null,
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

function isYmd(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function parseYmdUtc(ymd) {
  if (!isYmd(ymd)) return null;
  const [y, m, d] = ymd.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function startOfDayUtc(date) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function filterLogsLastDays(logs, days) {
  const safeDays = Number.isFinite(Number(days)) ? Math.max(1, Math.floor(Number(days))) : 30;
  const today = startOfDayUtc(new Date());
  const start = startOfDayUtc(new Date(today));
  start.setUTCDate(today.getUTCDate() - (safeDays - 1));

  return (Array.isArray(logs) ? logs : [])
    .filter((l) => l && isYmd(l.date))
    .filter((l) => {
      const d = parseYmdUtc(l.date);
      return d && d >= start && d <= today;
    });
}

function safeParseJson(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
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
      const title = sanitizeUserFacingText(r?.title || "תובנה");
      const text = sanitizeUserFacingText(r?.text || r?.message || "");
      return { type, title, text };
    })
    .filter((r) => r.text && String(r.text).trim().length > 0)
    .slice(0, 8);
}

function buildAiInsightsFallback({ logsLastDays }) {
  const count = Array.isArray(logsLastDays) ? logsLastDays.length : 0;
  if (count <= 0) {
    return [
      {
        type: "tip",
        title: "אין מספיק נתונים",
        text: "כרגע אין אימונים מתועדים ב-30 הימים האחרונים. תעד עוד 2–3 אימונים, ואז אוכל לתת תובנות מדויקות יותר.",
      },
    ];
  }
  return [
    {
      type: "tip",
      title: "סיכום קצר",
      text: `ב-30 הימים האחרונים תיעדת ${count} אימונים. כדי שאוכל להסיק מסקנות מדויקות יותר, הקפד למלא משקל וחזרות בכל סט ולתעד גם אימונים קלים.`,
    },
  ];
}

async function handleGetAiInsights(userId, payload = {}) {
  const days = Number.isFinite(Number(payload?.days)) ? Number(payload.days) : 30;
  const trainingLogsResult = await handleGetTrainingLogs(userId);
  const trainingLogs = trainingLogsResult.logs || [];

  if (trainingLogsResult.error) {
    return {
      recommendations: [
        {
          type: "warning",
          title: "לא הצלחתי לטעון נתונים",
          text: "כרגע אני לא מצליח למשוך את לוג האימונים. נסה שוב עוד מעט.",
        },
      ],
      error: trainingLogsResult.error,
    };
  }

  const logsLastDays = filterLogsLastDays(trainingLogs, days);
  const contextLogs = logsLastDays.slice(0, 20);

  let trainingLogsContext = "אין לוגי אימונים עדיין.";
  if (contextLogs.length > 0) {
    trainingLogsContext = `לוגי אימונים (30 ימים אחרונים, מהחדש לישן):\n`;
    contextLogs.forEach((log) => {
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
      if (log?.data?.notes) trainingLogsContext += `הערות אימון: ${log.data.notes}\n`;
    });
  }

  const prompt = `
אתה FitMentor AI, מאמן אישי חכם.

המטרה שלך: להחזיר תובנות והמלצות קצרות וברורות על סמך לוגי האימונים של 30 הימים האחרונים בלבד.

כללי שפה וסגנון:
- כתוב בעברית פשוטה וברורה.
- בלי Markdown בכלל.
- אל תזכיר מונחים טכניים או שמות שירותים.

פורמט תשובה חובה: JSON בלבד, בדיוק במבנה הזה:
{
  "recommendations": [
    {"type": "tip|warning|neglect|stall|progression", "title": "כותרת קצרה", "text": "טקסט קצר ושימושי"}
  ]
}

דרישות:
- החזר לפחות 1 ועד 6 המלצות.
- אם אין מספיק מידע להסיק התקדמות במשקלים, כתוב המלצה על מה לתעד כדי לשפר דיוק.

לוגי אימונים:
${trainingLogsContext}
`;

  const raw = await tryGenerateContent(prompt);
  const parsed = safeParseJson(raw);
  let recommendations = normalizeRecommendations(parsed);
  if (!recommendations || recommendations.length === 0) {
    recommendations = buildAiInsightsFallback({ logsLastDays });
  }

  return {
    recommendations,
    meta: { days: Math.max(1, Math.floor(Number(days) || 30)), workoutsConsidered: logsLastDays.length },
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
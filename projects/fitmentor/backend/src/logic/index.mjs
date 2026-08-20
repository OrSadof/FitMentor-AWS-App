import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminListGroupsForUserCommand,
  ListUsersInGroupCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { errorResponse, getAuthenticatedIdentity, HttpError, requireAdmin } from "./auth.mjs";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const METRICS_USER_ID = "__METRICS__";
const METRICS_TOTAL_KEY = "TOTAL";
const USER_ACTIVITY_KEY = "UserActivity";

function decodeCognitoTokenPayload(token) {
  try {
    const base64Url = String(token || "").split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch {
    return {};
  }
}

function toYmd(date = new Date()) {
  const d = new Date(date);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toYmdInTimeZone(date = new Date(), timeZone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(date));
  } catch {
    return toYmd(date);
  }
}

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing env var: ${name}`);
}

function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function getAttr(user, attrName) {
  const attrs = user?.Attributes || [];
  const found = attrs.find(a => a?.Name === attrName);
  return found?.Value;
}

function mapCognitoUserToAdminRow(u) {
  const email = normalizeEmail(getAttr(u, "email") || u?.Username || "");
  const name = String(getAttr(u, "name") || getAttr(u, "given_name") || "").trim();
  const createdAt = u?.UserCreateDate ? new Date(u.UserCreateDate).toISOString().split("T")[0] : "";
  const enabled = u?.Enabled !== false;
  const userStatus = String(u?.UserStatus || "");

  let status = "active";
  if (userStatus === "UNCONFIRMED") status = "unconfirmed";
  else if (!enabled) status = "blocked";

  return {
    username: String(u?.Username || email || ""),
    name: name || "-",
    email: email || "-",
    joined: createdAt || "-",
    enabled,
    userStatus,
    status
  };
}

async function incrementMetric(field, by = 1) {
  const safeBy = Number(by) || 0;
  if (!field || safeBy === 0) return;

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { UserID: METRICS_USER_ID, DataType: METRICS_TOTAL_KEY },
    UpdateExpression: "SET #f = if_not_exists(#f, :zero) + :inc, updatedAt = :now",
    ExpressionAttributeNames: { "#f": String(field) },
    ExpressionAttributeValues: {
      ":zero": 0,
      ":inc": safeBy,
      ":now": new Date().toISOString()
    }
  }));
}

async function upsertUserActivity(email, patch = {}) {
  const now = new Date();
  const itemKey = { UserID: normalizeEmail(email), DataType: USER_ACTIVITY_KEY };
  const exprNames = { "#lastLoginAt": "lastLoginAt", "#lastLoginDate": "lastLoginDate" };
  const exprValues = { ":lastLoginAt": now.toISOString(), ":lastLoginDate": toYmd(now) };

  const setParts = [
    "#lastLoginAt = :lastLoginAt",
    "#lastLoginDate = :lastLoginDate",
    "updatedAt = :lastLoginAt"
  ];

  for (const [k, v] of Object.entries(patch || {})) {
    const nameKey = `#${k}`;
    const valueKey = `:${k}`;
    exprNames[nameKey] = k;
    exprValues[valueKey] = v;
    setParts.push(`${nameKey} = ${valueKey}`);
  }

  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: itemKey,
    UpdateExpression: `SET ${setParts.join(", ")}`,
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues
  }));
}

async function scanUserActivityItems() {
  const items = [];
  let lastKey;
  do {
    const res = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ExclusiveStartKey: lastKey,
      FilterExpression: "DataType = :dt",
      ExpressionAttributeValues: { ":dt": USER_ACTIVITY_KEY }
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function countSavedWorkoutLogs() {
  let count = 0;
  let exclusiveStartKey;
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      Select: "COUNT",
      FilterExpression: "begins_with(#dataType, :prefix)",
      ExpressionAttributeNames: { "#dataType": "DataType" },
      ExpressionAttributeValues: { ":prefix": "TrainingLog_" },
      ExclusiveStartKey: exclusiveStartKey,
    }));
    count += Number(response.Count || 0);
    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return count;
}

async function getMetricsTotals() {
  const res = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { UserID: METRICS_USER_ID, DataType: METRICS_TOTAL_KEY }
  }));
  return res?.Item || {};
}

async function listAllCognitoUsers(limit = 60) {
  requireEnv("COGNITO_USER_POOL_ID", USER_POOL_ID);

  const users = [];
  let paginationToken;
  do {
    const res = await cognito.send(new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Limit: Math.min(60, Math.max(1, Number(limit) || 60)),
      PaginationToken: paginationToken
    }));
    users.push(...(res.Users || []));
    paginationToken = res.PaginationToken;
  } while (paginationToken);

  return users;
}

async function getAllAdminUsernames() {
  requireEnv("COGNITO_USER_POOL_ID", USER_POOL_ID);
  const adminSet = new Set();
  let nextToken;
  try {
    do {
      const res = await cognito.send(new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: "Admins",
        NextToken: nextToken
      }));
      (res.Users || []).forEach(u => {
        if (u.Username) adminSet.add(normalizeEmail(u.Username));
        const email = normalizeEmail(getAttr(u, "email"));
        if (email) adminSet.add(email);
      });
      nextToken = res.NextToken;
    } while (nextToken);
  } catch (error) {
    console.error("[ADMIN_GROUP_LOOKUP_FAILED]", error);
    throw new HttpError(502, "Unable to verify Cognito administrator membership");
  }
  return adminSet;
}

async function handleAdminGetDashboardData(identity, payload = {}) {
  requireAdmin(identity);

  const limit = Number(payload.limit) || 100;
  const [cognitoUsers, adminUsernames] = await Promise.all([
    listAllCognitoUsers(limit),
    getAllAdminUsernames()
  ]);

  const validClientUsers = cognitoUsers
    .map(mapCognitoUserToAdminRow)
    .filter(u => {
        const uEmail = normalizeEmail(u?.email);
        const uUsername = normalizeEmail(u?.username);
        const callerEmail = normalizeEmail(identity.userId);
        const isCaller = uEmail === callerEmail || uUsername === callerEmail;
        const isInAdminGroup = adminUsernames.has(uEmail) || adminUsernames.has(uUsername);

        return !isCaller && !isInAdminGroup;
    });

  const [totals, workoutsSavedTotal] = await Promise.all([
    getMetricsTotals(),
    countSavedWorkoutLogs(),
  ]);
  const aiCallsTotal = Number(totals.aiCallsTotal || 0);

  const regularUserIds = new Set(validClientUsers.flatMap((user) => [
    normalizeEmail(user?.email),
    normalizeEmail(user?.username),
  ]).filter(Boolean));
  const activities = (await scanUserActivityItems())
    .filter((activity) => regularUserIds.has(normalizeEmail(activity?.UserID)));
  const todayUtc = toYmd(new Date());
  const todayIl = toYmdInTimeZone(new Date(), "Asia/Jerusalem");

  const activeTodayUtc = activities.filter(a => String(a.lastLoginDate || "") === todayUtc).length;
  const activeTodayIl = activities.filter(a => {
    const ts = a?.lastLoginAt;
    if (!ts) return false;
    return toYmdInTimeZone(ts, "Asia/Jerusalem") === todayIl;
  }).length;

  const now = new Date();
  const monthKeys = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthKeys.push(key);
  }

  const joinCounts = Object.fromEntries(monthKeys.map(k => [k, 0]));
  for (const u of validClientUsers) {
    if (!u?.joined) continue;
    const key = String(u.joined).substring(0, 7);
    if (key in joinCounts) joinCounts[key] += 1;
  }

  const dayKeys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(toYmdInTimeZone(d, "Asia/Jerusalem"));
  }
  const dailyCounts = Object.fromEntries(dayKeys.map(k => [k, 0]));
  for (const a of activities) {
    const d = a?.lastLoginAt ? toYmdInTimeZone(a.lastLoginAt, "Asia/Jerusalem") : "";
    if (d in dailyCounts) dailyCounts[d] += 1;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      stats: {
        usersRegistered: validClientUsers.length,
        activeToday: activeTodayIl,
        activeTodayUtc,
        workoutsSaved: workoutsSavedTotal,
        aiCallsTotal
      },
      charts: {
        joinTrend: { labels: monthKeys, data: monthKeys.map(k => joinCounts[k]) },
        dailyActivity: { labels: dayKeys, data: dayKeys.map(k => dailyCounts[k]) }
      },
      users: validClientUsers
    })
  };
}

async function handleAdminGetActivityDebug(identity) {
  requireAdmin(identity);

  const activities = await scanUserActivityItems();
  const todayUtc = toYmd(new Date());
  const todayIl = toYmdInTimeZone(new Date(), "Asia/Jerusalem");

  const sample = activities
    .slice(0, 10)
    .map(a => ({
      userId: a?.UserID,
      lastLoginAt: a?.lastLoginAt,
      lastLoginDate: a?.lastLoginDate,
      lastLoginDateIl: a?.lastLoginAt ? toYmdInTimeZone(a.lastLoginAt, "Asia/Jerusalem") : null,
      updatedAt: a?.updatedAt
    }));

  return {
    statusCode: 200,
    body: JSON.stringify({
      tableName: TABLE_NAME,
      todayUtc,
      todayIl,
      activityItemsCount: activities.length,
      sample
    })
  };
}

async function handleAdminSetUserBlocked(identity, payload = {}) {
  requireAdmin(identity);
  requireEnv("COGNITO_USER_POOL_ID", USER_POOL_ID);

  const username = String(payload.username || "").trim();
  const blocked = Boolean(payload.blocked);
  if (!username) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing username" }) };
  }

  const callerEmail = normalizeEmail(identity.userId);
  const targetUsername = normalizeEmail(username);
  if (targetUsername === callerEmail) {
    return { statusCode: 403, body: JSON.stringify({ message: "Cannot modify this user" }) };
  }

  const targetGroups = await cognito.send(new AdminListGroupsForUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: username,
  }));
  if ((targetGroups.Groups || []).some((group) => group.GroupName === "Admins")) {
    return { statusCode: 403, body: JSON.stringify({ message: "Administrator accounts cannot be modified here" }) };
  }

  if (blocked) {
    await cognito.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  } else {
    await cognito.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  }

  return { statusCode: 200, body: JSON.stringify({ message: blocked ? "User blocked" : "User unblocked" }) };
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const requestBody = event.body ? JSON.parse(event.body) : event;
    const { action, userId, payload = {} } = requestBody;
    if (!action) throw new HttpError(400, "Missing action");

    const isAdminAction = action.startsWith("admin");
    const identity = isAdminAction ? getAuthenticatedIdentity(event) : null;
    if (identity) requireAdmin(identity);

    const email = identity?.userId || normalizeEmail(userId);
    if (!email) throw new HttpError(400, "Missing userId");
    let responseBody = {};

    switch (action) {

      case "adminGetDashboardData": {
        const res = await handleAdminGetDashboardData(identity, payload);
        return {
          statusCode: res.statusCode,
          headers,
          body: res.body
        };
      }

      case "adminSetUserBlocked": {
        const res = await handleAdminSetUserBlocked(identity, payload);
        return {
          statusCode: res.statusCode,
          headers,
          body: res.body
        };
      }

      case "adminGetActivityDebug": {
        const res = await handleAdminGetActivityDebug(identity);
        return {
          statusCode: res.statusCode,
          headers,
          body: res.body
        };
      }

      case "register":
        try {
          await cognito.send(new SignUpCommand({
            ClientId: CLIENT_ID,
            Username: email,
            Password: payload.password,
            UserAttributes: [
              { Name: "email", Value: email },
              { Name: "name", Value: payload.name || "User" }
            ]
          }));

          responseBody = { message: "Verification link sent" };

        } catch {
          if (err.name === "UsernameExistsException") {
            return {
              statusCode: 409,
              headers,
              body: JSON.stringify({ message: "האימייל הזה כבר רשום במערכת." })
            };
          }
          if (err.name === "InvalidPasswordException") {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: "הסיסמה אינה עומדת בדרישות." })
            };
          }
          throw err;
        }
        break;

      case "confirmRegister":
        try {
          await cognito.send(new ConfirmSignUpCommand({
            ClientId: CLIENT_ID,
            Username: email,
            ConfirmationCode: payload.code
          }));
          responseBody = { message: "Verification successful" };
        } catch {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "קוד אימות שגוי או פג תוקף" })
          };
        }
        break;

      case "resendCode":
        try {
          await cognito.send(new ResendConfirmationCodeCommand({
            ClientId: CLIENT_ID,
            Username: email
          }));
          responseBody = { message: "Link reshared via email" };
        } catch {
          if (err.name === "UserNotFoundException") {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({ message: "האימייל לא קיים במערכת" })
            };
          }
          if ((err.name === "NotAuthorizedException" && err.message.includes("confirmed")) ||
            (err.name === "InvalidParameterException" && err.message.includes("confirmed"))) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: "המשתמש כבר מאומת", alreadyConfirmed: true })
            };
          }
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "שגיאה בשליחת קוד חוזר" })
          };
        }
        break;

      case "login":
        try {
          const authResponse = await cognito.send(new InitiateAuthCommand({
            ClientId: CLIENT_ID,
            AuthFlow: "USER_PASSWORD_AUTH",
            AuthParameters: {
              USERNAME: email,
              PASSWORD: payload.password
            }
          }));

          const idToken = authResponse.AuthenticationResult.IdToken;
          const decodedToken = decodeCognitoTokenPayload(idToken);
          const groups = decodedToken['cognito:groups'] || [];
          let role = "User";
          if (groups.includes("Admins")) {
            role = "Admin";
          }
          const userName = decodedToken['name'] || decodedToken['email'] || email;

          try {
            await upsertUserActivity(email, { loginMethod: "DirectAPI" });
            await incrementMetric("loginSuccessTotal", 1);
          } catch {}

          responseBody = {
            message: "Login successful",
            token: idToken,
            idToken,
            accessToken: authResponse.AuthenticationResult.AccessToken,
            refreshToken: authResponse.AuthenticationResult.RefreshToken,
            userName: userName,
            role: role,
            groups: groups
          };

        } catch (err) {
          if (err.name === "UserDisabledException" || (err.name === "NotAuthorizedException" && (String(err.message || "").toLowerCase().includes("disabled") || String(err.message || "").toLowerCase().includes("blocked")))) {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: "משהו השתבש, או שהאימייל או הסיסמה אינם נכונים.", isBlocked: true, status: "blocked" })
            };
          }
          if (err.name === "NotAuthorizedException") {
            return {
              statusCode: 401,
              headers,
              body: JSON.stringify({ message: "משהו השתבש, או שהאימייל או הסיסמה אינם נכונים." })
            };
          }
          if (err.name === "UserNotConfirmedException") {
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({ message: "המשתמש לא אומת באימייל" })
            };
          }
          throw err;
        }
        break;

      case "forgotPassword":
        try {
          await cognito.send(new ForgotPasswordCommand({
            ClientId: CLIENT_ID,
            Username: email
          }));
          responseBody = { message: "איפוס הסיסמה נשלח לאימייל" };
        } catch {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "שגיאה בשליחת איפוס סיסמה" })
          };
        }
        break;

      case "confirmForgotPassword":
        try {
          const nextPassword = String(payload.newPassword || "");
          const code = String(payload.code || "").trim();
          const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d).{8,}$/;

          if (!code) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: "חסר קוד איפוס" })
            };
          }
          if (!PASSWORD_REGEX.test(nextPassword)) {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: "הסיסמה חייבת להכיל לפחות 8 תווים, לפחות אות גדולה אחת ולפחות מספר אחד" })
            };
          }

          await cognito.send(new ConfirmForgotPasswordCommand({
            ClientId: CLIENT_ID,
            Username: email,
            ConfirmationCode: code,
            Password: nextPassword,
          }));

          responseBody = { message: "הסיסמה עודכנה בהצלחה" };
        } catch (err) {
          if (err.name === "CodeMismatchException" || err.name === "ExpiredCodeException") {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: "קוד האיפוס שגוי או פג תוקף" })
            };
          }
          if (err.name === "InvalidPasswordException") {
            return {
              statusCode: 400,
              headers,
              body: JSON.stringify({ message: "הסיסמה אינה עומדת בדרישות" })
            };
          }
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ message: "שגיאה באיפוס סיסמה" })
          };
        }
        break;

      case "savePlan":
        responseBody = { message: "Plan saved placeholder" };
        break;

      case "getHistory":
        responseBody = { history: [] };
        break;

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Invalid action: ${action}` })
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseBody),
    };

  } catch (err) {
    return errorResponse(err, headers);
  }
};

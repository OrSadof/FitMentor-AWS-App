import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  AdminInitiateAuthCommand,
  ListUsersCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  ListUsersInGroupCommand
} from "@aws-sdk/client-cognito-identity-provider";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const cognito = new CognitoIdentityProviderClient({});

const TABLE_NAME = process.env.TABLE_NAME || "FitMentorData";
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").toLowerCase().trim();

const METRICS_USER_ID = "__METRICS__";
const METRICS_TOTAL_KEY = "TOTAL";
const USER_ACTIVITY_KEY = "UserActivity";

function parseJwtPayload(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Error parsing JWT:", e);
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

function isAdminEmail(email) {
  return String(email || "").toLowerCase().trim() === ADMIN_EMAIL;
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

  try {
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
  } catch (e) {
    console.error("Increment metric error:", e);
  }
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

  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: itemKey,
      UpdateExpression: `SET ${setParts.join(", ")}`,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues
    }));
  } catch (e) {
    console.error("Upsert user activity error:", e);
  }
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

async function getMetricsTotals() {
  try {
    const res = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { UserID: METRICS_USER_ID, DataType: METRICS_TOTAL_KEY }
    }));
    return res?.Item || {};
  } catch {
    return {};
  }
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
    if (users.length >= 500) break;
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
  } catch (e) {
    console.warn("Could not fetch Admins group members:", e.message);
  }
  return adminSet;
}

async function handleAdminGetDashboardData(adminEmail, payload = {}, userRole = "User") {
  if (userRole !== "Admin" && !isAdminEmail(adminEmail)) {
    return { statusCode: 403, body: JSON.stringify({ message: "Access denied" }) };
  }

  const limit = Number(payload.limit) || 100;
  const [cognitoUsers, adminUsernames] = await Promise.all([
    listAllCognitoUsers(limit),
    getAllAdminUsernames()
  ]);

  const users = cognitoUsers
    .map(mapCognitoUserToAdminRow)
    .filter(u => {
      const uEmail = normalizeEmail(u?.email);
      const uUsername = normalizeEmail(u?.username);
      const callerEmail = normalizeEmail(adminEmail);
      
      const isCaller = (uEmail === callerEmail || uUsername === callerEmail);
      const isHardcodedAdmin = isAdminEmail(uEmail);
      const isInAdminGroup = adminUsernames.has(uEmail) || adminUsernames.has(uUsername);
      
      return !isCaller && !isHardcodedAdmin && !isInAdminGroup;
    });

  const totals = await getMetricsTotals();
  const workoutsSavedTotal = Number(totals.workoutsSavedTotal || 0);
  const aiCallsTotal = Number(totals.aiCallsTotal || 0);

  const activities = await scanUserActivityItems();
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
  for (const u of cognitoUsers) {
    if (!u?.UserCreateDate) continue;
    const d = new Date(u.UserCreateDate);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key in joinCounts) joinCounts[key] += 1;
  }

  const dayKeys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dayKeys.push(toYmd(d));
  }
  const dailyCounts = Object.fromEntries(dayKeys.map(k => [k, 0]));
  for (const a of activities) {
    const d = String(a.lastLoginDate || "");
    if (d in dailyCounts) dailyCounts[d] += 1;
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      stats: {
        usersRegistered: cognitoUsers.length,
        activeToday: activeTodayIl,
        activeTodayUtc,
        workoutsSaved: workoutsSavedTotal,
        aiCallsTotal
      },
      charts: {
        joinTrend: { labels: monthKeys, data: monthKeys.map(k => joinCounts[k]) },
        dailyActivity: { labels: dayKeys, data: dayKeys.map(k => dailyCounts[k]) }
      },
      users
    })
  };
}

async function handleAdminSetUserBlocked(adminEmail, payload = {}, userRole = "User") {
  if (userRole !== "Admin" && !isAdminEmail(adminEmail)) {
    return { statusCode: 403, body: JSON.stringify({ message: "Access denied" }) };
  }
  requireEnv("COGNITO_USER_POOL_ID", USER_POOL_ID);

  const username = String(payload.username || "").trim();
  const blocked = Boolean(payload.blocked);
  if (!username) {
    return { statusCode: 400, body: JSON.stringify({ message: "Missing username" }) };
  }

  const callerEmail = normalizeEmail(adminEmail);
  const targetUsername = normalizeEmail(username);
  if (targetUsername === callerEmail || isAdminEmail(targetUsername)) {
    return { statusCode: 403, body: JSON.stringify({ message: "Cannot modify this user" }) };
  }

  if (blocked) {
    await cognito.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  } else {
    await cognito.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  }

  return { statusCode: 200, body: JSON.stringify({ message: blocked ? "User blocked" : "User unblocked" }) };
}

async function handleCognitoTrigger(event) {
  const triggerSource = String(event.triggerSource || "");
  const email = normalizeEmail(event?.request?.userAttributes?.email || event.userName || "");

  if (!email) return;

  if (triggerSource === "PostAuthentication_Authentication") {
    await upsertUserActivity(email, { lastAuthTriggerSource: triggerSource });
  }

  if (triggerSource === "PostConfirmation_ConfirmSignUp") {
    try {
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { UserID: email, DataType: USER_ACTIVITY_KEY },
        UpdateExpression: "SET confirmedAt = :now, updatedAt = :now",
        ExpressionAttributeValues: { ":now": new Date().toISOString() }
      }));
    } catch (dbError) {
      console.error("Error updating DB on confirmation:", dbError);
    }

    try {
      const groupsRes = await cognito.send(new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: event.userName
      }));
      const groups = (groupsRes.Groups || []).map(g => g.GroupName);
      
      if (!groups.includes("Admins")) {
        await cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: event.userName,
          GroupName: "Users"
        }));
      }
    } catch (groupError) {
      console.error("Error handling group logic:", groupError);
    }
  }
}

export const handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST,GET"
  };

  if (event?.triggerSource) {
    try {
      await handleCognitoTrigger(event);
    } catch (e) {
      console.error("Trigger handling error:", e);
    }
    return event;
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const requestBody = event.body ? JSON.parse(event.body) : event;
    const { action, userId, payload = {} } = requestBody;

    if (!userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing userId" }) };
    }

    const email = userId.toLowerCase().trim();
    let responseBody = {};

    const authHeader = event.headers?.Authorization || event.headers?.authorization || "";
    let userRole = "User";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.substring(7);
        const decoded = parseJwtPayload(token);
        const groups = decoded['cognito:groups'] || [];
        if (groups.includes("Admins")) {
          userRole = "Admin";
        }
      } catch (e) {
        console.error("Token parsing error:", e);
      }
    }

    switch (action) {
      case "adminGetDashboardData": {
        const res = await handleAdminGetDashboardData(email, payload, userRole);
        return { statusCode: res.statusCode, headers, body: res.body };
      }

      case "adminSetUserBlocked": {
        const res = await handleAdminSetUserBlocked(email, payload, userRole);
        return { statusCode: res.statusCode, headers, body: res.body };
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
          responseBody = { message: "Verification link / code sent" };
        } catch (err) {
          if (err.name === "UsernameExistsException") {
            return { statusCode: 409, headers, body: JSON.stringify({ message: "User email already exists." }) };
          }
          if (err.name === "InvalidPasswordException") {
            return { statusCode: 400, headers, body: JSON.stringify({ message: "Password does not meet complexity requirements." }) };
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
        } catch (err) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid or expired confirmation code" }) };
        }
        break;

      case "resendCode":
        try {
          await cognito.send(new ResendConfirmationCodeCommand({
            ClientId: CLIENT_ID,
            Username: email
          }));
          responseBody = { message: "Confirmation code resent via email" };
        } catch (err) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "Failed to resend confirmation code" }) };
        }
        break;

      case "login":
        try {
          const authAttempts = [
            () => cognito.send(new InitiateAuthCommand({
              ClientId: CLIENT_ID,
              AuthFlow: "USER_PASSWORD_AUTH",
              AuthParameters: { USERNAME: email, PASSWORD: payload.password }
            })),
            () => cognito.send(new AdminInitiateAuthCommand({
              UserPoolId: USER_POOL_ID,
              ClientId: CLIENT_ID,
              AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
              AuthParameters: { USERNAME: email, PASSWORD: payload.password }
            }))
          ];

          let authResponse;
          let lastErr;
          for (const attempt of authAttempts) {
            try {
              authResponse = await attempt();
              lastErr = undefined;
              break;
            } catch (e) {
              const msg = String(e?.message || "");
              if (msg.includes("Auth flow not enabled")) {
                lastErr = e;
                continue;
              }
              throw e;
            }
          }

          if (!authResponse) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: lastErr?.message || "Authentication failed" }) };
          }

          const idToken = authResponse.AuthenticationResult.IdToken;
          const decodedToken = parseJwtPayload(idToken);
          const groups = decodedToken['cognito:groups'] || [];
          let role = groups.includes("Admins") ? "Admin" : "User";
          const userName = decodedToken['name'] || decodedToken['email'] || email;

          await upsertUserActivity(email, { loginMethod: "DirectAPI" });
          await incrementMetric("loginSuccessTotal", 1);

          responseBody = {
            message: "Login successful",
            token: idToken,
            userName,
            role,
            groups
          };
        } catch (err) {
          if (err.name === "NotAuthorizedException") {
            return { statusCode: 401, headers, body: JSON.stringify({ message: "Incorrect email or password." }) };
          }
          if (err.name === "UserNotConfirmedException") {
            return { statusCode: 403, headers, body: JSON.stringify({ message: "Email address not verified." }) };
          }
          throw err;
        }
        break;

      case "forgotPassword":
        try {
          await cognito.send(new ForgotPasswordCommand({ ClientId: CLIENT_ID, Username: email }));
          responseBody = { message: "Password reset code sent to email" };
        } catch (err) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: "Error sending password reset request" }) };
        }
        break;

      case "confirmForgotPassword":
        try {
          await cognito.send(new ConfirmForgotPasswordCommand({
            ClientId: CLIENT_ID,
            Username: email,
            ConfirmationCode: String(payload.code || "").trim(),
            Password: String(payload.newPassword || ""),
          }));
          responseBody = { message: "Password reset successful" };
        } catch (err) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: err.message || "Password reset failed" }) };
        }
        break;

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: `Invalid action: ${action}` }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(responseBody) };

  } catch (err) {
    console.error("FATAL ERROR:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

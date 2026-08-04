const API_BASE_URL = "https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod";
const API_FALLBACK_URL = "https://jctrvppwp5.execute-api.us-east-1.amazonaws.com/prod";

async function apiRequest(endpoint, payload, token = null) {
  const urls = [
    `${API_BASE_URL}/${endpoint}`,
    `${API_FALLBACK_URL}/${endpoint}`
  ];

  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let lastError = null;

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      const rawText = await res.text().catch(() => "");
      let data = {};
      if (rawText) {
        try { data = JSON.parse(rawText); } catch { data = { rawText }; }
      }

      // Automatically unwrap API Gateway proxy response body if present
      if (data && typeof data.body === 'string') {
        try {
          const bodyObj = JSON.parse(data.body);
          data = { ...data, ...bodyObj };
        } catch { }
      }

      if (res.ok && data) {
        if (data.statusCode && data.statusCode >= 400) {
          const message = data.message || data.error || `HTTP error ${data.statusCode}`;
          const err = new Error(message);
          err.status = data.statusCode;
          err.data = data;
          throw err;
        }
        return data;
      }

      // Don't retry on HTTP errors (4xx/5xx) – they'll fail again
      const message = data.message || data.error || `HTTP error ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.data = data;
      throw err;
    } catch (err) {
      lastError = err;
      // Only retry on network errors (no .status means fetch itself failed)
      if (err.status) {
        break;
      }
    }
  }

  console.error(`API Error on ${endpoint}:`, lastError);
  throw lastError;
}

export const fitmentorApi = {
  // Logic Lambda (/API)
  login: (email, password) =>
    apiRequest("API", { action: "login", userId: email, payload: { password } }),

  register: (email, password, name) =>
    apiRequest("API", { action: "register", userId: email, payload: { password, name } }),

  confirmRegister: (email, code) =>
    apiRequest("API", { action: "confirmRegister", userId: email, payload: { code } }),

  resendCode: (email) =>
    apiRequest("API", { action: "resendCode", userId: email }),

  forgotPassword: (email) =>
    apiRequest("API", { action: "forgotPassword", userId: email }),

  confirmForgotPassword: (email, code, newPassword) =>
    apiRequest("API", { action: "confirmForgotPassword", userId: email, payload: { code, newPassword } }),

  adminGetDashboardData: (adminEmail, token) =>
    apiRequest("API", { action: "adminGetDashboardData", userId: adminEmail, payload: { limit: 200 } }, token),

  adminSetUserBlocked: (adminEmail, targetUsername, blocked, token) =>
    apiRequest("API", { action: "adminSetUserBlocked", userId: adminEmail, payload: { username: targetUsername, blocked } }, token),

  // Dashboard Lambda (/Dashboard)
  getPlan: (userId) =>
    apiRequest("Dashboard", { action: "getPlan", userId }),

  generatePlan: (userId, params) =>
    apiRequest("Dashboard", { action: "generatePlan", userId, payload: params }),

  savePlan: (userId, planHtml, params) =>
    apiRequest("Dashboard", { action: "savePlan", userId, payload: { planHtml, params } }),

  deletePlan: (userId) =>
    apiRequest("Dashboard", { action: "deletePlan", userId }),

  chat: (userId, message, userName, sessions = null, activeSessionId = null) =>
    apiRequest("Dashboard", { action: "chat", userId, payload: { message, userName, sessions, activeSessionId } }),

  getChatHistory: (userId) =>
    apiRequest("Dashboard", { action: "getChatHistory", userId }),

  saveChatHistory: (userId, sessions) =>
    apiRequest("Dashboard", { action: "saveChatHistory", userId, payload: { sessions } }),

  getAiInsights: (userId, days = 30) =>
    apiRequest("Dashboard", { action: "getAiInsights", userId, payload: { days } }),

  getAchievements: (userId, logs) =>
    apiRequest("Dashboard", { action: "getAchievements", userId, payload: { logs } }),

  // Progress Lambda (/Progress)
  getProgressData: (userId, days = 365) =>
    apiRequest("Progress", { action: "getProgressData", userId, payload: { days } }),

  // Training Log Lambda (/TrainingLog)
  saveWorkoutLog: (userId, date, logData) =>
    apiRequest("TrainingLog", { action: "saveWorkoutLog", userId, payload: { date, log: logData } }),

  getWorkoutLog: (userId, date) =>
    apiRequest("TrainingLog", { action: "getWorkoutLog", userId, payload: { date } }),

  deleteWorkoutLog: (userId, date) =>
    apiRequest("TrainingLog", { action: "deleteWorkoutLog", userId, payload: { date } })
};

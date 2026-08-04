import { AWS_CONFIG } from "./awsConfig";

const getApiUrl = (endpoint) => {
  const base = AWS_CONFIG.API_BASE_URL.replace(/\/$/, "");
  return base ? `${base}/${endpoint.replace(/^\//, "")}` : `/${endpoint.replace(/^\//, "")}`;
};

async function apiRequest(endpoint, payload, token = null) {
  const url = getApiUrl(endpoint);
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || `HTTP error ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
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
    apiRequest("API", { action: "adminGetDashboardData", userId: adminEmail }, token),

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

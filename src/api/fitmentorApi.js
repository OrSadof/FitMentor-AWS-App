const API_BASE_URL = String(
  import.meta.env.VITE_API_BASE_URL || "https://8wc1g61715.execute-api.il-central-1.amazonaws.com/prod"
).replace(/\/$/, "");

function getIdToken() {
  return localStorage.getItem("fitmentor_idToken") || "";
}

async function apiRequest(endpoint, payload, { authenticated = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (authenticated) {
    const token = getIdToken();
    if (!token) throw new Error("Authentication required");
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Unable to reach the AWS API");
  }

  const rawText = await response.text().catch(() => "");
  let data = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error("AWS returned an invalid response");
    }
  }

  if (data && typeof data.body === "string") {
    try {
      data = { ...data, ...JSON.parse(data.body) };
    } catch {
      throw new Error("AWS returned an invalid response body");
    }
  }

  const effectiveStatus = Number(data?.statusCode) || response.status;
  if (!response.ok || effectiveStatus >= 400) {
    if (authenticated && effectiveStatus === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("fitmentor:auth-expired"));
    }
    const error = new Error(data?.message || data?.error || `AWS request failed (${effectiveStatus})`);
    error.status = effectiveStatus;
    throw error;
  }

  return data;
}

const cloudRequest = (endpoint, payload) => apiRequest(endpoint, payload, { authenticated: true });

export const fitmentorApi = {
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

  adminGetDashboardData: () =>
    cloudRequest("Admin", { action: "adminGetDashboardData", payload: { limit: 200 } }),

  adminSetUserBlocked: (_adminEmail, targetUsername, blocked) =>
    cloudRequest("Admin", { action: "adminSetUserBlocked", payload: { username: targetUsername, blocked } }),

  getPlan: () => cloudRequest("Dashboard", { action: "getPlan" }),
  generatePlan: (_userId, params) => cloudRequest("Dashboard", { action: "generatePlan", payload: params }),
  savePlan: (_userId, planHtml, params) =>
    cloudRequest("Dashboard", { action: "savePlan", payload: { planHtml, params } }),
  deletePlan: () => cloudRequest("Dashboard", { action: "deletePlan" }),
  chat: (_userId, message, _userName, _sessions, activeSessionId = null) =>
    cloudRequest("Dashboard", { action: "chat", payload: { message, activeSessionId } }),
  getChatHistory: () => cloudRequest("Dashboard", { action: "getChatHistory" }),
  saveChatHistory: (_userId, sessions) =>
    cloudRequest("Dashboard", { action: "saveChatHistory", payload: { sessions } }),
  getAiInsights: (_userId, days = 30) =>
    cloudRequest("Dashboard", { action: "getAiInsights", payload: { days } }),

  getProgressData: (_userId, days = 365) =>
    cloudRequest("Progress", { action: "getProgressData", payload: { days } }),

  saveWorkoutLog: (_userId, date, logData) =>
    cloudRequest("TrainingLog", { action: "saveWorkoutLog", payload: { date, log: logData } }),
  getWorkoutLog: (_userId, date) =>
    cloudRequest("TrainingLog", { action: "getWorkoutLog", payload: { date } }),
  deleteWorkoutLog: (_userId, date) =>
    cloudRequest("TrainingLog", { action: "deleteWorkoutLog", payload: { date } }),
};

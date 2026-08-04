import axios from 'axios';

// Default API URL (Will be populated with deployed AWS API Gateway endpoint)
let API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const setApiBaseUrl = (url) => {
  API_BASE_URL = url;
};

export const getApiBaseUrl = () => API_BASE_URL;

// Helper to make POST calls to our AWS API Gateway routes
const callApi = async (endpoint, data) => {
  if (!API_BASE_URL) {
    console.warn("API_BASE_URL is not set yet. Call will fail unless configured.");
  }
  const url = `${API_BASE_URL.replace(/\/$/, '')}${endpoint}`;
  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.data;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error.response?.data || error;
  }
};

// 1. Auth & Profile API (/API)
export const authApi = {
  login: (email, password) => callApi('/API', { action: 'login', email, password }),
  register: (email, password, name) => callApi('/API', { action: 'register', email, password, name }),
  confirmRegister: (email, code) => callApi('/API', { action: 'confirmRegister', email, code }),
  forgotPassword: (email) => callApi('/API', { action: 'forgotPassword', email }),
  confirmForgotPassword: (email, code, newPassword) => callApi('/API', { action: 'confirmForgotPassword', email, code, newPassword }),
  getProfile: (userId) => callApi('/API', { action: 'getProfile', userId }),
  updateProfile: (userId, profileData) => callApi('/API', { action: 'updateProfile', userId, profileData }),
  // Admin Endpoints
  getAdminDashboard: (adminUserId) => callApi('/API', { action: 'getAdminDashboard', userId: adminUserId }),
  toggleUserStatus: (adminUserId, targetUsername, enable) => callApi('/API', { action: 'toggleUserStatus', userId: adminUserId, targetUsername, enable }),
};

// 2. Dashboard & AI Recommendations API (/Dashboard)
export const dashboardApi = {
  getPlan: (userId) => callApi('/Dashboard', { action: 'getPlan', userId }),
  generatePlan: (userId, payload) => callApi('/Dashboard', { action: 'generatePlan', userId, payload }),
  savePlan: (userId, payload) => callApi('/Dashboard', { action: 'savePlan', userId, payload }),
  deletePlan: (userId) => callApi('/Dashboard', { action: 'deletePlan', userId }),
  chat: (userId, payload) => callApi('/Dashboard', { action: 'chat', userId, payload }),
  getChatHistory: (userId) => callApi('/Dashboard', { action: 'getChatHistory', userId }),
};

// 3. Progress Tracking API (/Progress)
export const progressApi = {
  getProgress: (userId) => callApi('/Progress', { action: 'getProgress', userId }),
  addProgressEntry: (userId, entry) => callApi('/Progress', { action: 'addProgressEntry', userId, entry }),
  deleteProgressEntry: (userId, date) => callApi('/Progress', { action: 'deleteProgressEntry', userId, date }),
};

// 4. Workout & Training Logs API (/TrainingLog)
export const trainingApi = {
  getWorkoutLogs: (userId) => callApi('/TrainingLog', { action: 'getWorkoutLogs', userId }),
  addWorkoutLog: (userId, workoutData) => callApi('/TrainingLog', { action: 'addWorkoutLog', userId, workoutData }),
  deleteWorkoutLog: (userId, workoutId) => callApi('/TrainingLog', { action: 'deleteWorkoutLog', userId, workoutId }),
};

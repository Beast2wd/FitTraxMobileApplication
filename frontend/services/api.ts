import axios from 'axios';
import Constants from 'expo-constants';

const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout for large requests
});

// User Profile APIs
export const userAPI = {
  createOrUpdateProfile: async (profileData: any) => {
    const response = await api.post('/user/profile', profileData);
    return response.data;
  },
  getProfile: async (userId: string) => {
    const response = await api.get(`/user/profile/${userId}`);
    return response.data;
  },
};

// Food/Meal APIs
export const foodAPI = {
  analyzeFood: async (data: { user_id: string; image_base64: string; meal_category: string; local_date?: string }) => {
    try {
      // Get local date in YYYY-MM-DD format (user's local timezone, not UTC)
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const localDate = `${year}-${month}-${day}`;
      
      const requestData = {
        ...data,
        local_date: data.local_date || localDate
      };
      const response = await api.post('/analyze-food', requestData, {
        timeout: 90000, // 90 second timeout for AI analysis
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        throw new Error('Analysis timed out. Please try again with a smaller image.');
      }
      if (error.response?.status === 500) {
        throw new Error('Server error analyzing food. Please try again.');
      }
      throw error;
    }
  },
  getMeals: async (userId: string, days: number = 7) => {
    const response = await api.get(`/meals/${userId}?days=${days}`);
    return response.data;
  },
  deleteMeal: async (mealId: string) => {
    const response = await api.delete(`/meals/${mealId}`);
    return response.data;
  },
  updateMeal: async (mealId: string, data: { calories: number; protein: number; carbs: number; fat: number }) => {
    const response = await api.put(`/meals/${mealId}`, data);
    return response.data;
  },
};

// Workout APIs
export const workoutAPI = {
  addWorkout: async (workoutData: any) => {
    const response = await api.post('/workouts', workoutData);
    return response.data;
  },
  getWorkouts: async (userId: string, days: number = 7) => {
    const response = await api.get(`/workouts/${userId}?days=${days}`);
    return response.data;
  },
  deleteWorkout: async (workoutId: string) => {
    const response = await api.delete(`/workouts/${workoutId}`);
    return response.data;
  },
};

// Water APIs
export const waterAPI = {
  addWater: async (waterData: any) => {
    const response = await api.post('/water', waterData);
    return response.data;
  },
  getWaterIntake: async (userId: string, days: number = 7) => {
    const response = await api.get(`/water/${userId}?days=${days}`);
    return response.data;
  },
  deleteWater: async (waterId: string) => {
    const response = await api.delete(`/water/${waterId}`);
    return response.data;
  },
};

// Heart Rate APIs
export const heartRateAPI = {
  addHeartRate: async (hrData: any) => {
    const response = await api.post('/heart-rate', hrData);
    return response.data;
  },
  getHeartRate: async (userId: string, days: number = 7) => {
    const response = await api.get(`/heart-rate/${userId}?days=${days}`);
    return response.data;
  },
  getHeartRateZones: async (userId: string) => {
    const response = await api.get(`/heart-rate/zones/${userId}`);
    return response.data;
  },
  deleteHeartRate: async (heartRateId: string) => {
    const response = await api.delete(`/heart-rate/${heartRateId}`);
    return response.data;
  },
};

// Workout Plans APIs
export const plansAPI = {
  getWorkoutPlans: async (filters?: { level?: string; goal?: string; type?: string }) => {
    const params = new URLSearchParams(filters as any).toString();
    const response = await api.get(`/workout-plans?${params}`);
    return response.data;
  },
  getWorkoutPlan: async (planId: string) => {
    const response = await api.get(`/workout-plans/${planId}`);
    return response.data;
  },
  startPlan: async (userPlanData: any) => {
    const response = await api.post('/user-plans', userPlanData);
    return response.data;
  },
  getUserPlans: async (userId: string, status?: string) => {
    const params = status ? `?status=${status}` : '';
    const response = await api.get(`/user-plans/${userId}${params}`);
    return response.data;
  },
  updateUserPlan: async (userPlanId: string, updateData: any) => {
    const params = new URLSearchParams(updateData).toString();
    const response = await api.put(`/user-plans/${userPlanId}?${params}`);
    return response.data;
  },
};

// Dashboard API
export const dashboardAPI = {
  getDashboard: async (userId: string) => {
    // Get local date in YYYY-MM-DD format (user's local timezone)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const localDate = `${year}-${month}-${day}`;
    
    const response = await api.get(`/dashboard/${userId}?local_date=${localDate}`);
    return response.data;
  },
};

// Step Tracker API
export const stepsAPI = {
  saveSteps: async (data: { 
    user_id: string; 
    steps: number; 
    date: string; 
    source?: string;
    calories_burned?: number;
    distance_miles?: number;
  }) => {
    const response = await api.post('/steps', data);
    return response.data;
  },
  getTodaySteps: async (userId: string) => {
    const response = await api.get(`/steps/${userId}/today`);
    return response.data;
  },
  getHistory: async (userId: string, days: number = 30) => {
    const response = await api.get(`/steps/${userId}/history?days=${days}`);
    return response.data;
  },
  getWeekly: async (userId: string) => {
    const response = await api.get(`/steps/${userId}/weekly`);
    return response.data;
  },
  getMonthly: async (userId: string) => {
    const response = await api.get(`/steps/${userId}/monthly`);
    return response.data;
  },
  saveSettings: async (data: {
    user_id: string;
    daily_goal: number;
    tracking_enabled: boolean;
    auto_sync_health: boolean;
  }) => {
    const response = await api.post('/steps/settings', data);
    return response.data;
  },
  getSettings: async (userId: string) => {
    const response = await api.get(`/steps/settings/${userId}`);
    return response.data;
  },
  deleteDaily: async (userId: string) => {
    const response = await api.delete(`/steps/${userId}/history/daily`);
    return response.data;
  },
  deleteWeekly: async (userId: string) => {
    const response = await api.delete(`/steps/${userId}/history/weekly`);
    return response.data;
  },
  deleteMonthly: async (userId: string) => {
    const response = await api.delete(`/steps/${userId}/history/monthly`);
    return response.data;
  },
  deleteAll: async (userId: string) => {
    const response = await api.delete(`/steps/${userId}/history/all`);
    return response.data;
  },
};

export default api;

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Health data types
export interface HealthData {
  steps: number;
  distance: number; // in miles
  activeCalories: number;
  totalCalories: number;
  heartRate: {
    current: number;
    min: number;
    max: number;
    avg: number;
  } | null;
  sleep: {
    totalMinutes: number;
    deepMinutes: number;
    lightMinutes: number;
    remMinutes: number;
    awakeMinutes: number;
  } | null;
  workouts: Array<{
    type: string;
    duration: number;
    calories: number;
    distance?: number;
    startTime: string;
    endTime: string;
  }>;
  lastSyncTime: string | null;
}

export interface ConnectionStatus {
  appleHealth: {
    available: boolean;
    connected: boolean;
    lastSync: string | null;
  };
  googleFit: {
    available: boolean;
    connected: boolean;
    lastSync: string | null;
  };
}

const STORAGE_KEYS = {
  APPLE_HEALTH_CONNECTED: 'apple_health_connected',
  GOOGLE_FIT_CONNECTED: 'google_fit_connected',
  LAST_SYNC_TIME: 'health_last_sync_time',
  CACHED_HEALTH_DATA: 'cached_health_data',
};

// Default empty health data
const getEmptyHealthData = (): HealthData => ({
  steps: 0,
  distance: 0,
  activeCalories: 0,
  totalCalories: 0,
  heartRate: null,
  sleep: null,
  workouts: [],
  lastSyncTime: null,
});

// Generate simulated health data for demo purposes
const generateSimulatedData = (): HealthData => {
  const now = new Date();
  const hour = now.getHours();
  
  // Simulate steps based on time of day
  const baseSteps = Math.floor(Math.random() * 3000) + 2000;
  const timeMultiplier = hour / 24;
  const steps = Math.floor(baseSteps * timeMultiplier);
  
  return {
    steps: steps,
    distance: parseFloat((steps * 0.0005).toFixed(2)), // Approximate miles
    activeCalories: Math.floor(steps * 0.04),
    totalCalories: Math.floor(steps * 0.04) + 1500, // BMR + active
    heartRate: {
      current: Math.floor(Math.random() * 20) + 65,
      min: Math.floor(Math.random() * 10) + 55,
      max: Math.floor(Math.random() * 30) + 100,
      avg: Math.floor(Math.random() * 15) + 70,
    },
    sleep: {
      totalMinutes: Math.floor(Math.random() * 60) + 400, // 6.5-8 hours
      deepMinutes: Math.floor(Math.random() * 30) + 60,
      lightMinutes: Math.floor(Math.random() * 60) + 180,
      remMinutes: Math.floor(Math.random() * 30) + 60,
      awakeMinutes: Math.floor(Math.random() * 20) + 10,
    },
    workouts: [],
    lastSyncTime: now.toISOString(),
  };
};

// Check connection status
export const getConnectionStatus = async (): Promise<ConnectionStatus> => {
  const appleHealthConnected = await AsyncStorage.getItem(STORAGE_KEYS.APPLE_HEALTH_CONNECTED);
  const googleFitConnected = await AsyncStorage.getItem(STORAGE_KEYS.GOOGLE_FIT_CONNECTED);
  const lastSync = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME);

  return {
    appleHealth: {
      available: Platform.OS === 'ios',
      connected: appleHealthConnected === 'true',
      lastSync: lastSync,
    },
    googleFit: {
      available: Platform.OS === 'android',
      connected: googleFitConnected === 'true',
      lastSync: lastSync,
    },
  };
};

// Initialize Apple Health (iOS only)
// Note: Using simulated data in Expo managed workflow
// Real Apple Health integration requires development build with react-native-health
export const initializeAppleHealth = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    console.log('Apple Health is only available on iOS');
    return false;
  }

  try {
    // In Expo managed workflow, we use simulated data
    // Real integration requires development build
    console.log('Apple Health: Using simulated data (Expo managed workflow)');
    await AsyncStorage.setItem(STORAGE_KEYS.APPLE_HEALTH_CONNECTED, 'true');
    return true;
  } catch (error) {
    console.log('Apple HealthKit not available:', error);
    return false;
  }
};

// Initialize Google Health Connect (Android only)
// Note: Using simulated data in Expo managed workflow
export const initializeGoogleHealthConnect = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    console.log('Google Health Connect is only available on Android');
    return false;
  }

  try {
    // In Expo managed workflow, we use simulated data
    console.log('Google Health Connect: Using simulated data (Expo managed workflow)');
    await AsyncStorage.setItem(STORAGE_KEYS.GOOGLE_FIT_CONNECTED, 'true');
    return true;
  } catch (error) {
    console.log('Google Health Connect not available:', error);
    return false;
  }
};

// Disconnect from health services
export const disconnectAppleHealth = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.APPLE_HEALTH_CONNECTED);
};

export const disconnectGoogleHealthConnect = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEYS.GOOGLE_FIT_CONNECTED);
};

// Fetch health data from Apple Health
const fetchAppleHealthData = async (): Promise<HealthData> => {
  // Using simulated data in Expo managed workflow
  return generateSimulatedData();
};

// Fetch health data from Google Health Connect
const fetchGoogleHealthConnectData = async (): Promise<HealthData> => {
  // Using simulated data in Expo managed workflow
  return generateSimulatedData();
};

// Main function to fetch health data from the appropriate source
export const fetchHealthData = async (): Promise<HealthData> => {
  try {
    const status = await getConnectionStatus();
    let healthData: HealthData = getEmptyHealthData();

    if (Platform.OS === 'ios' && status.appleHealth.connected) {
      healthData = await fetchAppleHealthData();
    } else if (Platform.OS === 'android' && status.googleFit.connected) {
      healthData = await fetchGoogleHealthConnectData();
    } else {
      // Return simulated data for demo
      healthData = generateSimulatedData();
    }

    // Cache the data
    await AsyncStorage.setItem(STORAGE_KEYS.CACHED_HEALTH_DATA, JSON.stringify(healthData));
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, new Date().toISOString());

    return healthData;
  } catch (error) {
    console.log('Error fetching health data:', error);
    
    // Try to return cached data
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_HEALTH_DATA);
    if (cached) {
      return JSON.parse(cached);
    }
    
    return getEmptyHealthData();
  }
};

// Get cached health data
export const getCachedHealthData = async (): Promise<HealthData | null> => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_HEALTH_DATA);
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  } catch (error) {
    console.log('Error getting cached health data:', error);
    return null;
  }
};

// Sync health data (refresh from source)
export const syncHealthData = async (): Promise<HealthData> => {
  return fetchHealthData();
};

// Check if health services are available
export const isHealthAvailable = (): boolean => {
  return Platform.OS === 'ios' || Platform.OS === 'android';
};

// Get platform-specific health service name
export const getHealthServiceName = (): string => {
  if (Platform.OS === 'ios') {
    return 'Apple Health';
  } else if (Platform.OS === 'android') {
    return 'Google Health Connect';
  }
  return 'Health Services';
};

// Check if running on native platform (iOS or Android)
export const isNativePlatform = (): boolean => {
  return Platform.OS === 'ios' || Platform.OS === 'android';
};

// Format duration in minutes to a readable string
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
};

// Format sleep time (minutes) to a readable format
export const formatSleepTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  }
  if (mins === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${mins} min`;
};

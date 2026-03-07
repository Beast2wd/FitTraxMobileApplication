import { useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// Storage keys
const HEALTH_CONNECT_KEY = '@fittrax_health_connect_status';
const HEALTH_PERMISSION_KEY = '@fittrax_healthkit_permission';

// Types for health data
export interface HealthKitSteps {
  value: number;
  startDate: string;
  endDate: string;
}

export interface HealthKitCalories {
  value: number;
  startDate: string;
  endDate: string;
}

export interface HealthKitWorkout {
  activityType: string;
  activityName: string;
  duration: number; // minutes
  calories: number;
  distance?: number;
  startDate: string;
  endDate: string;
}

export interface HealthKitHeartRate {
  value: number;
  startDate: string;
  endDate: string;
}

export interface DailyHealthData {
  steps: number;
  activeCalories: number;
  totalCalories: number;
  distance: number;
  workouts: HealthKitWorkout[];
  avgHeartRate?: number;
}

export interface HealthConnectionStatus {
  connected: boolean;
  method: 'apple_health' | 'manual' | 'skipped' | null;
  lastSync: string | null;
  permissionGranted: boolean;
}

// Check if we're running in an environment that supports HealthKit
const isHealthKitAvailable = (): boolean => {
  if (Platform.OS !== 'ios') return false;
  
  // In Expo Go, HealthKit is not available
  // This will only work in a custom dev client or production build
  try {
    const AppleHealthKit = require('react-native-health').default;
    return !!AppleHealthKit;
  } catch (e) {
    return false;
  }
};

// HealthKit permissions configuration
const getHealthKitPermissions = () => ({
  permissions: {
    read: [
      'StepCount',
      'ActiveEnergyBurned',
      'BasalEnergyBurned',
      'DistanceWalkingRunning',
      'Workout',
      'HeartRate',
      'SleepAnalysis',
    ],
    write: [
      'StepCount',
      'ActiveEnergyBurned',
      'Workout',
    ],
  },
});

export function useHealthKit(userId: string | null) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<HealthConnectionStatus>({
    connected: false,
    method: null,
    lastSync: null,
    permissionGranted: false,
  });
  const [todayData, setTodayData] = useState<DailyHealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize and check availability
  useEffect(() => {
    const checkAvailability = async () => {
      const available = isHealthKitAvailable();
      setIsAvailable(available);
      
      // Load stored connection status
      try {
        const stored = await AsyncStorage.getItem(HEALTH_CONNECT_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setConnectionStatus(prev => ({
            ...prev,
            connected: parsed.connected,
            method: parsed.method,
            lastSync: parsed.connectedAt || parsed.lastSync,
          }));
        }
        
        // Check if permission was previously granted
        const permissionStored = await AsyncStorage.getItem(HEALTH_PERMISSION_KEY);
        if (permissionStored === 'granted') {
          setConnectionStatus(prev => ({ ...prev, permissionGranted: true }));
        }
      } catch (e) {
        console.error('Error loading health status:', e);
      }
      
      setIsLoading(false);
    };
    
    checkAvailability();
  }, []);

  // Request HealthKit permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isAvailable) {
      // For non-HealthKit environments, show a message
      Alert.alert(
        'HealthKit Not Available',
        'HealthKit is only available on iOS devices with a custom build. The app will use estimated calculations instead.',
        [{ text: 'OK' }]
      );
      return false;
    }

    try {
      const AppleHealthKit = require('react-native-health').default;
      const permissions = getHealthKitPermissions();

      return new Promise((resolve) => {
        AppleHealthKit.initHealthKit(permissions, async (error: any, results: any) => {
          if (error) {
            console.error('HealthKit init error:', error);
            setError('Failed to initialize HealthKit');
            resolve(false);
            return;
          }

          // Permission granted
          setIsInitialized(true);
          setConnectionStatus(prev => ({
            ...prev,
            connected: true,
            method: 'apple_health',
            permissionGranted: true,
            lastSync: new Date().toISOString(),
          }));

          // Store permission status
          await AsyncStorage.setItem(HEALTH_PERMISSION_KEY, 'granted');
          await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
            connected: true,
            method: 'apple_health',
            connectedAt: new Date().toISOString(),
          }));

          resolve(true);
        });
      });
    } catch (e) {
      console.error('Error requesting HealthKit permission:', e);
      setError('HealthKit is not available in this build');
      return false;
    }
  }, [isAvailable]);

  // Get today's step count
  const getSteps = useCallback(async (date?: Date): Promise<number> => {
    if (!isAvailable || !isInitialized) return 0;

    try {
      const AppleHealthKit = require('react-native-health').default;
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      return new Promise((resolve) => {
        AppleHealthKit.getStepCount(
          {
            date: targetDate.toISOString(),
            includeManuallyAdded: true,
          },
          (err: any, results: { value: number }) => {
            if (err) {
              console.error('Error getting steps:', err);
              resolve(0);
              return;
            }
            resolve(results?.value || 0);
          }
        );
      });
    } catch (e) {
      console.error('Error fetching steps:', e);
      return 0;
    }
  }, [isAvailable, isInitialized]);

  // Get active calories burned
  const getActiveCalories = useCallback(async (date?: Date): Promise<number> => {
    if (!isAvailable || !isInitialized) return 0;

    try {
      const AppleHealthKit = require('react-native-health').default;
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      return new Promise((resolve) => {
        AppleHealthKit.getActiveEnergyBurned(
          {
            startDate: startOfDay.toISOString(),
            endDate: endOfDay.toISOString(),
          },
          (err: any, results: Array<{ value: number }>) => {
            if (err) {
              console.error('Error getting active calories:', err);
              resolve(0);
              return;
            }
            const total = results?.reduce((sum, r) => sum + (r.value || 0), 0) || 0;
            resolve(Math.round(total));
          }
        );
      });
    } catch (e) {
      console.error('Error fetching active calories:', e);
      return 0;
    }
  }, [isAvailable, isInitialized]);

  // Get basal (resting) calories
  const getBasalCalories = useCallback(async (date?: Date): Promise<number> => {
    if (!isAvailable || !isInitialized) return 0;

    try {
      const AppleHealthKit = require('react-native-health').default;
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      return new Promise((resolve) => {
        AppleHealthKit.getBasalEnergyBurned(
          {
            startDate: startOfDay.toISOString(),
            endDate: endOfDay.toISOString(),
          },
          (err: any, results: Array<{ value: number }>) => {
            if (err) {
              console.error('Error getting basal calories:', err);
              resolve(0);
              return;
            }
            const total = results?.reduce((sum, r) => sum + (r.value || 0), 0) || 0;
            resolve(Math.round(total));
          }
        );
      });
    } catch (e) {
      console.error('Error fetching basal calories:', e);
      return 0;
    }
  }, [isAvailable, isInitialized]);

  // Get walking/running distance
  const getDistance = useCallback(async (date?: Date): Promise<number> => {
    if (!isAvailable || !isInitialized) return 0;

    try {
      const AppleHealthKit = require('react-native-health').default;
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      return new Promise((resolve) => {
        AppleHealthKit.getDistanceWalkingRunning(
          {
            startDate: startOfDay.toISOString(),
            endDate: endOfDay.toISOString(),
            unit: 'mile',
          },
          (err: any, results: Array<{ value: number }>) => {
            if (err) {
              console.error('Error getting distance:', err);
              resolve(0);
              return;
            }
            const total = results?.reduce((sum, r) => sum + (r.value || 0), 0) || 0;
            resolve(Math.round(total * 100) / 100); // Round to 2 decimal places
          }
        );
      });
    } catch (e) {
      console.error('Error fetching distance:', e);
      return 0;
    }
  }, [isAvailable, isInitialized]);
    // Get workouts for a date range
  const getWorkouts = useCallback(async (startDate?: Date, endDate?: Date): Promise<HealthKitWorkout[]> => {
    if (!isAvailable || !isInitialized) return [];

    try {
      const AppleHealthKit = require('react-native-health').default;
      const start = startDate || new Date(new Date().setDate(new Date().getDate() - 7));
      const end = endDate || new Date();

      return new Promise((resolve) => {
        AppleHealthKit.getSamples(
          {
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            type: 'Workout',
          },
          (err: any, results: any[]) => {
            if (err) {
              console.error('Error getting workouts:', err);
              resolve([]);
              return;
            }

            const workouts: HealthKitWorkout[] = (results || []).map((w: any) => ({
              activityType: w.activityName || 'Unknown',
              activityName: w.activityName || 'Workout',
              duration: Math.round((w.duration || 0) / 60), // Convert seconds to minutes
              calories: Math.round(w.calories || 0),
              distance: w.distance ? Math.round(w.distance * 100) / 100 : undefined,
              startDate: w.start,
              endDate: w.end,
            }));

            resolve(workouts);
          }
        );
      });
    } catch (e) {
      console.error('Error fetching workouts:', e);
      return [];
    }
  }, [isAvailable, isInitialized]);

  // Get heart rate samples
  const getHeartRate = useCallback(async (date?: Date): Promise<number> => {
    if (!isAvailable || !isInitialized) return 0;

    try {
      const AppleHealthKit = require('react-native-health').default;
      const targetDate = date || new Date();
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      return new Promise((resolve) => {
        AppleHealthKit.getHeartRateSamples(
          {
            startDate: startOfDay.toISOString(),
            endDate: endOfDay.toISOString(),
            ascending: false,
            limit: 100,
          },
          (err: any, results: Array<{ value: number }>) => {
            if (err || !results || results.length === 0) {
              resolve(0);
              return;
            }
            const avg = results.reduce((sum, r) => sum + r.value, 0) / results.length;
            resolve(Math.round(avg));
          }
        );
      });
    } catch (e) {
      console.error('Error fetching heart rate:', e);
      return 0;
    }
  }, [isAvailable, isInitialized]);

  // Save a workout to HealthKit
  const saveWorkout = useCallback(async (workout: {
    type: string;
    startDate: Date;
    endDate: Date;
    calories: number;
    distance?: number;
  }): Promise<boolean> => {
    if (!isAvailable || !isInitialized) return false;

    try {
      const AppleHealthKit = require('react-native-health').default;

      return new Promise((resolve) => {
        AppleHealthKit.saveWorkout(
          {
            type: workout.type,
            startDate: workout.startDate.toISOString(),
            endDate: workout.endDate.toISOString(),
            energyBurned: workout.calories,
            energyBurnedUnit: 'calorie',
            distance: workout.distance,
            distanceUnit: 'mile',
          },
          (err: any, results: any) => {
            if (err) {
              console.error('Error saving workout:', err);
              resolve(false);
              return;
            }
            resolve(true);
          }
        );
      });
    } catch (e) {
      console.error('Error saving workout to HealthKit:', e);
      return false;
    }
  }, [isAvailable, isInitialized]);

  // Fetch all daily data and sync to backend
  const syncHealthData = useCallback(async (): Promise<DailyHealthData | null> => {
    if (!userId) return null;

    try {
      setIsLoading(true);
      
      let data: DailyHealthData;

      if (isAvailable && isInitialized) {
        // Fetch real data from HealthKit
        const [steps, activeCalories, basalCalories, distance, workouts, avgHeartRate] = await Promise.all([
          getSteps(),
          getActiveCalories(),
          getBasalCalories(),
          getDistance(),
          getWorkouts(new Date(new Date().setHours(0, 0, 0, 0)), new Date()),
          getHeartRate(),
        ]);

        data = {
          steps,
          activeCalories,
          totalCalories: activeCalories + basalCalories,
          distance,
          workouts,
          avgHeartRate: avgHeartRate > 0 ? avgHeartRate : undefined,
        };
      } else {
        // Return empty/estimated data
        data = {
          steps: 0,
          activeCalories: 0,
          totalCalories: 0,
          distance: 0,
          workouts: [],
        };
      }

      setTodayData(data);

      // Sync to backend
      try {
        await axios.post(`${API_URL}/api/health/sync`, {
          user_id: userId,
          steps: data.steps,
          distance: data.distance,
          activeCalories: data.activeCalories,
          totalCalories: data.totalCalories,
          heartRate: data.avgHeartRate ? {
            current: data.avgHeartRate,
            min: data.avgHeartRate,
            max: data.avgHeartRate,
            avg: data.avgHeartRate,
          } : null,
          sleep: null,
          workouts: data.workouts.map(w => ({
            type: w.activityType,
            duration: w.duration,
            calories: w.calories,
            distance: w.distance,
            startTime: w.startDate,
            endTime: w.endDate,
          })),
          lastSyncTime: new Date().toISOString(),
        });

        // Update connection status
        setConnectionStatus(prev => ({
          ...prev,
          lastSync: new Date().toISOString(),
        }));

        await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
          connected: true,
          method: isAvailable ? 'apple_health' : 'manual',
          lastSync: new Date().toISOString(),
        }));
      } catch (syncError) {
        console.error('Error syncing to backend:', syncError);
      }

      return data;
    } catch (e) {
      console.error('Error syncing health data:', e);
      setError('Failed to sync health data');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, isAvailable, isInitialized, getSteps, getActiveCalories, getBasalCalories, getDistance, getWorkouts, getHeartRate]);

  // Disconnect from HealthKit
  const disconnect = useCallback(async () => {
    setConnectionStatus({
      connected: false,
      method: null,
      lastSync: null,
      permissionGranted: false,
    });
    setIsInitialized(false);
    setTodayData(null);

    await AsyncStorage.removeItem(HEALTH_CONNECT_KEY);
    await AsyncStorage.removeItem(HEALTH_PERMISSION_KEY);
  }, []);

  // Set manual tracking mode
  const setManualMode = useCallback(async () => {
    setConnectionStatus({
      connected: true,
      method: 'manual',
      lastSync: new Date().toISOString(),
      permissionGranted: false,
    });

    await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
      connected: true,
      method: 'manual',
      connectedAt: new Date().toISOString(),
    }));
  }, []);

  return {
    // State
    isAvailable,
    isInitialized,
    isLoading,
    connectionStatus,
    todayData,
    error,
    
    // Actions
    requestPermission,
    getSteps,
    getActiveCalories,
    getBasalCalories,
    getDistance,
    getWorkouts,
    getHeartRate,
    saveWorkout,
    syncHealthData,
    disconnect,
    setManualMode,
  };
}

export default useHealthKit;
  

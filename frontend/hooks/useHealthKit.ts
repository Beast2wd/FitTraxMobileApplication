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
  duration: number;
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

export function useHealthKit(userId: string | null) {
  const [isAvailable] = useState(false);
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

  // Request HealthKit permission - Shows coming soon message
  const requestPermission = useCallback(async (): Promise<boolean> => {
    Alert.alert(
      'Coming Soon',
      'Apple HealthKit integration will be available in a future update. For now, you can use manual tracking to log your workouts and calories.',
      [{ text: 'OK' }]
    );
    return false;
  }, []);

  // Get today's step count - Returns 0 (HealthKit not available)
  const getSteps = useCallback(async (date?: Date): Promise<number> => {
    return 0;
  }, []);

  // Get active calories burned - Returns 0
  const getActiveCalories = useCallback(async (date?: Date): Promise<number> => {
    return 0;
  }, []);

  // Get basal calories - Returns 0
  const getBasalCalories = useCallback(async (date?: Date): Promise<number> => {
    return 0;
  }, []);

  // Get distance - Returns 0
  const getDistance = useCallback(async (date?: Date): Promise<number> => {
    return 0;
  }, []);

  // Get workouts - Returns empty array
  const getWorkouts = useCallback(async (startDate?: Date, endDate?: Date): Promise<HealthKitWorkout[]> => {
    return [];
  }, []);

  // Get heart rate - Returns 0
  const getHeartRate = useCallback(async (date?: Date): Promise<number> => {
    return 0;
  }, []);

  // Save workout - Returns false (not available)
  const saveWorkout = useCallback(async (workout: {
    type: string;
    startDate: Date;
    endDate: Date;
    calories: number;
    distance?: number;
  }): Promise<boolean> => {
    return false;
  }, []);

  // Sync health data
  const syncHealthData = useCallback(async (): Promise<DailyHealthData | null> => {
    if (!userId) return null;

    try {
      setIsLoading(true);
      
      const data: DailyHealthData = {
        steps: 0,
        activeCalories: 0,
        totalCalories: 0,
        distance: 0,
        workouts: [],
      };

      setTodayData(data);

      // Sync to backend
      try {
        await axios.post(`${API_URL}/api/health/sync`, {
          user_id: userId,
          steps: data.steps,
          distance: data.distance,
          activeCalories: data.activeCalories,
          totalCalories: data.totalCalories,
          heartRate: null,
          sleep: null,
          workouts: [],
          lastSyncTime: new Date().toISOString(),
        });

        setConnectionStatus(prev => ({
          ...prev,
          lastSync: new Date().toISOString(),
        }));

        await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
          connected: connectionStatus.connected,
          method: connectionStatus.method,
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
  }, [userId, connectionStatus.connected, connectionStatus.method]);

  // Disconnect
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

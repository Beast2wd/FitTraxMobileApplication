import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import { useRunStore } from '../stores/runStore';
import axios from 'axios';
import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function RunningScreen() {
  const { userId } = useUserStore();
  const { 
    isRunning: isSharedRunning,
    runTime: sharedRunTime,
    distance: sharedDistance,
    routeCoords: sharedRouteCoords,
    startRun: startSharedRun,
    stopRun: stopSharedRun,
    updateRunTime: updateSharedRunTime,
    updateDistance: updateSharedDistance,
    addRouteCoord: addSharedRouteCoord,
    resetRun: resetSharedRun
  } = useRunStore();

  // Use shared state if a run is in progress from dashboard, otherwise use local state
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [distance, setDistance] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentPace, setCurrentPace] = useState(0);
  const [calories, setCalories] = useState(0);
  const [routeCoords, setRouteCoords] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [showRunDetail, setShowRunDetail] = useState(false);
  const [dailyProgress, setDailyProgress] = useState<any>(null);
  const [dailyGoal, setDailyGoal] = useState(3); // Default 3 miles daily goal
  
  const locationSubscription = useRef<any>(null);
  const timerInterval = useRef<any>(null);
  const lastLocation = useRef<any>(null);

  // Sync shared run state to local state when coming from dashboard
  useEffect(() => {
    if (isSharedRunning) {
      setIsTracking(true);
      setDistance(sharedDistance);
      setDuration(sharedRunTime);
      setRouteCoords(sharedRouteCoords);
      setCalories(sharedDistance * 100); // Approximate calories
    }
  }, [isSharedRunning, sharedDistance, sharedRunTime, sharedRouteCoords]);

  useEffect(() => {
    if (userId) {
      loadRuns();
      loadStats();
      getCurrentLocation();
      loadDailyProgress();
    }
    requestLocationPermissions();
    
    return () => {
      stopTracking();
    };
  }, [userId]);

  const loadDailyProgress = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await axios.get(`${API_URL}/api/runs/${userId}?days=1`);
      const todayRuns = (response.data.runs || []).filter((run: any) => 
        run.timestamp && run.timestamp.startsWith(today)
      );
      
      const totalDistance = todayRuns.reduce((sum: number, run: any) => sum + (run.distance || 0), 0);
      const totalDuration = todayRuns.reduce((sum: number, run: any) => sum + (run.duration || 0), 0);
      const totalCalories = todayRuns.reduce((sum: number, run: any) => sum + (run.calories_burned || 0), 0);
      
      setDailyProgress({
        runs: todayRuns.length,
        distance: totalDistance,
        duration: totalDuration,
        calories: totalCalories,
        date: today
      });
    } catch (error) {
      console.error('Error loading daily progress:', error);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCurrentLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const requestLocationPermissions = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Location permission is required to track runs');
    }
  };

  const loadRuns = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/runs/${userId}?days=30`);
      setRuns(response.data.runs || []);
    } catch (error) {
      console.error('Error loading runs:', error);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/runs/stats/${userId}`);
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3959; // Earth's radius in miles (was 6371 for km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Returns distance in miles
  };

  const calculateCalories = (distanceMiles: number, durationSeconds: number) => {
    return distanceMiles * 100; // ~100 calories per mile
  };

  const startTracking = async () => {
    try {
      setIsTracking(true);
      setIsPaused(false);
      setDistance(0);
      setDuration(0);
      setCalories(0);
      setRouteCoords([]);
      lastLocation.current = null;

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 10,
        },
        (location) => {
          if (!isPaused) {
            const { latitude, longitude } = location.coords;
            setRouteCoords((prev) => [...prev, { latitude, longitude }]);

            if (lastLocation.current) {
              const dist = calculateDistance(
                lastLocation.current.latitude,
                lastLocation.current.longitude,
                latitude,
                longitude
              );
              setDistance((prev) => prev + dist);
            }

            lastLocation.current = { latitude, longitude };
          }
        }
      );

      timerInterval.current = setInterval(() => {
        if (!isPaused) {
          setDuration((prev) => prev + 1);
        }
      }, 1000);
    } catch (error) {
      Alert.alert('Error', 'Failed to start tracking');
      setIsTracking(false);
    }
  };

  const pauseTracking = () => {
    setIsPaused(!isPaused);
  };

  const stopTracking = async () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove();
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
    }

    if (isTracking && distance > 0) {
      await saveRun();
    }

    setIsTracking(false);
    setIsPaused(false);
  };

  const saveRun = async () => {
    try {
      setLoading(true);
      const avgPace = duration > 0 ? (duration / 60) / distance : 0;
      const caloriesBurned = calculateCalories(distance, duration);

      const runData = {
        run_id: `run_${Date.now()}`,
        user_id: userId!,
        distance: parseFloat(distance.toFixed(2)),
        duration,
        average_pace: parseFloat(avgPace.toFixed(2)),
        calories_burned: parseFloat(caloriesBurned.toFixed(1)),
        route_data: routeCoords,
        notes: '',
        timestamp: new Date().toISOString(),
      };

      await axios.post(`${API_URL}/api/runs`, runData);
      Alert.alert('Success', 'Run saved successfully!');
      
      setDistance(0);
      setDuration(0);
      setCalories(0);
      setRouteCoords([]);
      
      loadRuns();
      loadStats();
      loadDailyProgress();
    } catch (error) {
      Alert.alert('Error', 'Failed to save run');
    } finally {
      setLoading(false);
    }
  };

  const deleteRun = async (runId: string) => {
    Alert.alert(
      'Delete Run',
      'Are you sure you want to delete this run?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/runs/${runId}`);
              loadRuns();
              loadStats();
              setShowRunDetail(false);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete run');
            }
          },
        },
      ]
    );
  };

  const viewRunDetail = (run: any) => {
    setSelectedRun(run);
    setShowRunDetail(true);
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return hrs > 0
      ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (pace: number) => {
    const mins = Math.floor(pace);
    const secs = Math.round((pace - mins) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (duration > 0 && distance > 0) {
      const pace = (duration / 60) / distance;
      setCurrentPace(pace);
      setCalories(calculateCalories(distance, duration));
    }
  }, [duration, distance]);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={28} color={Colors.brand.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Running Tracker</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Daily Run Progress Section */}
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800' }}
          style={styles.dailyProgressBg}
          imageStyle={styles.dailyProgressBgImage}
          resizeMode="cover"
        >
          <View style={styles.dailyProgressOverlay}>
            <View style={styles.dailyProgressHeader}>
              <Text style={styles.dailyProgressTitleWhite}>Today's Progress</Text>
              <Text style={styles.dailyProgressDateWhite}>
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </Text>
            </View>
            
            {/* Progress Bar */}
            <View style={styles.goalProgressContainer}>
              <View style={[styles.goalProgressBar, { backgroundColor: 'rgba(255,255,255,0.3)' }]}>
                <LinearGradient
                  colors={['#EC4899', '#F472B6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.goalProgressFill,
                    { width: `${Math.min(100, ((dailyProgress?.distance || 0) / dailyGoal) * 100)}%` }
                  ]}
                />
              </View>
              <View style={styles.goalProgressLabels}>
                <Text style={styles.goalProgressCurrentWhite}>
                  {(dailyProgress?.distance || 0).toFixed(2)} mi
                </Text>
                <Text style={styles.goalProgressTargetWhite}>Goal: {dailyGoal} mi</Text>
              </View>
            </View>

            {/* Daily Stats Grid */}
            <View style={styles.dailyStatsGrid}>
              <View style={[styles.dailyStatCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.dailyStatIcon, { backgroundColor: 'rgba(236,72,153,0.3)' }]}>
                  <Ionicons name="footsteps" size={20} color="#fff" />
                </View>
                <Text style={styles.dailyStatValueWhite}>{dailyProgress?.runs || 0}</Text>
                <Text style={styles.dailyStatLabelWhite}>Runs</Text>
              </View>
              
              <View style={[styles.dailyStatCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.dailyStatIcon, { backgroundColor: 'rgba(59,130,246,0.3)' }]}>
                  <Ionicons name="navigate" size={20} color="#fff" />
                </View>
                <Text style={styles.dailyStatValueWhite}>{(dailyProgress?.distance || 0).toFixed(1)}</Text>
                <Text style={styles.dailyStatLabelWhite}>mi</Text>
              </View>
              
              <View style={[styles.dailyStatCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.dailyStatIcon, { backgroundColor: 'rgba(16,185,129,0.3)' }]}>
                  <Ionicons name="time" size={20} color="#fff" />
                </View>
                <Text style={styles.dailyStatValueWhite}>{formatTime(dailyProgress?.duration || 0)}</Text>
                <Text style={styles.dailyStatLabelWhite}>Time</Text>
              </View>
              
              <View style={[styles.dailyStatCard, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <View style={[styles.dailyStatIcon, { backgroundColor: 'rgba(245,158,11,0.3)' }]}>
                  <Ionicons name="flame" size={20} color="#fff" />
                </View>
                <Text style={styles.dailyStatValueWhite}>{Math.round(dailyProgress?.calories || 0)}</Text>
                <Text style={styles.dailyStatLabelWhite}>cal</Text>
              </View>
            </View>

            {/* Motivational Message */}
            {dailyProgress?.distance >= dailyGoal ? (
              <View style={[styles.goalAchieved, { backgroundColor: 'rgba(245,158,11,0.2)' }]}>
                <Ionicons name="trophy" size={24} color="#F59E0B" />
                <Text style={[styles.goalAchievedText, { color: '#fff' }]}>Daily goal achieved! 🎉</Text>
              </View>
            ) : dailyProgress?.distance > 0 ? (
              <View style={[styles.goalRemaining, { backgroundColor: 'rgba(16,185,129,0.2)' }]}>
                <Ionicons name="trending-up" size={20} color="#10B981" />
                <Text style={[styles.goalRemainingText, { color: '#fff' }]}>
                  {(dailyGoal - (dailyProgress?.distance || 0)).toFixed(2)} mi to reach your goal
                </Text>
              </View>
            ) : null}
          </View>
        </ImageBackground>

        {/* GPS Tracking Status */}
        {isTracking && routeCoords.length > 0 && (
          <View style={styles.mapPlaceholder}>
            <Ionicons name="navigate" size={48} color={Colors.brand.primary} />
            <Text style={styles.mapPlaceholderTitle}>GPS Tracking Active</Text>
            <Text style={styles.mapPlaceholderText}>
              {routeCoords.length} location points recorded
            </Text>
            <Text style={styles.mapPlaceholderSubtext}>
              Map visualization available on mobile app
            </Text>
          </View>
        )}

        {/* Active Tracking Card */}
        {!isTracking ? (
          <View style={styles.startCard}>
            <Ionicons name="navigate" size={64} color={Colors.brand.primary} />
            <Text style={styles.startTitle}>Start Your Run</Text>
            <Text style={styles.startSubtitle}>
              Track distance, pace, and calories burned with GPS
            </Text>
            <TouchableOpacity style={styles.startButton} onPress={startTracking}>
              <Ionicons name="play" size={24} color="#fff" />
              <Text style={styles.startButtonText}>Start Running</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.trackingCard}
          >
            <View style={styles.trackingHeader}>
              <View style={[styles.statusDot, isPaused && styles.statusDotPaused]} />
              <Text style={styles.trackingStatus}>
                {isPaused ? 'Paused' : 'Tracking...'}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{distance.toFixed(2)}</Text>
                <Text style={styles.statLabel}>mi</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatTime(duration)}</Text>
                <Text style={styles.statLabel}>time</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {currentPace > 0 ? formatPace(currentPace) : '--:--'}
                </Text>
                <Text style={styles.statLabel}>min/mi</Text>
              </View>
            </View>

            <View style={styles.caloriesRow}>
              <Ionicons name="flame" size={20} color="#fff" />
              <Text style={styles.caloriesText}>{Math.round(calories)} calories</Text>
            </View>

            <View style={styles.controlButtons}>
              <TouchableOpacity
                style={[styles.controlButton, styles.pauseButton]}
                onPress={pauseTracking}
              >
                <Ionicons name={isPaused ? 'play' : 'pause'} size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlButton, styles.stopButton]}
                onPress={stopTracking}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="stop" size={28} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        )}

        {/* Weekly & Monthly Stats */}
        {stats && (
          <View style={styles.statsSection}>
            <Text style={styles.sectionTitle}>Your Progress</Text>
            
            <View style={styles.statsCards}>
              <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
                <View style={[styles.statIcon, { backgroundColor: '#3B82F6' }]}>
                  <Ionicons name="calendar" size={24} color="#fff" />
                </View>
                <Text style={styles.statCardLabel}>This Week</Text>
                <Text style={[styles.statCardValue, { color: '#3B82F6' }]}>
                  {stats.weekly?.total_distance || 0} mi
                </Text>
                <Text style={styles.statCardDetail}>
                  {stats.weekly?.run_count || 0} runs • {Math.round(stats.weekly?.total_calories || 0)} cal
                </Text>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}>
                <View style={[styles.statIcon, { backgroundColor: '#10B981' }]}>
                  <MaterialIcons name="date-range" size={24} color="#fff" />
                </View>
                <Text style={styles.statCardLabel}>This Month</Text>
                <Text style={[styles.statCardValue, { color: '#10B981' }]}>
                  {stats.monthly?.total_distance || 0} mi
                </Text>
                <Text style={styles.statCardDetail}>
                  {stats.monthly?.run_count || 0} runs • {Math.round(stats.monthly?.total_calories || 0)} cal
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Recent Runs */}
        {runs.length > 0 && (
          <View style={styles.runsSection}>
            <Text style={styles.sectionTitle}>Recent Runs</Text>
            {runs.slice(0, 10).map((run) => (
              <TouchableOpacity 
                key={run.run_id} 
                style={styles.runCard}
                onPress={() => viewRunDetail(run)}
              >
                <View style={styles.runLeft}>
                  <Ionicons name="footsteps" size={32} color={Colors.brand.primary} />
                  <View style={styles.runInfo}>
                    <Text style={styles.runDistance}>{run.distance} mi</Text>
                    <Text style={styles.runDetails}>
                      {formatTime(run.duration)} • {formatPace(run.average_pace)}/mi
                    </Text>
                    <Text style={styles.runDate}>
                      {format(new Date(run.timestamp), 'MMM d, yyyy • h:mm a')}
                    </Text>
                  </View>
                </View>
                <View style={styles.runRight}>
                  <Text style={styles.runCalories}>{Math.round(run.calories_burned)} cal</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.text.muted} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Run Detail Modal */}
      <Modal
        visible={showRunDetail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRunDetail(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowRunDetail(false)}>
              <Ionicons name="close" size={28} color={Colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Run Details</Text>
            <TouchableOpacity onPress={() => selectedRun && deleteRun(selectedRun.run_id)}>
              <Ionicons name="trash-outline" size={24} color={Colors.status.error} />
            </TouchableOpacity>
          </View>

          {selectedRun && (
            <ScrollView style={styles.modalContent}>
              {/* Route info placeholder */}
              {selectedRun.route_data && selectedRun.route_data.length > 1 && (
                <View style={styles.detailMapPlaceholder}>
                  <Ionicons name="map-outline" size={64} color={Colors.text.muted} />
                  <Text style={styles.mapPlaceholderTitle}>Route Map</Text>
                  <Text style={styles.mapPlaceholderText}>
                    {selectedRun.route_data.length} GPS points recorded
                  </Text>
                  <Text style={styles.mapPlaceholderSubtext}>
                    Full map visualization available on mobile
                  </Text>
                </View>
              )}

              {/* Run Statistics */}
              <View style={styles.detailCard}>
                <Text style={styles.detailTitle}>Run Summary</Text>
                <Text style={styles.detailDate}>
                  {format(new Date(selectedRun.timestamp), 'EEEE, MMMM d, yyyy • h:mm a')}
                </Text>

                <View style={styles.detailStatsGrid}>
                  <View style={styles.detailStatItem}>
                    <Ionicons name="navigate" size={32} color={Colors.brand.primary} />
                    <Text style={styles.detailStatValue}>{selectedRun.distance}</Text>
                    <Text style={styles.detailStatLabel}>Miles</Text>
                  </View>

                  <View style={styles.detailStatItem}>
                    <Ionicons name="time" size={32} color={Colors.status.success} />
                    <Text style={styles.detailStatValue}>{formatTime(selectedRun.duration)}</Text>
                    <Text style={styles.detailStatLabel}>Duration</Text>
                  </View>

                  <View style={styles.detailStatItem}>
                    <Ionicons name="speedometer" size={32} color={Colors.status.warning} />
                    <Text style={styles.detailStatValue}>
                      {formatPace(selectedRun.average_pace)}
                    </Text>
                    <Text style={styles.detailStatLabel}>Pace (min/mi)</Text>
                  </View>

                  <View style={styles.detailStatItem}>
                    <Ionicons name="flame" size={32} color={Colors.status.error} />
                    <Text style={styles.detailStatValue}>
                      {Math.round(selectedRun.calories_burned)}
                    </Text>
                    <Text style={styles.detailStatLabel}>Calories</Text>
                  </View>
                </View>

                {/* Additional Info */}
                <View style={styles.detailInfoCard}>
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>Average Speed</Text>
                    <Text style={styles.detailInfoValue}>
                      {(selectedRun.distance / (selectedRun.duration / 3600)).toFixed(2)} mph
                    </Text>
                  </View>
                  <View style={styles.detailInfoRow}>
                    <Text style={styles.detailInfoLabel}>GPS Points</Text>
                    <Text style={styles.detailInfoValue}>
                      {selectedRun.route_data?.length || 0} points
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 20,
  },
  
  // Daily Progress Section Styles
  dailyProgressSection: {
    backgroundColor: Colors.background.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  dailyProgressBg: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 24,
  },
  dailyProgressBgImage: {
    borderRadius: 20,
  },
  dailyProgressOverlay: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  dailyProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dailyProgressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  dailyProgressTitleWhite: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dailyProgressDate: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  dailyProgressDateWhite: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  goalProgressContainer: {
    marginBottom: 20,
  },
  goalProgressBar: {
    height: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  goalProgressFill: {
    height: '100%',
    borderRadius: 6,
    minWidth: 12,
  },
  goalProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalProgressCurrent: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EC4899',
  },
  goalProgressCurrentWhite: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  goalProgressTarget: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  goalProgressTargetWhite: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  dailyStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  dailyStatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 2,
  },
  dailyStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  dailyStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  dailyStatLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  dailyStatValueWhite: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dailyStatLabelWhite: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  goalAchieved: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  goalAchievedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D97706',
  },
  goalRemaining: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  goalRemainingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
  },
  
  startCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  startTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  startSubtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  trackingCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  trackingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  statusDotPaused: {
    backgroundColor: '#FCA5A5',
  },
  trackingStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  caloriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  caloriesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  controlButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stopButton: {
    backgroundColor: '#EF4444',
  },
  statsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  statsCards: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statCardLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  statCardValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statCardDetail: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  runsSection: {
    marginBottom: 24,
  },
  runCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  runLeft: {
    flexDirection: 'row',
    flex: 1,
  },
  runInfo: {
    marginLeft: 12,
    flex: 1,
  },
  runDistance: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  runDetails: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  runDate: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 4,
  },
  runRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  runCalories: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  mapPlaceholder: {
    height: 200,
    borderRadius: 16,
    backgroundColor: Colors.background.card,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  mapPlaceholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  mapPlaceholderSubtext: {
    fontSize: 12,
    color: Colors.text.muted,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background.light,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  modalContent: {
    flex: 1,
  },
  detailMapPlaceholder: {
    height: 200,
    margin: 16,
    borderRadius: 16,
    backgroundColor: Colors.background.card,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  detailCard: {
    margin: 16,
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  detailTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  detailDate: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 24,
  },
  detailStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 20,
  },
  detailStatItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.background.light,
    borderRadius: 12,
  },
  detailStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 8,
  },
  detailStatLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  detailInfoCard: {
    backgroundColor: Colors.background.light,
    borderRadius: 12,
    padding: 16,
  },
  detailInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  detailInfoLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  detailInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
});

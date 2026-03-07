import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  Modal,
  Image,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUserStore } from '../../stores/userStore';
import { useThemeStore } from '../../stores/themeStore';
import { useRunStore } from '../../stores/runStore';
import { dashboardAPI, waterAPI } from '../../services/api';
import { router, useFocusEffect } from 'expo-router';
import FitTraxLogo from '../../components/FitTraxLogo';
import { LinearGradient } from 'expo-linear-gradient';
import { AchievementModal } from '../../components/AchievementModal';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import i18next from 'i18next';
import { AccentColors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width } = Dimensions.get('window');

const STAT_CARD_IMAGES = {
  meals: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
  training: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80',
  hydration: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&q=80',
  heartRate: 'https://customer-assets.emergentagent.com/job_fitness-journey-294/artifacts/88l42rrl_Heart%20Rate.PNG',
};

const QUICK_ACTION_IMAGES = {
  aiCoach: 'https://customer-assets.emergentagent.com/job_fitness-journey-294/artifacts/gyrwpd2a_Workout%20Coach.png',
  scanFood: 'https://customer-assets.emergentagent.com/job_fitness-journey-294/artifacts/st3byqjm_Scan%20Food.PNG',
  schedule: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=200&q=80',
  workoutLog: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=200&q=80',
  run: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=200&q=80',
  steps: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=200&q=80',
  bodyScan: 'https://customer-assets.emergentagent.com/job_fitness-journey-294/artifacts/72x53yl1_Body%20Scan.PNG',
  peptides: 'https://customer-assets.emergentagent.com/job_fitness-journey-294/artifacts/r1mqcelc_peptide%20vial.jpg',
  rewards: 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=200&q=80',
  analytics: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=200&q=80',
};

export default function DashboardScreen() {
  const { userId, profile, lastMealLoggedAt, triggerMealRefresh, membershipStatus, setMembershipStatus } = useUserStore();
  const { theme, accent: accentKey } = useThemeStore();
  const { 
    isRunning, 
    runTime, 
    distance: runDistance, 
    routeCoords: runCoordinates,
    startRun: startRunStore,
    stopRun: stopRunStore,
    updateRunTime,
    updateDistance: updateRunDistance,
    addRouteCoord,
    resetRun
  } = useRunStore();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [streakData, setStreakData] = useState<any>(null);
  const [achievementModal, setAchievementModal] = useState<any>({ visible: false, achievement: null });
  const [pendingAchievements, setPendingAchievements] = useState<any[]>([]);
  const [hasGreeted, setHasGreeted] = useState(false);
  const appState = useRef(AppState.currentState);
  
  const isPremium = membershipStatus?.is_premium || false;

  const runningButtonGradient = AccentColors[accentKey]?.gradient || ['#EC4899', '#BE185D'];
  const runningButtonPrimary = AccentColors[accentKey]?.primary || '#EC4899';
  
  const isEnglish = i18next.language?.startsWith('en') || i18next.language === 'en';
  const [lastPosition, setLastPosition] = useState<any>(null);
  const locationSubscription = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const runStartTime = useRef<Date | null>(null);

  const colors = theme.colors;
  const accent = theme.accentColors;

  const playVoiceGreeting = async () => {
    try {
      const voiceEnabled = await AsyncStorage.getItem('voiceGreetingEnabled');
      if (voiceEnabled === 'false') return;

      const customRecordingUri = await AsyncStorage.getItem('customVoiceRecordingUri');
      
      if (customRecordingUri) {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
          });
          
          const { sound } = await Audio.Sound.createAsync({ uri: customRecordingUri });
          await sound.playAsync();
        } catch (audioError) {
          console.log('Error playing custom recording:', audioError);
        }
      }

    } catch (error) {
      console.log('Voice greeting error:', error);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        playVoiceGreeting();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [profile]);

  useEffect(() => {
    if (profile && !hasGreeted) {
      setHasGreeted(true);
      setTimeout(() => playVoiceGreeting(), 1500);
    }
  }, [profile, hasGreeted]);

  const loadDashboard = async () => {
    try {
      if (!userId) return;
      const data = await dashboardAPI.getDashboard(userId);
      setDashboardData(data);
      await syncGamification();
      await loadMembershipStatus();
    } catch (error: any) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadMembershipStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await axios.get(`${API_URL}/api/membership/status/${userId}`, { timeout: 5000 });
      setMembershipStatus(response.data);
    } catch (error) {
      console.log('Offline: Using default membership status');
    }
  }, [userId, setMembershipStatus]);

  const syncGamification = useCallback(async () => {
    if (!userId) return;
    try {
      const streakResponse = await axios.get(`${API_URL}/api/gamification/streak/${userId}`, { timeout: 5000 });
      setStreakData(streakResponse.data);
      
      const syncResponse = await axios.post(`${API_URL}/api/gamification/sync-progress/${userId}`, {}, { timeout: 5000 });
      if (syncResponse.data.new_badges && syncResponse.data.new_badges.length > 0) {
        const newAchievements = syncResponse.data.new_badges.map((badge: any) => ({
          type: 'badge',
          name: badge.name,
          description: badge.description,
          icon: badge.icon,
          points: badge.points,
        }));
        setPendingAchievements(prev => [...prev, ...newAchievements]);
      }
    } catch (error) {
      console.log('Offline: Gamification sync skipped');
    }
  }, [userId]);

  const clearTodaysMeals = useCallback(async () => {
    if (!userId) return;
    
    Alert.alert(
      'Clear Today\'s Meals',
      'Are you sure you want to delete all meals logged today? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const now = new Date();
              const year = now.getFullYear();
              const month = String(now.getMonth() + 1).padStart(2, '0');
              const day = String(now.getDate()).padStart(2, '0');
              const localDate = `${year}-${month}-${day}`;
              
              await axios.delete(`${API_URL}/api/meals/clear-day/${userId}?date=${localDate}`);
              Alert.alert('Success', 'All of today\'s meals have been cleared.');
              loadDashboard();
              triggerMealRefresh();
            } catch (error) {
              console.error('Error clearing meals:', error);
              Alert.alert('Error', 'Failed to clear meals. Please try again.');
            }
          },
        },
      ]
    );
  }, [userId, triggerMealRefresh]);

  useEffect(() => {
    if (pendingAchievements.length > 0 && !achievementModal.visible) {
      const nextAchievement = pendingAchievements[0];
      setAchievementModal({ visible: true, achievement: nextAchievement });
      setPendingAchievements(prev => prev.slice(1));
    }
  }, [pendingAchievements, achievementModal.visible]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t('dashboard.goodMorning');
    if (hour < 17) return t('dashboard.goodAfternoon');
    return t('dashboard.goodEvening');
  };

  const getMotivationalMessage = () => {
    if (streakData?.current_streak >= 7) {
      return `${streakData.current_streak} ${t('dashboard.dayStreak')}! 🔥`;
    } else if (streakData?.current_streak >= 3) {
      return `${streakData.current_streak} ${t('dashboard.dayStreak')}! 💪`;
    }
    const messages = [t('dashboard.keepItGoing'), t('dashboard.dontBreakChain')];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  useEffect(() => {
    if (userId) {
      loadDashboard();
    } else {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (lastMealLoggedAt && userId) {
      console.log('Meal logged, refreshing dashboard...');
      loadDashboard();
    }
  }, [lastMealLoggedAt]);

  useFocusEffect(
    useCallback(() => {
      if (userId && !loading) {
        loadDashboard();
      }
    }, [userId, loading])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  const addWater = async (amount: number) => {
    try {
      await waterAPI.addWater({
        water_id: `water_${Date.now()}`,
                user_id: userId!,
        amount,
        timestamp: new Date().toISOString(),
      });
      loadDashboard();
    } catch (error) {
      Alert.alert('Error', 'Failed to add water');
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const calculatePace = (): { value: string; unit: string } => {
    if (runDistance <= 0 || runTime <= 0) {
      return { value: '0.0', unit: isEnglish ? 'min/mi' : 'min/km' };
    }
    
    if (isEnglish) {
      const paceMinPerMile = (runTime / 60) / runDistance;
      return { value: paceMinPerMile.toFixed(1), unit: 'min/mi' };
    } else {
      const distanceKm = runDistance * 1.60934;
      const paceMinPerKm = (runTime / 60) / distanceKm;
      return { value: paceMinPerKm.toFixed(1), unit: 'min/km' };
    }
  };

  const getDisplayDistance = (): { value: string; unit: string } => {
    if (isEnglish) {
      return { value: runDistance.toFixed(2), unit: 'miles' };
    } else {
      const distanceKm = runDistance * 1.60934;
      return { value: distanceKm.toFixed(2), unit: 'km' };
    }
  };

  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startQuickRun = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Location permission is needed to track your run');
        return;
      }

      resetRun();
      setLastPosition(null);
      runStartTime.current = new Date();
      startRunStore();

      let timerCount = 0;
      timerRef.current = setInterval(() => {
        timerCount++;
        updateRunTime(timerCount);
      }, 1000);

      let currentDistance = 0;
      
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 5,
        },
        (location) => {
          const { latitude, longitude } = location.coords;
          const newPoint = { latitude, longitude, timestamp: Date.now() };
          
          addRouteCoord(newPoint);

          setLastPosition((prev: { latitude: number; longitude: number } | null) => {
            if (prev) {
              const dist = calculateDistance(prev.latitude, prev.longitude, latitude, longitude);
              if (dist < 0.5) {
                currentDistance += dist;
                updateRunDistance(currentDistance);
              }
            }
            return { latitude, longitude };
          });
        }
      );
    } catch (error) {
      console.error('Error starting run:', error);
      Alert.alert('Error', 'Failed to start run tracking');
    }
  };

  const stopQuickRun = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (locationSubscription.current) {
      locationSubscription.current.remove();
      locationSubscription.current = null;
    }

    stopRunStore();

    if (runDistance > 0.01 && userId) {
      try {
        const distanceKm = runDistance * 1.60934;
        let avgPaceMinPerKm = 0;
        if (runTime > 0 && distanceKm > 0) {
          avgPaceMinPerKm = (runTime / 60) / distanceKm;
        }
        
        const safeDistance = isNaN(distanceKm) || !isFinite(distanceKm) ? 0 : distanceKm;
        const safePace = isNaN(avgPaceMinPerKm) || !isFinite(avgPaceMinPerKm) ? 0 : avgPaceMinPerKm;
        const safeCalories = isNaN(runDistance * 100) ? 0 : runDistance * 100;
        
        const runData = {
          run_id: `run_${Date.now()}`,
          user_id: userId,
          distance: parseFloat(safeDistance.toFixed(4)),
          duration: runTime || 0,
          average_pace: parseFloat(safePace.toFixed(2)),
          calories_burned: parseFloat(safeCalories.toFixed(1)),
          route_data: [],
          notes: "",
          timestamp: new Date().toISOString(),
        };

        console.log('Saving run data:', JSON.stringify(runData));
        
        const response = await axios.post(`${API_URL}/api/runs`, runData);
        console.log('Run saved successfully:', response.data);
        
        Alert.alert(
          'Run Saved! 🏃',
          `Distance: ${runDistance.toFixed(2)} mi\nTime: ${formatTime(runTime)}`,
          [
            { text: 'OK', onPress: () => loadDashboard() }
          ]
        );
      } catch (error: any) {
        console.error('Error saving run:', error?.response?.data || error?.message || error);
        Alert.alert('Run Complete', `Distance: ${runDistance.toFixed(2)} mi\nTime: ${formatTime(runTime)}\n\n(Failed to save to server)`);
      }
    } else {
      Alert.alert('Run Too Short', 'Run was not saved because the distance was too short.');
    }

    resetRun();
    setLastPosition(null);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (locationSubscription.current) locationSubscription.current.remove();
    };
  }, []);

  const { tosAccepted } = useUserStore();

  if (!userId || !profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <FitTraxLogo size="xlarge" showText={true} />
          <Text style={[styles.welcomeText, { color: colors.text.primary }]}>
            {t('dashboard.welcome')}
          </Text>
          <Text style={[styles.welcomeSubtext, { color: colors.text.secondary }]}>
            {t('dashboard.createProfile')}
          </Text>
          <TouchableOpacity 
            style={[styles.ctaButton, { backgroundColor: accent.primary }]}
            onPress={() => {
              if (!tosAccepted?.accepted) {
                router.push('/terms-of-service');
              } else {
                router.push('/onboarding');
              }
            }}
          >
            <Text style={styles.ctaButtonText}>{t('dashboard.getStarted')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const today = dashboardData?.today || {};
  const userCalorieGoal = profile?.custom_calorie_goal || profile?.daily_calorie_goal || today.calories_goal || 2000;
  const caloriesRemaining = userCalorieGoal - (today.net_calories || 0);
  const progressPercentage = Math.min(((today.net_calories || 0) / userCalorieGoal) * 100, 100);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={handleRefresh}
            tintColor={accent.primary}
          />
        }
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background.secondary }]}>
          <View style={styles.headerLeft}>
            <FitTraxLogo size="small" showText={false} />
          </View>
          <TouchableOpacity style={styles.headerCenter} onPress={playVoiceGreeting} activeOpacity={0.7}>
            <Text style={[styles.greeting, { color: colors.text.primary }]}>
              {getGreeting()}, {profile?.name?.split(' ')[0]}
            </Text>
            <Text style={[styles.motivation, { color: accent.primary }]}>
              {getMotivationalMessage()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.headerRight, { backgroundColor: colors.background.card }]}
            onPress={() => router.push('/profile')}
          >
            <Ionicons name="person" size={20} color={accent.primary} />
          </TouchableOpacity>
        </View>

        {/* Streak Card */}
        {streakData && streakData.current_streak > 0 && (
          <TouchableOpacity onPress={() => router.push('/badges')}>
            <LinearGradient
              colors={accent.gradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.streakCard}
            >
              <View style={styles.streakContent}>
                <Text style={styles.streakIcon}>🔥</Text>
                <View style={styles.streakInfo}>
                  <Text style={styles.streakNumber}>{streakData.current_streak}</Text>
                  <Text style={styles.streakLabel}>Day Streak</Text>
                </View>
                <View style={styles.streakDivider} />
                <View style={styles.streakInfo}>
                  <Text style={styles.streakNumber}>{streakData.longest_streak}</Text>
                  <Text style={styles.streakLabel}>Best</Text>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        )}
                {/* Calorie Progress */}
        <View style={[styles.calorieCard, { backgroundColor: colors.background.card }]}>
          <View style={styles.calorieHeader}>
            <View style={styles.calorieHeaderLeft}>
              <Ionicons name="flame" size={24} color={accent.primary} />
              <Text style={[styles.calorieTitle, { color: colors.text.primary }]}>
                {t('dashboard.todaysCalories')}
              </Text>
            </View>
            <View style={styles.calorieHeaderRight}>
              {today.meals_count > 0 && (
                <TouchableOpacity 
                  onPress={clearTodaysMeals}
                  style={styles.clearButton}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              )}
              <Text style={[styles.calorieGoal, { color: colors.text.muted }]}>
                {t('dashboard.goal')}: {userCalorieGoal}
              </Text>
            </View>
          </View>
          
          <View style={styles.calorieStats}>
            <View style={styles.calorieStat}>
              <Text style={[styles.calorieStatValue, { color: colors.text.primary }]}>
                {Math.round(today.calories_consumed || 0)}
              </Text>
              <Text style={[styles.calorieStatLabel, { color: colors.text.muted }]}>{t('dashboard.eaten')}</Text>
            </View>
            <View style={[styles.calorieStatDivider, { backgroundColor: colors.border.primary }]} />
            <View style={styles.calorieStat}>
              <Text style={[styles.calorieStatValue, { color: '#22C55E' }]}>
                {Math.round(today.calories_burned || 0)}
              </Text>
              <Text style={[styles.calorieStatLabel, { color: colors.text.muted }]}>{t('dashboard.burned')}</Text>
            </View>
            <View style={[styles.calorieStatDivider, { backgroundColor: colors.border.primary }]} />
            <View style={styles.calorieStat}>
              <Text style={[
                styles.calorieStatValue, 
                { color: caloriesRemaining >= 0 ? accent.primary : '#EF4444' }
              ]}>
                {Math.abs(Math.round(caloriesRemaining))}
              </Text>
              <Text style={[styles.calorieStatLabel, { color: colors.text.muted }]}>
                {caloriesRemaining >= 0 ? t('dashboard.left') : t('dashboard.over')}
              </Text>
            </View>
          </View>

          <View style={[styles.progressBar, { backgroundColor: colors.background.elevated }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${progressPercentage}%`,
                  backgroundColor: progressPercentage > 100 ? '#EF4444' : accent.primary
                }
              ]} 
            />
          </View>
        </View>

        {/* Stats Grid with AI Images */}
        <View style={styles.statsGrid}>
          {/* Meals Card */}
          <TouchableOpacity 
            style={[styles.statCardWithImage, { backgroundColor: colors.background.card }]}
            onPress={() => router.push('/(tabs)/scan')}
          >
            <Image source={{ uri: STAT_CARD_IMAGES.meals }} style={styles.statCardImage} resizeMode="cover" />
            <View style={styles.statCardOverlay}>
              <Text style={styles.statValueImage}>{today.meals_count || 0}</Text>
              <Text style={styles.statLabelImage}>{t('dashboard.meals')}</Text>
            </View>
          </TouchableOpacity>

          {/* Training Card */}
          <TouchableOpacity 
            style={[styles.statCardWithImage, { backgroundColor: colors.background.card }]}
            onPress={() => {
              if (!isPremium) {
                Alert.alert(
                  'Premium Feature',
                  'Training is a premium feature. Upgrade to FitTrax+ Premium to unlock this feature.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => router.push('/membership') }
                  ]
                );
                return;
              }
              router.push('/weight-training');
            }}
          >
            <Image source={{ uri: STAT_CARD_IMAGES.training }} style={styles.statCardImage} resizeMode="cover" />
            <View style={styles.statCardOverlay}>
              <Text style={styles.statValueImage}>{today.workouts_count || 0}</Text>
              <Text style={styles.statLabelImage}>Training</Text>
            </View>
            {!isPremium && (
              <View style={styles.premiumBadgeAction}>
                <Ionicons name="diamond" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Hydration Card */}
          <TouchableOpacity 
            style={[styles.statCardWithImage, { backgroundColor: colors.background.card }]}
            onPress={() => {
              if (!isPremium) {
                Alert.alert(
                  'Premium Feature',
                  'Hydration is a premium feature. Upgrade to FitTrax+ Premium to unlock this feature.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Upgrade', onPress: () => router.push('/membership') }
                  ]
                );
                return;
              }
              router.push('/hydration');
            }}
            activeOpacity={0.7}
          >
            <Image source={{ uri: STAT_CARD_IMAGES.hydration }} style={styles.statCardImage} resizeMode="cover" />
            <View style={styles.statCardOverlay}>
              <Text style={styles.statValueImage}>{Math.round(today.water_intake || 0)}</Text>
              <Text style={styles.statLabelImage}>Hydration</Text>
            </View>
            {!isPremium && (
              <View style={styles.premiumBadgeAction}>
                <Ionicons name="diamond" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>

          {/* Heart Rate Card */}
          <TouchableOpacity 
            style={[styles.statCardWithImage, { backgroundColor: colors.background.card }]}
            onPress={() => router.push('/heart-rate')}
          >
            <Image source={{ uri: STAT_CARD_IMAGES.heartRate }} style={styles.statCardImage} resizeMode="cover" />
            <View style={styles.statCardOverlay}>
              <Text style={styles.statValueImage}>{Math.round(today.avg_heart_rate || 0)}</Text>
              <Text style={styles.statLabelImage}>Heart Rate</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Hydration Quick Add */}
        <TouchableOpacity 
          style={[styles.waterSection, { backgroundColor: colors.background.card }]}
          onPress={() => router.push('/hydration')}
          activeOpacity={0.8}
        >
          <View style={styles.waterHeader}>
            <View style={styles.waterHeaderLeft}>
              <Ionicons name="water" size={20} color="#06B6D4" />
              <Text style={[styles.waterTitle, { color: colors.text.primary }]}>Hydration</Text>
            </View>
            <View style={styles.waterHeaderRight}>
              <Text style={[styles.viewAllText, { color: '#06B6D4' }]}>View Log</Text>
              <Ionicons name="chevron-forward" size={16} color="#06B6D4" />
            </View>
          </View>
          <View style={styles.waterButtons}>
            {[8, 16, 24, 32].map((amount) => (
              <TouchableOpacity
                key={amount}
                style={[styles.waterButton, { backgroundColor: colors.background.elevated }]}
                onPress={(e) => {
                  e.stopPropagation();
                  addWater(amount);
                }}
              >
                <Text style={[styles.waterButtonText, { color: '#06B6D4' }]}>+{amount}oz</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>

        {/* Start Running Button */}
        {isRunning ? (
          <View style={styles.runningActiveContainer}>
            <LinearGradient
              colors={runningButtonGradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.runningActiveGradient}
            >
              <View style={styles.runningActiveHeader}>
                <View style={styles.runningPulse}>
                  <Ionicons name="walk" size={24} color="#fff" />
                </View>
                <Text style={styles.runningActiveLabel}>Running...</Text>
              </View>
              
              <View style={styles.runningStats}>
                <View style={styles.runningStat}>
                  <Text style={styles.runningStatValue}>{getDisplayDistance().value}</Text>
                  <Text style={styles.runningStatLabel}>{getDisplayDistance().unit}</Text>
                </View>
                <View style={styles.runningStatDivider} />
                <View style={styles.runningStat}>
                  <Text style={styles.runningStatValue}>{formatTime(runTime)}</Text>
                  <Text style={styles.runningStatLabel}>time</Text>
                </View>
                <View style={styles.runningStatDivider} />
                <View style={styles.runningStat}>
                  <Text style={styles.runningStatValue}>{calculatePace().value}</Text>
                  <Text style={styles.runningStatLabel}>{calculatePace().unit}</Text>
                </View>
              </View>

              <View style={styles.runningActions}>
                <TouchableOpacity 
                  style={[styles.stopRunButton, { borderColor: runningButtonPrimary }]}
                  onPress={stopQuickRun}
                >
                  <Ionicons name="stop" size={20} color={runningButtonPrimary} />
                  <Text style={[styles.stopRunButtonText, { color: runningButtonPrimary }]}>Stop Run</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.viewTrackerButton}
                  onPress={() => router.push('/running')}
                >
                  <Text style={styles.viewTrackerButtonText}>View Map</Text>
                  <Ionicons name="chevron-forward" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.startRunningButton}
            onPress={startQuickRun}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={runningButtonGradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.startRunningGradient}
            >
              <View style={styles.startRunningContent}>
                <View style={styles.startRunningIconContainer}>
                  <Ionicons name="walk" size={28} color="#fff" />
                </View>
                <View style={styles.startRunningTextContainer}>
                  <Text style={styles.startRunningTitle}>Start Running</Text>
                  <Text style={styles.startRunningSubtitle}>Track your outdoor run with GPS</Text>
                </View>
              </View>
              <Ionicons name="play-circle" size={32} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Quick Actions */}
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{t('dashboard.quickActions')}</Text>
        <View style={styles.actionsGrid}>
          {[
            { image: QUICK_ACTION_IMAGES.aiCoach, label: 'AI Workout Coach', route: '/ai-workout-chat', premium: true },
            { image: QUICK_ACTION_IMAGES.scanFood, label: t('dashboard.scanFood'), route: '/scan', premium: true },
            { image: QUICK_ACTION_IMAGES.schedule, label: t('dashboard.schedule'), route: '/schedule', premium: true },
            { image: QUICK_ACTION_IMAGES.workoutLog, label: 'Workout Log', route: '/(tabs)/workout', premium: true },
            { image: QUICK_ACTION_IMAGES.run, label: t('dashboard.run'), route: '/running', premium: false },
            { image: QUICK_ACTION_IMAGES.steps, label: 'Step Tracker', route: '/step-tracker', premium: false },
            { image: QUICK_ACTION_IMAGES.bodyScan, label: t('dashboard.bodyScan'), route: '/body-scan', premium: true },
            { image: QUICK_ACTION_IMAGES.peptides, label: t('dashboard.peptides'), route: '/peptides', premium: true },
            { image: QUICK_ACTION_IMAGES.rewards, label: t('dashboard.rewards'), route: '/badges', premium: true },
            { image: QUICK_ACTION_IMAGES.analytics, label: t('dashboard.analytics'), route: '/analytics', premium: true },
          ].map((action, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.actionCardWithImage, { backgroundColor: colors.background.card }]}
              onPress={() => {
                if (action.premium && !isPremium) {
                  Alert.alert(
                    'Premium Feature',
                    `${action.label} is a premium feature. Upgrade to FitTrax+ Premium to unlock this feature.`,
                    [
                      { text: 'Maybe Later', style: 'cancel' },
                      { text: 'Upgrade Now', onPress: () => router.push('/membership') }
                    ]
                  );
                } else {
                  router.push(action.route as any);
                }
              }}
            >
              <Image source={{ uri: action.image }} style={styles.actionCardImage} resizeMode="cover" />
              {action.premium && !isPremium && (
                              <View style={styles.premiumBadgeAction}>
                  <Ionicons name="diamond" size={10} color="#fff" />
                </View>
              )}
              <View style={styles.actionCardOverlay}>
                <Text style={styles.actionLabelImage} numberOfLines={2}>
                  {action.label}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Premium Banner */}
        <TouchableOpacity onPress={() => router.push('/membership')}>
          <LinearGradient
            colors={accent.gradient as [string, string]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.premiumBanner}
          >
            <View style={styles.premiumContent}>
              <Ionicons name="diamond" size={28} color="#fff" />
              <View style={styles.premiumText}>
                <Text style={styles.premiumTitle}>FitTrax+ Premium</Text>
                <Text style={styles.premiumSubtitle}>AI Workouts • Body Scan • Peptides</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      <AchievementModal
        visible={achievementModal.visible}
        achievement={achievementModal.achievement}
        onClose={() => setAchievementModal({ visible: false, achievement: null })}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  scrollContent: {
    padding: 16,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 32,
    textAlign: 'center',
  },
  welcomeSubtext: {
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
    marginBottom: 32,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 8,
  },
  ctaButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  headerLeft: {
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
  },
  headerRight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
  },
  motivation: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  streakCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  streakContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  streakInfo: {
    alignItems: 'center',
  },
  streakNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  streakLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '600',
  },
  streakDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 24,
  },
  calorieCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  calorieHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calorieHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calorieHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    padding: 6,
  },
  calorieTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  calorieGoal: {
    fontSize: 14,
  },
  calorieStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  calorieStat: {
    alignItems: 'center',
    flex: 1,
  },
  calorieStatValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  calorieStatLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  calorieStatDivider: {
    width: 1,
    height: 40,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: (width - 48 - 12) / 2,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    position: 'relative',
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statCardWithImage: {
    width: (width - 48 - 12) / 2,
    height: 120,
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  statCardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  statCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  statValueImage: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statLabelImage: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  premiumBadgeImage: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#8B5CF6',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  waterSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  waterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  waterHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  waterHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  waterTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  waterButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  waterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  waterButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  startRunningButton: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  startRunningGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  startRunningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  startRunningIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startRunningTextContainer: {},
  startRunningTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  startRunningSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  runningActiveContainer: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  runningActiveGradient: {
    padding: 16,
  },
  runningActiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  runningPulse: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  runningActiveLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  runningStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  runningStat: {
    alignItems: 'center',
    flex: 1,
  },
  runningStatValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  runningStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  runningStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  runningActions: {
    flexDirection: 'row',
    gap: 12,
  },
  stopRunButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
  },
  stopRunButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  viewTrackerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
  },
  viewTrackerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    width: (width - 48 - 12) / 2,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    position: 'relative',
  },
  actionCardWithImage: {
    width: (width - 48 - 12) / 2,
    height: 100,
    borderRadius: 16,
    position: 'relative',
  },
  actionCardImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    borderRadius: 16,
  },
  actionCardOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: 12,
  },
  actionLabelImage: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  premiumBadgeAction: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#8B5CF6',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  premiumBadgeCard: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#8B5CF6',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  premiumBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#8B5CF6',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  premiumBanner: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  premiumContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  premiumText: {},
  premiumTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  premiumSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
});

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Dimensions,
  Alert,
  ActivityIndicator,
  Switch,
  AppState,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { stepsAPI } from '../services/api';

// Conditionally import Pedometer only on native platforms
let Pedometer: any = null;
if (Platform.OS !== 'web') {
  try {
    Pedometer = require('expo-sensors').Pedometer;
  } catch (e) {
    console.log('Pedometer not available');
  }
}

const { width } = Dimensions.get('window');

// Activity level multipliers for TDEE calculation
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const CALORIES_PER_STEP_BASE = 0.04;
const CALORIES_PER_POUND = 3500;

// Ring Chart Component
interface RingChartProps {
  progress: number;
  size: number;
  strokeWidth: number;
  currentSteps: number;
  goalSteps: number;
  colors: any;
  accentGradient: string[];
}

const RingChart: React.FC<RingChartProps> = ({ 
  progress, 
  size, 
  strokeWidth, 
  currentSteps, 
  goalSteps, 
  colors,
  accentGradient 
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(progress, 1) * circumference);
  const center = size / 2;

  return (
    <View style={styles.ringContainer}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={accentGradient[0]} />
            <Stop offset="100%" stopColor={accentGradient[1]} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.background.elevated}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#progressGradient)"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[styles.ringContent, { width: size, height: size }]}>
        <MaterialCommunityIcons name="shoe-print" size={28} color={accentGradient[0]} />
        <Text style={[styles.ringSteps, { color: colors.text.primary }]}>
          {currentSteps.toLocaleString()}
        </Text>
        <Text style={[styles.ringGoal, { color: colors.text.muted }]}>
          of {goalSteps.toLocaleString()}
        </Text>
        <Text style={[styles.ringPercent, { color: accentGradient[0] }]}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
    </View>
  );
};

// Bar Chart Component for History
interface BarChartProps {
  data: { label: string; value: number; goal?: number }[];
  colors: any;
  accentColor: string;
  height?: number;
}

const BarChart: React.FC<BarChartProps> = ({ data, colors, accentColor, height = 150 }) => {
  if (!data || data.length === 0) return null;
  
  const maxValue = Math.max(...data.map(d => d.value), ...data.map(d => d.goal || 0)) || 1;
  const barWidth = Math.max(20, (width - 80) / data.length - 8);

  return (
    <View style={[styles.chartContainer, { height }]}>
      <Svg width={width - 48} height={height}>
        {data.map((item, index) => {
          const barHeight = (item.value / maxValue) * (height - 30);
          const x = index * (barWidth + 8) + 4;
          const y = height - barHeight - 20;
          
          return (
            <React.Fragment key={index}>
              <Defs>
                <SvgLinearGradient id={`barGradient${index}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <Stop offset="0%" stopColor={accentColor} />
                  <Stop offset="100%" stopColor={accentColor} stopOpacity={0.6} />
                </SvgLinearGradient>
              </Defs>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                fill={`url(#barGradient${index})`}
              />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={styles.chartLabels}>
        {data.map((item, index) => (
          <Text 
            key={index} 
            style={[styles.chartLabel, { color: colors.text.muted, width: barWidth + 8 }]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        ))}
      </View>
    </View>
  );
};

export default function StepTrackerScreen() {
  const { profile, userId } = useUserStore();
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;

  // Tracking states
  const [isTracking, setIsTracking] = useState(false);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState<boolean | null>(null);
  const [pedometerSteps, setPedometerSteps] = useState(0);
  const pedometerSubscription = useRef<any>(null);
  const appState = useRef(AppState.currentState);

  // Settings - Start with tracking OFF by default
  const [settings, setSettings] = useState({
    daily_goal: 10000,
    tracking_enabled: false,  // Start in OFF position
    auto_sync_health: false,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);

  // Step data
  const [todaysSteps, setTodaysSteps] = useState(0);
  const [manualStepsInput, setManualStepsInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // History data
  const [historyTab, setHistoryTab] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dailyHistory, setDailyHistory] = useState<any[]>([]);
  const [weeklyHistory, setWeeklyHistory] = useState<any[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<any[]>([]);
  const [historySummary, setHistorySummary] = useState<any>(null);
  const [deletingHistory, setDeletingHistory] = useState(false);

  // User profile data for calculations
  const weight = profile?.weight || 150;
  const goalWeight = profile?.goal_weight || 140;
  const heightFeet = profile?.height_feet || 5;
  const heightInches = profile?.height_inches || 8;
  const age = profile?.age || 30;
  const gender = profile?.gender || 'male';
  const activityLevel = profile?.activity_level || 'moderate';

  // Check pedometer availability
  useEffect(() => {
    const checkPedometer = async () => {
      if (Platform.OS === 'web' || !Pedometer) {
        setIsPedometerAvailable(false);
        return;
      }
      try {
        const available = await Pedometer.isAvailableAsync();
        setIsPedometerAvailable(available);
      } catch (e) {
        setIsPedometerAvailable(false);
      }
    };
    checkPedometer();
  }, []);

  // Load settings and data
  useEffect(() => {
    if (userId) {
      loadSettings();
      loadTodaySteps();
      loadHistory();
    }
  }, [userId]);

  // Auto-start tracking when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (settings.tracking_enabled && isPedometerAvailable) {
        startTracking();
      }
      return () => {
        stopTracking();
      };
    }, [settings.tracking_enabled, isPedometerAvailable])
  );

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground
        if (settings.tracking_enabled && isPedometerAvailable) {
          startTracking();
        }
        loadTodaySteps();
      } else if (nextAppState.match(/inactive|background/)) {
        // App going to background - save steps
        saveSteps();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [settings.tracking_enabled, isPedometerAvailable, todaysSteps, pedometerSteps]);

  const loadSettings = async () => {
    try {
      setSettingsLoading(true);
      const data = await stepsAPI.getSettings(userId!);
      setSettings(data);
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const loadTodaySteps = async () => {
    try {
      const data = await stepsAPI.getTodaySteps(userId!);
      setTodaysSteps(data.steps || 0);
    } catch (error) {
      console.error('Error loading today steps:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      // Load daily history
      const dailyData = await stepsAPI.getHistory(userId!, 14);
      setDailyHistory(dailyData.entries || []);
      setHistorySummary(dailyData.summary);

      // Load weekly history
      const weeklyData = await stepsAPI.getWeekly(userId!);
      setWeeklyHistory(weeklyData.weekly_data || []);

      // Load monthly history
      const monthlyData = await stepsAPI.getMonthly(userId!);
      setMonthlyHistory(monthlyData.monthly_data || []);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const startTracking = async () => {
    if (isTracking || !isPedometerAvailable || !Pedometer) return;

    try {
      setIsTracking(true);
      
      // Get steps from midnight today
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const pastSteps = await Pedometer.getStepCountAsync(start, end);
      setPedometerSteps(pastSteps.steps);

      // Subscribe to step updates
      pedometerSubscription.current = Pedometer.watchStepCount((result: any) => {
        setPedometerSteps((prev: number) => prev + result.steps);
      });
    } catch (error) {
      console.error('Error starting pedometer:', error);
      setIsTracking(false);
    }
  };

  const stopTracking = () => {
    if (pedometerSubscription.current) {
      pedometerSubscription.current.remove();
      pedometerSubscription.current = null;
    }
    setIsTracking(false);
  };

  const saveSteps = async (stepsToSave?: number) => {
    if (!userId) return;
    
    const steps = stepsToSave ?? Math.max(todaysSteps, pedometerSteps);
    if (steps === 0) return;

    try {
      setSaving(true);
      const today = new Date().toISOString().split('T')[0];
      await stepsAPI.saveSteps({
        user_id: userId,
        steps,
        date: today,
        source: pedometerSteps > 0 ? 'pedometer' : 'manual',
      });
      setTodaysSteps(steps);
      loadHistory();
    } catch (error) {
      console.error('Error saving steps:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddManualSteps = () => {
    const stepsToAdd = parseInt(manualStepsInput) || 0;
    if (stepsToAdd > 0) {
      const newTotal = todaysSteps + stepsToAdd;
      setTodaysSteps(newTotal);
      saveSteps(newTotal);
      setManualStepsInput('');
    }
  };

  const toggleTracking = async (enabled: boolean) => {
    try {
      const newSettings = { ...settings, tracking_enabled: enabled };
      setSettings(newSettings);
      await stepsAPI.saveSettings({
        user_id: userId!,
        ...newSettings,
      });
      
      if (enabled && isPedometerAvailable) {
        startTracking();
      } else {
        stopTracking();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const updateDailyGoal = async (goal: number) => {
    try {
      const newSettings = { ...settings, daily_goal: goal };
      setSettings(newSettings);
      await stepsAPI.saveSettings({
        user_id: userId!,
        ...newSettings,
      });
    } catch (error) {
      console.error('Error saving goal:', error);
    }
  };

  const handleDeleteHistory = (period: 'daily' | 'weekly' | 'monthly' | 'all') => {
    const periodLabels = {
      daily: "today's",
      weekly: "this week's",
      monthly: "this month's",
      all: "all"
    };
    
    const additionalNote = period === 'daily' || period === 'all' 
      ? "\n\nThis will also reset your current step counter display."
      : "";
    
    Alert.alert(
      'Delete Step History',
      `Are you sure you want to delete ${periodLabels[period]} step data?${additionalNote}\n\nThis action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            
            setDeletingHistory(true);
            try {
              let result;
              switch (period) {
                case 'daily':
                  result = await stepsAPI.deleteDaily(userId);
                  // Reset today's counter
                  setTodaysSteps(0);
                  setPedometerSteps(0);
                  break;
                case 'weekly':
                  result = await stepsAPI.deleteWeekly(userId);
                  // Also reset today if deleting weekly
                  setTodaysSteps(0);
                  setPedometerSteps(0);
                  break;
                case 'monthly':
                  result = await stepsAPI.deleteMonthly(userId);
                  // Also reset today if deleting monthly
                  setTodaysSteps(0);
                  setPedometerSteps(0);
                  break;
                case 'all':
                  result = await stepsAPI.deleteAll(userId);
                  setTodaysSteps(0);
                  setPedometerSteps(0);
                  break;
              }
              
              // Refresh history data
              loadHistory();
              
              const deletedMsg = result.deleted_count > 0 
                ? `${result.deleted_count} step record(s) deleted from database.`
                : "No saved records found in database.";
              
              Alert.alert('Success', `${deletedMsg}\n\nStep counter has been reset.`);
              
            } catch (error) {
              console.error('Error deleting history:', error);
              Alert.alert('Error', 'Failed to delete step history. Please try again.');
            } finally {
              setDeletingHistory(false);
            }
          },
        },
      ]
    );
  };

  // Calculate metrics
  const currentSteps = Math.max(todaysSteps, pedometerSteps);
  const ringProgress = settings.daily_goal > 0 ? currentSteps / settings.daily_goal : 0;
  const caloriesBurned = Math.round(currentSteps * CALORIES_PER_STEP_BASE * (weight / 150));
  const distanceMiles = (currentSteps / 2000).toFixed(2);

  // Format chart data
  const dailyChartData = dailyHistory.slice(0, 7).reverse().map(entry => ({
    label: new Date(entry.date).toLocaleDateString('en-US', { weekday: 'short' }),
    value: entry.steps,
    goal: settings.daily_goal,
  }));

  const weeklyChartData = weeklyHistory.slice(-8).map(entry => ({
    label: `W${entry.week_start.split('-')[1]}`,
    value: entry.total_steps,
  }));

  const monthlyChartData = monthlyHistory.slice(-6).map(entry => ({
    label: new Date(entry.month + '-01').toLocaleDateString('en-US', { month: 'short' }),
    value: entry.total_steps,
  }));

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border.primary }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={accent.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Step Tracker</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Tracking Status Banner */}
          <View style={[styles.statusBanner, { 
            backgroundColor: isTracking ? `${accent.primary}20` : colors.background.card 
          }]}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusDot, { 
                backgroundColor: isTracking ? '#22C55E' : colors.text.muted 
              }]} />
              <Text style={[styles.statusText, { color: colors.text.primary }]}>
                {isTracking ? 'Tracking Active' : 'Tracking Paused'}
              </Text>
              {isPedometerAvailable === false && (
                <Text style={[styles.statusSubtext, { color: colors.text.muted }]}>
                  (Pedometer unavailable)
                </Text>
              )}
            </View>
            <Switch
              value={settings.tracking_enabled}
              onValueChange={toggleTracking}
              trackColor={{ false: colors.background.elevated, true: `${accent.primary}50` }}
              thumbColor={settings.tracking_enabled ? accent.primary : colors.text.muted}
            />
          </View>

          {/* Ring Chart Progress Card */}
          <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1758396367575-75053a0b6e78?w=800' }}
            style={styles.ringCardBg}
            imageStyle={styles.ringCardBgImage}
            resizeMode="cover"
          >
            <View style={styles.ringCardOverlay}>
              <Text style={styles.ringCardTitleWhite}>
                Today's Progress
              </Text>
              
              <RingChart
                progress={ringProgress}
                size={200}
                strokeWidth={16}
                currentSteps={currentSteps}
                goalSteps={settings.daily_goal}
                colors={colors}
                accentGradient={accent.gradient as string[]}
              />

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="flame" size={20} color="#EF4444" />
                  <Text style={styles.statValueWhite}>{caloriesBurned}</Text>
                  <Text style={styles.statLabelWhite}>calories</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
                <View style={styles.statItem}>
                  <Ionicons name="location" size={20} color="#06B6D4" />
                  <Text style={styles.statValueWhite}>{distanceMiles}</Text>
                  <Text style={styles.statLabelWhite}>miles</Text>
                </View>
                <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
                <View style={styles.statItem}>
                  <Ionicons name="time" size={20} color="#8B5CF6" />
                  <Text style={styles.statValueWhite}>{Math.round(currentSteps / 100)}</Text>
                  <Text style={styles.statLabelWhite}>min walk</Text>
                </View>
              </View>

              {/* Manual Add Section */}
              <View style={styles.manualAddSection}>
                <Text style={styles.inputLabelWhite}>
                  Add Steps Manually
                </Text>
                <View style={styles.manualAddRow}>
                  <View style={[styles.manualInputContainer, { backgroundColor: 'rgba(255,255,255,0.9)', borderColor: 'rgba(255,255,255,0.5)' }]}>
                    <TextInput
                      style={[styles.manualInput, { color: '#1a1a2e' }]}
                      value={manualStepsInput}
                      onChangeText={setManualStepsInput}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#666"
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: accent.primary }]}
                    onPress={handleAddManualSteps}
                    disabled={saving}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="add" size={24} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
                
                {/* Quick Add Buttons */}
                <View style={styles.quickAddRow}>
                  {[1000, 2500, 5000].map((amount) => (
                    <TouchableOpacity
                      key={amount}
                      style={[styles.quickAddButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                      onPress={() => {
                        const newTotal = currentSteps + amount;
                        setTodaysSteps(newTotal);
                        saveSteps(newTotal);
                      }}
                    >
                      <Text style={[styles.quickAddText, { color: '#fff' }]}>+{amount.toLocaleString()}</Text>
                    </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          </ImageBackground>

          {/* Daily Goal Setting */}
          <View style={[styles.goalCard, { backgroundColor: colors.background.card }]}>
            <View style={styles.goalHeader}>
              <View style={[styles.goalIcon, { backgroundColor: `${accent.primary}20` }]}>
                <Ionicons name="flag" size={24} color={accent.primary} />
              </View>
              <View style={styles.goalInfo}>
                <Text style={[styles.goalTitle, { color: colors.text.primary }]}>Daily Goal</Text>
                <Text style={[styles.goalSubtitle, { color: colors.text.muted }]}>
                  Tap to adjust
                </Text>
              </View>
            </View>
            
            <View style={styles.goalSlider}>
              {[5000, 7500, 10000, 12500, 15000].map((goal) => (
                <TouchableOpacity
                  key={goal}
                  style={[
                    styles.goalOption,
                    { backgroundColor: colors.background.elevated },
                    settings.daily_goal === goal && { backgroundColor: accent.primary }
                  ]}
                  onPress={() => updateDailyGoal(goal)}
                >
                  <Text style={[
                    styles.goalOptionText,
                    { color: settings.daily_goal === goal ? '#fff' : colors.text.primary }
                  ]}>
                    {(goal / 1000).toFixed(goal % 1000 === 0 ? 0 : 1)}k
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* History Section */}
          <View style={[styles.historyCard, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>History</Text>
            
            {/* Tab Selector */}
            <View style={[styles.tabContainer, { backgroundColor: colors.background.elevated }]}>
              {(['daily', 'weekly', 'monthly'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[
                    styles.tab,
                    historyTab === tab && { backgroundColor: accent.primary }
                  ]}
                  onPress={() => setHistoryTab(tab)}
                >
                  <Text style={[
                    styles.tabText,
                    { color: historyTab === tab ? '#fff' : colors.text.secondary }
                  ]}>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Chart */}
            {historyTab === 'daily' && dailyChartData.length > 0 && (
              <BarChart data={dailyChartData} colors={colors} accentColor={accent.primary} />
            )}
            {historyTab === 'weekly' && weeklyChartData.length > 0 && (
              <BarChart data={weeklyChartData} colors={colors} accentColor="#F59E0B" />
            )}
            {historyTab === 'monthly' && monthlyChartData.length > 0 && (
              <BarChart data={monthlyChartData} colors={colors} accentColor="#8B5CF6" />
            )}

            {/* Summary Stats */}
            {historySummary && (
              <View style={[styles.summaryContainer, { backgroundColor: colors.background.elevated }]}>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.text.primary }]}>
                    {historySummary.total_steps?.toLocaleString() || 0}
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>Total Steps</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.text.primary }]}>
                    {historySummary.average_steps?.toLocaleString() || 0}
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>Daily Avg</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: colors.text.primary }]}>
                    {historySummary.days_tracked || 0}
                  </Text>
                  <Text style={[styles.summaryLabel, { color: colors.text.muted }]}>Days Tracked</Text>
                </View>
              </View>
            )}

            {/* Delete History Options */}
            <View style={styles.deleteHistorySection}>
              <Text style={[styles.deleteHistoryTitle, { color: colors.text.secondary }]}>
                Delete Step History
              </Text>
              <View style={styles.deleteButtonsRow}>
                <TouchableOpacity
                  style={[styles.deleteButton, { borderColor: '#FEE2E2' }]}
                  onPress={() => handleDeleteHistory('daily')}
                  disabled={deletingHistory}
                >
                  <Ionicons name="today-outline" size={16} color="#EF4444" />
                  <Text style={styles.deleteButtonText}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, { borderColor: '#FEE2E2' }]}
                  onPress={() => handleDeleteHistory('weekly')}
                  disabled={deletingHistory}
                >
                  <Ionicons name="calendar-outline" size={16} color="#EF4444" />
                  <Text style={styles.deleteButtonText}>Week</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, { borderColor: '#FEE2E2' }]}
                  onPress={() => handleDeleteHistory('monthly')}
                  disabled={deletingHistory}
                >
                  <Ionicons name="calendar" size={16} color="#EF4444" />
                  <Text style={styles.deleteButtonText}>Month</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.deleteButton, styles.deleteAllButton]}
                  onPress={() => handleDeleteHistory('all')}
                  disabled={deletingHistory}
                >
                  {deletingHistory ? (
                    <ActivityIndicator size="small" color="#EF4444" />
                  ) : (
                    <>
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                      <Text style={styles.deleteButtonText}>All</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Health Integration Card */}
          <View style={[styles.healthCard, { backgroundColor: colors.background.card }]}>
            <View style={styles.healthHeader}>
              <Ionicons name="heart" size={24} color="#EF4444" />
              <Text style={[styles.healthTitle, { color: colors.text.primary }]}>
                Health App Integration
              </Text>
            </View>
            
            <Text style={[styles.healthDescription, { color: colors.text.secondary }]}>
              Sync steps from Apple Health (iOS) or Google Health Connect (Android) for more accurate tracking with wearable devices.
            </Text>

            <View style={styles.healthOptions}>
              {Platform.OS === 'ios' && (
                <TouchableOpacity 
                  style={[styles.healthButton, { backgroundColor: colors.background.elevated }]}
                  onPress={() => Alert.alert('Apple Health', 'Apple HealthKit integration requires a development build. This feature works when you export the app.')}
                >
                  <Ionicons name="fitness" size={24} color="#FF2D55" />
                  <Text style={[styles.healthButtonText, { color: colors.text.primary }]}>Apple Health</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                </TouchableOpacity>
              )}
              
              {Platform.OS === 'android' && (
                <TouchableOpacity 
                  style={[styles.healthButton, { backgroundColor: colors.background.elevated }]}
                  onPress={() => Alert.alert('Health Connect', 'Google Health Connect integration requires a development build. This feature works when you export the app.')}
                >
                  <Ionicons name="fitness" size={24} color="#4285F4" />
                  <Text style={[styles.healthButtonText, { color: colors.text.primary }]}>Health Connect</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={[styles.healthButton, { backgroundColor: colors.background.elevated }]}
                onPress={() => {
                  toggleTracking(!settings.tracking_enabled);
                }}
              >
                <MaterialCommunityIcons name="cellphone" size={24} color={accent.primary} />
                <Text style={[styles.healthButtonText, { color: colors.text.primary }]}>Device Pedometer</Text>
                <View style={[styles.healthStatus, { backgroundColor: isPedometerAvailable ? '#22C55E' : '#EF4444' }]}>
                  <Text style={styles.healthStatusText}>
                    {isPedometerAvailable ? 'Active' : 'N/A'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* Weight Loss Projection */}
          {weight > goalWeight && (
            <View style={[styles.projectionCard, { backgroundColor: colors.background.card }]}>
              <View style={styles.projectionHeader}>
                <Ionicons name="trending-down" size={24} color="#22C55E" />
                <Text style={[styles.projectionTitle, { color: colors.text.primary }]}>
                  Weight Loss Progress
                </Text>
              </View>
              
              <View style={styles.projectionStats}>
                <View style={styles.projectionItem}>
                  <Text style={[styles.projectionValue, { color: colors.text.primary }]}>{weight}</Text>
                  <Text style={[styles.projectionLabel, { color: colors.text.muted }]}>Current lbs</Text>
                </View>
                <Ionicons name="arrow-forward" size={20} color={accent.primary} />
                <View style={styles.projectionItem}>
                  <Text style={[styles.projectionValue, { color: accent.primary }]}>{goalWeight}</Text>
                  <Text style={[styles.projectionLabel, { color: colors.text.muted }]}>Goal lbs</Text>
                </View>
              </View>

              <Text style={[styles.projectionNote, { color: colors.text.secondary }]}>
                At your current step goal, you're burning ~{Math.round(settings.daily_goal * CALORIES_PER_STEP_BASE * (weight / 150))} extra calories/day from walking.
              </Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
  },
  scrollContent: {
    padding: 16,
  },
  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 15,
    fontWeight: '600',
  },
  statusSubtext: {
    fontSize: 12,
  },
  // Ring Chart
  ringCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  ringCardBg: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  ringCardBgImage: {
    borderRadius: 20,
  },
  ringCardOverlay: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  ringCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
  },
  ringCardTitleWhite: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 20,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ringContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringContent: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSteps: {
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  ringGoal: {
    fontSize: 13,
    marginTop: 2,
  },
  ringPercent: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  statValueWhite: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  statLabelWhite: {
    fontSize: 12,
    marginTop: 2,
    color: 'rgba(255,255,255,0.9)',
  },
  statDivider: {
    width: 1,
    height: 50,
  },
  // Manual Add
  manualAddSection: {
    width: '100%',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputLabelWhite: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    color: '#fff',
  },
  manualAddRow: {
    flexDirection: 'row',
    gap: 10,
  },
  manualInputContainer: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 48,
    justifyContent: 'center',
  },
  manualInput: {
    fontSize: 18,
    fontWeight: '600',
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  quickAddButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  quickAddText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Goal Card
  goalCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  goalInfo: {
    flex: 1,
  },
  goalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  goalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  goalSlider: {
    flexDirection: 'row',
    gap: 8,
  },
  goalOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  goalOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // History Card
  historyCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Chart
  chartContainer: {
    marginBottom: 16,
  },
  chartLabels: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  chartLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  // Summary
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 12,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  // Health Card
  healthCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  healthTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  healthDescription: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  healthOptions: {
    gap: 10,
  },
  healthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  healthButtonText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  healthStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  healthStatusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  // Projection Card
  projectionCard: {
    borderRadius: 16,
    padding: 20,
  },
  projectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  projectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  projectionStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 16,
  },
  projectionItem: {
    alignItems: 'center',
  },
  projectionValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  projectionLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  projectionNote: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  // Delete History Section
  deleteHistorySection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  deleteHistoryTitle: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  deleteButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: '#FEF2F2',
  },
  deleteAllButton: {
    backgroundColor: '#FEE2E2',
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
});

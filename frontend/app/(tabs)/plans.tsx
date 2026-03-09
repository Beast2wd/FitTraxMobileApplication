import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import { useUserStore } from '../../stores/userStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

const GOAL_IMAGES: { [key: string]: string } = {
  'weight_loss': 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800&q=80',
  'muscle_gain': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80',
  'endurance': 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800&q=80',
  'flexibility': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=800&q=80',
  'tone': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80',
  'general': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80',
};

const GOAL_COLORS: { [key: string]: string } = {
  'weight_loss': '#EF4444',
  'muscle_gain': '#3B82F6',
  'endurance': '#10B981',
  'flexibility': '#8B5CF6',
  'tone': '#F59E0B',
  'general': '#EC4899',
};

const GOAL_ICONS: { [key: string]: string } = {
  'weight_loss': 'flame',
  'muscle_gain': 'barbell',
  'endurance': 'pulse',
  'flexibility': 'body',
  'tone': 'fitness',
  'general': 'heart',
};

const WORKOUT_TYPE_IMAGES: { [key: string]: string } = {
  'HIIT Cardio': 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=400&q=80',
  'Full Body Circuit': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80',
  'Cardio & Core': 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=400&q=80',
  'Metabolic Conditioning': 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=400&q=80',
  'Active Recovery': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80',
  'Upper Body Push': 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400&q=80',
  'Lower Body': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400&q=80',
  'Upper Body Pull': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=400&q=80',
  'Full Body Strength': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80',
  'Arms & Shoulders': 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400&q=80',
  'Long Cardio': 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&q=80',
  'Interval Training': 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=400&q=80',
  'Circuit Training': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80',
  'Tempo Run': 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=400&q=80',
  'Cross Training': 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400&q=80',
  'Yoga Flow': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80',
  'Dynamic Stretching': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80',
  'Mobility Work': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80',
  'Recovery Session': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80',
  'Balance Training': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80',
  'Total Body Toning': 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&q=80',
  'Lower Body Sculpt': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400&q=80',
  'Upper Body Definition': 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400&q=80',
  'Core & Cardio': 'https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=400&q=80',
  'Full Body HIIT': 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=400&q=80',
  'Cardio Mix': 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=400&q=80',
  'Strength Training': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80',
  'Flexibility': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80',
  'HIIT': 'https://images.unsplash.com/photo-1601422407692-ec4eeec1d9b3?w=400&q=80',
};

interface WorkoutCompletion {
  workoutIndex: number;
  workoutName: string;
  completedDate: string;
  completedAt: string;
}

const getTodayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month, 1).getDay();
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PlansScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const router = useRouter();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [fitnessPreferences, setFitnessPreferences] = useState<any>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutCompletion[]>([]);
  const [expandedWorkout, setExpandedWorkout] = useState<number | null>(null);
  
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  const loadData = useCallback(async () => {
    try {
      const planData = await AsyncStorage.getItem('@fittrax_generated_plan');
      const prefsData = await AsyncStorage.getItem('@fittrax_fitness_preferences');
      const historyData = await AsyncStorage.getItem('@fittrax_workout_history');
      
      if (planData) {
        setGeneratedPlan(JSON.parse(planData));
      }
      if (prefsData) {
        setFitnessPreferences(JSON.parse(prefsData));
      }
      if (historyData) {
        setWorkoutHistory(JSON.parse(historyData));
      }
    } catch (error) {
      console.error('Error loading plan data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const isWorkoutCompletedToday = (workoutIndex: number) => {
    const today = getTodayString();
    return workoutHistory.some(h => h.workoutIndex === workoutIndex && h.completedDate === today);
  };

  const getCompletedDates = () => {
    return workoutHistory.map(h => h.completedDate);
  };

  const handleCompleteWorkout = async (workoutIndex: number, workoutName: string) => {
    try {
      const today = getTodayString();
      const newCompletion: WorkoutCompletion = {
        workoutIndex,
        workoutName,
        completedDate: today,
        completedAt: new Date().toISOString(),
      };
      
      const updatedHistory = [...workoutHistory, newCompletion];
      setWorkoutHistory(updatedHistory);
      await AsyncStorage.setItem('@fittrax_workout_history', JSON.stringify(updatedHistory));
      Alert.alert('Great Job! 💪', `${workoutName} marked as complete for today!`);
    } catch (error) {
      console.error('Error marking workout complete:', error);
    }
  };

  const handleResetWorkout = async (workoutIndex: number) => {
    Alert.alert(
      'Reset Workout',
      'This will remove today\'s completion for this workout. You can complete it again on another day.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const today = getTodayString();
            const updatedHistory = workoutHistory.filter(
              h => !(h.workoutIndex === workoutIndex && h.completedDate === today)
            );
            setWorkoutHistory(updatedHistory);
            await AsyncStorage.setItem('@fittrax_workout_history', JSON.stringify(updatedHistory));
          }
        }
      ]
    );
  };

  const handleResetWeekWorkouts = () => {
    Alert.alert(
      'Reset This Week\'s Workouts',
      'This will clear all workout completions from this week so you can redo them.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Week',
          style: 'destructive',
          onPress: async () => {
            const now = new Date();
            const dayOfWeek = now.getDay();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - dayOfWeek);
            startOfWeek.setHours(0, 0, 0, 0);
            
            const updatedHistory = workoutHistory.filter(h => {
              const completedDate = new Date(h.completedDate);
              return completedDate < startOfWeek;
            });
            
            setWorkoutHistory(updatedHistory);
            await AsyncStorage.setItem('@fittrax_workout_history', JSON.stringify(updatedHistory));
            Alert.alert('Week Reset', 'Your workouts for this week have been reset.');
          }
        }
      ]
    );
  };

  const handleResetPlan = () => {
    Alert.alert(
      'Reset Entire Plan',
      'This will delete your current fitness plan and all workout history. You can create a new one from Fitness Goals.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Everything',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('@fittrax_generated_plan');
            await AsyncStorage.removeItem('@fittrax_fitness_preferences');
            await AsyncStorage.removeItem('@fittrax_workout_history');
            setGeneratedPlan(null);
            setFitnessPreferences(null);
            setWorkoutHistory([]);
          }
        }
      ]
    );
  };

  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const getWorkoutImage = (workoutName: string, goal: string) => {
    return WORKOUT_TYPE_IMAGES[workoutName] || GOAL_IMAGES[goal] || GOAL_IMAGES['general'];
  };

  const getWeekProgress = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    
    const weekCompletions = workoutHistory.filter(h => {
      const completedDate = new Date(h.completedDate);
      return completedDate >= startOfWeek;
    });
    
    const uniqueDays = new Set(weekCompletions.map(h => h.completedDate));
    return uniqueDays.size;
  };

  const renderCalendar = () => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const completedDates = getCompletedDates();
    const today = getTodayString();
    
    const days = [];
    
    for (let i = 0; i < firstDay; i++) {
      days.push(<View key={`empty-${i}`} style={styles.calendarDay} />);
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isCompleted = completedDates.includes(dateString);
      const isToday = dateString === today;
      
      days.push(
        <View key={day} style={styles.calendarDay}>
          <View style={[
            styles.calendarDayInner,
            isToday && [styles.calendarDayToday, { borderColor: accent.primary }]
          ]}>
            <Text style={[
              styles.calendarDayText,
              { color: isToday ? accent.primary : colors.text.primary }
            ]}>
              {day}
            </Text>
            {isCompleted && (
              <View style={styles.completedDotCalendar} />
            )}
          </View>
        </View>
      );
    }
    
    return days;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent.primary} />
          <Text style={[styles.loadingText, { color: colors.text.secondary }]}>Loading your plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!generatedPlan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text.primary }]}>My Plan</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Your personalized fitness journey
            </Text>
          </View>

          <View style={[styles.emptyState, { backgroundColor: colors.background.card }]}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80' }}
              style={styles.emptyImage}
              resizeMode="cover"
            />
            <View style={styles.emptyOverlay}>
              <View style={[styles.emptyIconContainer, { backgroundColor: `${accent.primary}30` }]}>
                <Ionicons name="sparkles" size={40} color={accent.primary} />
              </View>
              <Text style={styles.emptyTitle}>No Plan Yet</Text>
              <Text style={styles.emptySubtitle}>
                Let our AI Fitness Coach create a personalized workout plan based on your goals
              </Text>
              <TouchableOpacity
                style={styles.createPlanButton}
                onPress={() => router.push('/fitness-goals')}
              >
                <LinearGradient
                  colors={accent.gradient as [string, string]}
                  style={styles.createPlanGradient}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                  <Text style={styles.createPlanText}>Create My Plan</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const goalColor = GOAL_COLORS[generatedPlan.goal] || accent.primary;
  const goalIcon = GOAL_ICONS[generatedPlan.goal] || 'fitness';
  const goalImage = GOAL_IMAGES[generatedPlan.goal] || GOAL_IMAGES['general'];
  const weekProgress = getWeekProgress();
  const totalDaysPerWeek = generatedPlan.days_per_week || 3;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.text.primary }]}>My Plan</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Your AI-powered fitness journey
            </Text>
          </View>
          <TouchableOpacity style={styles.menuButton} onPress={handleResetPlan}>
            <Ionicons name="ellipsis-vertical" size={20} color={colors.text.muted} />
          </TouchableOpacity>
        </View>

        <View style={styles.planHeroCard}>
          <Image 
            source={{ uri: goalImage }}
            style={styles.planHeroImage}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.planHeroOverlay}
          >
            <View style={[styles.planBadge, { backgroundColor: `${goalColor}30` }]}>
              <Ionicons name={goalIcon as any} size={20} color={goalColor} />
              <Text style={[styles.planBadgeText, { color: goalColor }]}>
                {fitnessPreferences?.goalTitle || 'Fitness Plan'}
              </Text>
            </View>
            <Text style={styles.planHeroTitle}>{generatedPlan.name}</Text>
            <Text style={styles.planHeroDescription}>{generatedPlan.description}</Text>
          </LinearGradient>
        </View>

        <View style={[styles.calendarCard, { backgroundColor: colors.background.card }]}>
          <View style={styles.calendarHeader}>
            <Text style={[styles.calendarTitle, { color: colors.text.primary }]}>
              Workout Schedule
            </Text>
            <View style={styles.calendarLegend}>
              <View style={styles.legendDot} />
              <Text style={[styles.legendText, { color: colors.text.muted }]}>Completed</Text>
            </View>
          </View>
          
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={goToPreviousMonth} style={styles.monthNavButton}>
              <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: colors.text.primary }]}>
              {MONTH_NAMES[currentMonth]} {currentYear}
            </Text>
            <TouchableOpacity onPress={goToNextMonth} style={styles.monthNavButton}>
              <Ionicons name="chevron-forward" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.dayHeaders}>
            {DAY_NAMES.map(day => (
              <Text key={day} style={[styles.dayHeader, { color: colors.text.muted }]}>{day}</Text>
            ))}
          </View>
          
          <View style={styles.calendarGrid}>
            {renderCalendar()}
          </View>
          
          <View style={[styles.weekStats, { borderTopColor: colors.border.secondary }]}>
            <View style={styles.weekStatItem}>
              <Text style={[styles.weekStatValue, { color: goalColor }]}>{weekProgress}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.text.muted }]}>This Week</Text>
            </View>
            <View style={styles.weekStatItem}>
              <Text style={[styles.weekStatValue, { color: colors.text.primary }]}>{totalDaysPerWeek}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.text.muted }]}>Weekly Goal</Text>
            </View>
            <View style={styles.weekStatItem}>
              <Text style={[styles.weekStatValue, { color: colors.text.primary }]}>{workoutHistory.length}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.text.muted }]}>Total</Text>
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.resetWeekButton, { borderColor: colors.border.secondary }]}
            onPress={handleResetWeekWorkouts}
          >
            <Ionicons name="refresh" size={16} color={colors.text.muted} />
            <Text style={[styles.resetWeekText, { color: colors.text.muted }]}>Reset This Week</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.detailsCard, { backgroundColor: colors.background.card }]}>
          <View style={styles.detailsRow}>
            <View style={styles.detailItem}>
              <Ionicons name="calendar" size={22} color={goalColor} />
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {generatedPlan.duration_weeks} weeks
              </Text>
              <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Duration</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="repeat" size={22} color={goalColor} />
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {generatedPlan.days_per_week} days
              </Text>
              <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Per Week</Text>
            </View>
            <View style={styles.detailItem}>
              <Ionicons name="trending-up" size={22} color={goalColor} />
              <Text style={[styles.detailValue, { color: colors.text.primary }]}>
                {generatedPlan.level}
              </Text>
              <Text style={[styles.detailLabel, { color: colors.text.muted }]}>Level</Text>
            </View>
          </View>
          <View style={[styles.equipmentRow, { borderTopColor: colors.border.secondary }]}>
            <Ionicons name="barbell-outline" size={18} color={colors.text.muted} />
            <Text style={[styles.equipmentText, { color: colors.text.secondary }]}>
              {generatedPlan.equipment}
            </Text>
          </View>
        </View>

        <View style={styles.scheduleSection}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
            Weekly Workouts
          </Text>
          
          {generatedPlan.workouts?.map((workout: any, index: number) => {
            const isCompletedToday = isWorkoutCompletedToday(index);
            const isExpanded = expandedWorkout === index;
            const workoutImage = getWorkoutImage(workout.name, generatedPlan.goal);
            
            return (
              <View 
                key={index} 
                style={[
                  styles.workoutCard, 
                  { backgroundColor: colors.background.card },
                  isCompletedToday && styles.workoutCardCompleted
                ]}
              >
                <TouchableOpacity 
                  onPress={() => setExpandedWorkout(isExpanded ? null : index)}
                  activeOpacity={0.9}
                >
                  <Image 
                    source={{ uri: workoutImage }}
                    style={styles.workoutImage}
                    resizeMode="cover"
                  />
                  <View style={styles.workoutOverlay}>
                    <View style={styles.workoutHeader}>
                      <View style={[styles.dayBadge, { backgroundColor: isCompletedToday ? '#10B981' : goalColor }]}>
                        <Text style={styles.dayBadgeText}>Day {workout.day}</Text>
                      </View>
                      {isCompletedToday && (
                        <View style={styles.completedBadge}>
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                          <Text style={styles.completedText}>Done Today</Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.workoutTitleRow}>
                      <Text style={styles.workoutName}>{workout.name}</Text>
                      <Ionicons 
                        name={isExpanded ? "chevron-up" : "chevron-down"} 
                        size={24} 
                        color="#fff" 
                      />
                    </View>
                    
                    <View style={styles.workoutMeta}>
                      <View style={styles.workoutMetaItem}>
                        <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.workoutMetaText}>{workout.duration}</Text>
                      </View>
                      <View style={styles.workoutMetaItem}>
                        <Ionicons name="list-outline" size={16} color="rgba(255,255,255,0.8)" />
                        <Text style={styles.workoutMetaText}>{workout.exercises?.length || 0} exercises</Text>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>

                {isExpanded && workout.exercises && (
                  <View style={[styles.exercisesList, { backgroundColor: colors.background.elevated }]}>
                    {workout.exercises.map((exercise: any, exIndex: number) => (
                      <View 
                        key={exIndex} 
                        style={[
                          styles.exerciseItem, 
                          { borderLeftColor: goalColor },
                          exIndex < workout.exercises.length - 1 && styles.exerciseItemBorder
                        ]}
                      >
                        <View style={styles.exerciseMain}>
                          <Text style={[styles.exerciseName, { color: colors.text.primary }]}>
                            {exercise.name}
                          </Text>
                          <View style={styles.exerciseDetails}>
                            <View style={styles.exerciseDetail}>
                              <Ionicons name="layers-outline" size={14} color={goalColor} />
                              <Text style={[styles.exerciseDetailText, { color: colors.text.secondary }]}>
                                {exercise.sets} sets
                              </Text>
                            </View>
                            <View style={styles.exerciseDetail}>
                              <Ionicons name="repeat-outline" size={14} color={goalColor} />
                              <Text style={[styles.exerciseDetailText, { color: colors.text.secondary }]}>
                                {exercise.reps}
                              </Text>
                            </View>
                            {exercise.rest !== '-' && (
                              <View style={styles.exerciseDetail}>
                                <Ionicons name="timer-outline" size={14} color={goalColor} />
                                <Text style={[styles.exerciseDetailText, { color: colors.text.secondary }]}>
                                  {exercise.rest} rest
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                    ))}
                    
                    <View style={styles.workoutActions}>
                      {!isCompletedToday ? (
                        <TouchableOpacity
                          style={[styles.completeButtonExpanded, { backgroundColor: goalColor }]}
                          onPress={() => handleCompleteWorkout(index, workout.name)}
                        >
                          <Ionicons name="checkmark" size={18} color="#fff" />
                          <Text style={styles.completeButtonText}>Mark Workout Complete</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.resetButtonExpanded, { borderColor: goalColor }]}
                          onPress={() => handleResetWorkout(index)}
                        >
                          <Ionicons name="refresh" size={18} color={goalColor} />
                          <Text style={[styles.resetButtonText, { color: goalColor }]}>Reset Today's Completion</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )}
                
                {!isExpanded && (
                  <View style={styles.collapsedActions}>
                    <TouchableOpacity
                      style={[styles.viewExercisesButton, { borderColor: goalColor }]}
                      onPress={() => setExpandedWorkout(index)}
                    >
                      <Text style={[styles.viewExercisesText, { color: goalColor }]}>View Exercises</Text>
                      <Ionicons name="chevron-down" size={16} color={goalColor} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.background.card }]}
            onPress={() => router.push('/weight-training')}
          >
            <MaterialCommunityIcons name="dumbbell" size={24} color={accent.primary} />
            <Text style={[styles.actionButtonText, { color: colors.text.primary }]}>Log Custom Workout</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.background.card }]}
            onPress={() => router.push('/fitness-goals')}
          >
            <Ionicons name="sparkles" size={24} color={accent.primary} />
            <Text style={[styles.actionButtonText, { color: colors.text.primary }]}>Create New Plan</Text>
            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(128,128,128,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  emptyImage: {
    width: '100%',
    height: 200,
  },
  emptyOverlay: {
    padding: 24,
    alignItems: 'center',
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  createPlanButton: {
    borderRadius: 12,
    overflow: 'hidden',
    width: '100%',
  },
  createPlanGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  createPlanText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  planHeroCard: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 200,
    marginBottom: 16,
  },
  planHeroImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  planHeroOverlay: {
    flex: 1,
    padding: 20,
    justifyContent: 'flex-end',
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 12,
  },
  planBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  planHeroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 6,
  },
  planHeroDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
  },
  calendarCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  calendarLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  legendText: {
    fontSize: 13,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthNavButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    width: (width - 64) / 7,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: (width - 64) / 7,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarDayInner: {
    width: 36,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  calendarDayToday: {
    borderWidth: 2,
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '500',
  },
  completedDotCalendar: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
    marginTop: 2,
  },
  weekStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 16,
    marginTop: 12,
    borderTopWidth: 1,
  },
  weekStatItem: {
    alignItems: 'center',
  },
  weekStatValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  weekStatLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  resetWeekButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  resetWeekText: {
    fontSize: 13,
    fontWeight: '500',
  },
  detailsCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  detailItem: {
    alignItems: 'center',
    gap: 6,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  detailLabel: {
    fontSize: 12,
  },
  equipmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  equipmentText: {
    fontSize: 14,
  },
  scheduleSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  workoutCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  workoutCardCompleted: {
    opacity: 0.85,
  },
  workoutImage: {
    width: '100%',
    height: 160,
  },
  workoutOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 160,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 16,
    justifyContent: 'space-between',
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dayBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  completedText: {
    color: '#10B981',
    fontSize: 14,
    fontWeight: '600',
  },
  workoutTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workoutName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  workoutMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  workoutMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workoutMetaText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  exercisesList: {
    padding: 16,
  },
  exerciseItem: {
    paddingLeft: 12,
    paddingVertical: 12,
    borderLeftWidth: 3,
  },
  exerciseItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  exerciseMain: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  exerciseDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  exerciseDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  exerciseDetailText: {
    fontSize: 13,
  },
  workoutActions: {
    marginTop: 16,
  },
  completeButtonExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  resetButtonExpanded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  collapsedActions: {
    padding: 12,
    paddingTop: 170,
  },
  viewExercisesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  viewExercisesText: {
    fontSize: 15,
    fontWeight: '600',
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionsSection: {
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 14,
  },
  actionButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});

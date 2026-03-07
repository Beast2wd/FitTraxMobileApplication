import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  ScrollView,
  Modal,
  Dimensions,
  Platform,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import { plansAPI } from '../services/api';
import * as Notifications from 'expo-notifications';
import { format, addDays, isToday, isTomorrow, isYesterday } from 'date-fns';
import { router } from 'expo-router';
import axios from 'axios';
import { GestureHandlerRootView, Swipeable } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Generate time options for picker
const generateTimeOptions = () => {
  const options = [];
  for (let h = 5; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hour = h.toString().padStart(2, '0');
      const minute = m.toString().padStart(2, '0');
      const time = `${hour}:${minute}`;
      const label = `${h > 12 ? h - 12 : (h === 0 ? 12 : h)}:${minute} ${h >= 12 ? 'PM' : 'AM'}`;
      options.push({ value: time, label });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Generate day options for picker
const DAY_OPTIONS = Array.from({ length: 7 }, (_, i) => ({
  value: (i + 1).toString(),
  label: `Day ${i + 1}`,
}));

export default function ScheduleScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const today = format(new Date(), 'yyyy-MM-dd');
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(today);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<any[]>([]);
  const [completedWorkouts, setCompletedWorkouts] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [rescheduleModalVisible, setRescheduleModalVisible] = useState(false);
  const [customWorkoutModalVisible, setCustomWorkoutModalVisible] = useState(false);
  const [completedWorkoutModalVisible, setCompletedWorkoutModalVisible] = useState(false);
  const [selectedCompletedWorkout, setSelectedCompletedWorkout] = useState<any>(null);
  const [allPlans, setAllPlans] = useState<any[]>([]);
  const [userPlans, setUserPlans] = useState<any[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [selectedDay, setSelectedDay] = useState('1');
  const [time, setTime] = useState('08:00');
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [workoutToReschedule, setWorkoutToReschedule] = useState<any>(null);
  const [newScheduleDate, setNewScheduleDate] = useState('');
  
  // Workout detail modal state
  const [workoutDetailModalVisible, setWorkoutDetailModalVisible] = useState(false);
  const [selectedWorkoutDetail, setSelectedWorkoutDetail] = useState<any>(null);
  const [editingWorkout, setEditingWorkout] = useState(false);
  const [editedWorkoutTime, setEditedWorkoutTime] = useState('');
  const [editedReminderOption, setEditedReminderOption] = useState<string>('30min');
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Reminder options
  const REMINDER_OPTIONS = [
    { id: 'none', label: 'No reminder', minutes: 0 },
    { id: '5min', label: '5 minutes before', minutes: 5 },
    { id: '10min', label: '10 minutes before', minutes: 10 },
    { id: '15min', label: '15 minutes before', minutes: 15 },
    { id: '30min', label: '30 minutes before', minutes: 30 },
    { id: '1hour', label: '1 hour before', minutes: 60 },
    { id: '2hours', label: '2 hours before', minutes: 120 },
    { id: '1day', label: '1 day before', minutes: 1440 },
    { id: '2days', label: '2 days before', minutes: 2880 },
    { id: '1week', label: '1 week before', minutes: 10080 },
  ];
  
  // Custom workout state
  const [customWorkoutName, setCustomWorkoutName] = useState('');
  const [customExercises, setCustomExercises] = useState<{name: string, sets: string, reps: string}[]>([
    { name: '', sets: '3', reps: '10' }
  ]);
  
  // Expanded picker states (inline expansion instead of separate modals)
  const [planExpanded, setPlanExpanded] = useState(false);
  const [dayExpanded, setDayExpanded] = useState(false);
  const [timeExpanded, setTimeExpanded] = useState(false);

  const colors = theme.colors;
  const accent = theme.accentColors;
  const swipeableRefs = useRef<{ [key: string]: Swipeable | null }>({});

  useEffect(() => {
    if (userId) {
      loadData();
      requestNotificationPermissions();
    } else {
      setLoading(false);
    }
  }, [userId]);

  const requestNotificationPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load AI-generated workout history from AsyncStorage
      let aiWorkoutHistory: any[] = [];
      try {
        const historyData = await AsyncStorage.getItem('@fittrax_workout_history');
        if (historyData) {
          aiWorkoutHistory = JSON.parse(historyData);
        }
      } catch (e) {
        console.log('No AI workout history found');
      }
      
      // If no userId, just use AI workout history
      if (!userId) {
        const aiWorkoutsFormatted = aiWorkoutHistory.map((h: any) => ({
          id: `ai_${h.completedDate}_${h.workoutIndex}`,
          workout_name: h.workoutName,
          timestamp: h.completedDate, // Use completedDate as timestamp for calendar
          completed_at: h.completedAt,
          source: 'ai_plan',
          exercises: [],
        }));
        setCompletedWorkouts(aiWorkoutsFormatted);
        setLoading(false);
        return;
      }
      
      let plansData = { plans: [] };
      let userPlansData = { user_plans: [] };
      let scheduledData = { scheduled_workouts: [] };
      let backendWorkouts: any[] = [];
      
      try {
        const results = await Promise.all([
          plansAPI.getWorkoutPlans().catch(() => ({ plans: [] })),
          plansAPI.getUserPlans(userId, 'active').catch(() => ({ user_plans: [] })),
          fetch(`${API_URL}/api/scheduled-workouts/${userId}`).then(r => r.json()).catch(() => ({ scheduled_workouts: [] })),
          axios.get(`${API_URL}/api/weight-training/history/${userId}?days=90`).catch(() => ({ data: { workouts: [] } })),
        ]);
        
        plansData = results[0] || { plans: [] };
        userPlansData = results[1] || { user_plans: [] };
        scheduledData = results[2] || { scheduled_workouts: [] };
        backendWorkouts = results[3]?.data?.workouts || [];
      } catch (e) {
        console.log('Error fetching data from backend:', e);
      }
      
      const allAvailablePlans = [
        ...(plansData.plans || []).map((p: any, index: number) => ({ 
          ...p, 
          type: 'template',
          unique_id: `template_${p.plan_id || index}`
        })),
        ...(userPlansData.user_plans || []).map((p: any, index: number) => ({ 
          plan_id: p.plan_id,
          name: p.plan_details?.name || 'Custom Plan',
          type: 'user',
          unique_id: `user_${p.plan_id || index}`
        })),
      ];
      setAllPlans(allAvailablePlans);
      setUserPlans(userPlansData.user_plans || []);
      setScheduledWorkouts(scheduledData.scheduled_workouts || []);
      
      // Convert AI workout history to match the completedWorkouts format
      // Note: timestamp is used by the calendar marking logic
      const aiWorkoutsFormatted = aiWorkoutHistory.map((h: any) => ({
        id: `ai_${h.completedDate}_${h.workoutIndex}`,
        workout_name: h.workoutName,
        timestamp: h.completedDate, // Use completedDate as timestamp for calendar
        completed_at: h.completedAt,
        source: 'ai_plan',
        exercises: [],
      }));
      
      // Combine both sources
      const allCompletedWorkouts = [...backendWorkouts, ...aiWorkoutsFormatted];
      setCompletedWorkouts(allCompletedWorkouts);
    } catch (error) {
      console.error('Error loading schedule data:', error);
    } finally {
      setLoading(false);
    }
  };

  const scheduleNotification = async (date: string, timeStr: string, minutesBefore: number, workoutName: string) => {
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const scheduledTime = new Date(date + 'T00:00:00');
      scheduledTime.setHours(hours, minutes, 0, 0);
      
      const notificationTime = new Date(scheduledTime.getTime() - minutesBefore * 60000);
      const now = new Date();

      if (notificationTime > now) {
        const secondsFromNow = Math.floor((notificationTime.getTime() - now.getTime()) / 1000);
        
        const identifier = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Workout Reminder! 💪',
            body: `${workoutName} starts in ${minutesBefore} minutes`,
            sound: true,
            data: { date, time: timeStr },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: secondsFromNow,
          },
        });
        return identifier;
      }
    } catch (error) {
      console.log('Could not schedule notification:', error);
    }
    return null;
  };

  const openAddWorkoutModal = () => {
    setSelectedDate(today);
    setSelectedPlan('');
    setSelectedDay('1');
    setTime('08:00');
    setPlanExpanded(false);
    setDayExpanded(false);
    setTimeExpanded(false);
    setModalVisible(true);
  };

  const openCustomWorkoutModal = () => {
    // Close all pickers first
    setPlanExpanded(false);
    setDayExpanded(false);
    setTimeExpanded(false);
    // Reset custom workout form
    setCustomWorkoutName('');
    setCustomExercises([{ name: '', sets: '3', reps: '10' }]);
    // Close main modal first, then open custom workout modal after a delay
    setModalVisible(false);
    setTimeout(() => {
      setCustomWorkoutModalVisible(true);
    }, 350);
  };

  const addExercise = () => {
    setCustomExercises([...customExercises, { name: '', sets: '3', reps: '10' }]);
  };

  const removeExercise = (index: number) => {
    if (customExercises.length > 1) {
      setCustomExercises(customExercises.filter((_, i) => i !== index));
    }
  };

  const updateExercise = (index: number, field: 'name' | 'sets' | 'reps', value: string) => {
    const updated = [...customExercises];
    updated[index][field] = value;
    setCustomExercises(updated);
  };

  const handleCreateCustomWorkout = async () => {
    if (!customWorkoutName.trim()) {
      Alert.alert('Error', 'Please enter a workout name');
      return;
    }

    const validExercises = customExercises.filter(e => e.name.trim());
    if (validExercises.length === 0) {
      Alert.alert('Error', 'Please add at least one exercise');
      return;
    }

    try {
      // Create a custom plan
      const customPlanId = `custom_${Date.now()}`;
      const customPlan = {
        plan_id: customPlanId,
        name: customWorkoutName.trim(),
        type: 'custom',
        exercises: validExercises.map(e => ({
          name: e.name.trim(),
          sets: parseInt(e.sets) || 3,
          reps: parseInt(e.reps) || 10,
        })),
      };

      // Save to backend
      await fetch(`${API_URL}/api/custom-workout-plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          plan_id: customPlanId,
          name: customWorkoutName.trim(),
          exercises: customPlan.exercises,
        }),
      });

      // Add to local plans list and select it
      setAllPlans([...allPlans, customPlan]);
      setSelectedPlan(customPlanId);
      setCustomWorkoutModalVisible(false);
      
      Alert.alert('Success', 'Custom workout created!');
    } catch (error) {
      console.error('Error creating custom workout:', error);
      // Even if backend fails, add locally
      const customPlanId = `custom_${Date.now()}`;
      const customPlan = {
        plan_id: customPlanId,
        name: customWorkoutName.trim(),
        type: 'custom',
      };
      setAllPlans([...allPlans, customPlan]);
      setSelectedPlan(customPlanId);
      setCustomWorkoutModalVisible(false);
    }
  };

  const handleScheduleWorkout = async () => {
    if (!selectedPlan) {
      Alert.alert('Error', 'Please select a workout plan');
      return;
    }

    try {
      const scheduledId = `scheduled_${Date.now()}`;
      const planDetails = allPlans.find(p => p.plan_id === selectedPlan);
      const planName = planDetails?.name || 'Workout';
      
      const response = await fetch(`${API_URL}/api/scheduled-workouts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_id: scheduledId,
          user_id: userId,
          workout_plan_id: selectedPlan,
          workout_day: parseInt(selectedDay),
          scheduled_date: selectedDate,
          scheduled_time: time,
          reminder_enabled: reminderEnabled,
          reminder_minutes_before: reminderMinutes,
          completed: false,
          notes: '',
        }),
      });

      if (response.ok) {
        if (reminderEnabled) {
          await scheduleNotification(selectedDate, time, reminderMinutes, planName);
        }
        Alert.alert('Success', `Workout scheduled for ${formatDateLabel(selectedDate)} at ${formatTime(time)}!`);
        setModalVisible(false);
        loadData();
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to schedule workout');
    }
  };

  const handleCompleteWorkout = async (scheduledId: string) => {
    try {
      await fetch(
        `${API_URL}/api/scheduled-workouts/${scheduledId}?completed=true`,
        { method: 'PUT' }
      );
      loadData();
      Alert.alert('Great job! 🎉', 'Workout marked as complete!');
    } catch (error) {
      Alert.alert('Error', 'Failed to update workout');
    }
  };

  const handleDeleteWorkout = async (scheduledId: string) => {
    try {
      await fetch(
        `${API_URL}/api/scheduled-workouts/${scheduledId}`,
        { method: 'DELETE' }
      );
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to delete workout');
    }
  };

  const confirmDeleteWorkout = (scheduledId: string) => {
    Alert.alert(
      'Delete Workout',
      'Are you sure you want to delete this scheduled workout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteWorkout(scheduledId),
        },
      ]
    );
  };

  const openRescheduleModal = (workout: any) => {
    setWorkoutToReschedule(workout);
    setNewScheduleDate(workout.scheduled_date);
    setRescheduleModalVisible(true);
  };

  const handleRescheduleWorkout = async () => {
    if (!workoutToReschedule || !newScheduleDate) return;

    try {
      await fetch(
        `${API_URL}/api/scheduled-workouts/${workoutToReschedule.scheduled_id}/reschedule`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_date: newScheduleDate }),
        }
      );
      
      Alert.alert('Success', `Workout moved to ${formatDateLabel(newScheduleDate)}`);
      setRescheduleModalVisible(false);
      setWorkoutToReschedule(null);
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to reschedule workout');
    }
  };

  // Open workout detail modal
  const openWorkoutDetail = (workout: any) => {
    setSelectedWorkoutDetail(workout);
    setEditedWorkoutTime(workout.scheduled_time || '08:00');
    setEditedReminderOption(workout.reminder_option || '30min');
    setEditingWorkout(false);
    setShowTimePicker(false);
    setShowReminderPicker(false);
    setWorkoutDetailModalVisible(true);
  };

  // Schedule notification for workout
  const scheduleWorkoutNotification = async (workout: any, reminderMinutes: number) => {
    if (reminderMinutes === 0) return; // No notification

    try {
      const scheduledDate = new Date(`${workout.scheduled_date}T${workout.scheduled_time || '08:00'}:00`);
      const notificationTime = new Date(scheduledDate.getTime() - reminderMinutes * 60 * 1000);
      
      // Only schedule if notification time is in the future
      if (notificationTime > new Date()) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `Workout Reminder: ${workout.title || 'Workout'}`,
            body: `Your workout is scheduled ${reminderMinutes >= 60 
              ? `in ${Math.floor(reminderMinutes / 60)} hour${Math.floor(reminderMinutes / 60) > 1 ? 's' : ''}` 
              : `in ${reminderMinutes} minutes`}`,
            data: { workoutId: workout.workout_id || workout.scheduled_id },
          },
          trigger: {
            type: 'date',
            date: notificationTime,
          } as any,
        });
      }
    } catch (error) {
      console.error('Error scheduling notification:', error);
    }
  };

  // Update scheduled workout
  const updateScheduledWorkout = async () => {
    if (!selectedWorkoutDetail) return;
    
    try {
      const workoutId = selectedWorkoutDetail.scheduled_id || selectedWorkoutDetail.workout_id;
      const reminderOption = REMINDER_OPTIONS.find(r => r.id === editedReminderOption);
      
      console.log('Updating workout:', workoutId, 'with time:', editedWorkoutTime);
      
      const response = await fetch(`${API_URL}/api/scheduled-workout/${workoutId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduled_time: editedWorkoutTime,
          reminder_option: editedReminderOption,
          reminder_minutes: reminderOption?.minutes || 0,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Update failed:', errorData);
        throw new Error(errorData.detail || 'Failed to update workout');
      }
      
      const result = await response.json();
      console.log('Update result:', result);
      
      // Schedule the notification
      if (reminderOption && reminderOption.minutes > 0) {
        await scheduleWorkoutNotification(
          { ...selectedWorkoutDetail, scheduled_time: editedWorkoutTime },
          reminderOption.minutes
        );
      }
      
      Alert.alert('Success', 'Workout time and reminder updated!');
      setWorkoutDetailModalVisible(false);
      setEditingWorkout(false);
      setShowTimePicker(false);
      setShowReminderPicker(false);
      await loadData(); // Reload data to show updated time
    } catch (error: any) {
      console.error('Error updating workout:', error);
      Alert.alert('Error', error.message || 'Failed to update workout');
    }
  };

  // Delete a completed workout from calendar
  const handleDeleteCompletedWorkout = async (workoutId: string) => {
    Alert.alert(
      'Delete Workout',
      'Are you sure you want to remove this completed workout from your calendar?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/scheduled-workouts/${workoutId}`, {
                method: 'DELETE',
              });
              setScheduledWorkouts(scheduledWorkouts.filter(w => 
                w.workout_id !== workoutId && w.scheduled_id !== workoutId
              ));
              Alert.alert('Deleted', 'Workout removed from calendar');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete workout');
            }
          },
        },
      ]
    );
  };

  // View completed workout details
  const viewCompletedWorkout = (workout: any) => {
    setSelectedCompletedWorkout(workout);
    setCompletedWorkoutModalVisible(true);
  };

  const formatDateLabel = (dateString: string) => {
    if (!dateString) return 'Select date';
    try {
      const date = new Date(dateString + 'T12:00:00');
      if (isNaN(date.getTime())) return dateString;
      if (isToday(date)) return 'Today';
      if (isTomorrow(date)) return 'Tomorrow';
      if (isYesterday(date)) return 'Yesterday';
      return format(date, 'EEE, MMM d');
    } catch {
      return dateString;
    }
  };

  const formatTime = (timeStr: string | undefined) => {
    if (!timeStr) return '';
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      const period = h >= 12 ? 'PM' : 'AM';
      return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
    } catch {
      return timeStr;
    }
  };

  const getSelectedPlanName = () => {
    if (!selectedPlan) return 'Tap to select...';
    const plan = allPlans.find(p => p.plan_id === selectedPlan);
    return plan?.name || 'Unknown Plan';
  };

  const quickDateOptions = [
    { label: 'Today', date: format(new Date(), 'yyyy-MM-dd') },
    { label: 'Tomorrow', date: format(addDays(new Date(), 1), 'yyyy-MM-dd') },
    { label: '+2 Days', date: format(addDays(new Date(), 2), 'yyyy-MM-dd') },
    { label: '+3 Days', date: format(addDays(new Date(), 3), 'yyyy-MM-dd') },
  ];

  // Render swipe delete action
  const renderRightActions = (scheduledId: string) => {
    return (
      <TouchableOpacity
        style={[localStyles.deleteAction, { backgroundColor: colors.status.error }]}
        onPress={() => confirmDeleteWorkout(scheduledId)}
      >
        <Ionicons name="trash" size={24} color="#fff" />
        <Text style={localStyles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  // Build marked dates for calendar
  const markedDates = (() => {
    const marks: any = {};
    
    scheduledWorkouts.forEach((workout, index) => {
      const date = workout.scheduled_date;
      if (!date) return; // Skip if no date
      if (!marks[date]) {
        marks[date] = { dots: [] };
      }
      const workoutKey = workout.scheduled_id || workout.workout_id || `workout_scheduled_${index}`;
      // Use workout's color, or green if completed, or default to accent.primary
      const dotColor = workout.completed 
        ? '#22C55E'  // Green for completed
        : (workout.color_hex || accent.primary);  // Workout's color or default
      marks[date].dots.push({
        color: dotColor,
        key: `scheduled_${workoutKey}`
      });
    });

    completedWorkouts.forEach((workout, index) => {
      if (!workout.timestamp) return; // Skip if no timestamp
      // Use timestamp directly if it's already in YYYY-MM-DD format, otherwise format it
      const date = workout.timestamp.includes('T') 
        ? format(new Date(workout.timestamp), 'yyyy-MM-dd')
        : workout.timestamp; // Already in YYYY-MM-DD format from AI workout history
      if (!marks[date]) {
        marks[date] = { dots: [] };
      }
      const alreadyMarked = marks[date].dots.some((d: any) => d.color === '#22C55E');
      if (!alreadyMarked) {
        marks[date].dots.push({
          color: '#22C55E',
          key: `completed_${workout.workout_id || `completed_${index}`}`
        });
      }
    });

    if (marks[selectedDate]) {
      marks[selectedDate] = {
        ...marks[selectedDate],
        selected: true,
        selectedColor: accent.primary,
      };
    } else {
      marks[selectedDate] = {
        selected: true,
        selectedColor: accent.primary,
        dots: [],
      };
    }

    return marks;
  })();

  const workoutsForSelectedDate = scheduledWorkouts.filter(
    (w) => w.scheduled_date === selectedDate
  );

  const completedForSelectedDate = completedWorkouts.filter((w) => {
    if (!w.timestamp) return false;
    // Handle both YYYY-MM-DD format and full ISO timestamp
    const date = w.timestamp.includes('T') 
      ? format(new Date(w.timestamp), 'yyyy-MM-dd')
      : w.timestamp;
    return date === selectedDate;
  });

  const upcomingWorkouts = scheduledWorkouts
    .filter(w => w.scheduled_date >= today && !w.completed)
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    .slice(0, 5);

  const localStyles = createStyles(theme);
    // Toggle picker expansion (collapse others when one opens)
  const togglePlanPicker = () => {
    setPlanExpanded(!planExpanded);
    setDayExpanded(false);
    setTimeExpanded(false);
  };

  const toggleDayPicker = () => {
    setDayExpanded(!dayExpanded);
    setPlanExpanded(false);
    setTimeExpanded(false);
  };

  const toggleTimePicker = () => {
    setTimeExpanded(!timeExpanded);
    setPlanExpanded(false);
    setDayExpanded(false);
  };

  if (loading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={localStyles.container}>
          <View style={localStyles.centered}>
            <ActivityIndicator size="large" color={accent.primary} />
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={localStyles.container}>
        <ScrollView contentContainerStyle={localStyles.scrollContent}>
          {/* Header */}
          <View style={localStyles.header}>
            <TouchableOpacity onPress={() => router.back()} style={localStyles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={localStyles.title}>Workout Schedule</Text>
            <TouchableOpacity onPress={openAddWorkoutModal} style={localStyles.addBtn}>
              <Ionicons name="add" size={28} color={accent.primary} />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View style={localStyles.legend}>
            <View style={localStyles.legendItem}>
              <View style={[localStyles.legendDot, { backgroundColor: accent.primary }]} />
              <Text style={localStyles.legendText}>Scheduled</Text>
            </View>
            <View style={localStyles.legendItem}>
              <View style={[localStyles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={localStyles.legendText}>Completed</Text>
            </View>
          </View>

          {/* Swipe hint */}
          <View style={localStyles.swipeHint}>
            <Ionicons name="arrow-back" size={14} color={colors.text.muted} />
            <Text style={localStyles.swipeHintText}>Swipe left on workouts to delete</Text>
          </View>

          {/* Quick Add Button */}
          <TouchableOpacity style={localStyles.quickAddButton} onPress={openAddWorkoutModal}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={localStyles.quickAddText}>Schedule a Workout</Text>
          </TouchableOpacity>

          {/* Upcoming Workouts */}
          {upcomingWorkouts.length > 0 && (
            <View style={localStyles.section}>
              <Text style={localStyles.sectionTitle}>Upcoming</Text>
              {upcomingWorkouts.map((workout, index) => {
                const planDetails = allPlans.find(p => p.plan_id === workout.workout_plan_id);
                const workoutKey = workout.scheduled_id || workout.workout_id || `upcoming_${index}_${workout.scheduled_date}`;
                const workoutColor = workout.color_hex || (workout.completed ? '#22C55E' : '#3B82F6');
                
                // Skip manual_log entries in upcoming (they're already completed)
                if (workout.workout_type === 'manual_log') return null;
                
                return (
                  <Swipeable
                    key={workoutKey}
                    ref={(ref) => { swipeableRefs.current[workoutKey] = ref; }}
                    renderRightActions={() => renderRightActions(workout.scheduled_id || workout.workout_id)}
                    overshootRight={false}
                  >
                    <TouchableOpacity 
                      style={[localStyles.upcomingCard, { borderLeftWidth: 4, borderLeftColor: workout.completed ? '#22C55E' : workoutColor }]}
                      onPress={() => openWorkoutDetail(workout)}
                      activeOpacity={0.7}
                    >
                      <View style={[localStyles.workoutColorDot, { backgroundColor: workout.completed ? '#22C55E' : workoutColor }]} />
                      <View style={localStyles.upcomingLeft}>
                        <View style={localStyles.upcomingDate}>
                          <Text style={localStyles.upcomingDateText}>{formatDateLabel(workout.scheduled_date)}</Text>
                          <Text style={localStyles.upcomingTime}>{formatTime(workout.scheduled_time)}</Text>
                        </View>
                        <View style={localStyles.upcomingInfo}>
                          <Text style={localStyles.upcomingPlan}>
                            {workout.title || planDetails?.name || 'Workout'}
                          </Text>
                          <Text style={localStyles.upcomingDay}>
                            {workout.workout_day ? `Day ${workout.workout_day}` : workout.description || `${workout.exercises?.length || 0} exercises`}
                          </Text>
                        </View>
                      </View>
                      <View style={localStyles.upcomingActions}>
                        <TouchableOpacity
                          style={localStyles.rescheduleBtn}
                          onPress={() => openRescheduleModal(workout)}
                        >
                          <Ionicons name="calendar-outline" size={20} color={accent.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[localStyles.completeBtn, workout.completed && { backgroundColor: '#22C55E' }]}
                          onPress={() => handleCompleteWorkout(workout.scheduled_id || workout.workout_id)}
                        >
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  </Swipeable>
                );
              })}
            </View>
          )}

          {/* Calendar */}
          <View style={localStyles.card}>
            <Calendar
              onDayPress={(day: any) => setSelectedDate(day.dateString)}
              markedDates={markedDates}
              markingType="multi-dot"
              theme={{
                calendarBackground: colors.background.card,
                textSectionTitleColor: colors.text.secondary,
                dayTextColor: colors.text.primary,
                todayTextColor: accent.primary,
                selectedDayBackgroundColor: accent.primary,
                selectedDayTextColor: '#ffffff',
                arrowColor: accent.primary,
                monthTextColor: colors.text.primary,
                textDayFontWeight: '500',
                textMonthFontWeight: '700',
                textDisabledColor: colors.text.muted,
              }}
            />
          </View>

          {/* Workouts for selected date */}
          <View style={localStyles.section}>
            <View style={localStyles.sectionHeader}>
              <Text style={localStyles.sectionTitle}>{formatDateLabel(selectedDate)}</Text>
              <TouchableOpacity 
                style={localStyles.addForDateBtn}
                onPress={() => setModalVisible(true)}
              >
                <Ionicons name="add" size={20} color={accent.primary} />
                <Text style={localStyles.addForDateText}>Add</Text>
              </TouchableOpacity>
            </View>
            
            {workoutsForSelectedDate.length === 0 && completedForSelectedDate.length === 0 ? (
              <View style={localStyles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={colors.text.muted} />
                <Text style={localStyles.emptyText}>No workouts for this day</Text>
                <TouchableOpacity 
                  style={localStyles.emptyButton}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={localStyles.emptyButtonText}>Add Workout</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Scheduled Workouts */}
                {workoutsForSelectedDate.map((workout, index) => {
                  const planDetails = allPlans.find(p => p.plan_id === workout.workout_plan_id);
                  const workoutKey = workout.scheduled_id || workout.workout_id || `workout_date_${index}_${selectedDate}`;
                  
                  // Handle manual workout log entries (from "Workout Complete" button)
                  if (workout.workout_type === 'manual_log') {
                    return (
                      <Swipeable
                        key={workoutKey}
                        ref={(ref) => { swipeableRefs.current[`completed_${workoutKey}`] = ref; }}
                        renderRightActions={() => renderRightActions(workout.workout_id)}
                        overshootRight={false}
                      >
                        <TouchableOpacity 
                          style={[localStyles.workoutCard, localStyles.workoutCardCompleted]}
                          onPress={() => viewCompletedWorkout(workout)}
                          activeOpacity={0.7}
                        >
                          <View style={localStyles.workoutHeader}>
                            <View style={localStyles.workoutTimeContainer}>
                              <Ionicons name="checkmark-circle" size={20} color={colors.status.success} />
                              <Text style={localStyles.workoutTime}>Completed</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                          </View>
                          <Text style={localStyles.workoutPlan}>{workout.title || 'Manual Workout'}</Text>
                          <Text style={localStyles.workoutDay}>{workout.description}</Text>
                          <View style={localStyles.completedBadge}>
                            <Ionicons name="clipboard" size={16} color={colors.status.success} />
                            <Text style={localStyles.completedText}>Tap to view details</Text>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    );
                  }
                  
                  return (
                    <Swipeable
                      key={workoutKey}
                      ref={(ref) => { swipeableRefs.current[`date_${workoutKey}`] = ref; }}
                      renderRightActions={() => renderRightActions(workout.scheduled_id || workout.workout_id)}
                      overshootRight={false}
                    >
                      <View style={[
                        localStyles.workoutCard,
                        workout.completed && localStyles.workoutCardCompleted
                      ]}>
                        <View style={localStyles.workoutHeader}>
                          <View style={localStyles.workoutTimeContainer}>
                            <Ionicons 
                              name={workout.completed ? "checkmark-circle" : "time-outline"} 
                              size={20} 
                              color={workout.completed ? colors.status.success : accent.primary} 
                            />
                            <Text style={localStyles.workoutTime}>{formatTime(workout.scheduled_time)}</Text>
                          </View>
                        </View>
                        <Text style={localStyles.workoutPlan}>
                          {planDetails?.name || workout.title || 'Workout Plan'}
                        </Text>
                        <Text style={localStyles.workoutDay}>{workout.workout_day ? `Day ${workout.workout_day}` : workout.description}</Text>
                        {!workout.completed && (
                          <TouchableOpacity
                            style={localStyles.markCompleteBtn}
                            onPress={() => handleCompleteWorkout(workout.scheduled_id || workout.workout_id)}
                          >
                            <Text style={localStyles.markCompleteBtnText}>Mark Complete</Text>
                          </TouchableOpacity>
                        )}
                        {workout.completed && (
                          <View style={localStyles.completedBadge}>
                            <Ionicons name="checkmark-circle" size={16} color={colors.status.success} />
                            <Text style={localStyles.completedText}>Completed</Text>
                          </View>
                        )}
                      </View>
                    </Swipeable>
                  );
                })}

                {/* Completed Workouts from Weight Training */}
                {completedForSelectedDate.map((workout, index) => (
                  <View key={`completed_${index}`} style={[localStyles.workoutCard, localStyles.workoutCardCompleted]}>
                    <View style={localStyles.workoutHeader}>
                      <View style={localStyles.workoutTimeContainer}>
                        <MaterialCommunityIcons name="dumbbell" size={20} color="#10B981" />
                        <Text style={localStyles.workoutTime}>
                          {format(new Date(workout.timestamp), 'h:mm a')}
                        </Text>
                      </View>
                      <View style={[localStyles.completedBadgeSmall]}>
                        <Text style={localStyles.completedBadgeText}>Logged</Text>
                      </View>
                    </View>
                    <Text style={localStyles.workoutPlan}>{workout.workout_name}</Text>
                    <Text style={localStyles.workoutDay}>
                      {workout.exercises?.length || 0} exercises • {workout.duration_minutes || 0} min
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>

        {/* Add Workout Modal - With Inline Expandable Pickers */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setModalVisible(false)}
        >
          <SafeAreaView style={[localStyles.modalContainer, { backgroundColor: colors.background.primary }]}>
            <View style={localStyles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={[localStyles.modalCancelText, { color: colors.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[localStyles.modalTitle, { color: colors.text.primary }]}>Schedule Workout</Text>
              <TouchableOpacity onPress={handleScheduleWorkout} disabled={!selectedPlan}>
                <Text style={[localStyles.modalDoneText, { color: selectedPlan ? accent.primary : colors.text.muted }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={localStyles.modalScroll} showsVerticalScrollIndicator={false}>
              {/* Quick Date Selection */}
              <Text style={localStyles.label}>Date</Text>
              <View style={localStyles.quickDates}>
                {quickDateOptions.map((option) => (
                  <TouchableOpacity
                    key={option.date}
                    style={[
                      localStyles.quickDateBtn,
                      selectedDate === option.date && localStyles.quickDateBtnActive
                    ]}
                    onPress={() => setSelectedDate(option.date)}
                  >
                    <Text style={[
                      localStyles.quickDateText,
                      selectedDate === option.date && localStyles.quickDateTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              
              <Text style={localStyles.selectedDateLabel}>
                Selected: {formatDateLabel(selectedDate)}
              </Text>

              {/* Plan Selection - Expandable */}
              <Text style={localStyles.label}>Select Plan</Text>
              {allPlans.length === 0 ? (
                <View style={localStyles.noPlansBanner}>
                  <Ionicons name="information-circle" size={20} color="#F59E0B" />
                  <Text style={localStyles.noPlansText}>
                    No workout plans available. Go to Plans tab to create one first.
                  </Text>
                </View>
              ) : (
                <View style={localStyles.expandableContainer}>
                  <TouchableOpacity 
                    style={localStyles.pickerButton}
                    onPress={togglePlanPicker}
                  >
                    <View style={localStyles.pickerButtonContent}>
                      <MaterialCommunityIcons name="dumbbell" size={20} color={accent.primary} />
                      <Text style={[
                        localStyles.pickerButtonText,
                        !selectedPlan && { color: colors.text.muted }
                      ]}>
                        {getSelectedPlanName()}
                      </Text>
                    </View>
                    <Ionicons name={planExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.secondary} />
                  </TouchableOpacity>
                  
                  {planExpanded && (
                    <View style={localStyles.expandedOptions}>
                      {/* Create Custom Workout Option */}
                      <TouchableOpacity
                        style={[localStyles.optionItem, localStyles.createCustomOption]}
                        onPress={openCustomWorkoutModal}
                      >
                        <View style={localStyles.createCustomContent}>
                          <Ionicons name="add-circle" size={20} color={accent.primary} />
                          <Text style={[localStyles.optionText, { color: accent.primary, fontWeight: '600' }]}>
                            Create Custom Workout
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={accent.primary} />
                      </TouchableOpacity>
                      
                      {/* Existing Plans */}
                      {allPlans.map((plan) => (
                        <TouchableOpacity
                          key={plan.unique_id}
                          style={[
                            localStyles.optionItem,
                            selectedPlan === plan.plan_id && localStyles.optionItemSelected
                          ]}
                          onPress={() => {
                            setSelectedPlan(plan.plan_id);
                            setPlanExpanded(false);
                          }}
                        >
                          <Text style={[
                            localStyles.optionText,
                            selectedPlan === plan.plan_id && localStyles.optionTextSelected
                          ]}>
                            {plan.name}
                          </Text>
                          {selectedPlan === plan.plan_id && (
                            <Ionicons name="checkmark" size={20} color="#fff" />
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Workout Day - Expandable */}
              <Text style={localStyles.label}>Workout Day</Text>
              <View style={localStyles.expandableContainer}>
                <TouchableOpacity 
                  style={localStyles.pickerButton}
                  onPress={toggleDayPicker}
                >
                  <View style={localStyles.pickerButtonContent}>
                    <Ionicons name="calendar" size={20} color={accent.primary} />
                    <Text style={localStyles.pickerButtonText}>Day {selectedDay}</Text>
                  </View>
                  <Ionicons name={dayExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.secondary} />
                </TouchableOpacity>
                
                {dayExpanded && (
                  <View style={localStyles.expandedOptions}>
                    {DAY_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          localStyles.optionItem,
                          selectedDay === option.value && localStyles.optionItemSelected
                        ]}
                        onPress={() => {
                          setSelectedDay(option.value);
                          setDayExpanded(false);
                        }}
                      >
                        <Text style={[
                          localStyles.optionText,
                          selectedDay === option.value && localStyles.optionTextSelected
                        ]}>
                          {option.label}
                        </Text>
                        {selectedDay === option.value && (
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Time - Expandable */}
              <Text style={localStyles.label}>Time</Text>
              <View style={localStyles.expandableContainer}>
                <TouchableOpacity 
                  style={localStyles.pickerButton}
                  onPress={toggleTimePicker}
                >
                  <View style={localStyles.pickerButtonContent}>
                    <Ionicons name="time" size={20} color={accent.primary} />
                    <Text style={localStyles.pickerButtonText}>{formatTime(time)}</Text>
                  </View>
                  <Ionicons name={timeExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.text.secondary} />
                </TouchableOpacity>
                
                {timeExpanded && (
                  <ScrollView style={localStyles.expandedOptionsScroll} nestedScrollEnabled={true}>
                    {TIME_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          localStyles.optionItem,
                          time === option.value && localStyles.optionItemSelected
                        ]}
                        onPress={() => {
                          setTime(option.value);
                          setTimeExpanded(false);
                        }}
                      >
                        <Text style={[
                          localStyles.optionText,
                          time === option.value && localStyles.optionTextSelected
                        ]}>
                          {option.label}
                        </Text>
                        {time === option.value && (
                          <Ionicons name="checkmark" size={20} color="#fff" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Reminder Toggle */}
              <View style={localStyles.switchRow}>
                <View>
                  <Text style={localStyles.label}>Reminder</Text>
                  <Text style={localStyles.switchSubtext}>Get notified before workout</Text>
                </View>
                <TouchableOpacity
                  style={[localStyles.switch, reminderEnabled && localStyles.switchActive]}
                  onPress={() => setReminderEnabled(!reminderEnabled)}
                >
                  <Text style={[localStyles.switchText, reminderEnabled && localStyles.switchTextActive]}>
                    {reminderEnabled ? 'ON' : 'OFF'}
                  </Text>
                </TouchableOpacity>
              </View>

              {reminderEnabled && (
                <View style={localStyles.reminderOptions}>
                  {[15, 30, 60].map((mins) => (
                    <TouchableOpacity
                      key={mins}
                      style={[
                        localStyles.reminderOption,
                        reminderMinutes === mins && localStyles.reminderOptionActive
                      ]}
                      onPress={() => setReminderMinutes(mins)}
                    >
                      <Text style={[
                        localStyles.reminderOptionText,
                        reminderMinutes === mins && localStyles.reminderOptionTextActive
                      ]}>
                        {mins < 60 ? `${mins} min` : '1 hour'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Schedule Button */}
              <TouchableOpacity 
                style={[localStyles.scheduleButton, !selectedPlan && localStyles.scheduleButtonDisabled]} 
                onPress={handleScheduleWorkout}
                disabled={!selectedPlan}
              >
                <Text style={localStyles.scheduleButtonText}>
                  Schedule for {formatDateLabel(selectedDate)}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Reschedule Modal */}
        <Modal
          visible={rescheduleModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setRescheduleModalVisible(false)}
        >
          <SafeAreaView style={[localStyles.modalContainer, { backgroundColor: colors.background.primary }]}>
            <View style={localStyles.modalHeader}>
              <TouchableOpacity onPress={() => setRescheduleModalVisible(false)}>
                <Text style={[localStyles.modalCancelText, { color: colors.text.secondary }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[localStyles.modalTitle, { color: colors.text.primary }]}>Move Workout</Text>
              <TouchableOpacity onPress={handleRescheduleWorkout}>
                <Text style={[localStyles.modalDoneText, { color: accent.primary }]}>Done</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={localStyles.modalScroll}>
              <Text style={localStyles.rescheduleInfo}>
                Moving workout from {formatDateLabel(workoutToReschedule?.scheduled_date || '')}
              </Text>

              <Text style={localStyles.label}>New Date</Text>
              <View style={localStyles.quickDates}>
                {quickDateOptions.map((option) => (
                  <TouchableOpacity
                    key={option.date}
                    style={[
                      localStyles.quickDateBtn,
                      newScheduleDate === option.date && localStyles.quickDateBtnActive
                    ]}
                    onPress={() => setNewScheduleDate(option.date)}
                  >
                    <Text style={[
                      localStyles.quickDateText,
                      newScheduleDate === option.date && localStyles.quickDateTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={localStyles.miniCalendarContainer}>
                <Calendar
                  onDayPress={(day: any) => setNewScheduleDate(day.dateString)}
                  markedDates={{
                    [newScheduleDate]: {
                      selected: true,
                      selectedColor: accent.primary,
                    }
                  }}
                  theme={{
                    calendarBackground: colors.background.secondary,
                    textSectionTitleColor: colors.text.secondary,
                    dayTextColor: colors.text.primary,
                    todayTextColor: accent.primary,
                    selectedDayBackgroundColor: accent.primary,
                    selectedDayTextColor: '#ffffff',
                    arrowColor: accent.primary,
                    monthTextColor: colors.text.primary,
                    textDisabledColor: colors.text.muted,
                  }}
                  style={localStyles.miniCalendar}
                />
              </View>

              <TouchableOpacity 
                style={localStyles.scheduleButton} 
                onPress={handleRescheduleWorkout}
              >
                <Text style={localStyles.scheduleButtonText}>Move to {formatDateLabel(newScheduleDate)}</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        </Modal>
                {/* Custom Workout Modal */}
        <Modal
          visible={customWorkoutModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCustomWorkoutModalVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <SafeAreaView style={[localStyles.modalContainer, { backgroundColor: colors.background.primary }]}>
              <View style={localStyles.modalHeader}>
                <TouchableOpacity onPress={() => setCustomWorkoutModalVisible(false)}>
                  <Text style={[localStyles.modalCancelText, { color: colors.text.secondary }]}>Cancel</Text>
                </TouchableOpacity>
                <Text style={[localStyles.modalTitle, { color: colors.text.primary }]}>Create Workout</Text>
                <TouchableOpacity onPress={handleCreateCustomWorkout}>
                  <Text style={[localStyles.modalDoneText, { color: accent.primary }]}>Create</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={localStyles.modalScroll} showsVerticalScrollIndicator={false}>
                {/* Workout Name */}
                <Text style={localStyles.label}>Workout Name</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="e.g., Morning Push Day"
                  placeholderTextColor={colors.text.muted}
                  value={customWorkoutName}
                  onChangeText={setCustomWorkoutName}
                />

                {/* Exercises */}
                <View style={localStyles.exercisesHeader}>
                  <Text style={localStyles.label}>Exercises</Text>
                  <TouchableOpacity onPress={addExercise} style={localStyles.addExerciseBtn}>
                    <Ionicons name="add-circle" size={24} color={accent.primary} />
                  </TouchableOpacity>
                </View>

                {customExercises.map((exercise, index) => (
                  <View key={index} style={localStyles.exerciseRow}>
                    <View style={localStyles.exerciseNameContainer}>
                      <TextInput
                        style={localStyles.exerciseNameInput}
                        placeholder="Exercise name"
                        placeholderTextColor={colors.text.muted}
                        value={exercise.name}
                        onChangeText={(text) => updateExercise(index, 'name', text)}
                      />
                    </View>
                    <View style={localStyles.exerciseSetsReps}>
                      <View style={localStyles.setsRepsInput}>
                        <Text style={localStyles.setsRepsLabel}>Sets</Text>
                        <TextInput
                          style={localStyles.setsRepsValue}
                          keyboardType="numeric"
                          value={exercise.sets}
                          onChangeText={(text) => updateExercise(index, 'sets', text)}
                        />
                      </View>
                      <View style={localStyles.setsRepsInput}>
                        <Text style={localStyles.setsRepsLabel}>Reps</Text>
                        <TextInput
                          style={localStyles.setsRepsValue}
                          keyboardType="numeric"
                          value={exercise.reps}
                          onChangeText={(text) => updateExercise(index, 'reps', text)}
                        />
                      </View>
                      {customExercises.length > 1 && (
                        <TouchableOpacity 
                          onPress={() => removeExercise(index)}
                          style={localStyles.removeExerciseBtn}
                        >
                          <Ionicons name="trash-outline" size={20} color={colors.status.error} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}

                <TouchableOpacity 
                  style={localStyles.addMoreExerciseBtn}
                  onPress={addExercise}
                >
                  <Ionicons name="add" size={20} color={accent.primary} />
                  <Text style={[localStyles.addMoreText, { color: accent.primary }]}>Add Another Exercise</Text>
                </TouchableOpacity>

                {/* Create Button */}
                <TouchableOpacity 
                  style={[localStyles.scheduleButton, !customWorkoutName.trim() && localStyles.scheduleButtonDisabled]}
                  onPress={handleCreateCustomWorkout}
                  disabled={!customWorkoutName.trim()}
                >
                  <Text style={localStyles.scheduleButtonText}>Create & Select Workout</Text>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </Modal>

        {/* Completed Workout Details Modal */}
        <Modal
          visible={completedWorkoutModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCompletedWorkoutModalVisible(false)}
        >
          <SafeAreaView style={[localStyles.modalContainer, { backgroundColor: colors.background.primary }]}>
            <View style={localStyles.modalHeader}>
              <TouchableOpacity onPress={() => setCompletedWorkoutModalVisible(false)}>
                <Ionicons name="close" size={28} color={colors.text.primary} />
              </TouchableOpacity>
              <Text style={[localStyles.modalTitle, { color: colors.text.primary }]}>Workout Details</Text>
              <TouchableOpacity onPress={() => {
                if (selectedCompletedWorkout?.workout_id) {
                  setCompletedWorkoutModalVisible(false);
                  handleDeleteCompletedWorkout(selectedCompletedWorkout.workout_id);
                }
              }}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>

            <ScrollView style={localStyles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedCompletedWorkout && (
                <>
                  {/* Completed Badge */}
                  <View style={[localStyles.completedDetailBadge, { backgroundColor: `${colors.status.success}20` }]}>
                    <Ionicons name="checkmark-circle" size={32} color={colors.status.success} />
                    <View style={localStyles.completedDetailText}>
                      <Text style={[localStyles.completedDetailTitle, { color: colors.status.success }]}>
                        Workout Completed
                      </Text>
                      <Text style={[localStyles.completedDetailDate, { color: colors.text.secondary }]}>
                        {selectedCompletedWorkout.completed_at 
                          ? format(new Date(selectedCompletedWorkout.completed_at), 'MMMM d, yyyy • h:mm a')
                          : selectedCompletedWorkout.scheduled_date
                        }
                      </Text>
                    </View>
                  </View>

                  {/* Exercises List */}
                  <Text style={[localStyles.exercisesSectionTitle, { color: colors.text.primary }]}>
                    Exercises ({selectedCompletedWorkout.exercises?.length || 0})
                  </Text>
                  
                  {selectedCompletedWorkout.exercises?.map((exercise: any, index: number) => (
                    <View key={index} style={[localStyles.exerciseDetailCard, { backgroundColor: colors.background.card }]}>
                      <Text style={[localStyles.exerciseDetailName, { color: colors.text.primary }]}>
                        {exercise.name}
                      </Text>
                      
                      {/* Show full reps/weight data table */}
                      {exercise.reps && Object.keys(exercise.reps).length > 0 && (
                        <View style={localStyles.exerciseDataTable}>
                          {/* Table Header */}
                          <View style={localStyles.tableHeaderRow}>
                            <Text style={[localStyles.tableHeaderCell, localStyles.dayHeaderCell, { color: colors.text.secondary }]}>Day</Text>
                            <Text style={[localStyles.tableHeaderCell, { color: colors.text.secondary }]}>Reps</Text>
                            <Text style={[localStyles.tableHeaderCell, { color: colors.text.secondary }]}>Weight</Text>
                          </View>
                          
                          {/* Data Rows */}
                          {Object.keys(exercise.reps).filter(day => exercise.reps[day]).map((day) => (
                            <View key={day} style={[localStyles.tableDataRow, { borderBottomColor: colors.border.primary }]}>
                              <Text style={[localStyles.tableDataCell, localStyles.dayCell, { color: colors.text.muted }]}>
                                {day}
                              </Text>
                              <Text style={[localStyles.tableDataCell, { color: colors.text.primary }]}>
                                {exercise.reps[day] || '-'}
                              </Text>
                              <Text style={[localStyles.tableDataCell, { color: colors.text.primary }]}>
                                {exercise.weight?.[day] ? `${exercise.weight[day]} lbs` : '-'}
                              </Text>
                            </View>
                          ))}
                          
                          {/* Summary Row */}
                          <View style={[localStyles.tableSummaryRow, { backgroundColor: colors.background.secondary }]}>
                            <Text style={[localStyles.tableSummaryLabel, { color: colors.text.secondary }]}>
                              Total Sets Completed
                            </Text>
                            <Text style={[localStyles.tableSummaryValue, { color: accent.primary }]}>
                              {Object.keys(exercise.reps).filter(day => exercise.reps[day]).length}
                            </Text>
                          </View>
                        </View>
                      )}
                      
                      {/* Notes if available */}
                      {exercise.notes && (
                        <View style={[localStyles.exerciseNotesContainer, { backgroundColor: colors.background.secondary }]}>
                          <Ionicons name="document-text-outline" size={16} color={colors.text.muted} />
                          <Text style={[localStyles.exerciseDetailNotes, { color: colors.text.secondary }]}>
                            {exercise.notes}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}

                  {/* Delete Button */}
                  <TouchableOpacity 
                    style={localStyles.deleteWorkoutButton}
                    onPress={() => {
                      if (selectedCompletedWorkout?.workout_id) {
                        setCompletedWorkoutModalVisible(false);
                        handleDeleteCompletedWorkout(selectedCompletedWorkout.workout_id);
                      }
                    }}
                  >
                    <Ionicons name="trash" size={20} color="#fff" />
                    <Text style={localStyles.deleteWorkoutButtonText}>Delete from Calendar</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Workout Detail Modal (for scheduled workouts) */}
        <Modal
          visible={workoutDetailModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setWorkoutDetailModalVisible(false)}
        >
          <SafeAreaView style={[localStyles.modalContainer, { backgroundColor: colors.background.primary }]}>
            <View style={localStyles.modalHeader}>
              <TouchableOpacity onPress={() => {
                setWorkoutDetailModalVisible(false);
                setEditingWorkout(false);
                setShowTimePicker(false);
                setShowReminderPicker(false);
              }}>
                <Ionicons name="close" size={28} color={colors.text.primary} />
              </TouchableOpacity>
              <Text style={[localStyles.modalTitle, { color: colors.text.primary }]}>Workout Details</Text>
              <TouchableOpacity onPress={() => {
                if (editingWorkout) {
                  updateScheduledWorkout();
                } else {
                  setEditingWorkout(true);
                }
              }}>
                <Text style={[localStyles.modalDoneText, { color: accent.primary }]}>
                  {editingWorkout ? 'Save' : 'Edit'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={localStyles.modalScroll} showsVerticalScrollIndicator={false}>
              {selectedWorkoutDetail && (
                <>
                  {/* Workout Header */}
                  <View style={[localStyles.workoutDetailHeader, { backgroundColor: colors.background.card }]}>
                    <View style={[localStyles.workoutDetailColorDot, { backgroundColor: selectedWorkoutDetail.color_hex || accent.primary }]} />
                    <View style={localStyles.workoutDetailInfo}>
                      <Text style={[localStyles.workoutDetailTitle, { color: colors.text.primary }]}>
                        {selectedWorkoutDetail.title || 'Workout'}
                      </Text>
                      <Text style={[localStyles.workoutDetailDate, { color: colors.text.secondary }]}>
                        {formatDateLabel(selectedWorkoutDetail.scheduled_date)}
                      </Text>
                    </View>
                  </View>

                  {/* Time Section */}
                  <View style={[localStyles.detailSection, { backgroundColor: colors.background.card }]}>
                    <View style={localStyles.detailSectionHeader}>
                      <Ionicons name="time-outline" size={20} color={accent.primary} />
                      <Text style={[localStyles.detailSectionTitle, { color: colors.text.primary }]}>Time</Text>
                    </View>
                    {editingWorkout ? (
                      <>
                        <TouchableOpacity 
                          style={[localStyles.timeInput, { backgroundColor: colors.background.secondary }]}
                          onPress={() => setShowTimePicker(!showTimePicker)}
                        >
                          <Text style={[localStyles.detailValue, { color: colors.text.primary }]}>
                            {formatTime(editedWorkoutTime)}
                          </Text>
                        </TouchableOpacity>
                        {showTimePicker && (
                          <ScrollView style={localStyles.timePickerList} nestedScrollEnabled>
                            {TIME_OPTIONS.map((option) => (
                              <TouchableOpacity
                                key={option.value}
                                style={[
                                  localStyles.timePickerItem,
                                  editedWorkoutTime === option.value && { backgroundColor: accent.primary + '20' }
                                ]}
                                onPress={() => {
                                  setEditedWorkoutTime(option.value);
                                  setShowTimePicker(false);
                                }}
                              >
                                <Text style={[
                                  localStyles.timePickerText,
                                  { color: editedWorkoutTime === option.value ? accent.primary : colors.text.primary }
                                ]}>
                                  {option.label}
                                </Text>
                                {editedWorkoutTime === option.value && (
                                  <Ionicons name="checkmark" size={20} color={accent.primary} />
                                )}
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </>
                    ) : (
                      <Text style={[localStyles.detailValue, { color: colors.text.primary }]}>
                        {formatTime(selectedWorkoutDetail.scheduled_time)}
                      </Text>
                    )}
                  </View>

                  {/* Reminder Section */}
                  <View style={[localStyles.detailSection, { backgroundColor: colors.background.card }]}>
                    <View style={localStyles.detailSectionHeader}>
                      <Ionicons name="notifications-outline" size={20} color={accent.primary} />
                      <Text style={[localStyles.detailSectionTitle, { color: colors.text.primary }]}>Reminder</Text>
                    </View>
                    {editingWorkout ? (
                      <>
                        <TouchableOpacity 
                          style={[localStyles.timeInput, { backgroundColor: colors.background.secondary }]}
                          onPress={() => setShowReminderPicker(!showReminderPicker)}
                        >
                          <Text style={[localStyles.detailValue, { color: colors.text.primary }]}>
                            {REMINDER_OPTIONS.find(r => r.id === editedReminderOption)?.label || 'No reminder'}
                          </Text>
                        </TouchableOpacity>
                        {showReminderPicker && (
                          <View style={localStyles.reminderPickerList}>
                            {REMINDER_OPTIONS.map((option) => (
                              <TouchableOpacity
                                key={option.id}
                                style={[
                                  localStyles.reminderPickerItem,
                                  editedReminderOption === option.id && { backgroundColor: accent.primary + '20' }
                                ]}
                                onPress={() => {
                                  setEditedReminderOption(option.id);
                                  setShowReminderPicker(false);
                                }}
                              >
                                <Text style={[
                                  localStyles.reminderPickerText,
                                  { color: editedReminderOption === option.id ? accent.primary : colors.text.primary }
                                ]}>
                                  {option.label}
                                </Text>
                                {editedReminderOption === option.id && (
                                  <Ionicons name="checkmark" size={20} color={accent.primary} />
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={[localStyles.detailValue, { color: colors.text.primary }]}>
                        {REMINDER_OPTIONS.find(r => r.id === (selectedWorkoutDetail.reminder_option || '30min'))?.label || '30 minutes before'}
                      </Text>
                    )}
                  </View>

                  {/* Exercises Section */}
                  {selectedWorkoutDetail.exercises && selectedWorkoutDetail.exercises.length > 0 && (
                    <View style={[localStyles.detailSection, { backgroundColor: colors.background.card }]}>
                      <View style={localStyles.detailSectionHeader}>
                        <MaterialCommunityIcons name="dumbbell" size={20} color={accent.primary} />
                        <Text style={[localStyles.detailSectionTitle, { color: colors.text.primary }]}>
                          Exercises ({selectedWorkoutDetail.exercises.length})
                        </Text>
                      </View>
                      {selectedWorkoutDetail.exercises.map((exercise: any, index: number) => (
                        <View key={index} style={[localStyles.exerciseRow, { marginBottom: 8 }]}>
                          <View style={localStyles.exerciseIndexBadge}>
                            <Text style={localStyles.exerciseIndexText}>{index + 1}</Text>
                          </View>
                          <View style={localStyles.exerciseDetailContent}>
                            <Text style={[localStyles.exerciseDetailName, { color: colors.text.primary, marginBottom: 0 }]}>
                              {exercise.name}
                            </Text>
                            <View style={localStyles.exerciseMetaRow}>
                              <Text style={[localStyles.exerciseMeta, { color: colors.text.secondary }]}>
                                {exercise.sets} sets × {exercise.reps} reps
                              </Text>
                              {exercise.weight && (
                                <Text style={[localStyles.exerciseMeta, { color: accent.primary }]}>
                                  {exercise.weight} lbs
                                </Text>
                              )}
                            </View>
                            {exercise.notes && (
                              <Text style={[localStyles.exerciseNote, { color: colors.text.muted }]}>
                                {exercise.notes}
                              </Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={localStyles.detailActions}>
                    {editingWorkout ? (
                      <TouchableOpacity 
                        style={[localStyles.saveButton, { backgroundColor: accent.primary }]}
                        onPress={updateScheduledWorkout}
                      >
                        <Ionicons name="checkmark" size={20} color="#fff" />
                        <Text style={localStyles.saveButtonText}>Save Changes</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        {!selectedWorkoutDetail.completed && (
                          <TouchableOpacity 
                            style={[localStyles.completeWorkoutButton, { backgroundColor: colors.status.success }]}
                            onPress={() => {
                              handleCompleteWorkout(selectedWorkoutDetail.scheduled_id || selectedWorkoutDetail.workout_id);
                              setWorkoutDetailModalVisible(false);
                            }}
                          >
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={localStyles.completeWorkoutText}>Mark as Complete</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity 
                          style={[localStyles.deleteWorkoutButton]}
                          onPress={() => {
                            setWorkoutDetailModalVisible(false);
                            confirmDeleteWorkout(selectedWorkoutDetail.scheduled_id || selectedWorkoutDetail.workout_id);
                          }}
                        >
                          <Ionicons name="trash" size={20} color="#fff" />
                          <Text style={localStyles.deleteWorkoutButtonText}>Delete Workout</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  addBtn: {
    padding: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  swipeHintText: {
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  quickAddButton: {
    backgroundColor: theme.accentColors.primary,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
    marginBottom: 20,
  },
  quickAddText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  addForDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.accentColors.primary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  addForDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accentColors.primary,
  },
  upcomingCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  workoutColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  upcomingLeft: {
    flex: 1,
  },
  upcomingDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  upcomingDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accentColors.primary,
  },
  upcomingTime: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  upcomingInfo: {},
  upcomingPlan: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  upcomingDay: {
    fontSize: 13,
    color: theme.colors.text.muted,
    marginTop: 2,
  },
  upcomingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rescheduleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.accentColors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
        backgroundColor: theme.colors.status.success,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.text.muted,
    marginTop: 12,
  },
  emptyButton: {
    backgroundColor: theme.accentColors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  workoutCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  workoutCardCompleted: {
    opacity: 0.8,
  },
  workoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  workoutTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workoutTime: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  workoutPlan: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  workoutDay: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  markCompleteBtn: {
    backgroundColor: theme.colors.status.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  markCompleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  completedBadgeSmall: {
    backgroundColor: '#10B98120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },
  completedText: {
    fontSize: 14,
    color: theme.colors.status.success,
    fontWeight: '500',
  },
  deleteAction: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 12,
    marginBottom: 10,
    marginLeft: 8,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  modalCancelText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 8,
    marginTop: 16,
  },
  quickDates: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  quickDateBtn: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  quickDateBtnActive: {
    backgroundColor: theme.accentColors.primary,
  },
  quickDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  quickDateTextActive: {
    color: '#fff',
  },
  selectedDateLabel: {
    fontSize: 14,
    color: theme.accentColors.primary,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  noPlansBanner: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    alignItems: 'center',
  },
  noPlansText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
  },
  // Expandable Picker Styles
  expandableContainer: {
    marginBottom: 8,
  },
  pickerButton: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerButtonText: {
    fontSize: 16,
    color: theme.colors.text.primary,
    fontWeight: '500',
  },
  expandedOptions: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    overflow: 'hidden',
  },
  expandedOptionsScroll: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    maxHeight: 200,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  optionItemSelected: {
    backgroundColor: theme.accentColors.primary,
  },
  optionText: {
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  optionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  switchSubtext: {
    fontSize: 12,
    color: theme.colors.text.muted,
    marginTop: 2,
  },
  switch: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  switchActive: {
    backgroundColor: theme.colors.status.success,
  },
  switchText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  switchTextActive: {
    color: '#fff',
  },
  reminderOptions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  reminderOption: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  reminderOptionActive: {
    backgroundColor: theme.accentColors.primary,
  },
  reminderOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.text.secondary,
  },
  reminderOptionTextActive: {
    color: '#fff',
  },
  scheduleButton: {
    backgroundColor: theme.accentColors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
  },
  scheduleButtonDisabled: {
    opacity: 0.5,
  },
  scheduleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  rescheduleInfo: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  miniCalendarContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.secondary,
  },
  miniCalendar: {
    borderRadius: 12,
  },
  // Custom workout modal styles
  createCustomOption: {
    backgroundColor: theme.accentColors.primary + '10',
    borderBottomWidth: 2,
    borderBottomColor: theme.accentColors.primary + '30',
  },
  createCustomContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  exercisesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  addExerciseBtn: {
    padding: 4,
  },
  exerciseRow: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
  exerciseNameContainer: {
    marginBottom: 10,
  },
  exerciseNameInput: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text.primary,
  },
  exerciseSetsReps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  setsRepsInput: {
    flex: 1,
    alignItems: 'center',
  },
  setsRepsLabel: {
    fontSize: 12,
    color: theme.colors.text.muted,
    marginBottom: 4,
  },
  setsRepsValue: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 8,
    padding: 10,
    width: '100%',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  removeExerciseBtn: {
    padding: 8,
  },
  addMoreExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.accentColors.primary,
    borderRadius: 12,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addMoreText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Completed Workout Detail Modal Styles
  completedDetailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  completedDetailText: {
    flex: 1,
  },
  completedDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  completedDetailDate: {
    fontSize: 14,
    marginTop: 4,
  },
  exercisesSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  exerciseDetailCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseDetailName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  exerciseDataTable: {
    marginTop: 8,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#E5E7EB',
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  dayHeaderCell: {
    flex: 0.6,
    textAlign: 'left',
  },
  tableDataRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableDataCell: {
    flex: 1,
    fontSize: 15,
    textAlign: 'center',
  },
  dayCell: {
    flex: 0.6,
    textAlign: 'left',
  },
  tableSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  tableSummaryLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  tableSummaryValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseNotesContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  exerciseStats: {
    marginTop: 10,
  },
  exerciseStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  exerciseStatLabel: {
    fontSize: 14,
  },
  exerciseStatValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  exerciseDetailNotes: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  deleteWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 20,
    marginBottom: 40,
    gap: 8,
  },
  deleteWorkoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Workout Detail Modal Styles
  workoutDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  workoutDetailColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 12,
  },
  workoutDetailInfo: {
    flex: 1,
  },
  workoutDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  workoutDetailDate: {
    fontSize: 14,
    marginTop: 4,
  },
  detailSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '500',
  },
  timeInput: {
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  exerciseIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.accentColors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exerciseIndexText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.accentColors.primary,
  },
  exerciseDetailContent: {
    flex: 1,
  },
  exerciseMetaRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  exerciseMeta: {
    fontSize: 13,
  },
  exerciseNote: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  detailActions: {
    marginTop: 8,
    marginBottom: 40,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  completeWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 12,
  },
  completeWorkoutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  timePickerList: {
    maxHeight: 200,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.background.input,
  },
  timePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  timePickerText: {
    fontSize: 15,
  },
  reminderPickerList: {
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.background.input,
  },
  reminderPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  reminderPickerText: {
    fontSize: 15,
  },
});

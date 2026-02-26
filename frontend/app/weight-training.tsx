import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  RefreshControl,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import { router } from 'expo-router';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Professional AI fitness images for muscle groups
const MUSCLE_GROUP_IMAGES: { [key: string]: string } = {
  chest: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80', // Man doing bench press
  back: 'https://images.unsplash.com/photo-1627197843575-00cc3965c2d5?w=400&q=80', // Man doing pull-ups
  shoulders: 'https://images.unsplash.com/photo-1554344728-7560c38c1720?w=400&q=80', // Man with dumbbells
  legs: 'https://images.unsplash.com/photo-1434608519344-49d77a699e1d?w=400&q=80', // Leg workout
  arms: 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400&q=80', // Bicep curl
  core: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&q=80', // Core/abs workout
};

// Professional exercise images by exercise type/name
const EXERCISE_IMAGES: { [key: string]: string } = {
  // Chest exercises
  'bench press': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&q=80',
  'incline bench press': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&q=80',
  'decline bench press': 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200&q=80',
  'dumbbell press': 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200&q=80',
  'push-ups': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=200&q=80',
  'chest fly': 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200&q=80',
  // Back exercises
  'pull-ups': 'https://images.unsplash.com/photo-1627197843575-00cc3965c2d5?w=200&q=80',
  'lat pulldown': 'https://images.unsplash.com/photo-1627197843575-00cc3965c2d5?w=200&q=80',
  'barbell row': 'https://images.unsplash.com/photo-1603287681836-b174ce5074c2?w=200&q=80',
  'dumbbell row': 'https://images.unsplash.com/photo-1603287681836-b174ce5074c2?w=200&q=80',
  'deadlift': 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=200&q=80',
  // Shoulder exercises
  'overhead press': 'https://images.unsplash.com/photo-1554344728-7560c38c1720?w=200&q=80',
  'lateral raise': 'https://images.unsplash.com/photo-1554344728-7560c38c1720?w=200&q=80',
  'front raise': 'https://images.unsplash.com/photo-1554344728-7560c38c1720?w=200&q=80',
  'face pull': 'https://images.unsplash.com/photo-1554344728-7560c38c1720?w=200&q=80',
  // Leg exercises
  'squat': 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=200&q=80',
  'leg press': 'https://images.unsplash.com/photo-1434608519344-49d77a699e1d?w=200&q=80',
  'lunges': 'https://images.unsplash.com/photo-1434608519344-49d77a699e1d?w=200&q=80',
  'leg curl': 'https://images.unsplash.com/photo-1434608519344-49d77a699e1d?w=200&q=80',
  'calf raise': 'https://images.unsplash.com/photo-1434608519344-49d77a699e1d?w=200&q=80',
  // Arm exercises
  'bicep curl': 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200&q=80',
  'tricep extension': 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200&q=80',
  'hammer curl': 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200&q=80',
  'tricep dips': 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=200&q=80',
  // Core exercises
  'plank': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&q=80',
  'crunches': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&q=80',
  'russian twist': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&q=80',
  'leg raise': 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=200&q=80',
};

// Helper function to get exercise image
const getExerciseImage = (exerciseName: string, muscleGroup?: string): string => {
  const lowerName = exerciseName.toLowerCase();
  // Check for exact or partial match in exercise images
  for (const [key, url] of Object.entries(EXERCISE_IMAGES)) {
    if (lowerName.includes(key) || key.includes(lowerName)) {
      return url;
    }
  }
  // Fallback to muscle group image
  if (muscleGroup && MUSCLE_GROUP_IMAGES[muscleGroup]) {
    return MUSCLE_GROUP_IMAGES[muscleGroup];
  }
  // Default fallback
  return 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=80';
};

export default function WeightTrainingScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [programs, setPrograms] = useState<any>({});
  const [functionalPrograms, setFunctionalPrograms] = useState<any>({});
  const [exercises, setExercises] = useState<any>({});
  const [stats, setStats] = useState<any>(null);
  const [prs, setPrs] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  
  // Modal states
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<any>(null);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [showExerciseLibraryModal, setShowExerciseLibraryModal] = useState(false);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string | null>(null);
  const [editingExercise, setEditingExercise] = useState<any>(null);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [editingExerciseIndex, setEditingExerciseIndex] = useState<number | null>(null);
  
  // Functional Training Modal states
  const [showFunctionalModal, setShowFunctionalModal] = useState(false);
  const [selectedFunctionalProgram, setSelectedFunctionalProgram] = useState<any>(null);
  
  // Inline editing state (replaces nested modal)
  const [expandedExerciseKey, setExpandedExerciseKey] = useState<string | null>(null);
  
  // Workout logging state
  const [workoutName, setWorkoutName] = useState('');
  const [workoutExercises, setWorkoutExercises] = useState<any[]>([]);
  const [currentExercise, setCurrentExercise] = useState('');
  const [currentSets, setCurrentSets] = useState<any[]>([]);
  const [savingWorkout, setSavingWorkout] = useState(false);

  // Edit exercise state
  const [editExName, setEditExName] = useState('');
  const [editExSets, setEditExSets] = useState('');
  const [editExReps, setEditExReps] = useState('');
  const [editExRest, setEditExRest] = useState('');
  
  // Past workout view state
  const [showPastWorkoutModal, setShowPastWorkoutModal] = useState(false);
  const [selectedPastWorkout, setSelectedPastWorkout] = useState<any>(null);
  
  // Exercise detail view state
  const [showExerciseDetailModal, setShowExerciseDetailModal] = useState(false);
  const [selectedExerciseDetail, setSelectedExerciseDetail] = useState<any>(null);
  
  // Exercise phase images state
  const [exercisePhaseImages, setExercisePhaseImages] = useState<any[]>([]);
  const [loadingPhaseImages, setLoadingPhaseImages] = useState(false);
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);

  // Fitness goals state
  const [fitnessGoals, setFitnessGoals] = useState<string[]>([]);

  // Fitness goal labels
  const GOAL_LABELS: { [key: string]: { label: string; icon: string; color: string } } = {
    weight_loss: { label: 'Lose Weight', icon: 'flame', color: '#EF4444' },
    muscle_gain: { label: 'Build Muscle', icon: 'barbell', color: '#3B82F6' },
    endurance: { label: 'Improve Endurance', icon: 'pulse', color: '#10B981' },
    flexibility: { label: 'Increase Flexibility', icon: 'body', color: '#8B5CF6' },
    tone: { label: 'Tone & Define', icon: 'fitness', color: '#F59E0B' },
    general: { label: 'General Fitness', icon: 'heart', color: '#EC4899' },
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [programsRes, functionalRes, exercisesRes, statsRes, prsRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/api/weight-training/programs`),
        axios.get(`${API_URL}/api/weight-training/functional-programs`),
        axios.get(`${API_URL}/api/weight-training/exercises`),
        userId ? axios.get(`${API_URL}/api/weight-training/stats/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/weight-training/prs/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/weight-training/history/${userId}?days=30`) : null,
      ]);
      
      setPrograms(programsRes.data.programs || {});
      setFunctionalPrograms(functionalRes.data.programs || {});
      setExercises(exercisesRes.data.exercises || {});
      if (statsRes) setStats(statsRes.data);
      if (prsRes) setPrs(prsRes.data.personal_records || []);
      if (historyRes) setHistory(historyRes.data.workouts || []);
      
      // Load fitness goals
      await loadFitnessGoals();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFitnessGoals = async () => {
    if (!userId) return;
    try {
      const response = await axios.get(`${API_URL}/api/profile/fitness-goals/${userId}`);
      setFitnessGoals(response.data.fitness_goals || []);
    } catch (error) {
      console.error('Error loading fitness goals:', error);
    }
  };

  // Remove a single fitness goal
  const handleRemoveGoal = async (goalId: string) => {
    Alert.alert(
      'Remove Goal',
      `Remove "${GOAL_LABELS[goalId]?.label}" from your fitness goals?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            const newGoals = fitnessGoals.filter(g => g !== goalId);
            setFitnessGoals(newGoals);
            try {
              await axios.post(`${API_URL}/api/profile/fitness-goals`, {
                user_id: userId,
                fitness_goals: newGoals,
              });
            } catch (error) {
              console.error('Error updating goals:', error);
            }
          }
        }
      ]
    );
  };

  // Reset all fitness goals
  const handleResetAllGoals = () => {
    Alert.alert(
      'Reset All Goals',
      'Remove all your fitness goals? You can set new ones after.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset All', 
          style: 'destructive',
          onPress: async () => {
            setFitnessGoals([]);
            try {
              await axios.post(`${API_URL}/api/profile/fitness-goals`, {
                user_id: userId,
                fitness_goals: [],
              });
            } catch (error) {
              console.error('Error resetting goals:', error);
            }
          }
        }
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openProgram = (programId: string) => {
    const program = programs[programId];
    // Deep clone to allow editing
    setSelectedProgram({ 
      id: programId, 
      ...program,
      days: program.days?.map((day: any) => ({
        ...day,
        exercises: day.exercises?.map((ex: any) => ({ ...ex }))
      }))
    });
    setShowProgramModal(true);
  };

  const startWorkout = (day: any) => {
    setSelectedDay(day);
    setWorkoutName(day.name);
    // Pre-populate exercises from the day's workout plan
    const prefilledExercises = day.exercises?.map((ex: any) => {
      const numSets = parseInt(ex.sets) || 3;
      const repsStr = ex.reps?.toString() || '10';
      const repsValue = repsStr.includes('-') ? repsStr.split('-')[0] : repsStr;
      
      return {
        exercise_name: ex.name,
        sets: Array.from({ length: numSets }, (_, i) => ({
          set_number: i + 1,
          weight: '',
          reps: repsValue,
          rpe: ''
        }))
      };
    }) || [];
    setWorkoutExercises(prefilledExercises);
    setCurrentSets([]);
    setCurrentExercise('');
    setShowWorkoutModal(true);
  };

  const startFullDayWorkout = (day: any) => {
    setShowProgramModal(false);
    setTimeout(() => {
      startWorkout(day);
    }, 300);
  };

  const openExerciseLibrary = (muscleGroup: string) => {
    setSelectedMuscleGroup(muscleGroup);
    setShowExerciseLibraryModal(true);
  };

  const closeExerciseLibrary = () => {
    setShowExerciseLibraryModal(false);
    setSelectedMuscleGroup(null);
  };

  const selectExerciseFromLibrary = (exerciseName: string) => {
    setCurrentExercise(exerciseName);
    closeExerciseLibrary();
  };

  const viewExerciseDetail = (exercise: any) => {
    // Close the exercise library first, then open detail after delay
    setShowExerciseLibraryModal(false);
    setSelectedExerciseDetail(exercise);
    setExercisePhaseImages([]);
    setCurrentPhaseIndex(0);
    setTimeout(() => {
      setShowExerciseDetailModal(true);
      // Load phase images after modal opens
      loadExercisePhaseImages(exercise);
    }, 350);
  };

  const loadExercisePhaseImages = async (exercise: any) => {
    setLoadingPhaseImages(true);
    try {
      // First check if images already exist in cache
      const cacheResponse = await axios.get(`${API_URL}/api/exercises/phase-images/${encodeURIComponent(exercise.name)}`);
      
      if (cacheResponse.data.exists && cacheResponse.data.phases?.length > 0) {
        setExercisePhaseImages(cacheResponse.data.phases);
        setLoadingPhaseImages(false);
        return;
      }
      
      // Generate new images
      const response = await axios.post(`${API_URL}/api/exercises/generate-phase-images`, {
        exercise_name: exercise.name,
        equipment: exercise.equipment,
        muscle_groups: exercise.muscle_groups
      }, { timeout: 180000 }); // 3 minute timeout for image generation
      
      if (response.data.phases) {
        setExercisePhaseImages(response.data.phases);
      }
    } catch (error) {
      console.error('Error loading exercise images:', error);
      // Don't show error to user, just leave images empty
    } finally {
      setLoadingPhaseImages(false);
    }
  };

  const closeExerciseDetail = () => {
    setShowExerciseDetailModal(false);
    setSelectedExerciseDetail(null);
    setExercisePhaseImages([]);
    setCurrentPhaseIndex(0);
  };

  const addSet = () => {
    setCurrentSets([...currentSets, { weight: '', reps: '', rpe: '' }]);
  };

  const updateSet = (index: number, field: string, value: string) => {
    const updated = [...currentSets];
    updated[index][field] = value;
    setCurrentSets(updated);
  };

  const removeSet = (index: number) => {
    setCurrentSets(currentSets.filter((_, i) => i !== index));
  };

  const addExerciseToWorkout = () => {
    if (!currentExercise || currentSets.length === 0) {
      Alert.alert('Missing Info', 'Please enter exercise name and at least one set');
      return;
    }

    const validSets = currentSets
      .filter(s => s.weight && s.reps)
      .map((s, i) => ({
        set_number: i + 1,
        weight: parseFloat(s.weight),
        reps: parseInt(s.reps),
        rpe: s.rpe ? parseInt(s.rpe) : null
      }));

    if (validSets.length === 0) {
      Alert.alert('Invalid Sets', 'Please enter weight and reps for at least one set');
      return;
    }

    setWorkoutExercises([
      ...workoutExercises,
      {
        exercise_name: currentExercise,
        sets: validSets
      }
    ]);
    setCurrentExercise('');
    setCurrentSets([]);
  };

  // Update exercise sets in prefilled workout
  const updateExerciseSet = (exerciseIndex: number, setIndex: number, field: string, value: string) => {
    const updated = [...workoutExercises];
    updated[exerciseIndex].sets[setIndex][field] = value;
    setWorkoutExercises(updated);
  };

  // Remove exercise from workout
  const removeExerciseFromWorkout = (index: number) => {
    setWorkoutExercises(workoutExercises.filter((_, i) => i !== index));
  };

  // Move exercise up in workout
  const moveExerciseUp = (index: number) => {
    if (index === 0) return;
    const updated = [...workoutExercises];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    setWorkoutExercises(updated);
  };

  // Move exercise down in workout
  const moveExerciseDown = (index: number) => {
    if (index === workoutExercises.length - 1) return;
    const updated = [...workoutExercises];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    setWorkoutExercises(updated);
  };

  // Edit exercise in program - using inline expansion instead of nested modal
  const openEditExercise = (dayIndex: number, exerciseIndex: number, exercise: any) => {
    const key = `${dayIndex}-${exerciseIndex}`;
    
    // If same exercise is clicked, collapse it
    if (expandedExerciseKey === key) {
      setExpandedExerciseKey(null);
      return;
    }
    
    // Expand and populate edit fields
    setEditingDayIndex(dayIndex);
    setEditingExerciseIndex(exerciseIndex);
    setEditingExercise(exercise);
    setEditExName(exercise.name);
    setEditExSets(exercise.sets?.toString() || '3');
    setEditExReps(exercise.reps || '10');
    setEditExRest(exercise.rest?.toString() || '60');
    setExpandedExerciseKey(key);
  };

  const saveExerciseEdit = () => {
    if (!selectedProgram || editingDayIndex === null || editingExerciseIndex === null) return;
    
    const updated = { ...selectedProgram };
    updated.days[editingDayIndex].exercises[editingExerciseIndex] = {
      ...editingExercise,
      name: editExName,
      sets: parseInt(editExSets) || 3,
      reps: editExReps,
      rest: parseInt(editExRest) || 60,
    };
    setSelectedProgram(updated);
    setExpandedExerciseKey(null);
  };

  const cancelExerciseEdit = () => {
    setExpandedExerciseKey(null);
  };

  // Move exercise up in program day
  const moveExerciseUpInDay = (dayIndex: number, exerciseIndex: number) => {
    if (exerciseIndex === 0) return;
    const updated = { ...selectedProgram };
    const exercises = [...updated.days[dayIndex].exercises];
    [exercises[exerciseIndex - 1], exercises[exerciseIndex]] = [exercises[exerciseIndex], exercises[exerciseIndex - 1]];
    updated.days[dayIndex].exercises = exercises;
    setSelectedProgram(updated);
  };

  // Move exercise down in program day
  const moveExerciseDownInDay = (dayIndex: number, exerciseIndex: number) => {
    if (!selectedProgram || exerciseIndex === selectedProgram.days[dayIndex].exercises.length - 1) return;
    const updated = { ...selectedProgram };
    const exercises = [...updated.days[dayIndex].exercises];
    [exercises[exerciseIndex], exercises[exerciseIndex + 1]] = [exercises[exerciseIndex + 1], exercises[exerciseIndex]];
    updated.days[dayIndex].exercises = exercises;
    setSelectedProgram(updated);
  };

  // Delete exercise from program day
  const deleteExerciseFromDay = (dayIndex: number, exerciseIndex: number) => {
    Alert.alert(
      'Remove Exercise',
      'Are you sure you want to remove this exercise?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const updated = { ...selectedProgram };
            updated.days[dayIndex].exercises = updated.days[dayIndex].exercises.filter((_: any, i: number) => i !== exerciseIndex);
            setSelectedProgram(updated);
          }
        }
      ]
    );
  };

  const saveWorkout = async () => {
    // Filter exercises that have at least one completed set and convert to proper types
    const completedExercises = workoutExercises
      .map(ex => ({
        ...ex,
        sets: ex.sets
          .filter((s: any) => s.weight && s.reps)
          .map((s: any, idx: number) => ({
            set_number: idx + 1,
            weight: parseFloat(s.weight) || 0,
            reps: parseInt(s.reps) || 0,
            rpe: s.rpe ? parseInt(s.rpe) : null
          }))
      }))
      .filter(ex => ex.sets.length > 0);

    if (completedExercises.length === 0) {
      Alert.alert('No Exercises', 'Please complete at least one set with weight and reps');
      return;
    }

    setSavingWorkout(true);
    try {
      const response = await axios.post(`${API_URL}/api/weight-training/log`, {
        workout_id: `wt_${Date.now()}`,
        user_id: userId,
        workout_name: workoutName || 'Weight Training',
        exercises: completedExercises,
        duration_minutes: 60,
        notes: ''
      });

      const { new_prs, total_volume } = response.data;
      
      let message = `Total volume: ${total_volume.toLocaleString()} lbs`;
      if (new_prs && new_prs.length > 0) {
        message += `\n\n🏆 NEW PRs:\n${new_prs.map((pr: any) => `${pr.exercise}: ${pr.weight}lbs x ${pr.reps}`).join('\n')}`;
      }

      // Show success and offer to view in Plans
      Alert.alert(
        '💪 Workout Complete!', 
        message,
        [
          { text: 'OK', style: 'cancel' },
          { 
            text: 'View in Plans', 
            onPress: () => router.push('/(tabs)/plans')
          }
        ]
      );
      setShowWorkoutModal(false);
      loadData();
    } catch (error: any) {
      console.error('Save workout error:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save workout');
    } finally {
      setSavingWorkout(false);
    }
  };

  // Delete a workout from history
  const confirmDeleteWorkout = (workout: any) => {
    Alert.alert(
      'Delete Workout',
      `Are you sure you want to delete "${workout.workout_name}"?\n\nThis will remove it from your history and stats.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteWorkout(workout.log_id)
        },
      ]
    );
  };

  const handleDeleteWorkout = async (workoutId: string) => {
    try {
      await axios.delete(`${API_URL}/api/weight-training/log/${workoutId}?user_id=${userId}`);
      setHistory(prev => prev.filter(w => w.log_id !== workoutId));
      Alert.alert('Deleted', 'Workout has been removed from your history.');
      loadData(); // Refresh stats
    } catch (error) {
      console.error('Delete workout error:', error);
      Alert.alert('Error', 'Failed to delete workout');
    }
  };

  const quickLogWorkout = () => {
    setWorkoutName('Quick Workout');
    setWorkoutExercises([]);
    setCurrentSets([]);
    setSelectedDay(null);
    setShowWorkoutModal(true);
  };

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'beginner': return '#10B981';
      case 'intermediate': return '#F59E0B';
      case 'advanced': return '#EF4444';
      case 'all_levels': return '#3B82F6';
      default: return theme.colors.text.secondary;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'bodyweight': return '#10B981';
      case 'kettlebell': return '#F59E0B';
      case 'barbell': return '#EF4444';
      case 'mixed': return '#8B5CF6';
      default: return '#3B82F6';
    }
  };

  const getMuscleIcon = (muscle: string) => {
    const icons: any = {
      chest: '🫁',
      back: '🔙',
      shoulders: '💪',
      legs: '🦵',
      arms: '💪',
      core: '🎯'
    };
    return icons[muscle] || '💪';
  };

  const styles = createStyles(theme);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.accentColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>Training Programs</Text>
            <Text style={styles.subtitle}>Build strength & track progress</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Quick Log Button */}
        <TouchableOpacity onPress={quickLogWorkout}>
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            style={styles.quickLogCard}
          >
            <MaterialCommunityIcons name="dumbbell" size={40} color="#fff" />
            <View style={styles.quickLogText}>
              <Text style={styles.quickLogTitle}>Log Workout</Text>
              <Text style={styles.quickLogSubtitle}>Track your sets, reps & weight</Text>
            </View>
            <Ionicons name="add-circle" size={32} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* My Fitness Goals Section */}
        <View style={styles.section}>
          <View style={styles.goalsHeader}>
            <Text style={styles.sectionTitle}>🎯 My Fitness Goals</Text>
            <TouchableOpacity 
              style={[styles.adjustGoalsBtn, { backgroundColor: theme.accentColors.primary }]}
              onPress={() => router.push('/fitness-goals')}
            >
              <Ionicons name={fitnessGoals.length > 0 ? "add" : "fitness"} size={16} color="#fff" />
              <Text style={styles.adjustGoalsBtnText}>
                {fitnessGoals.length > 0 ? 'Add Goals' : 'Set Goals'}
              </Text>
            </TouchableOpacity>
          </View>
          
          {fitnessGoals.length > 0 ? (
            <View style={styles.goalsGrid}>
              {fitnessGoals.map((goalId) => {
                const goal = GOAL_LABELS[goalId];
                if (!goal) return null;
                return (
                  <TouchableOpacity 
                    key={goalId} 
                    style={[styles.goalTag, { backgroundColor: `${goal.color}15` }]}
                    onPress={() => handleRemoveGoal(goalId)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={goal.icon as any} size={16} color={goal.color} />
                    <Text style={[styles.goalTagText, { color: goal.color }]}>{goal.label}</Text>
                    <Ionicons name="close-circle" size={16} color={goal.color} style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.setGoalsPrompt, { borderColor: theme.colors.border.primary }]}
              onPress={() => router.push('/fitness-goals')}
            >
              <MaterialCommunityIcons name="target" size={24} color={theme.accentColors.primary} />
              <Text style={[styles.setGoalsPromptText, { color: theme.colors.text.secondary }]}>
                Tap to set your fitness goals and get an AI-powered workout plan
              </Text>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.text.muted} />
            </TouchableOpacity>
          )}
          
          {/* Reset All Goals Button */}
          {fitnessGoals.length > 0 && (
            <TouchableOpacity 
              style={styles.resetGoalsBtn}
              onPress={handleResetAllGoals}
            >
              <Ionicons name="refresh" size={14} color={theme.colors.text.muted} />
              <Text style={[styles.resetGoalsBtnText, { color: theme.colors.text.muted }]}>Reset all goals</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Overview */}
        {stats && stats.total_workouts > 0 && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total_workouts}</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{(stats.total_volume / 1000).toFixed(1)}k</Text>
              <Text style={styles.statLabel}>Total lbs</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total_sets}</Text>
              <Text style={styles.statLabel}>Sets</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total_prs}</Text>
              <Text style={styles.statLabel}>PRs</Text>
            </View>
          </View>
        )}

        {/* Personal Records */}
        {prs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 Personal Records</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.prsRow}>
                {prs.slice(0, 5).map((pr, index) => (
                  <View key={index} style={styles.prCard}>
                    <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                    <Text style={styles.prWeight}>{pr.weight} lbs</Text>
                    <Text style={styles.prReps}>x {pr.reps} reps</Text>
                    <Text style={styles.pr1rm}>Est 1RM: {pr.estimated_1rm?.toFixed(0)} lbs</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Training Programs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Programs</Text>
          
          {/* Weight Training Subsection */}
          <View style={styles.subsection}>
            <View style={styles.subsectionHeader}>
              <MaterialCommunityIcons name="weight-lifter" size={20} color="#7C3AED" />
              <Text style={styles.subsectionTitle}>Weight Training</Text>
            </View>
            {Object.entries(programs).map(([key, program]: [string, any]) => (
              <TouchableOpacity
                key={key}
                style={styles.programCard}
                onPress={() => openProgram(key)}
              >
                <View style={styles.programLeft}>
                  <View style={[styles.programIcon, { backgroundColor: '#7C3AED20' }]}>
                    <MaterialCommunityIcons name="dumbbell" size={28} color="#7C3AED" />
                  </View>
                  <View style={styles.programInfo}>
                    <Text style={styles.programName}>{program.name}</Text>
                    <Text style={styles.programDescription}>{program.description}</Text>
                    <View style={styles.programMeta}>
                      <View style={styles.programBadge}>
                        <Ionicons name="calendar" size={12} color={theme.colors.text.secondary} />
                        <Text style={styles.programBadgeText}>{program.frequency}</Text>
                      </View>
                      <View style={[styles.programBadge, { backgroundColor: getLevelColor(program.level) + '20' }]}>
                        <Text style={[styles.programBadgeText, { color: getLevelColor(program.level) }]}>
                          {program.level}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color={theme.colors.text.muted} />
              </TouchableOpacity>
            ))}
          </View>

          {/* Functional Training Subsection */}
          <View style={styles.subsection}>
            <View style={styles.subsectionHeader}>
              <MaterialCommunityIcons name="fire" size={20} color="#EF4444" />
              <Text style={styles.subsectionTitle}>Functional Training</Text>
              <Text style={styles.subsectionBadge}>FitTrax HIIT</Text>
            </View>
            {Object.entries(functionalPrograms).map(([key, program]: [string, any]) => (
              <TouchableOpacity
                key={key}
                style={styles.functionalCard}
                onPress={() => {
                  setSelectedFunctionalProgram({ id: key, ...program });
                  setShowFunctionalModal(true);
                }}
              >
                <Image 
                  source={{ uri: program.image }} 
                  style={styles.functionalImage}
                  resizeMode="cover"
                />
                <View style={styles.functionalOverlay}>
                  <View style={styles.functionalContent}>
                    <View style={styles.functionalBadges}>
                      <View style={[styles.typeBadge, { backgroundColor: getTypeColor(program.type) }]}>
                        <Text style={styles.typeBadgeText}>{program.type.toUpperCase()}</Text>
                      </View>
                      <View style={[styles.programBadge, { backgroundColor: getLevelColor(program.level) + '40' }]}>
                        <Text style={[styles.programBadgeText, { color: '#fff' }]}>
                          {program.level === 'all_levels' ? 'ALL LEVELS' : program.level.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.functionalName}>{program.name}</Text>
                    <Text style={styles.functionalDescription}>{program.description}</Text>
                    <View style={styles.functionalMeta}>
                      <View style={styles.functionalMetaItem}>
                        <Ionicons name="time-outline" size={14} color="#fff" />
                        <Text style={styles.functionalMetaText}>{program.duration}</Text>
                      </View>
                      <View style={styles.functionalMetaItem}>
                        <Ionicons name="repeat" size={14} color="#fff" />
                        <Text style={styles.functionalMetaText}>{program.rounds} rounds</Text>
                      </View>
                      <View style={styles.functionalMetaItem}>
                        <Ionicons name="fitness" size={14} color="#fff" />
                        <Text style={styles.functionalMetaText}>{program.stations?.length} stations</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Exercise Library */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exercise Library</Text>
          <Text style={styles.sectionSubtitle}>Tap to view exercises</Text>
          <View style={styles.muscleGroups}>
            {Object.entries(exercises).map(([muscle, exList]: [string, any]) => (
              <TouchableOpacity 
                key={muscle} 
                style={styles.muscleCard}
                onPress={() => openExerciseLibrary(muscle)}
              >
                <Image 
                  source={{ uri: MUSCLE_GROUP_IMAGES[muscle] || MUSCLE_GROUP_IMAGES.chest }}
                  style={styles.muscleImage}
                  resizeMode="cover"
                />
                <View style={styles.muscleOverlay}>
                  <Text style={styles.muscleName}>{muscle.charAt(0).toUpperCase() + muscle.slice(1)}</Text>
                  <Text style={styles.muscleCount}>{exList.length} exercises</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Workouts */}
        {history.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Workouts</Text>
            <Text style={[styles.historyHint, { color: theme.colors.text.muted }]}>
              💡 Long press to delete
            </Text>
            {history.slice(0, 5).map((workout, index) => (
              <Pressable 
                key={index} 
                style={[styles.historyCard, { backgroundColor: theme.colors.background.card }]}
                onPress={() => {
                  setSelectedPastWorkout(workout);
                  setShowPastWorkoutModal(true);
                }}
                onLongPress={() => confirmDeleteWorkout(workout)}
                delayLongPress={500}
              >
                <View style={styles.historyIcon}>
                  <MaterialCommunityIcons name="dumbbell" size={24} color="#7C3AED" />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={[styles.historyName, { color: theme.colors.text.primary }]}>{workout.workout_name}</Text>
                  <Text style={[styles.historyMeta, { color: theme.colors.text.secondary }]}>
                    {workout.exercises?.length || 0} exercises • {workout.duration_minutes} min
                  </Text>
                </View>
                <View style={styles.historyRight}>
                  <Text style={[styles.historyDate, { color: theme.colors.text.muted }]}>
                    {new Date(workout.timestamp).toLocaleDateString()}
                  </Text>
                  <TouchableOpacity 
                    style={styles.historyDeleteBtn}
                    onPress={() => confirmDeleteWorkout(workout)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Functional Training Modal */}
      <Modal
        visible={showFunctionalModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFunctionalModal(false)}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowFunctionalModal(false)} style={styles.closeButtonContainer}>
              <Ionicons name="close" size={28} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedFunctionalProgram?.name || 'Workout'}</Text>
            <View style={{ width: 40 }} />
          </View>
          
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Workout Header Image */}
            {selectedFunctionalProgram?.image && (
              <Image 
                source={{ uri: selectedFunctionalProgram.image }}
                style={{ width: '100%', height: 200, borderRadius: 16, marginBottom: 16 }}
                resizeMode="cover"
              />
            )}
            
            {/* Workout Info */}
            <View style={[styles.functionalInfoCard, { backgroundColor: theme.colors.background.card }]}>
              <Text style={[styles.functionalInfoTitle, { color: theme.colors.text.primary }]}>
                {selectedFunctionalProgram?.description}
              </Text>
              <View style={styles.functionalInfoRow}>
                <View style={styles.functionalInfoItem}>
                  <Ionicons name="time-outline" size={20} color={getTypeColor(selectedFunctionalProgram?.type || 'mixed')} />
                  <Text style={[styles.functionalInfoLabel, { color: theme.colors.text.secondary }]}>Duration</Text>
                  <Text style={[styles.functionalInfoValue, { color: theme.colors.text.primary }]}>{selectedFunctionalProgram?.duration}</Text>
                </View>
                <View style={styles.functionalInfoItem}>
                  <Ionicons name="repeat" size={20} color={getTypeColor(selectedFunctionalProgram?.type || 'mixed')} />
                  <Text style={[styles.functionalInfoLabel, { color: theme.colors.text.secondary }]}>Rounds</Text>
                  <Text style={[styles.functionalInfoValue, { color: theme.colors.text.primary }]}>{selectedFunctionalProgram?.rounds}</Text>
                </View>
                <View style={styles.functionalInfoItem}>
                  <Ionicons name="fitness" size={20} color={getTypeColor(selectedFunctionalProgram?.type || 'mixed')} />
                  <Text style={[styles.functionalInfoLabel, { color: theme.colors.text.secondary }]}>Stations</Text>
                  <Text style={[styles.functionalInfoValue, { color: theme.colors.text.primary }]}>{selectedFunctionalProgram?.stations?.length}</Text>
                </View>
              </View>
            </View>
            
            {/* Stations List */}
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Workout Stations</Text>
            {selectedFunctionalProgram?.stations?.map((station: any, index: number) => (
              <View key={index} style={[styles.stationCard, { backgroundColor: theme.colors.background.card }]}>
                <Image 
                  source={{ uri: station.image }}
                  style={styles.stationImage}
                  resizeMode="cover"
                />
                <View style={styles.stationContent}>
                  <View style={styles.stationHeader}>
                    <View style={[styles.stationNumber, { backgroundColor: getTypeColor(selectedFunctionalProgram?.type || 'mixed') }]}>
                      <Text style={styles.stationNumberText}>{index + 1}</Text>
                    </View>
                    <Text style={[styles.stationName, { color: theme.colors.text.primary }]}>{station.name}</Text>
                  </View>
                  <Text style={[styles.stationDescription, { color: theme.colors.text.secondary }]}>{station.description}</Text>
                  <View style={styles.stationTiming}>
                    <View style={styles.stationTimingItem}>
                      <Ionicons name="play" size={14} color="#10B981" />
                      <Text style={[styles.stationTimingText, { color: theme.colors.text.primary }]}>{station.duration}</Text>
                    </View>
                    <View style={styles.stationTimingItem}>
                      <Ionicons name="pause" size={14} color="#EF4444" />
                      <Text style={[styles.stationTimingText, { color: theme.colors.text.secondary }]}>{station.rest} rest</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            
            {/* Start Workout Button */}
            <TouchableOpacity 
              style={[styles.startWorkoutButton, { backgroundColor: getTypeColor(selectedFunctionalProgram?.type || 'mixed') }]}
              onPress={() => {
                setShowFunctionalModal(false);
                router.push({
                  pathname: '/functional-workout-timer',
                  params: { workout: JSON.stringify(selectedFunctionalProgram) }
                });
              }}
            >
              <Ionicons name="play" size={24} color="#fff" />
              <Text style={styles.startWorkoutButtonText}>Start Workout</Text>
            </TouchableOpacity>
            
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Exercise Library Modal */}
      <Modal
        visible={showExerciseLibraryModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeExerciseLibrary}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeExerciseLibrary} style={styles.closeButtonContainer}>
              <Ionicons name="close-circle" size={32} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.colors.text.primary }]}>
              {selectedMuscleGroup ? selectedMuscleGroup.charAt(0).toUpperCase() + selectedMuscleGroup.slice(1) : ''} Exercises
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <FlatList
            data={selectedMuscleGroup ? exercises[selectedMuscleGroup] || [] : []}
            keyExtractor={(item, index) => `${item.name}-${index}`}
            contentContainerStyle={{ padding: 16 }}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.exerciseItem, { marginHorizontal: 0 }]}
                onPress={() => viewExerciseDetail(item)}
              >
                <View style={styles.exerciseItemLeft}>
                  <Image 
                    source={{ uri: getExerciseImage(item.name, selectedMuscleGroup || undefined) }}
                    style={styles.exerciseItemImage}
                    resizeMode="cover"
                  />
                  <View style={styles.exerciseItemInfo}>
                    <Text style={styles.exerciseItemName}>{item.name}</Text>
                    <Text style={styles.exerciseItemEquipment}>
                      {item.equipment?.join(', ')}
                    </Text>
                    <View style={styles.muscleTagsRow}>
                      {item.muscle_groups?.slice(0, 3).map((mg: string, idx: number) => (
                        <View key={idx} style={styles.muscleTag}>
                          <Text style={styles.muscleTagText}>{mg}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={24} color={theme.colors.text.muted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>No exercises found</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Program Detail Modal - FIXED SCROLLING */}
      <Modal
        visible={showProgramModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowProgramModal(false)}
      >
        <View style={styles.fullScreenModalContainer}>
          <View style={styles.fullScreenModalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowProgramModal(false)}>
                <Ionicons name="close" size={28} color={theme.colors.text.primary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{selectedProgram?.name}</Text>
              <View style={{ width: 28 }} />
            </View>

            {selectedProgram && (
              <ScrollView 
                style={styles.programScrollView}
                contentContainerStyle={styles.programScrollContent}
                showsVerticalScrollIndicator={true}
              >
                <Text style={styles.programDetailDesc}>{selectedProgram.description}</Text>
                <View style={styles.programDetailMeta}>
                  <Text style={styles.programDetailFreq}>📅 {selectedProgram.frequency}</Text>
                  <Text style={styles.programDetailLevel}>💪 {selectedProgram.level}</Text>
                </View>

                <Text style={styles.instructionText}>
                  Tap exercises to edit • Use arrows to reorder • Tap Start to begin workout
                </Text>

                {selectedProgram.days?.map((day: any, dayIndex: number) => (
                  <View key={dayIndex} style={styles.dayCard}>
                    <View style={styles.dayHeader}>
                      <View>
                        <Text style={styles.dayName}>{day.name}</Text>
                        <Text style={styles.dayFocus}>Focus: {day.focus?.join(', ')}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.startAllBtn}
                        onPress={() => startFullDayWorkout(day)}
                      >
                        <Ionicons name="play" size={18} color="#fff" />
                        <Text style={styles.startAllBtnText}>Start All</Text>
                      </TouchableOpacity>
                    </View>
                    
                    {day.exercises?.map((ex: any, exIndex: number) => {
                      const exerciseKey = `${dayIndex}-${exIndex}`;
                      const isExpanded = expandedExerciseKey === exerciseKey;
                      
                      return (
                        <View key={exIndex}>
                          <View style={styles.dayExerciseEditable}>
                            <View style={styles.exerciseReorderBtns}>
                              <TouchableOpacity 
                                onPress={() => moveExerciseUpInDay(dayIndex, exIndex)}
                                style={[styles.reorderBtn, exIndex === 0 && styles.reorderBtnDisabled]}
                                disabled={exIndex === 0}
                              >
                                <Ionicons name="chevron-up" size={18} color={exIndex === 0 ? theme.colors.text.muted : theme.accentColors.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity 
                                onPress={() => moveExerciseDownInDay(dayIndex, exIndex)}
                                style={[styles.reorderBtn, exIndex === day.exercises.length - 1 && styles.reorderBtnDisabled]}
                                disabled={exIndex === day.exercises.length - 1}
                              >
                                <Ionicons name="chevron-down" size={18} color={exIndex === day.exercises.length - 1 ? theme.colors.text.muted : theme.accentColors.primary} />
                              </TouchableOpacity>
                            </View>

                            <TouchableOpacity 
                              style={styles.dayExInfo}
                              onPress={() => openEditExercise(dayIndex, exIndex, ex)}
                            >
                              <Text style={styles.dayExNumber}>{exIndex + 1}</Text>
                              <View style={styles.dayExDetails}>
                                <Text style={styles.dayExName}>{ex.name}</Text>
                                <Text style={styles.dayExMeta}>
                                  {ex.sets} sets × {ex.reps} • {ex.rest}s rest
                                </Text>
                              </View>
                              <Ionicons name={isExpanded ? "chevron-up" : "pencil"} size={16} color={isExpanded ? theme.accentColors.primary : theme.colors.text.muted} />
                            </TouchableOpacity>

                            <TouchableOpacity 
                              style={styles.deleteExBtn}
                              onPress={() => deleteExerciseFromDay(dayIndex, exIndex)}
                            >
                              <Ionicons name="trash-outline" size={18} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                          
                          {/* Inline Edit Form */}
                          {isExpanded && (
                            <View style={styles.inlineEditForm}>
                              <View style={styles.inlineEditRow}>
                                <Text style={styles.inlineEditLabel}>Name</Text>
                                <TextInput
                                  style={styles.inlineEditInput}
                                  value={editExName}
                                  onChangeText={setEditExName}
                                  placeholder="Exercise name"
                                  placeholderTextColor={theme.colors.text.muted}
                                />
                              </View>
                              <View style={styles.inlineEditGrid}>
                                <View style={styles.inlineEditGridItem}>
                                  <Text style={styles.inlineEditLabel}>Sets</Text>
                                  <TextInput
                                    style={styles.inlineEditInputSmall}
                                    value={editExSets}
                                    onChangeText={setEditExSets}
                                    keyboardType="numeric"
                                    placeholder="3"
                                    placeholderTextColor={theme.colors.text.muted}
                                  />
                                </View>
                                <View style={styles.inlineEditGridItem}>
                                  <Text style={styles.inlineEditLabel}>Reps</Text>
                                  <TextInput
                                    style={styles.inlineEditInputSmall}
                                    value={editExReps}
                                    onChangeText={setEditExReps}
                                    placeholder="8-12"
                                    placeholderTextColor={theme.colors.text.muted}
                                  />
                                </View>
                                <View style={styles.inlineEditGridItem}>
                                  <Text style={styles.inlineEditLabel}>Rest</Text>
                                  <TextInput
                                    style={styles.inlineEditInputSmall}
                                    value={editExRest}
                                    onChangeText={setEditExRest}
                                    keyboardType="numeric"
                                    placeholder="60"
                                    placeholderTextColor={theme.colors.text.muted}
                                  />
                                </View>
                              </View>
                              <View style={styles.inlineEditActions}>
                                <TouchableOpacity 
                                  style={styles.inlineEditCancel}
                                  onPress={cancelExerciseEdit}
                                >
                                  <Text style={styles.inlineEditCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity 
                                  style={styles.inlineEditSave}
                                  onPress={saveExerciseEdit}
                                >
                                  <Text style={styles.inlineEditSaveText}>Save Changes</Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}

                <View style={{ height: 100 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Workout Logging Modal */}
      <Modal
        visible={showWorkoutModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowWorkoutModal(false)}
      >
        <View style={styles.fullScreenModalContainer}>
          <View style={styles.fullScreenModalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowWorkoutModal(false)}>
                <Ionicons name="close" size={28} color={theme.colors.text.primary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Log Workout</Text>
              <TouchableOpacity onPress={saveWorkout} disabled={savingWorkout}>
                {savingWorkout ? (
                  <ActivityIndicator size="small" color={theme.accentColors.primary} />
                ) : (
                  <Text style={styles.saveBtn}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.workoutScrollView} contentContainerStyle={styles.workoutScrollContent}>
              {/* Workout Name */}
              <Text style={styles.inputLabel}>Workout Name</Text>
              <TextInput
                style={styles.textInput}
                value={workoutName}
                onChangeText={setWorkoutName}
                placeholder="e.g., Push Day"
                placeholderTextColor={theme.colors.text.muted}
              />

              {/* Pre-filled Exercises from Program */}
              {workoutExercises.length > 0 && (
                <View style={styles.prefilledSection}>
                  <Text style={styles.prefilledTitle}>
                    Exercises ({workoutExercises.length})
                  </Text>
                  <Text style={styles.prefilledHint}>
                    Fill in your weights • Use arrows to reorder
                  </Text>
                  
                  {workoutExercises.map((ex, exIndex) => (
                    <View key={exIndex} style={styles.prefilledExercise}>
                      <View style={styles.prefilledExHeader}>
                        <View style={styles.exerciseReorderBtns}>
                          <TouchableOpacity 
                            onPress={() => moveExerciseUp(exIndex)}
                            style={[styles.smallReorderBtn, exIndex === 0 && styles.reorderBtnDisabled]}
                          >
                            <Ionicons name="chevron-up" size={16} color={exIndex === 0 ? theme.colors.text.muted : '#7C3AED'} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => moveExerciseDown(exIndex)}
                            style={[styles.smallReorderBtn, exIndex === workoutExercises.length - 1 && styles.reorderBtnDisabled]}
                          >
                            <Ionicons name="chevron-down" size={16} color={exIndex === workoutExercises.length - 1 ? theme.colors.text.muted : '#7C3AED'} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.prefilledExName}>{ex.exercise_name}</Text>
                        <TouchableOpacity onPress={() => removeExerciseFromWorkout(exIndex)}>
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                      
                      {ex.sets.map((set: any, setIndex: number) => (
                        <View key={setIndex} style={styles.prefilledSet}>
                          <Text style={styles.prefilledSetNum}>Set {set.set_number}</Text>
                          <TextInput
                            style={styles.prefilledInput}
                            value={set.weight?.toString() || ''}
                            onChangeText={(v) => updateExerciseSet(exIndex, setIndex, 'weight', v)}
                            placeholder="Weight"
                            placeholderTextColor={theme.colors.text.muted}
                            keyboardType="numeric"
                          />
                          <Text style={styles.prefilledX}>×</Text>
                          <TextInput
                            style={styles.prefilledInput}
                            value={set.reps?.toString() || ''}
                            onChangeText={(v) => updateExerciseSet(exIndex, setIndex, 'reps', v)}
                            placeholder="Reps"
                            placeholderTextColor={theme.colors.text.muted}
                            keyboardType="numeric"
                          />
                        </View>
                      ))}
                    </View>
                  ))}
                </View>
              )}

              {/* Add New Exercise Section */}
              <View style={styles.addExerciseSection}>
                <Text style={styles.inputLabel}>Add New Exercise</Text>
                <View style={styles.exerciseInputRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={currentExercise}
                    onChangeText={setCurrentExercise}
                    placeholder="Exercise name"
                    placeholderTextColor={theme.colors.text.muted}
                  />
                  <TouchableOpacity 
                    style={styles.browseBtn}
                    onPress={() => openExerciseLibrary('chest')}
                  >
                    <Ionicons name="search" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>

                {/* Sets */}
                <View style={styles.setsHeader}>
                  <Text style={styles.setsLabel}>Sets</Text>
                  <TouchableOpacity style={styles.addSetBtn} onPress={addSet}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addSetBtnText}>Add Set</Text>
                  </TouchableOpacity>
                </View>

                {currentSets.map((set, index) => (
                  <View key={index} style={styles.setRow}>
                    <Text style={styles.setNumber}>#{index + 1}</Text>
                    <TextInput
                      style={styles.setInput}
                      value={set.weight}
                      onChangeText={(v) => updateSet(index, 'weight', v)}
                      placeholder="Weight"
                      placeholderTextColor={theme.colors.text.muted}
                      keyboardType="numeric"
                    />
                    <Text style={styles.setX}>×</Text>
                    <TextInput
                      style={styles.setInput}
                      value={set.reps}
                      onChangeText={(v) => updateSet(index, 'reps', v)}
                      placeholder="Reps"
                      placeholderTextColor={theme.colors.text.muted}
                      keyboardType="numeric"
                    />
                    <TouchableOpacity onPress={() => removeSet(index)}>
                      <Ionicons name="close-circle" size={24} color={theme.colors.text.muted} />
                    </TouchableOpacity>
                  </View>
                ))}

                {currentExercise && currentSets.length > 0 && (
                  <TouchableOpacity style={styles.addExerciseBtn} onPress={addExerciseToWorkout}>
                    <Text style={styles.addExerciseBtnText}>+ Add to Workout</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={{ height: 100 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Past Workout Detail Modal */}
      <Modal
        visible={showPastWorkoutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPastWorkoutModal(false)}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
          <View style={styles.pastWorkoutHeader}>
            <TouchableOpacity 
              onPress={() => setShowPastWorkoutModal(false)}
              style={styles.closeButtonContainer}
            >
              <Ionicons name="close-circle" size={32} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.pastWorkoutTitle, { color: theme.colors.text.primary }]}>Workout Details</Text>
            <View style={{ width: 40 }} />
          </View>

          {selectedPastWorkout && (
            <ScrollView style={styles.pastWorkoutContent}>
              {/* Workout Header */}
              <View style={[styles.pastWorkoutInfo, { backgroundColor: theme.colors.background.card }]}>
                <Text style={[styles.pastWorkoutName, { color: theme.colors.text.primary }]}>
                  {selectedPastWorkout.workout_name}
                </Text>
                <Text style={[styles.pastWorkoutDate, { color: theme.colors.text.secondary }]}>
                  {new Date(selectedPastWorkout.timestamp).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </Text>
                <View style={styles.pastWorkoutStats}>
                  <View style={[styles.pastWorkoutStat, { backgroundColor: theme.colors.background.secondary }]}>
                    <MaterialCommunityIcons name="dumbbell" size={20} color={theme.accentColors.primary} />
                    <Text style={[styles.pastWorkoutStatValue, { color: theme.colors.text.primary }]}>
                      {selectedPastWorkout.exercises?.length || 0}
                    </Text>
                    <Text style={[styles.pastWorkoutStatLabel, { color: theme.colors.text.secondary }]}>Exercises</Text>
                  </View>
                  <View style={[styles.pastWorkoutStat, { backgroundColor: theme.colors.background.secondary }]}>
                    <Ionicons name="time-outline" size={20} color={theme.accentColors.primary} />
                    <Text style={[styles.pastWorkoutStatValue, { color: theme.colors.text.primary }]}>
                      {selectedPastWorkout.duration_minutes || 0}
                    </Text>
                    <Text style={[styles.pastWorkoutStatLabel, { color: theme.colors.text.secondary }]}>Minutes</Text>
                  </View>
                  <View style={[styles.pastWorkoutStat, { backgroundColor: theme.colors.background.secondary }]}>
                    <Ionicons name="barbell-outline" size={20} color={theme.accentColors.primary} />
                    <Text style={[styles.pastWorkoutStatValue, { color: theme.colors.text.primary }]}>
                      {selectedPastWorkout.exercises?.reduce((acc: number, ex: any) => 
                        acc + (ex.sets?.reduce((setAcc: number, set: any) => 
                          setAcc + ((parseFloat(set.weight) || 0) * (parseInt(set.reps) || 0)), 0) || 0), 0
                      ).toLocaleString() || 0}
                    </Text>
                    <Text style={[styles.pastWorkoutStatLabel, { color: theme.colors.text.secondary }]}>Volume (lbs)</Text>
                  </View>
                </View>
              </View>

              {/* Exercises List */}
              <Text style={[styles.pastWorkoutSectionTitle, { color: theme.colors.text.primary }]}>
                Exercises Performed
              </Text>
              {selectedPastWorkout.exercises?.map((exercise: any, index: number) => (
                <View key={index} style={[styles.pastExerciseCard, { backgroundColor: theme.colors.background.card }]}>
                  <Text style={[styles.pastExerciseName, { color: theme.colors.text.primary }]}>
                    {exercise.exercise_name || exercise.name}
                  </Text>
                  <View style={styles.pastExerciseSets}>
                    {exercise.sets?.map((set: any, setIndex: number) => (
                      <View key={setIndex} style={[styles.pastSetRow, { backgroundColor: theme.colors.background.secondary }]}>
                        <Text style={[styles.pastSetNumber, { color: theme.colors.text.secondary }]}>
                          Set {set.set_number || setIndex + 1}
                        </Text>
                        <Text style={[styles.pastSetWeight, { color: theme.colors.text.primary }]}>
                          {set.weight} lbs
                        </Text>
                        <Text style={[styles.pastSetReps, { color: theme.accentColors.primary }]}>
                          × {set.reps} reps
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}

              {selectedPastWorkout.notes && (
                <View style={[styles.pastWorkoutNotes, { backgroundColor: theme.colors.background.card }]}>
                  <Text style={[styles.pastWorkoutNotesLabel, { color: theme.colors.text.secondary }]}>Notes</Text>
                  <Text style={[styles.pastWorkoutNotesText, { color: theme.colors.text.primary }]}>
                    {selectedPastWorkout.notes}
                  </Text>
                </View>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Exercise Detail Modal */}
      <Modal
        visible={showExerciseDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeExerciseDetail}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background.primary }]}>
          <View style={styles.exerciseDetailHeader}>
            <TouchableOpacity 
              onPress={closeExerciseDetail}
              style={styles.closeButtonContainer}
            >
              <Ionicons name="close-circle" size={32} color={theme.colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.exerciseDetailTitle, { color: theme.colors.text.primary }]}>
              Exercise Details
            </Text>
            <TouchableOpacity 
              onPress={() => {
                if (selectedExerciseDetail) {
                  setCurrentExercise(selectedExerciseDetail.name);
                  closeExerciseDetail();
                }
              }}
              style={styles.addToWorkoutBtn}
            >
              <Text style={styles.addToWorkoutBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {selectedExerciseDetail && (
            <ScrollView style={styles.exerciseDetailContent}>
              {/* Exercise Name Header */}
              <View style={[styles.exerciseDetailTop, { backgroundColor: theme.colors.background.card }]}>
                <Text style={[styles.exerciseDetailName, { color: theme.colors.text.primary }]}>
                  {selectedExerciseDetail.name}
                </Text>
              </View>

              {/* AI Generated Phase Images */}
              <View style={[styles.exerciseDetailSection, { backgroundColor: theme.colors.background.card }]}>
                <Text style={[styles.exerciseDetailSectionTitle, { color: theme.colors.text.primary }]}>
                  📸 Exercise Demonstration
                </Text>
                
                {loadingPhaseImages ? (
                  <View style={styles.imageLoadingContainer}>
                    <ActivityIndicator size="large" color="#7C3AED" />
                    <Text style={[styles.imageLoadingText, { color: theme.colors.text.secondary }]}>
                      Generating AI demonstration images...
                    </Text>
                    <Text style={[styles.imageLoadingSubtext, { color: theme.colors.text.muted }]}>
                      This may take up to a minute
                    </Text>
                  </View>
                ) : exercisePhaseImages.length > 0 ? (
                  <View>
                    {/* Phase Tabs */}
                    <View style={styles.phaseTabs}>
                      {exercisePhaseImages.map((phase, index) => (
                        <TouchableOpacity
                          key={phase.phase}
                          style={[
                            styles.phaseTab,
                            currentPhaseIndex === index && styles.phaseTabActive
                          ]}
                          onPress={() => setCurrentPhaseIndex(index)}
                        >
                          <Text style={[
                            styles.phaseTabText,
                            currentPhaseIndex === index && styles.phaseTabTextActive
                          ]}>
                            {phase.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    {/* Current Phase Image */}
                    {exercisePhaseImages[currentPhaseIndex]?.image_base64 ? (
                      <View style={styles.phaseImageContainer}>
                        <Image
                          source={{ uri: `data:image/png;base64,${exercisePhaseImages[currentPhaseIndex].image_base64}` }}
                          style={styles.phaseImage}
                          resizeMode="contain"
                        />
                        <View style={styles.phaseIndicator}>
                          <Text style={styles.phaseIndicatorText}>
                            {currentPhaseIndex + 1} of 3: {exercisePhaseImages[currentPhaseIndex]?.label}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View style={styles.imagePlaceholder}>
                        <Ionicons name="image-outline" size={48} color={theme.colors.text.muted} />
                        <Text style={[styles.imagePlaceholderText, { color: theme.colors.text.muted }]}>
                          Image not available
                        </Text>
                      </View>
                    )}

                    {/* Navigation Arrows */}
                    <View style={styles.phaseNavigation}>
                      <TouchableOpacity
                        style={[styles.phaseNavBtn, currentPhaseIndex === 0 && styles.phaseNavBtnDisabled]}
                        onPress={() => setCurrentPhaseIndex(Math.max(0, currentPhaseIndex - 1))}
                        disabled={currentPhaseIndex === 0}
                      >
                        <Ionicons name="chevron-back" size={24} color={currentPhaseIndex === 0 ? '#ccc' : '#7C3AED'} />
                        <Text style={[styles.phaseNavText, currentPhaseIndex === 0 && { color: '#ccc' }]}>Previous</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.phaseNavBtn, currentPhaseIndex === 2 && styles.phaseNavBtnDisabled]}
                        onPress={() => setCurrentPhaseIndex(Math.min(2, currentPhaseIndex + 1))}
                        disabled={currentPhaseIndex === 2}
                      >
                        <Text style={[styles.phaseNavText, currentPhaseIndex === 2 && { color: '#ccc' }]}>Next</Text>
                        <Ionicons name="chevron-forward" size={24} color={currentPhaseIndex === 2 ? '#ccc' : '#7C3AED'} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity 
                    style={styles.generateImagesBtn}
                    onPress={() => loadExercisePhaseImages(selectedExerciseDetail)}
                  >
                    <Ionicons name="sparkles" size={24} color="#fff" />
                    <Text style={styles.generateImagesBtnText}>Generate AI Images</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Target Muscles */}
              <View style={[styles.exerciseDetailSection, { backgroundColor: theme.colors.background.card }]}>
                <Text style={[styles.exerciseDetailSectionTitle, { color: theme.colors.text.primary }]}>
                  🎯 Target Muscles
                </Text>
                <View style={styles.muscleGroupList}>
                  {selectedExerciseDetail.muscle_groups?.map((muscle: string, idx: number) => (
                    <View key={idx} style={[styles.muscleGroupChip, { backgroundColor: '#7C3AED20' }]}>
                      <Text style={[styles.muscleGroupChipText, { color: '#7C3AED' }]}>{muscle}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Equipment */}
              <View style={[styles.exerciseDetailSection, { backgroundColor: theme.colors.background.card }]}>
                <Text style={[styles.exerciseDetailSectionTitle, { color: theme.colors.text.primary }]}>
                  🏋️ Equipment Needed
                </Text>
                <View style={styles.equipmentList}>
                  {selectedExerciseDetail.equipment?.map((eq: string, idx: number) => (
                    <View key={idx} style={[styles.equipmentChip, { backgroundColor: theme.colors.background.secondary }]}>
                      <Ionicons name="fitness" size={16} color={theme.accentColors.primary} />
                      <Text style={[styles.equipmentChipText, { color: theme.colors.text.primary }]}>{eq}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* How To Perform */}
              <View style={[styles.exerciseDetailSection, { backgroundColor: theme.colors.background.card }]}>
                <Text style={[styles.exerciseDetailSectionTitle, { color: theme.colors.text.primary }]}>
                  📝 How to Perform
                </Text>
                <View style={styles.instructionsList}>
                  <View style={styles.instructionItem}>
                    <View style={[styles.instructionNumber, { backgroundColor: '#7C3AED20' }]}>
                      <Text style={styles.instructionNumberText}>1</Text>
                    </View>
                    <Text style={[styles.instructionText, { color: theme.colors.text.secondary }]}>
                      Set up your position with proper form and grip
                    </Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <View style={[styles.instructionNumber, { backgroundColor: '#7C3AED20' }]}>
                      <Text style={styles.instructionNumberText}>2</Text>
                    </View>
                    <Text style={[styles.instructionText, { color: theme.colors.text.secondary }]}>
                      Engage your core and maintain a neutral spine
                    </Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <View style={[styles.instructionNumber, { backgroundColor: '#7C3AED20' }]}>
                      <Text style={styles.instructionNumberText}>3</Text>
                    </View>
                    <Text style={[styles.instructionText, { color: theme.colors.text.secondary }]}>
                      Perform the movement with controlled tempo
                    </Text>
                  </View>
                  <View style={styles.instructionItem}>
                    <View style={[styles.instructionNumber, { backgroundColor: '#7C3AED20' }]}>
                      <Text style={styles.instructionNumberText}>4</Text>
                    </View>
                    <Text style={[styles.instructionText, { color: theme.colors.text.secondary }]}>
                      Focus on the mind-muscle connection with target muscles
                    </Text>
                  </View>
                </View>
              </View>

              {/* Tips */}
              <View style={[styles.exerciseDetailSection, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.exerciseDetailSectionTitle, { color: '#92400E' }]}>
                  💡 Pro Tips
                </Text>
                <Text style={{ color: '#78350F', fontSize: 14, lineHeight: 20 }}>
                  • Start with lighter weight to perfect your form{'\n'}
                  • Control the negative (lowering) phase{'\n'}
                  • Breathe out on exertion, in on recovery{'\n'}
                  • Rest 60-90 seconds between sets for hypertrophy
                </Text>
              </View>

              {/* Add to Workout Button */}
              <TouchableOpacity 
                style={styles.addToWorkoutFullBtn}
                onPress={() => {
                  if (selectedExerciseDetail) {
                    setCurrentExercise(selectedExerciseDetail.name);
                    closeExerciseDetail();
                  }
                }}
              >
                <Ionicons name="add-circle" size={24} color="#fff" />
                <Text style={styles.addToWorkoutFullBtnText}>Add to Current Workout</Text>
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  quickLogCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  quickLogText: {
    flex: 1,
  },
  quickLogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  quickLogSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  // Fitness Goals Styles
  goalsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  adjustGoalsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  adjustGoalsBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  goalTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  goalTagText: {
    fontSize: 13,
    fontWeight: '600',
  },
  setGoalsPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 12,
  },
  setGoalsPromptText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  resetGoalsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 4,
  },
  resetGoalsBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#7C3AED',
  },
  statLabel: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    marginBottom: 16,
  },
  prsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  prCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    padding: 16,
    minWidth: 140,
    alignItems: 'center',
  },
  prExercise: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  prWeight: {
    fontSize: 24,
    fontWeight: '800',
    color: '#D97706',
  },
  prReps: {
    fontSize: 14,
    color: '#6B7280',
  },
  pr1rm: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  programCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  programLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  programIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  programInfo: {
    flex: 1,
  },
  programName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  programDescription: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginBottom: 8,
  },
  programMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  programBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  programBadgeText: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  // Subsection styles
  subsection: {
    marginBottom: 20,
  },
  subsectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
    flex: 1,
  },
  subsectionBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
    backgroundColor: '#EF444420',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  // Functional Training Card Styles
  functionalCard: {
    height: 180,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.card,
  },
  functionalImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  functionalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  functionalContent: {
    padding: 16,
  },
  functionalBadges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  functionalName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  functionalDescription: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  functionalMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  functionalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  functionalMetaText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  // Functional Training Modal Styles
  functionalInfoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  functionalInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  functionalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  functionalInfoItem: {
    alignItems: 'center',
  },
  functionalInfoLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  functionalInfoValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  stationCard: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  stationImage: {
    width: 100,
    height: 100,
  },
  stationContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  stationNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  stationNumberText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  stationDescription: {
    fontSize: 13,
    marginBottom: 8,
  },
  stationTiming: {
    flexDirection: 'row',
    gap: 16,
  },
  stationTimingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stationTimingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  startWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 16,
    marginTop: 16,
    gap: 8,
  },
  startWorkoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  muscleGroups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  muscleCard: {
    width: '30%',
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  muscleImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  muscleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  muscleName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  muscleCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  historyMeta: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  historyDate: {
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  historyHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  historyDeleteBtn: {
    padding: 8,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  fullScreenModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  fullScreenModalContent: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
    marginTop: 60,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  exerciseLibraryModal: {
    backgroundColor: theme.colors.background.primary,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: '50%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  cancelBtn: {
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  saveBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.accentColors.primary,
  },
  programScrollView: {
    flex: 1,
  },
  programScrollContent: {
    padding: 16,
  },
  workoutScrollView: {
    flex: 1,
  },
  workoutScrollContent: {
    padding: 16,
  },
  programDetailDesc: {
    fontSize: 16,
    color: theme.colors.text.secondary,
    marginBottom: 16,
  },
  programDetailMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  programDetailFreq: {
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  programDetailLevel: {
    fontSize: 14,
    color: theme.colors.text.primary,
  },
  instructionText: {
    fontSize: 13,
    color: theme.colors.text.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  dayCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  dayName: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  dayFocus: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  startAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  startAllBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  dayExerciseEditable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.primary,
  },
  exerciseReorderBtns: {
    marginRight: 8,
  },
  reorderBtn: {
    padding: 4,
  },
  smallReorderBtn: {
    padding: 2,
  },
  reorderBtnDisabled: {
    opacity: 0.3,
  },
  dayExInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayExNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7C3AED20',
    textAlign: 'center',
    lineHeight: 28,
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
    marginRight: 12,
    overflow: 'hidden',
  },
  dayExDetails: {
    flex: 1,
  },
  dayExName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  dayExMeta: {
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  deleteExBtn: {
    padding: 8,
    marginLeft: 8,
  },
  editModalWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  editExerciseModal: {
    backgroundColor: theme.colors.background.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  editForm: {
    padding: 20,
  },
  editFormRow: {
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 8,
  },
  editInput: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
  editFormGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  editFormGridItem: {
    flex: 1,
  },
  editInputSmall: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    textAlign: 'center',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
  prefilledSection: {
    marginTop: 24,
  },
  prefilledTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  prefilledHint: {
    fontSize: 13,
    color: theme.colors.text.muted,
    marginBottom: 16,
  },
  prefilledExercise: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  prefilledExHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  prefilledExName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginLeft: 8,
  },
  prefilledSet: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  prefilledSetNum: {
    width: 50,
    fontSize: 13,
    color: theme.colors.text.secondary,
  },
  prefilledInput: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    textAlign: 'center',
  },
  prefilledX: {
    fontSize: 14,
    color: theme.colors.text.muted,
  },
  addExerciseSection: {
    marginTop: 24,
    backgroundColor: '#7C3AED10',
    borderRadius: 16,
    padding: 16,
  },
  exerciseInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  browseBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  setsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  setsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  addSetBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  setNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    width: 30,
  },
  setInput: {
    flex: 1,
    backgroundColor: theme.colors.background.card,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
  setX: {
    fontSize: 16,
    color: theme.colors.text.secondary,
  },
  addExerciseBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  addExerciseBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  exerciseItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  exerciseIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#7C3AED20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exerciseItemImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    marginRight: 12,
  },
  exerciseItemInfo: {
    flex: 1,
  },
  exerciseItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 4,
  },
  exerciseItemEquipment: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    marginBottom: 6,
  },
  muscleTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  muscleTag: {
    backgroundColor: theme.accentColors.primary + '20',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  muscleTagText: {
    fontSize: 11,
    color: theme.accentColors.primary,
    fontWeight: '500',
  },
  emptyList: {
    padding: 40,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 16,
    color: theme.colors.text.muted,
  },
  // Past Workout Modal Styles
  pastWorkoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  closeButtonContainer: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pastWorkoutTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  pastWorkoutContent: {
    flex: 1,
    padding: 16,
  },
  pastWorkoutInfo: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  pastWorkoutName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  pastWorkoutDate: {
    fontSize: 14,
    marginBottom: 16,
  },
  pastWorkoutStats: {
    flexDirection: 'row',
    gap: 12,
  },
  pastWorkoutStat: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  pastWorkoutStatValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  pastWorkoutStatLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  pastWorkoutSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  pastExerciseCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  pastExerciseName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  pastExerciseSets: {
    gap: 8,
  },
  pastSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 12,
  },
  pastSetNumber: {
    fontSize: 13,
    fontWeight: '500',
    width: 50,
  },
  pastSetWeight: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  pastSetReps: {
    fontSize: 14,
    fontWeight: '600',
  },
  pastWorkoutNotes: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  pastWorkoutNotesLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  pastWorkoutNotesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  historyRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Exercise Detail Modal Styles
  exerciseDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  exerciseDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  addToWorkoutBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addToWorkoutBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  exerciseDetailContent: {
    flex: 1,
    padding: 16,
  },
  exerciseDetailTop: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseDetailIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7C3AED20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseDetailName: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  exerciseDetailSection: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  exerciseDetailSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  muscleGroupList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  muscleGroupChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  muscleGroupChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  equipmentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  equipmentChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  instructionsList: {
    gap: 12,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
  },
  addToWorkoutFullBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
  },
  addToWorkoutFullBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Inline Edit Styles
  inlineEditForm: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.accentColors.primary + '40',
  },
  inlineEditRow: {
    marginBottom: 12,
  },
  inlineEditLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 6,
  },
  inlineEditInput: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
  inlineEditGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  inlineEditGridItem: {
    flex: 1,
  },
  inlineEditInputSmall: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: theme.colors.text.primary,
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    textAlign: 'center',
  },
  inlineEditActions: {
    flexDirection: 'row',
    gap: 10,
  },
  inlineEditCancel: {
    flex: 1,
    backgroundColor: theme.colors.background.card,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
  },
  inlineEditCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  inlineEditSave: {
    flex: 1,
    backgroundColor: '#7C3AED',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  inlineEditSaveText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  // Phase Image Styles
  imageLoadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageLoadingText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  imageLoadingSubtext: {
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  phaseTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  phaseTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: theme.colors.background.secondary,
    alignItems: 'center',
  },
  phaseTabActive: {
    backgroundColor: '#7C3AED',
  },
  phaseTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  phaseTabTextActive: {
    color: '#fff',
  },
  phaseImageContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.background.secondary,
  },
  phaseImage: {
    width: '100%',
    height: SCREEN_WIDTH - 64,
    backgroundColor: theme.colors.background.secondary,
  },
  phaseIndicator: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(124, 58, 237, 0.1)',
  },
  phaseIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
  phaseNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  phaseNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 4,
  },
  phaseNavBtnDisabled: {
    opacity: 0.5,
  },
  phaseNavText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7C3AED',
  },
  imagePlaceholder: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
  },
  imagePlaceholderText: {
    fontSize: 14,
    marginTop: 12,
  },
  generateImagesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  generateImagesBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

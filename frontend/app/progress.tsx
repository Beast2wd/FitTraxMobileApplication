import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width } = Dimensions.get('window');

export default function ProgressScreen() {
  const { userId, profile } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [progressData, setProgressData] = useState<any>(null);
  const [workoutBreakdown, setWorkoutBreakdown] = useState<any>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);
  
  // Body measurement form
  const [measurementForm, setMeasurementForm] = useState({
    weight: '',
    body_fat: '',
    chest: '',
    waist: '',
    hips: '',
    biceps: '',
    thighs: ''
  });

  useEffect(() => {
    if (userId) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [userId, selectedPeriod]);

  const loadData = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const [progressRes, breakdownRes, goalsRes] = await Promise.all([
        axios.get(`${API_URL}/api/progress/comprehensive/${userId}?days=${selectedPeriod}`),
        axios.get(`${API_URL}/api/progress/workout-breakdown/${userId}?days=${selectedPeriod}`),
        axios.get(`${API_URL}/api/progress/goals/${userId}`)
      ]);
      
      setProgressData(progressRes.data);
      setWorkoutBreakdown(breakdownRes.data);
      setGoals(goalsRes.data.goals || []);
    } catch (error) {
      console.error('Error loading progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const saveMeasurement = async () => {
    try {
      const data: any = { user_id: userId };
      
      if (measurementForm.weight) data.weight = parseFloat(measurementForm.weight);
      if (measurementForm.body_fat) data.body_fat = parseFloat(measurementForm.body_fat);
      if (measurementForm.chest) data.chest = parseFloat(measurementForm.chest);
      if (measurementForm.waist) data.waist = parseFloat(measurementForm.waist);
      if (measurementForm.hips) data.hips = parseFloat(measurementForm.hips);
      if (measurementForm.biceps) data.biceps = parseFloat(measurementForm.biceps);
      if (measurementForm.thighs) data.thighs = parseFloat(measurementForm.thighs);

      await axios.post(`${API_URL}/api/progress/body-measurements`, data);
      Alert.alert('Success', 'Measurements saved!');
      setShowMeasurementModal(false);
      setMeasurementForm({
        weight: '',
        body_fat: '',
        chest: '',
        waist: '',
        hips: '',
        biceps: '',
        thighs: ''
      });
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to save measurements');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const summary = progressData?.summary || {};
  const dailyData = progressData?.daily_data || [];

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
          <Text style={styles.title}>Progress</Text>
          <Text style={styles.subtitle}>Track your fitness journey</Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {[7, 30, 90].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.periodBtn,
                selectedPeriod === days && styles.periodBtnActive
              ]}
              onPress={() => setSelectedPeriod(days)}
            >
              <Text style={[
                styles.periodBtnText,
                selectedPeriod === days && styles.periodBtnTextActive
              ]}>
                {days === 7 ? '1W' : days === 30 ? '1M' : '3M'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary Stats */}
        <View style={styles.summaryGrid}>
          <LinearGradient
            colors={['#3B82F6', '#1D4ED8']}
            style={styles.summaryCard}
          >
            <Ionicons name="flame" size={28} color="#fff" />
            <Text style={styles.summaryValue}>{summary.total_calories_burned?.toLocaleString() || 0}</Text>
            <Text style={styles.summaryLabel}>Calories Burned</Text>
          </LinearGradient>

          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.summaryCard}
          >
            <Ionicons name="time" size={28} color="#fff" />
            <Text style={styles.summaryValue}>{summary.total_workout_minutes || 0}</Text>
            <Text style={styles.summaryLabel}>Minutes Active</Text>
          </LinearGradient>

          <LinearGradient
            colors={['#F59E0B', '#D97706']}
            style={styles.summaryCard}
          >
            <MaterialCommunityIcons name="dumbbell" size={28} color="#fff" />
            <Text style={styles.summaryValue}>{summary.total_workouts || 0}</Text>
            <Text style={styles.summaryLabel}>Workouts</Text>
          </LinearGradient>

          <LinearGradient
            colors={['#EF4444', '#DC2626']}
            style={styles.summaryCard}
          >
            <Ionicons name="trophy" size={28} color="#fff" />
            <Text style={styles.summaryValue}>{summary.current_streak || 0}</Text>
            <Text style={styles.summaryLabel}>Day Streak</Text>
          </LinearGradient>
        </View>

        {/* Goals Progress */}
        {goals.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🎯 Goals Progress</Text>
            {goals.map((goal, index) => (
              <View key={index} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalName}>{goal.name}</Text>
                  <Text style={styles.goalProgress}>{goal.progress}%</Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View 
                    style={[
                      styles.progressBar, 
                      { 
                        width: `${goal.progress}%`,
                        backgroundColor: goal.progress >= 100 ? '#10B981' : '#3B82F6'
                      }
                    ]} 
                  />
                </View>
                <View style={styles.goalDetails}>
                  <Text style={styles.goalCurrent}>{goal.current} {goal.unit}</Text>
                  <Text style={styles.goalTarget}>Target: {goal.target} {goal.unit}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Activity Chart (Simple Bar Chart) */}
        {dailyData.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📊 Activity Overview</Text>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Calories Burned (Last {selectedPeriod} days)</Text>
              <View style={styles.barChart}>
                {dailyData.slice(-14).map((day: any, index: number) => {
                  const maxCals = Math.max(...dailyData.map((d: any) => d.calories_burned || 0), 1);
                  const height = ((day.calories_burned || 0) / maxCals) * 100;
                  return (
                    <View key={index} style={styles.barContainer}>
                      <View style={[styles.bar, { height: `${Math.max(height, 5)}%` }]} />
                      <Text style={styles.barLabel}>
                        {new Date(day.date).getDate()}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Workout Breakdown */}
        {workoutBreakdown && workoutBreakdown.total_workouts > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💪 Workout Breakdown</Text>
            <View style={styles.breakdownCard}>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#7C3AED' }]} />
                  <Text style={styles.breakdownLabel}>Weight Training</Text>
                  <Text style={styles.breakdownValue}>{workoutBreakdown.workout_types?.weight_training || 0}</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#EC4899' }]} />
                  <Text style={styles.breakdownLabel}>Running</Text>
                  <Text style={styles.breakdownValue}>{workoutBreakdown.workout_types?.running || 0}</Text>
                </View>
              </View>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#3B82F6' }]} />
                  <Text style={styles.breakdownLabel}>AI Workouts</Text>
                  <Text style={styles.breakdownValue}>{workoutBreakdown.workout_types?.ai_workouts || 0}</Text>
                </View>
                <View style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#10B981' }]} />
                  <Text style={styles.breakdownLabel}>Other</Text>
                  <Text style={styles.breakdownValue}>{workoutBreakdown.workout_types?.other || 0}</Text>
                </View>
              </View>
            </View>

            {/* Muscle Groups */}
            {Object.keys(workoutBreakdown.muscle_groups || {}).length > 0 && (
              <View style={styles.muscleGroupsCard}>
                <Text style={styles.chartTitle}>Muscle Groups Trained</Text>
                <View style={styles.muscleGroupsList}>
                  {Object.entries(workoutBreakdown.muscle_groups || {}).map(([muscle, count]: [string, any]) => (
                    <View key={muscle} style={styles.muscleGroupItem}>
                      <Text style={styles.muscleGroupEmoji}>{getMuscleEmoji(muscle)}</Text>
                      <Text style={styles.muscleGroupName}>{muscle}</Text>
                      <Text style={styles.muscleGroupCount}>{count}x</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Personal Records */}
        {progressData?.personal_records?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏆 Personal Records</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.prsRow}>
                {progressData.personal_records.slice(0, 6).map((pr: any, index: number) => (
                  <View key={index} style={styles.prCard}>
                    <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                    <Text style={styles.prWeight}>{pr.weight} lbs</Text>
                    <Text style={styles.prReps}>x {pr.reps}</Text>
                    <Text style={styles.pr1rm}>1RM: {pr.estimated_1rm?.toFixed(0)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Body Measurements */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📏 Body Measurements</Text>
            <TouchableOpacity 
              style={styles.addMeasurementBtn}
              onPress={() => setShowMeasurementModal(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addMeasurementBtnText}>Log</Text>
            </TouchableOpacity>
          </View>

          {progressData?.body_measurements?.length > 0 ? (
            <View style={styles.measurementsCard}>
              {progressData.body_measurements.slice(0, 3).map((m: any, index: number) => (
                <View key={index} style={styles.measurementRow}>
                  <Text style={styles.measurementDate}>
                    {new Date(m.timestamp).toLocaleDateString()}
                  </Text>
                  <View style={styles.measurementValues}>
                    {m.weight && <Text style={styles.measurementValue}>⚖️ {m.weight} lbs</Text>}
                    {m.body_fat && <Text style={styles.measurementValue}>📊 {m.body_fat}%</Text>}
                    {m.waist && <Text style={styles.measurementValue}>📐 {m.waist}" waist</Text>}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyMeasurements}>
              <MaterialIcons name="straighten" size={48} color={Colors.text.muted} />
              <Text style={styles.emptyText}>No measurements logged yet</Text>
              <Text style={styles.emptySubtext}>Track your body composition over time</Text>
            </View>
          )}
        </View>

        {/* Additional Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Additional Stats</Text>
          <View style={styles.additionalStatsGrid}>
            <View style={styles.additionalStatCard}>
              <Ionicons name="walk" size={24} color="#EC4899" />
              <Text style={styles.additionalStatValue}>{summary.total_run_distance?.toFixed(1) || 0} km</Text>
              <Text style={styles.additionalStatLabel}>Distance Run</Text>
            </View>
            <View style={styles.additionalStatCard}>
              <MaterialCommunityIcons name="weight-lifter" size={24} color="#7C3AED" />
              <Text style={styles.additionalStatValue}>{((summary.total_weight_volume || 0) / 1000).toFixed(1)}k</Text>
              <Text style={styles.additionalStatLabel}>Volume (lbs)</Text>
            </View>
            <View style={styles.additionalStatCard}>
              <Ionicons name="calendar-outline" size={24} color="#10B981" />
              <Text style={styles.additionalStatValue}>{summary.active_days || 0}</Text>
              <Text style={styles.additionalStatLabel}>Active Days</Text>
            </View>
            <View style={styles.additionalStatCard}>
              <Ionicons name="timer-outline" size={24} color="#3B82F6" />
              <Text style={styles.additionalStatValue}>{summary.avg_workout_duration || 0}</Text>
              <Text style={styles.additionalStatLabel}>Avg Min/Workout</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Body Measurement Modal */}
      <Modal
        visible={showMeasurementModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMeasurementModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowMeasurementModal(false)}>
              <Ionicons name="close" size={28} color={Colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Log Measurements</Text>
            <TouchableOpacity onPress={saveMeasurement}>
              <Text style={styles.saveBtn}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.inputLabel}>Weight (lbs)</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.weight}
              onChangeText={(v) => setMeasurementForm({...measurementForm, weight: v})}
              placeholder="e.g., 165"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Body Fat %</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.body_fat}
              onChangeText={(v) => setMeasurementForm({...measurementForm, body_fat: v})}
              placeholder="e.g., 15"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Chest (inches)</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.chest}
              onChangeText={(v) => setMeasurementForm({...measurementForm, chest: v})}
              placeholder="e.g., 40"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Waist (inches)</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.waist}
              onChangeText={(v) => setMeasurementForm({...measurementForm, waist: v})}
              placeholder="e.g., 32"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Hips (inches)</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.hips}
              onChangeText={(v) => setMeasurementForm({...measurementForm, hips: v})}
              placeholder="e.g., 38"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Biceps (inches)</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.biceps}
              onChangeText={(v) => setMeasurementForm({...measurementForm, biceps: v})}
              placeholder="e.g., 14"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Thighs (inches)</Text>
            <TextInput
              style={styles.textInput}
              value={measurementForm.thighs}
              onChangeText={(v) => setMeasurementForm({...measurementForm, thighs: v})}
              placeholder="e.g., 22"
              placeholderTextColor={Colors.text.muted}
              keyboardType="numeric"
            />

            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const getMuscleEmoji = (muscle: string): string => {
  const emojis: any = {
    chest: '🫁',
    back: '🔙',
    legs: '🦵',
    shoulders: '💪',
    arms: '💪',
    core: '🎯'
  };
  return emojis[muscle.toLowerCase()] || '💪';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.light,
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
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.text.secondary,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  periodBtnActive: {
    backgroundColor: Colors.brand.primary,
  },
  periodBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  periodBtnTextActive: {
    color: '#fff',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    width: (width - 44) / 2,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  goalCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  goalProgress: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  goalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  goalCurrent: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  goalTarget: {
    fontSize: 14,
    color: Colors.text.muted,
  },
  chartCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 4,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '80%',
    backgroundColor: Colors.brand.primary,
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: Colors.text.muted,
    marginTop: 4,
  },
  breakdownCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  breakdownItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  muscleGroupsCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
  },
  muscleGroupsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  muscleGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.light,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  muscleGroupEmoji: {
    fontSize: 16,
  },
  muscleGroupName: {
    fontSize: 14,
    color: Colors.text.primary,
    textTransform: 'capitalize',
  },
  muscleGroupCount: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.brand.primary,
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
    minWidth: 130,
    alignItems: 'center',
  },
  prExercise: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  prWeight: {
    fontSize: 22,
    fontWeight: '800',
    color: '#D97706',
  },
  prReps: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  pr1rm: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 4,
  },
  addMeasurementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  addMeasurementBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  measurementsCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
  },
  measurementRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.light,
  },
  measurementDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  measurementValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  measurementValue: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  emptyMeasurements: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  additionalStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  additionalStatCard: {
    width: (width - 44) / 2,
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  additionalStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 8,
  },
  additionalStatLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
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
    padding: 16,
  },
  saveBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 8,
    marginTop: 16,
  },
  textInput: {
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
});

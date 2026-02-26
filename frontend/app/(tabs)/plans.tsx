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
  Image
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemeStore } from '../../stores/themeStore';
import { useUserStore } from '../../stores/userStore';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// AI fitness images for stats and workouts
const STAT_IMAGES = {
  workouts: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400&q=80', // Gym equipment
  volume: 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=400&q=80', // Weights/dumbbells  
  prs: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400&q=80', // Trophy/achievement
};

const WORKOUT_IMAGES = [
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=300&q=80', // Bench press
  'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=300&q=80', // Bicep curl
  'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=300&q=80', // Squat
  'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?w=300&q=80', // Push ups
  'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=300&q=80', // Deadlift
  'https://images.unsplash.com/photo-1627197843575-00cc3965c2d5?w=300&q=80', // Pull ups
];

export default function PlansScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const router = useRouter();
  const colors = theme.colors;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workoutHistory, setWorkoutHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [prs, setPrs] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    try {
      const [historyRes, statsRes, prsRes] = await Promise.all([
        axios.get(`${API_URL}/api/weight-training/history/${userId}?days=30`),
        axios.get(`${API_URL}/api/weight-training/stats/${userId}`),
        axios.get(`${API_URL}/api/weight-training/prs/${userId}`),
      ]);
      
      setWorkoutHistory(historyRes.data.workouts || []);
      setStats(statsRes.data);
      setPrs(prsRes.data.personal_records || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true
    });
  };

  // Delete a single workout
  const handleDeleteWorkout = (workout: any) => {
    Alert.alert(
      'Delete Workout',
      `Delete "${workout.workout_name}" from ${formatDate(workout.timestamp)}?\n\nThis will also remove it from your calendar.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/weight-training/log/${workout.log_id}?user_id=${userId}`);
              Alert.alert('Deleted', 'Workout removed successfully');
              loadData();
            } catch (error) {
              console.error('Error deleting workout:', error);
              Alert.alert('Error', 'Failed to delete workout');
            }
          }
        }
      ]
    );
  };

  // Reset all workout data
  const handleResetAll = () => {
    Alert.alert(
      '⚠️ Reset All Workout Data',
      'This will permanently delete:\n\n• All workout history\n• All personal records\n• All scheduled workouts\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset Everything', 
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await axios.delete(`${API_URL}/api/weight-training/reset/${userId}`);
              Alert.alert(
                'Data Reset', 
                `Deleted:\n• ${response.data.deleted_logs} workouts\n• ${response.data.deleted_prs} personal records\n• ${response.data.deleted_scheduled} scheduled workouts`
              );
              loadData();
            } catch (error) {
              console.error('Error resetting data:', error);
              Alert.alert('Error', 'Failed to reset workout data');
            }
          }
        }
      ]
    );
  };

  // Get a consistent image for a workout based on its index
  const getWorkoutImage = (index: number) => {
    return WORKOUT_IMAGES[index % WORKOUT_IMAGES.length];
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accentColors.primary} />
          <Text style={[styles.loadingText, { color: colors.text.secondary }]}>Loading your plans...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={[styles.title, { color: colors.text.primary }]}>My Plans</Text>
            <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
              Track your workout progress
            </Text>
          </View>
          {(workoutHistory.length > 0 || prs.length > 0) && (
            <TouchableOpacity 
              style={styles.resetButton}
              onPress={handleResetAll}
            >
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>

        {/* Quick Stats with AI Images */}
        {stats && stats.total_workouts > 0 && (
          <View style={styles.statsGrid}>
            {/* Workouts Card */}
            <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
              <Image 
                source={{ uri: STAT_IMAGES.workouts }} 
                style={styles.statImage}
                resizeMode="cover"
              />
              <View style={styles.statOverlay}>
                <Text style={styles.statValue}>{stats.total_workouts}</Text>
                <Text style={styles.statLabel}>Workouts</Text>
              </View>
            </View>

            {/* Volume Card */}
            <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
              <Image 
                source={{ uri: STAT_IMAGES.volume }} 
                style={styles.statImage}
                resizeMode="cover"
              />
              <View style={styles.statOverlay}>
                <Text style={styles.statValue}>{(stats.total_volume / 1000).toFixed(1)}k</Text>
                <Text style={styles.statLabel}>Total lbs</Text>
              </View>
            </View>

            {/* PRs Card */}
            <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
              <Image 
                source={{ uri: STAT_IMAGES.prs }} 
                style={styles.statImage}
                resizeMode="cover"
              />
              <View style={styles.statOverlay}>
                <Text style={styles.statValue}>{stats.total_prs}</Text>
                <Text style={styles.statLabel}>PRs</Text>
              </View>
            </View>
          </View>
        )}

        {/* Start a Workout CTA */}
        <TouchableOpacity
          style={styles.ctaCard}
          onPress={() => router.push('/weight-training')}
        >
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            style={styles.ctaGradient}
          >
            <MaterialCommunityIcons name="dumbbell" size={32} color="#fff" />
            <View style={styles.ctaText}>
              <Text style={styles.ctaTitle}>Start a Workout</Text>
              <Text style={styles.ctaSubtitle}>Choose from training programs or quick log</Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Personal Records */}
        {prs.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>🏆 Personal Records</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.prsRow}>
                {prs.slice(0, 5).map((pr, index) => (
                  <View key={index} style={styles.prCard}>
                    <Image 
                      source={{ uri: STAT_IMAGES.prs }}
                      style={styles.prImage}
                      resizeMode="cover"
                    />
                    <View style={styles.prOverlay}>
                      <Text style={styles.prExercise} numberOfLines={1}>
                        {pr.exercise_name}
                      </Text>
                      <Text style={styles.prWeight}>{pr.weight} lbs</Text>
                      <Text style={styles.prReps}>x {pr.reps} reps</Text>
                      <Text style={styles.pr1rm}>
                        Est 1RM: {pr.estimated_1rm?.toFixed(0)} lbs
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Recent Workouts */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>📋 Recent Workouts</Text>
          
          {workoutHistory.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.background.card }]}>
              <Image 
                source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&q=80' }}
                style={styles.emptyImage}
                resizeMode="cover"
              />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No workouts yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.text.secondary }]}>
                Complete your first workout to see it here
              </Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: theme.accentColors.primary }]}
                onPress={() => router.push('/weight-training')}
              >
                <Text style={styles.emptyButtonText}>Start Training</Text>
              </TouchableOpacity>
            </View>
          ) : (
            workoutHistory.map((workout, index) => (
              <View key={index} style={[styles.workoutCard, { backgroundColor: colors.background.card }]}>
                {/* Workout Image */}
                <Image 
                  source={{ uri: getWorkoutImage(index) }}
                  style={styles.workoutImage}
                  resizeMode="cover"
                />
                
                <View style={styles.workoutContent}>
                  <View style={styles.workoutHeader}>
                    <View style={styles.workoutInfo}>
                      <Text style={[styles.workoutName, { color: colors.text.primary }]}>
                        {workout.workout_name}
                      </Text>
                      <Text style={[styles.workoutDate, { color: colors.text.muted }]}>
                        {formatDate(workout.timestamp)} • {formatTime(workout.timestamp)}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteWorkout(workout)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                  
                  <View style={styles.workoutStats}>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatValue, { color: colors.text.primary }]}>
                        {workout.exercises?.length || 0}
                      </Text>
                      <Text style={[styles.workoutStatLabel, { color: colors.text.muted }]}>Exercises</Text>
                    </View>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatValue, { color: colors.text.primary }]}>
                        {workout.exercises?.reduce((acc: number, ex: any) => acc + (ex.sets?.length || 0), 0) || 0}
                      </Text>
                      <Text style={[styles.workoutStatLabel, { color: colors.text.muted }]}>Sets</Text>
                    </View>
                    <View style={styles.workoutStat}>
                      <Text style={[styles.workoutStatValue, { color: colors.text.primary }]}>
                        {Math.round(workout.exercises?.reduce((acc: number, ex: any) => 
                          acc + ex.sets?.reduce((sAcc: number, s: any) => sAcc + (s.weight * s.reps), 0) || 0, 0) / 1000 * 10) / 10}k
                      </Text>
                      <Text style={[styles.workoutStatLabel, { color: colors.text.muted }]}>lbs</Text>
                    </View>
                  </View>

                  {/* Exercise List */}
                  <View style={styles.exerciseList}>
                    {workout.exercises?.slice(0, 3).map((ex: any, exIndex: number) => (
                      <Text 
                        key={exIndex} 
                        style={[styles.exerciseItem, { color: colors.text.secondary }]}
                        numberOfLines={1}
                      >
                        • {ex.exercise_name} ({ex.sets?.length || 0} sets)
                      </Text>
                    ))}
                    {(workout.exercises?.length || 0) > 3 && (
                      <Text style={[styles.moreExercises, { color: colors.text.muted }]}>
                        +{workout.exercises.length - 3} more exercises
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
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
  resetButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    height: 120,
  },
  statImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  statOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    fontWeight: '600',
  },
  ctaCard: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  ctaText: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  ctaSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  prsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  prCard: {
    width: 150,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
  },
  prImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  prOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    justifyContent: 'flex-end',
  },
  prExercise: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  prWeight: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
  },
  prReps: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  pr1rm: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 6,
  },
  emptyState: {
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
  },
  emptyImage: {
    width: '100%',
    height: 150,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginBottom: 20,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  workoutCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  workoutImage: {
    width: '100%',
    height: 100,
  },
  workoutContent: {
    padding: 16,
  },
  workoutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  workoutDate: {
    fontSize: 13,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workoutStats: {
    flexDirection: 'row',
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  workoutStat: {
    flex: 1,
    alignItems: 'center',
  },
  workoutStatValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  workoutStatLabel: {
    fontSize: 12,
    marginTop: 2,
  },
  exerciseList: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  exerciseItem: {
    fontSize: 14,
    marginBottom: 4,
  },
  moreExercises: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
  },
});

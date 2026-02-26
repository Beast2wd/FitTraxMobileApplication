import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width, height } = Dimensions.get('window');

const MOTIVATION_IMAGE = 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80';

interface FitnessGoal {
  id: string;
  title: string;
  description: string;
  icon: string;
  workoutType: string;
  color: string;
}

const FITNESS_GOALS: FitnessGoal[] = [
  { id: 'weight_loss', title: 'Lose Weight', description: 'Burn fat and slim down with cardio & HIIT workouts', icon: 'flame', workoutType: 'hiit', color: '#EF4444' },
  { id: 'muscle_gain', title: 'Build Muscle', description: 'Strength training to build lean muscle mass', icon: 'barbell', workoutType: 'strength', color: '#3B82F6' },
  { id: 'endurance', title: 'Improve Endurance', description: 'Boost stamina with cardio and circuit training', icon: 'pulse', workoutType: 'cardio', color: '#10B981' },
  { id: 'flexibility', title: 'Increase Flexibility', description: 'Yoga and stretching for mobility and recovery', icon: 'body', workoutType: 'flexibility', color: '#8B5CF6' },
  { id: 'tone', title: 'Tone & Define', description: 'Full body workouts for a lean, toned physique', icon: 'fitness', workoutType: 'full_body', color: '#F59E0B' },
  { id: 'general', title: 'General Fitness', description: 'All-around fitness with varied workout routines', icon: 'heart', workoutType: 'general', color: '#EC4899' },
];

export default function FitnessGoalsScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<'goals' | 'success'>('goals');
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [planGenerating, setPlanGenerating] = useState(false);

  const toggleGoal = (goalId: string) => {
    setSelectedGoals(prev => {
      if (prev.includes(goalId)) {
        return prev.filter(g => g !== goalId);
      }
      if (prev.length >= 3) {
        Alert.alert('Limit Reached', 'You can select up to 3 fitness goals');
        return prev;
      }
      return [...prev, goalId];
    });
  };

  const generateAIPlan = async (goals: string[]) => {
    setPlanGenerating(true);
    try {
      const selectedGoalDetails = FITNESS_GOALS.filter(g => goals.includes(g.id));
      const goalDescriptions = selectedGoalDetails.map(g => g.title).join(', ');
      const effectiveUserId = userId || `temp_user_${Date.now()}`;
      
      const response = await axios.post(`${API_URL}/api/ai/generate-workout-plan`, {
        user_id: effectiveUserId,
        goals: goals,
        goal_descriptions: goalDescriptions,
        workout_types: selectedGoalDetails.map(g => g.workoutType),
      });
      
      if (response.data.success && response.data.plan) {
        setGeneratedPlan(response.data.plan);
        return response.data.plan;
      }
      return null;
    } catch (error) {
      console.error('Error generating AI plan:', error);
      const selectedGoalDetails = FITNESS_GOALS.filter(g => goals.includes(g.id));
      const fallbackPlan = {
        name: `My ${selectedGoalDetails[0]?.title || 'Fitness'} Plan`,
        description: `A personalized plan focused on ${selectedGoalDetails.map(g => g.title.toLowerCase()).join(', ')}`,
        duration_weeks: 4,
        type: selectedGoalDetails[0]?.workoutType || 'mixed',
        goal: goals[0] || 'general',
      };
      setGeneratedPlan(fallbackPlan);
      return fallbackPlan;
    } finally {
      setPlanGenerating(false);
    }
  };

  const handleCreatePlan = async () => {
    if (selectedGoals.length === 0) {
      Alert.alert('Select Goals', 'Please select at least one fitness goal');
      return;
    }

    setLoading(true);
    try {
      if (userId) {
        await axios.post(`${API_URL}/api/profile/fitness-goals`, {
          user_id: userId,
          fitness_goals: selectedGoals,
        });
      }
      await generateAIPlan(selectedGoals);
      setCurrentStep('success');
    } catch (error) {
      console.error('Error:', error);
      setCurrentStep('success');
    } finally {
      setLoading(false);
    }
  };

  // View Plan button - go directly to plans
  const handleViewPlan = () => {
    router.replace('/(tabs)/plans');
  };

  // Skip goals entirely
  const handleSkipGoals = () => {
    router.replace('/(tabs)');
  };

  // RENDER: Goals Selection Screen
  if (currentStep === 'goals') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <LinearGradient colors={accent.gradient as [string, string]} style={styles.headerGradient}>
              <MaterialCommunityIcons name="target" size={48} color="#fff" />
              <Text style={styles.headerTitle}>What's Your Goal?</Text>
              <Text style={styles.headerSubtitle}>Select up to 3 fitness goals to personalize your workout plan</Text>
            </LinearGradient>
          </View>

          <View style={styles.goalsContainer}>
            {FITNESS_GOALS.map((goal) => {
              const isSelected = selectedGoals.includes(goal.id);
              return (
                <TouchableOpacity
                  key={goal.id}
                  style={[styles.goalCard, { backgroundColor: colors.background.card }, isSelected && { borderColor: goal.color, borderWidth: 2 }]}
                  onPress={() => toggleGoal(goal.id)}
                  activeOpacity={0.7}
                >
                  {isSelected && (
                    <View style={[styles.selectedBadge, { backgroundColor: goal.color }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                  <View style={[styles.goalIcon, { backgroundColor: `${goal.color}20` }]}>
                    <Ionicons name={goal.icon as any} size={28} color={goal.color} />
                  </View>
                  <Text style={[styles.goalTitle, { color: colors.text.primary }]}>{goal.title}</Text>
                  <Text style={[styles.goalDescription, { color: colors.text.secondary }]}>{goal.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedGoals.length > 0 && (
            <View style={[styles.summary, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.summaryTitle, { color: colors.text.primary }]}>Your Selection ({selectedGoals.length}/3)</Text>
              <View style={styles.selectedTags}>
                {selectedGoals.map(goalId => {
                  const goal = FITNESS_GOALS.find(g => g.id === goalId);
                  if (!goal) return null;
                  return (
                    <View key={goalId} style={[styles.selectedTag, { backgroundColor: `${goal.color}20` }]}>
                      <Ionicons name={goal.icon as any} size={14} color={goal.color} />
                      <Text style={[styles.selectedTagText, { color: goal.color }]}>{goal.title}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: selectedGoals.length > 0 ? accent.primary : colors.background.elevated }]}
            onPress={handleCreatePlan}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={[styles.continueButtonText, { color: selectedGoals.length > 0 ? '#fff' : colors.text.muted }]}>
                  Create My Personalized Plan
                </Text>
                <Ionicons name="sparkles" size={20} color={selectedGoals.length > 0 ? '#fff' : colors.text.muted} />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkipGoals}>
            <Text style={[styles.skipButtonText, { color: colors.text.muted }]}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // RENDER: Success Screen
  if (currentStep === 'success') {
    return (
      <View style={styles.fullScreenContainer}>
        <Image source={{ uri: MOTIVATION_IMAGE }} style={styles.backgroundImage} resizeMode="cover" />
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)', 'rgba(0,0,0,0.95)']} style={styles.overlay}>
          {planGenerating ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.loadingText}>Creating your personalized plan...</Text>
            </View>
          ) : (
            <View style={styles.successContent}>
              <View style={styles.successIconContainer}>
                <LinearGradient colors={['#10B981', '#059669']} style={styles.successIcon}>
                  <Ionicons name="checkmark" size={40} color="#fff" />
                </LinearGradient>
              </View>
              
              <Text style={styles.successTitle}>Your Plan is Ready!</Text>
              <Text style={styles.successSubtitle}>We've created a personalized workout plan based on your goals</Text>

              {generatedPlan && (
                <View style={styles.planPreview}>
                  <Text style={styles.planPreviewName}>{generatedPlan.name}</Text>
                  <Text style={styles.planPreviewDesc} numberOfLines={2}>{generatedPlan.description}</Text>
                  <View style={styles.planPreviewMeta}>
                    <Ionicons name="calendar" size={16} color="#10B981" />
                    <Text style={styles.planPreviewMetaText}>{generatedPlan.duration_weeks || 4} weeks</Text>
                  </View>
                </View>
              )}

              <View style={styles.infoBox}>
                <Ionicons name="information-circle" size={20} color="#60A5FA" />
                <Text style={styles.infoBoxText}>
                  Your plan is saved in the <Text style={styles.infoBoxHighlight}>Plans</Text> tab
                </Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.primaryActionButton} onPress={handleViewPlan}>
                  <LinearGradient colors={['#10B981', '#059669']} style={styles.primaryButtonGradient}>
                    <Ionicons name="fitness" size={20} color="#fff" />
                    <Text style={styles.primaryButtonText}>View My Plan</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </LinearGradient>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  headerGradient: { borderRadius: 20, padding: 24, alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 12 },
  headerSubtitle: { fontSize: 15, color: 'rgba(255,255,255,0.9)', textAlign: 'center', marginTop: 8, lineHeight: 22 },
  goalsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  goalCard: { width: '47%', padding: 16, borderRadius: 16, position: 'relative', marginBottom: 4 },
  selectedBadge: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  goalIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  goalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  goalDescription: { fontSize: 12, lineHeight: 18 },
  summary: { borderRadius: 16, padding: 16, marginTop: 20, marginBottom: 24 },
  summaryTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  selectedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectedTag: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, gap: 6 },
  selectedTagText: { fontSize: 13, fontWeight: '600' },
  continueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, gap: 10 },
  continueButtonText: { fontSize: 17, fontWeight: '700' },
  skipButton: { alignItems: 'center', marginTop: 16, padding: 12 },
  skipButtonText: { fontSize: 14 },
  
  // Full screen success
  fullScreenContainer: { flex: 1, backgroundColor: '#000' },
  backgroundImage: { position: 'absolute', width: width, height: height, opacity: 0.6 },
  overlay: { flex: 1, justifyContent: 'flex-end', paddingBottom: 50, paddingHorizontal: 24 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#fff', fontSize: 18, marginTop: 16, fontWeight: '600' },
  successContent: { alignItems: 'center' },
  successIconContainer: { marginBottom: 20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  successSubtitle: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 20, lineHeight: 24 },
  planPreview: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 16, width: '100%', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  planPreviewName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  planPreviewDesc: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 12, lineHeight: 20 },
  planPreviewMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planPreviewMetaText: { fontSize: 14, color: '#10B981', fontWeight: '600' },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(59, 130, 246, 0.2)', borderRadius: 12, padding: 12, marginBottom: 20, gap: 10, width: '100%' },
  infoBoxText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  infoBoxHighlight: { color: '#60A5FA', fontWeight: '700' },
  actionButtons: { width: '100%', gap: 12 },
  primaryActionButton: { borderRadius: 12, overflow: 'hidden' },
  primaryButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});

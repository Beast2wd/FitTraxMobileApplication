import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');

// Step types
type OnboardingStep = 'goal' | 'experience' | 'location' | 'frequency' | 'generating' | 'success';

// Fitness goals - single selection
interface FitnessGoal {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const FITNESS_GOALS: FitnessGoal[] = [
  { id: 'weight_loss', title: 'Lose Weight', description: 'Burn fat and get leaner', icon: 'flame', color: '#EF4444' },
  { id: 'muscle_gain', title: 'Build Muscle', description: 'Gain strength and size', icon: 'barbell', color: '#3B82F6' },
  { id: 'endurance', title: 'Improve Endurance', description: 'Boost stamina and cardio', icon: 'pulse', color: '#10B981' },
  { id: 'flexibility', title: 'Increase Flexibility', description: 'Better mobility and recovery', icon: 'body', color: '#8B5CF6' },
  { id: 'tone', title: 'Tone & Define', description: 'Lean and defined physique', icon: 'fitness', color: '#F59E0B' },
  { id: 'general', title: 'General Fitness', description: 'Overall health improvement', icon: 'heart', color: '#EC4899' },
];

// Experience levels
const getExperienceOptions = (goalTitle: string) => [
  { id: 'brand_new', title: `I'm brand new to ${goalTitle.toLowerCase()}`, icon: 'leaf' },
  { id: 'less_than_1', title: 'Less than 1 year', icon: 'time' },
  { id: '1_2_years', title: '1-2 years', icon: 'trending-up' },
  { id: '2_4_years', title: '2-4 years', icon: 'ribbon' },
  { id: '4_plus', title: '4+ years', icon: 'trophy' },
];

// Workout locations
const WORKOUT_LOCATIONS = [
  { id: 'commercial_gym', title: 'At a commercial gym', description: 'Full equipment access', icon: 'business' },
  { id: 'small_gym', title: 'In a small gym', description: 'Basic equipment available', icon: 'storefront' },
  { id: 'home_limited', title: 'Home gym with limited equipment', description: 'Some weights and basics', icon: 'home' },
  { id: 'no_equipment', title: 'I have no workout equipment', description: 'Bodyweight only', icon: 'body' },
];

// Workout frequency
const WORKOUT_FREQUENCY = [
  { id: '2_days', title: '2 days per week', description: 'Light commitment', icon: 'calendar' },
  { id: '3_days', title: '3 days per week', description: 'Balanced routine', icon: 'calendar' },
  { id: '4_days', title: '4 days per week', description: 'Dedicated training', icon: 'calendar' },
  { id: '5_plus', title: '5+ days per week', description: 'Intensive program', icon: 'flame' },
];

export default function FitnessGoalsScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  // State
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('goal');
  const [selectedGoal, setSelectedGoal] = useState<FitnessGoal | null>(null);
  const [selectedExperience, setSelectedExperience] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [selectedFrequency, setSelectedFrequency] = useState<string | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Progress indicator
  const getProgress = () => {
    switch (currentStep) {
      case 'goal': return 0.2;
      case 'experience': return 0.4;
      case 'location': return 0.6;
      case 'frequency': return 0.8;
      case 'generating': return 0.9;
      case 'success': return 1;
      default: return 0;
    }
  };

  // Handle goal selection
  const handleGoalSelect = (goal: FitnessGoal) => {
    setSelectedGoal(goal);
  };

  // Handle continue from goal step
  const handleGoalContinue = () => {
    if (!selectedGoal) {
      Alert.alert('Select a Goal', 'Please select your top fitness goal to continue');
      return;
    }
    setCurrentStep('experience');
  };

  // Handle experience selection and continue
  const handleExperienceSelect = (experienceId: string) => {
    setSelectedExperience(experienceId);
    setCurrentStep('location');
  };

  // Handle location selection and continue
  const handleLocationSelect = (locationId: string) => {
    setSelectedLocation(locationId);
    setCurrentStep('frequency');
  };

  // Handle frequency selection and generate plan
  const handleFrequencySelect = async (frequencyId: string) => {
    setSelectedFrequency(frequencyId);
    setCurrentStep('generating');
    await generateWorkoutPlan(frequencyId);
  };

  // Generate AI workout plan
  const generateWorkoutPlan = async (frequencyId: string) => {
    setLoading(true);
    try {
      // Save preferences locally
      const preferences = {
        goal: selectedGoal?.id,
        goalTitle: selectedGoal?.title,
        experience: selectedExperience,
        location: selectedLocation,
        frequency: frequencyId,
        createdAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem('@fittrax_fitness_preferences', JSON.stringify(preferences));

      // Simulate AI generation (in production, this would call the backend)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Generate plan based on selections
      const plan = generatePlanFromPreferences(preferences);
      setGeneratedPlan(plan);
      
      // Save generated plan
      await AsyncStorage.setItem('@fittrax_generated_plan', JSON.stringify(plan));
      
      setCurrentStep('success');
    } catch (error) {
      console.error('Error generating plan:', error);
      Alert.alert('Error', 'Failed to generate your plan. Please try again.');
      setCurrentStep('frequency');
    } finally {
      setLoading(false);
    }
  };

  // Generate plan from user preferences
  const generatePlanFromPreferences = (prefs: any) => {
    const frequencyDays: { [key: string]: number } = {
      '2_days': 2,
      '3_days': 3,
      '4_days': 4,
      '5_plus': 5,
    };

    const experienceLevel: { [key: string]: string } = {
      'brand_new': 'Beginner',
      'less_than_1': 'Beginner',
      '1_2_years': 'Intermediate',
      '2_4_years': 'Advanced',
      '4_plus': 'Expert',
    };

    const locationEquipment: { [key: string]: string } = {
      'commercial_gym': 'Full gym equipment',
      'small_gym': 'Basic gym equipment',
      'home_limited': 'Limited home equipment',
      'no_equipment': 'Bodyweight only',
    };

    const daysPerWeek = frequencyDays[prefs.frequency] || 3;
    const level = experienceLevel[prefs.experience] || 'Beginner';
    const equipment = locationEquipment[prefs.location] || 'Bodyweight';

    return {
      name: `${prefs.goalTitle} - ${level} Program`,
      description: `A personalized ${daysPerWeek}-day ${prefs.goalTitle?.toLowerCase()} program tailored for ${level.toLowerCase()} level with ${equipment.toLowerCase()}.`,
      duration_weeks: level === 'Beginner' ? 8 : level === 'Intermediate' ? 6 : 4,
      days_per_week: daysPerWeek,
      level: level,
      equipment: equipment,
      goal: prefs.goal,
      workouts: generateWeeklyWorkouts(prefs, daysPerWeek),
    };
  };

  // Generate weekly workouts based on goal
  const generateWeeklyWorkouts = (prefs: any, daysPerWeek: number) => {
    const workoutTemplates: { [key: string]: string[] } = {
      'weight_loss': ['HIIT Cardio', 'Full Body Circuit', 'Cardio & Core', 'Metabolic Conditioning', 'Active Recovery'],
      'muscle_gain': ['Upper Body Push', 'Lower Body', 'Upper Body Pull', 'Full Body Strength', 'Arms & Shoulders'],
      'endurance': ['Long Cardio', 'Interval Training', 'Circuit Training', 'Tempo Run', 'Cross Training'],
      'flexibility': ['Yoga Flow', 'Dynamic Stretching', 'Mobility Work', 'Recovery Session', 'Balance Training'],
      'tone': ['Total Body Toning', 'Lower Body Sculpt', 'Upper Body Definition', 'Core & Cardio', 'Full Body HIIT'],
      'general': ['Cardio Mix', 'Strength Training', 'Flexibility', 'HIIT', 'Active Recovery'],
    };

    const template = workoutTemplates[prefs.goal] || workoutTemplates['general'];
    return template.slice(0, daysPerWeek).map((name, index) => ({
      day: index + 1,
      name: name,
      duration: '30-45 min',
      type: prefs.goal,
    }));
  };

  // Handle view plan
  const handleViewPlan = () => {
    router.replace('/(tabs)/plans');
  };

  // Handle skip
  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  // Back button handler
  const handleBack = () => {
    switch (currentStep) {
      case 'experience':
        setCurrentStep('goal');
        break;
      case 'location':
        setCurrentStep('experience');
        break;
      case 'frequency':
        setCurrentStep('location');
        break;
      default:
        break;
    }
  };

  // RENDER: Progress Bar
  const renderProgressBar = () => (
    <View style={styles.progressContainer}>
      <View style={[styles.progressBar, { backgroundColor: colors.background.elevated }]}>
        <LinearGradient
          colors={accent.gradient as [string, string]}
          style={[styles.progressFill, { width: `${getProgress() * 100}%` }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>
    </View>
  );

  // RENDER: Step 1 - Goal Selection
  if (currentStep === 'goal') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {renderProgressBar()}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.aiCoachBadge, { backgroundColor: `${accent.primary}20` }]}>
              <Ionicons name="sparkles" size={16} color={accent.primary} />
              <Text style={[styles.aiCoachText, { color: accent.primary }]}>AI Fitness Coach</Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              What's your top fitness goal?
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
              Choose one goal and we'll create a personalized plan just for you
            </Text>
          </View>

          <View style={styles.optionsContainer}>
            {FITNESS_GOALS.map((goal) => {
              const isSelected = selectedGoal?.id === goal.id;
              return (
                <TouchableOpacity
                  key={goal.id}
                  style={[
                    styles.goalCard,
                    { backgroundColor: colors.background.card },
                    isSelected && { borderColor: goal.color, borderWidth: 2 }
                  ]}
                  onPress={() => handleGoalSelect(goal)}
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

          <TouchableOpacity
            style={[
              styles.continueButton,
              { backgroundColor: selectedGoal ? accent.primary : colors.background.elevated }
            ]}
            onPress={handleGoalContinue}
            disabled={!selectedGoal}
          >
            <Text style={[styles.continueButtonText, { color: selectedGoal ? '#fff' : colors.text.muted }]}>
              Continue
            </Text>
            <Ionicons name="arrow-forward" size={20} color={selectedGoal ? '#fff' : colors.text.muted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={[styles.skipButtonText, { color: colors.text.muted }]}>Skip for now</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // RENDER: Step 2 - Experience Level
  if (currentStep === 'experience') {
    const experienceOptions = getExperienceOptions(selectedGoal?.title || 'fitness');
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {renderProgressBar()}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.aiCoachBadge, { backgroundColor: `${accent.primary}20` }]}>
              <Ionicons name="sparkles" size={16} color={accent.primary} />
              <Text style={[styles.aiCoachText, { color: accent.primary }]}>AI Fitness Coach</Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              How much {selectedGoal?.title.toLowerCase()} training experience do you have?
            </Text>
          </View>

          <View style={styles.listContainer}>
            {experienceOptions.map((option) => (
              <TouchableOpacity
                key={option.id}
                style={[styles.listOption, { backgroundColor: colors.background.card }]}
                onPress={() => handleExperienceSelect(option.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.listIconContainer, { backgroundColor: `${accent.primary}20` }]}>
                  <Ionicons name={option.icon as any} size={24} color={accent.primary} />
                </View>
                <Text style={[styles.listOptionText, { color: colors.text.primary }]}>{option.title}</Text>
                <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // RENDER: Step 3 - Workout Location
  if (currentStep === 'location') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {renderProgressBar()}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.aiCoachBadge, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.aiCoachText, { color: '#10B981' }]}>Great choice!</Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              We'll tailor your recommendations to your training age.
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
              Let's figure out where you plan on working out, so we can tailor your equipment.
            </Text>
          </View>

          <View style={styles.listContainer}>
            {WORKOUT_LOCATIONS.map((location) => (
              <TouchableOpacity
                key={location.id}
                style={[styles.listOption, { backgroundColor: colors.background.card }]}
                onPress={() => handleLocationSelect(location.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.listIconContainer, { backgroundColor: `${accent.primary}20` }]}>
                  <Ionicons name={location.icon as any} size={24} color={accent.primary} />
                </View>
                <View style={styles.listOptionContent}>
                  <Text style={[styles.listOptionText, { color: colors.text.primary }]}>{location.title}</Text>
                  <Text style={[styles.listOptionSubtext, { color: colors.text.muted }]}>{location.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // RENDER: Step 4 - Workout Frequency
  if (currentStep === 'frequency') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        {renderProgressBar()}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={[styles.aiCoachBadge, { backgroundColor: '#10B98120' }]}>
              <Ionicons name="sparkles" size={16} color="#10B981" />
              <Text style={[styles.aiCoachText, { color: '#10B981' }]}>Almost done!</Text>
            </View>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              Great! We are almost done with your setup.
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.text.secondary }]}>
              How many days per week do you workout?
            </Text>
          </View>

          <View style={styles.listContainer}>
            {WORKOUT_FREQUENCY.map((freq) => (
              <TouchableOpacity
                key={freq.id}
                style={[styles.listOption, { backgroundColor: colors.background.card }]}
                onPress={() => handleFrequencySelect(freq.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.listIconContainer, { backgroundColor: `${accent.primary}20` }]}>
                  <Ionicons name={freq.icon as any} size={24} color={accent.primary} />
                </View>
                <View style={styles.listOptionContent}>
                  <Text style={[styles.listOptionText, { color: colors.text.primary }]}>{freq.title}</Text>
                  <Text style={[styles.listOptionSubtext, { color: colors.text.muted }]}>{freq.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // RENDER: Generating Plan
  if (currentStep === 'generating') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.generatingContainer}>
          <LinearGradient
            colors={accent.gradient as [string, string]}
            style={styles.generatingIcon}
          >
            <Ionicons name="sparkles" size={40} color="#fff" />
          </LinearGradient>
          <Text style={[styles.generatingTitle, { color: colors.text.primary }]}>
            Creating Your Plan...
          </Text>
          <Text style={[styles.generatingSubtitle, { color: colors.text.secondary }]}>
            Our AI is building a personalized {selectedGoal?.title.toLowerCase()} program just for you
          </Text>
          <ActivityIndicator size="large" color={accent.primary} style={{ marginTop: 24 }} />
        </View>
      </SafeAreaView>
    );
  }

  // RENDER: Success
  if (currentStep === 'success' && generatedPlan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <ScrollView contentContainerStyle={styles.successContent} showsVerticalScrollIndicator={false}>
          <View style={styles.successIconContainer}>
            <LinearGradient colors={['#10B981', '#059669']} style={styles.successIcon}>
              <Ionicons name="checkmark" size={48} color="#fff" />
            </LinearGradient>
          </View>

          <Text style={[styles.successTitle, { color: colors.text.primary }]}>
            Your Plan is Ready!
          </Text>
          <Text style={[styles.successSubtitle, { color: colors.text.secondary }]}>
            We've created a personalized workout plan based on your goals and preferences
          </Text>

          <View style={[styles.planCard, { backgroundColor: colors.background.card }]}>
            <View style={[styles.planBadge, { backgroundColor: `${selectedGoal?.color}20` }]}>
              <Ionicons name={selectedGoal?.icon as any} size={20} color={selectedGoal?.color} />
            </View>
            <Text style={[styles.planName, { color: colors.text.primary }]}>{generatedPlan.name}</Text>
            <Text style={[styles.planDescription, { color: colors.text.secondary }]}>{generatedPlan.description}</Text>
            
            <View style={styles.planStats}>
              <View style={styles.planStat}>
                <Ionicons name="calendar" size={18} color={accent.primary} />
                <Text style={[styles.planStatText, { color: colors.text.primary }]}>{generatedPlan.duration_weeks} weeks</Text>
              </View>
              <View style={styles.planStat}>
                <Ionicons name="repeat" size={18} color={accent.primary} />
                <Text style={[styles.planStatText, { color: colors.text.primary }]}>{generatedPlan.days_per_week} days/week</Text>
              </View>
              <View style={styles.planStat}>
                <Ionicons name="trending-up" size={18} color={accent.primary} />
                <Text style={[styles.planStatText, { color: colors.text.primary }]}>{generatedPlan.level}</Text>
              </View>
            </View>

            <View style={styles.workoutPreview}>
              <Text style={[styles.workoutPreviewTitle, { color: colors.text.primary }]}>Weekly Schedule</Text>
              {generatedPlan.workouts.map((workout: any) => (
                <View key={workout.day} style={[styles.workoutItem, { borderLeftColor: selectedGoal?.color }]}>
                  <Text style={[styles.workoutDay, { color: colors.text.muted }]}>Day {workout.day}</Text>
                  <Text style={[styles.workoutName, { color: colors.text.primary }]}>{workout.name}</Text>
                  <Text style={[styles.workoutDuration, { color: colors.text.secondary }]}>{workout.duration}</Text>
                </View>
              ))}
            </View>
          </View>

          <TouchableOpacity style={styles.viewPlanButton} onPress={handleViewPlan}>
            <LinearGradient
              colors={accent.gradient as [string, string]}
              style={styles.viewPlanGradient}
            >
              <Ionicons name="fitness" size={20} color="#fff" />
              <Text style={styles.viewPlanText}>Start My Plan</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  
  // Progress bar
  progressContainer: { paddingHorizontal: 20, paddingTop: 10 },
  progressBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  
  // Back button
  backButton: { marginBottom: 16, padding: 4 },
  
  // Header
  header: { marginBottom: 24 },
  aiCoachBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6, marginBottom: 16 },
  aiCoachText: { fontSize: 13, fontWeight: '600' },
  headerTitle: { fontSize: 26, fontWeight: '800', lineHeight: 34, marginBottom: 8 },
  headerSubtitle: { fontSize: 15, lineHeight: 22 },
  
  // Goal cards grid
  optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  goalCard: { width: '47%', padding: 16, borderRadius: 16, position: 'relative', marginBottom: 4 },
  selectedBadge: { position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  goalIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  goalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  goalDescription: { fontSize: 12, lineHeight: 18 },
  
  // List options
  listContainer: { gap: 12 },
  listOption: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 16, gap: 14 },
  listIconContainer: { width: 48, height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  listOptionContent: { flex: 1 },
  listOptionText: { fontSize: 16, fontWeight: '600' },
  listOptionSubtext: { fontSize: 13, marginTop: 2 },
  
  // Buttons
  continueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, gap: 10, marginTop: 24 },
  continueButtonText: { fontSize: 17, fontWeight: '700' },
  skipButton: { alignItems: 'center', marginTop: 16, padding: 12 },
  skipButtonText: { fontSize: 14 },
  
  // Generating
  generatingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  generatingIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  generatingTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  generatingSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  
  // Success
  successContent: { padding: 20, paddingBottom: 40, alignItems: 'center' },
  successIconContainer: { marginBottom: 20, marginTop: 20 },
  successIcon: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  successSubtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  
  // Plan card
  planCard: { width: '100%', borderRadius: 20, padding: 20, marginBottom: 24 },
  planBadge: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  planName: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  planDescription: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  planStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(128,128,128,0.2)' },
  planStat: { alignItems: 'center', gap: 4 },
  planStatText: { fontSize: 13, fontWeight: '600' },
  
  // Workout preview
  workoutPreview: { marginTop: 8 },
  workoutPreviewTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  workoutItem: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 12 },
  workoutDay: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  workoutName: { fontSize: 15, fontWeight: '600' },
  workoutDuration: { fontSize: 12, marginTop: 2 },
  
  // View plan button
  viewPlanButton: { width: '100%', borderRadius: 12, overflow: 'hidden' },
  viewPlanGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, gap: 10 },
  viewPlanText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});

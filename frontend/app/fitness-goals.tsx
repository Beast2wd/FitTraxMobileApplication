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

  // Generate weekly workouts based on goal with detailed exercises
  const generateWeeklyWorkouts = (prefs: any, daysPerWeek: number) => {
    // Workout templates with exercises for each goal
    const workoutTemplates: { [key: string]: { name: string; exercises: { name: string; sets: number; reps: string; rest: string }[] }[] } = {
      'weight_loss': [
        {
          name: 'HIIT Cardio',
          exercises: [
            { name: 'Jumping Jacks', sets: 3, reps: '45 sec', rest: '15 sec' },
            { name: 'Burpees', sets: 3, reps: '30 sec', rest: '30 sec' },
            { name: 'Mountain Climbers', sets: 3, reps: '45 sec', rest: '15 sec' },
            { name: 'High Knees', sets: 3, reps: '45 sec', rest: '15 sec' },
            { name: 'Jump Squats', sets: 3, reps: '30 sec', rest: '30 sec' },
            { name: 'Plank Jacks', sets: 3, reps: '30 sec', rest: '30 sec' },
          ]
        },
        {
          name: 'Full Body Circuit',
          exercises: [
            { name: 'Squat to Press', sets: 3, reps: '12 reps', rest: '30 sec' },
            { name: 'Renegade Rows', sets: 3, reps: '10 each', rest: '30 sec' },
            { name: 'Lunges with Twist', sets: 3, reps: '10 each', rest: '30 sec' },
            { name: 'Push-up to T-Rotation', sets: 3, reps: '10 reps', rest: '30 sec' },
            { name: 'Deadlift to Row', sets: 3, reps: '12 reps', rest: '30 sec' },
          ]
        },
        {
          name: 'Cardio & Core',
          exercises: [
            { name: 'Bicycle Crunches', sets: 3, reps: '20 each', rest: '20 sec' },
            { name: 'Plank Hold', sets: 3, reps: '45 sec', rest: '15 sec' },
            { name: 'Russian Twists', sets: 3, reps: '20 each', rest: '20 sec' },
            { name: 'Leg Raises', sets: 3, reps: '15 reps', rest: '20 sec' },
            { name: 'Box Jumps / Step Ups', sets: 3, reps: '12 reps', rest: '30 sec' },
          ]
        },
        {
          name: 'Metabolic Conditioning',
          exercises: [
            { name: 'Kettlebell Swings', sets: 4, reps: '20 reps', rest: '30 sec' },
            { name: 'Box Step Overs', sets: 3, reps: '30 sec', rest: '20 sec' },
            { name: 'Battle Ropes', sets: 3, reps: '30 sec', rest: '30 sec' },
            { name: 'Sled Push / Walking Lunges', sets: 3, reps: '40 yards', rest: '45 sec' },
            { name: 'Wall Balls', sets: 3, reps: '15 reps', rest: '30 sec' },
          ]
        },
        {
          name: 'Active Recovery',
          exercises: [
            { name: 'Light Walking', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Foam Rolling', sets: 1, reps: '10 min', rest: '-' },
            { name: 'Stretching Routine', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Deep Breathing', sets: 1, reps: '5 min', rest: '-' },
          ]
        },
      ],
      'muscle_gain': [
        {
          name: 'Upper Body Push',
          exercises: [
            { name: 'Bench Press', sets: 4, reps: '8-10 reps', rest: '90 sec' },
            { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12 reps', rest: '60 sec' },
            { name: 'Overhead Press', sets: 4, reps: '8-10 reps', rest: '90 sec' },
            { name: 'Dips', sets: 3, reps: '10-12 reps', rest: '60 sec' },
            { name: 'Tricep Pushdowns', sets: 3, reps: '12-15 reps', rest: '45 sec' },
            { name: 'Lateral Raises', sets: 3, reps: '12-15 reps', rest: '45 sec' },
          ]
        },
        {
          name: 'Lower Body',
          exercises: [
            { name: 'Barbell Squats', sets: 4, reps: '8-10 reps', rest: '120 sec' },
            { name: 'Romanian Deadlifts', sets: 4, reps: '10-12 reps', rest: '90 sec' },
            { name: 'Leg Press', sets: 3, reps: '12-15 reps', rest: '60 sec' },
            { name: 'Walking Lunges', sets: 3, reps: '12 each', rest: '60 sec' },
            { name: 'Leg Curls', sets: 3, reps: '12-15 reps', rest: '45 sec' },
            { name: 'Calf Raises', sets: 4, reps: '15-20 reps', rest: '45 sec' },
          ]
        },
        {
          name: 'Upper Body Pull',
          exercises: [
            { name: 'Deadlifts', sets: 4, reps: '6-8 reps', rest: '120 sec' },
            { name: 'Pull-ups / Lat Pulldowns', sets: 4, reps: '8-10 reps', rest: '90 sec' },
            { name: 'Barbell Rows', sets: 4, reps: '8-10 reps', rest: '90 sec' },
            { name: 'Face Pulls', sets: 3, reps: '15-20 reps', rest: '45 sec' },
            { name: 'Barbell Curls', sets: 3, reps: '10-12 reps', rest: '45 sec' },
            { name: 'Hammer Curls', sets: 3, reps: '12-15 reps', rest: '45 sec' },
          ]
        },
        {
          name: 'Full Body Strength',
          exercises: [
            { name: 'Front Squats', sets: 4, reps: '8 reps', rest: '90 sec' },
            { name: 'Push Press', sets: 4, reps: '8 reps', rest: '90 sec' },
            { name: 'Weighted Pull-ups', sets: 3, reps: '6-8 reps', rest: '90 sec' },
            { name: 'Dumbbell Lunges', sets: 3, reps: '10 each', rest: '60 sec' },
            { name: 'Plank Hold', sets: 3, reps: '60 sec', rest: '30 sec' },
          ]
        },
        {
          name: 'Arms & Shoulders',
          exercises: [
            { name: 'Arnold Press', sets: 4, reps: '10-12 reps', rest: '60 sec' },
            { name: 'Skull Crushers', sets: 3, reps: '12 reps', rest: '45 sec' },
            { name: 'Preacher Curls', sets: 3, reps: '12 reps', rest: '45 sec' },
            { name: 'Cable Lateral Raises', sets: 3, reps: '15 reps', rest: '30 sec' },
            { name: 'Overhead Tricep Extension', sets: 3, reps: '12 reps', rest: '45 sec' },
            { name: 'Concentration Curls', sets: 3, reps: '12 each', rest: '30 sec' },
          ]
        },
      ],
      'endurance': [
        {
          name: 'Long Cardio',
          exercises: [
            { name: 'Warm-up Jog', sets: 1, reps: '5 min', rest: '-' },
            { name: 'Steady-State Run', sets: 1, reps: '30-45 min', rest: '-' },
            { name: 'Cool Down Walk', sets: 1, reps: '5 min', rest: '-' },
            { name: 'Post-Run Stretches', sets: 1, reps: '10 min', rest: '-' },
          ]
        },
        {
          name: 'Interval Training',
          exercises: [
            { name: 'Warm-up', sets: 1, reps: '5 min', rest: '-' },
            { name: 'Sprint Intervals', sets: 8, reps: '30 sec fast', rest: '60 sec jog' },
            { name: 'Hill Repeats', sets: 4, reps: '2 min climb', rest: 'walk down' },
            { name: 'Cool Down', sets: 1, reps: '5 min', rest: '-' },
          ]
        },
        {
          name: 'Circuit Training',
          exercises: [
            { name: 'Rowing Machine', sets: 3, reps: '500m', rest: '60 sec' },
            { name: 'Bike Sprints', sets: 3, reps: '2 min', rest: '60 sec' },
            { name: 'Jump Rope', sets: 3, reps: '2 min', rest: '30 sec' },
            { name: 'Stair Climber', sets: 2, reps: '5 min', rest: '60 sec' },
          ]
        },
        {
          name: 'Tempo Run',
          exercises: [
            { name: 'Easy Warm-up', sets: 1, reps: '10 min', rest: '-' },
            { name: 'Tempo Pace Run', sets: 1, reps: '20-25 min', rest: '-' },
            { name: 'Cool Down Jog', sets: 1, reps: '10 min', rest: '-' },
            { name: 'Dynamic Stretches', sets: 1, reps: '5 min', rest: '-' },
          ]
        },
        {
          name: 'Cross Training',
          exercises: [
            { name: 'Swimming', sets: 1, reps: '20 min', rest: '-' },
            { name: 'Cycling', sets: 1, reps: '30 min', rest: '-' },
            { name: 'Elliptical', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Core Work', sets: 3, reps: '10 min', rest: '30 sec' },
          ]
        },
      ],
      'flexibility': [
        {
          name: 'Yoga Flow',
          exercises: [
            { name: 'Sun Salutation A', sets: 5, reps: 'flow', rest: '-' },
            { name: 'Warrior Sequence', sets: 3, reps: '30 sec each', rest: '-' },
            { name: 'Triangle Pose', sets: 2, reps: '30 sec each', rest: '-' },
            { name: 'Pigeon Pose', sets: 2, reps: '60 sec each', rest: '-' },
            { name: 'Seated Forward Fold', sets: 2, reps: '60 sec', rest: '-' },
            { name: 'Savasana', sets: 1, reps: '5 min', rest: '-' },
          ]
        },
        {
          name: 'Dynamic Stretching',
          exercises: [
            { name: 'Leg Swings', sets: 2, reps: '15 each', rest: '-' },
            { name: 'Arm Circles', sets: 2, reps: '20 each', rest: '-' },
            { name: 'Hip Circles', sets: 2, reps: '15 each', rest: '-' },
            { name: 'Walking Knee Hugs', sets: 2, reps: '10 each', rest: '-' },
            { name: 'Lunge with Twist', sets: 2, reps: '10 each', rest: '-' },
            { name: 'Inchworms', sets: 2, reps: '8 reps', rest: '-' },
          ]
        },
        {
          name: 'Mobility Work',
          exercises: [
            { name: '90/90 Hip Stretch', sets: 2, reps: '60 sec each', rest: '-' },
            { name: 'Thread the Needle', sets: 2, reps: '30 sec each', rest: '-' },
            { name: 'Cat-Cow Stretch', sets: 3, reps: '10 reps', rest: '-' },
            { name: 'World\'s Greatest Stretch', sets: 2, reps: '5 each', rest: '-' },
            { name: 'Foam Roll IT Band', sets: 2, reps: '60 sec each', rest: '-' },
          ]
        },
        {
          name: 'Recovery Session',
          exercises: [
            { name: 'Foam Rolling - Full Body', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Static Stretching', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Breathing Exercises', sets: 1, reps: '5 min', rest: '-' },
            { name: 'Light Walking', sets: 1, reps: '10 min', rest: '-' },
          ]
        },
        {
          name: 'Balance Training',
          exercises: [
            { name: 'Single Leg Stand', sets: 3, reps: '30 sec each', rest: '15 sec' },
            { name: 'Bosu Ball Squats', sets: 3, reps: '12 reps', rest: '30 sec' },
            { name: 'Tree Pose', sets: 2, reps: '45 sec each', rest: '-' },
            { name: 'Single Leg Deadlift', sets: 3, reps: '8 each', rest: '30 sec' },
            { name: 'Stability Ball Plank', sets: 3, reps: '30 sec', rest: '30 sec' },
          ]
        },
      ],
      'tone': [
        {
          name: 'Total Body Toning',
          exercises: [
            { name: 'Goblet Squats', sets: 3, reps: '15 reps', rest: '45 sec' },
            { name: 'Push-ups', sets: 3, reps: '12-15 reps', rest: '45 sec' },
            { name: 'Dumbbell Rows', sets: 3, reps: '12 each', rest: '45 sec' },
            { name: 'Reverse Lunges', sets: 3, reps: '12 each', rest: '45 sec' },
            { name: 'Plank to Downdog', sets: 3, reps: '10 reps', rest: '30 sec' },
            { name: 'Bicycle Crunches', sets: 3, reps: '20 each', rest: '30 sec' },
          ]
        },
        {
          name: 'Lower Body Sculpt',
          exercises: [
            { name: 'Sumo Squats', sets: 3, reps: '15 reps', rest: '45 sec' },
            { name: 'Glute Bridges', sets: 3, reps: '20 reps', rest: '30 sec' },
            { name: 'Step-ups', sets: 3, reps: '12 each', rest: '45 sec' },
            { name: 'Fire Hydrants', sets: 3, reps: '15 each', rest: '30 sec' },
            { name: 'Calf Raises', sets: 3, reps: '20 reps', rest: '30 sec' },
            { name: 'Wall Sit', sets: 3, reps: '45 sec', rest: '30 sec' },
          ]
        },
        {
          name: 'Upper Body Definition',
          exercises: [
            { name: 'Tricep Dips', sets: 3, reps: '15 reps', rest: '45 sec' },
            { name: 'Bicep Curls', sets: 3, reps: '15 reps', rest: '45 sec' },
            { name: 'Shoulder Press', sets: 3, reps: '12 reps', rest: '45 sec' },
            { name: 'Bent Over Rows', sets: 3, reps: '12 reps', rest: '45 sec' },
            { name: 'Chest Flyes', sets: 3, reps: '12 reps', rest: '45 sec' },
            { name: 'Lateral Raises', sets: 3, reps: '15 reps', rest: '30 sec' },
          ]
        },
        {
          name: 'Core & Cardio',
          exercises: [
            { name: 'Mountain Climbers', sets: 3, reps: '30 sec', rest: '20 sec' },
            { name: 'Plank Hold', sets: 3, reps: '45 sec', rest: '20 sec' },
            { name: 'High Knees', sets: 3, reps: '30 sec', rest: '20 sec' },
            { name: 'Dead Bug', sets: 3, reps: '10 each', rest: '20 sec' },
            { name: 'Jumping Jacks', sets: 3, reps: '45 sec', rest: '15 sec' },
            { name: 'V-ups', sets: 3, reps: '12 reps', rest: '30 sec' },
          ]
        },
        {
          name: 'Full Body HIIT',
          exercises: [
            { name: 'Squat Jumps', sets: 3, reps: '30 sec', rest: '30 sec' },
            { name: 'Push-up to Renegade Row', sets: 3, reps: '10 reps', rest: '30 sec' },
            { name: 'Skaters', sets: 3, reps: '30 sec', rest: '20 sec' },
            { name: 'Burpees', sets: 3, reps: '10 reps', rest: '45 sec' },
            { name: 'Plank Jacks', sets: 3, reps: '30 sec', rest: '20 sec' },
          ]
        },
      ],
      'general': [
        {
          name: 'Cardio Mix',
          exercises: [
            { name: 'Warm-up Walk', sets: 1, reps: '5 min', rest: '-' },
            { name: 'Jogging', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Jump Rope', sets: 3, reps: '2 min', rest: '30 sec' },
            { name: 'Stair Climbing', sets: 2, reps: '5 min', rest: '60 sec' },
            { name: 'Cool Down Stretch', sets: 1, reps: '5 min', rest: '-' },
          ]
        },
        {
          name: 'Strength Training',
          exercises: [
            { name: 'Squats', sets: 3, reps: '12 reps', rest: '60 sec' },
            { name: 'Push-ups', sets: 3, reps: '10-15 reps', rest: '45 sec' },
            { name: 'Dumbbell Rows', sets: 3, reps: '12 each', rest: '45 sec' },
            { name: 'Lunges', sets: 3, reps: '10 each', rest: '45 sec' },
            { name: 'Plank', sets: 3, reps: '30 sec', rest: '30 sec' },
          ]
        },
        {
          name: 'Flexibility',
          exercises: [
            { name: 'Neck Stretches', sets: 2, reps: '30 sec each', rest: '-' },
            { name: 'Shoulder Stretches', sets: 2, reps: '30 sec each', rest: '-' },
            { name: 'Hamstring Stretch', sets: 2, reps: '45 sec each', rest: '-' },
            { name: 'Hip Flexor Stretch', sets: 2, reps: '45 sec each', rest: '-' },
            { name: 'Child\'s Pose', sets: 2, reps: '60 sec', rest: '-' },
          ]
        },
        {
          name: 'HIIT',
          exercises: [
            { name: 'Burpees', sets: 3, reps: '30 sec', rest: '30 sec' },
            { name: 'Mountain Climbers', sets: 3, reps: '30 sec', rest: '20 sec' },
            { name: 'Jump Squats', sets: 3, reps: '30 sec', rest: '30 sec' },
            { name: 'High Knees', sets: 3, reps: '30 sec', rest: '20 sec' },
            { name: 'Plank Jacks', sets: 3, reps: '30 sec', rest: '30 sec' },
          ]
        },
        {
          name: 'Active Recovery',
          exercises: [
            { name: 'Light Walking', sets: 1, reps: '20 min', rest: '-' },
            { name: 'Foam Rolling', sets: 1, reps: '10 min', rest: '-' },
            { name: 'Gentle Yoga', sets: 1, reps: '15 min', rest: '-' },
            { name: 'Deep Breathing', sets: 1, reps: '5 min', rest: '-' },
          ]
        },
      ],
    };

    const template = workoutTemplates[prefs.goal] || workoutTemplates['general'];
    return template.slice(0, daysPerWeek).map((workout, index) => ({
      day: index + 1,
      name: workout.name,
      duration: '30-45 min',
      type: prefs.goal,
      exercises: workout.exercises,
    }));
  };

  // Handle view plan
  const handleViewPlan = () => {
    // Navigate to health connect screen before going to plans
    router.replace('/health-connect');
  };

  // Handle skip
  const handleSkip = () => {
    // Navigate to health connect screen even if skipping plan
    router.replace('/health-connect');
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

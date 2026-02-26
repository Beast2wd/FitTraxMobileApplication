import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { SwipeableRow } from '../components/SwipeableRow';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width } = Dimensions.get('window');

type TabType = 'scan' | 'results' | 'progress';

interface Measurements {
  chest: string;
  waist: string;
  hips: string;
  left_arm: string;
  right_arm: string;
  left_thigh: string;
  right_thigh: string;
  left_calf: string;
  right_calf: string;
  neck: string;
  shoulders: string;
}

export default function BodyScanScreen() {
  const { userId, profile } = useUserStore();
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('scan');
  
  // Scan inputs
  const [photos, setPhotos] = useState<string[]>([]);
  const [measurements, setMeasurements] = useState<Measurements>({
    chest: '', waist: '', hips: '',
    left_arm: '', right_arm: '',
    left_thigh: '', right_thigh: '',
    left_calf: '', right_calf: '',
    neck: '', shoulders: ''
  });
  const [weight, setWeight] = useState(profile?.weight?.toString() || '');
  const [heightInches, setHeightInches] = useState(
    profile ? ((profile.height_feet || 0) * 12 + (profile.height_inches || 0)).toString() : ''
  );
  const [bodyFat, setBodyFat] = useState('');
  const [fitnessGoal, setFitnessGoal] = useState('general_fitness');
  const [workoutLocation, setWorkoutLocation] = useState('both');
  const [experienceLevel, setExperienceLevel] = useState('intermediate');
  
  // Results
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [scanHistory, setScanHistory] = useState<any[]>([]);
  const [progressData, setProgressData] = useState<any>(null);
  
  // Modals
  const [workoutModalVisible, setWorkoutModalVisible] = useState(false);
  const [selectedDay, setSelectedDay] = useState<any>(null);

  const loadHistory = useCallback(async () => {
    if (!userId) return;
    try {
      const [historyRes, progressRes] = await Promise.all([
        axios.get(`${API_URL}/api/body-scan/history/${userId}?limit=10`),
        axios.get(`${API_URL}/api/body-scan/progress/${userId}`),
      ]);
      setScanHistory(historyRes.data.scans || []);
      setProgressData(progressRes.data);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  }, [userId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  // Delete a body scan entry
  const deleteScanEntry = async (scanId: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this measurement entry? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/body-scan/${scanId}`);
              // Update local state
              if (progressData?.progress) {
                setProgressData({
                  ...progressData,
                  progress: progressData.progress.filter((p: any) => p.scan_id !== scanId),
                  total_scans: (progressData.total_scans || 1) - 1,
                });
              }
              setScanHistory(scanHistory.filter(s => s.scan_id !== scanId));
              Alert.alert('Deleted', 'Measurement entry removed successfully');
            } catch (error) {
              console.error('Error deleting scan:', error);
              Alert.alert('Error', 'Failed to delete entry. Please try again.');
            }
          },
        },
      ]
    );
  };

  const pickImage = async (index: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const newPhotos = [...photos];
      newPhotos[index] = result.assets[0].base64;
      setPhotos(newPhotos);
    }
  };

  const takePhoto = async (index: number) => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const newPhotos = [...photos];
      newPhotos[index] = result.assets[0].base64;
      setPhotos(newPhotos);
    }
  };

  const analyzeScan = async () => {
    // Check if we have either photos or measurements
    const hasMeasurements = Object.values(measurements).some(v => v !== '');
    if (photos.length === 0 && !hasMeasurements) {
      Alert.alert('Input Required', 'Please add photos or enter your measurements');
      return;
    }

    setAnalyzing(true);
    try {
      const measurementsData: any = {};
      Object.entries(measurements).forEach(([key, value]) => {
        if (value) measurementsData[key] = parseFloat(value);
      });

      const response = await axios.post(`${API_URL}/api/body-scan/analyze`, {
        user_id: userId,
        photos: photos.filter(p => p),
        measurements: Object.keys(measurementsData).length > 0 ? measurementsData : null,
        height_inches: heightInches ? parseFloat(heightInches) : null,
        weight_lbs: weight ? parseFloat(weight) : null,
        body_fat_percentage: bodyFat ? parseFloat(bodyFat) : null,
        fitness_goal: fitnessGoal,
        workout_location: workoutLocation,
        experience_level: experienceLevel,
      });

      setAnalysisResult(response.data.analysis);
      setWorkoutPlan(response.data.workout_plan);
      setActiveTab('results');
      loadHistory();
      
      Alert.alert('Analysis Complete!', 'Your personalized workout plan has been generated.');
    } catch (error) {
      console.error('Error analyzing scan:', error);
      Alert.alert('Error', 'Failed to analyze body scan. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateMeasurement = (key: keyof Measurements, value: string) => {
    setMeasurements(prev => ({ ...prev, [key]: value }));
  };

  const goalOptions = [
    { id: 'general_fitness', label: 'General Fitness', icon: 'fitness' },
    { id: 'muscle_gain', label: 'Build Muscle', icon: 'barbell' },
    { id: 'fat_loss', label: 'Lose Fat', icon: 'flame' },
    { id: 'strength', label: 'Get Stronger', icon: 'trophy' },
    { id: 'athletic', label: 'Athletic Performance', icon: 'flash' },
  ];

  const locationOptions = [
    { id: 'gym', label: 'Gym', icon: 'business' },
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'both', label: 'Both', icon: 'apps' },
  ];

  const experienceOptions = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' },
  ];

  const photoLabels = ['Front View', 'Side View', 'Back View'];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Body Scan</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {[
            { id: 'scan', label: 'New Scan', icon: 'scan' },
            { id: 'results', label: 'Results', icon: 'analytics' },
            { id: 'progress', label: 'Progress', icon: 'trending-up' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, { backgroundColor: colors.background.secondary }, activeTab === tab.id && { backgroundColor: accent.primary }]}
              onPress={() => setActiveTab(tab.id as TabType)}
            >
              <Ionicons 
                name={tab.icon as any} 
                size={18} 
                color={activeTab === tab.id ? '#fff' : colors.text.secondary} 
              />
              <Text style={[styles.tabText, { color: colors.text.secondary }, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Scan Tab */}
          {activeTab === 'scan' && (
            <>
              {/* Hero */}
              <LinearGradient
                colors={['#6366F1', '#8B5CF6']}
                style={styles.heroCard}
              >
                <MaterialCommunityIcons name="human" size={40} color="#fff" />
                <View style={styles.heroText}>
                  <Text style={styles.heroTitle}>AI Body Analysis</Text>
                  <Text style={styles.heroSubtitle}>
                    Get a personalized workout based on your body
                  </Text>
                </View>
              </LinearGradient>

              {/* Photo Upload Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📸 Photos (Optional)</Text>
                <Text style={styles.sectionSubtitle}>
                  Take or upload photos for AI-powered analysis
                </Text>
                
                <View style={styles.photosGrid}>
                  {[0, 1, 2].map((index) => (
                    <View key={index} style={styles.photoContainer}>
                      <Text style={styles.photoLabel}>{photoLabels[index]}</Text>
                      {photos[index] ? (
                        <TouchableOpacity 
                          style={styles.photoPreview}
                          onPress={() => {
                            const newPhotos = [...photos];
                            newPhotos[index] = '';
                            setPhotos(newPhotos);
                          }}
                        >
                          <Image
                            source={{ uri: `data:image/jpeg;base64,${photos[index]}` }}
                            style={styles.photoImage}
                          />
                          <View style={styles.removePhoto}>
                            <Ionicons name="close" size={16} color="#fff" />
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.photoPlaceholder}>
                          <TouchableOpacity 
                            style={styles.photoButton}
                            onPress={() => takePhoto(index)}
                          >
                            <Ionicons name="camera" size={24} color={Colors.brand.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={styles.photoButton}
                            onPress={() => pickImage(index)}
                          >
                            <Ionicons name="image" size={24} color={Colors.brand.primary} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>

              {/* Measurements Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📏 Measurements (inches)</Text>
                <Text style={styles.sectionSubtitle}>
                  Enter your circumference measurements
                </Text>

                <View style={styles.measurementGrid}>
                  {[
                    { key: 'chest', label: 'Chest', icon: 'body' },
                    { key: 'waist', label: 'Waist', icon: 'body' },
                    { key: 'hips', label: 'Hips', icon: 'body' },
                    { key: 'shoulders', label: 'Shoulders', icon: 'body' },
                    { key: 'neck', label: 'Neck', icon: 'body' },
                  ].map(({ key, label }) => (
                    <View key={key} style={styles.measurementItem}>
                      <Text style={[styles.measurementLabel, { color: colors.text.secondary }]}>{label}</Text>
                      <TextInput
                        style={[styles.measurementInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                        value={measurements[key as keyof Measurements]}
                        onChangeText={(v) => updateMeasurement(key as keyof Measurements, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                  ))}
                </View>

                <Text style={[styles.subSectionTitle, { color: colors.text.primary }]}>Arms & Legs</Text>
                <View style={styles.measurementGrid}>
                  {[
                    { key: 'left_arm', label: 'L Arm' },
                    { key: 'right_arm', label: 'R Arm' },
                    { key: 'left_thigh', label: 'L Thigh' },
                    { key: 'right_thigh', label: 'R Thigh' },
                    { key: 'left_calf', label: 'L Calf' },
                    { key: 'right_calf', label: 'R Calf' },
                  ].map(({ key, label }) => (
                    <View key={key} style={styles.measurementItemSmall}>
                      <Text style={[styles.measurementLabelSmall, { color: colors.text.secondary }]}>{label}</Text>
                      <TextInput
                        style={[styles.measurementInputSmall, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                        value={measurements[key as keyof Measurements]}
                        onChangeText={(v) => updateMeasurement(key as keyof Measurements, v)}
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                  ))}
                </View>

                <Text style={[styles.subSectionTitle, { color: colors.text.primary }]}>Body Stats</Text>
                <View style={styles.bodyStatsRow}>
                  <View style={styles.bodyStatItem}>
                    <Text style={[styles.measurementLabel, { color: colors.text.secondary }]}>Weight (lbs)</Text>
                    <TextInput
                      style={[styles.measurementInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                      value={weight}
                      onChangeText={setWeight}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                  <View style={styles.bodyStatItem}>
                    <Text style={[styles.measurementLabel, { color: colors.text.secondary }]}>Height (in)</Text>
                    <TextInput
                      style={[styles.measurementInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                      value={heightInches}
                      onChangeText={setHeightInches}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                  <View style={styles.bodyStatItem}>
                    <Text style={[styles.measurementLabel, { color: colors.text.secondary }]}>Body Fat %</Text>
                    <TextInput
                      style={[styles.measurementInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                      value={bodyFat}
                      onChangeText={setBodyFat}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                </View>
              </View>

              {/* Goals Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🎯 Your Goal</Text>
                <View style={styles.optionsGrid}>
                  {goalOptions.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.optionCard,
                        fitnessGoal === option.id && styles.optionCardActive
                      ]}
                      onPress={() => setFitnessGoal(option.id)}
                    >
                      <Ionicons 
                        name={option.icon as any} 
                        size={24} 
                        color={fitnessGoal === option.id ? '#fff' : Colors.brand.primary} 
                      />
                      <Text style={[
                        styles.optionLabel,
                        fitnessGoal === option.id && styles.optionLabelActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Workout Location */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🏋️ Workout Location</Text>
                <View style={styles.locationOptions}>
                  {locationOptions.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.locationOption,
                        workoutLocation === option.id && styles.locationOptionActive
                      ]}
                      onPress={() => setWorkoutLocation(option.id)}
                    >
                      <Ionicons 
                        name={option.icon as any} 
                        size={20} 
                        color={workoutLocation === option.id ? '#fff' : Colors.text.secondary} 
                      />
                      <Text style={[
                        styles.locationLabel,
                        workoutLocation === option.id && styles.locationLabelActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Experience Level */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>💪 Experience Level</Text>
                <View style={styles.experienceOptions}>
                  {experienceOptions.map(option => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.experienceOption,
                        experienceLevel === option.id && styles.experienceOptionActive
                      ]}
                      onPress={() => setExperienceLevel(option.id)}
                    >
                      <Text style={[
                        styles.experienceLabel,
                        experienceLevel === option.id && styles.experienceLabelActive
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Analyze Button */}
              <TouchableOpacity 
                style={styles.analyzeButton}
                onPress={analyzeScan}
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.analyzeButtonText}>Analyzing...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="sparkles" size={24} color="#fff" />
                    <Text style={styles.analyzeButtonText}>Generate Workout Plan</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Results Tab */}
          {activeTab === 'results' && (
            <>
              {analysisResult ? (
                <>
                  {/* Body Type Card */}
                  <View style={styles.resultCard}>
                    <View style={styles.bodyTypeHeader}>
                      <MaterialCommunityIcons name="human" size={48} color={Colors.brand.primary} />
                      <View style={styles.bodyTypeInfo}>
                        <Text style={styles.bodyTypeLabel}>Body Type</Text>
                        <Text style={styles.bodyTypeValue}>
                          {analysisResult.body_type?.charAt(0).toUpperCase() + analysisResult.body_type?.slice(1)}
                        </Text>
                        {analysisResult.body_fat_estimate && (
                          <Text style={styles.bodyFatEstimate}>
                            Est. Body Fat: {analysisResult.body_fat_estimate}%
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Strong Areas */}
                  {analysisResult.strong_areas?.length > 0 && (
                    <View style={styles.resultSection}>
                      <View style={styles.resultSectionHeader}>
                        <Ionicons name="checkmark-circle" size={24} color={Colors.status.success} />
                        <Text style={styles.resultSectionTitle}>Strong Areas</Text>
                      </View>
                      {analysisResult.strong_areas.map((area: string, i: number) => (
                        <View key={i} style={styles.resultItem}>
                          <Ionicons name="star" size={16} color="#F59E0B" />
                          <Text style={styles.resultItemText}>{area}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Areas to Improve */}
                  {analysisResult.areas_to_improve?.length > 0 && (
                    <View style={styles.resultSection}>
                      <View style={styles.resultSectionHeader}>
                        <Ionicons name="trending-up" size={24} color={Colors.brand.primary} />
                        <Text style={styles.resultSectionTitle}>Focus Areas</Text>
                      </View>
                      {analysisResult.areas_to_improve.map((area: string, i: number) => (
                        <View key={i} style={styles.resultItem}>
                          <Ionicons name="arrow-forward" size={16} color={Colors.brand.primary} />
                          <Text style={styles.resultItemText}>{area}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Muscle Imbalances */}
                  {analysisResult.muscle_imbalances?.length > 0 && (
                    <View style={styles.resultSection}>
                      <View style={styles.resultSectionHeader}>
                        <Ionicons name="warning" size={24} color="#F59E0B" />
                        <Text style={styles.resultSectionTitle}>Imbalances Detected</Text>
                      </View>
                      {analysisResult.muscle_imbalances.map((item: string, i: number) => (
                        <View key={i} style={styles.resultItem}>
                          <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                          <Text style={styles.resultItemText}>{item}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Recommendations */}
                  {analysisResult.recommendations?.length > 0 && (
                    <View style={styles.resultSection}>
                      <View style={styles.resultSectionHeader}>
                        <Ionicons name="bulb" size={24} color="#8B5CF6" />
                        <Text style={styles.resultSectionTitle}>Recommendations</Text>
                      </View>
                      {analysisResult.recommendations.map((rec: string, i: number) => (
                        <View key={i} style={styles.resultItem}>
                          <Text style={styles.resultNumber}>{i + 1}</Text>
                          <Text style={styles.resultItemText}>{rec}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Workout Plan */}
                  {workoutPlan && (
                    <View style={styles.workoutPlanSection}>
                      <Text style={styles.workoutPlanTitle}>
                        🏋️ {workoutPlan.plan_name}
                      </Text>
                      <View style={styles.workoutPlanInfo}>
                        <View style={styles.planInfoItem}>
                          <Text style={styles.planInfoValue}>{workoutPlan.duration_weeks}</Text>
                          <Text style={styles.planInfoLabel}>Weeks</Text>
                        </View>
                        <View style={styles.planInfoItem}>
                          <Text style={styles.planInfoValue}>{workoutPlan.days_per_week}</Text>
                          <Text style={styles.planInfoLabel}>Days/Week</Text>
                        </View>
                        <View style={styles.planInfoItem}>
                          <Text style={styles.planInfoValue}>{workoutPlan.rest_between_sets}</Text>
                          <Text style={styles.planInfoLabel}>Rest</Text>
                        </View>
                      </View>

                      {workoutPlan.workout_days?.map((day: any, i: number) => (
                        <TouchableOpacity
                          key={i}
                          style={styles.workoutDayCard}
                          onPress={() => {
                            setSelectedDay(day);
                            setWorkoutModalVisible(true);
                          }}
                        >
                          <View style={styles.dayHeader}>
                            <View style={styles.dayNumber}>
                              <Text style={styles.dayNumberText}>{day.day}</Text>
                            </View>
                            <View style={styles.dayInfo}>
                              <Text style={styles.dayName}>{day.name}</Text>
                              <Text style={styles.dayFocus}>{day.focus?.join(', ')}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={Colors.text.muted} />
                          </View>
                        </TouchableOpacity>
                      ))}

                      <View style={styles.cardioNote}>
                        <Ionicons name="heart" size={20} color="#EF4444" />
                        <Text style={styles.cardioNoteText}>{workoutPlan.cardio_recommendation}</Text>
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.emptyResults}>
                  <Ionicons name="analytics" size={64} color={Colors.text.muted} />
                  <Text style={styles.emptyResultsTitle}>No Results Yet</Text>
                  <Text style={styles.emptyResultsText}>
                    Complete a body scan to see your analysis and personalized workout plan
                  </Text>
                  <TouchableOpacity
                    style={styles.goToScanBtn}
                    onPress={() => setActiveTab('scan')}
                  >
                    <Text style={styles.goToScanBtnText}>Start New Scan</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* Progress Tab */}
          {activeTab === 'progress' && (
            <>
              {progressData?.has_data ? (
                <>
                  <View style={styles.progressSummary}>
                    <Text style={[styles.progressTitle, { color: colors.text.primary }]}>Measurement History</Text>
                    <Text style={[styles.progressSubtitle, { color: colors.text.secondary }]}>
                      {progressData.total_scans} scans recorded
                    </Text>
                    <Text style={[styles.swipeHint, { color: colors.text.muted }]}>
                      ← Swipe left to delete entries
                    </Text>
                  </View>

                  {progressData.progress?.map((entry: any, i: number) => (
                    <SwipeableRow
                      key={entry.scan_id || i}
                      onDelete={() => deleteScanEntry(entry.scan_id)}
                    >
                      <View style={[styles.progressEntry, { backgroundColor: colors.background.card }]}>
                        <Text style={[styles.progressDate, { color: accent.primary }]}>{entry.date}</Text>
                        <View style={styles.progressMeasurements}>
                          {entry.weight && (
                            <View style={styles.progressItem}>
                              <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Weight</Text>
                              <Text style={[styles.progressValue, { color: colors.text.primary }]}>{entry.weight} lbs</Text>
                            </View>
                          )}
                          {entry.body_fat && (
                            <View style={styles.progressItem}>
                              <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Body Fat</Text>
                              <Text style={[styles.progressValue, { color: colors.text.primary }]}>{entry.body_fat}%</Text>
                            </View>
                          )}
                          {entry.measurements?.waist && (
                            <View style={styles.progressItem}>
                              <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Waist</Text>
                              <Text style={[styles.progressValue, { color: colors.text.primary }]}>{entry.measurements.waist}"</Text>
                            </View>
                          )}
                          {entry.measurements?.chest && (
                            <View style={styles.progressItem}>
                              <Text style={[styles.progressLabel, { color: colors.text.secondary }]}>Chest</Text>
                              <Text style={[styles.progressValue, { color: colors.text.primary }]}>{entry.measurements.chest}"</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </SwipeableRow>
                  ))}
                </>
              ) : (
                <View style={styles.emptyProgress}>
                  <Ionicons name="trending-up" size={64} color={Colors.text.muted} />
                  <Text style={[styles.emptyProgressTitle, { color: colors.text.primary }]}>Track Your Progress</Text>
                  <Text style={[styles.emptyProgressText, { color: colors.text.secondary }]}>
                    Complete multiple body scans over time to see your progress
                  </Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Workout Day Modal */}
        <Modal
          visible={workoutModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setWorkoutModalVisible(false)}
        >
          <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border.primary }]}>
              <TouchableOpacity 
                onPress={() => setWorkoutModalVisible(false)}
                style={styles.modalBackButton}
              >
                <Ionicons name="chevron-back" size={28} color={accent.primary} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{selectedDay?.name}</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.modalScroll} contentContainerStyle={{ padding: 16 }}>
              <View style={[styles.focusCard, { backgroundColor: `${accent.primary}15` }]}>
                <Ionicons name="fitness" size={20} color={accent.primary} />
                <Text style={[styles.modalFocus, { color: accent.primary }]}>
                  Focus: {selectedDay?.focus?.join(', ')}
                </Text>
              </View>

              {selectedDay?.exercises?.map((exercise: any, i: number) => (
                <View key={i} style={[styles.exerciseCard, { backgroundColor: colors.background.card }]}>
                  <View style={[styles.exerciseNumber, { backgroundColor: accent.primary }]}>
                    <Text style={styles.exerciseNumberText}>{i + 1}</Text>
                  </View>
                  <View style={styles.exerciseInfo}>
                    <Text style={[styles.exerciseName, { color: colors.text.primary }]}>{exercise.name}</Text>
                    <Text style={[styles.exerciseSets, { color: colors.text.secondary }]}>{exercise.sets_reps}</Text>
                    {exercise.notes && (
                      <Text style={[styles.exerciseNotes, { color: colors.text.muted }]}>{exercise.notes}</Text>
                    )}
                  </View>
                </View>
              ))}
              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  tabActive: {
    backgroundColor: Colors.brand.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    gap: 16,
  },
  heroText: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  photosGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  photoContainer: {
    flex: 1,
    alignItems: 'center',
  },
  photoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 0.75,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  photoButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 0.75,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  removePhoto: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  measurementGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  measurementItem: {
    width: (width - 56) / 3,
  },
  measurementItemSmall: {
    width: (width - 68) / 3.5,
  },
  measurementLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  measurementLabelSmall: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.secondary,
    marginBottom: 4,
  },
  measurementInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  measurementInputSmall: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: Colors.text.primary,
    textAlign: 'center',
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 12,
    marginTop: 8,
  },
  bodyStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  bodyStatItem: {
    flex: 1,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionCard: {
    width: (width - 52) / 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
  },
  optionCardActive: {
    backgroundColor: Colors.brand.primary,
  },
  optionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
    textAlign: 'center',
  },
  optionLabelActive: {
    color: '#fff',
  },
  locationOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  locationOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  locationOptionActive: {
    backgroundColor: Colors.brand.primary,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  locationLabelActive: {
    color: '#fff',
  },
  experienceOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  experienceOption: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  experienceOptionActive: {
    backgroundColor: Colors.brand.primary,
  },
  experienceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  experienceLabelActive: {
    color: '#fff',
  },
  analyzeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 14,
    padding: 18,
    gap: 10,
    marginTop: 8,
  },
  analyzeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  resultCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  bodyTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  bodyTypeInfo: {
    flex: 1,
  },
  bodyTypeLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  bodyTypeValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  bodyFatEstimate: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  resultSection: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  resultSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  resultSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  resultItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 20,
  },
  resultNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: Colors.brand.primary,
    textAlign: 'center',
    lineHeight: 24,
  },
  workoutPlanSection: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  workoutPlanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  workoutPlanInfo: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  planInfoItem: {
    alignItems: 'center',
  },
  planInfoValue: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  planInfoLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  workoutDayCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.brand.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  dayNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  dayInfo: {
    flex: 1,
  },
  dayName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  dayFocus: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  cardioNote: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    gap: 10,
  },
  cardioNoteText: {
    flex: 1,
    fontSize: 13,
    color: '#991B1B',
  },
  emptyResults: {
    alignItems: 'center',
    padding: 40,
  },
  emptyResultsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptyResultsText: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  goToScanBtn: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 20,
  },
  goToScanBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  progressSummary: {
    marginBottom: 20,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  progressSubtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  swipeHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
  },
  progressEntry: {
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  progressDate: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand.primary,
    marginBottom: 12,
  },
  progressMeasurements: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  progressItem: {
    minWidth: 70,
  },
  progressLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  progressValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 2,
  },
  emptyProgress: {
    alignItems: 'center',
    padding: 40,
  },
  emptyProgressTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptyProgressText: {
    fontSize: 14,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  modalBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalScroll: {
    flex: 1,
  },
  focusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  modalFocus: {
    fontSize: 14,
    fontWeight: '600',
  },
  exerciseCard: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brand.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exerciseNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  exerciseSets: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.brand.primary,
    marginTop: 4,
  },
  exerciseNotes: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
    fontStyle: 'italic',
  },
});

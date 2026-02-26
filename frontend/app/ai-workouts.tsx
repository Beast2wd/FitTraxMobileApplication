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
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import axios from 'axios';
import { router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// Exercise Item Component with image support
const ExerciseItem = ({ 
  exercise, 
  index, 
  workoutType,
  isPremium,
  onGenerateImage 
}: { 
  exercise: any; 
  index: number;
  workoutType?: string;
  isPremium: boolean;
  onGenerateImage: (name: string, type: string, instructions?: string) => void;
}) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [showImage, setShowImage] = useState(false);

  const fetchImage = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/exercises/image/${encodeURIComponent(exercise.name)}`);
      if (response.data.exists && response.data.image_base64) {
        setImageData(response.data.image_base64);
      }
    } catch (error) {
      console.log('No cached image for:', exercise.name);
    }
  };

  useEffect(() => {
    fetchImage();
  }, [exercise.name]);

  const handleGenerateImage = async () => {
    if (!isPremium) {
      Alert.alert('Premium Required', 'Exercise image generation requires Premium membership');
      return;
    }
    
    setLoadingImage(true);
    try {
      const response = await axios.post(`${API_URL}/api/exercises/generate-image`, {
        exercise_name: exercise.name,
        exercise_type: workoutType || 'strength',
        instructions: exercise.instructions
      });
      
      if (response.data.image_base64) {
        setImageData(response.data.image_base64);
        setShowImage(true);
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to generate image');
    } finally {
      setLoadingImage(false);
    }
  };

  return (
    <View style={styles.exerciseItem}>
      <View style={styles.exerciseNumber}>
        <Text style={styles.exerciseNumberText}>{index + 1}</Text>
      </View>
      <View style={styles.exerciseInfo}>
        <View style={styles.exerciseHeader}>
          <Text style={styles.exerciseName}>{exercise.name}</Text>
          {isPremium && !imageData && (
            <TouchableOpacity 
              onPress={handleGenerateImage}
              disabled={loadingImage}
              style={styles.generateImageBtn}
            >
              {loadingImage ? (
                <ActivityIndicator size="small" color={Colors.brand.primary} />
              ) : (
                <Ionicons name="image" size={20} color={Colors.brand.primary} />
              )}
            </TouchableOpacity>
          )}
          {imageData && (
            <TouchableOpacity 
              onPress={() => setShowImage(!showImage)}
              style={styles.showImageBtn}
            >
              <Ionicons 
                name={showImage ? "eye-off" : "eye"} 
                size={20} 
                color={Colors.brand.primary} 
              />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.exerciseDetail}>
          {exercise.sets && `${exercise.sets} sets × `}
          {exercise.reps || (exercise.duration ? `${exercise.duration}s` : '')}
          {exercise.rest && ` • ${exercise.rest}s rest`}
        </Text>
        {exercise.instructions && (
          <Text style={styles.exerciseInstructions}>{exercise.instructions}</Text>
        )}
        {showImage && imageData && (
          <View style={styles.exerciseImageContainer}>
            <Image
              source={{ uri: `data:image/png;base64,${imageData}` }}
              style={styles.exerciseImage}
              resizeMode="cover"
            />
          </View>
        )}
      </View>
    </View>
  );
};

export default function AIWorkoutsScreen() {
  const { userId, profile } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<any>({});
  const [templates, setTemplates] = useState<any[]>([]);
  const [aiHistory, setAiHistory] = useState<any[]>([]);
  const [membershipStatus, setMembershipStatus] = useState<any>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  
  // Generate options
  const [selectedCategory, setSelectedCategory] = useState('strength');
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [selectedDifficulty, setSelectedDifficulty] = useState('intermediate');
  const [selectedFocus, setSelectedFocus] = useState('full_body');

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesRes, templatesRes, statusRes, historyRes] = await Promise.all([
        axios.get(`${API_URL}/api/workouts/categories`),
        axios.get(`${API_URL}/api/workouts/templates`),
        userId ? axios.get(`${API_URL}/api/membership/status/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/workouts/ai-history/${userId}`) : null,
      ]);
      
      setCategories(categoriesRes.data.categories || {});
      setTemplates(templatesRes.data.templates || []);
      if (statusRes) setMembershipStatus(statusRes.data);
      if (historyRes) setAiHistory(historyRes.data.workouts || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const generateAIWorkout = async () => {
    if (!membershipStatus?.is_premium) {
      Alert.alert(
        'Premium Required',
        'AI workout generation is a premium feature. Start your free trial to access it!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Premium', onPress: () => router.push('/membership') }
        ]
      );
      return;
    }

    setGenerating(true);
    try {
      const response = await axios.post(`${API_URL}/api/workouts/generate-ai`, {
        user_id: userId,
        workout_type: selectedCategory,
        duration_minutes: selectedDuration,
        difficulty: selectedDifficulty,
        focus_area: selectedFocus,
        equipment: [],
        goals: profile?.goal ? [profile.goal] : ['general_fitness']
      });

      setSelectedWorkout(response.data);
      setShowGenerateModal(false);
      setShowWorkoutModal(true);
      loadData(); // Refresh history
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to generate workout');
    } finally {
      setGenerating(false);
    }
  };

  const viewWorkout = (workout: any) => {
    setSelectedWorkout(workout);
    setShowWorkoutModal(true);
  };

  const completeWorkout = async () => {
    if (!selectedWorkout) return;
    
    try {
      await axios.post(
        `${API_URL}/api/workouts/ai/${selectedWorkout.workout_id}/complete?user_id=${userId}`
      );
      Alert.alert('🎉 Workout Complete!', `You burned approximately ${selectedWorkout.calories_estimate} calories!`);
      setShowWorkoutModal(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to log workout');
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

  const isPremium = membershipStatus?.is_premium;

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
          <Text style={styles.title}>AI Workouts</Text>
          <Text style={styles.subtitle}>Personalized training powered by AI</Text>
        </View>

        {/* Generate AI Workout Button */}
        <TouchableOpacity onPress={() => setShowGenerateModal(true)}>
          <LinearGradient
            colors={isPremium ? ['#667eea', '#764ba2'] : ['#9CA3AF', '#6B7280']}
            style={styles.generateCard}
          >
            <View style={styles.generateContent}>
              <Ionicons name="sparkles" size={40} color="#fff" />
              <View style={styles.generateText}>
                <Text style={styles.generateTitle}>Generate AI Workout</Text>
                <Text style={styles.generateSubtitle}>
                  {isPremium 
                    ? 'Create a personalized workout just for you'
                    : 'Premium feature - Start free trial'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Workout Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Workout Types</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.categoriesRow}>
              {Object.entries(categories).map(([key, cat]: [string, any]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.categoryCard, { borderColor: cat.color }]}
                  onPress={() => {
                    setSelectedCategory(key);
                    setShowGenerateModal(true);
                  }}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: cat.color + '20' }]}>
                    <Text style={styles.categoryEmoji}>{cat.icon}</Text>
                  </View>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Pre-built Templates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Start Templates</Text>
          {templates.map((template: any) => (
            <TouchableOpacity
              key={template.template_id}
              style={styles.templateCard}
              onPress={() => viewWorkout({ ...template, workout_id: template.template_id })}
            >
              <View style={styles.templateLeft}>
                <Text style={styles.templateEmoji}>
                  {categories[template.category]?.icon || '💪'}
                </Text>
                <View style={styles.templateInfo}>
                  <Text style={styles.templateTitle}>{template.title}</Text>
                  <Text style={styles.templateDescription}>{template.description}</Text>
                  <View style={styles.templateMeta}>
                    <View style={styles.templateBadge}>
                      <Ionicons name="time" size={12} color={Colors.text.secondary} />
                      <Text style={styles.templateBadgeText}>{template.duration_minutes} min</Text>
                    </View>
                    <View style={[styles.templateBadge, { backgroundColor: getDifficultyColor(template.difficulty) + '20' }]}>
                      <Text style={[styles.templateBadgeText, { color: getDifficultyColor(template.difficulty) }]}>
                        {template.difficulty}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
              <Ionicons name="play-circle" size={40} color={Colors.brand.primary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* AI Workout History */}
        {aiHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your AI Workouts</Text>
            {aiHistory.slice(0, 5).map((workout: any) => (
              <TouchableOpacity
                key={workout.workout_id}
                style={styles.historyCard}
                onPress={() => viewWorkout(workout)}
              >
                <View style={styles.historyLeft}>
                  <View style={[styles.historyIcon, { backgroundColor: categories[workout.workout_type]?.color + '20' || '#E5E7EB' }]}>
                    <Text>{categories[workout.workout_type]?.icon || '💪'}</Text>
                  </View>
                  <View>
                    <Text style={styles.historyTitle}>{workout.title}</Text>
                    <Text style={styles.historyMeta}>
                      {workout.duration_minutes} min • {workout.calories_estimate} cal
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.text.muted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Generate Modal */}
      <Modal
        visible={showGenerateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowGenerateModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowGenerateModal(false)}>
              <Ionicons name="close" size={28} color={Colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create Workout</Text>
            <View style={{ width: 28 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Category Selection */}
            <Text style={styles.optionLabel}>Workout Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.optionRow}>
                {Object.entries(categories).map(([key, cat]: [string, any]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.optionChip,
                      selectedCategory === key && { backgroundColor: cat.color, borderColor: cat.color }
                    ]}
                    onPress={() => setSelectedCategory(key)}
                  >
                    <Text style={[
                      styles.optionChipText,
                      selectedCategory === key && { color: '#fff' }
                    ]}>
                      {cat.icon} {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Duration Selection */}
            <Text style={styles.optionLabel}>Duration</Text>
            <View style={styles.optionRow}>
              {[15, 20, 30, 45, 60].map((dur) => (
                <TouchableOpacity
                  key={dur}
                  style={[
                    styles.optionChip,
                    selectedDuration === dur && styles.optionChipSelected
                  ]}
                  onPress={() => setSelectedDuration(dur)}
                >
                  <Text style={[
                    styles.optionChipText,
                    selectedDuration === dur && styles.optionChipTextSelected
                  ]}>
                    {dur} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Difficulty Selection */}
            <Text style={styles.optionLabel}>Difficulty</Text>
            <View style={styles.optionRow}>
              {['beginner', 'intermediate', 'advanced'].map((diff) => (
                <TouchableOpacity
                  key={diff}
                  style={[
                    styles.optionChip,
                    selectedDifficulty === diff && styles.optionChipSelected
                  ]}
                  onPress={() => setSelectedDifficulty(diff)}
                >
                  <Text style={[
                    styles.optionChipText,
                    selectedDifficulty === diff && styles.optionChipTextSelected
                  ]}>
                    {diff.charAt(0).toUpperCase() + diff.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Focus Area */}
            <Text style={styles.optionLabel}>Focus Area</Text>
            <View style={styles.optionRow}>
              {[
                { id: 'full_body', label: 'Full Body' },
                { id: 'upper_body', label: 'Upper Body' },
                { id: 'lower_body', label: 'Lower Body' },
                { id: 'core', label: 'Core' },
              ].map((focus) => (
                <TouchableOpacity
                  key={focus.id}
                  style={[
                    styles.optionChip,
                    selectedFocus === focus.id && styles.optionChipSelected
                  ]}
                  onPress={() => setSelectedFocus(focus.id)}
                >
                  <Text style={[
                    styles.optionChipText,
                    selectedFocus === focus.id && styles.optionChipTextSelected
                  ]}>
                    {focus.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!isPremium && (
              <View style={styles.premiumNotice}>
                <Ionicons name="diamond" size={24} color="#F59E0B" />
                <Text style={styles.premiumNoticeText}>
                  AI workout generation requires Premium membership
                </Text>
                <TouchableOpacity 
                  style={styles.premiumButton}
                  onPress={() => {
                    setShowGenerateModal(false);
                    router.push('/membership');
                  }}
                >
                  <Text style={styles.premiumButtonText}>Start Free Trial</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.generateButton, !isPremium && styles.generateButtonDisabled]}
              onPress={generateAIWorkout}
              disabled={generating || !isPremium}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={24} color="#fff" />
                  <Text style={styles.generateButtonText}>Generate Workout</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Workout Detail Modal */}
      <Modal
        visible={showWorkoutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWorkoutModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowWorkoutModal(false)}>
              <Ionicons name="close" size={28} color={Colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Workout</Text>
            <View style={{ width: 28 }} />
          </View>

          {selectedWorkout && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.workoutHeader}>
                <Text style={styles.workoutTitle}>{selectedWorkout.title}</Text>
                <Text style={styles.workoutDescription}>{selectedWorkout.description}</Text>
                
                <View style={styles.workoutStats}>
                  <View style={styles.workoutStat}>
                    <Ionicons name="time" size={20} color={Colors.brand.primary} />
                    <Text style={styles.workoutStatText}>{selectedWorkout.duration_minutes} min</Text>
                  </View>
                  <View style={styles.workoutStat}>
                    <Ionicons name="flame" size={20} color="#EF4444" />
                    <Text style={styles.workoutStatText}>{selectedWorkout.calories_estimate} cal</Text>
                  </View>
                  <View style={styles.workoutStat}>
                    <MaterialIcons name="fitness-center" size={20} color="#F59E0B" />
                    <Text style={styles.workoutStatText}>{selectedWorkout.difficulty}</Text>
                  </View>
                </View>
              </View>

              {/* Warm-up */}
              {selectedWorkout.warmup?.length > 0 && (
                <View style={styles.exerciseSection}>
                  <Text style={styles.exerciseSectionTitle}>🔥 Warm-up</Text>
                  {selectedWorkout.warmup.map((ex: any, idx: number) => (
                    <ExerciseItem
                      key={idx}
                      exercise={ex}
                      index={idx}
                      workoutType={selectedWorkout.workout_type}
                      isPremium={isPremium}
                      onGenerateImage={() => {}}
                    />
                  ))}
                </View>
              )}

              {/* Main Exercises */}
              <View style={styles.exerciseSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.exerciseSectionTitle}>💪 Main Workout</Text>
                  {isPremium && selectedWorkout.workout_id && (
                    <TouchableOpacity
                      style={styles.generateAllBtn}
                      onPress={async () => {
                        setGeneratingImages(true);
                        try {
                          await axios.post(
                            `${API_URL}/api/exercises/generate-workout-images/${selectedWorkout.workout_id}?user_id=${userId}`
                          );
                          Alert.alert('Success', 'Exercise images are being generated! Tap the eye icon on each exercise to view.');
                        } catch (error: any) {
                          Alert.alert('Error', error.response?.data?.detail || 'Failed to generate images');
                        } finally {
                          setGeneratingImages(false);
                        }
                      }}
                      disabled={generatingImages}
                    >
                      {generatingImages ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="images" size={16} color="#fff" />
                          <Text style={styles.generateAllBtnText}>Generate Images</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {selectedWorkout.exercises?.map((ex: any, idx: number) => (
                  <ExerciseItem
                    key={idx}
                    exercise={ex}
                    index={idx}
                    workoutType={selectedWorkout.workout_type}
                    isPremium={isPremium}
                    onGenerateImage={() => {}}
                  />
                ))}
              </View>

              {/* Cool-down */}
              {selectedWorkout.cooldown?.length > 0 && (
                <View style={styles.exerciseSection}>
                  <Text style={styles.exerciseSectionTitle}>🧘 Cool-down</Text>
                  {selectedWorkout.cooldown.map((ex: any, idx: number) => (
                    <ExerciseItem
                      key={idx}
                      exercise={ex}
                      index={idx}
                      workoutType={selectedWorkout.workout_type}
                      isPremium={isPremium}
                      onGenerateImage={() => {}}
                    />
                  ))}
                </View>
              )}

              {/* Tips */}
              {selectedWorkout.tips?.length > 0 && (
                <View style={styles.tipsSection}>
                  <Text style={styles.tipsTitle}>💡 Pro Tips</Text>
                  {selectedWorkout.tips.map((tip: string, idx: number) => (
                    <View key={idx} style={styles.tipItem}>
                      <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={{ height: 100 }} />
            </ScrollView>
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.completeButton}
              onPress={completeWorkout}
            >
              <Ionicons name="checkmark-circle" size={24} color="#fff" />
              <Text style={styles.completeButtonText}>Complete Workout</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'beginner': return '#10B981';
    case 'intermediate': return '#F59E0B';
    case 'advanced': return '#EF4444';
    default: return Colors.text.secondary;
  }
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
    marginBottom: 20,
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
  generateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
  },
  generateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  generateText: {},
  generateTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  generateSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  categoriesRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 16,
  },
  categoryCard: {
    width: 100,
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryEmoji: {
    fontSize: 24,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  templateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  templateEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  templateMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  templateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.light,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  templateBadgeText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  historyMeta: {
    fontSize: 13,
    color: Colors.text.secondary,
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
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 12,
    marginTop: 16,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.background.card,
    borderWidth: 1,
    borderColor: Colors.border.light,
  },
  optionChipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  optionChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  optionChipTextSelected: {
    color: '#fff',
  },
  premiumNotice: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    marginTop: 24,
    gap: 12,
  },
  premiumNoticeText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
  },
  premiumButton: {
    backgroundColor: '#F59E0B',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  premiumButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  generateButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  generateButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  workoutHeader: {
    marginBottom: 24,
  },
  workoutTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  workoutDescription: {
    fontSize: 16,
    color: Colors.text.secondary,
    marginBottom: 16,
  },
  workoutStats: {
    flexDirection: 'row',
    gap: 16,
  },
  workoutStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  workoutStatText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  exerciseSection: {
    marginBottom: 24,
  },
  exerciseSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  exerciseItem: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  exerciseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  exerciseDetail: {
    fontSize: 14,
    color: Colors.brand.primary,
    fontWeight: '500',
  },
  exerciseInstructions: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  tipsSection: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tipText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.secondary,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  completeButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  // Exercise Image Styles
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  generateImageBtn: {
    padding: 8,
  },
  showImageBtn: {
    padding: 8,
  },
  exerciseImageContainer: {
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  exerciseImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  generateAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  generateAllBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { foodAPI } from '../services/api';
import { format, isToday, isYesterday, parseISO, subDays, addDays } from 'date-fns';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, G } from 'react-native-svg';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface NutritionGoals {
  daily_calories: number;
  protein_grams: number;
  carbs_grams: number;
  fat_grams: number;
}

interface DailySummary {
  date: string;
  totals: { calories: number; protein: number; carbs: number; fat: number };
  goals: NutritionGoals;
  remaining: { calories: number; protein: number; carbs: number; fat: number };
  progress: { calories: number; protein: number; carbs: number; fat: number };
  by_category: any;
  meal_count: number;
}

// Progress Ring Component
const ProgressRing = ({ 
  progress, 
  size = 80, 
  strokeWidth = 8, 
  color, 
  bgColor,
  children 
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  bgColor: string;
  children?: React.ReactNode;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={bgColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      {children}
    </View>
  );
};

// Macro Progress Bar Component
const MacroBar = ({ 
  label, 
  current, 
  goal, 
  color, 
  unit = 'g',
  theme 
}: {
  label: string;
  current: number;
  goal: number;
  color: string;
  unit?: string;
  theme: any;
}) => {
  const progress = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const remaining = Math.max(goal - current, 0);
  
  return (
    <View style={styles.macroBarContainer}>
      <View style={styles.macroBarHeader}>
        <Text style={[styles.macroBarLabel, { color: theme.colors.text.primary }]}>{label}</Text>
        <Text style={[styles.macroBarValue, { color: theme.colors.text.secondary }]}>
          {Math.round(current)}/{Math.round(goal)}{unit}
        </Text>
      </View>
      <View style={[styles.macroBarTrack, { backgroundColor: theme.colors.background.secondary }]}>
        <View 
          style={[
            styles.macroBarFill, 
            { 
              width: `${progress}%`, 
              backgroundColor: color,
            }
          ]} 
        />
      </View>
      <Text style={[styles.macroBarRemaining, { color: theme.colors.text.muted }]}>
        {remaining > 0 ? `${Math.round(remaining)}${unit} remaining` : 'Goal reached!'}
      </Text>
    </View>
  );
};

export default function MealsHistoryScreen() {
  const { userId, lastMealLoggedAt, triggerMealRefresh } = useUserStore();
  const { theme } = useThemeStore();
  const { t } = useTranslation();
  
  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [dailySummary, setDailySummary] = useState<DailySummary | null>(null);
  const [weeklyData, setWeeklyData] = useState<any>(null);
  const [frequentFoods, setFrequentFoods] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [quickAddModalVisible, setQuickAddModalVisible] = useState(false);
  const [goalsModalVisible, setGoalsModalVisible] = useState(false);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [customFoodModalVisible, setCustomFoodModalVisible] = useState(false);
  const [editMealModalVisible, setEditMealModalVisible] = useState(false);
  const [insightsModalVisible, setInsightsModalVisible] = useState(false);
  
  // Form states
  const [selectedMealCategory, setSelectedMealCategory] = useState('breakfast');
  const [customFood, setCustomFood] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    serving_size: '1 serving',
  });
  const [editingGoals, setEditingGoals] = useState({
    daily_calories: '',
    protein_grams: '',
    carbs_grams: '',
    fat_grams: '',
  });
  const [selectedMeal, setSelectedMeal] = useState<any>(null);
  const [servings, setServings] = useState('1');

  const colors = theme.colors;
  const accent = theme.accentColors;

  // Load data
  useEffect(() => {
    if (userId) {
      loadDailySummary();
      loadFrequentFoods();
      loadWeeklyData();
    } else {
      // No userId, set loading false and show empty state
      setLoading(false);
    }
  }, [userId, selectedDate]);

  // Refresh when meal is logged from scan screen
  useEffect(() => {
    if (lastMealLoggedAt && userId) {
      console.log('Meal logged, refreshing meals history...');
      loadDailySummary();
      loadWeeklyData();
    }
  }, [lastMealLoggedAt]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (userId && !loading) {
        loadDailySummary();
        loadWeeklyData();
      }
    }, [userId, selectedDate])
  );

  const loadDailySummary = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/api/nutrition/daily-summary/${userId}?date=${selectedDate}`);
      setDailySummary(response.data);
    } catch (error) {
      console.error('Error loading daily summary:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadFrequentFoods = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/nutrition/foods/frequent/${userId}?limit=10`);
      setFrequentFoods(response.data.frequent_foods || []);
    } catch (error) {
      console.error('Error loading frequent foods:', error);
    }
  };

  const loadWeeklyData = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/nutrition/weekly-summary/${userId}`);
      setWeeklyData(response.data);
    } catch (error) {
      console.error('Error loading weekly data:', error);
    }
  };

  const searchFoods = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      const response = await axios.get(`${API_URL}/api/nutrition/foods/search?q=${encodeURIComponent(query)}&user_id=${userId}`);
      setSearchResults(response.data.foods || []);
    } catch (error) {
      console.error('Error searching foods:', error);
    }
  };

  const handleQuickLog = async (food: any) => {
    try {
      const servingsNum = parseFloat(servings) || 1;
      await axios.post(`${API_URL}/api/nutrition/quick-log`, {
        user_id: userId,
        name: food.name,
        calories: food.calories * servingsNum,
        protein: food.protein * servingsNum,
        carbs: food.carbs * servingsNum,
        fat: food.fat * servingsNum,
        meal_category: selectedMealCategory,
        serving_size: food.serving_size || '1 serving',
        servings: servingsNum,
      });
      
      Alert.alert('Success', `${food.name} logged!`);
      setQuickAddModalVisible(false);
      setSearchModalVisible(false);
      setServings('1');
      loadDailySummary();
    } catch (error) {
      Alert.alert('Error', 'Failed to log food');
    }
  };

  const handleCreateCustomFood = async () => {
    if (!customFood.name || !customFood.calories) {
      Alert.alert('Error', 'Please enter at least name and calories');
      return;
    }
    
    try {
      await axios.post(`${API_URL}/api/nutrition/custom-foods/${userId}`, {
        name: customFood.name,
        calories: parseFloat(customFood.calories) || 0,
        protein: parseFloat(customFood.protein) || 0,
        carbs: parseFloat(customFood.carbs) || 0,
        fat: parseFloat(customFood.fat) || 0,
        serving_size: customFood.serving_size,
      });
      
      // Also log it
      await handleQuickLog({
        name: customFood.name,
        calories: parseFloat(customFood.calories) || 0,
        protein: parseFloat(customFood.protein) || 0,
        carbs: parseFloat(customFood.carbs) || 0,
        fat: parseFloat(customFood.fat) || 0,
        serving_size: customFood.serving_size,
      });
      
      setCustomFoodModalVisible(false);
      setCustomFood({ name: '', calories: '', protein: '', carbs: '', fat: '', serving_size: '1 serving' });
    } catch (error) {
      Alert.alert('Error', 'Failed to create custom food');
    }
  };

  const handleUpdateGoals = async () => {
    try {
      await axios.post(`${API_URL}/api/nutrition/goals/${userId}`, {
        daily_calories: parseFloat(editingGoals.daily_calories) || undefined,
        protein_grams: parseFloat(editingGoals.protein_grams) || undefined,
        carbs_grams: parseFloat(editingGoals.carbs_grams) || undefined,
        fat_grams: parseFloat(editingGoals.fat_grams) || undefined,
      });
      
      Alert.alert('Success', 'Goals updated!');
      setGoalsModalVisible(false);
      loadDailySummary();
    } catch (error) {
      Alert.alert('Error', 'Failed to update goals');
    }
  };

  const handleCopyMeals = async (sourceDate: string) => {
    try {
      await axios.post(`${API_URL}/api/nutrition/copy-meals`, {
        user_id: userId,
        source_date: sourceDate,
        target_date: selectedDate,
      });
      
      Alert.alert('Success', 'Meals copied!');
      loadDailySummary();
    } catch (error) {
      Alert.alert('Error', 'Failed to copy meals');
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    Alert.alert('Delete Meal', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await foodAPI.deleteMeal(mealId);
            loadDailySummary();
            // Trigger refresh on dashboard
            triggerMealRefresh();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete meal');
          }
        },
      },
    ]);
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const current = parseISO(selectedDate);
    const newDate = direction === 'prev' ? subDays(current, 1) : addDays(current, 1);
    setSelectedDate(format(newDate, 'yyyy-MM-dd'));
  };

  const formatDateLabel = (date: string) => {
    const d = parseISO(date);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'EEE, MMM d');
  };

  const openGoalsModal = () => {
    if (dailySummary?.goals) {
      setEditingGoals({
        daily_calories: dailySummary.goals.daily_calories.toString(),
        protein_grams: dailySummary.goals.protein_grams.toString(),
        carbs_grams: dailySummary.goals.carbs_grams.toString(),
        fat_grams: dailySummary.goals.fat_grams.toString(),
      });
    }
    setGoalsModalVisible(true);
  };

  const localStyles = createStyles(theme);

  if (loading && !dailySummary) {
    return (
      <SafeAreaView style={localStyles.container}>
        <View style={localStyles.centered}>
          <ActivityIndicator size="large" color={accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const mealCategories = ['breakfast', 'lunch', 'dinner', 'snack'];
  const categoryIcons: any = {
    breakfast: 'sunny-outline',
    lunch: 'restaurant-outline',
    dinner: 'moon-outline',
    snack: 'cafe-outline',
  };

  return (
    <SafeAreaView style={localStyles.container}>
      <ScrollView 
        contentContainerStyle={localStyles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => { setRefreshing(true); loadDailySummary(); }} 
            tintColor={accent.primary}
          />
        }
      >
        {/* Header */}
        <View style={localStyles.header}>
          <TouchableOpacity onPress={() => router.back()} style={localStyles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={localStyles.title}>Nutrition Tracker</Text>
          <TouchableOpacity onPress={openGoalsModal}>
            <Ionicons name="settings-outline" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Date Navigation */}
        <View style={localStyles.dateNav}>
          <TouchableOpacity onPress={() => navigateDate('prev')} style={localStyles.dateNavBtn}>
            <Ionicons name="chevron-back" size={24} color={accent.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}>
            <Text style={localStyles.dateText}>{formatDateLabel(selectedDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => navigateDate('next')} 
            style={localStyles.dateNavBtn}
            disabled={isToday(parseISO(selectedDate))}
          >
            <Ionicons 
              name="chevron-forward" 
              size={24} 
              color={isToday(parseISO(selectedDate)) ? colors.text.muted : accent.primary} 
            />
          </TouchableOpacity>
        </View>

        {/* Main Calorie Ring */}
        {dailySummary && (
          <View style={localStyles.calorieCard}>
            <View style={localStyles.calorieRingContainer}>
              <ProgressRing
                progress={dailySummary.progress.calories}
                size={140}
                strokeWidth={12}
                color={dailySummary.progress.calories > 100 ? colors.status.error : accent.primary}
                bgColor={colors.background.secondary}
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={[localStyles.calorieValue, { color: colors.text.primary }]}>
                    {Math.round(dailySummary.totals.calories)}
                  </Text>
                  <Text style={[localStyles.calorieLabel, { color: colors.text.secondary }]}>
                    of {Math.round(dailySummary.goals.daily_calories)}
                  </Text>
                </View>
              </ProgressRing>
              <Text style={[localStyles.calorieRemaining, { 
                color: dailySummary.remaining.calories >= 0 ? colors.status.success : colors.status.error 
              }]}>
                {dailySummary.remaining.calories >= 0 
                  ? `${Math.round(dailySummary.remaining.calories)} cal remaining`
                  : `${Math.abs(Math.round(dailySummary.remaining.calories))} cal over`
                }
              </Text>
            </View>

            {/* Macro Bars */}
            <View style={localStyles.macroBars}>
              <MacroBar 
                label="Protein" 
                current={dailySummary.totals.protein} 
                goal={dailySummary.goals.protein_grams}
                color="#10B981"
                theme={theme}
              />
              <MacroBar 
                label="Carbs" 
                current={dailySummary.totals.carbs} 
                goal={dailySummary.goals.carbs_grams}
                color="#3B82F6"
                theme={theme}
              />
              <MacroBar 
                label="Fat" 
                current={dailySummary.totals.fat} 
                goal={dailySummary.goals.fat_grams}
                color="#8B5CF6"
                theme={theme}
              />
              <MacroBar 
                label="Sugar" 
                current={dailySummary.totals.sugar || 0} 
                goal={dailySummary.goals.sugar_grams || 50}
                color="#F59E0B"
                theme={theme}
              />
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View style={localStyles.quickActions}>
          <TouchableOpacity 
            style={[localStyles.quickActionBtn, { backgroundColor: accent.primary }]}
            onPress={() => setQuickAddModalVisible(true)}
          >
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={localStyles.quickActionText}>Log Food</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[localStyles.quickActionBtn, { backgroundColor: colors.background.card }]}
            onPress={() => router.push('/scan')}
          >
            <Ionicons name="camera" size={24} color={accent.primary} />
            <Text style={[localStyles.quickActionText, { color: accent.primary }]}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[localStyles.quickActionBtn, { backgroundColor: colors.background.card }]}
            onPress={() => setInsightsModalVisible(true)}
          >
            <Ionicons name="analytics" size={24} color={accent.primary} />
            <Text style={[localStyles.quickActionText, { color: accent.primary }]}>Insights</Text>
          </TouchableOpacity>
        </View>

        {/* Meals by Category */}
        {dailySummary && mealCategories.map(category => {
          const categoryData = dailySummary.by_category[category];
          const meals = categoryData?.meals || [];
          const totals = categoryData?.totals || { calories: 0, protein: 0, carbs: 0, fat: 0 };
          
          return (
            <View key={category} style={localStyles.mealSection}>
              <View style={localStyles.mealSectionHeader}>
                <View style={localStyles.mealSectionLeft}>
                  <Ionicons name={categoryIcons[category]} size={20} color={accent.primary} />
                  <Text style={localStyles.mealSectionTitle}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </Text>
                </View>
                <View style={localStyles.mealSectionRight}>
                  <Text style={localStyles.mealSectionCals}>{Math.round(totals.calories)} cal</Text>
                  <TouchableOpacity 
                    onPress={() => {
                      setSelectedMealCategory(category);
                      setQuickAddModalVisible(true);
                    }}
                    style={localStyles.addMealBtn}
                  >
                    <Ionicons name="add-circle" size={24} color={accent.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              
              {meals.length === 0 ? (
                <TouchableOpacity 
                  style={localStyles.emptyMealSlot}
                  onPress={() => {
                    setSelectedMealCategory(category);
                    setQuickAddModalVisible(true);
                  }}
                >
                  <Text style={localStyles.emptyMealText}>+ Add {category}</Text>
                </TouchableOpacity>
              ) : (
                meals.map((meal: any, index: number) => (
                  <View key={meal.meal_id || index} style={localStyles.mealItem}>
                    <View style={localStyles.mealItemLeft}>
                      {meal.image_base64 ? (
                        <Image 
                          source={{ uri: `data:image/jpeg;base64,${meal.image_base64}` }}
                          style={localStyles.mealImage}
                        />
                      ) : (
                        <View style={[localStyles.mealImagePlaceholder, { backgroundColor: colors.background.secondary }]}>
                          <Ionicons name="restaurant" size={20} color={colors.text.muted} />
                        </View>
                      )}
                      <View style={localStyles.mealItemInfo}>
                        <Text style={localStyles.mealItemName} numberOfLines={1}>
                          {meal.food_name}
                        </Text>
                        <Text style={localStyles.mealItemMacros}>
                          P: {Math.round(meal.protein)}g • C: {Math.round(meal.carbs)}g • F: {Math.round(meal.fat)}g • S: {Math.round(meal.sugar || 0)}g
                        </Text>
                      </View>
                    </View>
                    <View style={localStyles.mealItemRight}>
                      <Text style={localStyles.mealItemCals}>{Math.round(meal.calories)}</Text>
                      <Text style={localStyles.mealItemCalsLabel}>cal</Text>
                      <TouchableOpacity 
                        onPress={() => handleDeleteMeal(meal.meal_id)}
                        style={localStyles.deleteMealBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.status.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          );
        })}

        {/* Copy Previous Day */}
        {!isYesterday(parseISO(selectedDate)) && (
          <TouchableOpacity 
            style={localStyles.copyDayBtn}
            onPress={() => handleCopyMeals(format(subDays(parseISO(selectedDate), 1), 'yyyy-MM-dd'))}
          >
            <Ionicons name="copy-outline" size={20} color={accent.primary} />
            <Text style={localStyles.copyDayText}>Copy from yesterday</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Quick Add Modal */}
      <Modal
        visible={quickAddModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setQuickAddModalVisible(false)}
      >
        <TouchableOpacity 
          style={localStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setQuickAddModalVisible(false)}
        >
          <View style={localStyles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={localStyles.modalHeader}>
              <Text style={localStyles.modalTitle}>
                Add to {selectedMealCategory.charAt(0).toUpperCase() + selectedMealCategory.slice(1)}
              </Text>
              <TouchableOpacity onPress={() => setQuickAddModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={localStyles.modalScroll}>
              {/* Search Button */}
              <TouchableOpacity 
                style={localStyles.searchButton}
                onPress={() => {
                  setQuickAddModalVisible(false);
                  setSearchModalVisible(true);
                }}
              >
                <Ionicons name="search" size={20} color={colors.text.muted} />
                <Text style={localStyles.searchButtonText}>Search foods...</Text>
              </TouchableOpacity>

              {/* Quick Options */}
              <View style={localStyles.quickOptionsRow}>
                <TouchableOpacity 
                  style={localStyles.quickOption}
                  onPress={() => router.push('/scan')}
                >
                  <Ionicons name="camera" size={28} color={accent.primary} />
                  <Text style={localStyles.quickOptionText}>Scan Food</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={localStyles.quickOption}
                  onPress={() => {
                    setQuickAddModalVisible(false);
                    setCustomFoodModalVisible(true);
                  }}
                >
                  <Ionicons name="create" size={28} color={accent.primary} />
                  <Text style={localStyles.quickOptionText}>Custom Entry</Text>
                </TouchableOpacity>
              </View>

              {/* Frequent Foods */}
              {frequentFoods.length > 0 && (
                <>
                  <Text style={localStyles.sectionLabel}>Frequently Logged</Text>
                  {frequentFoods.slice(0, 5).map((food, index) => (
                    <TouchableOpacity 
                      key={index}
                      style={localStyles.foodSearchItem}
                      onPress={() => handleQuickLog(food)}
                    >
                      <View style={localStyles.foodSearchInfo}>
                        <Text style={localStyles.foodSearchName}>{food.name}</Text>
                        <Text style={localStyles.foodSearchMacros}>
                          {food.calories} cal • P: {food.protein}g • C: {food.carbs}g • F: {food.fat}g
                        </Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={accent.primary} />
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Search Modal */}
      <Modal
        visible={searchModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={localStyles.searchModalContainer}>
            <View style={localStyles.searchModalContent}>
              <View style={localStyles.modalHeader}>
                <Text style={localStyles.modalTitle}>Search Foods</Text>
                <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <View style={localStyles.searchInputContainer}>
                <Ionicons name="search" size={20} color={colors.text.muted} />
                <TextInput
                  style={localStyles.searchInput}
                  placeholder="Search for a food..."
                  placeholderTextColor={colors.text.muted}
                  value={searchQuery}
                  onChangeText={(text) => {
                    setSearchQuery(text);
                    searchFoods(text);
                  }}
                  autoFocus
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
                    <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                  </TouchableOpacity>
                )}
              </View>

              <FlatList
                data={searchResults}
                keyExtractor={(item, index) => item.food_id || index.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={localStyles.foodSearchItem}
                    onPress={() => {
                      setSelectedMeal(item);
                      setServings('1');
                    }}
                  >
                    <View style={localStyles.foodSearchInfo}>
                      <Text style={localStyles.foodSearchName}>{item.name}</Text>
                      <Text style={localStyles.foodSearchServing}>{item.serving_size}</Text>
                      <Text style={localStyles.foodSearchMacros}>
                        {item.calories} cal • P: {item.protein}g • C: {item.carbs}g • F: {item.fat}g
                      </Text>
                    </View>
                    {selectedMeal?.food_id === item.food_id ? (
                      <View style={localStyles.servingsInput}>
                        <TextInput
                          style={localStyles.servingsTextInput}
                          value={servings}
                          onChangeText={setServings}
                          keyboardType="decimal-pad"
                          selectTextOnFocus
                        />
                        <TouchableOpacity 
                          style={localStyles.logBtn}
                          onPress={() => handleQuickLog(item)}
                        >
                          <Text style={localStyles.logBtnText}>Log</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Ionicons name="add-circle" size={24} color={accent.primary} />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  searchQuery.length >= 2 ? (
                    <View style={localStyles.emptySearch}>
                      <Text style={localStyles.emptySearchText}>No foods found</Text>
                      <TouchableOpacity 
                        style={localStyles.createCustomBtn}
                        onPress={() => {
                          setSearchModalVisible(false);
                          setCustomFood({ ...customFood, name: searchQuery });
                          setCustomFoodModalVisible(true);
                        }}
                      >
                        <Text style={localStyles.createCustomText}>Create "{searchQuery}" as custom food</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Food Modal */}
      <Modal
        visible={customFoodModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCustomFoodModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity 
            style={localStyles.modalOverlay}
            activeOpacity={1}
            onPress={() => setCustomFoodModalVisible(false)}
          >
            <View style={localStyles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={localStyles.modalHeader}>
                <Text style={localStyles.modalTitle}>Create Custom Food</Text>
                <TouchableOpacity onPress={() => setCustomFoodModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={localStyles.modalScroll}>
                <Text style={localStyles.inputLabel}>Food Name *</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="e.g., Homemade Salad"
                  placeholderTextColor={colors.text.muted}
                  value={customFood.name}
                  onChangeText={(text) => setCustomFood({ ...customFood, name: text })}
                />

                <Text style={localStyles.inputLabel}>Serving Size</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="e.g., 1 cup, 100g"
                  placeholderTextColor={colors.text.muted}
                  value={customFood.serving_size}
                  onChangeText={(text) => setCustomFood({ ...customFood, serving_size: text })}
                />

                <View style={localStyles.nutritionInputRow}>
                  <View style={localStyles.nutritionInputItem}>
                    <Text style={localStyles.inputLabel}>Calories *</Text>
                    <TextInput
                      style={localStyles.textInput}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={customFood.calories}
                      onChangeText={(text) => setCustomFood({ ...customFood, calories: text })}
                    />
                  </View>
                  <View style={localStyles.nutritionInputItem}>
                    <Text style={localStyles.inputLabel}>Protein (g)</Text>
                    <TextInput
                      style={localStyles.textInput}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={customFood.protein}
                      onChangeText={(text) => setCustomFood({ ...customFood, protein: text })}
                    />
                  </View>
                </View>

                <View style={localStyles.nutritionInputRow}>
                  <View style={localStyles.nutritionInputItem}>
                    <Text style={localStyles.inputLabel}>Carbs (g)</Text>
                    <TextInput
                      style={localStyles.textInput}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={customFood.carbs}
                      onChangeText={(text) => setCustomFood({ ...customFood, carbs: text })}
                    />
                  </View>
                  <View style={localStyles.nutritionInputItem}>
                    <Text style={localStyles.inputLabel}>Fat (g)</Text>
                    <TextInput
                      style={localStyles.textInput}
                      placeholder="0"
                      placeholderTextColor={colors.text.muted}
                      keyboardType="decimal-pad"
                      value={customFood.fat}
                      onChangeText={(text) => setCustomFood({ ...customFood, fat: text })}
                    />
                  </View>
                </View>
              </ScrollView>

              <TouchableOpacity 
                style={localStyles.primaryButton}
                onPress={handleCreateCustomFood}
              >
                <Text style={localStyles.primaryButtonText}>Create & Log Food</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Goals Modal */}
      <Modal
        visible={goalsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setGoalsModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableOpacity 
            style={localStyles.modalOverlay}
            activeOpacity={1}
            onPress={() => setGoalsModalVisible(false)}
          >
            <View style={localStyles.modalContent} onStartShouldSetResponder={() => true}>
              <View style={localStyles.modalHeader}>
                <Text style={localStyles.modalTitle}>Nutrition Goals</Text>
                <TouchableOpacity onPress={() => setGoalsModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={localStyles.modalScroll}>
                <Text style={localStyles.goalsDescription}>
                  Set your daily nutrition targets to track your progress
                </Text>

                <Text style={localStyles.inputLabel}>Daily Calories</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="2000"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="decimal-pad"
                  value={editingGoals.daily_calories}
                  onChangeText={(text) => setEditingGoals({ ...editingGoals, daily_calories: text })}
                />

                <Text style={localStyles.inputLabel}>Protein (g)</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="150"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="decimal-pad"
                  value={editingGoals.protein_grams}
                  onChangeText={(text) => setEditingGoals({ ...editingGoals, protein_grams: text })}
                />

                <Text style={localStyles.inputLabel}>Carbohydrates (g)</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="200"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="decimal-pad"
                  value={editingGoals.carbs_grams}
                  onChangeText={(text) => setEditingGoals({ ...editingGoals, carbs_grams: text })}
                />

                <Text style={localStyles.inputLabel}>Fat (g)</Text>
                <TextInput
                  style={localStyles.textInput}
                  placeholder="65"
                  placeholderTextColor={colors.text.muted}
                  keyboardType="decimal-pad"
                  value={editingGoals.fat_grams}
                  onChangeText={(text) => setEditingGoals({ ...editingGoals, fat_grams: text })}
                />
              </ScrollView>

              <TouchableOpacity 
                style={localStyles.primaryButton}
                onPress={handleUpdateGoals}
              >
                <Text style={localStyles.primaryButtonText}>Save Goals</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Insights Modal */}
      <Modal
        visible={insightsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setInsightsModalVisible(false)}
      >
        <TouchableOpacity 
          style={localStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setInsightsModalVisible(false)}
        >
          <View style={localStyles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={localStyles.modalHeader}>
              <Text style={localStyles.modalTitle}>Weekly Insights</Text>
              <TouchableOpacity onPress={() => setInsightsModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={localStyles.modalScroll}>
              {weeklyData ? (
                <>
                  <View style={localStyles.insightCard}>
                    <Text style={localStyles.insightTitle}>Weekly Averages</Text>
                    <View style={localStyles.insightRow}>
                      <Text style={localStyles.insightLabel}>Calories</Text>
                      <Text style={localStyles.insightValue}>{weeklyData.averages.calories} / day</Text>
                    </View>
                    <View style={localStyles.insightRow}>
                      <Text style={localStyles.insightLabel}>Protein</Text>
                      <Text style={localStyles.insightValue}>{weeklyData.averages.protein}g / day</Text>
                    </View>
                    <View style={localStyles.insightRow}>
                      <Text style={localStyles.insightLabel}>Carbs</Text>
                      <Text style={localStyles.insightValue}>{weeklyData.averages.carbs}g / day</Text>
                    </View>
                    <View style={localStyles.insightRow}>
                      <Text style={localStyles.insightLabel}>Fat</Text>
                      <Text style={localStyles.insightValue}>{weeklyData.averages.fat}g / day</Text>
                    </View>
                  </View>

                  <View style={localStyles.insightCard}>
                    <Text style={localStyles.insightTitle}>Consistency</Text>
                    <Text style={localStyles.insightStat}>
                      {weeklyData.days_logged} of 7 days logged
                    </Text>
                    <View style={localStyles.consistencyBar}>
                      <View 
                        style={[
                          localStyles.consistencyFill, 
                          { width: `${(weeklyData.days_logged / 7) * 100}%` }
                        ]} 
                      />
                    </View>
                  </View>

                  {weeklyData.insights && weeklyData.insights.length > 0 && (
                    <View style={localStyles.insightCard}>
                      <Text style={localStyles.insightTitle}>Tips & Feedback</Text>
                      {weeklyData.insights.map((insight: string, index: number) => (
                        <View key={index} style={localStyles.insightTip}>
                          <Ionicons name="bulb-outline" size={18} color="#F59E0B" />
                          <Text style={localStyles.insightTipText}>{insight}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                <View style={localStyles.centered}>
                  <ActivityIndicator size="small" color={accent.primary} />
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  macroBarContainer: {
    marginBottom: 12,
  },
  macroBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  macroBarLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  macroBarValue: {
    fontSize: 13,
  },
  macroBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  macroBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  macroBarRemaining: {
    fontSize: 11,
    marginTop: 2,
  },
});

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
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 16,
  },
  dateNavBtn: {
    padding: 8,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  calorieCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  calorieRingContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  calorieValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  calorieLabel: {
    fontSize: 13,
  },
  calorieRemaining: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  macroBars: {
    width: '100%',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  mealSection: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  mealSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mealSectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  mealSectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mealSectionCals: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    fontWeight: '500',
  },
  addMealBtn: {
    padding: 4,
  },
  emptyMealSlot: {
    borderWidth: 1,
    borderColor: theme.colors.border.primary,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyMealText: {
    color: theme.colors.text.muted,
    fontSize: 14,
  },
  mealItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  mealItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  mealImage: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  mealImagePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mealItemInfo: {
    flex: 1,
  },
  mealItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text.primary,
    marginBottom: 2,
  },
  mealItemMacros: {
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  mealItemRight: {
    alignItems: 'flex-end',
  },
  mealItemCals: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  mealItemCalsLabel: {
    fontSize: 11,
    color: theme.colors.text.muted,
  },
  deleteMealBtn: {
    padding: 4,
    marginTop: 4,
  },
  copyDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: theme.accentColors.primary,
    borderRadius: 12,
    marginTop: 8,
  },
  copyDayText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.accentColors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  modalScroll: {
    maxHeight: 400,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  searchButtonText: {
    fontSize: 16,
    color: theme.colors.text.muted,
  },
  quickOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  quickOption: {
    flex: 1,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  quickOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.colors.text.primary,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 12,
    marginTop: 8,
  },
  foodSearchItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border.primary,
  },
  foodSearchInfo: {
    flex: 1,
  },
  foodSearchName: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text.primary,
    marginBottom: 2,
  },
  foodSearchServing: {
    fontSize: 12,
    color: theme.colors.text.muted,
    marginBottom: 2,
  },
  foodSearchMacros: {
    fontSize: 12,
    color: theme.colors.text.secondary,
  },
  servingsInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  servingsTextInput: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 50,
    textAlign: 'center',
    color: theme.colors.text.primary,
    fontSize: 14,
  },
  logBtn: {
    backgroundColor: theme.accentColors.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  logBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  searchModalContent: {
    backgroundColor: theme.colors.background.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    height: '90%',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  emptySearch: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptySearchText: {
    fontSize: 16,
    color: theme.colors.text.muted,
    marginBottom: 12,
  },
  createCustomBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  createCustomText: {
    color: theme.accentColors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: theme.colors.text.primary,
  },
  nutritionInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nutritionInputItem: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: theme.accentColors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  goalsDescription: {
    fontSize: 14,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  insightCard: {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginBottom: 12,
  },
  insightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  insightLabel: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  insightValue: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  insightStat: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 8,
  },
  consistencyBar: {
    height: 8,
    backgroundColor: theme.colors.background.primary,
    borderRadius: 4,
    overflow: 'hidden',
  },
  consistencyFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  insightTip: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  insightTipText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text.primary,
    lineHeight: 20,
  },
});

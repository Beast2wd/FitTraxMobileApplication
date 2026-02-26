import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ImageBackground,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUserStore } from '../../stores/userStore';
import { useThemeStore } from '../../stores/themeStore';
import { foodAPI } from '../../services/api';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MEAL_CATEGORIES = [
  { value: 'breakfast', label: 'Breakfast', icon: '🌅', color: '#F59E0B' },
  { value: 'lunch', label: 'Lunch', icon: '☀️', color: '#10B981' },
  { value: 'snack', label: 'Snack', icon: '🍎', color: '#EC4899' },
  { value: 'dinner', label: 'Dinner', icon: '🌙', color: '#8B5CF6' },
];

const TABS = [
  { id: 'planner', label: 'Meal Planner', icon: 'restaurant-menu' },
  { id: 'groceries', label: 'Groceries', icon: 'shopping-cart' },
  { id: 'recipes', label: 'Recipes', icon: 'menu-book' },
  { id: 'coach', label: 'AI Coach', icon: 'psychology' },
];

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface CustomMeal {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
  sodium: number;
  image?: string;
  ingredients?: string[];
  date: string;
  cooked?: boolean;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity: string;
  category: string;
  checked: boolean;
}

interface Recipe {
  id: string;
  name: string;
  image: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  prepTime: string;
  ingredients: string[];
  instructions: string[];
  category: string;
}

interface DailyNutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  fiber: number;
}

export default function ScanScreen() {
  const { userId, triggerMealRefresh, profile, membershipStatus } = useUserStore();
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  const isPremium = membershipStatus?.is_premium || false;

  const [activeTab, setActiveTab] = useState('planner');
  
  // Scan states
  const [image, setImage] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mealCategory, setMealCategory] = useState('breakfast');
  const [showScanModal, setShowScanModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Meal Planner states
  const [plannedMeals, setPlannedMeals] = useState<CustomMeal[]>([]);
  const [showCreateMealModal, setShowCreateMealModal] = useState(false);
  const [showEditMealModal, setShowEditMealModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loadingMeals, setLoadingMeals] = useState(false);
  const [editingMeal, setEditingMeal] = useState<CustomMeal | null>(null);
  
  // Daily nutrition tracking
  const [dailyNutrition, setDailyNutrition] = useState<DailyNutrition>({
    calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0
  });
  
  // Nutrition goals - reactive to profile changes
  const nutritionGoals = {
    calories: profile?.custom_calorie_goal || profile?.daily_calorie_goal || 2000,
    protein: Math.round((profile?.custom_calorie_goal || profile?.daily_calorie_goal || 2000) * 0.075), // ~30% of calories from protein
    carbs: Math.round((profile?.custom_calorie_goal || profile?.daily_calorie_goal || 2000) * 0.125), // ~50% of calories from carbs
    fat: Math.round((profile?.custom_calorie_goal || profile?.daily_calorie_goal || 2000) * 0.0325), // ~30% of calories from fat
    sugar: 50,
    fiber: 30
  };
  
  // New meal form
  const [newMeal, setNewMeal] = useState({
    name: '',
    category: 'breakfast',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    sugar: '',
    fiber: '',
    sodium: '',
  });

  // Grocery states
  const [groceryList, setGroceryList] = useState<GroceryItem[]>([]);
  const [generatingGroceries, setGeneratingGroceries] = useState(false);
  const [showAddGroceryModal, setShowAddGroceryModal] = useState(false);
  const [newGroceryItem, setNewGroceryItem] = useState({ name: '', quantity: '1', category: 'Produce' });

  // Recipe states
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [generatingRecipe, setGeneratingRecipe] = useState(false);
  const [recipePrompt, setRecipePrompt] = useState('');
  const [showRecipeGeneratorModal, setShowRecipeGeneratorModal] = useState(false);

  // AI Nutrition Coach states
  const [coachMessages, setCoachMessages] = useState<ChatMessage[]>([]);
  const [coachInput, setCoachInput] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);
  const [loadingCoachHistory, setLoadingCoachHistory] = useState(false);

  useEffect(() => {
    if (userId) {
      loadPlannedMeals();
      loadGroceryList();
      loadRecipes();
      loadDailyNutrition();
      loadCoachConversation();
    }
  }, [userId, selectedDate]);

  const loadPlannedMeals = async () => {
    if (!userId) return;
    setLoadingMeals(true);
    try {
      const response = await axios.get(`${API_URL}/api/meals/planned/${userId}?date=${selectedDate}`);
      setPlannedMeals(response.data.meals || []);
    } catch (error) {
      console.log('No planned meals found');
      setPlannedMeals([]);
    } finally {
      setLoadingMeals(false);
    }
  };

  const loadDailyNutrition = async () => {
    if (!userId) return;
    try {
      const response = await axios.get(`${API_URL}/api/dashboard/${userId}?local_date=${selectedDate}`);
      const today = response.data.today || {};
      setDailyNutrition({
        calories: today.calories || 0,
        protein: today.protein || 0,
        carbs: today.carbs || 0,
        fat: today.fat || 0,
        sugar: today.sugar || 0,
        fiber: today.fiber || 0,
      });
    } catch (error) {
      console.log('Error loading nutrition data');
    }
  };

  const loadGroceryList = async () => {
    if (!userId) return;
    try {
      const response = await axios.get(`${API_URL}/api/meals/groceries/${userId}`);
      setGroceryList(response.data.items || []);
    } catch (error) {
      console.log('No grocery list found');
    }
  };

  const loadRecipes = async () => {
    if (!userId) return;
    setLoadingRecipes(true);
    try {
      const response = await axios.get(`${API_URL}/api/meals/recipes/${userId}`);
      setRecipes(response.data.recipes || []);
    } catch (error) {
      console.log('No recipes found');
    } finally {
      setLoadingRecipes(false);
    }
  };

  // Camera/Gallery functions with category selection
  const openScanOptions = () => {
    setShowCategoryPicker(true);
  };

  const startScan = (category: string) => {
    setMealCategory(category);
    setShowCategoryPicker(false);
    setShowScanModal(true);
  };

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to scan food');
      return false;
    }
    return true;
  };

  const takePicture = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setImage(result.assets[0].uri);
        setImageBase64(result.assets[0].base64);
        setShowScanModal(false);
        analyzeFood(result.assets[0].base64);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to take picture');
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setImage(result.assets[0].uri);
        setImageBase64(result.assets[0].base64);
        setShowScanModal(false);
        analyzeFood(result.assets[0].base64);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const analyzeFood = async (base64Image: string) => {
    if (!userId) {
      Alert.alert('Error', 'Please complete your profile first');
      return;
    }

    try {
      setAnalyzing(true);
      setResult(null);

      const response = await foodAPI.analyzeFood({
        user_id: userId,
        image_base64: base64Image,
        meal_category: mealCategory,
      });

      setResult(response);
      triggerMealRefresh();
      loadDailyNutrition();
    } catch (error: any) {
      console.error('Analysis error:', error);
      Alert.alert('Error', error.message || 'Failed to analyze food');
    } finally {
      setAnalyzing(false);
    }
  };

  const resetScan = () => {
    setImage(null);
    setImageBase64(null);
    setResult(null);
  };

  // Create custom meal
  const handleCreateMeal = async () => {
    if (!newMeal.name || !newMeal.calories) {
      Alert.alert('Required', 'Please enter meal name and calories');
      return;
    }

    try {
      const mealData: CustomMeal = {
        id: `meal_${Date.now()}`,
        name: newMeal.name,
        category: newMeal.category,
        calories: parseInt(newMeal.calories) || 0,
        protein: parseInt(newMeal.protein) || 0,
        carbs: parseInt(newMeal.carbs) || 0,
        fat: parseInt(newMeal.fat) || 0,
        sugar: parseInt(newMeal.sugar) || 0,
        fiber: parseInt(newMeal.fiber) || 0,
        sodium: parseInt(newMeal.sodium) || 0,
        date: selectedDate,
        cooked: false,
      };

      await axios.post(`${API_URL}/api/meals/planned`, {
        user_id: userId,
        meal: mealData,
      });

      setPlannedMeals(prev => [...prev, mealData]);
      setShowCreateMealModal(false);
      resetMealForm();
      Alert.alert('Success', 'Meal added to your plan!');
    } catch (error) {
      console.error('Error creating meal:', error);
      Alert.alert('Error', 'Failed to create meal');
    }
  };

  const resetMealForm = () => {
    setNewMeal({
      name: '', category: 'breakfast', calories: '', protein: '',
      carbs: '', fat: '', sugar: '', fiber: '', sodium: '',
    });
  };

  // Edit meal
  const openEditMeal = (meal: CustomMeal) => {
    setEditingMeal(meal);
    setNewMeal({
      name: meal.name,
      category: meal.category,
      calories: meal.calories.toString(),
      protein: meal.protein.toString(),
      carbs: meal.carbs.toString(),
      fat: meal.fat.toString(),
      sugar: meal.sugar.toString(),
      fiber: meal.fiber.toString(),
      sodium: meal.sodium.toString(),
    });
    setShowEditMealModal(true);
  };

  const handleUpdateMeal = async () => {
    if (!editingMeal) return;
    
    try {
      const updatedMeal: CustomMeal = {
        ...editingMeal,
        name: newMeal.name,
        category: newMeal.category,
        calories: parseInt(newMeal.calories) || 0,
        protein: parseInt(newMeal.protein) || 0,
        carbs: parseInt(newMeal.carbs) || 0,
        fat: parseInt(newMeal.fat) || 0,
        sugar: parseInt(newMeal.sugar) || 0,
        fiber: parseInt(newMeal.fiber) || 0,
        sodium: parseInt(newMeal.sodium) || 0,
      };

      await axios.put(`${API_URL}/api/meals/planned/${editingMeal.id}`, {
        user_id: userId,
        meal: updatedMeal,
      });

      setPlannedMeals(prev => 
        prev.map(m => m.id === editingMeal.id ? updatedMeal : m)
      );
      setShowEditMealModal(false);
      setEditingMeal(null);
      resetMealForm();
      Alert.alert('Updated', 'Meal updated successfully!');
    } catch (error) {
      console.error('Error updating meal:', error);
      Alert.alert('Error', 'Failed to update meal');
    }
  };

  // Long press to delete meal
  const handleLongPressMeal = (meal: CustomMeal) => {
    Alert.alert(
      'Meal Options',
      `What would you like to do with "${meal.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Edit', 
          onPress: () => openEditMeal(meal)
        },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => confirmDeleteMeal(meal)
        },
      ]
    );
  };

  // Cook meal and log nutrients
  const handleCookMeal = async (meal: CustomMeal) => {
    Alert.alert(
      'Log This Meal',
      `Log "${meal.name}" to your nutrition tracker?\n\nCalories: ${meal.calories}\nProtein: ${meal.protein}g\nCarbs: ${meal.carbs}g\nFat: ${meal.fat}g\nSugar: ${meal.sugar}g`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Meal',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/food/log-custom`, {
                user_id: userId,
                meal_name: meal.name,
                meal_category: meal.category,
                calories: meal.calories,
                protein: meal.protein,
                carbs: meal.carbs,
                fat: meal.fat,
                sugar: meal.sugar,
                fiber: meal.fiber,
                sodium: meal.sodium,
              });

              await axios.put(`${API_URL}/api/meals/planned/${meal.id}/cook`, {
                user_id: userId,
              });

              setPlannedMeals(prev => 
                prev.map(m => m.id === meal.id ? { ...m, cooked: true } : m)
              );

              triggerMealRefresh();
              loadDailyNutrition();
              Alert.alert('Logged!', `${meal.name} has been added to your nutrition log.`);
            } catch (error) {
              console.error('Error logging meal:', error);
              Alert.alert('Error', 'Failed to log meal');
            }
          },
        },
      ]
    );
  };

  // Delete planned meal (also removes from nutrition if logged)
  const handleDeleteMeal = async (mealId: string, wasCooked: boolean, mealName: string) => {
    try {
      // Delete from planned meals
      await axios.delete(`${API_URL}/api/meals/planned/${mealId}?user_id=${userId}`);
      setPlannedMeals(prev => prev.filter(m => m.id !== mealId));
      
      // If meal was logged to nutrition tracker, remove it
      if (wasCooked) {
        try {
          await axios.delete(`${API_URL}/api/meals/nutrition-log/${mealId}?user_id=${userId}`);
          loadDailyNutrition(); // Refresh nutrition data
        } catch (e) {
          console.log('Note: Could not remove from nutrition log');
        }
      }
      
      Alert.alert('Deleted', `${mealName} has been removed${wasCooked ? ' from both meal plan and nutrition tracker' : ''}.`);
    } catch (error) {
      console.error('Error deleting meal:', error);
      Alert.alert('Error', 'Failed to delete meal');
    }
  };

  // Confirm delete meal with alert
  const confirmDeleteMeal = (meal: CustomMeal) => {
    const message = meal.cooked 
      ? `This will remove "${meal.name}" from both your meal plan AND your nutrition tracker for today.`
      : `Delete "${meal.name}" from your meal plan?`;
      
    Alert.alert(
      'Delete Meal',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteMeal(meal.id, meal.cooked, meal.name)
        },
      ]
    );
  };

  // Generate AI grocery list from meals
  const generateGroceryList = async () => {
    if (plannedMeals.length === 0) {
      Alert.alert('No Meals', 'Add some meals to your plan first to generate a grocery list.');
      return;
    }

    setGeneratingGroceries(true);
    try {
      // Get meal names and any ingredients from recipes
      const mealInfo = plannedMeals.map(m => {
        if (m.ingredients && m.ingredients.length > 0) {
          return `${m.name} (ingredients: ${m.ingredients.join(', ')})`;
        }
        return m.name;
      });

      const response = await axios.post(`${API_URL}/api/meals/generate-groceries`, {
        user_id: userId,
        meals: mealInfo,
      });

      const newItems = response.data.items || [];
      setGroceryList(newItems);
      setActiveTab('groceries');
      Alert.alert('Success', `Generated ${newItems.length} grocery items based on your meal plan!`);
    } catch (error) {
      console.error('Error generating groceries:', error);
      Alert.alert('Error', 'Failed to generate grocery list');
    } finally {
      setGeneratingGroceries(false);
    }
  };

  // Toggle grocery item
  const toggleGroceryItem = async (itemId: string) => {
    setGroceryList(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
    try {
      await axios.put(`${API_URL}/api/meals/groceries/${itemId}/toggle`, {
        user_id: userId,
      });
    } catch (error) {
      console.log('Error saving grocery toggle');
    }
  };

  // Add grocery item
  const handleAddGroceryItem = async () => {
    if (!newGroceryItem.name) return;
    
    const item: GroceryItem = {
      id: `grocery_${Date.now()}`,
      name: newGroceryItem.name,
      quantity: newGroceryItem.quantity,
      category: newGroceryItem.category,
      checked: false,
    };

    try {
      await axios.post(`${API_URL}/api/meals/groceries`, {
        user_id: userId,
        item,
      });
      setGroceryList(prev => [...prev, item]);
      setShowAddGroceryModal(false);
      setNewGroceryItem({ name: '', quantity: '1', category: 'Produce' });
    } catch (error) {
      console.error('Error adding grocery item:', error);
    }
  };

  // Clear checked groceries
  const clearCheckedGroceries = async () => {
    const checkedIds = groceryList.filter(i => i.checked).map(i => i.id);
    if (checkedIds.length === 0) return;

    try {
      await axios.post(`${API_URL}/api/meals/groceries/clear-checked`, {
        user_id: userId,
        item_ids: checkedIds,
      });
      setGroceryList(prev => prev.filter(i => !i.checked));
    } catch (error) {
      console.error('Error clearing groceries:', error);
    }
  };

  // Clear ALL groceries
  const clearAllGroceries = () => {
    Alert.alert(
      'Clear Grocery List',
      'Are you sure you want to delete all grocery items?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const allIds = groceryList.map(i => i.id);
              await axios.post(`${API_URL}/api/meals/groceries/clear-checked`, {
                user_id: userId,
                item_ids: allIds,
              });
              setGroceryList([]);
            } catch (error) {
              console.error('Error clearing all groceries:', error);
            }
          },
        },
      ]
    );
  };

  // Delete single grocery item
  const handleDeleteGroceryItem = (item: GroceryItem) => {
    Alert.alert(
      'Delete Item',
      `Remove "${item.name}" from your list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/meals/groceries/clear-checked`, {
                user_id: userId,
                item_ids: [item.id],
              });
              setGroceryList(prev => prev.filter(i => i.id !== item.id));
            } catch (error) {
              console.error('Error deleting grocery item:', error);
            }
          },
        },
      ]
    );
  };

  // Generate AI recipe
  const generateRecipe = async () => {
    if (!recipePrompt.trim()) {
      Alert.alert('Enter Recipe', 'Please describe what you want to cook');
      return;
    }

    setGeneratingRecipe(true);
    try {
      const response = await axios.post(`${API_URL}/api/meals/generate-recipe`, {
        user_id: userId,
        prompt: recipePrompt,
      });

      const newRecipe = response.data.recipe;
      setRecipes(prev => [newRecipe, ...prev]);
      setShowRecipeGeneratorModal(false);
      setRecipePrompt('');
      setSelectedRecipe(newRecipe);
      setShowRecipeModal(true);
    } catch (error) {
      console.error('Error generating recipe:', error);
      Alert.alert('Error', 'Failed to generate recipe');
    } finally {
      setGeneratingRecipe(false);
    }
  };

  // Add recipe to meal plan with ingredients AND auto-populate groceries
  const addRecipeToMealPlan = async (recipe: Recipe) => {
    const mealData: CustomMeal = {
      id: `meal_${Date.now()}`,
      name: recipe.name,
      category: recipe.category || 'dinner',
      calories: recipe.calories,
      protein: recipe.protein,
      carbs: recipe.carbs,
      fat: recipe.fat,
      sugar: 0,
      fiber: 0,
      sodium: 0,
      ingredients: recipe.ingredients,
      date: selectedDate,
      cooked: false,
    };

    try {
      // Add to meal plan
      await axios.post(`${API_URL}/api/meals/planned`, {
        user_id: userId,
        meal: mealData,
      });

      setPlannedMeals(prev => [...prev, mealData]);

      // Auto-populate groceries from recipe ingredients
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        const newGroceryItems: GroceryItem[] = recipe.ingredients.map((ingredient, index) => ({
          id: `grocery_${Date.now()}_${index}`,
          name: ingredient,
          quantity: '1',
          category: categorizeIngredient(ingredient),
          checked: false,
        }));

        // Add each grocery item to database and state
        for (const item of newGroceryItems) {
          try {
            await axios.post(`${API_URL}/api/meals/groceries`, {
              user_id: userId,
              item,
            });
          } catch (e) {
            console.log('Error adding grocery item:', e);
          }
        }
        
        setGroceryList(prev => [...prev, ...newGroceryItems]);
      }

      setShowRecipeModal(false);
      setActiveTab('planner');
      Alert.alert(
        'Added!', 
        `${recipe.name} added to your meal plan.\n\n✅ ${recipe.ingredients?.length || 0} ingredients added to your grocery list!`
      );
    } catch (error) {
      console.error('Error adding recipe to meal plan:', error);
      Alert.alert('Error', 'Failed to add to meal plan');
    }
  };

  // Helper to categorize ingredients for grocery list
  const categorizeIngredient = (ingredient: string): string => {
    const lowerIng = ingredient.toLowerCase();
    if (/chicken|beef|pork|fish|salmon|shrimp|turkey|bacon|sausage/.test(lowerIng)) return 'Meat & Seafood';
    if (/milk|cheese|yogurt|butter|cream|egg/.test(lowerIng)) return 'Dairy';
    if (/rice|pasta|bread|flour|oat|quinoa|cereal/.test(lowerIng)) return 'Grains';
    if (/tomato|onion|garlic|pepper|lettuce|spinach|carrot|broccoli|potato|vegetable|fruit|apple|banana|lemon|lime|avocado/.test(lowerIng)) return 'Produce';
    if (/can|canned|beans|broth|stock|sauce|tomato paste/.test(lowerIng)) return 'Canned Goods';
    if (/salt|pepper|spice|herb|oregano|basil|cumin|paprika|cinnamon/.test(lowerIng)) return 'Spices';
    if (/oil|olive|vinegar|soy sauce|honey|sugar/.test(lowerIng)) return 'Pantry';
    return 'Other';
  };

  // Cook from recipe
  const cookFromRecipe = async (recipe: Recipe) => {
    Alert.alert(
      'Cook This Recipe',
      `Log "${recipe.name}" to your nutrition tracker?\n\nCalories: ${recipe.calories}\nProtein: ${recipe.protein}g\nCarbs: ${recipe.carbs}g\nFat: ${recipe.fat}g`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Meal',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/food/log-custom`, {
                user_id: userId,
                meal_name: recipe.name,
                meal_category: recipe.category || 'dinner',
                calories: recipe.calories,
                protein: recipe.protein,
                carbs: recipe.carbs,
                fat: recipe.fat,
                sugar: 0,
                fiber: 0,
                sodium: 0,
              });

              triggerMealRefresh();
              loadDailyNutrition();
              setShowRecipeModal(false);
              Alert.alert('Logged!', `${recipe.name} has been added to your nutrition log.`);
            } catch (error) {
              console.error('Error logging recipe:', error);
              Alert.alert('Error', 'Failed to log meal');
            }
          },
        },
      ]
    );
  };

  // Confirm delete recipe
  const confirmDeleteRecipe = (recipe: Recipe) => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipe.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => handleDeleteRecipe(recipe.id)
        },
      ]
    );
  };

  // Delete recipe
  const handleDeleteRecipe = async (recipeId: string) => {
    try {
      await axios.delete(`${API_URL}/api/meals/recipes/${recipeId}?user_id=${userId}`);
      setRecipes(prev => prev.filter(r => r.id !== recipeId));
      Alert.alert('Deleted', 'Recipe has been removed.');
    } catch (error) {
      console.error('Error deleting recipe:', error);
      Alert.alert('Error', 'Failed to delete recipe');
    }
  };

  // AI Nutrition Coach Functions
  const loadCoachConversation = async () => {
    if (!userId) return;
    setLoadingCoachHistory(true);
    try {
      const response = await axios.get(`${API_URL}/api/nutrition-coach/conversation/${userId}`);
      setCoachMessages(response.data.messages || []);
    } catch (error) {
      console.log('No coach conversation found');
      setCoachMessages([]);
    } finally {
      setLoadingCoachHistory(false);
    }
  };

  const sendCoachMessage = async () => {
    if (!coachInput.trim() || coachLoading) return;
    
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: coachInput.trim(),
      timestamp: new Date().toISOString(),
    };
    
    setCoachMessages(prev => [...prev, userMessage]);
    setCoachInput('');
    setCoachLoading(true);
    
    try {
      const response = await axios.post(`${API_URL}/api/nutrition-coach/chat`, {
        user_id: userId,
        message: userMessage.content,
        conversation_history: coachMessages.slice(-10), // Send last 10 messages for context
      });
      
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
      };
      
      setCoachMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending coach message:', error);
      Alert.alert('Error', 'Failed to get response from AI Coach');
      // Remove the user message if failed
      setCoachMessages(prev => prev.filter(m => m.id !== userMessage.id));
    } finally {
      setCoachLoading(false);
    }
  };

  const clearCoachConversation = () => {
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to delete this conversation?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/nutrition-coach/conversation/${userId}`);
              setCoachMessages([]);
              Alert.alert('Cleared', 'Conversation has been deleted.');
            } catch (error) {
              console.error('Error clearing conversation:', error);
            }
          },
        },
      ]
    );
  };

  const getFormattedDate = () => {
    const date = new Date(selectedDate);
    return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  const getDailyTotals = () => {
    return plannedMeals.reduce((acc, meal) => ({
      calories: acc.calories + meal.calories,
      protein: acc.protein + meal.protein,
      carbs: acc.carbs + meal.carbs,
      fat: acc.fat + meal.fat,
      sugar: acc.sugar + meal.sugar,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 });
  };

  const getMealsByCategory = (category: string) => {
    return plannedMeals.filter(m => m.category === category);
  };

  const getProgressPercent = (current: number, goal: number) => {
    return Math.min((current / goal) * 100, 100);
  };

  // Render Nutrition Tracker
  const renderNutritionTracker = () => {
    const totals = getDailyTotals();
    const consumed = {
      calories: dailyNutrition.calories + totals.calories,
      protein: dailyNutrition.protein + totals.protein,
      carbs: dailyNutrition.carbs + totals.carbs,
      fat: dailyNutrition.fat + totals.fat,
      sugar: dailyNutrition.sugar + totals.sugar,
    };

    return (
      <View style={[styles.nutritionTracker, { backgroundColor: colors.background.card }]}>
        <Text style={[styles.trackerTitle, { color: colors.text.primary }]}>Today's Nutrition</Text>
        
        {/* Calories - Main */}
        <View style={styles.calorieRow}>
          <View style={styles.calorieInfo}>
            <Text style={[styles.calorieValue, { color: accent.primary }]}>{Math.round(consumed.calories)}</Text>
            <Text style={[styles.calorieLabel, { color: colors.text.muted }]}>/ {nutritionGoals.calories} cal</Text>
          </View>
          <View style={styles.calorieBar}>
            <View style={[styles.calorieProgress, { width: `${getProgressPercent(consumed.calories, nutritionGoals.calories)}%`, backgroundColor: accent.primary }]} />
          </View>
        </View>

        {/* Macros Grid */}
        <View style={styles.macrosGrid}>
          {/* Protein */}
          <View style={styles.macroItem}>
            <View style={styles.macroHeader}>
              <Text style={[styles.macroLabel, { color: colors.text.secondary }]}>Protein</Text>
              <Text style={[styles.macroValue, { color: '#3B82F6' }]}>{Math.round(consumed.protein)}g</Text>
            </View>
            <View style={styles.macroBar}>
              <View style={[styles.macroProgress, { width: `${getProgressPercent(consumed.protein, nutritionGoals.protein)}%`, backgroundColor: '#3B82F6' }]} />
            </View>
          </View>

          {/* Carbs */}
          <View style={styles.macroItem}>
            <View style={styles.macroHeader}>
              <Text style={[styles.macroLabel, { color: colors.text.secondary }]}>Carbs</Text>
              <Text style={[styles.macroValue, { color: '#F59E0B' }]}>{Math.round(consumed.carbs)}g</Text>
            </View>
            <View style={styles.macroBar}>
              <View style={[styles.macroProgress, { width: `${getProgressPercent(consumed.carbs, nutritionGoals.carbs)}%`, backgroundColor: '#F59E0B' }]} />
            </View>
          </View>

          {/* Fat */}
          <View style={styles.macroItem}>
            <View style={styles.macroHeader}>
              <Text style={[styles.macroLabel, { color: colors.text.secondary }]}>Fat</Text>
              <Text style={[styles.macroValue, { color: '#EF4444' }]}>{Math.round(consumed.fat)}g</Text>
            </View>
            <View style={styles.macroBar}>
              <View style={[styles.macroProgress, { width: `${getProgressPercent(consumed.fat, nutritionGoals.fat)}%`, backgroundColor: '#EF4444' }]} />
            </View>
          </View>

          {/* Sugar */}
          <View style={styles.macroItem}>
            <View style={styles.macroHeader}>
              <Text style={[styles.macroLabel, { color: colors.text.secondary }]}>Sugar</Text>
              <Text style={[styles.macroValue, { color: '#EC4899' }]}>{Math.round(consumed.sugar)}g</Text>
            </View>
            <View style={styles.macroBar}>
              <View style={[styles.macroProgress, { width: `${getProgressPercent(consumed.sugar, nutritionGoals.sugar)}%`, backgroundColor: '#EC4899' }]} />
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Render Meal Planner Tab
  const renderMealPlanner = () => {
    const isToday = selectedDate === new Date().toISOString().split('T')[0];
    
    const goToPreviousDay = () => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() - 1);
      setSelectedDate(date.toISOString().split('T')[0]);
    };

    const goToNextDay = () => {
      const date = new Date(selectedDate);
      date.setDate(date.getDate() + 1);
      setSelectedDate(date.toISOString().split('T')[0]);
    };

    const goToToday = () => {
      setSelectedDate(new Date().toISOString().split('T')[0]);
    };

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Date Navigation Header */}
        <View style={[styles.dateNavHeader, { backgroundColor: colors.background.card }]}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={goToPreviousDay}>
            <Ionicons name="chevron-back" size={24} color={accent.primary} />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.dateNavCenter} onPress={goToToday}>
            <Text style={[styles.dateNavTitle, { color: colors.text.primary }]}>
              {isToday ? "Today" : getFormattedDate()}
            </Text>
            <Text style={[styles.dateNavSubtitle, { color: colors.text.muted }]}>
              {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            {!isToday && (
              <Text style={[styles.tapToReturn, { color: accent.primary }]}>Tap to return to today</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.dateNavBtn, isToday && styles.dateNavBtnDisabled]} 
            onPress={goToNextDay}
            disabled={isToday}
          >
            <Ionicons name="chevron-forward" size={24} color={isToday ? colors.text.muted : accent.primary} />
          </TouchableOpacity>
        </View>

        {/* Nutrition Tracker */}
        {renderNutritionTracker()}

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={[styles.quickActionBtn, { backgroundColor: accent.primary }]}
            onPress={() => setShowCreateMealModal(true)}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.quickActionText}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.quickActionBtn, { backgroundColor: colors.background.card }]}
            onPress={openScanOptions}
          >
            <Ionicons name="camera" size={20} color={accent.primary} />
            <Text style={[styles.quickActionText, { color: colors.text.primary }]}>Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.quickActionBtn, { backgroundColor: colors.background.card }]}
            onPress={generateGroceryList}
            disabled={generatingGroceries}
          >
            {generatingGroceries ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <MaterialIcons name="shopping-cart" size={20} color={accent.primary} />
            )}
            <Text style={[styles.quickActionText, { color: colors.text.primary }]}>Groceries</Text>
          </TouchableOpacity>
        </View>

        {/* Scan Result */}
        {(image || analyzing || result) && (
          <View style={[styles.scanResultCard, { backgroundColor: colors.background.card }]}>
            {image && (
              <Image source={{ uri: image }} style={styles.scanImage} resizeMode="cover" />
            )}
            {analyzing && (
              <View style={styles.analyzingOverlay}>
                <ActivityIndicator size="large" color={accent.primary} />
                <Text style={styles.analyzingText}>Analyzing food...</Text>
              </View>
            )}
            {result && (
              <View style={styles.scanResultContent}>
                <Text style={[styles.foodName, { color: colors.text.primary }]}>{result.analysis?.food_name || 'Food'}</Text>
                <View style={styles.scanMacroRow}>
                  <View style={styles.scanMacroItem}>
                    <Text style={styles.scanMacroValue}>{Math.round(result.analysis?.calories || 0)}</Text>
                    <Text style={styles.scanMacroLabel}>Cal</Text>
                  </View>
                  <View style={styles.scanMacroItem}>
                    <Text style={styles.scanMacroValue}>{Math.round(result.analysis?.protein || 0)}g</Text>
                    <Text style={styles.scanMacroLabel}>Protein</Text>
                  </View>
                  <View style={styles.scanMacroItem}>
                    <Text style={styles.scanMacroValue}>{Math.round(result.analysis?.carbs || 0)}g</Text>
                    <Text style={styles.scanMacroLabel}>Carbs</Text>
                  </View>
                  <View style={styles.scanMacroItem}>
                    <Text style={styles.scanMacroValue}>{Math.round(result.analysis?.fat || 0)}g</Text>
                    <Text style={styles.scanMacroLabel}>Fat</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.resetBtn} onPress={resetScan}>
                  <Text style={styles.resetBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Meal Categories */}
        {MEAL_CATEGORIES.map(cat => {
          const meals = getMealsByCategory(cat.value);
          return (
            <View key={cat.value} style={styles.mealCategorySection}>
              <View style={styles.categoryHeader}>
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryTitle, { color: colors.text.primary }]}>{cat.label}</Text>
                <TouchableOpacity 
                  style={[styles.addMealBtn, { backgroundColor: `${cat.color}20` }]}
                  onPress={() => {
                    setNewMeal(prev => ({ ...prev, category: cat.value }));
                    setShowCreateMealModal(true);
                  }}
                >
                  <Ionicons name="add" size={18} color={cat.color} />
                </TouchableOpacity>
              </View>
              
              {meals.length === 0 ? (
                <TouchableOpacity 
                  style={[styles.emptyMealCard, { borderColor: colors.border.primary }]}
                  onPress={() => {
                    setNewMeal(prev => ({ ...prev, category: cat.value }));
                    setShowCreateMealModal(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={24} color={colors.text.muted} />
                  <Text style={[styles.emptyMealText, { color: colors.text.muted }]}>Add {cat.label}</Text>
                </TouchableOpacity>
              ) : (
                meals.map(meal => (
                  <Pressable 
                    key={meal.id} 
                    style={[
                      styles.mealCard, 
                      { backgroundColor: colors.background.card },
                      meal.cooked && styles.mealCardCooked
                    ]}
                    onPress={() => openEditMeal(meal)}
                    onLongPress={() => handleLongPressMeal(meal)}
                    delayLongPress={500}
                  >
                    <View style={styles.mealCardContent}>
                      <Text style={[styles.mealName, { color: colors.text.primary }]}>{meal.name}</Text>
                      <Text style={[styles.mealCalories, { color: colors.text.secondary }]}>
                        {meal.calories} cal • P:{meal.protein}g • C:{meal.carbs}g • F:{meal.fat}g
                      </Text>
                      {meal.sugar > 0 && (
                        <Text style={[styles.mealSugar, { color: colors.text.muted }]}>
                          Sugar: {meal.sugar}g
                        </Text>
                      )}
                    </View>
                    <View style={styles.mealActions}>
                      {!meal.cooked && (
                        <TouchableOpacity 
                          style={[styles.cookBtn, { backgroundColor: '#10B98120' }]}
                          onPress={() => handleCookMeal(meal)}
                        >
                          <MaterialCommunityIcons name="pot-steam" size={18} color="#10B981" />
                        </TouchableOpacity>
                      )}
                      {meal.cooked && (
                        <View style={styles.cookedBadge}>
                          <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                        </View>
                      )}
                      <TouchableOpacity 
                        style={[styles.deleteMealBtn]}
                        onPress={() => confirmDeleteMeal(meal)}
                      >
                        <Ionicons name="trash-outline" size={18} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          );
        })}

        <Text style={[styles.hintText, { color: colors.text.muted }]}>
          💡 Tap a meal to edit • Long press for more options
        </Text>

        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  // Render Groceries Tab
  const renderGroceries = () => {
    const groupedGroceries = groceryList.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {} as { [key: string]: GroceryItem[] });

    const checkedCount = groceryList.filter(i => i.checked).length;

    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <View style={styles.groceryHeader}>
          <Text style={[styles.groceryTitle, { color: colors.text.primary }]}>Grocery List</Text>
          <View style={styles.groceryActions}>
            <TouchableOpacity 
              style={[styles.groceryActionBtn, { backgroundColor: accent.primary }]}
              onPress={() => setShowAddGroceryModal(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
            {checkedCount > 0 && (
              <TouchableOpacity 
                style={[styles.groceryActionBtn, { backgroundColor: '#10B98120' }]}
                onPress={clearCheckedGroceries}
              >
                <Ionicons name="checkmark-done" size={20} color="#10B981" />
              </TouchableOpacity>
            )}
            {groceryList.length > 0 && (
              <TouchableOpacity 
                style={[styles.groceryActionBtn, { backgroundColor: '#EF444420' }]}
                onPress={clearAllGroceries}
              >
                <Ionicons name="trash" size={20} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <TouchableOpacity 
          style={styles.aiGenerateBtnWithImage}
          onPress={generateGroceryList}
          disabled={generatingGroceries}
        >
          <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600' }}
            style={styles.aiGenerateBgImage}
            imageStyle={styles.aiGenerateBgImageStyle}
          >
            <View style={styles.aiGenerateOverlay}>
              {generatingGroceries ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <MaterialCommunityIcons name="cart-plus" size={28} color="#fff" />
              )}
              <Text style={styles.aiGenerateTextLarge}>Generate from Meal Plan</Text>
              <Text style={styles.aiGenerateSubtext}>Auto-create your shopping list</Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>

        {groceryList.length === 0 ? (
          <View style={styles.emptyGroceries}>
            <MaterialIcons name="shopping-cart" size={64} color={colors.text.muted} />
            <Text style={[styles.emptyGroceriesTitle, { color: colors.text.primary }]}>No groceries yet</Text>
            <Text style={[styles.emptyGroceriesText, { color: colors.text.secondary }]}>
              Add meals to your plan, then generate groceries to get your shopping list
            </Text>
          </View>
        ) : (
          <>
            <Text style={[styles.groceryHint, { color: colors.text.muted }]}>
              💡 Tap to check off • Long press to delete
            </Text>
            {Object.entries(groupedGroceries).map(([category, items]) => (
              <View key={category} style={styles.groceryCategory}>
                <Text style={[styles.groceryCategoryTitle, { color: colors.text.primary }]}>{category}</Text>
                {items.map(item => (
                  <Pressable 
                    key={item.id}
                    style={[styles.groceryItem, { backgroundColor: colors.background.card }]}
                    onPress={() => toggleGroceryItem(item.id)}
                    onLongPress={() => handleDeleteGroceryItem(item)}
                    delayLongPress={400}
                  >
                    <View style={[styles.checkbox, item.checked && styles.checkboxChecked]}>
                      {item.checked && <Ionicons name="checkmark" size={16} color="#fff" />}
                    </View>
                    <Text style={[
                      styles.groceryItemText, 
                      { color: colors.text.primary },
                      item.checked && styles.groceryItemChecked
                    ]}>
                      {item.quantity && item.quantity !== '1' ? `${item.quantity} — ` : ''}{item.name}
                    </Text>
                    <TouchableOpacity 
                      style={styles.groceryDeleteBtn}
                      onPress={() => handleDeleteGroceryItem(item)}
                    >
                      <Ionicons name="close-circle" size={22} color={colors.text.muted} />
                    </TouchableOpacity>
                  </Pressable>
                ))}
              </View>
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  // Render Recipes Tab
  const renderRecipes = () => {
    return (
      <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity 
          style={styles.aiGenerateBtnWithImage}
          onPress={() => setShowRecipeGeneratorModal(true)}
        >
          <ImageBackground
            source={{ uri: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600' }}
            style={styles.aiGenerateBgImage}
            imageStyle={styles.aiGenerateBgImageStyle}
          >
            <View style={styles.aiGenerateOverlay}>
              <MaterialCommunityIcons name="chef-hat" size={28} color="#fff" />
              <Text style={styles.aiGenerateTextLarge}>Generate AI Recipe</Text>
              <Text style={styles.aiGenerateSubtext}>AI-powered recipe creation</Text>
            </View>
          </ImageBackground>
        </TouchableOpacity>

        {loadingRecipes ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={accent.primary} />
          </View>
        ) : recipes.length === 0 ? (
          <View style={styles.emptyRecipes}>
            <MaterialIcons name="menu-book" size={64} color={colors.text.muted} />
            <Text style={[styles.emptyRecipesTitle, { color: colors.text.primary }]}>No recipes yet</Text>
            <Text style={[styles.emptyRecipesText, { color: colors.text.secondary }]}>
              Generate AI recipes to get started
            </Text>
          </View>
        ) : (
          <View style={styles.recipesGrid}>
            {recipes.map(recipe => (
              <Pressable 
                key={recipe.id}
                style={[styles.recipeCard, { backgroundColor: colors.background.card }]}
                onPress={() => {
                  setSelectedRecipe(recipe);
                  setShowRecipeModal(true);
                }}
                onLongPress={() => confirmDeleteRecipe(recipe)}
                delayLongPress={500}
              >
                <Image 
                  source={{ uri: recipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300' }}
                  style={styles.recipeImage}
                  resizeMode="cover"
                />
                <View style={styles.recipeDeleteHint}>
                  <Ionicons name="trash-outline" size={14} color="#fff" />
                </View>
                <View style={styles.recipeInfo}>
                  <Text style={[styles.recipeName, { color: colors.text.primary }]} numberOfLines={2}>
                    {recipe.name}
                  </Text>
                  <Text style={[styles.recipeCalories, { color: colors.text.secondary }]}>
                    {recipe.calories} cal • {recipe.prepTime}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  // Render AI Nutrition Coach Tab
  const renderNutritionCoach = () => {
    const quickPrompts = [
      "How can I reduce my sugar intake?",
      "What's a good pre-workout meal?",
      "Suggest high-protein snacks",
      "Help me balance my macros",
    ];

    return (
      <KeyboardAvoidingView 
        style={styles.coachContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={120}
      >
        {/* Coach Header with Background Image */}
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=600' }}
          style={styles.coachHeaderBg}
          imageStyle={styles.coachHeaderBgImage}
        >
          <View style={styles.coachHeaderOverlay}>
            <View style={styles.coachHeaderLeft}>
              <View style={styles.coachAvatarGlow}>
                <MaterialCommunityIcons name="robot-happy" size={32} color="#fff" />
              </View>
              <View>
                <Text style={styles.coachTitleWhite}>AI Nutrition Coach</Text>
                <Text style={styles.coachSubtitleWhite}>Your personalized diet advisor</Text>
              </View>
            </View>
            {coachMessages.length > 0 && (
              <TouchableOpacity style={styles.clearChatBtnWhite} onPress={clearCoachConversation}>
                <Ionicons name="trash-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </ImageBackground>

        {/* Chat Messages */}
        <ScrollView 
          style={styles.chatMessages}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatMessagesContent}
        >
          {loadingCoachHistory ? (
            <View style={styles.coachLoading}>
              <ActivityIndicator size="large" color={accent.primary} />
            </View>
          ) : coachMessages.length === 0 ? (
            <View style={styles.coachWelcome}>
              <LinearGradient colors={['#10B98120', '#059669 10']} style={styles.welcomeGradient}>
                <MaterialCommunityIcons name="food-apple" size={48} color="#10B981" />
                <Text style={[styles.welcomeTitle, { color: colors.text.primary }]}>
                  Hi! I'm your AI Nutrition Coach 🥗
                </Text>
                <Text style={[styles.welcomeText, { color: colors.text.secondary }]}>
                  I learn from your meal history and eating habits to provide personalized nutrition advice. Ask me anything about diet, macros, meal planning, or healthy eating!
                </Text>
              </LinearGradient>
              
              <Text style={[styles.quickPromptsTitle, { color: colors.text.muted }]}>Try asking:</Text>
              <View style={styles.quickPrompts}>
                {quickPrompts.map((prompt, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.quickPromptBtn, { backgroundColor: colors.background.card }]}
                    onPress={() => {
                      setCoachInput(prompt);
                    }}
                  >
                    <Text style={[styles.quickPromptText, { color: colors.text.primary }]}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            coachMessages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.chatBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                  { backgroundColor: message.role === 'user' ? accent.primary : colors.background.card }
                ]}
              >
                {message.role === 'assistant' && (
                  <View style={styles.assistantIcon}>
                    <MaterialCommunityIcons name="robot-happy" size={16} color="#10B981" />
                  </View>
                )}
                <Text style={[
                  styles.chatText,
                  { color: message.role === 'user' ? '#fff' : colors.text.primary }
                ]}>
                  {message.content}
                </Text>
                <Text style={[
                  styles.chatTime,
                  { color: message.role === 'user' ? 'rgba(255,255,255,0.6)' : colors.text.muted }
                ]}>
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))
          )}
          
          {coachLoading && (
            <View style={[styles.chatBubble, styles.assistantBubble, { backgroundColor: colors.background.card }]}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={[styles.typingText, { color: colors.text.muted }]}>Coach is typing...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input Area */}
        <View style={[styles.chatInputContainer, { backgroundColor: colors.background.card }]}>
          <TextInput
            style={[styles.chatInput, { backgroundColor: colors.background.primary, color: colors.text.primary }]}
            placeholder="Ask about nutrition, diet tips..."
            placeholderTextColor={colors.text.muted}
            value={coachInput}
            onChangeText={setCoachInput}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: coachInput.trim() ? '#10B981' : colors.text.muted }]}
            onPress={sendCoachMessage}
            disabled={!coachInput.trim() || coachLoading}
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  // Render Meal Form (shared between create and edit)
  const renderMealForm = (isEdit: boolean) => (
    <ScrollView style={styles.modalBody}>
      <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Meal Name *</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.primary }]}
        placeholder="e.g., Grilled Chicken Salad"
        placeholderTextColor={colors.text.muted}
        value={newMeal.name}
        onChangeText={(t) => setNewMeal(prev => ({ ...prev, name: t }))}
      />

      <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Category</Text>
      <View style={styles.categoryPicker}>
        {MEAL_CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat.value}
            style={[
              styles.categoryOption,
              { borderColor: cat.color },
              newMeal.category === cat.value && { backgroundColor: `${cat.color}20` }
            ]}
            onPress={() => setNewMeal(prev => ({ ...prev, category: cat.value }))}
          >
            <Text>{cat.icon}</Text>
            <Text style={[styles.categoryOptionText, { color: colors.text.primary }]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Nutrition Info</Text>
      <View style={styles.nutritionGrid}>
        <View style={styles.nutritionInput}>
          <Text style={[styles.nutritionLabel, { color: colors.text.muted }]}>Calories *</Text>
          <TextInput
            style={[styles.smallInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            value={newMeal.calories}
            onChangeText={(t) => setNewMeal(prev => ({ ...prev, calories: t }))}
          />
        </View>
        <View style={styles.nutritionInput}>
          <Text style={[styles.nutritionLabel, { color: colors.text.muted }]}>Protein (g)</Text>
          <TextInput
            style={[styles.smallInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            value={newMeal.protein}
            onChangeText={(t) => setNewMeal(prev => ({ ...prev, protein: t }))}
          />
        </View>
        <View style={styles.nutritionInput}>
          <Text style={[styles.nutritionLabel, { color: colors.text.muted }]}>Carbs (g)</Text>
          <TextInput
            style={[styles.smallInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            value={newMeal.carbs}
            onChangeText={(t) => setNewMeal(prev => ({ ...prev, carbs: t }))}
          />
        </View>
        <View style={styles.nutritionInput}>
          <Text style={[styles.nutritionLabel, { color: colors.text.muted }]}>Fat (g)</Text>
          <TextInput
            style={[styles.smallInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            value={newMeal.fat}
            onChangeText={(t) => setNewMeal(prev => ({ ...prev, fat: t }))}
          />
        </View>
        <View style={styles.nutritionInput}>
          <Text style={[styles.nutritionLabel, { color: colors.text.muted }]}>Sugar (g)</Text>
          <TextInput
            style={[styles.smallInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            value={newMeal.sugar}
            onChangeText={(t) => setNewMeal(prev => ({ ...prev, sugar: t }))}
          />
        </View>
        <View style={styles.nutritionInput}>
          <Text style={[styles.nutritionLabel, { color: colors.text.muted }]}>Fiber (g)</Text>
          <TextInput
            style={[styles.smallInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            keyboardType="numeric"
            value={newMeal.fiber}
            onChangeText={(t) => setNewMeal(prev => ({ ...prev, fiber: t }))}
          />
        </View>
      </View>

      <TouchableOpacity 
        style={[styles.createBtn, { backgroundColor: accent.primary }]}
        onPress={isEdit ? handleUpdateMeal : handleCreateMeal}
      >
        <Text style={styles.createBtnText}>{isEdit ? 'Update Meal' : 'Add to Meal Plan'}</Text>
      </TouchableOpacity>

      {isEdit && (
        <TouchableOpacity 
          style={[styles.deleteBtn, { borderColor: '#EF4444' }]}
          onPress={() => {
            if (editingMeal) {
              handleDeleteMeal(editingMeal.id);
              setShowEditMealModal(false);
              setEditingMeal(null);
              resetMealForm();
            }
          }}
        >
          <Ionicons name="trash" size={18} color="#EF4444" />
          <Text style={styles.deleteBtnText}>Delete Meal</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  // If not premium, show upgrade prompt
  if (!isPremium) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.premiumGateContainer}>
          <View style={styles.premiumGateContent}>
            <View style={styles.premiumIconCircle}>
              <Ionicons name="diamond" size={48} color="#8B5CF6" />
            </View>
            <Text style={[styles.premiumGateTitle, { color: colors.text.primary }]}>
              FitTrax+ Premium Feature
            </Text>
            <Text style={[styles.premiumGateSubtitle, { color: colors.text.secondary }]}>
              Meals, Meal Planning, AI Recipes, Groceries, and Nutrition Coach are premium features.
            </Text>
            <Text style={[styles.premiumGateFeatures, { color: colors.text.muted }]}>
              Upgrade to unlock:
            </Text>
            <View style={styles.premiumFeatureList}>
              <Text style={[styles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ AI Food Scanner & Analysis</Text>
              <Text style={[styles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ Custom Meal Planning</Text>
              <Text style={[styles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ AI Recipe Generator</Text>
              <Text style={[styles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ Smart Grocery Lists</Text>
              <Text style={[styles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ AI Nutrition Coach</Text>
            </View>
            <TouchableOpacity 
              style={[styles.premiumUpgradeBtn, { backgroundColor: '#8B5CF6' }]}
              onPress={() => router.push('/membership')}
            >
              <Ionicons name="diamond" size={20} color="#fff" />
              <Text style={styles.premiumUpgradeBtnText}>Upgrade to Premium</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.premiumLearnMore}
              onPress={() => router.push('/membership')}
            >
              <Text style={[styles.premiumLearnMoreText, { color: accent.primary }]}>Learn more about Premium</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Meals</Text>
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.background.card }]}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && { backgroundColor: accent.primary }]}
            onPress={() => setActiveTab(tab.id)}
          >
            <MaterialIcons 
              name={tab.icon as any} 
              size={20} 
              color={activeTab === tab.id ? '#fff' : colors.text.muted} 
            />
            <Text style={[
              styles.tabLabel,
              { color: activeTab === tab.id ? '#fff' : colors.text.muted }
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === 'planner' && renderMealPlanner()}
      {activeTab === 'groceries' && renderGroceries()}
      {activeTab === 'recipes' && renderRecipes()}
      {activeTab === 'coach' && renderNutritionCoach()}

      {/* Category Picker Modal (for scanning) */}
      <Modal visible={showCategoryPicker} animationType="fade" transparent>
        <View style={styles.categoryPickerOverlay}>
          <View style={[styles.categoryPickerContent, { backgroundColor: colors.background.primary }]}>
            <Text style={[styles.categoryPickerTitle, { color: colors.text.primary }]}>Select Meal Type</Text>
            {MEAL_CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.value}
                style={[styles.categoryPickerItem, { backgroundColor: colors.background.card }]}
                onPress={() => startScan(cat.value)}
              >
                <Text style={styles.categoryPickerIcon}>{cat.icon}</Text>
                <Text style={[styles.categoryPickerLabel, { color: colors.text.primary }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity 
              style={styles.categoryPickerCancel}
              onPress={() => setShowCategoryPicker(false)}
            >
              <Text style={[styles.categoryPickerCancelText, { color: colors.text.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scan Options Modal */}
      <Modal visible={showScanModal} animationType="slide" transparent>
        <View style={styles.scanModalOverlay}>
          <View style={[styles.scanModalContent, { backgroundColor: colors.background.primary }]}>
            <View style={styles.scanModalHeader}>
              <Text style={[styles.scanModalTitle, { color: colors.text.primary }]}>
                Scan {MEAL_CATEGORIES.find(c => c.value === mealCategory)?.label}
              </Text>
              <TouchableOpacity onPress={() => setShowScanModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity 
              style={[styles.scanOptionBtn, { backgroundColor: accent.primary }]}
              onPress={takePicture}
            >
              <Ionicons name="camera" size={28} color="#fff" />
              <Text style={styles.scanOptionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.scanOptionBtn, { backgroundColor: colors.background.card }]}
              onPress={pickImage}
            >
              <Ionicons name="images" size={28} color={accent.primary} />
              <Text style={[styles.scanOptionText, { color: colors.text.primary }]}>Choose from Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create Meal Modal */}
      <Modal visible={showCreateMealModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.primary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Create Meal</Text>
              <TouchableOpacity onPress={() => { setShowCreateMealModal(false); resetMealForm(); }}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {renderMealForm(false)}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Meal Modal */}
      <Modal visible={showEditMealModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.background.primary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Edit Meal</Text>
              <TouchableOpacity onPress={() => { setShowEditMealModal(false); setEditingMeal(null); resetMealForm(); }}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            {renderMealForm(true)}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Grocery Modal */}
      <Modal visible={showAddGroceryModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.smallModalContent, { backgroundColor: colors.background.primary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Add Grocery Item</Text>
              <TouchableOpacity onPress={() => setShowAddGroceryModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.primary }]}
              placeholder="Item name"
              placeholderTextColor={colors.text.muted}
              value={newGroceryItem.name}
              onChangeText={(t) => setNewGroceryItem(prev => ({ ...prev, name: t }))}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background.card, color: colors.text.primary }]}
              placeholder="Quantity (e.g., 2 lbs, 1 dozen)"
              placeholderTextColor={colors.text.muted}
              value={newGroceryItem.quantity}
              onChangeText={(t) => setNewGroceryItem(prev => ({ ...prev, quantity: t }))}
            />
            
            <TouchableOpacity 
              style={[styles.createBtn, { backgroundColor: accent.primary }]}
              onPress={handleAddGroceryItem}
            >
              <Text style={styles.createBtnText}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Recipe Generator Modal */}
      <Modal visible={showRecipeGeneratorModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.smallModalContent, { backgroundColor: colors.background.primary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>AI Recipe Generator</Text>
              <TouchableOpacity onPress={() => setShowRecipeGeneratorModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.recipePromptLabel, { color: colors.text.secondary }]}>
              Describe what you want to cook:
            </Text>
            <TextInput
              style={[styles.recipePromptInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
              placeholder="e.g., High protein chicken dinner under 500 calories"
              placeholderTextColor={colors.text.muted}
              value={recipePrompt}
              onChangeText={setRecipePrompt}
              multiline
            />
            
            <TouchableOpacity 
              style={[styles.createBtn, { backgroundColor: accent.primary }]}
              onPress={generateRecipe}
              disabled={generatingRecipe}
            >
              {generatingRecipe ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createBtnText}>Generate Recipe</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Recipe Detail Modal */}
      <Modal visible={showRecipeModal} animationType="slide">
        <SafeAreaView style={[styles.recipeModalContainer, { backgroundColor: colors.background.primary }]}>
          <ScrollView>
            {selectedRecipe && (
              <>
                <Image 
                  source={{ uri: selectedRecipe.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600' }}
                  style={styles.recipeDetailImage}
                  resizeMode="cover"
                />
                <TouchableOpacity 
                  style={styles.closeRecipeBtn}
                  onPress={() => setShowRecipeModal(false)}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
                
                <View style={styles.recipeDetailContent}>
                  <Text style={[styles.recipeDetailName, { color: colors.text.primary }]}>{selectedRecipe.name}</Text>
                  
                  <View style={styles.recipeNutritionRow}>
                    <View style={styles.recipeNutritionItem}>
                      <Text style={styles.recipeNutritionValue}>{selectedRecipe.calories}</Text>
                      <Text style={styles.recipeNutritionLabel}>Calories</Text>
                    </View>
                    <View style={styles.recipeNutritionItem}>
                      <Text style={styles.recipeNutritionValue}>{selectedRecipe.protein}g</Text>
                      <Text style={styles.recipeNutritionLabel}>Protein</Text>
                    </View>
                    <View style={styles.recipeNutritionItem}>
                      <Text style={styles.recipeNutritionValue}>{selectedRecipe.carbs}g</Text>
                      <Text style={styles.recipeNutritionLabel}>Carbs</Text>
                    </View>
                    <View style={styles.recipeNutritionItem}>
                      <Text style={styles.recipeNutritionValue}>{selectedRecipe.fat}g</Text>
                      <Text style={styles.recipeNutritionLabel}>Fat</Text>
                    </View>
                  </View>

                  <Text style={[styles.recipeDetailPrepTime, { color: colors.text.secondary }]}>
                    ⏱️ {selectedRecipe.prepTime}
                  </Text>

                  <Text style={[styles.recipeSectionTitle, { color: colors.text.primary }]}>Ingredients</Text>
                  {selectedRecipe.ingredients?.map((ing, i) => (
                    <Text key={i} style={[styles.ingredientItem, { color: colors.text.secondary }]}>• {ing}</Text>
                  ))}

                  <Text style={[styles.recipeSectionTitle, { color: colors.text.primary }]}>Instructions</Text>
                  {selectedRecipe.instructions?.map((step, i) => (
                    <View key={i} style={styles.instructionItem}>
                      <View style={styles.instructionNumber}>
                        <Text style={styles.instructionNumberText}>{i + 1}</Text>
                      </View>
                      <Text style={[styles.instructionText, { color: colors.text.secondary }]}>{step}</Text>
                    </View>
                  ))}

                  <View style={styles.recipeActions}>
                    <TouchableOpacity 
                      style={[styles.addToPlanBtn, { backgroundColor: accent.primary }]}
                      onPress={() => addRecipeToMealPlan(selectedRecipe)}
                    >
                      <Ionicons name="add-circle" size={20} color="#fff" />
                      <Text style={styles.addToPlanBtnText}>Add to Meal Plan</Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={[styles.cookRecipeBtn, { backgroundColor: '#10B981' }]}
                      onPress={() => cookFromRecipe(selectedRecipe)}
                    >
                      <MaterialCommunityIcons name="pot-steam" size={20} color="#fff" />
                      <Text style={styles.cookRecipeBtnText}>Cook & Log Now</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  
  tabBar: { flexDirection: 'row', marginHorizontal: 16, borderRadius: 12, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 6 },
  tabLabel: { fontSize: 12, fontWeight: '600' },
  
  tabContent: { flex: 1, padding: 16 },
  
  dateHeader: { marginBottom: 12 },
  dateTitle: { fontSize: 18, fontWeight: '700' },
  
  // Date Navigation
  dateNavHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 16, marginBottom: 16 },
  dateNavBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 22 },
  dateNavBtnDisabled: { opacity: 0.3 },
  dateNavCenter: { flex: 1, alignItems: 'center' },
  dateNavTitle: { fontSize: 20, fontWeight: '700' },
  dateNavSubtitle: { fontSize: 13, marginTop: 2 },
  tapToReturn: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  
  // Nutrition Tracker
  nutritionTracker: { padding: 16, borderRadius: 16, marginBottom: 16 },
  trackerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  calorieRow: { marginBottom: 16 },
  calorieInfo: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  calorieValue: { fontSize: 32, fontWeight: '800' },
  calorieLabel: { fontSize: 14, marginLeft: 8 },
  calorieBar: { height: 8, backgroundColor: 'rgba(128,128,128,0.2)', borderRadius: 4, overflow: 'hidden' },
  calorieProgress: { height: '100%', borderRadius: 4 },
  macrosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  macroItem: { width: '48%' },
  macroHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  macroLabel: { fontSize: 13 },
  macroValue: { fontSize: 14, fontWeight: '700' },
  macroBar: { height: 6, backgroundColor: 'rgba(128,128,128,0.2)', borderRadius: 3, overflow: 'hidden' },
  macroProgress: { height: '100%', borderRadius: 3 },
  
  // Quick Actions
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  quickActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  quickActionText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  
  // Scan Result
  scanResultCard: { borderRadius: 16, overflow: 'hidden', marginBottom: 16 },
  scanImage: { width: '100%', height: 180 },
  analyzingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  analyzingText: { color: '#fff', marginTop: 8, fontSize: 16 },
  scanResultContent: { padding: 16 },
  foodName: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  scanMacroRow: { flexDirection: 'row', justifyContent: 'space-around' },
  scanMacroItem: { alignItems: 'center' },
  scanMacroValue: { fontSize: 18, fontWeight: '700', color: '#7C3AED' },
  scanMacroLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  resetBtn: { alignSelf: 'center', marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#EF444420', borderRadius: 20 },
  resetBtnText: { color: '#EF4444', fontWeight: '600' },
  
  // Meal Category
  mealCategorySection: { marginBottom: 16 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  categoryIcon: { fontSize: 20, marginRight: 8 },
  categoryTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  addMealBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  
  emptyMealCard: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  emptyMealText: { fontSize: 14 },
  
  mealCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  mealCardCooked: { opacity: 0.7 },
  mealCardContent: { flex: 1 },
  mealName: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  mealCalories: { fontSize: 13 },
  mealSugar: { fontSize: 12, marginTop: 2 },
  mealActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  cookBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  cookedBadge: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  deleteMealBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 16, backgroundColor: 'rgba(239, 68, 68, 0.1)' },
  
  hintText: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  
  // Category Picker Modal
  categoryPickerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  categoryPickerContent: { width: '80%', borderRadius: 20, padding: 20 },
  categoryPickerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  categoryPickerItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  categoryPickerIcon: { fontSize: 24, marginRight: 12 },
  categoryPickerLabel: { fontSize: 16, fontWeight: '600' },
  categoryPickerCancel: { alignItems: 'center', paddingVertical: 12 },
  categoryPickerCancelText: { fontSize: 16 },
  
  // Scan Modal
  scanModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  scanModalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  scanModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  scanModalTitle: { fontSize: 20, fontWeight: '700' },
  scanOptionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 20, borderRadius: 16, marginBottom: 12, gap: 12 },
  scanOptionText: { fontSize: 17, fontWeight: '600', color: '#fff' },
  
  // Groceries
  groceryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  groceryTitle: { fontSize: 20, fontWeight: '700' },
  groceryActions: { flexDirection: 'row', gap: 8 },
  groceryActionBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  
  aiGenerateBtn: { marginBottom: 20, borderRadius: 12, overflow: 'hidden' },
  aiGenerateGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 10 },
  aiGenerateText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  
  aiGenerateBtnWithImage: { marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
  aiGenerateBgImage: { height: 100, justifyContent: 'center' },
  aiGenerateBgImageStyle: { borderRadius: 16 },
  aiGenerateOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 20 },
  aiGenerateTextLarge: { color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 6 },
  aiGenerateSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  
  emptyGroceries: { alignItems: 'center', paddingVertical: 40 },
  emptyGroceriesTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyGroceriesText: { fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  
  groceryCategory: { marginBottom: 16 },
  groceryCategoryTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  groceryItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, marginBottom: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#7C3AED', marginRight: 12, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#7C3AED' },
  groceryItemContent: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  groceryItemQty: { fontSize: 15, fontWeight: '700', minWidth: 50 },
  groceryItemDash: { fontSize: 15, marginHorizontal: 8 },
  groceryItemText: { fontSize: 15, flex: 1 },
  groceryItemChecked: { textDecorationLine: 'line-through', opacity: 0.5 },
  groceryDeleteBtn: { padding: 4, marginLeft: 8 },
  groceryHint: { fontSize: 12, textAlign: 'center', marginBottom: 12 },
  
  // Recipes
  loadingContainer: { paddingVertical: 40, alignItems: 'center' },
  emptyRecipes: { alignItems: 'center', paddingVertical: 40 },
  emptyRecipesTitle: { fontSize: 18, fontWeight: '700', marginTop: 16 },
  emptyRecipesText: { fontSize: 14, marginTop: 8, textAlign: 'center' },
  
  recipesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  recipeCard: { width: (SCREEN_WIDTH - 44) / 2, borderRadius: 12, overflow: 'hidden' },
  recipeImage: { width: '100%', height: 120 },
  recipeDeleteHint: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  recipeInfo: { padding: 12 },
  recipeName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  recipeCalories: { fontSize: 12 },
  
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  smallModalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  modalBody: { maxHeight: 500 },
  
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  input: { borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 8 },
  
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryOption: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, gap: 6 },
  categoryOptionText: { fontSize: 13, fontWeight: '500' },
  
  nutritionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nutritionInput: { width: '31%' },
  nutritionLabel: { fontSize: 11, marginBottom: 4 },
  smallInput: { borderRadius: 8, padding: 10, fontSize: 14, textAlign: 'center' },
  
  createBtn: { marginTop: 20, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  
  deleteBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  deleteBtnText: { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  
  recipePromptLabel: { fontSize: 14, marginBottom: 12 },
  recipePromptInput: { borderRadius: 12, padding: 14, fontSize: 16, height: 100, textAlignVertical: 'top' },
  
  // Recipe Modal
  recipeModalContainer: { flex: 1 },
  recipeDetailImage: { width: '100%', height: 250 },
  closeRecipeBtn: { position: 'absolute', top: 50, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  recipeDetailContent: { padding: 20 },
  recipeDetailName: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  recipeNutritionRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16, paddingVertical: 16, backgroundColor: 'rgba(124,58,237,0.1)', borderRadius: 12 },
  recipeNutritionItem: { alignItems: 'center' },
  recipeNutritionValue: { fontSize: 20, fontWeight: '700', color: '#7C3AED' },
  recipeNutritionLabel: { fontSize: 12, color: '#888', marginTop: 4 },
  recipeDetailPrepTime: { fontSize: 14, marginBottom: 20 },
  recipeSectionTitle: { fontSize: 18, fontWeight: '700', marginTop: 20, marginBottom: 12 },
  ingredientItem: { fontSize: 15, marginBottom: 6, lineHeight: 22 },
  instructionItem: { flexDirection: 'row', marginBottom: 16 },
  instructionNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#7C3AED', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  instructionNumberText: { color: '#fff', fontWeight: '700' },
  instructionText: { flex: 1, fontSize: 15, lineHeight: 22 },
  recipeActions: { gap: 12, marginTop: 20 },
  addToPlanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 8 },
  addToPlanBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cookRecipeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 8 },
  cookRecipeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  
  // AI Nutrition Coach Styles
  coachContainer: { flex: 1 },
  coachHeaderBg: { margin: 16, marginBottom: 0, borderRadius: 16, overflow: 'hidden' },
  coachHeaderBgImage: { borderRadius: 16 },
  coachHeaderOverlay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  coachHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 16, margin: 16, marginBottom: 0 },
  coachHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  coachAvatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  coachAvatarGlow: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.8)' },
  coachTitle: { fontSize: 18, fontWeight: '700' },
  coachTitleWhite: { fontSize: 18, fontWeight: '700', color: '#fff' },
  coachSubtitle: { fontSize: 13 },
  coachSubtitleWhite: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  clearChatBtn: { padding: 8 },
  clearChatBtnWhite: { padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.3)', borderRadius: 20 },
  
  chatMessages: { flex: 1, padding: 16 },
  chatMessagesContent: { paddingBottom: 100 },
  coachLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100 },
  
  coachWelcome: { alignItems: 'center', paddingTop: 20 },
  welcomeGradient: { width: '100%', alignItems: 'center', padding: 24, borderRadius: 16 },
  welcomeTitle: { fontSize: 20, fontWeight: '700', marginTop: 16, textAlign: 'center' },
  welcomeText: { fontSize: 14, marginTop: 12, textAlign: 'center', lineHeight: 20 },
  
  quickPromptsTitle: { fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 12 },
  quickPrompts: { width: '100%', gap: 8 },
  quickPromptBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 20 },
  quickPromptText: { fontSize: 14, textAlign: 'center' },
  
  chatBubble: { maxWidth: '80%', padding: 14, borderRadius: 16, marginBottom: 12 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  assistantIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#10B98120', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  chatText: { fontSize: 15, lineHeight: 22 },
  chatTime: { fontSize: 11, marginTop: 6, opacity: 0.7 },
  typingText: { fontSize: 14, marginLeft: 8 },
  
  chatInputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', gap: 10 },
  chatInput: { flex: 1, minHeight: 44, maxHeight: 80, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },

  // Premium Gate Styles
  premiumGateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  premiumGateContent: { alignItems: 'center', maxWidth: 340 },
  premiumIconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(139, 92, 246, 0.15)', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  premiumGateTitle: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  premiumGateSubtitle: { fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  premiumGateFeatures: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  premiumFeatureList: { alignSelf: 'stretch', marginBottom: 24 },
  premiumFeatureItem: { fontSize: 15, marginBottom: 8, paddingLeft: 8 },
  premiumUpgradeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16, gap: 10, width: '100%' },
  premiumUpgradeBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  premiumLearnMore: { marginTop: 16, padding: 8 },
  premiumLearnMoreText: { fontSize: 15, fontWeight: '600' },
});

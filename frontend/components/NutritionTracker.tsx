import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores/themeStore';
import { router } from 'expo-router';

interface NutritionTrackerProps {
  todayData: {
    calories_consumed?: number;
    calories_goal?: number;
    sugar_consumed?: number;
    sugar_goal?: number;
    protein_consumed?: number;
    protein_goal?: number;
    carbs_consumed?: number;
    carbs_goal?: number;
    fat_consumed?: number;
    fat_goal?: number;
  };
}

export function NutritionTracker({ todayData }: NutritionTrackerProps) {
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;

  const caloriesProgress = Math.min(((todayData.calories_consumed || 0) / (todayData.calories_goal || 2000)) * 100, 100);
  const sugarProgress = Math.min(((todayData.sugar_consumed || 0) / (todayData.sugar_goal || 50)) * 100, 100);

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: colors.background.card }]}
      onPress={() => router.push('/nutrition-details')}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="nutrition" size={20} color={accent.primary} />
          <Text style={[styles.title, { color: colors.text.primary }]}>Nutrition Tracker</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.viewAllText, { color: accent.primary }]}>View Details</Text>
          <Ionicons name="chevron-forward" size={16} color={accent.primary} />
        </View>
      </View>

      <View style={styles.nutritionGrid}>
        {/* Calories */}
        <View style={styles.nutritionItem}>
          <View style={styles.nutritionHeader}>
            <Text style={[styles.nutritionLabel, { color: colors.text.secondary }]}>Calories</Text>
            <Text style={[styles.nutritionValue, { color: colors.text.primary }]}>
              {Math.round(todayData.calories_consumed || 0)} / {todayData.calories_goal || 2000}
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.background.elevated }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${caloriesProgress}%`,
                  backgroundColor: caloriesProgress > 100 ? '#EF4444' : accent.primary
                }
              ]} 
            />
          </View>
        </View>

        {/* Sugar */}
        <View style={styles.nutritionItem}>
          <View style={styles.nutritionHeader}>
            <Text style={[styles.nutritionLabel, { color: colors.text.secondary }]}>Sugar</Text>
            <Text style={[styles.nutritionValue, { color: colors.text.primary }]}>
              {Math.round(todayData.sugar_consumed || 0)}g / {todayData.sugar_goal || 50}g
            </Text>
          </View>
          <View style={[styles.progressBar, { backgroundColor: colors.background.elevated }]}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${sugarProgress}%`,
                  backgroundColor: sugarProgress > 100 ? '#EF4444' : '#F59E0B'
                }
              ]} 
            />
          </View>
        </View>

        {/* Macros Row */}
        <View style={styles.macrosRow}>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: '#22C55E' }]}>
              {Math.round(todayData.protein_consumed || 0)}g
            </Text>
            <Text style={[styles.macroLabel, { color: colors.text.muted }]}>Protein</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: '#3B82F6' }]}>
              {Math.round(todayData.carbs_consumed || 0)}g
            </Text>
            <Text style={[styles.macroLabel, { color: colors.text.muted }]}>Carbs</Text>
          </View>
          <View style={styles.macroItem}>
            <Text style={[styles.macroValue, { color: '#F59E0B' }]}>
              {Math.round(todayData.fat_consumed || 0)}g
            </Text>
            <Text style={[styles.macroLabel, { color: colors.text.muted }]}>Fat</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nutritionGrid: {
    gap: 16,
  },
  nutritionItem: {
    gap: 8,
  },
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nutritionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  nutritionValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  macrosRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  macroItem: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  macroLabel: {
    fontSize: 12,
    marginTop: 2,
  },
});
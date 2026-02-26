import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../stores/themeStore';
import { router } from 'expo-router';

export default function NutritionDetailsScreen() {
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={[styles.headerBar, { borderBottomColor: colors.border.primary }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={28} color={accent.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Nutrition Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={[styles.card, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            Detailed Nutrition Tracking
          </Text>
          <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
            This page will show detailed nutrition information including macros, micronutrients, 
            meal history, and nutrition goals. Currently under development.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
            Coming Soon
          </Text>
          <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
            • Detailed macro breakdown{'\n'}
            • Micronutrient tracking{'\n'}
            • Meal history and trends{'\n'}
            • Custom nutrition goals{'\n'}
            • Food diary and notes
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 16,
    lineHeight: 22,
  },
});

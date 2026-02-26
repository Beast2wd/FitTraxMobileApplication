import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { router } from 'expo-router';

// Feature images mapping
const FEATURE_IMAGES: { [key: string]: string } = {
  'AI Food Scanner & Analysis': 'https://images.unsplash.com/photo-1581090124355-6c1376cf3047?w=100&h=100&fit=crop',
  'AI Body Composition Scan': 'https://images.unsplash.com/photo-1767556030465-c4f92dcfa8c7?w=100&h=100&fit=crop',
  'AI-Personalized Workouts': 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=100&h=100&fit=crop',
  'AI Nutrition Coach': 'https://images.unsplash.com/photo-1603808326448-ff7a2d980272?w=100&h=100&fit=crop',
  'AI Recipe Generator': 'https://images.unsplash.com/photo-1591951314140-7b6eef23edf0?w=100&h=100&fit=crop',
  'AI Groceries Planner': 'https://images.unsplash.com/photo-1628102491629-778571d893a3?w=100&h=100&fit=crop',
  'Custom Meal Planning & Nutrition': 'https://images.unsplash.com/photo-1569420077790-afb136b3bb8c?w=100&h=100&fit=crop',
  'Gamification: Badges & Challenges': 'https://images.unsplash.com/photo-1730692504752-c411cf0306ac?w=100&h=100&fit=crop',
  'Advanced Progress Analytics': 'https://images.unsplash.com/photo-1666875753105-c63a6f3bdc86?w=100&h=100&fit=crop',
  'Wearable Device Integration': 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=100&h=100&fit=crop',
  'Diverse Workout Library (Yoga, HIIT, Dance, Martial Arts)': 'https://images.unsplash.com/photo-1645238426817-8c3e7d1396cf?w=100&h=100&fit=crop',
  'Peptide Calculator, Tracking and FitTrax Peptide AI': 'https://images.unsplash.com/photo-1686009799252-a050bc211cea?w=100&h=100&fit=crop',
  'Multi-Language Support (EN, ES, DE)': 'https://images.unsplash.com/photo-1758272133392-b5bbce307e0b?w=100&h=100&fit=crop',
  'Accessibility Features': 'https://images.unsplash.com/photo-1634947096506-6d9f114cf64e?w=100&h=100&fit=crop',
};

// Premium features list
const PREMIUM_FEATURES = [
  'AI Food Scanner & Analysis',
  'AI Body Composition Scan',
  'AI-Personalized Workouts',
  'AI Nutrition Coach',
  'AI Recipe Generator',
  'AI Groceries Planner',
  'Custom Meal Planning & Nutrition',
  'Gamification: Badges & Challenges',
  'Advanced Progress Analytics',
  'Wearable Device Integration',
  'Diverse Workout Library (Yoga, HIIT, Dance, Martial Arts)',
  'Peptide Calculator, Tracking and FitTrax Peptide AI',
  'Multi-Language Support (EN, ES, DE)',
  'Accessibility Features',
];

export default function MembershipScreen() {
  const { userId, profile } = useUserStore();
  const { theme } = useThemeStore();
  const [loading, setLoading] = useState(false);

  const colors = theme.colors;
  const accent = theme.accentColors;

  const handleSubscribe = () => {
    Alert.alert(
      'Coming Soon!',
      'In-App Purchases will be available soon through the App Store. Stay tuned for premium features!',
      [{ text: 'OK' }]
    );
  };

  const handleNotifyMe = () => {
    Alert.alert(
      'We\'ll Notify You!',
      'You\'ll be notified when Premium subscriptions become available. Thank you for your interest!',
      [{ text: 'Great!' }]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Back Button Header */}
      <View style={styles.backHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.backHeaderTitle, { color: colors.text.primary }]}>Premium</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <LinearGradient
            colors={accent.gradient as [string, string]}
            style={styles.headerGradient}
          >
            <Ionicons name="diamond" size={48} color="#fff" />
            <Text style={styles.headerTitle}>FitTrax+ Premium</Text>
            <Text style={styles.headerSubtitle}>Unlock your full potential</Text>
          </LinearGradient>
        </View>

        {/* Coming Soon Card */}
        <View style={[styles.comingSoonCard, { backgroundColor: colors.background.card }]}>
          <View style={[styles.comingSoonBadge, { backgroundColor: `${accent.primary}20` }]}>
            <Ionicons name="time-outline" size={20} color={accent.primary} />
            <Text style={[styles.comingSoonBadgeText, { color: accent.primary }]}>
              Coming Soon
            </Text>
          </View>
          
          <Text style={[styles.comingSoonTitle, { color: colors.text.primary }]}>
            Premium Subscriptions
          </Text>
          <Text style={[styles.comingSoonDescription, { color: colors.text.secondary }]}>
            We're working on bringing you an amazing premium experience with In-App Purchases. 
            All premium features will be available soon!
          </Text>

          {/* Pricing Preview */}
          <View style={[styles.pricingPreview, { borderColor: colors.border.secondary }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceAmount, { color: colors.text.primary }]}>$29.99</Text>
              <Text style={[styles.priceInterval, { color: colors.text.muted }]}>/year</Text>
            </View>
            <Text style={[styles.pricingNote, { color: colors.text.secondary }]}>
              Includes 3-day free trial
            </Text>
          </View>
        </View>

        {/* Features List */}
        <View style={[styles.featuresCard, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.featuresTitle, { color: colors.text.primary }]}>
            Premium Features Preview
          </Text>
          {PREMIUM_FEATURES.map((feature: string, index: number) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureImageContainer}>
                <Image 
                  source={{ uri: FEATURE_IMAGES[feature] || `https://images.unsplash.com/photo-1581090124355-6c1376cf3047?w=100&h=100&fit=crop` }} 
                  style={styles.featureImage}
                  resizeMode="cover"
                />
              </View>
              <Text style={[styles.featureText, { color: colors.text.primary }]}>
                {feature}
              </Text>
              <Ionicons name="lock-closed" size={16} color={colors.text.muted} />
            </View>
          ))}
        </View>

        {/* Notify Me Button */}
        <TouchableOpacity 
          style={styles.subscribeButton}
          onPress={handleNotifyMe}
        >
          <LinearGradient
            colors={accent.gradient as [string, string]}
            style={styles.subscribeGradient}
          >
            <Ionicons name="notifications" size={24} color="#fff" />
            <Text style={styles.subscribeText}>
              Notify Me When Available
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.text.muted }]}>
          Premium subscriptions will be available through the App Store with secure In-App Purchases. 
          Cancel anytime.
        </Text>

        {/* Free Features Note */}
        <View style={[styles.freeNoteCard, { backgroundColor: colors.background.card }]}>
          <Ionicons name="checkmark-circle" size={24} color="#10B981" />
          <View style={styles.freeNoteContent}>
            <Text style={[styles.freeNoteTitle, { color: colors.text.primary }]}>
              Enjoy Free Features Now!
            </Text>
            <Text style={[styles.freeNoteText, { color: colors.text.secondary }]}>
              Track workouts, log meals, monitor hydration, and more - all available for free!
            </Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backHeader: {
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
  backHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerGradient: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 16,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  comingSoonCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
    marginBottom: 16,
  },
  comingSoonBadgeText: {
    fontWeight: '700',
    fontSize: 14,
  },
  comingSoonTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  comingSoonDescription: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  pricingPreview: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '100%',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 36,
    fontWeight: '800',
  },
  priceInterval: {
    fontSize: 16,
    marginLeft: 4,
  },
  pricingNote: {
    fontSize: 13,
    marginTop: 4,
  },
  featuresCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  featureImageContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
  },
  featureImage: {
    width: 44,
    height: 44,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  subscribeButton: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  subscribeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  subscribeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    paddingHorizontal: 20,
    lineHeight: 18,
  },
  freeNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  freeNoteContent: {
    flex: 1,
  },
  freeNoteTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  freeNoteText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

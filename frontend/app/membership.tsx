import React, { useState } from 'react';
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
  const [selectedPlan, setSelectedPlan] = useState<'yearly' | 'monthly'>('yearly');

  const colors = theme.colors;
  const accent = theme.accentColors;

  const handleSubscribe = () => {
    const planText = selectedPlan === 'yearly' ? '$39.99/year' : '$3.99/month';
    Alert.alert(
      'Start Free Trial',
      `You selected the ${selectedPlan} plan (${planText}).\n\nYour 3-day free trial will begin. You won't be charged until the trial ends.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Start Trial', 
          onPress: () => {
            Alert.alert(
              'Trial Started!',
              'Your 3-day free trial has begun. Enjoy all premium features!',
              [{ text: 'Great!' }]
            );
          }
        }
      ]
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

        {/* Pricing Options */}
        <View style={[styles.pricingCard, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.pricingTitle, { color: colors.text.primary }]}>
            Choose Your Plan
          </Text>
          
          {/* Yearly Plan */}
          <TouchableOpacity 
            style={[
              styles.planOption,
              { 
                backgroundColor: colors.background.input,
                borderColor: selectedPlan === 'yearly' ? accent.primary : colors.border.primary,
                borderWidth: selectedPlan === 'yearly' ? 2 : 1,
              }
            ]}
            onPress={() => setSelectedPlan('yearly')}
            activeOpacity={0.7}
          >
            <View style={styles.planLeft}>
              <View style={[
                styles.planRadio,
                { borderColor: selectedPlan === 'yearly' ? accent.primary : colors.border.secondary }
              ]}>
                {selectedPlan === 'yearly' && (
                  <View style={[styles.planRadioInner, { backgroundColor: accent.primary }]} />
                )}
              </View>
              <View>
                <Text style={[styles.planName, { color: colors.text.primary }]}>Yearly</Text>
                <Text style={[styles.planSavings, { color: '#10B981' }]}>Save 17%</Text>
              </View>
            </View>
            <View style={styles.planRight}>
              <Text style={[styles.planPrice, { color: colors.text.primary }]}>$39.99</Text>
              <Text style={[styles.planInterval, { color: colors.text.muted }]}>/year</Text>
            </View>
            {selectedPlan === 'yearly' && (
              <View style={[styles.bestValueBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.bestValueText}>Best Value</Text>
              </View>
            )}
          </TouchableOpacity>
          
          {/* Monthly Plan */}
          <TouchableOpacity 
            style={[
              styles.planOption,
              { 
                backgroundColor: colors.background.input,
                borderColor: selectedPlan === 'monthly' ? accent.primary : colors.border.primary,
                borderWidth: selectedPlan === 'monthly' ? 2 : 1,
              }
            ]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.7}
          >
            <View style={styles.planLeft}>
              <View style={[
                styles.planRadio,
                { borderColor: selectedPlan === 'monthly' ? accent.primary : colors.border.secondary }
              ]}>
                {selectedPlan === 'monthly' && (
                  <View style={[styles.planRadioInner, { backgroundColor: accent.primary }]} />
                )}
              </View>
              <View>
                <Text style={[styles.planName, { color: colors.text.primary }]}>Monthly</Text>
                <Text style={[styles.planNote, { color: colors.text.muted }]}>Flexible billing</Text>
              </View>
            </View>
            <View style={styles.planRight}>
              <Text style={[styles.planPrice, { color: colors.text.primary }]}>$3.99</Text>
              <Text style={[styles.planInterval, { color: colors.text.muted }]}>/month</Text>
            </View>
          </TouchableOpacity>

          {/* Free Trial Badge */}
          <View style={[styles.trialBadge, { backgroundColor: `${accent.primary}15` }]}>
            <Ionicons name="gift" size={20} color={accent.primary} />
            <Text style={[styles.trialText, { color: accent.primary }]}>
              Includes 3-day free trial
            </Text>
          </View>
        </View>

        {/* Features List */}
        <View style={[styles.featuresCard, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.featuresTitle, { color: colors.text.primary }]}>
            Premium Features
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
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            </View>
          ))}
        </View>

        {/* Subscribe Button */}
        <TouchableOpacity 
          style={styles.subscribeButton}
          onPress={handleSubscribe}
          disabled={loading}
        >
          <LinearGradient
            colors={accent.gradient as [string, string]}
            style={styles.subscribeGradient}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="diamond" size={24} color="#fff" />
                <Text style={styles.subscribeText}>
                  Start 3-Day Free Trial
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { color: colors.text.muted }]}>
          Premium subscriptions will be available through the App Store with secure In-App Purchases. 
          Cancel anytime. If cancelling after the 3-day free trial, continue the use of the app until expiration.
        </Text>

        {/* Call to Action Note */}
        <View style={[styles.freeNoteCard, { backgroundColor: colors.background.card }]}>
          <Ionicons name="rocket" size={24} color={accent.primary} />
          <View style={styles.freeNoteContent}>
            <Text style={[styles.freeNoteTitle, { color: colors.text.primary }]}>
              What are you waiting for?
            </Text>
            <Text style={[styles.freeNoteText, { color: colors.text.secondary }]}>
              FitTrax+ is your one stop app for all your fitness needs. Try FitTrax+ now for FREE!!
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
    alignItems: 'center',
  },
  backHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
    borderRadius: 20,
    overflow: 'hidden',
  },
  headerGradient: {
    padding: 32,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  pricingCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  pricingTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  planOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    position: 'relative',
  },
  planLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
  },
  planSavings: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  planNote: {
    fontSize: 12,
    marginTop: 2,
  },
  planRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '700',
  },
  planInterval: {
    fontSize: 14,
    marginLeft: 2,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -8,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  bestValueText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  trialText: {
    fontSize: 14,
    fontWeight: '600',
  },
  featuresCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  featureImageContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: 'hidden',
  },
  featureImage: {
    width: '100%',
    height: '100%',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  subscribeButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
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
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  freeNoteCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  freeNoteContent: {
    flex: 1,
  },
  freeNoteTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  freeNoteText: {
    fontSize: 13,
    lineHeight: 18,
  },
});

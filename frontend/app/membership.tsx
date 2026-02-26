import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import axios from 'axios';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

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

export default function MembershipScreen() {
  const { userId, profile } = useUserStore();
  const { theme } = useThemeStore();
  const [loading, setLoading] = useState(true);
  const [membershipStatus, setMembershipStatus] = useState<any>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  const colors = theme.colors;
  const accent = theme.accentColors;

  useEffect(() => {
    loadMembershipData();
  }, [userId]);

  const loadMembershipData = async () => {
    try {
      setLoading(true);
      const [statusRes, pricingRes] = await Promise.all([
        userId ? axios.get(`${API_URL}/api/membership/status/${userId}`) : null,
        axios.get(`${API_URL}/api/membership/pricing`)
      ]);
      
      if (statusRes) setMembershipStatus(statusRes.data);
      setPricing(pricingRes.data);
    } catch (error) {
      console.error('Error loading membership:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!userId || !profile) {
      Alert.alert('Profile Required', 'Please create a profile first to subscribe.');
      router.push('/profile');
      return;
    }

    setProcessingPayment(true);
    try {
      // Create Stripe checkout session
      const response = await axios.post(`${API_URL}/api/membership/create-checkout-session`, {
        user_id: userId,
        email: profile.email || `${profile.name?.replace(/\s/g, '').toLowerCase()}@fittrax.app`,
      });

      const { checkout_url, session_id } = response.data;

      if (checkout_url) {
        // Open Stripe checkout in browser
        const result = await WebBrowser.openBrowserAsync(checkout_url);
        
        // After returning from browser, check payment status
        if (result.type === 'cancel' || result.type === 'dismiss') {
          // User closed browser - check if payment was completed
          try {
            const statusCheck = await axios.get(`${API_URL}/api/membership/checkout-status/${session_id}`);
            if (statusCheck.data.payment_status === 'paid') {
              Alert.alert(
                '🎉 Welcome to Premium!',
                'Your subscription is now active. Enjoy all premium features!',
                [{ text: 'Explore Features', onPress: () => router.back() }]
              );
              loadMembershipData();
            }
          } catch (e) {
            // Status check failed, reload membership data anyway
            loadMembershipData();
          }
        }
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      Alert.alert(
        'Payment Error', 
        error.response?.data?.detail || 'Failed to start checkout. Please try again.'
      );
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleCancelSubscription = async () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your premium membership? You\'ll lose access to all premium features at the end of your billing period.',
      [
        { text: 'Keep Premium', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.post(`${API_URL}/api/membership/cancel/${userId}`);
              Alert.alert('Subscription Canceled', 'Your subscription has been canceled. You\'ll retain access until the end of your current billing period.');
              loadMembershipData();
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to cancel subscription');
            }
          }
        }
      ]
    );
  };

  const handleManageSubscription = () => {
    // Open Stripe customer portal (would need to be implemented)
    Alert.alert(
      'Manage Subscription',
      'Contact support to manage your subscription, update payment method, or view billing history.',
      [{ text: 'OK' }]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isPremium = membershipStatus?.is_premium;
  const isTrial = membershipStatus?.is_trial;
  const trialDaysRemaining = membershipStatus?.trial_days_remaining || 0;

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

        {/* Current Status Card */}
        {isPremium && (
          <View style={[styles.statusCard, { backgroundColor: colors.background.card }]}>
            <LinearGradient
              colors={isTrial ? ['#F59E0B', '#D97706'] : ['#10B981', '#059669']}
              style={styles.statusBadge}
            >
              <Ionicons name={isTrial ? 'time' : 'checkmark-circle'} size={20} color="#fff" />
              <Text style={styles.statusBadgeText}>
                {isTrial ? `Trial: ${trialDaysRemaining} days left` : 'Active Premium'}
              </Text>
            </LinearGradient>
            
            <Text style={[styles.statusTitle, { color: colors.text.primary }]}>
              {isTrial ? 'Free Trial Active' : 'Premium Member'}
            </Text>
            <Text style={[styles.statusDescription, { color: colors.text.secondary }]}>
              {isTrial 
                ? `Your trial ends in ${trialDaysRemaining} days. Subscribe to keep premium access.`
                : 'You have full access to all premium features.'
              }
            </Text>

            {!isTrial && (
              <TouchableOpacity 
                style={[styles.manageButton, { borderColor: colors.border.secondary }]}
                onPress={handleCancelSubscription}
              >
                <Text style={[styles.manageButtonText, { color: colors.text.secondary }]}>
                  Cancel Subscription
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Pricing Card */}
        {pricing && !isPremium && (
          <View style={[styles.pricingCard, { backgroundColor: colors.background.card }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceAmount, { color: colors.text.primary }]}>
                ${pricing.price}
              </Text>
              <Text style={[styles.priceInterval, { color: colors.text.muted }]}>
                /{pricing.interval}
              </Text>
            </View>
            <View style={[styles.trialBadge, { backgroundColor: `${accent.primary}20` }]}>
              <Text style={[styles.trialBadgeText, { color: accent.primary }]}>
                {pricing.trial_days}-Day Free Trial
              </Text>
            </View>
          </View>
        )}

        {/* Features List */}
        <View style={[styles.featuresCard, { backgroundColor: colors.background.card }]}>
          <Text style={[styles.featuresTitle, { color: colors.text.primary }]}>
            Premium Features
          </Text>
          {pricing?.features?.map((feature: string, index: number) => (
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
            </View>
          ))}
        </View>

        {/* Subscribe Button */}
        {!isPremium && (
          <TouchableOpacity 
            style={styles.subscribeButton}
            onPress={handleSubscribe}
            disabled={processingPayment}
          >
            <LinearGradient
              colors={accent.gradient as [string, string]}
              style={styles.subscribeGradient}
            >
              {processingPayment ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="card" size={24} color="#fff" />
                  <Text style={styles.subscribeText}>
                    Start {pricing?.trial_days}-Day Free Trial
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        {!isPremium && (
          <Text style={[styles.disclaimer, { color: colors.text.muted }]}>
            Cancel anytime during your trial. After {pricing?.trial_days} days, you'll be charged ${pricing?.price}/year.
            Secure payment powered by Stripe.
          </Text>
        )}

        {/* Upgrade prompt for trial users */}
        {isTrial && (
          <TouchableOpacity 
            style={styles.subscribeButton}
            onPress={handleSubscribe}
            disabled={processingPayment}
          >
            <LinearGradient
              colors={accent.gradient as [string, string]}
              style={styles.subscribeGradient}
            >
              {processingPayment ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="card" size={24} color="#fff" />
                  <Text style={styles.subscribeText}>
                    Subscribe Now - ${pricing?.price}/year
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const getFeatureIcon = (index: number): string => {
  const icons = [
    'barbell', 'nutrition', 'trophy', 'analytics', 
    'watch', 'fitness', 'flask', 'body', 'globe', 'accessibility'
  ];
  return icons[index % icons.length];
};

const getFeatureColor = (index: number): string => {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#EF4444', '#6366F1', '#8B5CF6', '#06B6D4', '#6366F1'
  ];
  return colors[index % colors.length];
};

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
  statusCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    marginBottom: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  manageButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  pricingCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: '800',
  },
  priceInterval: {
    fontSize: 18,
    marginLeft: 4,
  },
  trialBadge: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  trialBadgeText: {
    fontWeight: '700',
    fontSize: 14,
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
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
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
});

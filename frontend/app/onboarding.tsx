import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import FitTraxLogo from '../components/FitTraxLogo';

export default function OnboardingScreen() {
  const { theme } = useThemeStore();
  const { tosAccepted } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;

  const handleContinue = () => {
    // Ensure TOS was accepted before allowing profile setup
    if (!tosAccepted?.accepted) {
      Alert.alert('Error', 'Please accept the Terms of Service first.');
      router.replace('/terms-of-service');
      return;
    }
    // Navigate to profile tab for setup first
    router.replace('/(tabs)/profile');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={styles.content}>
        <FitTraxLogo size="xlarge" showText={true} />
        
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Welcome to FitTrax+!
        </Text>
        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Train, Track, Transform
        </Text>

        <View style={styles.features}>
          {[
            { icon: 'analytics', text: 'Track your progress' },
            { icon: 'restaurant', text: 'Log meals & nutrition' },
            { icon: 'barbell', text: 'Plan workouts' },
            { icon: 'fitness', text: 'Achieve your goals' },
          ].map((item, index) => (
            <View key={index} style={styles.featureItem}>
              <View style={[styles.featureIcon, { backgroundColor: `${accent.primary}20` }]}>
                <Ionicons name={item.icon as any} size={24} color={accent.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.text.primary }]}>{item.text}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: accent.primary }]}
          onPress={handleContinue}
        >
          <Text style={styles.continueButtonText}>Create My Profile</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
        
        {/* TOS Acceptance Status */}
        <View style={styles.tosStatus}>
          <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
          <Text style={[styles.tosStatusText, { color: colors.text.muted }]}>
            Terms of Service accepted
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 24,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
    lineHeight: 22,
  },
  features: {
    width: '100%',
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 16,
    fontWeight: '500',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 10,
    width: '100%',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  tosStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 6,
  },
  tosStatusText: {
    fontSize: 13,
  },
});

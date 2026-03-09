import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
  Image,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HEALTH_CONNECT_KEY = '@fittrax_health_connect_status';

export default function HealthConnectScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  const params = useLocalSearchParams();
  const isFromSettings = params.fromSettings === 'true';

  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Apple Health icon
  const appleHealthIcon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Apple_Health_%28iOS%29.svg/512px-Apple_Health_%28iOS%29.svg.png';

  const handleConnectAppleHealth = async () => {
    setLoading(true);
    setSelectedOption('apple_health');

    try {
      if (Platform.OS === 'ios') {
        // HealthKit integration requires a custom build with react-native-health
        // For now, show info about this requirement
        Alert.alert(
          'Apple Health Integration',
          'Apple Health integration requires a custom iOS build with HealthKit enabled.\n\nThis feature is coming soon in a future update.\n\nFor now, your calories will be estimated based on your workout data.',
          [
            {
              text: 'Open Health Settings',
              onPress: () => Linking.openSettings(),
            },
            {
              text: 'Use Estimated Tracking',
              onPress: handleManualInput,
            },
          ]
        );
      } else {
        // Android - Health Connect
        Alert.alert(
          'Health Connect',
          'Google Health Connect integration is coming soon. For now, calorie burn will be estimated based on your workout data.',
          [
            {
              text: 'Continue',
              onPress: () => {
                handleManualInput();
              },
            },
          ]
        );
      }
    } catch (error) {
      console.error('Error connecting to health:', error);
      Alert.alert('Error', 'Failed to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualInput = async () => {
    setLoading(true);
    setSelectedOption('manual');

    try {
      await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
        connected: true,
        method: 'manual',
        connectedAt: new Date().toISOString(),
      }));

      Alert.alert(
        'Manual Tracking Enabled',
        'Your calories will be calculated based on workout data and your profile information.',
        [
          {
            text: isFromSettings ? 'Done' : 'Get Started',
            onPress: () => {
              if (isFromSettings) {
                router.back();
              } else {
                router.replace('/(tabs)');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error setting up manual tracking:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setSelectedOption('skip');

    try {
      if (isFromSettings) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      console.error('Error:', error);
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {isFromSettings && (
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Health Tracking</Text>
          <View style={{ width: 40 }} />
        </View>
      )}

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={[
          styles.content,
          { paddingTop: isFromSettings ? 20 : 40 },
        ]}
      >
        {/* Header Icon */}
        <View style={[styles.iconContainer, { backgroundColor: `${accent.primary}15` }]}>
          <Ionicons name="fitness" size={60} color={accent.primary} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text.primary }]}>
          {isFromSettings
            ? 'Connect Health Tracking'
            : 'Lastly, do you want to calculate\nthe calories you burn\neach workout?'}
        </Text>

        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          {Platform.OS === 'ios'
            ? 'Connect to Apple Health for automatic step, calorie, and workout tracking'
            : 'Connect to Health Connect for automatic tracking'}
        </Text>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {/* Option 1: Connect to Apple Health */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              {
                backgroundColor: colors.background.secondary,
                borderColor: selectedOption === 'apple_health' ? accent.primary : colors.border.primary,
                borderWidth: selectedOption === 'apple_health' ? 2 : 1,
              },
            ]}
            onPress={handleConnectAppleHealth}
            disabled={loading}
          >
            <View style={styles.optionIconContainer}>
              <Image source={{ uri: appleHealthIcon }} style={styles.appleHealthIcon} resizeMode="contain" />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>
                {Platform.OS === 'ios' ? 'Connect to Apple Health' : 'Connect to Health Connect'}
              </Text>
              <Text style={[styles.optionDescription, { color: colors.text.muted }]}>
                Coming soon - Requires custom build
              </Text>
            </View>
            {loading && selectedOption === 'apple_health' ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <View style={styles.optionArrow}>
                <View style={[styles.comingSoonBadge, { backgroundColor: '#F59E0B' }]}>
                  <Text style={styles.comingSoonText}>Soon</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
              </View>
            )}
          </TouchableOpacity>

          {/* Option 2: Manual Input */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              {
                backgroundColor: colors.background.secondary,
                borderColor: selectedOption === 'manual' ? accent.primary : colors.border.primary,
                borderWidth: selectedOption === 'manual' ? 2 : 1,
              },
            ]}
            onPress={handleManualInput}
            disabled={loading}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: `${accent.secondary || '#3B82F6'}20` }]}>
              <Ionicons name="create-outline" size={28} color={accent.secondary || '#3B82F6'} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>
                Use Estimated Tracking
              </Text>
              <Text style={[styles.optionDescription, { color: colors.text.muted }]}>
                Calculate calories from workout data & profile
              </Text>
            </View>
            {loading && selectedOption === 'manual' ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <View style={styles.optionArrow}>
                <View style={[styles.recommendedBadge, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.recommendedText}>Best</Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
              </View>
            )}
          </TouchableOpacity>

          {/* Option 3: Maybe Later */}
          {!isFromSettings && (
            <TouchableOpacity
              style={[
                styles.optionCard,
                {
                  backgroundColor: colors.background.secondary,
                  borderColor: selectedOption === 'skip' ? accent.primary : colors.border.primary,
                  borderWidth: selectedOption === 'skip' ? 2 : 1,
                },
              ]}
              onPress={handleSkip}
              disabled={loading}
            >
              <View style={[styles.optionIconContainer, { backgroundColor: `${colors.text.muted}20` }]}>
                <Ionicons name="time-outline" size={28} color={colors.text.muted} />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={[styles.optionTitle, { color: colors.text.primary }]}>Maybe later</Text>
                <Text style={[styles.optionDescription, { color: colors.text.muted }]}>
                  You can set this up anytime in Settings
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Health Data Info */}
        <View style={[styles.infoContainer, { backgroundColor: `${accent.primary}10` }]}>
          <Ionicons name="shield-checkmark" size={20} color={accent.primary} />
          <Text style={[styles.infoText, { color: colors.text.secondary }]}>
            Your health data is stored securely and never shared with third parties
          </Text>
        </View>

        {/* HealthKit Coming Soon Info */}
        <View style={[styles.infoContainer, { backgroundColor: '#FEF3C720', marginTop: 12 }]}>
          <Ionicons name="information-circle" size={20} color="#F59E0B" />
          <Text style={[styles.infoText, { color: '#F59E0B' }]}>
            Apple Health integration is coming in a future update. For now, use estimated tracking.
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
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  scrollContent: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  optionsContainer: {
    width: '100%',
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  optionIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  appleHealthIcon: {
    width: 36,
    height: 36,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
  },
  optionArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  recommendedText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  comingSoonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  comingSoonText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 12,
    width: '100%',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
});

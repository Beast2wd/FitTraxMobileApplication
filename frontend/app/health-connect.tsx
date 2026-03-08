import React, { useState, useEffect } from 'react';
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
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    method: null as string | null,
  });

  // Apple Health icon
  const appleHealthIcon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Apple_Health_%28iOS%29.svg/512px-Apple_Health_%28iOS%29.svg.png';

  // Load connection status on mount
  useEffect(() => {
    const loadStatus = async () => {
      try {
        const stored = await AsyncStorage.getItem(HEALTH_CONNECT_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setConnectionStatus({
            connected: parsed.connected,
            method: parsed.method,
          });
          setSelectedOption(parsed.method);
        }
      } catch (e) {
        console.error('Error loading health status:', e);
      }
    };
    loadStatus();
  }, []);

  const handleConnectAppleHealth = async () => {
    setLoading(true);
    setSelectedOption('apple_health');

    // Show coming soon message
    Alert.alert(
      'Coming Soon',
      'Apple HealthKit integration will be available in a future update. For now, you can use manual tracking to log your workouts and calories.',
      [
        {
          text: 'Use Manual Tracking',
          onPress: handleManualInput,
        },
        {
          text: 'Maybe Later',
          style: 'cancel',
          onPress: () => setLoading(false),
        },
      ]
    );
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

      setConnectionStatus({
        connected: true,
        method: 'manual',
      });

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
    if (isFromSettings) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Tracking?',
      'Your health tracking preference will be reset.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(HEALTH_CONNECT_KEY);
            setConnectionStatus({ connected: false, method: null });
            setSelectedOption(null);
            Alert.alert('Disconnected', 'Health tracking has been disconnected.');
          },
        },
      ]
    );
  };

  // Show connected view if manual mode is active and coming from settings
  if (isFromSettings && connectionStatus.connected && connectionStatus.method === 'manual') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Health Tracking</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.statsContent} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={[styles.statusCard, { backgroundColor: colors.background.secondary }]}>
            <View style={styles.statusHeader}>
              <View style={[styles.statusIconContainer, { backgroundColor: `${accent.primary}20` }]}>
                <Ionicons name="fitness" size={28} color={accent.primary} />
              </View>
              <View style={styles.statusInfo}>
                <Text style={[styles.statusTitle, { color: colors.text.primary }]}>Manual Tracking</Text>
                <Text style={[styles.statusSubtitle, { color: colors.text.muted }]}>
                  Calories calculated from workouts
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>
            </View>
          </View>

          <View style={[styles.infoContainer, { backgroundColor: `${accent.primary}10` }]}>
            <Ionicons name="information-circle" size={20} color={accent.primary} />
            <Text style={[styles.infoText, { color: colors.text.secondary }]}>
              Your calories are estimated based on your workout data and profile information. Apple HealthKit integration is coming soon!
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.disconnectButton, { borderColor: '#EF4444' }]}
            onPress={handleDisconnect}
          >
            <Ionicons name="unlink" size={20} color="#EF4444" />
            <Text style={[styles.disconnectButtonText, { color: '#EF4444' }]}>Reset Tracking Preference</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show setup view
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
        <View style={[styles.iconContainer, { backgroundColor: `${accent.primary}15` }]}>
          <Ionicons name="fitness" size={60} color={accent.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text.primary }]}>
          {isFromSettings
            ? 'Connect Health Tracking'
            : 'Lastly, do you want to calculate\nthe calories you burn\neach workout?'}
        </Text>

        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Track your calories burned during workouts
        </Text>

        <View style={styles.optionsContainer}>
          {/* Option 1: Apple Health - Coming Soon */}
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
                Coming soon in a future update
              </Text>
            </View>
            {loading && selectedOption === 'apple_health' ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <View style={[styles.comingSoonBadge, { backgroundColor: '#F59E0B' }]}>
                <Text style={styles.comingSoonText}>Soon</Text>
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
            <View style={[styles.optionIconContainer, { backgroundColor: `${accent.primary}20` }]}>
              <Ionicons name="create-outline" size={28} color={accent.primary} />
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
              <View style={[styles.recommendedBadge, { backgroundColor: '#10B981' }]}>
                <Text style={styles.recommendedText}>Ready</Text>
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

        <View style={[styles.infoContainer, { backgroundColor: `${accent.primary}10` }]}>
          <Ionicons name="shield-checkmark" size={20} color={accent.primary} />
          <Text style={[styles.infoText, { color: colors.text.secondary }]}>
            Your health data is stored securely and never shared with third parties
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
  statsContent: {
    flex: 1,
    paddingHorizontal: 20,
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
  statusCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 24,
    gap: 8,
  },
  disconnectButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});

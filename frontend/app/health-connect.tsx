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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import useHealthKit from '../hooks/useHealthKit';

export default function HealthConnectScreen() {
  const { theme } = useThemeStore();
  const { userId, profile } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isFromSettings = params.fromSettings === 'true';

  const {
    isAvailable,
    isLoading: healthLoading,
    connectionStatus,
    requestPermission,
    syncHealthData,
    setManualMode,
    disconnect,
    todayData,
  } = useHealthKit(userId);

  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);

  // Apple Health icon
  const appleHealthIcon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Apple_Health_%28iOS%29.svg/512px-Apple_Health_%28iOS%29.svg.png';

  // Check if already connected on mount
  useEffect(() => {
    if (connectionStatus.connected && connectionStatus.method === 'apple_health') {
      setSelectedOption('apple_health');
      // If coming from settings, show current stats
      if (isFromSettings) {
        setShowStats(true);
        syncHealthData();
      }
    } else if (connectionStatus.connected && connectionStatus.method === 'manual') {
      setSelectedOption('manual');
    }
  }, [connectionStatus, isFromSettings]);

  const handleConnectAppleHealth = async () => {
    setLoading(true);
    setSelectedOption('apple_health');

    try {
      if (Platform.OS === 'ios') {
        if (isAvailable) {
          // Request HealthKit permission
          const granted = await requestPermission();

          if (granted) {
            // Sync initial data
            await syncHealthData();

            Alert.alert(
              'Connected! 🎉',
              'Apple Health is now connected. Your steps, calories, and workouts will sync automatically.',
              [
                {
                  text: isFromSettings ? 'Done' : 'Continue',
                  onPress: () => {
                    if (isFromSettings) {
                      setShowStats(true);
                    } else {
                      router.replace('/(tabs)');
                    }
                  },
                },
              ]
            );
          } else {
            // Permission denied or not available
            Alert.alert(
              'Permission Required',
              'Please allow FitTrax+ to access your health data. Go to Settings > Privacy & Security > Health > FitTrax+ and enable all permissions.',
              [
                {
                  text: 'Open Settings',
                  onPress: () => Linking.openSettings(),
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          }
        } else {
          // HealthKit not available (Expo Go or simulator)
          Alert.alert(
            'HealthKit Not Available',
            'HealthKit integration requires a custom iOS build. To test:\n\n1. Build the app using EAS Build\n2. Install via TestFlight\n3. Return here to connect\n\nFor now, you can use manual tracking.',
            [
              {
                text: 'Use Manual Tracking',
                onPress: handleManualInput,
              },
              {
                text: 'Open Settings Anyway',
                onPress: () => {
                  Linking.openSettings();
                  setTimeout(() => {
                    if (!isFromSettings) router.replace('/(tabs)');
                  }, 500);
                },
              },
            ]
          );
        }
      } else {
        // Android - Health Connect
        Alert.alert(
          'Health Connect',
          'Google Health Connect integration is coming soon. For now, calorie burn will be estimated based on your workout data.',
          [
            {
              text: 'Continue',
              onPress: () => {
                setManualMode();
                if (!isFromSettings) router.replace('/(tabs)');
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
      await setManualMode();

      Alert.alert(
        'Manual Tracking Enabled',
        'Your calories will be calculated based on workout data and your profile information.',
        [
          {
            text: isFromSettings ? 'Done' : 'Get Started',
            onPress: () => {
              if (!isFromSettings) router.replace('/(tabs)');
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

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Apple Health?',
      'Your health data will no longer sync. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await disconnect();
            setSelectedOption(null);
            setShowStats(false);
            Alert.alert('Disconnected', 'Apple Health has been disconnected.');
          },
        },
      ]
    );
  };

  const handleRefreshData = async () => {
    setLoading(true);
    try {
      await syncHealthData();
      Alert.alert('Synced!', 'Your health data has been refreshed.');
    } catch (error) {
      Alert.alert('Error', 'Failed to sync data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show connected stats view
  if (showStats && connectionStatus.connected && connectionStatus.method === 'apple_health') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Apple Health</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.statsContent} contentContainerStyle={{ paddingBottom: 40 }}>
          {/* Connection Status Card */}
          <View style={[styles.statusCard, { backgroundColor: colors.background.secondary }]}>
            <View style={styles.statusHeader}>
              <Image source={{ uri: appleHealthIcon }} style={styles.statusIcon} resizeMode="contain" />
              <View style={styles.statusInfo}>
                <Text style={[styles.statusTitle, { color: colors.text.primary }]}>Connected</Text>
                <Text style={[styles.statusSubtitle, { color: colors.text.muted }]}>
                  Last synced: {connectionStatus.lastSync
                    ? new Date(connectionStatus.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : 'Never'}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              </View>
            </View>
          </View>

          {/* Today's Stats */}
          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>{"Today's Data"}</Text>

          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.background.secondary }]}>
              <Ionicons name="footsteps" size={28} color={accent.primary} />
              <Text style={[styles.statValue, { color: colors.text.primary }]}>
                {todayData?.steps?.toLocaleString() || '0'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.text.muted }]}>Steps</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.background.secondary }]}>
              <Ionicons name="flame" size={28} color="#EF4444" />
              <Text style={[styles.statValue, { color: colors.text.primary }]}>
                {todayData?.activeCalories?.toLocaleString() || '0'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.text.muted }]}>Active Cal</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.background.secondary }]}>
              <Ionicons name="navigate" size={28} color="#3B82F6" />
              <Text style={[styles.statValue, { color: colors.text.primary }]}>
                {todayData?.distance?.toFixed(1) || '0.0'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.text.muted }]}>Miles</Text>
            </View>

            <View style={[styles.statCard, { backgroundColor: colors.background.secondary }]}>
              <Ionicons name="heart" size={28} color="#EC4899" />
              <Text style={[styles.statValue, { color: colors.text.primary }]}>
                {todayData?.avgHeartRate || '--'}
              </Text>
              <Text style={[styles.statLabel, { color: colors.text.muted }]}>Avg BPM</Text>
            </View>
          </View>

          {/* Workouts Today */}
          {todayData?.workouts && todayData.workouts.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                {"Today's Workouts"} ({todayData.workouts.length})
              </Text>
              {todayData.workouts.map((workout, index) => (
                <View
                  key={index}
                  style={[styles.workoutCard, { backgroundColor: colors.background.secondary }]}
                >
                  <View style={[styles.workoutIcon, { backgroundColor: `${accent.primary}20` }]}>
                    <MaterialCommunityIcons name="dumbbell" size={24} color={accent.primary} />
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={[styles.workoutName, { color: colors.text.primary }]}>
                      {workout.activityName}
                    </Text>
                    <Text style={[styles.workoutDetails, { color: colors.text.muted }]}>
                      {workout.duration} min • {workout.calories} cal
                      {workout.distance ? ` • ${workout.distance.toFixed(1)} mi` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: accent.primary }]}
              onPress={handleRefreshData}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <Text style={styles.actionButtonText}>Refresh Data</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryButton, { borderColor: colors.border.primary }]}
              onPress={handleDisconnect}
            >
              <Ionicons name="unlink" size={20} color="#EF4444" />
              <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Disconnect</Text>
            </TouchableOpacity>
          </View>

          {/* Info */}
          <View style={[styles.infoContainer, { backgroundColor: `${accent.primary}10` }]}>
            <Ionicons name="information-circle" size={20} color={accent.primary} />
            <Text style={[styles.infoText, { color: colors.text.secondary }]}>
              Data syncs automatically when you open the app. Your health data is encrypted and stored securely.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show setup/connection view
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
                {isAvailable
                  ? 'Automatically sync steps, calories & workouts'
                  : 'Requires a custom iOS build'}
              </Text>
            </View>
            {loading && selectedOption === 'apple_health' ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <View style={styles.optionArrow}>
                {isAvailable && <View style={[styles.recommendedBadge, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.recommendedText}>Best</Text>
                </View>}
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
              <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
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

        {/* HealthKit Availability Info */}
        {Platform.OS === 'ios' && !isAvailable && (
          <View style={[styles.infoContainer, { backgroundColor: '#FEF3C720', marginTop: 12 }]}>
            <Ionicons name="warning" size={20} color="#F59E0B" />
            <Text style={[styles.infoText, { color: '#F59E0B' }]}>
              HealthKit requires a production build. Create a TestFlight build to enable Apple Health sync.
            </Text>
          </View>
        )}
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
  // Stats view styles
  statusCard: {
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 44,
    height: 44,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  workoutIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: '600',
  },
  workoutDetails: {
    fontSize: 13,
    marginTop: 2,
  },
  actionsContainer: {
    marginTop: 24,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});  

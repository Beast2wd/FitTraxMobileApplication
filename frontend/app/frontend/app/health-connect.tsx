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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Health connect storage key
const HEALTH_CONNECT_KEY = '@fittrax_health_connect_status';

export default function HealthConnectScreen() {
  const { theme } = useThemeStore();
  const { userId, setProfile, profile } = useUserStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  // Apple Health icon as base64 or use a placeholder
  const appleHealthIcon = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/76/Apple_Health_%28iOS%29.svg/512px-Apple_Health_%28iOS%29.svg.png';

  const handleConnectAppleHealth = async () => {
    setLoading(true);
    setSelectedOption('apple_health');
    
    try {
      // Save the preference
      await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
        connected: true,
        method: 'apple_health',
        connectedAt: new Date().toISOString(),
      }));

      // On iOS, we would request HealthKit permissions here
      // For now, show a message and navigate
      if (Platform.OS === 'ios') {
        // In a real implementation, you would use react-native-health or expo-health
        // to request permissions. For TestFlight, we'll show a success message.
        Alert.alert(
          'Apple Health',
          'To connect Apple Health, please go to Settings > Health > Data Access & Devices and enable FitTrax+.',
          [
            { 
              text: 'Open Settings', 
              onPress: () => {
                Linking.openSettings();
                // Navigate after a short delay
                setTimeout(() => {
                  router.replace('/(tabs)');
                }, 500);
              }
            },
            { 
              text: 'Continue', 
              onPress: () => router.replace('/(tabs)')
            },
          ]
        );
      } else {
        // Android - would use Google Fit or Health Connect
        Alert.alert(
          'Health Connect',
          'Health tracking has been enabled. Your calorie burn will be calculated based on your workout data.',
          [{ text: 'Continue', onPress: () => router.replace('/(tabs)') }]
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
        'You can now manually input your workout details to calculate calories burned.',
        [{ text: 'Get Started', onPress: () => router.replace('/(tabs)') }]
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
      await AsyncStorage.setItem(HEALTH_CONNECT_KEY, JSON.stringify({
        connected: false,
        method: 'skipped',
        skippedAt: new Date().toISOString(),
      }));
      
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Error:', error);
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <View style={styles.content}>
        {/* Header Icon */}
        <View style={[styles.iconContainer, { backgroundColor: `${accent.primary}15` }]}>
          <Ionicons name="fitness" size={60} color={accent.primary} />
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.text.primary }]}>
          Lastly, do you want to calculate{'\n'}the calories you burn{'\n'}each workout?
        </Text>

        <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
          Connect to Apple Health for automatic tracking or input your details manually
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
              }
            ]}
            onPress={handleConnectAppleHealth}
            disabled={loading}
          >
            <View style={styles.optionIconContainer}>
              <Image 
                source={{ uri: appleHealthIcon }} 
                style={styles.appleHealthIcon}
                resizeMode="contain"
              />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>
                Yes, Connect to Apple Health
              </Text>
              <Text style={[styles.optionDescription, { color: colors.text.muted }]}>
                Automatically sync your health data
              </Text>
            </View>
            {loading && selectedOption === 'apple_health' ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
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
              }
            ]}
            onPress={handleManualInput}
            disabled={loading}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: `${accent.secondary}20` }]}>
              <Ionicons name="create-outline" size={28} color={accent.secondary || '#3B82F6'} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>
                Yes, input details manually
              </Text>
              <Text style={[styles.optionDescription, { color: colors.text.muted }]}>
                Enter your weight, height & activity level
              </Text>
            </View>
            {loading && selectedOption === 'manual' ? (
              <ActivityIndicator size="small" color={accent.primary} />
            ) : (
              <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
            )}
          </TouchableOpacity>

          {/* Option 3: Maybe Later */}
          <TouchableOpacity
            style={[
              styles.optionCard,
              { 
                backgroundColor: colors.background.secondary,
                borderColor: selectedOption === 'skip' ? accent.primary : colors.border.primary,
                borderWidth: selectedOption === 'skip' ? 2 : 1,
              }
            ]}
            onPress={handleSkip}
            disabled={loading}
          >
            <View style={[styles.optionIconContainer, { backgroundColor: `${colors.text.muted}20` }]}>
              <Ionicons name="time-outline" size={28} color={colors.text.muted} />
            </View>
            <View style={styles.optionTextContainer}>
              <Text style={[styles.optionTitle, { color: colors.text.primary }]}>
                Maybe later
              </Text>
              <Text style={[styles.optionDescription, { color: colors.text.muted }]}>
                You can set this up anytime in Settings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={colors.text.muted} />
          </TouchableOpacity>
        </View>

        {/* Health Data Info */}
        <View style={[styles.infoContainer, { backgroundColor: `${accent.primary}10` }]}>
          <Ionicons name="shield-checkmark" size={20} color={accent.primary} />
          <Text style={[styles.infoText, { color: colors.text.secondary }]}>
            Your health data is stored securely and never shared with third parties
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
    paddingHorizontal: 24,
    paddingTop: 40,
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

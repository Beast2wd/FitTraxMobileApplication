import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import {
  HealthData,
  ConnectionStatus,
  getConnectionStatus,
  initializeAppleHealth,
  initializeGoogleHealthConnect,
  disconnectAppleHealth,
  disconnectGoogleHealthConnect,
  syncHealthData,
  getCachedHealthData,
  isNativePlatform,
  formatDuration,
  formatSleepTime,
} from '../services/healthService';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function WearablesScreen() {
  const { userId } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const status = await getConnectionStatus();
      setConnectionStatus(status);
      
      const cached = await getCachedHealthData();
      setHealthData(cached);
    } catch (error) {
      console.error('Error loading wearables data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleConnectAppleHealth = async () => {
    if (!isNativePlatform()) {
      Alert.alert(
        'Native Device Required',
        'Apple Health integration requires running the app on a physical iOS device. Please download the app from the App Store to use this feature.',
        [{ text: 'OK' }]
      );
      return;
    }

    setConnecting('apple');
    try {
      const success = await initializeAppleHealth();
      if (success) {
        Alert.alert('Connected!', 'Successfully connected to Apple Health. Your health data will now sync automatically.');
        await loadData();
        handleSyncNow();
      } else {
        Alert.alert('Connection Failed', 'Could not connect to Apple Health. Please check your permissions in Settings.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Apple Health.');
    } finally {
      setConnecting(null);
    }
  };

  const handleConnectGoogleFit = async () => {
    if (!isNativePlatform()) {
      Alert.alert(
        'Native Device Required',
        'Google Health Connect integration requires running the app on a physical Android device. Please install the app to use this feature.',
        [{ text: 'OK' }]
      );
      return;
    }

    setConnecting('google');
    try {
      const success = await initializeGoogleHealthConnect();
      if (success) {
        Alert.alert('Connected!', 'Successfully connected to Google Health Connect. Your health data will now sync automatically.');
        await loadData();
        handleSyncNow();
      } else {
        Alert.alert('Connection Failed', 'Could not connect to Google Health Connect. Please ensure Health Connect is installed and permissions are granted.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Google Health Connect.');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (service: 'apple' | 'google') => {
    Alert.alert(
      'Disconnect',
      `Are you sure you want to disconnect from ${service === 'apple' ? 'Apple Health' : 'Google Health Connect'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            if (service === 'apple') {
              await disconnectAppleHealth();
            } else {
              await disconnectGoogleHealthConnect();
            }
            await loadData();
          },
        },
      ]
    );
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const data = await syncHealthData();
      if (data) {
        setHealthData(data);
        
        // Send to backend
        try {
          await axios.post(`${API_URL}/api/health/sync`, {
            user_id: userId,
            ...data,
          });
        } catch (err) {
          console.log('Error syncing to backend:', err);
        }
        
        Alert.alert('Sync Complete', 'Your health data has been updated.');
      } else {
        Alert.alert('Sync Failed', 'Could not sync health data. Please ensure you are connected to a health service.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync health data.');
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const isConnected = connectionStatus?.appleHealth.connected || connectionStatus?.googleFit.connected;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Health & Wearables</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Hero Card */}
        <LinearGradient
          colors={['#10B981', '#059669']}
          style={styles.heroCard}
        >
          <MaterialCommunityIcons name="watch" size={48} color="#fff" />
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroTitle}>Sync Your Health Data</Text>
            <Text style={styles.heroSubtitle}>
              Connect to Apple Health or Google Fit for automatic tracking
            </Text>
          </View>
        </LinearGradient>

        {/* Web Platform Notice */}
        {!isNativePlatform() && (
          <View style={styles.webNotice}>
            <Ionicons name="information-circle" size={24} color="#F59E0B" />
            <View style={styles.webNoticeText}>
              <Text style={styles.webNoticeTitle}>Native Device Required</Text>
              <Text style={styles.webNoticeDesc}>
                Health integrations require a physical iOS or Android device. Install the app to connect your wearables.
              </Text>
            </View>
          </View>
        )}

        {/* Connection Cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connect Services</Text>

          {/* Apple Health Card */}
          <View style={styles.serviceCard}>
            <View style={styles.serviceHeader}>
              <View style={[styles.serviceIcon, { backgroundColor: '#FF2D5520' }]}>
                <FontAwesome5 name="apple" size={28} color="#FF2D55" />
              </View>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>Apple Health</Text>
                <Text style={styles.serviceDesc}>
                  {Platform.OS === 'ios' ? 'Sync steps, workouts, heart rate & sleep' : 'Available on iOS devices'}
                </Text>
                {connectionStatus?.appleHealth.connected && (
                  <Text style={styles.lastSync}>
                    Last sync: {formatLastSync(connectionStatus.appleHealth.lastSync)}
                  </Text>
                )}
              </View>
            </View>
            
            {connectionStatus?.appleHealth.connected ? (
              <View style={styles.serviceActions}>
                <View style={styles.connectedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => handleDisconnect('apple')}
                >
                  <Text style={styles.disconnectBtnText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.connectBtn,
                  Platform.OS !== 'ios' && styles.connectBtnDisabled
                ]}
                onPress={handleConnectAppleHealth}
                disabled={connecting === 'apple' || Platform.OS !== 'ios'}
              >
                {connecting === 'apple' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Google Health Connect Card */}
          <View style={styles.serviceCard}>
            <View style={styles.serviceHeader}>
              <View style={[styles.serviceIcon, { backgroundColor: '#4285F420' }]}>
                <MaterialCommunityIcons name="google-fit" size={28} color="#4285F4" />
              </View>
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceName}>Google Health Connect</Text>
                <Text style={styles.serviceDesc}>
                  {Platform.OS === 'android' ? 'Sync steps, workouts, heart rate & sleep' : 'Available on Android devices'}
                </Text>
                {connectionStatus?.googleFit.connected && (
                  <Text style={styles.lastSync}>
                    Last sync: {formatLastSync(connectionStatus.googleFit.lastSync)}
                  </Text>
                )}
              </View>
            </View>
            
            {connectionStatus?.googleFit.connected ? (
              <View style={styles.serviceActions}>
                <View style={styles.connectedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => handleDisconnect('google')}
                >
                  <Text style={styles.disconnectBtnText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  styles.connectBtn,
                  { backgroundColor: '#4285F4' },
                  Platform.OS !== 'android' && styles.connectBtnDisabled
                ]}
                onPress={handleConnectGoogleFit}
                disabled={connecting === 'google' || Platform.OS !== 'android'}
              >
                {connecting === 'google' ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.connectBtnText}>Connect</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Sync Button */}
        {isConnected && (
          <TouchableOpacity
            style={styles.syncButton}
            onPress={handleSyncNow}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sync" size={20} color="#fff" />
                <Text style={styles.syncButtonText}>Sync Now</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Health Data Overview */}
        {healthData && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Health Data</Text>
            
            {/* Activity Stats */}
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: '#EC489920' }]}>
                  <Ionicons name="footsteps" size={24} color="#EC4899" />
                </View>
                <Text style={styles.statValue}>{healthData.steps.toLocaleString()}</Text>
                <Text style={styles.statLabel}>Steps</Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: '#3B82F620' }]}>
                  <Ionicons name="navigate" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.statValue}>{healthData.distance.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Miles</Text>
              </View>
              
              <View style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: '#F59E0B20' }]}>
                  <Ionicons name="flame" size={24} color="#F59E0B" />
                </View>
                <Text style={styles.statValue}>{healthData.activeCalories}</Text>
                <Text style={styles.statLabel}>Active Cal</Text>
              </View>
            </View>

            {/* Heart Rate */}
            {healthData.heartRate && (
              <View style={styles.heartRateCard}>
                <View style={styles.heartRateHeader}>
                  <View style={[styles.statIcon, { backgroundColor: '#EF444420' }]}>
                    <Ionicons name="heart" size={24} color="#EF4444" />
                  </View>
                  <Text style={styles.heartRateTitle}>Heart Rate</Text>
                </View>
                <View style={styles.heartRateStats}>
                  <View style={styles.heartRateStat}>
                    <Text style={styles.heartRateValue}>{healthData.heartRate.current}</Text>
                    <Text style={styles.heartRateLabel}>Current</Text>
                  </View>
                  <View style={styles.heartRateStat}>
                    <Text style={styles.heartRateValue}>{healthData.heartRate.min}</Text>
                    <Text style={styles.heartRateLabel}>Min</Text>
                  </View>
                  <View style={styles.heartRateStat}>
                    <Text style={styles.heartRateValue}>{healthData.heartRate.max}</Text>
                    <Text style={styles.heartRateLabel}>Max</Text>
                  </View>
                  <View style={styles.heartRateStat}>
                    <Text style={styles.heartRateValue}>{healthData.heartRate.avg}</Text>
                    <Text style={styles.heartRateLabel}>Avg</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Sleep Data */}
            {healthData.sleep && healthData.sleep.totalMinutes > 0 && (
              <View style={styles.sleepCard}>
                <View style={styles.sleepHeader}>
                  <View style={[styles.statIcon, { backgroundColor: '#8B5CF620' }]}>
                    <Ionicons name="moon" size={24} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text style={styles.sleepTitle}>Last Night's Sleep</Text>
                    <Text style={styles.sleepTotal}>
                      {formatSleepTime(healthData.sleep.totalMinutes)}
                    </Text>
                  </View>
                </View>
                <View style={styles.sleepBreakdown}>
                  <View style={styles.sleepStage}>
                    <View style={[styles.sleepDot, { backgroundColor: '#1E3A8A' }]} />
                    <Text style={styles.sleepStageLabel}>Deep</Text>
                    <Text style={styles.sleepStageValue}>
                      {formatDuration(healthData.sleep.deepMinutes)}
                    </Text>
                  </View>
                  <View style={styles.sleepStage}>
                    <View style={[styles.sleepDot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={styles.sleepStageLabel}>Light</Text>
                    <Text style={styles.sleepStageValue}>
                      {formatDuration(healthData.sleep.lightMinutes)}
                    </Text>
                  </View>
                  <View style={styles.sleepStage}>
                    <View style={[styles.sleepDot, { backgroundColor: '#8B5CF6' }]} />
                    <Text style={styles.sleepStageLabel}>REM</Text>
                    <Text style={styles.sleepStageValue}>
                      {formatDuration(healthData.sleep.remMinutes)}
                    </Text>
                  </View>
                  <View style={styles.sleepStage}>
                    <View style={[styles.sleepDot, { backgroundColor: '#D1D5DB' }]} />
                    <Text style={styles.sleepStageLabel}>Awake</Text>
                    <Text style={styles.sleepStageValue}>
                      {formatDuration(healthData.sleep.awakeMinutes)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Workouts */}
            {healthData.workouts.length > 0 && (
              <View style={styles.workoutsSection}>
                <Text style={styles.workoutsTitle}>Today's Workouts</Text>
                {healthData.workouts.map((workout, index) => (
                  <View key={index} style={styles.workoutCard}>
                    <View style={[styles.workoutIcon, { backgroundColor: '#10B98120' }]}>
                      <MaterialCommunityIcons name="run" size={24} color="#10B981" />
                    </View>
                    <View style={styles.workoutInfo}>
                      <Text style={styles.workoutType}>{workout.type}</Text>
                      <Text style={styles.workoutDetails}>
                        {formatDuration(workout.duration)}
                        {workout.calories > 0 && ` • ${workout.calories} cal`}
                        {workout.distance && ` • ${workout.distance.toFixed(2)} mi`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Data Types Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synced Data Types</Text>
          <View style={styles.dataTypesList}>
            {[
              { icon: 'footsteps', label: 'Steps', color: '#EC4899' },
              { icon: 'navigate', label: 'Distance', color: '#3B82F6' },
              { icon: 'flame', label: 'Calories', color: '#F59E0B' },
              { icon: 'heart', label: 'Heart Rate', color: '#EF4444' },
              { icon: 'moon', label: 'Sleep', color: '#8B5CF6' },
              { icon: 'barbell', label: 'Workouts', color: '#10B981' },
            ].map((item, index) => (
              <View key={index} style={styles.dataTypeItem}>
                <Ionicons name={item.icon as any} size={20} color={item.color} />
                <Text style={styles.dataTypeLabel}>{item.label}</Text>
              </View>
            ))}
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
    backgroundColor: Colors.background.light,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    gap: 16,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  webNotice: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  webNoticeText: {
    flex: 1,
  },
  webNoticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  webNoticeDesc: {
    fontSize: 13,
    color: '#B45309',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  serviceCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  serviceHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  serviceInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  serviceDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  lastSync: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 4,
  },
  serviceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  connectedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#059669',
  },
  disconnectBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disconnectBtnText: {
    fontSize: 14,
    color: Colors.status.error,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF2D55',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  connectBtnDisabled: {
    opacity: 0.5,
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 24,
    gap: 8,
  },
  syncButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  heartRateCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  heartRateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  heartRateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  heartRateStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  heartRateStat: {
    alignItems: 'center',
  },
  heartRateValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#EF4444',
    marginBottom: 4,
  },
  heartRateLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  sleepCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sleepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  sleepTitle: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  sleepTotal: {
    fontSize: 24,
    fontWeight: '700',
    color: '#8B5CF6',
  },
  sleepBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  sleepStage: {
    alignItems: 'center',
  },
  sleepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  sleepStageLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginBottom: 2,
  },
  sleepStageValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  workoutsSection: {
    marginTop: 8,
  },
  workoutsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
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
  workoutType: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  workoutDetails: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  dataTypesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dataTypeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  dataTypeLabel: {
    fontSize: 14,
    color: Colors.text.primary,
  },
});

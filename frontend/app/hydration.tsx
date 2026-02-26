import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Alert,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { waterAPI } from '../services/api';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isToday, isYesterday, parseISO, eachDayOfInterval } from 'date-fns';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

const { width } = Dimensions.get('window');
const DAILY_GOAL = 64; // 64 oz default goal

interface WaterEntry {
  water_id: string;
  user_id: string;
  amount: number;
  timestamp: string;
}

interface DailyWater {
  date: string;
  dateLabel: string;
  total: number;
  entries: WaterEntry[];
  goalMet: boolean;
  percentage: number;
}

export default function HydrationScreen() {
  const { userId, membershipStatus } = useUserStore();
  const { theme } = useThemeStore();
  const { t } = useTranslation();
  const [waterData, setWaterData] = useState<WaterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dailyGoal, setDailyGoal] = useState(DAILY_GOAL);

  const colors = theme.colors;
  const accent = theme.accentColors;
  const isPremium = membershipStatus?.is_premium || false;
  
  // Create styles early so they can be used in premium gate
  const localStyles = createStyles(theme);

  // If not premium, show upgrade prompt
  if (!isPremium) {
    return (
      <SafeAreaView style={[localStyles.container, { backgroundColor: colors.background.primary }]}>
        <View style={localStyles.premiumGateContainer}>
          <View style={localStyles.premiumGateContent}>
            <View style={localStyles.premiumIconCircle}>
              <Ionicons name="diamond" size={48} color="#8B5CF6" />
            </View>
            <Text style={[localStyles.premiumGateTitle, { color: colors.text.primary }]}>
              FitTrax+ Premium Feature
            </Text>
            <Text style={[localStyles.premiumGateSubtitle, { color: colors.text.secondary }]}>
              Hydration Tracking is a premium feature. Track your daily water intake and stay healthy!
            </Text>
            <Text style={[localStyles.premiumGateFeatures, { color: colors.text.muted }]}>
              Upgrade to unlock:
            </Text>
            <View style={localStyles.premiumFeatureList}>
              <Text style={[localStyles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ Daily Water Intake Tracking</Text>
              <Text style={[localStyles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ Customizable Hydration Goals</Text>
              <Text style={[localStyles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ Weekly & Monthly Analytics</Text>
              <Text style={[localStyles.premiumFeatureItem, { color: colors.text.secondary }]}>✓ Hydration Reminders</Text>
            </View>
            <TouchableOpacity 
              style={[localStyles.premiumUpgradeBtn, { backgroundColor: '#8B5CF6' }]}
              onPress={() => router.push('/membership')}
            >
              <Ionicons name="diamond" size={20} color="#fff" />
              <Text style={localStyles.premiumUpgradeBtnText}>Upgrade to Premium</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={localStyles.premiumLearnMore}
              onPress={() => router.push('/membership')}
            >
              <Text style={[localStyles.premiumLearnMoreText, { color: accent.primary }]}>Learn more about Premium</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  useEffect(() => {
    if (userId) {
      loadWaterData();
    }
  }, [userId]);

  const loadWaterData = async () => {
    try {
      const data = await waterAPI.getWaterIntake(userId!, 60); // Load 60 days
      setWaterData(data.water_intake || []);
    } catch (error) {
      console.error('Error loading water data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const addWater = async (amount: number) => {
    try {
      await waterAPI.addWater({
        water_id: `water_${Date.now()}`,
        user_id: userId!,
        amount,
        timestamp: new Date().toISOString(),
      });
      loadWaterData();
    } catch (error) {
      Alert.alert('Error', 'Failed to log water');
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadWaterData();
  };

  const deleteWaterEntry = async (waterId: string, amount: number) => {
    Alert.alert(
      'Delete Entry',
      `Delete this ${amount}oz water entry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await waterAPI.deleteWater(waterId);
              loadWaterData();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete water entry');
            }
          },
        },
      ]
    );
  };

  // Simple Entry Component with delete button
  const WaterEntryItem = ({ entry }: { entry: WaterEntry }) => {
    return (
      <View style={styles.entryRow}>
        <View style={styles.entryChip}>
          <Text style={styles.entryChipText}>
            {format(new Date(entry.timestamp), 'h:mm a')} • {entry.amount}oz
          </Text>
        </View>
        <TouchableOpacity 
          style={styles.deleteIconButton}
          onPress={() => deleteWaterEntry(entry.water_id, entry.amount)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close-circle" size={22} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  };

  // Group water entries by day
  const dailyLogs = useMemo((): DailyWater[] => {
    const grouped: { [key: string]: WaterEntry[] } = {};
    
    waterData.forEach(entry => {
      const date = format(new Date(entry.timestamp), 'yyyy-MM-dd');
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    });

    return Object.entries(grouped)
      .map(([date, entries]) => {
        const dateObj = parseISO(date);
        let dateLabel = format(dateObj, 'EEEE, MMMM d');
        if (isToday(dateObj)) {
          dateLabel = 'Today';
        } else if (isYesterday(dateObj)) {
          dateLabel = 'Yesterday';
        }

        const total = entries.reduce((sum, e) => sum + e.amount, 0);
        const percentage = Math.min((total / dailyGoal) * 100, 100);

        return {
          date,
          dateLabel,
          total,
          entries: entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
          goalMet: total >= dailyGoal,
          percentage,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [waterData, dailyGoal]);

  // Calculate weekly stats
  const weeklyStats = useMemo(() => {
    const now = new Date();
    const weeks: { label: string; total: number; average: number; days: number; goalDays: number }[] = [];
    
    for (let i = 0; i < 4; i++) {
      const weekStart = startOfWeek(subDays(now, i * 7), { weekStartsOn: 0 });
      const weekEnd = endOfWeek(subDays(now, i * 7), { weekStartsOn: 0 });
      
      const weekEntries = waterData.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= weekStart && entryDate <= weekEnd;
      });

      const total = weekEntries.reduce((sum, e) => sum + e.amount, 0);
      
      // Count unique days with entries
      const uniqueDays = new Set(weekEntries.map(e => format(new Date(e.timestamp), 'yyyy-MM-dd'))).size;
      
      // Count days that met goal
      const daysGrouped: { [key: string]: number } = {};
      weekEntries.forEach(e => {
        const day = format(new Date(e.timestamp), 'yyyy-MM-dd');
        daysGrouped[day] = (daysGrouped[day] || 0) + e.amount;
      });
      const goalDays = Object.values(daysGrouped).filter(t => t >= dailyGoal).length;
      
      weeks.push({
        label: i === 0 ? 'This Week' : i === 1 ? 'Last Week' : `${i} Weeks Ago`,
        total,
        average: uniqueDays > 0 ? total / uniqueDays : 0,
        days: uniqueDays,
        goalDays,
      });
    }
    
    return weeks;
  }, [waterData, dailyGoal]);

  // Calculate monthly stats
  const monthlyStats = useMemo(() => {
    const now = new Date();
    const months: { label: string; total: number; average: number; days: number; goalDays: number }[] = [];
    
    for (let i = 0; i < 3; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = startOfMonth(monthDate);
      const monthEnd = endOfMonth(monthDate);
      
      const monthEntries = waterData.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        return entryDate >= monthStart && entryDate <= monthEnd;
      });

      const total = monthEntries.reduce((sum, e) => sum + e.amount, 0);
      
      const uniqueDays = new Set(monthEntries.map(e => format(new Date(e.timestamp), 'yyyy-MM-dd'))).size;
      
      const daysGrouped: { [key: string]: number } = {};
      monthEntries.forEach(e => {
        const day = format(new Date(e.timestamp), 'yyyy-MM-dd');
        daysGrouped[day] = (daysGrouped[day] || 0) + e.amount;
      });
      const goalDays = Object.values(daysGrouped).filter(t => t >= dailyGoal).length;
      
      months.push({
        label: format(monthDate, 'MMMM yyyy'),
        total,
        average: uniqueDays > 0 ? total / uniqueDays : 0,
        days: uniqueDays,
        goalDays,
      });
    }
    
    return months;
  }, [waterData, dailyGoal]);

  // Today's progress
  const todayData = dailyLogs.find(d => d.dateLabel === 'Today') || {
    total: 0,
    percentage: 0,
    goalMet: false,
    entries: [],
  };

  const renderProgressRing = (percentage: number, size: number, strokeWidth: number) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
      <View style={{ width: size, height: size, position: 'relative' }}>
        {/* Background circle */}
        <View style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: colors.background.elevated,
        }} />
        {/* Progress circle - simplified visual */}
        <View style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: '#06B6D4',
          borderTopColor: percentage >= 25 ? '#06B6D4' : 'transparent',
          borderRightColor: percentage >= 50 ? '#06B6D4' : 'transparent',
          borderBottomColor: percentage >= 75 ? '#06B6D4' : 'transparent',
          borderLeftColor: percentage >= 100 ? '#06B6D4' : 'transparent',
          transform: [{ rotate: '-90deg' }],
        }} />
        <View style={{
          position: 'absolute',
          width: size,
          height: size,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Ionicons name="water" size={size * 0.3} color="#06B6D4" />
        </View>
      </View>
    );
  };

  const styles = localStyles;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#06B6D4" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={styles.title}>Hydration</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Today's Progress Card */}
        <ImageBackground
          source={{ uri: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=800' }}
          style={styles.todayCardBg}
          imageStyle={styles.todayCardBgImage}
          resizeMode="cover"
        >
          <View style={styles.todayCardOverlay}>
            <View style={styles.todayHeader}>
              <Text style={styles.todayTitleWhite}>Today's Progress</Text>
              <View style={[styles.goalBadge, todayData.goalMet && styles.goalBadgeMetWhite, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Text style={[styles.goalBadgeTextWhite, todayData.goalMet && styles.goalBadgeTextMetWhite]}>
                  {todayData.goalMet ? '✓ Goal Met!' : `Goal: ${dailyGoal}oz`}
                </Text>
              </View>
            </View>

            <View style={styles.todayContent}>
              <View style={styles.progressContainer}>
                {renderProgressRing(todayData.percentage, 120, 10)}
              </View>
              <View style={styles.todayStats}>
                <Text style={styles.todayAmountWhite}>{Math.round(todayData.total)}</Text>
                <Text style={styles.todayUnitWhite}>oz</Text>
                <Text style={styles.todayPercentageWhite}>{Math.round(todayData.percentage)}% of daily goal</Text>
                <Text style={styles.todayRemainingWhite}>
                  {todayData.total >= dailyGoal 
                    ? `${Math.round(todayData.total - dailyGoal)}oz over goal! 🎉`
                    : `${Math.round(dailyGoal - todayData.total)}oz remaining`
                  }
                </Text>
              </View>
            </View>

            {/* Quick Add Buttons */}
            <View style={styles.quickAddContainer}>
              <Text style={styles.quickAddLabelWhite}>Quick Add</Text>
              <View style={styles.quickAddButtons}>
                {[8, 16, 24, 32].map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={[styles.quickAddBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
                    onPress={() => addWater(amount)}
                  >
                    <MaterialCommunityIcons name="cup-water" size={20} color="#fff" />
                    <Text style={styles.quickAddBtnTextWhite}>+{amount}oz</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </ImageBackground>

        {/* View Mode Toggle */}
        <View style={styles.viewToggleContainer}>
          {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[
                styles.viewToggleBtn,
                viewMode === mode && styles.viewToggleBtnActive
              ]}
              onPress={() => setViewMode(mode)}
            >
              <Text style={[
                styles.viewToggleText,
                viewMode === mode && styles.viewToggleTextActive
              ]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Daily View */}
        {viewMode === 'daily' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daily Log</Text>
            {dailyLogs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="water-outline" size={48} color={colors.text.muted} />
                <Text style={styles.emptyText}>No water logged yet</Text>
                <Text style={styles.emptySubtext}>Start tracking your hydration</Text>
              </View>
            ) : (
              dailyLogs.slice(0, 14).map((day) => (
                <View key={day.date} style={styles.dailyCard}>
                  <View style={styles.dailyHeader}>
                    <View style={styles.dailyDateContainer}>
                      <View style={[styles.dailyIcon, day.goalMet && styles.dailyIconMet]}>
                        <Ionicons 
                          name={day.goalMet ? "checkmark-circle" : "water"} 
                          size={24} 
                          color={day.goalMet ? '#10B981' : '#06B6D4'} 
                        />
                      </View>
                      <View>
                        <Text style={styles.dailyDateLabel}>{day.dateLabel}</Text>
                        <Text style={styles.dailyEntryCount}>
                          {day.entries.length} entr{day.entries.length !== 1 ? 'ies' : 'y'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.dailyTotalContainer}>
                      <Text style={styles.dailyTotal}>{Math.round(day.total)}oz</Text>
                      <Text style={[
                        styles.dailyGoalStatus,
                        { color: day.goalMet ? '#10B981' : colors.text.muted }
                      ]}>
                        {day.goalMet ? 'Goal met!' : `${Math.round(day.percentage)}%`}
                      </Text>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressFill,
                        { 
                          width: `${Math.min(day.percentage, 100)}%`,
                          backgroundColor: day.goalMet ? '#10B981' : '#06B6D4'
                        }
                      ]} 
                    />
                  </View>

                  {/* Entry times - with delete buttons */}
                  <View style={styles.entryTimes}>
                    {day.entries.slice(0, 6).map((entry, idx) => (
                      <WaterEntryItem key={entry.water_id || idx} entry={entry} />
                    ))}
                    {day.entries.length > 6 && (
                      <View style={styles.entryChipMore}>
                        <Text style={styles.entryChipText}>+{day.entries.length - 6} more</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Weekly View */}
        {viewMode === 'weekly' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekly Summary</Text>
            {weeklyStats.map((week, index) => (
              <View key={index} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryLabel}>{week.label}</Text>
                  <View style={styles.summaryBadge}>
                    <Text style={styles.summaryBadgeText}>{week.goalDays}/7 goals met</Text>
                  </View>
                </View>
                
                <View style={styles.summaryStats}>
                  <View style={styles.summaryStatItem}>
                    <Ionicons name="water" size={24} color="#06B6D4" />
                    <Text style={styles.summaryStatValue}>{Math.round(week.total)}</Text>
                    <Text style={styles.summaryStatLabel}>Total oz</Text>
                  </View>
                  <View style={styles.summaryStatDivider} />
                  <View style={styles.summaryStatItem}>
                    <Ionicons name="stats-chart" size={24} color={accent.primary} />
                    <Text style={styles.summaryStatValue}>{Math.round(week.average)}</Text>
                    <Text style={styles.summaryStatLabel}>Avg/day</Text>
                  </View>
                  <View style={styles.summaryStatDivider} />
                  <View style={styles.summaryStatItem}>
                    <Ionicons name="calendar" size={24} color="#F59E0B" />
                    <Text style={styles.summaryStatValue}>{week.days}</Text>
                    <Text style={styles.summaryStatLabel}>Days logged</Text>
                  </View>
                </View>

                {/* Weekly goal progress */}
                <View style={styles.goalProgress}>
                  <View style={styles.goalProgressBar}>
                    <View 
                      style={[
                        styles.goalProgressFill,
                        { width: `${(week.goalDays / 7) * 100}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.goalProgressText}>
                    {week.goalDays === 7 ? '🎉 Perfect week!' : `${7 - week.goalDays} more days to go`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Monthly View */}
        {viewMode === 'monthly' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly Summary</Text>
            {monthlyStats.map((month, index) => (
              <View key={index} style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryLabel}>{month.label}</Text>
                  <View style={styles.summaryBadge}>
                    <Text style={styles.summaryBadgeText}>{month.goalDays} goals met</Text>
                  </View>
                </View>
                
                <View style={styles.summaryStats}>
                  <View style={styles.summaryStatItem}>
                    <Ionicons name="water" size={24} color="#06B6D4" />
                    <Text style={styles.summaryStatValue}>{(month.total / 128).toFixed(1)}</Text>
                    <Text style={styles.summaryStatLabel}>Gallons</Text>
                  </View>
                  <View style={styles.summaryStatDivider} />
                  <View style={styles.summaryStatItem}>
                    <Ionicons name="stats-chart" size={24} color={accent.primary} />
                    <Text style={styles.summaryStatValue}>{Math.round(month.average)}</Text>
                    <Text style={styles.summaryStatLabel}>Avg oz/day</Text>
                  </View>
                  <View style={styles.summaryStatDivider} />
                  <View style={styles.summaryStatItem}>
                    <Ionicons name="trophy" size={24} color="#10B981" />
                    <Text style={styles.summaryStatValue}>{month.goalDays}</Text>
                    <Text style={styles.summaryStatLabel}>Goals met</Text>
                  </View>
                </View>

                {/* Monthly breakdown */}
                <View style={styles.monthlyBreakdown}>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Total Days Logged</Text>
                    <Text style={styles.breakdownValue}>{month.days}</Text>
                  </View>
                  <View style={styles.breakdownItem}>
                    <Text style={styles.breakdownLabel}>Total Ounces</Text>
                    <Text style={styles.breakdownValue}>{Math.round(month.total).toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Hydration Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Hydration Tips</Text>
          <View style={styles.tipItem}>
            <Ionicons name="sunny" size={20} color="#F59E0B" />
            <Text style={styles.tipText}>Drink water first thing in the morning</Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="alarm" size={20} color={accent.primary} />
            <Text style={styles.tipText}>Set reminders every 2 hours</Text>
          </View>
          <View style={styles.tipItem}>
            <Ionicons name="fitness" size={20} color="#10B981" />
            <Text style={styles.tipText}>Drink extra during workouts</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background.primary,
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
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  // Today's Progress Card
  todayCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  todayCardBg: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  todayCardBgImage: {
    borderRadius: 20,
  },
  todayCardOverlay: {
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  todayTitleWhite: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  goalBadge: {
    backgroundColor: theme.colors.background.elevated,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  goalBadgeMet: {
    backgroundColor: '#10B98120',
  },
  goalBadgeMetWhite: {
    backgroundColor: 'rgba(16, 185, 129, 0.4)',
  },
  goalBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  goalBadgeTextWhite: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  goalBadgeTextMet: {
    color: '#10B981',
  },
  goalBadgeTextMetWhite: {
    color: '#fff',
  },
  todayContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    marginRight: 24,
  },
  todayStats: {
    flex: 1,
  },
  todayAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: '#06B6D4',
  },
  todayAmountWhite: {
    fontSize: 48,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  todayUnit: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginTop: -8,
  },
  todayUnitWhite: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    marginTop: -8,
  },
  todayPercentage: {
    fontSize: 14,
    color: theme.colors.text.muted,
    marginTop: 8,
  },
  todayPercentageWhite: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
  },
  todayRemaining: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginTop: 4,
  },
  todayRemainingWhite: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginTop: 4,
  },
  quickAddContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    paddingTop: 16,
  },
  quickAddLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
    marginBottom: 12,
  },
  quickAddLabelWhite: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  quickAddButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  quickAddBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#06B6D420',
    paddingVertical: 12,
    borderRadius: 12,
  },
  quickAddBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#06B6D4',
  },
  quickAddBtnTextWhite: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  // View Toggle
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  viewToggleBtnActive: {
    backgroundColor: '#06B6D4',
  },
  viewToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  viewToggleTextActive: {
    color: '#fff',
  },
  // Section
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 16,
  },
  // Daily Card
  dailyCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  dailyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dailyDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dailyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#06B6D420',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dailyIconMet: {
    backgroundColor: '#10B98120',
  },
  dailyDateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
  },
  dailyEntryCount: {
    fontSize: 13,
    color: theme.colors.text.muted,
  },
  dailyTotalContainer: {
    alignItems: 'flex-end',
  },
  dailyTotal: {
    fontSize: 20,
    fontWeight: '700',
    color: '#06B6D4',
  },
  dailyGoalStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.colors.background.elevated,
    borderRadius: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  entryTimes: {
    flexDirection: 'column',
    gap: 8,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryChip: {
    flex: 1,
    backgroundColor: theme.colors.background.elevated,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  entryChipMore: {
    backgroundColor: theme.colors.background.elevated,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  entryChipText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  deleteIconButton: {
    padding: 4,
  },
  // Summary Cards
  summaryCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.primary,
  },
  summaryBadge: {
    backgroundColor: '#06B6D420',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  summaryBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#06B6D4',
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  summaryStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginTop: 8,
  },
  summaryStatLabel: {
    fontSize: 12,
    color: theme.colors.text.muted,
    marginTop: 4,
  },
  summaryStatDivider: {
    width: 1,
    backgroundColor: theme.colors.border.primary,
  },
  goalProgress: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.primary,
    paddingTop: 12,
  },
  goalProgressBar: {
    height: 8,
    backgroundColor: theme.colors.background.elevated,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  goalProgressText: {
    fontSize: 13,
    color: theme.colors.text.secondary,
    textAlign: 'center',
  },
  monthlyBreakdown: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border.primary,
  },
  breakdownItem: {
    alignItems: 'center',
  },
  breakdownLabel: {
    fontSize: 12,
    color: theme.colors.text.muted,
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginTop: 4,
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text.primary,
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.colors.text.muted,
    marginTop: 4,
  },
  // Tips
  tipsCard: {
    backgroundColor: theme.colors.background.card,
    borderRadius: 16,
    padding: 16,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.primary,
    marginBottom: 12,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  tipText: {
    fontSize: 14,
    color: theme.colors.text.secondary,
  },
  // Premium Gate Styles
  premiumGateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  premiumGateContent: {
    alignItems: 'center',
    maxWidth: 340,
  },
  premiumIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  premiumGateTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  premiumGateSubtitle: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  premiumGateFeatures: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  premiumFeatureList: {
    alignSelf: 'stretch',
    marginBottom: 24,
  },
  premiumFeatureItem: {
    fontSize: 15,
    marginBottom: 8,
    paddingLeft: 8,
  },
  premiumUpgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    gap: 10,
    width: '100%',
  },
  premiumUpgradeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  premiumLearnMore: {
    marginTop: 16,
    padding: 8,
  },
  premiumLearnMoreText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width } = Dimensions.get('window');

type TabType = 'overview' | 'badges' | 'challenges';

export default function BadgesScreen() {
  const { userId } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  
  // Data states
  const [summary, setSummary] = useState<any>(null);
  const [badgesData, setBadgesData] = useState<any>(null);
  const [dailyChallenges, setDailyChallenges] = useState<any>(null);
  const [weeklyChallenges, setWeeklyChallenges] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [checkingBadges, setCheckingBadges] = useState(false);
  const [resettingRewards, setResettingRewards] = useState(false);
  const [resettingChallenges, setResettingChallenges] = useState(false);
  
  // Modal
  const [selectedBadge, setSelectedBadge] = useState<any>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const requests = [
        axios.get(`${API_URL}/api/gamification/leaderboard?limit=10`),
      ];
      
      if (userId) {
        requests.push(
          axios.get(`${API_URL}/api/gamification/summary/${userId}`),
          axios.get(`${API_URL}/api/gamification/user-badges/${userId}`),
          axios.get(`${API_URL}/api/challenges/daily/${userId}`),
          axios.get(`${API_URL}/api/challenges/weekly/${userId}`),
        );
      }
      
      const results = await Promise.all(requests);
      
      setLeaderboard(results[0].data.leaderboard || []);
      
      if (userId && results.length > 1) {
        setSummary(results[1].data);
        setBadgesData(results[2].data);
        setDailyChallenges(results[3].data);
        setWeeklyChallenges(results[4].data);
      }
    } catch (error) {
      console.error('Error loading gamification data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const checkForNewBadges = async () => {
    if (!userId) return;
    
    setCheckingBadges(true);
    try {
      const response = await axios.post(`${API_URL}/api/gamification/check-badges/${userId}`);
      if (response.data.new_badges_awarded?.length > 0) {
        loadData();
      }
    } catch (error) {
      console.error('Error checking badges:', error);
    } finally {
      setCheckingBadges(false);
    }
  };

  const handleResetRewards = () => {
    Alert.alert(
      '⚠️ Reset All Rewards & Badges',
      'WARNING: This will permanently delete:\n\n• All earned BADGES\n• All challenge completions\n• All points and progress\n• Your leaderboard position\n\nYou will start completely fresh. This action CANNOT be undone.\n\nAre you sure you want to reset everything?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Reset Everything',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            
            setResettingRewards(true);
            try {
              await axios.delete(`${API_URL}/api/gamification/reset/${userId}`);
              Alert.alert(
                '✅ Reset Complete', 
                'All rewards and badges have been reset.\n\nYour fitness journey starts fresh - go earn those badges again!'
              );
              loadData();
            } catch (error) {
              console.error('Error resetting rewards:', error);
              Alert.alert('Error', 'Failed to reset rewards. Please try again.');
            } finally {
              setResettingRewards(false);
            }
          },
        },
      ]
    );
  };

  const handleResetChallenges = () => {
    Alert.alert(
      'Reset All Challenges',
      'Are you sure you want to reset all challenge progress? This will clear your daily and weekly challenge progress but keep your badges. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Challenges',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            
            setResettingChallenges(true);
            try {
              await axios.delete(`${API_URL}/api/challenges/reset/${userId}`);
              Alert.alert('Success', 'All challenges have been reset. Complete them again to earn rewards!');
              loadData();
            } catch (error) {
              console.error('Error resetting challenges:', error);
              Alert.alert('Error', 'Failed to reset challenges. Please try again.');
            } finally {
              setResettingChallenges(false);
            }
          },
        },
      ]
    );
  };

  const getCategoryColor = (category: string) => {
    const colors: any = {
      starter: '#10B981',
      streak: '#F59E0B',
      running: '#3B82F6',
      fitness: '#EC4899',
      nutrition: '#8B5CF6',
      weights: '#EF4444',
      special: '#6366F1',
    };
    return colors[category] || Colors.brand.primary;
  };

  const renderProgressBar = (progress: number, target: number, color: string) => {
    const percentage = Math.min(100, (progress / target) * 100);
    return (
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBg}>
          <LinearGradient
            colors={[color, color + 'CC']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressBarFill, { width: `${percentage}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {progress.toLocaleString()} / {target.toLocaleString()}
        </Text>
      </View>
    );
  };

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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards & Challenges</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        {(['overview', 'badges', 'challenges'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'overview' && (
          <>
            {/* Level Card */}
            <LinearGradient
              colors={['#667eea', '#764ba2']}
              style={styles.levelCard}
            >
              <View style={styles.levelHeader}>
                <View style={styles.levelBadge}>
                  <Text style={styles.levelNumber}>{summary?.level || 1}</Text>
                </View>
                <View style={styles.levelInfo}>
                  <Text style={styles.levelName}>{summary?.level_name || 'Beginner'}</Text>
                  <Text style={styles.totalPoints}>{summary?.total_points || 0} points</Text>
                </View>
              </View>
              
              {summary?.level < 10 && (
                <View style={styles.levelProgress}>
                  <View style={styles.levelProgressBar}>
                    <View 
                      style={[
                        styles.levelProgressFill, 
                        { width: `${summary?.progress_to_next || 0}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.levelProgressText}>
                    {summary?.points_for_next_level - summary?.total_points || 0} pts to next level
                  </Text>
                </View>
              )}
              
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{summary?.badges_earned || 0}</Text>
                  <Text style={styles.statLabel}>Badges</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{summary?.badge_points || 0}</Text>
                  <Text style={styles.statLabel}>Badge Pts</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{summary?.challenge_points || 0}</Text>
                  <Text style={styles.statLabel}>Challenge Pts</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Daily Challenges Preview */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Today's Challenges</Text>
                <TouchableOpacity onPress={() => setActiveTab('challenges')}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
              
              {dailyChallenges?.challenges?.slice(0, 2).map((challenge: any) => (
                <View key={challenge.id} style={styles.challengeCard}>
                  <View style={styles.challengeInfo}>
                    <Text style={styles.challengeName}>{challenge.name}</Text>
                    <Text style={styles.challengeDesc}>{challenge.description}</Text>
                    {renderProgressBar(
                      challenge.progress || 0,
                      challenge.target,
                      challenge.completed ? '#10B981' : '#3B82F6'
                    )}
                  </View>
                  <View style={styles.challengeReward}>
                    {challenge.completed ? (
                      <Ionicons name="checkmark-circle" size={32} color="#10B981" />
                    ) : (
                      <>
                        <Ionicons name="star" size={20} color="#F59E0B" />
                        <Text style={styles.challengePoints}>{challenge.points}</Text>
                      </>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Recent Badges */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent Badges</Text>
                <TouchableOpacity onPress={() => setActiveTab('badges')}>
                  <Text style={styles.seeAll}>See All</Text>
                </TouchableOpacity>
              </View>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.badgesRow}>
                  {badgesData?.badges?.filter((b: any) => b.earned).slice(0, 5).map((badge: any) => (
                    <TouchableOpacity 
                      key={badge.id} 
                      style={styles.badgeMini}
                      onPress={() => setSelectedBadge(badge)}
                    >
                      <View style={[styles.badgeMiniIcon, { backgroundColor: getCategoryColor(badge.category) + '20' }]}>
                        <Text style={styles.badgeEmoji}>{badge.icon}</Text>
                      </View>
                      <Text style={styles.badgeMiniName} numberOfLines={1}>{badge.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {(!badgesData?.badges?.filter((b: any) => b.earned).length) && (
                    <View style={styles.noBadges}>
                      <Ionicons name="trophy-outline" size={32} color={Colors.text.muted} />
                      <Text style={styles.noBadgesText}>No badges yet</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            {/* Leaderboard Preview */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏆 Top Players</Text>
              {leaderboard.slice(0, 3).map((user, index) => (
                <View 
                  key={user.user_id}
                  style={[
                    styles.leaderboardItem,
                    index === 0 && styles.leaderboardFirst,
                    user.user_id === userId && styles.leaderboardYou
                  ]}
                >
                  <View style={[
                    styles.rankBadge,
                    index === 0 && styles.rankFirst,
                    index === 1 && styles.rankSecond,
                    index === 2 && styles.rankThird,
                  ]}>
                    <Text style={styles.rankText}>#{user.rank}</Text>
                  </View>
                  <View style={styles.leaderboardInfo}>
                    <Text style={styles.leaderboardName}>
                      {user.name}{user.user_id === userId && ' (You)'}
                    </Text>
                    <Text style={styles.leaderboardBadges}>{user.badge_count} badges</Text>
                  </View>
                  <View style={styles.leaderboardPoints}>
                    <Ionicons name="star" size={16} color="#F59E0B" />
                    <Text style={styles.leaderboardPointsText}>{user.total_points}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Reset Rewards Button */}
            <View style={styles.resetSection}>
              <TouchableOpacity 
                style={styles.resetButton}
                onPress={handleResetRewards}
                disabled={resettingRewards}
              >
                {resettingRewards ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    <Text style={styles.resetButtonText}>Reset All Badges & Rewards</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.resetHint}>⚠️ This will delete ALL badges, points & progress</Text>
            </View>
          </>
        )}

        {activeTab === 'badges' && (
          <>
            {/* Check Badges Button */}
            <TouchableOpacity 
              style={styles.checkBadgesBtn}
              onPress={checkForNewBadges}
              disabled={checkingBadges}
            >
              {checkingBadges ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="refresh" size={20} color="#fff" />
                  <Text style={styles.checkBadgesBtnText}>Check for New Badges</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Badges by Category */}
            {['starter', 'streak', 'running', 'fitness', 'nutrition', 'weights', 'special'].map(category => {
              const categoryBadges = badgesData?.badges?.filter((b: any) => b.category === category) || [];
              if (categoryBadges.length === 0) return null;
              
              const categoryNames: any = {
                starter: '🚀 Getting Started',
                streak: '🔥 Streaks',
                running: '🏃 Running',
                fitness: '💪 Fitness',
                nutrition: '🥗 Nutrition',
                weights: '🏋️ Weight Training',
                special: '⭐ Special',
              };
              
              return (
                <View key={category} style={styles.badgeCategory}>
                  <Text style={styles.categoryTitle}>{categoryNames[category]}</Text>
                  <View style={styles.badgesGrid}>
                    {categoryBadges.map((badge: any) => (
                      <TouchableOpacity
                        key={badge.id}
                        style={[
                          styles.badgeCard,
                          !badge.earned && styles.badgeCardLocked
                        ]}
                        onPress={() => setSelectedBadge(badge)}
                      >
                        <View style={[
                          styles.badgeIconContainer,
                          badge.earned 
                            ? { backgroundColor: getCategoryColor(category) + '20' }
                            : styles.badgeIconLocked
                        ]}>
                          <Text style={styles.badgeEmojiLarge}>{badge.icon}</Text>
                        </View>
                        <Text style={[
                          styles.badgeName,
                          !badge.earned && styles.badgeNameLocked
                        ]}>
                          {badge.name}
                        </Text>
                        <View style={styles.badgePoints}>
                          <Ionicons 
                            name="star" 
                            size={12} 
                            color={badge.earned ? '#F59E0B' : '#9CA3AF'} 
                          />
                          <Text style={[
                            styles.badgePointsText,
                            !badge.earned && styles.badgePointsLocked
                          ]}>
                            {badge.points} pts
                          </Text>
                        </View>
                        {badge.earned && (
                          <View style={styles.earnedBadge}>
                            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {activeTab === 'challenges' && (
          <>
            {/* Daily Challenges */}
            <View style={styles.section}>
              <View style={styles.challengeHeader}>
                <Ionicons name="sunny" size={24} color="#F59E0B" />
                <Text style={styles.challengeHeaderTitle}>Daily Challenges</Text>
                <View style={styles.challengeCount}>
                  <Text style={styles.challengeCountText}>
                    {dailyChallenges?.completed_count || 0}/{dailyChallenges?.total_count || 0}
                  </Text>
                </View>
              </View>
              
              {dailyChallenges?.challenges?.map((challenge: any) => (
                <View key={challenge.id} style={[
                  styles.challengeCardFull,
                  challenge.completed && styles.challengeCardCompleted
                ]}>
                  <View style={styles.challengeCardHeader}>
                    <Text style={styles.challengeCardName}>{challenge.name}</Text>
                    <View style={styles.challengeCardReward}>
                      <Ionicons name="star" size={16} color="#F59E0B" />
                      <Text style={styles.challengeCardPoints}>{challenge.points} pts</Text>
                    </View>
                  </View>
                  <Text style={styles.challengeCardDesc}>{challenge.description}</Text>
                  {renderProgressBar(
                    challenge.progress || 0,
                    challenge.target,
                    challenge.completed ? '#10B981' : '#3B82F6'
                  )}
                  {challenge.completed && (
                    <View style={styles.completedBanner}>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      <Text style={styles.completedText}>Completed!</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Weekly Challenges */}
            <View style={styles.section}>
              <View style={styles.challengeHeader}>
                <Ionicons name="calendar" size={24} color="#8B5CF6" />
                <Text style={styles.challengeHeaderTitle}>Weekly Challenges</Text>
                <View style={[styles.challengeCount, { backgroundColor: '#8B5CF620' }]}>
                  <Text style={[styles.challengeCountText, { color: '#8B5CF6' }]}>
                    {weeklyChallenges?.completed_count || 0}/{weeklyChallenges?.total_count || 0}
                  </Text>
                </View>
              </View>
              
              {weeklyChallenges?.challenges?.map((challenge: any) => (
                <View key={challenge.id} style={[
                  styles.challengeCardFull,
                  challenge.completed && styles.challengeCardCompleted
                ]}>
                  <View style={styles.challengeCardHeader}>
                    <Text style={styles.challengeCardName}>{challenge.name}</Text>
                    <View style={styles.challengeCardReward}>
                      <Ionicons name="star" size={16} color="#F59E0B" />
                      <Text style={styles.challengeCardPoints}>{challenge.points} pts</Text>
                    </View>
                  </View>
                  <Text style={styles.challengeCardDesc}>{challenge.description}</Text>
                  {renderProgressBar(
                    challenge.progress || 0,
                    challenge.target,
                    challenge.completed ? '#10B981' : '#8B5CF6'
                  )}
                  {challenge.completed && (
                    <View style={styles.completedBanner}>
                      <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                      <Text style={styles.completedText}>Completed!</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>

            {/* Reset Challenges Button */}
            <View style={styles.resetSection}>
              <TouchableOpacity 
                style={styles.resetButton}
                onPress={handleResetChallenges}
                disabled={resettingChallenges}
              >
                {resettingChallenges ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="refresh-circle-outline" size={20} color="#EF4444" />
                    <Text style={styles.resetButtonText}>Reset All Challenges</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.resetHint}>Clear progress and complete challenges again (keeps badges)</Text>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Badge Detail Modal */}
      <Modal
        visible={!!selectedBadge}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBadge(null)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedBadge(null)}
        >
          <View style={styles.modalContent}>
            <View style={[
              styles.modalBadgeIcon,
              { backgroundColor: selectedBadge?.earned 
                ? getCategoryColor(selectedBadge?.category) + '20' 
                : '#E5E7EB' 
              }
            ]}>
              <Text style={styles.modalBadgeEmoji}>{selectedBadge?.icon}</Text>
            </View>
            <Text style={styles.modalBadgeName}>{selectedBadge?.name}</Text>
            <Text style={styles.modalBadgeDesc}>{selectedBadge?.description}</Text>
            <View style={styles.modalBadgePoints}>
              <Ionicons name="star" size={20} color="#F59E0B" />
              <Text style={styles.modalBadgePointsText}>{selectedBadge?.points} points</Text>
            </View>
            {selectedBadge?.earned ? (
              <View style={styles.modalEarned}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                <Text style={styles.modalEarnedText}>Earned!</Text>
              </View>
            ) : (
              <View style={styles.modalLocked}>
                <Ionicons name="lock-closed" size={24} color="#9CA3AF" />
                <Text style={styles.modalLockedText}>Keep going to unlock!</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
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
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.brand.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  levelCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  levelBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  levelNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  levelInfo: {
    flex: 1,
  },
  levelName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  totalPoints: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
  },
  levelProgress: {
    marginBottom: 16,
  },
  levelProgressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 4,
    marginBottom: 8,
  },
  levelProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  levelProgressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  challengeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  challengeInfo: {
    flex: 1,
    marginRight: 12,
  },
  challengeName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 4,
  },
  challengeDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  challengeReward: {
    alignItems: 'center',
  },
  challengePoints: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F59E0B',
    marginTop: 2,
  },
  progressBarContainer: {
    marginTop: 4,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: Colors.text.secondary,
  },
  badgesRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    gap: 12,
  },
  badgeMini: {
    alignItems: 'center',
    width: 80,
  },
  badgeMiniIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeEmoji: {
    fontSize: 24,
  },
  badgeMiniName: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  noBadges: {
    alignItems: 'center',
    padding: 24,
  },
  noBadgesText: {
    fontSize: 14,
    color: Colors.text.muted,
    marginTop: 8,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  leaderboardFirst: {
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  leaderboardYou: {
    backgroundColor: '#EFF6FF',
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankFirst: { backgroundColor: '#F59E0B' },
  rankSecond: { backgroundColor: '#9CA3AF' },
  rankThird: { backgroundColor: '#CD7F32' },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  leaderboardBadges: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  leaderboardPoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leaderboardPointsText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F59E0B',
  },
  checkBadgesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    gap: 8,
  },
  checkBadgesBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  badgeCategory: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    width: (width - 56) / 3,
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    position: 'relative',
  },
  badgeCardLocked: {
    backgroundColor: '#F3F4F6',
  },
  badgeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  badgeIconLocked: {
    backgroundColor: '#E5E7EB',
  },
  badgeEmojiLarge: {
    fontSize: 22,
  },
  badgeName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeNameLocked: {
    color: Colors.text.muted,
  },
  badgePoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  badgePointsText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
  },
  badgePointsLocked: {
    color: '#9CA3AF',
  },
  earnedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  challengeHeaderTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  challengeCount: {
    backgroundColor: '#F59E0B20',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  challengeCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  challengeCardFull: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  challengeCardCompleted: {
    borderWidth: 2,
    borderColor: '#10B981',
  },
  challengeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  challengeCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  challengeCardReward: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  challengeCardPoints: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F59E0B',
  },
  challengeCardDesc: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginBottom: 12,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    padding: 8,
    marginTop: 12,
    gap: 6,
  },
  completedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    width: width - 64,
  },
  modalBadgeIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalBadgeEmoji: {
    fontSize: 48,
  },
  modalBadgeName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  modalBadgeDesc: {
    fontSize: 16,
    color: Colors.text.secondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalBadgePoints: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  modalBadgePointsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F59E0B',
  },
  modalEarned: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  modalEarnedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  modalLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  modalLockedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  resetSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: Colors.border.light,
    alignItems: 'center',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  resetHint: {
    fontSize: 12,
    color: Colors.text.muted,
    marginTop: 8,
  },
});

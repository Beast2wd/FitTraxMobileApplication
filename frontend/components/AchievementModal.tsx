import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../constants/Colors';

const { width } = Dimensions.get('window');

interface Achievement {
  type: 'badge' | 'challenge' | 'streak' | 'level';
  name: string;
  description?: string;
  icon?: string;
  points?: number;
  level?: number;
}

interface AchievementModalProps {
  visible: boolean;
  achievement: Achievement | null;
  onClose: () => void;
}

export const AchievementModal: React.FC<AchievementModalProps> = ({
  visible,
  achievement,
  onClose,
}) => {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pointsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && achievement) {
      // Reset animations
      scaleAnim.setValue(0);
      rotateAnim.setValue(0);
      pointsAnim.setValue(0);

      // Play celebration animation
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 4,
          tension: 40,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pointsAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [visible, achievement]);

  if (!achievement) return null;

  const getGradientColors = (): [string, string] => {
    switch (achievement.type) {
      case 'badge':
        return ['#667eea', '#764ba2'];
      case 'challenge':
        return ['#F59E0B', '#EF4444'];
      case 'streak':
        return ['#EF4444', '#EC4899'];
      case 'level':
        return ['#10B981', '#3B82F6'];
      default:
        return ['#667eea', '#764ba2'];
    }
  };

  const getTypeLabel = () => {
    switch (achievement.type) {
      case 'badge':
        return 'Badge Earned!';
      case 'challenge':
        return 'Challenge Complete!';
      case 'streak':
        return 'Streak Milestone!';
      case 'level':
        return 'Level Up!';
      default:
        return 'Achievement Unlocked!';
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const pointsTranslate = pointsAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
          // Prevent tap from propagating to overlay
          onStartShouldSetResponder={() => true}
        >
          <LinearGradient
            colors={getGradientColors()}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Confetti particles (simplified) */}
            <View style={styles.confettiContainer}>
              {[...Array(8)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.confetti,
                    {
                      left: `${10 + (i * 12)}%`,
                      backgroundColor: i % 2 === 0 ? '#FFD700' : '#FF6B6B',
                      transform: [{ rotate: `${i * 45}deg` }],
                    },
                  ]}
                />
              ))}
            </View>

            {/* Close button */}
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            {/* Achievement Type Label */}
            <Text style={styles.typeLabel}>{getTypeLabel()}</Text>

            {/* Icon/Emoji */}
            <Animated.View
              style={[
                styles.iconContainer,
                { transform: [{ rotate: spin }] },
              ]}
            >
              <Text style={styles.icon}>
                {achievement.icon || (achievement.type === 'level' ? '⭐' : '🏆')}
              </Text>
            </Animated.View>

            {/* Achievement Name */}
            <Text style={styles.name}>{achievement.name}</Text>

            {/* Description */}
            {achievement.description && (
              <Text style={styles.description}>{achievement.description}</Text>
            )}

            {/* Points/Level Display */}
            {achievement.points && (
              <Animated.View
                style={[
                  styles.pointsContainer,
                  {
                    opacity: pointsAnim,
                    transform: [{ translateY: pointsTranslate }],
                  },
                ]}
              >
                <Ionicons name="star" size={24} color="#FFD700" />
                <Text style={styles.pointsText}>+{achievement.points} points</Text>
              </Animated.View>
            )}

            {achievement.level && (
              <Animated.View
                style={[
                  styles.levelContainer,
                  {
                    opacity: pointsAnim,
                    transform: [{ translateY: pointsTranslate }],
                  },
                ]}
              >
                <Text style={styles.levelText}>Level {achievement.level}</Text>
              </Animated.View>
            )}

            {/* Continue Button */}
            <TouchableOpacity style={styles.continueButton} onPress={onClose}>
              <Text style={styles.continueText}>Awesome!</Text>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: width - 48,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  gradient: {
    padding: 32,
    alignItems: 'center',
  },
  confettiContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  confetti: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    top: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 16,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 48,
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  pointsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 24,
    gap: 8,
  },
  pointsText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  levelContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    marginBottom: 24,
  },
  levelText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  continueButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderRadius: 25,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#667eea',
  },
});

export default AchievementModal;

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

export const CustomSplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animate logo appearance
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 50,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(600),
    ]).start(() => {
      onFinish();
    });
  }, []);

  return (
    <View style={styles.container}>
      {/* Logo Icon */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            transform: [{ scale: logoScale }],
            opacity: logoOpacity,
          },
        ]}
      >
        <View style={styles.logoOuter}>
          <View style={styles.logoInner}>
            <Text style={styles.logoLetter}>F</Text>
            <View style={styles.heartbeatLine}>
              <View style={styles.heartbeatDot} />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* App Name */}
      <Animated.View style={[styles.textContainer, { opacity: textOpacity }]}>
        <Text style={styles.title}>
          Fit<Text style={styles.titleAccent}>Trax+</Text>
        </Text>
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={{ opacity: taglineOpacity }}>
        <Text style={styles.tagline}>TRAIN • TRACK • TRANSFORM</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  logoInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoLetter: {
    fontSize: 48,
    fontWeight: '800',
    color: '#3B82F6',
    marginRight: 4,
  },
  heartbeatLine: {
    width: 40,
    height: 3,
    backgroundColor: '#3B82F6',
    borderRadius: 2,
    position: 'relative',
  },
  heartbeatDot: {
    position: 'absolute',
    right: -8,
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3B82F6',
  },
  textContainer: {
    marginBottom: 8,
  },
  title: {
    fontSize: 48,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  titleAccent: {
    color: '#3B82F6',
  },
  tagline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#71717A',
    letterSpacing: 3,
  },
});

export default CustomSplashScreen;

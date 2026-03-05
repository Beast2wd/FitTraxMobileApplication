import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, G } from 'react-native-svg';
import { useThemeStore } from '../stores/themeStore';

interface FitTraxLogoProps {
  size?: 'small' | 'medium' | 'large' | 'xlarge';
  showText?: boolean;
  variant?: 'full' | 'icon';
}

const sizes = {
  small: { icon: 40, fontSize: 18, subtitleSize: 8 },
  medium: { icon: 56, fontSize: 24, subtitleSize: 10 },
  large: { icon: 80, fontSize: 32, subtitleSize: 12 },
  xlarge: { icon: 100, fontSize: 36, subtitleSize: 14 },
};

export const FitTraxLogo: React.FC<FitTraxLogoProps> = ({ 
  size = 'medium', 
  showText = true,
  variant = 'full'
}) => {
  const { theme } = useThemeStore();
  const { icon: iconSize, fontSize, subtitleSize } = sizes[size];
  const gradientColors = theme.accentColors.gradient;
  
  // Use column layout for large and xlarge sizes to prevent cutoff
  const isLargeSize = size === 'large' || size === 'xlarge';

  return (
    <View style={[styles.container, isLargeSize && styles.containerColumn]}>
      <View style={[styles.iconWrapper, { width: iconSize, height: iconSize }]}>
        <Svg width={iconSize} height={iconSize} viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={gradientColors[0]} />
              <Stop offset="100%" stopColor={gradientColors[1]} />
            </LinearGradient>
            <LinearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={gradientColors[0]} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={gradientColors[1]} stopOpacity="0.1" />
            </LinearGradient>
          </Defs>
          
          {/* Background glow */}
          <Circle cx="50" cy="50" r="48" fill="url(#glowGradient)" />
          
          {/* Outer ring */}
          <Circle 
            cx="50" 
            cy="50" 
            r="45" 
            stroke="url(#logoGradient)" 
            strokeWidth="3" 
            fill="none"
            strokeLinecap="round"
          />
          
          {/* Progress arc (decorative) */}
          <Path
            d="M 50 8 A 42 42 0 0 1 92 50"
            stroke={gradientColors[0]}
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            opacity="0.8"
          />
          
          {/* Stylized F + heartbeat/pulse line */}
          <G>
            {/* F letter stylized as fitness icon */}
            <Path
              d="M 32 28 L 32 72 M 32 28 L 52 28 M 32 48 L 48 48"
              stroke="url(#logoGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            
            {/* Heartbeat/pulse line representing fitness tracking */}
            <Path
              d="M 48 50 L 54 50 L 58 35 L 64 65 L 70 42 L 76 58 L 80 50 L 86 50"
              stroke="url(#logoGradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </G>
          
          {/* Small dot indicator (like active tracking) */}
          <Circle cx="86" cy="14" r="6" fill={gradientColors[0]}>
            {/* This could be animated in the future */}
          </Circle>
        </Svg>
      </View>
      
      {showText && variant === 'full' && (
        <View style={[styles.textContainer, isLargeSize && styles.textContainerCenter]}>
          <Text style={[
            styles.title, 
            { fontSize, color: theme.colors.text.primary }
          ]}>
            Fit<Text style={{ color: theme.accentColors.primary }}>Trax+</Text>
          </Text>
          <Text style={[
            styles.subtitle, 
            { fontSize: subtitleSize, color: theme.colors.text.muted },
            isLargeSize && styles.subtitleCenter
          ]}>
            TRAIN • TRACK • TRANSFORM
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  containerColumn: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    marginLeft: 12,
    alignItems: 'flex-start',
  },
  textContainerCenter: {
    marginLeft: 0,
    marginTop: 16,
    alignItems: 'center',
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontWeight: '600',
    letterSpacing: 1.5,
    marginTop: 2,
    opacity: 0.7,
  },
  subtitleCenter: {
    textAlign: 'center',
  },
});

export default FitTraxLogo;

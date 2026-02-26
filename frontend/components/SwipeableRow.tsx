import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

interface SwipeableRowProps {
  children: React.ReactNode;
  onDelete: () => void;
  deleteLabel?: string;
  enabled?: boolean;
}

export const SwipeableRow: React.FC<SwipeableRowProps> = ({
  children,
  onDelete,
  deleteLabel = 'Delete',
  enabled = true,
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0.5],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [1, 0.8, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.rightActionsContainer, { opacity }]}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            swipeableRef.current?.close();
            onDelete();
          }}
        >
          <Animated.View style={[styles.deleteContent, { transform: [{ scale }] }]}>
            <Ionicons name="trash" size={24} color="#fff" />
            <Text style={styles.deleteText}>{deleteLabel}</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={40}
      overshootRight={false}
      friction={2}
    >
      {children}
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  rightActionsContainer: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    flex: 1,
    width: '100%',
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  deleteContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});

export default SwipeableRow;

import { Tabs } from 'expo-router';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../stores/themeStore';
import { useUserStore } from '../../stores/userStore';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const { theme } = useThemeStore();
  const { membershipStatus } = useUserStore();
  const { t } = useTranslation();
  const colors = theme.colors;
  const accent = theme.accentColors;
  const isPremium = membershipStatus?.is_premium || false;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: accent.primary,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarStyle: {
          backgroundColor: colors.background.secondary,
          borderTopWidth: 1,
          borderTopColor: colors.border.primary,
          paddingBottom: 8,
          paddingTop: 8,
          height: 65,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: t('tabs.plans'),
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="fitness-center" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: t('tabs.scan'),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="scan" size={size} color={color} />
              {!isPremium && (
                <View style={styles.premiumBadge}>
                  <Ionicons name="diamond" size={8} color="#fff" />
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  premiumBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#8B5CF6',
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

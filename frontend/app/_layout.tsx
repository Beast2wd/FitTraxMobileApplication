import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { storage, getTosAcceptance } from '../services/storage';
import { CustomSplashScreen } from '../components/CustomSplashScreen';
import '../services/i18n'; // Initialize i18n

export default function RootLayout() {
  const { setUserId, setProfile, setTosAccepted, tosAccepted, profile } = useUserStore();
  const { theme } = useThemeStore();
  const [showSplash, setShowSplash] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  const colors = theme.colors;

  useEffect(() => {
    // Load user data on app start
    const loadUserData = async () => {
      try {
        const userId = await storage.getUserId();
        const userProfile = await storage.getUserProfile();
        const tosAcceptance = await getTosAcceptance();
        
        if (userId) setUserId(userId);
        if (userProfile) setProfile(userProfile);
        if (tosAcceptance) setTosAccepted(tosAcceptance);
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setIsReady(true);
      }
    };
    loadUserData();
  }, []);

  // Handle navigation based on TOS and onboarding status
  useEffect(() => {
    if (!isReady || showSplash) return;

    const inTosScreen = segments[0] === 'terms-of-service';
    const inOnboardingScreen = segments[0] === 'onboarding';
    const inFitnessGoalsScreen = segments[0] === 'fitness-goals';
    const inTabsScreen = segments[0] === '(tabs)';
    
    // Check if TOS has been accepted
    const hasTosAccepted = tosAccepted?.accepted === true;
    // Check if profile has been set up (onboarding complete)
    const hasProfile = profile !== null && profile.name;
    
    // User needs to accept TOS first
    if (!hasTosAccepted && !inTosScreen) {
      router.replace('/terms-of-service');
      return;
    }
    
    // Don't auto-redirect from TOS screen - let TOS screen handle its own navigation
    if (inTosScreen) {
      return;
    }
    
    // Don't redirect away from fitness-goals screen - users should be able to access it anytime
    // This screen is used both during onboarding AND when adjusting goals from Plans tab
    if (inFitnessGoalsScreen) {
      return;
    }
    
    // User has accepted TOS but hasn't set up profile yet
    // Only redirect to onboarding if not already in onboarding flow or tabs
    if (hasTosAccepted && !hasProfile && !inOnboardingScreen && !inTabsScreen) {
      router.replace('/onboarding');
      return;
    }
    
    // User has completed both TOS and profile setup, but is still on onboarding screen
    if (hasTosAccepted && hasProfile && inOnboardingScreen) {
      router.replace('/(tabs)');
      return;
    }
  }, [isReady, showSplash, tosAccepted, profile, segments]);

  // Show splash screen on app load
  if (showSplash) {
    return (
      <>
        <StatusBar style="light" />
        <CustomSplashScreen onFinish={() => setShowSplash(false)} />
      </>
    );
  }

  return (
    <>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.background.secondary,
          },
          headerTintColor: colors.text.primary,
          headerTitleStyle: {
            fontWeight: '600',
            fontSize: 18,
          },
          headerBackTitleVisible: false,
          contentStyle: {
            backgroundColor: colors.background.primary,
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="analytics"
          options={{
            title: 'Analytics',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="heart-rate"
          options={{
            title: 'Heart Rate',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="running"
          options={{
            title: 'Running Tracker',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="schedule"
          options={{
            title: 'Workout Schedule',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="meals-history"
          options={{
            title: 'Meal History',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="membership"
          options={{
            title: 'Premium',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="badges"
          options={{
            title: 'Rewards',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="ai-workouts"
          options={{
            title: 'AI Workouts',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="weight-training"
          options={{
            title: 'Weight Training',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="progress"
          options={{
            title: 'Progress',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="wearables"
          options={{
            title: 'Health & Wearables',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="peptides"
          options={{
            title: 'Peptide Calculator',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="body-scan"
          options={{
            title: 'Body Scan',
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="terms-of-service"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="onboarding"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="fitness-goals"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
            gestureEnabled: false,
          }}
        />
      </Stack>
    </>
  );
}

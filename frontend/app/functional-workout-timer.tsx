import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Vibration,
  Alert,
  Dimensions,
  Switch,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '../stores/themeStore';
import { useUserStore } from '../stores/userStore';
import { Audio } from 'expo-av';
import axios from 'axios';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

interface Station {
  name: string;
  duration: string;
  rest: string;
  description: string;
  image: string;
}

export default function FunctionalWorkoutTimerScreen() {
  const { theme } = useThemeStore();
  const { userId } = useUserStore();
  const params = useLocalSearchParams();
  const colors = theme.colors;
  
  // Parse workout data from params
  const workout = params.workout ? JSON.parse(params.workout as string) : null;
  const stations: Station[] = workout?.stations || [];
  const totalRounds = workout?.rounds || 3;
  
  // Timer state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentStationIndex, setCurrentStationIndex] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [isResting, setIsResting] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  
  // Audio settings
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  
  // Custom duration settings
  const [useCustomDurations, setUseCustomDurations] = useState(false);
  const [customWorkDuration, setCustomWorkDuration] = useState('45');
  const [customRestDuration, setCustomRestDuration] = useState('15');
  const [customRounds, setCustomRounds] = useState(totalRounds.toString());
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const countdownSoundRef = useRef<Audio.Sound | null>(null);

  // Parse duration string like "40s" to seconds
  const parseDuration = (duration: string): number => {
    const match = duration.match(/(\d+)/);
    return match ? parseInt(match[1]) : 30;
  };

  // Get effective durations (custom or preset)
  const getWorkDuration = (station: Station): number => {
    if (useCustomDurations) {
      return parseInt(customWorkDuration) || 45;
    }
    return parseDuration(station.duration);
  };

  const getRestDuration = (station: Station): number => {
    if (useCustomDurations) {
      return parseInt(customRestDuration) || 15;
    }
    return parseDuration(station.rest);
  };

  const getEffectiveRounds = (): number => {
    if (useCustomDurations) {
      return parseInt(customRounds) || 3;
    }
    return totalRounds;
  };

  // Get current station
  const currentStation = stations[currentStationIndex];
  const stationDuration = currentStation ? getWorkDuration(currentStation) : 30;
  const restDuration = currentStation ? getRestDuration(currentStation) : 15;

  // Audio context ref for Web Audio API beeps
  const audioContextRef = useRef<AudioContext | null>(null);

  // Generate beep using Web Audio API (works on web)
  const playWebBeep = (frequency: number, duration: number, volume: number = 0.5) => {
    try {
      if (typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          audioContextRef.current = new AudioContextClass();
        }
        
        const ctx = audioContextRef.current;
        
        // Resume context if suspended (required by browsers)
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        
        // Set initial volume and fade out - MAXIMUM VOLUME
        gainNode.gain.setValueAtTime(volume, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      }
    } catch (error) {
      console.log('Web Audio beep error:', error);
    }
  };

  // Play native sound using expo-av for iOS/Android using online sound files
  const playNativeSound = async (type: 'start' | 'rest' | 'end' | 'countdown' | 'final') => {
    try {
      // Use publicly available sound effect URLs
      const soundUrls: { [key: string]: string } = {
        countdown: 'https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3', // Short beep
        final: 'https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3', // Beep
        start: 'https://cdn.freesound.org/previews/220/220206_1676145-lq.mp3', // Start bell
        rest: 'https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3', // Beep
        end: 'https://cdn.freesound.org/previews/270/270528_5123851-lq.mp3', // Success/complete
      };

      const soundUrl = soundUrls[type];
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: soundUrl },
        { 
          shouldPlay: true, 
          volume: 1.0, // Maximum volume
          isMuted: false,
        }
      );
      
      soundRef.current = sound;
      
      // For countdown/final, play it louder by replaying
      if (type === 'final' || type === 'end') {
        await sound.setVolumeAsync(1.0);
      }
      
      await sound.playAsync();
      
      // Unload after playing
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log('Native sound error:', error);
      // Sound failed, vibration will still work
    }
  };

  // Initialize audio with proper iOS settings for playing in silent mode
  useEffect(() => {
    const setupAudio = async () => {
      try {
        // Configure audio for iOS to play even in silent mode - THIS IS CRITICAL
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true, // Play even when phone is on silent
          staysActiveInBackground: true, // Continue playing in background
          shouldDuckAndroid: false, // Don't lower volume for other apps
          playThroughEarpieceAndroid: false, // Use speaker, not earpiece
          allowsRecordingIOS: false,
          interruptionModeIOS: 0, // MixWithOthers - allows mixing with other audio
          interruptionModeAndroid: 1, // DoNotMix
        });
        console.log('Audio mode configured - playsInSilentModeIOS: true');
      } catch (error) {
        console.log('Audio setup error:', error);
      }
    };
    setupAudio();

    return () => {
      // Cleanup audio context on unmount
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      if (countdownSoundRef.current) {
        countdownSoundRef.current.unloadAsync();
      }
    };
  }, []);

  // Play sound effect - now works on both web and native iOS/Android
  const playSound = async (type: 'start' | 'rest' | 'end' | 'countdown' | 'final') => {
    // Always vibrate for haptic feedback - stronger patterns
    const vibrationPatterns: { [key: string]: number | number[] } = {
      countdown: 100,
      final: 200,
      start: [0, 150, 100, 150],
      rest: 150,
      end: [0, 300, 150, 300, 150, 500],
    };
    Vibration.vibrate(vibrationPatterns[type] || 100);
    
    if (!soundEnabled) {
      return;
    }

    try {
      // Play native sound for iOS/Android
      playNativeSound(type);
      
      // Also play web beep for web platform - MAXIMUM volumes
      switch (type) {
        case 'countdown':
          playWebBeep(880, 0.15, 1.0);
          break;
        case 'final':
          playWebBeep(1100, 0.3, 1.0);
          setTimeout(() => playWebBeep(1100, 0.3, 1.0), 150); // Double beep for emphasis
          break;
        case 'start':
          playWebBeep(660, 0.2, 1.0);
          setTimeout(() => playWebBeep(880, 0.2, 1.0), 200);
          break;
        case 'rest':
          playWebBeep(440, 0.4, 1.0);
          break;
        case 'end':
          playWebBeep(523, 0.3, 1.0);
          setTimeout(() => playWebBeep(659, 0.3, 1.0), 300);
          setTimeout(() => playWebBeep(784, 0.3, 1.0), 600);
          setTimeout(() => playWebBeep(1047, 0.5, 1.0), 900);
          break;
      }
    } catch (error) {
      console.log('Sound playback error:', error);
    }
  };

  // Start workout
  const startWorkout = () => {
    setIsRunning(true);
    setIsPaused(false);
    setCurrentStationIndex(0);
    setCurrentRound(1);
    setIsResting(false);
    setTimeRemaining(getWorkDuration(stations[0]));
    setTotalElapsed(0);
    setWorkoutComplete(false);
    playSound('start');
  };

  // Pause/Resume
  const togglePause = () => {
    setIsPaused(!isPaused);
    if (isPaused) {
      playSound('start');
    }
  };

  // Stop workout
  const stopWorkout = () => {
    Alert.alert(
      'End Workout',
      'Are you sure you want to end this workout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End',
          style: 'destructive',
          onPress: () => {
            setIsRunning(false);
            setIsPaused(false);
            if (timerRef.current) {
              clearInterval(timerRef.current);
            }
          },
        },
      ]
    );
  };

  // Skip to next station
  const skipStation = () => {
    if (currentStationIndex < stations.length - 1) {
      const nextIndex = currentStationIndex + 1;
      setCurrentStationIndex(nextIndex);
      setIsResting(false);
      setTimeRemaining(getWorkDuration(stations[nextIndex]));
      playSound('start');
    } else if (currentRound < getEffectiveRounds()) {
      // Move to next round
      setCurrentRound(prev => prev + 1);
      setCurrentStationIndex(0);
      setIsResting(false);
      setTimeRemaining(getWorkDuration(stations[0]));
      playSound('start');
    }
  };

  // Timer logic
  useEffect(() => {
    if (isRunning && !isPaused && !workoutComplete) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          // Countdown beeps at 5, 4, 3, 2, 1 seconds
          if (prev === 6) {
            playSound('countdown'); // 5 seconds warning
          } else if (prev === 5) {
            playSound('countdown'); // 4 seconds
          } else if (prev === 4) {
            playSound('countdown'); // 3 seconds
          } else if (prev === 3) {
            playSound('countdown'); // 2 seconds
          } else if (prev === 2) {
            playSound('final'); // 1 second - louder beep
          }

          if (prev <= 1) {
            // Time's up for current phase
            if (isResting) {
              // Rest is over, move to next station or round
              const nextStationIndex = currentStationIndex + 1;
              
              if (nextStationIndex >= stations.length) {
                // Round complete
                if (currentRound >= getEffectiveRounds()) {
                  // Workout complete!
                  playSound('end');
                  setWorkoutComplete(true);
                  setIsRunning(false);
                  logCompletedWorkout();
                  return 0;
                } else {
                  // Next round
                  setCurrentRound((r) => r + 1);
                  setCurrentStationIndex(0);
                  setIsResting(false);
                  playSound('start');
                  return getWorkDuration(stations[0]);
                }
              } else {
                // Next station
                setCurrentStationIndex(nextStationIndex);
                setIsResting(false);
                playSound('start');
                return getWorkDuration(stations[nextStationIndex]);
              }
            } else {
              // Work phase is over, start rest
              setIsResting(true);
              playSound('rest');
              return getRestDuration(currentStation);
            }
          }
          return prev - 1;
        });
        
        setTotalElapsed((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRunning, isPaused, isResting, currentStationIndex, currentRound, workoutComplete, currentStation]);

  // Log completed workout to backend
  const logCompletedWorkout = async () => {
    if (!userId) return;
    
    try {
      await axios.post(`${API_URL}/api/workouts`, {
        workout_id: `func_${Date.now()}`,
        user_id: userId,
        workout_type: 'hiit',
        duration: Math.round(totalElapsed / 60),
        calories_burned: Math.round(totalElapsed * 0.15), // Rough estimate
        notes: `Completed ${workout?.name || 'Functional Training'} - ${getEffectiveRounds()} rounds`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error logging workout:', error);
    }
  };

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress
  const effectiveRounds = getEffectiveRounds();
  const totalStations = stations.length * effectiveRounds;
  const completedStations = (currentRound - 1) * stations.length + currentStationIndex + (isResting ? 0.5 : 0);
  const progress = (completedStations / totalStations) * 100;

  // Get color based on state
  const getStateColor = () => {
    if (workoutComplete) return '#10B981';
    if (isResting) return '#F59E0B';
    return '#EF4444';
  };

  // Settings Modal
  const renderSettingsModal = () => (
    <Modal
      visible={showSettings}
      animationType="slide"
      transparent
      onRequestClose={() => setShowSettings(false)}
    >
      <View style={styles.settingsOverlay}>
        <View style={[styles.settingsContainer, { backgroundColor: colors.background.primary }]}>
          <View style={styles.settingsHeader}>
            <Text style={[styles.settingsTitle, { color: colors.text.primary }]}>Workout Settings</Text>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Ionicons name="close" size={28} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.settingsContent}>
            {/* Sound Toggle */}
            <View style={[styles.settingRow, { backgroundColor: colors.background.card }]}>
              <View style={styles.settingInfo}>
                <Ionicons name={soundEnabled ? "volume-high" : "volume-mute"} size={24} color={getStateColor()} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: colors.text.primary }]}>Sound Effects</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>
                    Audio cues for work/rest transitions
                  </Text>
                </View>
              </View>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: colors.background.elevated, true: getStateColor() + '60' }}
                thumbColor={soundEnabled ? getStateColor() : '#f4f3f4'}
              />
            </View>

            {/* Custom Duration Toggle */}
            <View style={[styles.settingRow, { backgroundColor: colors.background.card }]}>
              <View style={styles.settingInfo}>
                <Ionicons name="timer-outline" size={24} color={getStateColor()} />
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: colors.text.primary }]}>Custom Durations</Text>
                  <Text style={[styles.settingDescription, { color: colors.text.secondary }]}>
                    Override preset work/rest times
                  </Text>
                </View>
              </View>
              <Switch
                value={useCustomDurations}
                onValueChange={setUseCustomDurations}
                trackColor={{ false: colors.background.elevated, true: getStateColor() + '60' }}
                thumbColor={useCustomDurations ? getStateColor() : '#f4f3f4'}
              />
            </View>

            {/* Custom Duration Inputs */}
            {useCustomDurations && (
              <View style={[styles.customDurationsCard, { backgroundColor: colors.background.card }]}>
                <Text style={[styles.customDurationsTitle, { color: colors.text.primary }]}>
                  Custom Timer Settings
                </Text>
                
                <View style={styles.durationInputRow}>
                  <View style={styles.durationInputGroup}>
                    <Text style={[styles.durationLabel, { color: colors.text.secondary }]}>Work (sec)</Text>
                    <TextInput
                      style={[styles.durationInput, { 
                        backgroundColor: colors.background.elevated,
                        color: colors.text.primary,
                        borderColor: '#EF4444'
                      }]}
                      value={customWorkDuration}
                      onChangeText={setCustomWorkDuration}
                      keyboardType="numeric"
                      maxLength={3}
                      placeholder="45"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                  
                  <View style={styles.durationInputGroup}>
                    <Text style={[styles.durationLabel, { color: colors.text.secondary }]}>Rest (sec)</Text>
                    <TextInput
                      style={[styles.durationInput, { 
                        backgroundColor: colors.background.elevated,
                        color: colors.text.primary,
                        borderColor: '#F59E0B'
                      }]}
                      value={customRestDuration}
                      onChangeText={setCustomRestDuration}
                      keyboardType="numeric"
                      maxLength={3}
                      placeholder="15"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                  
                  <View style={styles.durationInputGroup}>
                    <Text style={[styles.durationLabel, { color: colors.text.secondary }]}>Rounds</Text>
                    <TextInput
                      style={[styles.durationInput, { 
                        backgroundColor: colors.background.elevated,
                        color: colors.text.primary,
                        borderColor: '#10B981'
                      }]}
                      value={customRounds}
                      onChangeText={setCustomRounds}
                      keyboardType="numeric"
                      maxLength={2}
                      placeholder="3"
                      placeholderTextColor={colors.text.muted}
                    />
                  </View>
                </View>

                <View style={styles.presetButtons}>
                  <Text style={[styles.presetTitle, { color: colors.text.secondary }]}>Quick Presets:</Text>
                  <View style={styles.presetRow}>
                    <TouchableOpacity 
                      style={[styles.presetBtn, { backgroundColor: colors.background.elevated }]}
                      onPress={() => { setCustomWorkDuration('30'); setCustomRestDuration('10'); }}
                    >
                      <Text style={[styles.presetBtnText, { color: colors.text.primary }]}>30/10</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.presetBtn, { backgroundColor: colors.background.elevated }]}
                      onPress={() => { setCustomWorkDuration('40'); setCustomRestDuration('20'); }}
                    >
                      <Text style={[styles.presetBtnText, { color: colors.text.primary }]}>40/20</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.presetBtn, { backgroundColor: colors.background.elevated }]}
                      onPress={() => { setCustomWorkDuration('45'); setCustomRestDuration('15'); }}
                    >
                      <Text style={[styles.presetBtnText, { color: colors.text.primary }]}>45/15</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.presetBtn, { backgroundColor: colors.background.elevated }]}
                      onPress={() => { setCustomWorkDuration('60'); setCustomRestDuration('30'); }}
                    >
                      <Text style={[styles.presetBtnText, { color: colors.text.primary }]}>60/30</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Workout Summary */}
            <View style={[styles.summaryCard, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.summaryTitle, { color: colors.text.primary }]}>Workout Summary</Text>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>Stations:</Text>
                <Text style={[styles.summaryValue, { color: colors.text.primary }]}>{stations.length}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>Rounds:</Text>
                <Text style={[styles.summaryValue, { color: colors.text.primary }]}>{getEffectiveRounds()}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>Work Duration:</Text>
                <Text style={[styles.summaryValue, { color: '#EF4444' }]}>
                  {useCustomDurations ? `${customWorkDuration}s` : 'Preset'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: colors.text.secondary }]}>Rest Duration:</Text>
                <Text style={[styles.summaryValue, { color: '#F59E0B' }]}>
                  {useCustomDurations ? `${customRestDuration}s` : 'Preset'}
                </Text>
              </View>
            </View>
          </ScrollView>

          <TouchableOpacity 
            style={[styles.closeSettingsBtn, { backgroundColor: getStateColor() }]}
            onPress={() => setShowSettings(false)}
          >
            <Text style={styles.closeSettingsBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  if (!workout) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <Text style={[styles.errorText, { color: colors.text.primary }]}>Workout data not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.accentColors.primary }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.workoutName, { color: colors.text.primary }]}>{workout.name}</Text>
          <Text style={[styles.roundText, { color: colors.text.secondary }]}>
            Round {currentRound} of {getEffectiveRounds()}
          </Text>
        </View>
        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
          <Ionicons name="settings-outline" size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      {workoutComplete ? (
        // Workout Complete Screen
        <View style={styles.completeContainer}>
          <View style={[styles.completeCircle, { backgroundColor: '#10B98120' }]}>
            <Ionicons name="checkmark-circle" size={100} color="#10B981" />
          </View>
          <Text style={[styles.completeTitle, { color: colors.text.primary }]}>Workout Complete!</Text>
          <Text style={[styles.completeSubtitle, { color: colors.text.secondary }]}>
            Great job! You crushed {workout.name}
          </Text>
          
          <View style={[styles.statsCard, { backgroundColor: colors.background.card }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text.primary }]}>{formatTime(totalElapsed)}</Text>
              <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Total Time</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text.primary }]}>{getEffectiveRounds()}</Text>
              <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Rounds</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text.primary }]}>{stations.length * getEffectiveRounds()}</Text>
              <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Exercises</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: '#10B981' }]}
            onPress={() => router.back()}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : !isRunning ? (
        // Pre-workout Screen
        <ScrollView contentContainerStyle={styles.preWorkoutContainer}>
          <Image source={{ uri: workout.image }} style={styles.workoutImage} resizeMode="cover" />
          
          <View style={[styles.infoCard, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.infoTitle, { color: colors.text.primary }]}>{workout.description}</Text>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={24} color={getStateColor()} />
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Duration</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>{workout.duration}</Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="repeat" size={24} color={getStateColor()} />
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Rounds</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>{getEffectiveRounds()}</Text>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="fitness" size={24} color={getStateColor()} />
                <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Stations</Text>
                <Text style={[styles.infoValue, { color: colors.text.primary }]}>{stations.length}</Text>
              </View>
            </View>
          </View>

          {/* Quick Settings Row */}
          <View style={[styles.quickSettingsRow, { backgroundColor: colors.background.card }]}>
            <View style={styles.quickSetting}>
              <Ionicons name={soundEnabled ? "volume-high" : "volume-mute"} size={20} color={colors.text.secondary} />
              <Text style={[styles.quickSettingLabel, { color: colors.text.secondary }]}>Sound</Text>
              <Switch
                value={soundEnabled}
                onValueChange={setSoundEnabled}
                trackColor={{ false: colors.background.elevated, true: getStateColor() + '60' }}
                thumbColor={soundEnabled ? getStateColor() : '#f4f3f4'}
                style={{ transform: [{ scale: 0.8 }] }}
              />
            </View>
            <View style={styles.quickSettingDivider} />
            <TouchableOpacity style={styles.quickSetting} onPress={() => setShowSettings(true)}>
              <Ionicons name="options-outline" size={20} color={colors.text.secondary} />
              <Text style={[styles.quickSettingLabel, { color: colors.text.secondary }]}>
                {useCustomDurations ? `${customWorkDuration}/${customRestDuration}s` : 'Preset'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Stations Preview</Text>
          {stations.map((station, index) => (
            <View key={index} style={[styles.stationPreview, { backgroundColor: colors.background.card }]}>
              <View style={[styles.stationNumber, { backgroundColor: getStateColor() }]}>
                <Text style={styles.stationNumberText}>{index + 1}</Text>
              </View>
              <View style={styles.stationInfo}>
                <Text style={[styles.stationName, { color: colors.text.primary }]}>{station.name}</Text>
                <Text style={[styles.stationTiming, { color: colors.text.secondary }]}>
                  {useCustomDurations 
                    ? `${customWorkDuration}s work • ${customRestDuration}s rest`
                    : `${station.duration} work • ${station.rest} rest`
                  }
                </Text>
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: getStateColor() }]}
            onPress={startWorkout}
          >
            <Ionicons name="play" size={28} color="#fff" />
            <Text style={styles.startButtonText}>Start Workout</Text>
          </TouchableOpacity>
          
          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        // Active Workout Screen
        <View style={styles.activeContainer}>
          {/* Progress Bar */}
          <View style={[styles.progressContainer, { backgroundColor: colors.background.elevated }]}>
            <View style={[styles.progressBar, { width: `${progress}%`, backgroundColor: getStateColor() }]} />
          </View>

          {/* Current Station */}
          <View style={styles.currentStationContainer}>
            <Image source={{ uri: currentStation?.image }} style={styles.currentStationImage} resizeMode="cover" />
            <View style={[styles.stationOverlay, { backgroundColor: isResting ? 'rgba(245, 158, 11, 0.9)' : 'rgba(239, 68, 68, 0.9)' }]}>
              <Text style={styles.phaseText}>{isResting ? 'REST' : 'WORK'}</Text>
              <Text style={styles.timerText}>{formatTime(timeRemaining)}</Text>
              <Text style={styles.currentStationName}>{currentStation?.name}</Text>
              <Text style={styles.currentStationDesc}>{currentStation?.description}</Text>
            </View>
          </View>

          {/* Station Progress */}
          <View style={[styles.stationProgressCard, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.stationProgressTitle, { color: colors.text.secondary }]}>
              Station {currentStationIndex + 1} of {stations.length}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stationDots}>
              {stations.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.stationDot,
                    {
                      backgroundColor:
                        index < currentStationIndex
                          ? '#10B981'
                          : index === currentStationIndex
                          ? getStateColor()
                          : colors.background.elevated,
                    },
                  ]}
                />
              ))}
            </ScrollView>
          </View>

          {/* Next Up */}
          {currentStationIndex < stations.length - 1 && (
            <View style={[styles.nextUpCard, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.nextUpLabel, { color: colors.text.secondary }]}>Next Up:</Text>
              <Text style={[styles.nextUpName, { color: colors.text.primary }]}>
                {stations[currentStationIndex + 1]?.name}
              </Text>
            </View>
          )}

          {/* Controls */}
          <View style={styles.controlsContainer}>
            <TouchableOpacity style={[styles.controlButton, { backgroundColor: '#EF444420' }]} onPress={stopWorkout}>
              <Ionicons name="stop" size={32} color="#EF4444" />
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.pauseButton, { backgroundColor: isPaused ? '#10B981' : '#F59E0B' }]}
              onPress={togglePause}
            >
              <Ionicons name={isPaused ? 'play' : 'pause'} size={40} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.background.card }]}
              onPress={skipStation}
            >
              <Ionicons name="play-skip-forward" size={32} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          {/* Sound indicator & Total Time */}
          <View style={styles.bottomInfo}>
            <TouchableOpacity 
              style={styles.soundToggle} 
              onPress={() => setSoundEnabled(!soundEnabled)}
            >
              <Ionicons 
                name={soundEnabled ? "volume-high" : "volume-mute"} 
                size={18} 
                color={colors.text.secondary} 
              />
            </TouchableOpacity>
            <Text style={[styles.totalTimeText, { color: colors.text.secondary }]}>
              Total Time: {formatTime(totalElapsed)}
            </Text>
          </View>
        </View>
      )}

      {/* Settings Modal */}
      {renderSettingsModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  workoutName: {
    fontSize: 18,
    fontWeight: '700',
  },
  roundText: {
    fontSize: 14,
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 100,
  },
  // Pre-workout styles
  preWorkoutContainer: {
    padding: 16,
  },
  workoutImage: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    marginBottom: 16,
  },
  infoCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  infoValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  quickSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },
  quickSetting: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickSettingLabel: {
    fontSize: 13,
  },
  quickSettingDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(128,128,128,0.3)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  stationPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  stationNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stationNumberText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '600',
  },
  stationTiming: {
    fontSize: 13,
    marginTop: 2,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 16,
    marginTop: 24,
    gap: 10,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  // Active workout styles
  activeContainer: {
    flex: 1,
    padding: 16,
  },
  progressContainer: {
    height: 8,
    borderRadius: 4,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  currentStationContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
  },
  currentStationImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  stationOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  phaseText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 4,
    marginBottom: 8,
  },
  timerText: {
    fontSize: 80,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 16,
  },
  currentStationName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  currentStationDesc: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  stationProgressCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  stationProgressTitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  stationDots: {
    flexDirection: 'row',
  },
  stationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  nextUpCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextUpLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  nextUpName: {
    fontSize: 16,
    fontWeight: '600',
  },
  controlsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  soundToggle: {
    padding: 8,
  },
  totalTimeText: {
    fontSize: 14,
    textAlign: 'center',
  },
  // Complete screen styles
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  completeCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  completeTitle: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  completeSubtitle: {
    fontSize: 16,
    marginBottom: 32,
    textAlign: 'center',
  },
  statsCard: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 24,
    marginBottom: 32,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  doneButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  // Settings Modal styles
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  settingsContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  settingsContent: {
    padding: 16,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  customDurationsCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  customDurationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  durationInputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  durationInputGroup: {
    flex: 1,
    marginHorizontal: 4,
  },
  durationLabel: {
    fontSize: 12,
    marginBottom: 6,
    textAlign: 'center',
  },
  durationInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  presetButtons: {
    marginTop: 8,
  },
  presetTitle: {
    fontSize: 12,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  presetBtn: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  summaryCard: {
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.1)',
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  closeSettingsBtn: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeSettingsBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

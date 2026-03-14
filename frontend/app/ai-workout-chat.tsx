import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageBackground,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width } = Dimensions.get('window');

// AI Workout Coach Header Image
const AI_HEADER_IMAGE = 'https://images.pexels.com/photos/8097820/pexels-photo-8097820.jpeg?auto=compress&cs=tinysrgb&w=800';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  workout?: ParsedWorkout | null;
}

interface ParsedWorkout {
  name: string;
  description?: string;
  duration_minutes?: number;
  exercises: {
    name: string;
    sets?: number;
    reps?: string;
    weight?: string;
    duration?: string;
    rest?: string;
    notes?: string;
  }[];
}

export default function AIWorkoutChatScreen() {
  const { userId, profile } = useUserStore();
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [sessionId, setSessionId] = useState(`workout_chat_${Date.now()}`);
  const [currentWorkout, setCurrentWorkout] = useState<ParsedWorkout | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Load existing conversation on mount
  useEffect(() => {
    const loadConversation = async () => {
      if (!userId) {
        setIsLoadingHistory(false);
        return;
      }
      
      try {
        const response = await axios.get(`${API_URL}/api/ai-workout-chat/load/${userId}`);
        
        if (response.data.found && response.data.messages?.length > 0) {
          // Convert loaded messages to ChatMessage format
          const loadedMessages: ChatMessage[] = response.data.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
          }));
          setMessages(loadedMessages);
          setExpiresAt(response.data.expires_at);
        } else {
          // No saved conversation, show welcome message
          const welcomeMessage: ChatMessage = {
            id: 'welcome',
            role: 'assistant',
            content: `Hey${profile?.name ? ` ${profile.name.split(' ')[0]}` : ''}! 💪 I'm your AI workout coach. Tell me what kind of workout you want to create today!\n\nFor example:\n• "Create a 30-minute HIIT workout"\n• "I want a push day routine with chest and triceps"\n• "Give me a beginner leg workout"\n• "Design a full body workout for strength"\n\nWhat would you like to work on?`,
            timestamp: new Date(),
          };
          setMessages([welcomeMessage]);
        }
      } catch (error) {
        console.error('Error loading conversation:', error);
        // Show welcome message on error
        const welcomeMessage: ChatMessage = {
          id: 'welcome',
          role: 'assistant',
          content: `Hey${profile?.name ? ` ${profile.name.split(' ')[0]}` : ''}! 💪 I'm your AI workout coach. Tell me what kind of workout you want to create today!\n\nFor example:\n• "Create a 30-minute HIIT workout"\n• "I want a push day routine with chest and triceps"\n• "Give me a beginner leg workout"\n• "Design a full body workout for strength"\n\nWhat would you like to work on?`,
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    
    loadConversation();
  }, [userId, profile]);

  // Save conversation whenever messages change (debounced)
  useEffect(() => {
    const saveConversation = async () => {
      if (!userId || messages.length <= 1) return; // Don't save just welcome message
      
      try {
        const messagesToSave = messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp.toISOString(),
          workout: msg.workout || null,
        }));
        
        await axios.post(`${API_URL}/api/ai-workout-chat/save`, {
          user_id: userId,
          messages: messagesToSave,
        });
      } catch (error) {
        console.error('Error saving conversation:', error);
      }
    };
    
    // Debounce save to avoid too many requests
    const timeoutId = setTimeout(saveConversation, 1000);
    return () => clearTimeout(timeoutId);
  }, [messages, userId]);

  const clearConversation = async () => {
    Alert.alert(
      'Clear Conversation',
      'Are you sure you want to clear this conversation? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/ai-workout-chat/clear/${userId}`);
              
              // Reset to welcome message
              const welcomeMessage: ChatMessage = {
                id: 'welcome',
                role: 'assistant',
                content: `Hey${profile?.name ? ` ${profile.name.split(' ')[0]}` : ''}! 💪 I'm your AI workout coach. Tell me what kind of workout you want to create today!\n\nFor example:\n• "Create a 30-minute HIIT workout"\n• "I want a push day routine with chest and triceps"\n• "Give me a beginner leg workout"\n• "Design a full body workout for strength"\n\nWhat would you like to work on?`,
                timestamp: new Date(),
              };
              setMessages([welcomeMessage]);
              setCurrentWorkout(null);
              setExpiresAt(null);
              Alert.alert('Cleared', 'Conversation has been cleared.');
            } catch (error) {
              console.error('Error clearing conversation:', error);
              Alert.alert('Error', 'Failed to clear conversation.');
            }
          },
        },
      ]
    );
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);
    scrollToBottom();

    try {
      const response = await axios.post(`${API_URL}/api/ai-workout-chat`, {
        user_id: userId,
        session_id: sessionId,
        message: userMessage.content,
        user_profile: profile ? {
          name: profile.name,
          fitness_level: profile.activity_level,
          goals: profile.goal_weight < profile.weight ? 'weight_loss' : 'muscle_gain',
        } : null,
        conversation_history: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
      });

      const assistantMessage: ChatMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: response.data.message,
        timestamp: new Date(),
        workout: response.data.workout || null,
      };

      setMessages(prev => [...prev, assistantMessage]);

      // If a workout was generated, save it
      if (response.data.workout) {
        setCurrentWorkout(response.data.workout);
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const addToWorkoutLog = async (workout: ParsedWorkout) => {
    try {
      // Save each exercise to the manual workout log
      for (const exercise of workout.exercises) {
        // Parse weight if provided (e.g., "20 lbs", "50kg", "bodyweight")
        const weightValue = exercise.weight || '';
        
        const entryData = {
          user_id: userId,
          exercise_name: exercise.name,
          reps: exercise.reps ? { '1': exercise.reps.toString() } : {},
          weight: weightValue ? { '1': weightValue.toString().replace(/[^\d.]/g, '') || weightValue } : {},
          notes: [
            exercise.sets ? `${exercise.sets} sets` : '',
            exercise.duration ? exercise.duration : '',
            exercise.rest ? `Rest: ${exercise.rest}` : '',
            exercise.weight ? `Suggested weight: ${exercise.weight}` : '',
            exercise.notes || ''
          ].filter(Boolean).join(' • '),
        };

        await axios.post(`${API_URL}/api/manual-workout-log`, entryData);
      }

      Alert.alert(
        'Workout Added! 💪',
        `"${workout.name}" has been added to your Workout Log. Tap any exercise to view/edit reps and weight.`,
        [
          { text: 'View Workout Log', onPress: () => router.push('/(tabs)/workout') },
          { text: 'Stay Here', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('Error adding workout to log:', error);
      Alert.alert('Error', 'Failed to add workout to log. Please try again.');
    }
  };

  const startNewChat = () => {
    Alert.alert(
      'Start New Workout Chat?',
      'This will clear the current conversation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Fresh',
          onPress: () => {
            setSessionId(`workout_chat_${Date.now()}`);
            setCurrentWorkout(null);
            const welcomeMessage: ChatMessage = {
              id: 'welcome',
              role: 'assistant',
              content: `Ready for a new workout! 💪 What would you like to create?`,
              timestamp: new Date(),
            };
            setMessages([welcomeMessage]);
          },
        },
      ]
    );
  };

  const renderWorkoutCard = (workout: ParsedWorkout, messageId: string) => (
    <View style={[styles.workoutCard, { backgroundColor: colors.background.elevated }]}>
      <View style={styles.workoutCardHeader}>
        <View style={[styles.workoutIcon, { backgroundColor: `${accent.primary}20` }]}>
          <MaterialCommunityIcons name="dumbbell" size={24} color={accent.primary} />
        </View>
        <View style={styles.workoutInfo}>
          <Text style={[styles.workoutName, { color: colors.text.primary }]}>
            {workout.name}
          </Text>
          {workout.duration_minutes && (
            <Text style={[styles.workoutDuration, { color: colors.text.secondary }]}>
              ~{workout.duration_minutes} minutes • {workout.exercises.length} exercises
            </Text>
          )}
        </View>
      </View>

      <View style={styles.exercisesList}>
        {workout.exercises.slice(0, 5).map((exercise, index) => (
          <View key={index} style={[styles.exerciseItem, { borderBottomColor: colors.border.primary }]}>
            <View style={styles.exerciseNumber}>
              <Text style={[styles.exerciseNumberText, { color: accent.primary }]}>{index + 1}</Text>
            </View>
            <View style={styles.exerciseDetails}>
              <Text style={[styles.exerciseName, { color: colors.text.primary }]}>
                {exercise.name}
              </Text>
              <Text style={[styles.exerciseSpecs, { color: colors.text.secondary }]}>
                {exercise.sets && `${exercise.sets} sets`}
                {exercise.reps && ` • ${exercise.reps}`}
                {exercise.duration && ` • ${exercise.duration}`}
              </Text>
            </View>
          </View>
        ))}
        {workout.exercises.length > 5 && (
          <Text style={[styles.moreExercises, { color: colors.text.muted }]}>
            +{workout.exercises.length - 5} more exercises
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.addToLogButton, { backgroundColor: accent.primary }]}
        onPress={() => addToWorkoutLog(workout)}
      >
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={styles.addToLogButtonText}>Add to Workout Log</Text>
      </TouchableOpacity>
    </View>
  );

  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === 'user';

    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {!isUser && (
          <View style={[styles.avatarContainer, { backgroundColor: `${accent.primary}20` }]}>
            <MaterialCommunityIcons name="robot" size={20} color={accent.primary} />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser
              ? [styles.userBubble, { backgroundColor: accent.primary }]
              : [styles.assistantBubble, { backgroundColor: colors.background.card }],
          ]}
        >
          <Text
            style={[
              styles.messageText,
              { color: isUser ? '#fff' : colors.text.primary },
            ]}
          >
            {message.content}
          </Text>
          {message.workout && renderWorkoutCard(message.workout, message.id)}
        </View>
      </View>
    );
  };

  const quickPrompts = [
    '30-min HIIT',
    'Upper body',
    'Leg day',
    'Core workout',
  ];

  // Show loading screen while fetching conversation history
  if (isLoadingHistory) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={accent.primary} />
          <Text style={[styles.loadingText, { color: colors.text.secondary }]}>
            Loading conversation...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]} edges={['top']}>
      {/* Header with AI Image */}
      <ImageBackground
        source={{ uri: AI_HEADER_IMAGE }}
        style={styles.headerImageBackground}
        resizeMode="cover"
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.8)']}
          style={styles.headerGradient}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <View style={styles.headerTitleRow}>
                <MaterialCommunityIcons name="robot" size={24} color={accent.primary} style={{ marginRight: 8 }} />
                <Text style={styles.headerTitleWhite}>AI Workout Coach</Text>
              </View>
              <Text style={styles.headerSubtitleWhite}>
                {expiresAt ? 'Conversation saves for 12 hours' : 'Create your perfect workout'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              {messages.length > 1 && (
                <TouchableOpacity onPress={clearConversation} style={styles.clearButton}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={startNewChat} style={styles.newChatButton}>
                <Ionicons name="refresh" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </ImageBackground>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.chatContainer}>
          {/* Messages */}
          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={true}
            onContentSizeChange={() => scrollToBottom()}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {messages.map(renderMessage)}
            {isLoading && (
              <View style={styles.loadingIndicatorContainer}>
                <View style={[styles.avatarContainer, { backgroundColor: `${accent.primary}20` }]}>
                  <ActivityIndicator size="small" color={accent.primary} />
                </View>
                <View style={[styles.loadingBubble, { backgroundColor: colors.background.card }]}>
                  <Text style={[styles.loadingTextStyle, { color: colors.text.muted }]}>
                    Creating your workout...
                  </Text>
                </View>
              </View>
            )}
            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Quick Prompts */}
          {messages.length <= 1 && (
            <View style={styles.quickPromptsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickPrompts}>
                {quickPrompts.map((prompt, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.quickPrompt, { backgroundColor: colors.background.card, borderColor: colors.border.primary }]}
                    onPress={() => setInputText(prompt)}
                  >
                    <Text style={[styles.quickPromptText, { color: accent.primary }]}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Input Area */}
        <View style={[styles.inputContainer, { backgroundColor: colors.background.secondary, borderTopColor: colors.border.primary, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.background.input, color: colors.text.primary }]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Describe your ideal workout..."
            placeholderTextColor={colors.text.muted}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: inputText.trim() ? accent.primary : colors.background.elevated },
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
          >
            <Ionicons
              name="send"
              size={20}
              color={inputText.trim() ? '#fff' : colors.text.muted}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  headerImageBackground: {
    width: '100%',
    height: 120,
  },
  headerGradient: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  headerContent: {
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
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitleWhite: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitleWhite: {
    fontSize: 12,
    marginTop: 4,
    color: 'rgba(255,255,255,0.8)',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 18,
  },
  newChatButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 18,
  },
  keyboardAvoid: {
    flex: 1,
  },
  chatContainer: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  messageBubble: {
    maxWidth: width * 0.75,
    borderRadius: 16,
    padding: 12,
  },
  userBubble: {
    borderTopRightRadius: 4,
  },
  assistantBubble: {
    borderTopLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  loadingIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  loadingBubble: {
    borderRadius: 16,
    padding: 12,
    borderTopLeftRadius: 4,
  },
  loadingTextStyle: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  workoutCard: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
  },
  workoutCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
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
  workoutName: {
    fontSize: 16,
    fontWeight: '700',
  },
  workoutDuration: {
    fontSize: 13,
    marginTop: 2,
  },
  exercisesList: {
    marginBottom: 12,
  },
  exerciseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  exerciseNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  exerciseNumberText: {
    fontSize: 12,
    fontWeight: '700',
  },
  exerciseDetails: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '600',
  },
  exerciseSpecs: {
    fontSize: 12,
    marginTop: 2,
  },
  moreExercises: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingTop: 8,
  },
  addToLogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  addToLogButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  quickPromptsContainer: {
    paddingVertical: 8,
  },
  quickPrompts: {
    paddingHorizontal: 16,
    gap: 8,
  },
  quickPrompt: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  quickPromptText: {
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

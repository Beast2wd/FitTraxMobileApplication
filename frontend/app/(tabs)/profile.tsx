import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useUserStore } from '../../stores/userStore';
import { useThemeStore } from '../../stores/themeStore';
import { useLanguageStore } from '../../stores/languageStore';
import { AccentColor, AccentColors, ThemeMode } from '../../constants/Colors';
import { userAPI } from '../../services/api';
import { storage } from '../../services/storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../../services/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import i18next from 'i18next';

// Custom Toggle Component
const CustomToggle = ({ 
  value, 
  onValueChange, 
  activeColor = '#007AFF',
  inactiveColor = '#E5E5EA',
}: { 
  value: boolean; 
  onValueChange: (value: boolean) => void;
  activeColor?: string;
  inactiveColor?: string;
}) => {
  const translateX = React.useRef(new Animated.Value(value ? 22 : 2)).current;

  React.useEffect(() => {
    Animated.spring(translateX, {
      toValue: value ? 22 : 2,
      useNativeDriver: true,
      friction: 8,
      tension: 100,
    }).start();
  }, [value]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onValueChange(!value)}
      style={[
        customToggleStyles.track,
        { backgroundColor: value ? activeColor : inactiveColor }
      ]}
    >
      <Animated.View
        style={[
          customToggleStyles.thumb,
          { transform: [{ translateX }] }
        ]}
      />
    </TouchableOpacity>
  );
};

const customToggleStyles = StyleSheet.create({
  track: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    justifyContent: 'center',
  },
  thumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2.5,
    elevation: 4,
  },
});

const AGE_OPTIONS = Array.from({ length: 83 }, (_, i) => i + 18);
const HEIGHT_FEET_OPTIONS = Array.from({ length: 5 }, (_, i) => i + 4);
const HEIGHT_INCHES_OPTIONS = Array.from({ length: 12 }, (_, i) => i);
const WEIGHT_OPTIONS = Array.from({ length: 351 }, (_, i) => i + 80);

const GENDER_OPTIONS = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

const ACTIVITY_OPTIONS = [
  { label: 'Sedentary', value: 'sedentary' },
  { label: 'Light', value: 'light' },
  { label: 'Moderate', value: 'moderate' },
  { label: 'Active', value: 'active' },
  { label: 'Very Active', value: 'very_active' },
];

const ACCENT_COLORS: { name: string; value: AccentColor }[] = [
  { name: 'Blue', value: 'blue' },
  { name: 'Purple', value: 'purple' },
  { name: 'Green', value: 'green' },
  { name: 'Orange', value: 'orange' },
  { name: 'Pink', value: 'pink' },
  { name: 'Cyan', value: 'cyan' },
  { name: 'Red', value: 'red' },
];

interface PickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (value: string | number) => void;
  title: string;
  options: { label: string; value: string | number }[];
  selectedValue: string | number;
}

const PickerModal: React.FC<PickerModalProps> = ({
  visible,
  onClose,
  onSelect,
  title,
  options,
  selectedValue,
}) => {
  const { theme } = useThemeStore();
  const [tempValue, setTempValue] = useState(selectedValue);

  useEffect(() => {
    if (visible) setTempValue(selectedValue);
  }, [visible, selectedValue]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity 
        style={modalStyles.overlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <TouchableOpacity 
          activeOpacity={1} 
          onPress={(e) => e.stopPropagation()}
          style={[modalStyles.container, { backgroundColor: theme.colors.background.card }]}
        >
          <View style={[modalStyles.header, { borderBottomColor: theme.colors.border.primary }]}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[modalStyles.cancelText, { color: theme.colors.text.secondary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[modalStyles.title, { color: theme.colors.text.primary }]}>{title}</Text>
            <TouchableOpacity onPress={() => { onSelect(tempValue); onClose(); }}>
              <Text style={[modalStyles.doneText, { color: theme.accentColors.primary }]}>Done</Text>
            </TouchableOpacity>
          </View>
          <Picker
            selectedValue={tempValue}
            onValueChange={(value) => setTempValue(value)}
            style={[modalStyles.picker, { color: theme.colors.text.primary }]}
            itemStyle={{ color: theme.colors.text.primary }}
          >
            {options.map((option) => (
              <Picker.Item key={option.value.toString()} label={option.label} value={option.value} />
            ))}
          </Picker>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

export default function ProfileScreen() {
  const { userId, profile, setUserId, setProfile, tosAccepted } = useUserStore();
  const { theme, mode, accent, setMode, setAccent } = useThemeStore();
  const { language, setLanguage } = useLanguageStore();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance'>('profile');

  const [ageModalVisible, setAgeModalVisible] = useState(false);
  const [genderModalVisible, setGenderModalVisible] = useState(false);
  const [heightFeetModalVisible, setHeightFeetModalVisible] = useState(false);
  const [heightInchesModalVisible, setHeightInchesModalVisible] = useState(false);
  const [weightModalVisible, setWeightModalVisible] = useState(false);
  const [goalWeightModalVisible, setGoalWeightModalVisible] = useState(false);
  const [activityModalVisible, setActivityModalVisible] = useState(false);
  
  // Calorie goal state
  const [calorieModalVisible, setCalorieModalVisible] = useState(false);
  const [customCalorieGoal, setCustomCalorieGoal] = useState('');
  const [isCustomCalorieGoal, setIsCustomCalorieGoal] = useState(false);

  // Voice Greeting state
  const [voiceGreetingEnabled, setVoiceGreetingEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [voicePickerVisible, setVoicePickerVisible] = useState(false);
  
  // Voice Recording state
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasCustomRecording, setHasCustomRecording] = useState(false);
  const [useCustomRecording, setUseCustomRecording] = useState(false);
  const recordingTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // Health Connect state
  const [healthConnectStatus, setHealthConnectStatus] = useState<any>(null);

  const [formData, setFormData] = useState({
    name: profile?.name || '',
    age: profile?.age || 30,
    gender: profile?.gender || 'male',
    height_feet: profile?.height_feet || 5,
    height_inches: profile?.height_inches || 8,
    weight: profile?.weight || 160,
    goal_weight: profile?.goal_weight || 155,
    activity_level: profile?.activity_level || 'moderate',
    custom_calorie_goal: profile?.custom_calorie_goal || null,
  });

  const colors = theme.colors;
  const accentColors = theme.accentColors;

  useEffect(() => {
    if (!userId) {
      const newUserId = `user_${Date.now()}`;
      setUserId(newUserId);
      storage.saveUserId(newUserId);
    }
  }, [userId]);

  // Load voice greeting settings
  useEffect(() => {
    const loadVoiceSettings = async () => {
      try {
        const enabled = await AsyncStorage.getItem('voiceGreetingEnabled');
        const gender = await AsyncStorage.getItem('voiceGreetingGender');
        const voiceId = await AsyncStorage.getItem('voiceGreetingVoiceId');
        
        if (enabled !== null) {
          setVoiceGreetingEnabled(enabled !== 'false');
        }
        if (gender) {
          setVoiceGender(gender as 'male' | 'female');
        }
        if (voiceId) {
          setSelectedVoiceId(voiceId);
        }

        // Load available voices
        const voices = await Speech.getAvailableVoicesAsync();
        const currentLang = i18next.language || 'en';
        const langKey = currentLang.split('-')[0];
        
        // Filter voices by current language
        const langVoices = voices.filter(v => 
          v.language.toLowerCase().startsWith(langKey.toLowerCase())
        );
        
        setAvailableVoices(langVoices);

        // Check if custom recording exists
        const customRecUri = await AsyncStorage.getItem('customVoiceRecordingUri');
        const useCustom = await AsyncStorage.getItem('useCustomVoiceRecording');
        if (customRecUri) {
          setHasCustomRecording(true);
          setUseCustomRecording(useCustom === 'true');
        }
      } catch (error) {
        console.log('Error loading voice settings:', error);
      }
    };
    loadVoiceSettings();
  }, []);

  // Load Health Connect status
  useEffect(() => {
    const loadHealthConnectStatus = async () => {
      try {
        const status = await AsyncStorage.getItem('@fittrax_health_connect_status');
        if (status) {
          setHealthConnectStatus(JSON.parse(status));
        }
      } catch (error) {
        console.log('Error loading health connect status:', error);
      }
    };
    loadHealthConnectStatus();
  }, []);

  // Handle Health Connect
  const handleConnectHealth = () => {
    router.push({ pathname: '/health-connect', params: { fromSettings: 'true' } });
  };

  // Recording functions
  const startRecording = async () => {
    try {
      // Request permission
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Microphone access is needed to record your voice greeting.');
        return;
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer (max 5 seconds)
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 5) {
            stopRecording();
            return 5;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (error) {
      console.log('Error starting recording:', error);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    try {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      if (recording) {
        setIsRecording(false);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        
        if (uri) {
          // Save the recording URI
          await AsyncStorage.setItem('customVoiceRecordingUri', uri);
          await AsyncStorage.setItem('useCustomVoiceRecording', 'true');
          setHasCustomRecording(true);
          setUseCustomRecording(true);
          Alert.alert('Success!', 'Your custom voice greeting has been saved!');
        }
        
        setRecording(null);
        setRecordingTime(0);
      }
    } catch (error) {
      console.log('Error stopping recording:', error);
    }
  };
    const playCustomRecording = async () => {
    try {
      const uri = await AsyncStorage.getItem('customVoiceRecordingUri');
      if (uri) {
        // Set audio mode to play through speaker even when silent
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        
        const { sound } = await Audio.Sound.createAsync({ uri });
        await sound.playAsync();
      }
    } catch (error) {
      console.log('Error playing recording:', error);
    }
  };

  const deleteCustomRecording = async () => {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete your custom voice greeting?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('customVoiceRecordingUri');
            await AsyncStorage.setItem('useCustomVoiceRecording', 'false');
            setHasCustomRecording(false);
            setUseCustomRecording(false);
          }
        }
      ]
    );
  };

  const toggleUseCustomRecording = async (value: boolean) => {
    setUseCustomRecording(value);
    await AsyncStorage.setItem('useCustomVoiceRecording', value.toString());
  };

  // Save voice greeting enabled
  const handleVoiceGreetingToggle = async (value: boolean) => {
    setVoiceGreetingEnabled(value);
    await AsyncStorage.setItem('voiceGreetingEnabled', value.toString());
  };

  // Save voice gender preference and test the voice
  const handleVoiceGenderChange = async (gender: 'male' | 'female') => {
    setVoiceGender(gender);
    await AsyncStorage.setItem('voiceGreetingGender', gender);
    // Automatically test the voice when changed
    testVoiceGreeting(gender);
  };

  // Test voice greeting
  const testVoiceGreeting = async (genderToTest?: 'male' | 'female', voiceIdToTest?: string) => {
    try {
      const gender = genderToTest || voiceGender;
      const voiceId = voiceIdToTest || selectedVoiceId;
      const currentLang = i18next.language || 'en';
      const langKey = currentLang.split('-')[0];
      
      // Get user's first name
      const userName = profile?.first_name || profile?.name?.split(' ')[0] || 'there';

      // Determine time of day greeting
      const hour = new Date().getHours();
      let greetingKey = '';
      if (hour >= 5 && hour < 12) {
        greetingKey = 'morning';
      } else if (hour >= 12 && hour < 17) {
        greetingKey = 'afternoon';
      } else {
        greetingKey = 'evening';
      }

      // Greetings in different languages
      const greetings: { [key: string]: { [key: string]: string } } = {
        en: { morning: 'Good Morning', afternoon: 'Good Afternoon', evening: 'Good Evening' },
        es: { morning: 'Buenos Días', afternoon: 'Buenas Tardes', evening: 'Buenas Noches' },
        fr: { morning: 'Bonjour', afternoon: 'Bon Après-midi', evening: 'Bonsoir' },
        de: { morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend' },
        it: { morning: 'Buongiorno', afternoon: 'Buon Pomeriggio', evening: 'Buonasera' },
        pt: { morning: 'Bom Dia', afternoon: 'Boa Tarde', evening: 'Boa Noite' },
        ja: { morning: 'おはようございます', afternoon: 'こんにちは', evening: 'こんばんは' },
        ko: { morning: '좋은 아침이에요', afternoon: '안녕하세요', evening: '좋은 저녁이에요' },
        zh: { morning: '早上好', afternoon: '下午好', evening: '晚上好' },
      };

      // Athletic, upbeat motivational quotes
      const motivationalQuotes = [
        "Let's crush it today!",
        "Time to make gains!",
        "You've got this, champion!",
        "Let's get that workout in!",
        "Today's the day to level up!",
        "No excuses, just results!",
        "Push harder than yesterday!",
        "Your body can do it, convince your mind!",
        "Stronger every single day!",
        "Let's go beast mode!",
        "Rise and grind!",
        "Every rep counts!",
        "Make yourself proud today!",
        "Greatness awaits you!"
      ];

      const langGreetings = greetings[langKey] || greetings['en'];
      const greeting = langGreetings[greetingKey];
      const motivationalQuote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
      const fullGreeting = `${greeting}, ${userName}! ${motivationalQuote}`;

      // Stop any current speech
      await Speech.stop();

      // Get available voices
      const voices = await Speech.getAvailableVoicesAsync();
      let selectedVoice = null;

      // If a specific voice is selected, use it
      if (voiceId) {
        selectedVoice = voices.find(v => v.identifier === voiceId);
      }

      // If no specific voice, find best match based on gender
      if (!selectedVoice) {
        const langVoices = voices.filter(v => 
          v.language.toLowerCase().startsWith(langKey.toLowerCase())
        );

        if (langVoices.length > 0) {
          if (gender === 'male') {
            selectedVoice = langVoices.find(v => 
              v.name?.toLowerCase().includes('enhanced') ||
              v.quality === 'Enhanced'
            ) || langVoices.find(v => 
              v.name?.toLowerCase().includes('aaron') ||
              v.name?.toLowerCase().includes('gordon') ||
              v.name?.toLowerCase().includes('nicky') ||
              v.name?.toLowerCase().includes('evan') ||
              v.name?.toLowerCase().includes('fred')
            ) || langVoices.find(v => 
              v.name?.toLowerCase().includes('male') || 
              v.identifier?.toLowerCase().includes('male')
            ) || langVoices[0];
          } else {
            selectedVoice = langVoices.find(v => 
              v.name?.toLowerCase().includes('enhanced') ||
              v.quality === 'Enhanced'
            ) || langVoices.find(v => 
              v.name?.toLowerCase().includes('samantha') ||
              v.name?.toLowerCase().includes('ava') ||
              v.name?.toLowerCase().includes('zoe') ||
              v.name?.toLowerCase().includes('allison') ||
              v.name?.toLowerCase().includes('susan')
            ) || langVoices.find(v => 
              v.name?.toLowerCase().includes('female') || 
              v.identifier?.toLowerCase().includes('female')
            ) || langVoices[0];
          }
        }
      }

      // Speak with athletic, energetic parameters
      await Speech.speak(fullGreeting, {
        language: langKey,
        voice: selectedVoice?.identifier,
        pitch: gender === 'female' ? 1.15 : 1.0,  // Natural pitch
        rate: 1.1,  // Slightly faster for upbeat energy
      });
    } catch (error) {
      console.log('Test voice error:', error);
    }
  };

  // Handle voice selection
  const handleVoiceSelect = async (voiceId: string) => {
    setSelectedVoiceId(voiceId);
    await AsyncStorage.setItem('voiceGreetingVoiceId', voiceId);
    setVoicePickerVisible(false);
    // Test the newly selected voice
    testVoiceGreeting(voiceGender, voiceId);
  };

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        age: profile.age || 30,
        gender: profile.gender || 'male',
        height_feet: profile.height_feet || 5,
        height_inches: profile.height_inches || 8,
        weight: profile.weight || 160,
        goal_weight: profile.goal_weight || 155,
        activity_level: profile.activity_level || 'moderate',
        custom_calorie_goal: profile.custom_calorie_goal || null,
      });
      // Check if user has a custom calorie goal set
      if (profile.custom_calorie_goal) {
        setIsCustomCalorieGoal(true);
        setCustomCalorieGoal(profile.custom_calorie_goal.toString());
      }
    }
  }, [profile]);

  const handleSave = async () => {
    if (!formData.name) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    
    try {
      setLoading(true);
      const profileData = {
        user_id: userId!,
        ...formData,
        custom_calorie_goal: isCustomCalorieGoal && customCalorieGoal ? parseInt(customCalorieGoal) : null,
      };
      const result = await userAPI.createOrUpdateProfile(profileData);
      
      // Check if user has fitness goals set
      const hasExistingFitnessGoals = result.profile?.fitness_goals && result.profile.fitness_goals.length > 0;
      
      setProfile(result.profile);
      await storage.saveUserProfile(result.profile);
      await storage.setOnboardingComplete();
      
      // If no fitness goals, navigate to fitness goals screen
      if (!hasExistingFitnessGoals) {
        Alert.alert(
          'Profile Saved!', 
          'Now let\'s set your fitness goals to create a personalized workout plan.',
          [{ text: 'Set My Goals', onPress: () => router.push('/fitness-goals') }]
        );
      } else {
        Alert.alert('Success', 'Profile updated!');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  const SelectorButton = ({ value, onPress, placeholder }: any) => (
    <TouchableOpacity 
      style={[styles.selectorButton, { backgroundColor: colors.background.input, borderColor: colors.border.primary }]} 
      onPress={onPress}
    >
      <Text style={[styles.selectorValue, { color: value ? colors.text.primary : colors.text.muted }]}>
        {value || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={20} color={colors.text.muted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.background.secondary }]}>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Settings</Text>
        </View>

        {/* Tab Switcher */}
        <View style={[styles.tabContainer, { backgroundColor: colors.background.secondary }]}>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'profile' && { backgroundColor: accentColors.primary }
            ]}
            onPress={() => setActiveTab('profile')}
          >
            <Ionicons 
              name="person" 
              size={18} 
              color={activeTab === 'profile' ? '#fff' : colors.text.secondary} 
            />
            <Text style={[
              styles.tabText,
              { color: activeTab === 'profile' ? '#fff' : colors.text.secondary }
            ]}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tab,
              activeTab === 'appearance' && { backgroundColor: accentColors.primary }
            ]}
            onPress={() => setActiveTab('appearance')}
          >
            <Ionicons 
              name="color-palette" 
              size={18} 
              color={activeTab === 'appearance' ? '#fff' : colors.text.secondary} 
            />
            <Text style={[
              styles.tabText,
              { color: activeTab === 'appearance' ? '#fff' : colors.text.secondary }
            ]}>Appearance</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {activeTab === 'profile' ? (
            <View style={[styles.card, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Your Profile</Text>

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background.input, borderColor: colors.border.primary, color: colors.text.primary }]}
                value={formData.name}
                onChangeText={(value) => updateField('name', value)}
                placeholder="Enter your name"
                placeholderTextColor={colors.text.muted}
              />

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Age</Text>
              <SelectorButton value={`${formData.age} years`} onPress={() => setAgeModalVisible(true)} />

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Gender</Text>
              <SelectorButton 
                value={GENDER_OPTIONS.find(g => g.value === formData.gender)?.label} 
                onPress={() => setGenderModalVisible(true)} 
              />

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Height</Text>
              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <SelectorButton value={`${formData.height_feet} ft`} onPress={() => setHeightFeetModalVisible(true)} />
                </View>
                <View style={styles.halfInput}>
                  <SelectorButton value={`${formData.height_inches} in`} onPress={() => setHeightInchesModalVisible(true)} />
                </View>
              </View>

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Current Weight</Text>
              <SelectorButton value={`${formData.weight} lbs`} onPress={() => setWeightModalVisible(true)} />

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Goal Weight</Text>
              <SelectorButton value={`${formData.goal_weight} lbs`} onPress={() => setGoalWeightModalVisible(true)} />

              <Text style={[styles.fieldLabel, { color: colors.text.secondary }]}>Activity Level</Text>
              <SelectorButton 
                value={ACTIVITY_OPTIONS.find(a => a.value === formData.activity_level)?.label} 
                onPress={() => setActivityModalVisible(true)} 
              />

              <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: accentColors.primary }]} 
                onPress={handleSave}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Profile</Text>
                )}
              </TouchableOpacity>
                            {profile && (
                <View style={[styles.calorieGoalSection, { backgroundColor: colors.background.secondary }]}>
                  <Text style={[styles.calorieGoalTitle, { color: colors.text.primary }]}>Daily Calorie Goal</Text>
                  
                  {/* AI Generated Goal */}
                  <View style={[styles.aiGoalCard, { backgroundColor: `${accentColors.primary}15` }]}>
                    <View style={styles.aiGoalHeader}>
                      <Ionicons name="sparkles" size={18} color={accentColors.primary} />
                      <Text style={[styles.aiGoalLabel, { color: colors.text.secondary }]}>AI Recommended</Text>
                    </View>
                    <Text style={[styles.aiGoalValue, { color: accentColors.primary }]}>
                      {profile.daily_calorie_goal || 2000} cal/day
                    </Text>
                    <Text style={[styles.aiGoalNote, { color: colors.text.muted }]}>
                      Based on your height, weight, goal & activity level
                    </Text>
                  </View>

                  {/* Custom Goal Toggle */}
                  <View style={[styles.customGoalToggle, { backgroundColor: colors.background.card }]}>
                    <View style={styles.customGoalToggleLeft}>
                      <Ionicons name="create-outline" size={20} color={colors.text.primary} />
                      <Text style={[styles.customGoalToggleText, { color: colors.text.primary }]}>
                        Use Custom Goal
                      </Text>
                    </View>
                    <CustomToggle
                      value={isCustomCalorieGoal}
                      onValueChange={(value) => {
                        setIsCustomCalorieGoal(value);
                        if (!value) {
                          setCustomCalorieGoal('');
                        } else {
                          setCustomCalorieGoal((profile.daily_calorie_goal || 2000).toString());
                        }
                      }}
                      activeColor={accentColors.primary}
                      inactiveColor={mode === 'dark' ? '#39393D' : '#E5E5EA'}
                    />
                  </View>

                  {/* Custom Goal Input */}
                  {isCustomCalorieGoal && (
                    <View style={styles.customGoalInputSection}>
                      <Text style={[styles.customGoalInputLabel, { color: colors.text.secondary }]}>
                        Your Custom Daily Goal
                      </Text>
                      <View style={styles.customGoalInputRow}>
                        <TextInput
                          style={[styles.customGoalInput, { 
                            backgroundColor: colors.background.input, 
                            borderColor: accentColors.primary, 
                            color: colors.text.primary 
                          }]}
                          value={customCalorieGoal}
                          onChangeText={setCustomCalorieGoal}
                          keyboardType="numeric"
                          placeholder="e.g., 1800"
                          placeholderTextColor={colors.text.muted}
                          maxLength={5}
                        />
                        <Text style={[styles.customGoalUnit, { color: colors.text.secondary }]}>cal/day</Text>
                      </View>
                      
                      {/* Quick Adjustment Buttons */}
                      <View style={styles.quickAdjustRow}>
                        <TouchableOpacity 
                          style={[styles.quickAdjustBtn, { backgroundColor: colors.background.card }]}
                          onPress={() => {
                            const current = parseInt(customCalorieGoal) || 2000;
                            setCustomCalorieGoal(Math.max(1000, current - 100).toString());
                          }}
                        >
                          <Text style={[styles.quickAdjustText, { color: colors.text.primary }]}>-100</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.quickAdjustBtn, { backgroundColor: colors.background.card }]}
                          onPress={() => {
                            const current = parseInt(customCalorieGoal) || 2000;
                            setCustomCalorieGoal(Math.max(1000, current - 50).toString());
                          }}
                        >
                          <Text style={[styles.quickAdjustText, { color: colors.text.primary }]}>-50</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.quickAdjustBtn, { backgroundColor: colors.background.card }]}
                          onPress={() => {
                            const current = parseInt(customCalorieGoal) || 2000;
                            setCustomCalorieGoal((current + 50).toString());
                          }}
                        >
                          <Text style={[styles.quickAdjustText, { color: colors.text.primary }]}>+50</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.quickAdjustBtn, { backgroundColor: colors.background.card }]}
                          onPress={() => {
                            const current = parseInt(customCalorieGoal) || 2000;
                            setCustomCalorieGoal((current + 100).toString());
                          }}
                        >
                          <Text style={[styles.quickAdjustText, { color: colors.text.primary }]}>+100</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Reset to AI Goal Button */}
                      <TouchableOpacity 
                        style={[styles.resetGoalBtn, { borderColor: colors.border.primary }]}
                        onPress={() => {
                          setCustomCalorieGoal((profile.daily_calorie_goal || 2000).toString());
                        }}
                      >
                        <Ionicons name="refresh" size={16} color={colors.text.secondary} />
                        <Text style={[styles.resetGoalText, { color: colors.text.secondary }]}>
                          Reset to AI Recommendation
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Active Goal Display */}
                  <View style={[styles.activeGoalCard, { backgroundColor: accentColors.primary }]}>
                    <Text style={styles.activeGoalLabel}>Active Daily Goal</Text>
                    <Text style={styles.activeGoalValue}>
                      {isCustomCalorieGoal && customCalorieGoal 
                        ? `${customCalorieGoal} cal` 
                        : `${profile.daily_calorie_goal || 2000} cal`}
                    </Text>
                    <Text style={styles.activeGoalSource}>
                      {isCustomCalorieGoal ? '✏️ Custom' : '✨ AI Generated'}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Appearance</Text>

              {/* Theme Mode */}
              <View style={[styles.darkModeCard, { backgroundColor: colors.background.input, borderColor: colors.border.primary }]}>
                <View style={styles.settingInfo}>
                  <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={24} color={accentColors.primary} />
                  <View style={styles.settingText}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>Dark Mode</Text>
                    <Text style={[styles.settingDescription, { color: colors.text.muted }]}>
                      {mode === 'dark' ? 'Dark theme active' : 'Light theme active'}
                    </Text>
                  </View>
                </View>
                <CustomToggle
                  value={mode === 'dark'}
                  onValueChange={() => setMode(mode === 'dark' ? 'light' : 'dark')}
                  activeColor={accentColors.primary}
                  inactiveColor={mode === 'dark' ? '#39393D' : '#E5E5EA'}
                />
              </View>

              {/* Accent Color */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                Accent Color
              </Text>
              <View style={styles.colorGrid}>
                {ACCENT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color.value}
                    style={[
                      styles.colorOption,
                      { backgroundColor: AccentColors[color.value].primary },
                      accent === color.value && styles.colorOptionSelected
                    ]}
                    onPress={() => setAccent(color.value)}
                  >
                    {accent === color.value && (
                      <Ionicons name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                Preview
              </Text>
              <LinearGradient
                colors={accentColors.gradient as [string, string]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.previewCard}
              >
                <View style={styles.previewContent}>
                  <Ionicons name="diamond" size={28} color="#fff" />
                  <View>
                    <Text style={styles.previewTitle}>FitTrax+ Premium</Text>
                    <Text style={styles.previewSubtitle}>Your selected accent color</Text>
                  </View>
                </View>
              </LinearGradient>

              <View style={[styles.previewButton, { backgroundColor: accentColors.primary }]}>
                <Text style={styles.previewButtonText}>{t('profile.sampleButton')}</Text>
              </View>

              {/* Language Selection */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                {t('profile.language')}
              </Text>
              <View style={styles.languageGrid}>
                {LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.languageOption,
                      { 
                        backgroundColor: language === lang.code 
                          ? accentColors.primary 
                          : colors.background.input,
                        borderColor: language === lang.code 
                          ? accentColors.primary 
                          : colors.border.primary,
                      }
                    ]}
                    onPress={() => setLanguage(lang.code as 'en' | 'es' | 'de')}
                  >
                    <Text style={styles.languageFlag}>{lang.flag}</Text>
                    <Text style={[
                      styles.languageName,
                      { color: language === lang.code ? '#fff' : colors.text.primary }
                    ]}>
                      {lang.nativeName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Voice Greeting Settings */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                Voice Greeting
              </Text>
              <View style={[styles.voiceSettingsCard, { backgroundColor: colors.background.input, borderColor: colors.border.primary }]}>
                <View style={styles.voiceSettingRow}>
                  <View style={styles.voiceSettingInfo}>
                    <Ionicons name="volume-high" size={24} color={accentColors.primary} />
                    <View style={{ marginLeft: 12, flex: 1, marginRight: 12 }}>
                      <Text style={[styles.voiceSettingLabel, { color: colors.text.primary }]}>Enable Voice Greeting</Text>
                      <Text style={[styles.voiceSettingHint, { color: colors.text.muted }]}>Play greeting on app open</Text>
                    </View>
                  </View>
                  <CustomToggle
                    value={voiceGreetingEnabled}
                    onValueChange={handleVoiceGreetingToggle}
                    activeColor={accentColors.primary}
                    inactiveColor={mode === 'dark' ? '#39393D' : '#E5E5EA'}
                  />
                </View>
                
                <View style={[styles.voiceDivider, { backgroundColor: colors.border.primary }]} />
                
                {/* Record Custom Greeting Section */}
                <View style={styles.recordSectionInline}>
                  <View style={styles.recordHeader}>
                    <Ionicons name="mic" size={24} color={accentColors.primary} />
                    <View style={styles.recordHeaderText}>
                      <Text style={[styles.recordTitle, { color: colors.text.primary }]}>
                        🎙️ Your Voice Greeting
                      </Text>
                      <Text style={[styles.recordSubtitle, { color: colors.text.muted }]}>
                        {hasCustomRecording ? 'Recording saved!' : 'Record a personalized greeting (max 5 sec)'}
                      </Text>
                    </View>
                  </View>

                  {/* Recording Controls */}
                  {!hasCustomRecording ? (
                    <TouchableOpacity 
                      style={[
                        styles.recordButton, 
                        { backgroundColor: isRecording ? '#EF4444' : accentColors.primary }
                      ]}
                      onPress={isRecording ? stopRecording : startRecording}
                    >
                      <Ionicons 
                        name={isRecording ? "stop" : "mic"} 
                        size={24} 
                        color="#fff" 
                      />
                      <Text style={styles.recordButtonText}>
                        {isRecording ? `Recording... ${5 - recordingTime}s` : 'Record Greeting'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.customRecordingControls}>
                      <View style={styles.customRecordingActions}>
                        <TouchableOpacity 
                          style={[styles.playButton, { backgroundColor: accentColors.primary }]}
                          onPress={playCustomRecording}
                        >
                          <Ionicons name="play" size={20} color="#fff" />
                          <Text style={styles.playButtonTextWhite}>Test Greeting</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.reRecordButton, { backgroundColor: colors.background.card, borderColor: colors.border.primary }]}
                          onPress={() => setHasCustomRecording(false)}
                        >
                          <Ionicons name="refresh" size={18} color={colors.text.secondary} />
                          <Text style={[styles.reRecordText, { color: colors.text.secondary }]}>Re-record</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.deleteButtonSmall, { backgroundColor: '#FEE2E2' }]}
                          onPress={deleteCustomRecording}
                        >
                          <Ionicons name="trash" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {isRecording && (
                    <View style={styles.recordingIndicator}>
                      <View style={[styles.recordingDot, { backgroundColor: '#EF4444' }]} />
                      <Text style={[styles.recordingText, { color: '#EF4444' }]}>
                        Recording... Speak now!
                      </Text>
                    </View>
                  )}

                  {!hasCustomRecording && !isRecording && (
                    <Text style={[styles.recordingHint, { color: colors.text.muted }]}>
                      💡 Make a recording saying "Good morning, you've got this!" or any personal greeting
                    </Text>
                  )}
                </View>
              </View>

              {/* Terms of Service Status */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                Legal
              </Text>
              <View style={[styles.tosStatusCard, { backgroundColor: colors.background.input, borderColor: colors.border.primary }]}>
                <View style={styles.tosStatusHeader}>
                  <Ionicons name="document-text" size={24} color={accentColors.primary} />
                  <View style={styles.tosStatusInfo}>
                    <Text style={[styles.tosStatusTitle, { color: colors.text.primary }]}>Terms of Service</Text>
                    {tosAccepted?.accepted ? (
                      <View style={styles.tosAcceptedRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                        <Text style={[styles.tosStatusText, { color: '#22C55E' }]}>
                          Accepted on {new Date(tosAccepted.acceptedAt).toLocaleDateString()}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.tosAcceptedRow}>
                        <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                        <Text style={[styles.tosStatusText, { color: '#F59E0B' }]}>Not yet accepted</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity 
                  style={[styles.viewTosButton, { borderColor: accentColors.primary }]}
                  onPress={() => router.push('/terms-of-service')}
                >
                  <Text style={[styles.viewTosButtonText, { color: accentColors.primary }]}>View Terms</Text>
                </TouchableOpacity>
              </View>
{/* Premium Subscription Section */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                Subscription
              </Text>
              <TouchableOpacity 
                style={[styles.tosStatusCard, { backgroundColor: colors.background.input, borderColor: colors.border.primary }]}
                onPress={() => router.push('/membership')}
                activeOpacity={0.7}
              >
                <View style={styles.tosStatusHeader}>
                  <Ionicons name="diamond" size={24} color="#8B5CF6" />
                  <View style={styles.tosStatusInfo}>
                    <Text style={[styles.tosStatusTitle, { color: colors.text.primary }]}>FitTrax+ Premium</Text>
                    <View style={styles.tosAcceptedRow}>
                      <Ionicons name="sparkles" size={16} color="#8B5CF6" />
                      <Text style={[styles.tosStatusText, { color: '#8B5CF6' }]}>
                        AI Workouts • Body Scan • More
                      </Text>
                    </View>
                  </View>
                </View>
                <TouchableOpacity 
                  style={[styles.viewTosButton, { borderColor: '#8B5CF6' }]}
                  onPress={() => router.push('/membership')}
                >
                  <Text style={[styles.viewTosButtonText, { color: '#8B5CF6' }]}>
                    View Plans
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
              {/* Health Connect Section */}
              <Text style={[styles.fieldLabel, { color: colors.text.secondary, marginTop: 24 }]}>
                Health & Fitness
              </Text>
              <View style={[styles.tosStatusCard, { backgroundColor: colors.background.input, borderColor: colors.border.primary }]}>
                <View style={styles.tosStatusHeader}>
                  <Ionicons name="heart" size={24} color="#FF2D55" />
                  <View style={styles.tosStatusInfo}>
                    <Text style={[styles.tosStatusTitle, { color: colors.text.primary }]}>Apple Health</Text>
                    {healthConnectStatus?.connected && healthConnectStatus?.method === 'apple_health' ? (
                      <View style={styles.tosAcceptedRow}>
                        <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                        <Text style={[styles.tosStatusText, { color: '#22C55E' }]}>
                          Connected
                        </Text>
                      </View>
                    ) : healthConnectStatus?.connected && healthConnectStatus?.method === 'manual' ? (
                      <View style={styles.tosAcceptedRow}>
                        <Ionicons name="create-outline" size={16} color="#3B82F6" />
                        <Text style={[styles.tosStatusText, { color: '#3B82F6' }]}>
                          Manual tracking enabled
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.tosAcceptedRow}>
                        <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                        <Text style={[styles.tosStatusText, { color: '#F59E0B' }]}>Not connected</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity 
                  style={[styles.viewTosButton, { borderColor: '#FF2D55' }]}
                  onPress={handleConnectHealth}
                >
                  <Text style={[styles.viewTosButtonText, { color: '#FF2D55' }]}>
                    {healthConnectStatus?.connected ? 'Manage' : 'Connect'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
            {/* Picker Modals */}
      <PickerModal
        visible={ageModalVisible}
        onClose={() => setAgeModalVisible(false)}
        onSelect={(value) => updateField('age', value)}
        title="Select Age"
        options={AGE_OPTIONS.map(age => ({ label: `${age} years`, value: age }))}
        selectedValue={formData.age}
      />
      <PickerModal
        visible={genderModalVisible}
        onClose={() => setGenderModalVisible(false)}
        onSelect={(value) => updateField('gender', value)}
        title="Select Gender"
        options={GENDER_OPTIONS}
        selectedValue={formData.gender}
      />
      <PickerModal
        visible={heightFeetModalVisible}
        onClose={() => setHeightFeetModalVisible(false)}
        onSelect={(value) => updateField('height_feet', value)}
        title="Height (Feet)"
        options={HEIGHT_FEET_OPTIONS.map(ft => ({ label: `${ft} feet`, value: ft }))}
        selectedValue={formData.height_feet}
      />
      <PickerModal
        visible={heightInchesModalVisible}
        onClose={() => setHeightInchesModalVisible(false)}
        onSelect={(value) => updateField('height_inches', value)}
        title="Height (Inches)"
        options={HEIGHT_INCHES_OPTIONS.map(inch => ({ label: `${inch} inches`, value: inch }))}
        selectedValue={formData.height_inches}
      />
      <PickerModal
        visible={weightModalVisible}
        onClose={() => setWeightModalVisible(false)}
        onSelect={(value) => updateField('weight', value)}
        title="Current Weight"
        options={WEIGHT_OPTIONS.map(w => ({ label: `${w} lbs`, value: w }))}
        selectedValue={formData.weight}
      />
      <PickerModal
        visible={goalWeightModalVisible}
        onClose={() => setGoalWeightModalVisible(false)}
        onSelect={(value) => updateField('goal_weight', value)}
        title="Goal Weight"
        options={WEIGHT_OPTIONS.map(w => ({ label: `${w} lbs`, value: w }))}
        selectedValue={formData.goal_weight}
      />
      <PickerModal
        visible={activityModalVisible}
        onClose={() => setActivityModalVisible(false)}
        onSelect={(value) => updateField('activity_level', value)}
        title="Activity Level"
        options={ACTIVITY_OPTIONS}
        selectedValue={formData.activity_level}
      />
    </SafeAreaView>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 17,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
  },
  picker: {
    height: 216,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  selectorButton: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorValue: {
    fontSize: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  saveButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  goalCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  goalLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  goalValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingText: {},
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
  },
  previewCard: {
    borderRadius: 16,
    padding: 20,
  },
  previewContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  previewSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  previewButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  languageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    minWidth: 120,
  },
  languageFlag: {
    fontSize: 24,
  },
  languageName: {
    fontSize: 15,
    fontWeight: '600',
  },
  // Dark Mode Card Style
  darkModeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  // Calorie Goal Section Styles
  calorieGoalSection: {
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
  },
  calorieGoalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  aiGoalCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  aiGoalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  aiGoalLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  aiGoalValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  aiGoalNote: {
    fontSize: 12,
    marginTop: 4,
  },
  customGoalToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  customGoalToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customGoalToggleText: {
    fontSize: 15,
    fontWeight: '600',
  },
  customGoalInputSection: {
    marginBottom: 12,
  },
  customGoalInputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  customGoalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  customGoalInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  customGoalUnit: {
    fontSize: 16,
    fontWeight: '600',
  },
  quickAdjustRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickAdjustBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAdjustText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resetGoalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetGoalText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeGoalCard: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  activeGoalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  activeGoalValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginVertical: 4,
  },
  activeGoalSource: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  // TOS Status Card Styles
  tosStatusCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  tosStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tosStatusInfo: {
    flex: 1,
  },
  tosStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  tosStatusText: {
    fontSize: 13,
  },
  tosAcceptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  viewTosButton: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  viewTosButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Voice Greeting Styles
  voiceSettingsCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  voiceSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voiceSettingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  voiceSettingLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  voiceSettingHint: {
    fontSize: 13,
    marginTop: 2,
  },
  voiceDivider: {
    height: 1,
    marginVertical: 16,
  },
  // Inline Recording Styles
  recordSectionInline: {
    marginTop: 8,
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  recordHeaderText: {
    flex: 1,
  },
  recordTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  recordSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
  },
  recordButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  customRecordingControls: {
    gap: 12,
  },
  customRecordingActions: {
    flexDirection: 'row',
    gap: 10,
  },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  playButtonTextWhite: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  reRecordButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  reRecordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButtonSmall: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recordingText: {
    fontSize: 13,
    fontWeight: '500',
  },
  recordingHint: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  voiceGenderLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  voiceGenderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  voiceGenderOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  voiceGenderText: {
    fontSize: 15,
    fontWeight: '600',
  },
  voiceLanguageNote: {
    fontSize: 12,
    marginTop: 12,
    textAlign: 'center',
  },
  chooseVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  chooseVoiceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  chooseVoiceTextContainer: {
    flex: 1,
  },
  chooseVoiceLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  chooseVoiceValue: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 2,
  },
  testVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  testVoiceBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});

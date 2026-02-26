import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Animated,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';
const { width } = Dimensions.get('window');

type TabType = 'calculator' | 'log' | 'stacks' | 'protocols' | 'progress' | 'ai';

interface Peptide {
  name: string;
  category: string;
  description: string;
  common_doses: number[];
  dose_unit: string;
  frequency: string;
  typical_duration: string;
  half_life: string;
  storage: string;
  common_uses: string[];
  notes: string;
}

interface InjectionSite {
  id: string;
  name: string;
  description: string;
  recent_count: number;
}

interface PeptideStack {
  id: string;
  name: string;
  peptides: string[];
  goal: string;
  created_by: 'ai' | 'manual';
  created_at: string;
}

interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function PeptideCalculatorScreen() {
  const { userId } = useUserStore();
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('calculator');
  
  // Data
  const [peptideDatabase, setPeptideDatabase] = useState<Record<string, Peptide>>({});
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [injectionHistory, setInjectionHistory] = useState<any[]>([]);
  const [protocols, setProtocols] = useState<any[]>([]);
  const [missedDoses, setMissedDoses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [siteRotation, setSiteRotation] = useState<InjectionSite[]>([]);
  const [recommendedSite, setRecommendedSite] = useState('');
  
  // Calculator state
  const [selectedPeptide, setSelectedPeptide] = useState<string>('');
  const [peptideAmount, setPeptideAmount] = useState('5');
  const [waterAmount, setWaterAmount] = useState('2');
  const [desiredDose, setDesiredDose] = useState('250');
  const [syringeUnits, setSyringeUnits] = useState('100');
  const [calcResult, setCalcResult] = useState<any>(null);
  
  // Injection log state
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [logPeptide, setLogPeptide] = useState('');
  const [logDose, setLogDose] = useState('');
  const [logSite, setLogSite] = useState('');
  const [logNotes, setLogNotes] = useState('');
  const [logSideEffects, setLogSideEffects] = useState('');
  
  // AI state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChatHistory, setAiChatHistory] = useState<AIChatMessage[]>([]);
  const [savedConversations, setSavedConversations] = useState<{id: string, title: string, timestamp: string, messages: AIChatMessage[]}[]>([]);
  const [showConversationPicker, setShowConversationPicker] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);
  
  // Stacks state
  const [stacks, setStacks] = useState<PeptideStack[]>([]);
  const [showStackModal, setShowStackModal] = useState(false);
  const [stackCreationMode, setStackCreationMode] = useState<'ai' | 'manual' | null>(null);
  const [newStackName, setNewStackName] = useState('');
  const [newStackGoal, setNewStackGoal] = useState('');
  const [selectedStackPeptides, setSelectedStackPeptides] = useState<string[]>([]);
  const [aiStackLoading, setAiStackLoading] = useState(false);
  const [expandedStackId, setExpandedStackId] = useState<string | null>(null);
  const [viewStackDetails, setViewStackDetails] = useState<PeptideStack | null>(null);
  
  // Delete stack function - also deletes associated protocols
  const deleteStack = async (stackId: string, stackName: string) => {
    Alert.alert(
      'Delete Stack',
      'Are you sure you want to delete this stack and all its associated protocols? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete the stack
              await axios.delete(`${API_URL}/api/peptides/stacks/${userId}/${stackId}`);
              
              // Also delete protocols associated with this stack
              try {
                await axios.delete(`${API_URL}/api/peptides/protocols-by-stack/${userId}/${encodeURIComponent(stackName)}`);
              } catch (protocolError) {
                console.log('No protocols to delete or error:', protocolError);
              }
              
              // Refresh both stacks and protocols
              const [stacksRes, protocolsRes] = await Promise.all([
                axios.get(`${API_URL}/api/peptides/stacks/${userId}`),
                axios.get(`${API_URL}/api/peptides/protocols/${userId}`)
              ]);
              setStacks(stacksRes.data.stacks || []);
              setProtocols(protocolsRes.data.protocols || []);
              setViewStackDetails(null);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete stack');
            }
          }
        }
      ]
    );
  };
  
  // Delete individual protocol
  const deleteProtocol = async (protocolId: string, protocolName: string) => {
    Alert.alert(
      'Delete Protocol',
      `Are you sure you want to delete "${protocolName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/peptides/protocol/${userId}/${protocolId}`);
              setProtocols(prev => prev.filter(p => p._id !== protocolId));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete protocol');
            }
          }
        }
      ]
    );
  };
  
  // Peptide info modal
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [selectedPeptideInfo, setSelectedPeptideInfo] = useState<Peptide | null>(null);
  
  // Peptide selector modal
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [selectorCallback, setSelectorCallback] = useState<((id: string) => void) | null>(null);

  // Load saved conversations on mount
  useEffect(() => {
    loadSavedConversations();
  }, [userId]);

  // Load most recent conversation when entering AI tab (if no current conversation)
  useEffect(() => {
    if (activeTab === 'ai' && aiChatHistory.length === 0 && savedConversations.length > 0 && !currentConversationId) {
      // Auto-load the most recent conversation
      const mostRecent = savedConversations[0];
      if (mostRecent && mostRecent.messages) {
        setAiChatHistory(mostRecent.messages);
        setCurrentConversationId(mostRecent.id);
      }
    }
  }, [activeTab, savedConversations]);

  // Auto-save conversation when it changes (after AI responses)
  useEffect(() => {
    if (aiChatHistory.length > 0 && userId) {
      // Debounce save to avoid too many API calls
      const saveTimer = setTimeout(() => {
        saveConversationSilent();
      }, 1000);
      return () => clearTimeout(saveTimer);
    }
  }, [aiChatHistory, userId]);

  // Save conversation when switching away from AI tab
  useEffect(() => {
    if (activeTab !== 'ai' && aiChatHistory.length > 0 && userId) {
      saveConversationSilent();
    }
  }, [activeTab]);

  const loadSavedConversations = async () => {
    if (!userId) return;
    try {
      const response = await axios.get(`${API_URL}/api/peptides/chat/history/${userId}`);
      setSavedConversations(response.data.conversations || []);
    } catch (error) {
      console.log('No saved conversations');
    }
  };

  // Silent save - doesn't reload list (for auto-save)
  const saveConversationSilent = async () => {
    if (!userId || aiChatHistory.length === 0) return;
    try {
      const title = aiChatHistory[0]?.content?.substring(0, 50) + '...' || 'New Conversation';
      const convId = currentConversationId || `conv_${Date.now()}`;
      
      await axios.post(`${API_URL}/api/peptides/chat/save`, {
        user_id: userId,
        conversation_id: convId,
        title,
        messages: aiChatHistory,
      });
      
      // Update currentConversationId if it was new
      if (!currentConversationId) {
        setCurrentConversationId(convId);
      }
    } catch (error) {
      console.error('Error auto-saving conversation:', error);
    }
  };

  const saveConversation = async () => {
    if (!userId || aiChatHistory.length === 0) return;
    try {
      const title = aiChatHistory[0]?.content?.substring(0, 50) + '...' || 'New Conversation';
      const convId = currentConversationId || `conv_${Date.now()}`;
      
      await axios.post(`${API_URL}/api/peptides/chat/save`, {
        user_id: userId,
        conversation_id: convId,
        title,
        messages: aiChatHistory,
      });
      
      if (!currentConversationId) {
        setCurrentConversationId(convId);
      }
      
      loadSavedConversations();
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const loadConversation = (conv: any) => {
    setAiChatHistory(conv.messages);
    setCurrentConversationId(conv.id);
    setShowConversationPicker(false);
  };

  const startNewConversation = () => {
    if (aiChatHistory.length > 0) {
      saveConversation();
    }
    setAiChatHistory([]);
    setCurrentConversationId(null);
    setShowConversationPicker(false);
  };

  const deleteConversation = async (conversationId: string) => {
    if (!userId) return;
    try {
      await axios.delete(`${API_URL}/api/peptides/chat/${userId}/${conversationId}`);
      // Remove from local state
      setSavedConversations(prev => prev.filter(c => c.id !== conversationId));
      // If we deleted the current conversation, clear it
      if (currentConversationId === conversationId) {
        setAiChatHistory([]);
        setCurrentConversationId(null);
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      Alert.alert('Error', 'Failed to delete conversation');
    }
  };

  const confirmDeleteConversation = (conv: any) => {
    Alert.alert(
      'Delete Conversation',
      `Delete "${conv.title?.substring(0, 30)}..."?\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => deleteConversation(conv.id)
        }
      ]
    );
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [dbRes, historyRes, protocolsRes, missedRes, statsRes, siteRes, stacksRes] = await Promise.all([
        axios.get(`${API_URL}/api/peptides/database`),
        userId ? axios.get(`${API_URL}/api/peptides/injections/${userId}?limit=20`) : null,
        userId ? axios.get(`${API_URL}/api/peptides/protocols/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/peptides/missed-doses/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/peptides/stats/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/peptides/site-rotation/${userId}`) : null,
        userId ? axios.get(`${API_URL}/api/peptides/stacks/${userId}`) : null,
      ]);
      
      setPeptideDatabase(dbRes.data.peptides);
      setCategories(dbRes.data.categories);
      
      if (historyRes) setInjectionHistory(historyRes.data.injections || []);
      if (protocolsRes) setProtocols(protocolsRes.data.protocols || []);
      if (missedRes) setMissedDoses(missedRes.data.missed_doses || []);
      if (statsRes) setStats(statsRes.data);
      if (siteRes) {
        setSiteRotation(siteRes.data.sites || []);
        setRecommendedSite(siteRes.data.recommended_next || '');
      }
      if (stacksRes) setStacks(stacksRes.data.stacks || []);
    } catch (error) {
      console.error('Error loading peptide data:', error);
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

  const calculateReconstitution = async () => {
    try {
      const response = await axios.post(`${API_URL}/api/peptides/calculate-reconstitution`, {
        peptide_amount_mg: parseFloat(peptideAmount),
        water_amount_ml: parseFloat(waterAmount),
        desired_dose_mcg: parseFloat(desiredDose),
        syringe_units: parseInt(syringeUnits),
      });
      setCalcResult(response.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to calculate reconstitution');
    }
  };

  const logInjection = async () => {
    if (!logPeptide || !logDose || !logSite) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }
    
    try {
      const peptideInfo = peptideDatabase[logPeptide];
      await axios.post(`${API_URL}/api/peptides/log-injection`, {
        user_id: userId,
        peptide_id: logPeptide,
        peptide_name: peptideInfo?.name || logPeptide,
        dose_mcg: parseFloat(logDose),
        injection_site: logSite,
        injection_time: new Date().toISOString(),
        notes: logNotes,
        side_effects: logSideEffects,
      });
      
      Alert.alert('Success', 'Injection logged successfully');
      setLogModalVisible(false);
      setLogPeptide('');
      setLogDose('');
      setLogSite('');
      setLogNotes('');
      setLogSideEffects('');
      loadData();
    } catch (error) {
      Alert.alert('Error', 'Failed to log injection');
    }
  };

  const askAI = async () => {
    if (!aiQuestion.trim()) return;
    
    // Add user message to history
    const userMessage: AIChatMessage = {
      role: 'user',
      content: aiQuestion,
      timestamp: new Date().toISOString(),
    };
    setAiChatHistory(prev => [...prev, userMessage]);
    
    const currentQuestion = aiQuestion;
    setAiQuestion('');
    setAiLoading(true);
    
    try {
      const response = await axios.post(`${API_URL}/api/peptides/ai-insights`, {
        user_id: userId,
        question: currentQuestion,
        context: selectedPeptide || '',
      });
      
      // Add assistant message to history
      const assistantMessage: AIChatMessage = {
        role: 'assistant',
        content: response.data.response,
        timestamp: new Date().toISOString(),
      };
      setAiChatHistory(prev => [...prev, assistantMessage]);
      setAiResponse(response.data.response);
    } catch (error) {
      Alert.alert('Error', 'Failed to get AI response');
    } finally {
      setAiLoading(false);
    }
  };

  const deleteInjection = async (injectionId: string) => {
    Alert.alert(
      'Delete Injection',
      'Are you sure you want to delete this injection log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/peptides/injection/${injectionId}`);
              setInjectionHistory(prev => prev.filter(inj => inj.injection_id !== injectionId));
            } catch (error) {
              Alert.alert('Error', 'Failed to delete injection');
            }
          },
        },
      ]
    );
  };

  const renderRightActions = (injectionId: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => deleteInjection(injectionId)}
      >
        <Ionicons name="trash" size={24} color="#fff" />
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    );
  };

  const openPeptideSelector = (callback: (id: string) => void) => {
    setSelectorCallback(() => callback);
    setSelectorVisible(true);
  };

  const selectPeptide = (id: string) => {
    if (selectorCallback) {
      selectorCallback(id);
    }
    setSelectorVisible(false);
  };

  const showPeptideInfo = (peptideId: string) => {
    const info = peptideDatabase[peptideId];
    if (info) {
      setSelectedPeptideInfo(info);
      setInfoModalVisible(true);
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      recovery: '#10B981',
      glp1: '#8B5CF6',
      gh_secretagogue: '#3B82F6',
      igf: '#EC4899',
      longevity: '#F59E0B',
      sexual_health: '#EF4444',
    };
    return colors[category] || Colors.brand.primary;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Peptides IQ</Text>
          <TouchableOpacity onPress={() => setLogModalVisible(true)} style={styles.addButton}>
            <Ionicons name="add-circle" size={28} color={accent.primary} />
          </TouchableOpacity>
        </View>

        {/* Tabs - Improved styling */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabsContainer}
        >
          {[
            { id: 'calculator', label: 'Calculator', icon: 'calculator' },
            { id: 'log', label: 'Log', icon: 'list' },
            { id: 'stacks', label: 'Stacks', icon: 'layers' },
            { id: 'protocols', label: 'Protocols', icon: 'calendar' },
            { id: 'progress', label: 'Progress', icon: 'trending-up' },
            { id: 'ai', label: 'AI Research', icon: 'bulb' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.tab, 
                { backgroundColor: colors.background.input },
                activeTab === tab.id && { backgroundColor: accent.primary }
              ]}
              onPress={() => setActiveTab(tab.id as TabType)}
            >
              <Ionicons 
                name={tab.icon as any} 
                size={18} 
                color={activeTab === tab.id ? '#fff' : colors.text.secondary} 
              />
              <Text style={[
                styles.tabText, 
                { color: colors.text.secondary },
                activeTab === tab.id && styles.tabTextActive
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Calculator Tab */}
          {activeTab === 'calculator' && (
            <>
              {/* Ask FitTrax Peptide AI Button - Above Stats */}
              <TouchableOpacity 
                style={styles.askAiButton}
                onPress={() => setActiveTab('ai')}
              >
                <ImageBackground
                  source={{ uri: 'https://customer-assets.emergentagent.com/job_970ac2e4-990e-43f3-b947-2a52c9d782f5/artifacts/u64bo8xe_vials-blue-background_1249787-26915.PNG' }}
                  style={styles.askAiImageBg}
                  imageStyle={styles.askAiImageBgStyle}
                  resizeMode="cover"
                >
                  <View style={styles.askAiOverlay}>
                    <MaterialCommunityIcons name="robot" size={28} color="#fff" />
                    <View style={styles.askAiTextContainer}>
                      <Text style={styles.askAiTitle}>Ask FitTrax Peptide AI</Text>
                      <Text style={styles.askAiSubtitle}>Get research-backed insights instantly</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={24} color="#fff" />
                  </View>
                </ImageBackground>
              </TouchableOpacity>

              {/* Stats Summary */}
              {stats && (
                <View style={styles.statsRow}>
                  <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
                    <Text style={[styles.statValue, { color: accent.primary }]}>{stats.total_injections}</Text>
                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Total Logs</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
                    <Text style={[styles.statValue, { color: accent.primary }]}>{stats.this_week_injections}</Text>
                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>This Week</Text>
                  </View>
                  <View style={[styles.statCard, { backgroundColor: colors.background.card }]}>
                    <Text style={[styles.statValue, { color: accent.primary }]}>{stats.current_streak}</Text>
                    <Text style={[styles.statLabel, { color: colors.text.secondary }]}>Day Streak</Text>
                  </View>
                </View>
              )}

              {/* Reconstitution Calculator */}
              <View style={[styles.card, { backgroundColor: colors.background.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Reconstitution Calculator</Text>
                
                <TouchableOpacity 
                  style={[styles.selectButton, { backgroundColor: colors.background.input }]}
                  onPress={() => openPeptideSelector((id) => {
                    setSelectedPeptide(id);
                    const p = peptideDatabase[id];
                    if (p && p.common_doses.length > 0) {
                      setDesiredDose(p.common_doses[0].toString());
                    }
                  })}
                >
                  <Text style={[styles.selectButtonText, { color: selectedPeptide ? colors.text.primary : colors.text.secondary }]}>
                    {selectedPeptide ? peptideDatabase[selectedPeptide]?.name : 'Select Peptide (optional)'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.text.secondary} />
                </TouchableOpacity>

                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Peptide Amount</Text>
                    <View style={[styles.inputWithUnit, { backgroundColor: colors.background.input }]}>
                      <TextInput
                        style={[styles.input, { color: colors.text.primary }]}
                        value={peptideAmount}
                        onChangeText={setPeptideAmount}
                        keyboardType="decimal-pad"
                        placeholder="5"
                        placeholderTextColor={colors.text.muted}
                      />
                      <Text style={[styles.inputUnit, { color: colors.text.secondary }]}>mg</Text>
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>BAC Water</Text>
                    <View style={[styles.inputWithUnit, { backgroundColor: colors.background.input }]}>
                      <TextInput
                        style={[styles.input, { color: colors.text.primary }]}
                        value={waterAmount}
                        onChangeText={setWaterAmount}
                        keyboardType="decimal-pad"
                        placeholder="2"
                        placeholderTextColor={colors.text.muted}
                      />
                      <Text style={[styles.inputUnit, { color: colors.text.secondary }]}>mL</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.inputRow}>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Desired Dose</Text>
                    <View style={[styles.inputWithUnit, { backgroundColor: colors.background.input }]}>
                      <TextInput
                        style={[styles.input, { color: colors.text.primary }]}
                        value={desiredDose}
                        onChangeText={setDesiredDose}
                        keyboardType="decimal-pad"
                        placeholder="250"
                        placeholderTextColor={colors.text.muted}
                      />
                      <Text style={[styles.inputUnit, { color: colors.text.secondary }]}>mcg</Text>
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Syringe</Text>
                    <View style={[styles.inputWithUnit, { backgroundColor: colors.background.input }]}>
                      <TextInput
                        style={[styles.input, { color: colors.text.primary }]}
                        value={syringeUnits}
                        onChangeText={setSyringeUnits}
                        keyboardType="number-pad"
                        placeholder="100"
                        placeholderTextColor={colors.text.muted}
                      />
                      <Text style={[styles.inputUnit, { color: colors.text.secondary }]}>units</Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity style={[styles.calculateButton, { backgroundColor: accent.primary }]} onPress={calculateReconstitution}>
                  <Ionicons name="calculator" size={20} color="#fff" />
                  <Text style={styles.calculateButtonText}>Calculate</Text>
                </TouchableOpacity>

                {calcResult && (
                  <View style={[styles.resultCard, { backgroundColor: `${accent.primary}15` }]}>
                    <View style={[styles.resultMain, { borderBottomColor: `${accent.primary}30` }]}>
                      <Text style={[styles.resultLabel, { color: colors.text.secondary }]}>Draw</Text>
                      <Text style={[styles.resultValue, { color: accent.primary }]}>{calcResult.units_for_dose} units</Text>
                      <Text style={[styles.resultSubtext, { color: colors.text.secondary }]}>{calcResult.syringe_marking}</Text>
                    </View>
                    <View style={styles.resultDetails}>
                      <View style={styles.resultRow}>
                        <Text style={[styles.resultDetailLabel, { color: colors.text.secondary }]}>Concentration</Text>
                        <Text style={[styles.resultDetailValue, { color: colors.text.primary }]}>{calcResult.concentration_mcg_per_ml} mcg/mL</Text>
                      </View>
                      <View style={styles.resultRow}>
                        <Text style={[styles.resultDetailLabel, { color: colors.text.secondary }]}>Per Unit</Text>
                        <Text style={[styles.resultDetailValue, { color: colors.text.primary }]}>{calcResult.mcg_per_unit} mcg</Text>
                      </View>
                      <View style={styles.resultRow}>
                        <Text style={[styles.resultDetailLabel, { color: colors.text.secondary }]}>Doses/Vial</Text>
                        <Text style={[styles.resultDetailValue, { color: colors.text.primary }]}>{calcResult.doses_per_vial}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Quick Peptide Reference */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Peptide Library</Text>
                {Object.entries(categories).map(([catId, catName]) => {
                  const peptides = Object.entries(peptideDatabase).filter(([_, p]) => p.category === catId);
                  if (peptides.length === 0) return null;
                  
                  return (
                    <View key={catId} style={styles.categorySection}>
                      <Text style={[styles.categoryTitle, { color: getCategoryColor(catId) }]}>
                        {catName}
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.peptideChips}>
                          {peptides.map(([id, peptide]) => (
                            <TouchableOpacity
                              key={id}
                              style={[styles.peptideChip, { borderColor: getCategoryColor(catId) }]}
                              onPress={() => showPeptideInfo(id)}
                            >
                              <Text style={[styles.peptideChipText, { color: colors.text.primary }]}>{peptide.name}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Log Tab */}
          {activeTab === 'log' && (
            <>
              {/* Missed Doses Alert */}
              {missedDoses.length > 0 && (
                <View style={styles.alertCard}>
                  <Ionicons name="warning" size={24} color="#F59E0B" />
                  <View style={styles.alertContent}>
                    <Text style={styles.alertTitle}>Missed Doses Detected</Text>
                    {missedDoses.slice(0, 2).map((dose, i) => (
                      <Text key={i} style={styles.alertText}>
                        {dose.peptide_name} on {dose.missed_date}
                      </Text>
                    ))}
                    {missedDoses.length > 2 && (
                      <Text style={styles.alertMore}>+{missedDoses.length - 2} more</Text>
                    )}
                  </View>
                </View>
              )}

              {/* Site Rotation */}
              <View style={[styles.card, { backgroundColor: colors.background.card }]}>
                <Text style={[styles.cardTitle, { color: colors.text.primary }]}>Injection Site Rotation</Text>
                <Text style={[styles.recommendedSite, { color: colors.text.primary }]}>
                  Recommended: <Text style={[styles.recommendedSiteValue, { color: accent.primary }]}>
                    {siteRotation.find(s => s.id === recommendedSite)?.name || 'Abdomen (Left)'}
                  </Text>
                </Text>
                <View style={styles.siteGrid}>
                  {siteRotation.map(site => (
                    <TouchableOpacity
                      key={site.id}
                      style={[
                        styles.siteCard,
                        { backgroundColor: colors.background.input },
                        site.id === recommendedSite && [styles.siteCardRecommended, { borderColor: accent.primary }]
                      ]}
                      onPress={() => {
                        setLogSite(site.id);
                        setLogModalVisible(true);
                      }}
                    >
                      <Text style={[styles.siteName, { color: colors.text.primary }]}>{site.name}</Text>
                      <Text style={[styles.siteCount, { color: colors.text.secondary }]}>{site.recent_count} recent</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Recent Injections */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Recent Injections</Text>
                {injectionHistory.length === 0 ? (
                  <View style={[styles.emptyState, { backgroundColor: colors.background.card }]}>
                    <Ionicons name="medical" size={48} color={colors.text.muted} />
                    <Text style={[styles.emptyText, { color: colors.text.primary }]}>No injections logged yet</Text>
                    <TouchableOpacity 
                      style={[styles.emptyButton, { backgroundColor: accent.primary }]}
                      onPress={() => setLogModalVisible(true)}
                    >
                      <Text style={styles.emptyButtonText}>Log Your First Injection</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  injectionHistory.map((inj, i) => (
                    <Swipeable
                      key={inj.injection_id || i}
                      renderRightActions={() => renderRightActions(inj.injection_id)}
                      overshootRight={false}
                    >
                      <View style={[styles.injectionCard, { backgroundColor: colors.background.card }]}>
                        <View style={styles.injectionHeader}>
                          <Text style={[styles.injectionPeptide, { color: colors.text.primary }]}>{inj.peptide_name}</Text>
                          <Text style={[styles.injectionDose, { color: accent.primary }]}>{inj.dose_mcg} mcg</Text>
                        </View>
                        <View style={styles.injectionDetails}>
                          <View style={styles.injectionDetail}>
                            <Ionicons name="location" size={14} color={colors.text.secondary} />
                            <Text style={[styles.injectionDetailText, { color: colors.text.secondary }]}>
                              {siteRotation.find(s => s.id === inj.injection_site)?.name || inj.injection_site}
                            </Text>
                          </View>
                          <View style={styles.injectionDetail}>
                            <Ionicons name="time" size={14} color={colors.text.secondary} />
                            <Text style={styles.injectionDetailText}>{formatDate(inj.injection_time)}</Text>
                          </View>
                        </View>
                        {inj.notes && <Text style={styles.injectionNotes}>{inj.notes}</Text>}
                        <Text style={styles.swipeHint}>← Swipe left to delete</Text>
                      </View>
                    </Swipeable>
                  ))
                )}
              </View>
            </>
          )}

          {/* Stacks Tab */}
          {activeTab === 'stacks' && (
            <View style={styles.section}>
              {/* Create New Stack Card */}
              <LinearGradient
                colors={['#10B981', '#059669']}
                style={styles.createStackCard}
              >
                <View style={styles.createStackHeader}>
                  <Ionicons name="layers" size={32} color="#fff" />
                  <View style={styles.createStackText}>
                    <Text style={styles.createStackTitle}>Create New Stack</Text>
                    <Text style={styles.createStackSubtitle}>Build your perfect peptide combination</Text>
                  </View>
                </View>
                
                <View style={styles.stackOptions}>
                  <TouchableOpacity 
                    style={styles.stackOptionCard}
                    onPress={() => {
                      setStackCreationMode('ai');
                      setShowStackModal(true);
                    }}
                  >
                    <LinearGradient
                      colors={['#667eea', '#764ba2']}
                      style={styles.stackOptionGradient}
                    >
                      <MaterialCommunityIcons name="robot" size={28} color="#fff" />
                      <Text style={styles.stackOptionTitle}>AI-Powered Stack</Text>
                      <Text style={styles.stackOptionDesc}>Let AI build your stack based on your goals</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.stackOptionCard}
                    onPress={() => {
                      setStackCreationMode('manual');
                      setShowStackModal(true);
                    }}
                  >
                    <View style={[styles.stackOptionManual, { backgroundColor: colors.background.card }]}>
                      <Ionicons name="build" size={28} color={accent.primary} />
                      <Text style={[styles.stackOptionTitle, { color: colors.text.primary }]}>Manual Selection</Text>
                      <Text style={[styles.stackOptionDesc, { color: colors.text.secondary }]}>Choose peptides yourself from database</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              {/* Saved Stacks */}
              <Text style={[styles.sectionTitle, { color: colors.text.primary, marginTop: 24 }]}>Your Saved Stacks</Text>
              {stacks.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: colors.background.card }]}>
                  <Ionicons name="layers-outline" size={48} color={colors.text.muted} />
                  <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No stacks created yet</Text>
                  <Text style={[styles.emptySubtext, { color: colors.text.muted }]}>
                    Create your first stack using AI or manual selection above
                  </Text>
                </View>
              ) : (
                stacks.map((stack, i) => (
                  <TouchableOpacity 
                    key={stack.id || i} 
                    style={[styles.savedStackCard, { backgroundColor: colors.background.card }]}
                    onPress={() => setViewStackDetails(stack)}
                  >
                    <View style={styles.savedStackHeader}>
                      <View style={styles.savedStackInfo}>
                        <Text style={[styles.savedStackName, { color: colors.text.primary }]}>{stack.name}</Text>
                        <View style={[styles.savedStackBadge, { backgroundColor: stack.created_by === 'ai' ? '#667eea20' : '#10B98120' }]}>
                          {stack.created_by === 'ai' ? (
                            <MaterialCommunityIcons name="robot" size={12} color="#667eea" />
                          ) : (
                            <Ionicons name="build" size={12} color="#10B981" />
                          )}
                          <Text style={[styles.savedStackBadgeText, { color: stack.created_by === 'ai' ? '#667eea' : '#10B981' }]}>
                            {stack.created_by === 'ai' ? 'AI Generated' : 'Manual'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.savedStackActions}>
                        <TouchableOpacity 
                          onPress={(e) => { e.stopPropagation(); deleteStack(stack.id, stack.name); }}
                          style={styles.deleteStackBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        </TouchableOpacity>
                        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                      </View>
                    </View>
                    <Text style={[styles.savedStackGoal, { color: colors.text.secondary }]}>{stack.goal}</Text>
                    <View style={styles.savedStackPeptides}>
                      {stack.peptides.slice(0, 4).map((p, j) => (
                        <View key={j} style={[styles.peptideChip, { backgroundColor: accent.primary + '20' }]}>
                          <Text style={[styles.peptideChipText, { color: accent.primary }]}>{p}</Text>
                        </View>
                      ))}
                      {stack.peptides.length > 4 && (
                        <View style={[styles.peptideChip, { backgroundColor: colors.background.elevated }]}>
                          <Text style={[styles.peptideChipText, { color: colors.text.muted }]}>+{stack.peptides.length - 4}</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}

              {/* Stack Details Modal */}
              <Modal
                visible={viewStackDetails !== null}
                animationType="slide"
                transparent
                onRequestClose={() => setViewStackDetails(null)}
              >
                <View style={styles.modalOverlay}>
                  <View style={[styles.modalContent, { backgroundColor: colors.background.primary }]}>
                    {viewStackDetails && (
                      <>
                        <View style={styles.modalHeader}>
                          <Text style={[styles.modalTitle, { color: colors.text.primary }]}>{viewStackDetails.name}</Text>
                          <TouchableOpacity onPress={() => setViewStackDetails(null)}>
                            <Ionicons name="close" size={24} color={colors.text.primary} />
                          </TouchableOpacity>
                        </View>
                        
                        <View style={[styles.savedStackBadge, { backgroundColor: viewStackDetails.created_by === 'ai' ? '#667eea20' : '#10B98120', marginBottom: 16 }]}>
                          {viewStackDetails.created_by === 'ai' ? (
                            <MaterialCommunityIcons name="robot" size={14} color="#667eea" />
                          ) : (
                            <Ionicons name="build" size={14} color="#10B981" />
                          )}
                          <Text style={[styles.savedStackBadgeText, { color: viewStackDetails.created_by === 'ai' ? '#667eea' : '#10B981' }]}>
                            {viewStackDetails.created_by === 'ai' ? 'AI Generated' : 'Manual'}
                          </Text>
                        </View>

                        <Text style={[styles.stackDetailLabel, { color: colors.text.secondary }]}>Goal / Purpose:</Text>
                        <Text style={[styles.stackDetailValue, { color: colors.text.primary }]}>{viewStackDetails.goal || 'No goal specified'}</Text>

                        <Text style={[styles.stackDetailLabel, { color: colors.text.secondary, marginTop: 20 }]}>Peptides in this stack:</Text>
                        <View style={styles.stackDetailPeptides}>
                          {viewStackDetails.peptides.map((p, j) => (
                            <View key={j} style={[styles.stackDetailPeptideCard, { backgroundColor: colors.background.card }]}>
                              <Ionicons name="flask" size={20} color={accent.primary} />
                              <Text style={[styles.stackDetailPeptideName, { color: colors.text.primary }]}>{p}</Text>
                            </View>
                          ))}
                        </View>

                        <TouchableOpacity 
                          style={styles.deleteStackFullBtn}
                          onPress={() => deleteStack(viewStackDetails.id, viewStackDetails.name)}
                        >
                          <Ionicons name="trash" size={18} color="#fff" />
                          <Text style={styles.deleteStackFullBtnText}>Delete Stack</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              </Modal>
            </View>
          )}

          {/* Protocols Tab */}
          {activeTab === 'protocols' && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Active Protocols</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.text.muted }]}>
                Swipe left to delete a protocol
              </Text>
              {protocols.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: colors.background.card }]}>
                  <Ionicons name="calendar" size={48} color={colors.text.muted} />
                  <Text style={[styles.emptyText, { color: colors.text.primary }]}>No active protocols</Text>
                  <Text style={[styles.emptySubtext, { color: colors.text.muted }]}>
                    Create a stack to automatically add protocols, or they'll be tracked from your injections
                  </Text>
                </View>
              ) : (
                protocols.map((protocol, i) => (
                  <Swipeable
                    key={protocol._id || i}
                    renderRightActions={() => (
                      <TouchableOpacity
                        style={styles.deleteAction}
                        onPress={() => deleteProtocol(protocol._id, protocol.protocol_name)}
                      >
                        <Ionicons name="trash" size={24} color="#fff" />
                        <Text style={styles.deleteActionText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                    overshootRight={false}
                  >
                    <View style={[styles.protocolCard, { backgroundColor: colors.background.card }]}>
                      <View style={styles.protocolHeader}>
                        <Text style={[styles.protocolName, { color: colors.text.primary }]}>{protocol.protocol_name}</Text>
                        <View style={[
                          styles.protocolStatus, 
                          { backgroundColor: protocol.active ? '#10B98120' : colors.background.elevated },
                          protocol.active && styles.protocolStatusActive
                        ]}>
                          <Text style={[
                            styles.protocolStatusText, 
                            { color: protocol.active ? '#10B981' : colors.text.muted }
                          ]}>
                            {protocol.active ? 'Active' : 'Inactive'}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.protocolPeptide, { color: accent.primary }]}>{protocol.peptide_name}</Text>
                      <View style={styles.protocolDetails}>
                        <View style={styles.protocolDetailRow}>
                          <Ionicons name="medical" size={14} color={colors.text.secondary} />
                          <Text style={[styles.protocolDetail, { color: colors.text.secondary }]}>
                            {protocol.dose_mcg} mcg
                          </Text>
                        </View>
                        <View style={styles.protocolDetailRow}>
                          <Ionicons name="repeat" size={14} color={colors.text.secondary} />
                          <Text style={[styles.protocolDetail, { color: colors.text.secondary }]}>
                            {protocol.frequency}
                          </Text>
                        </View>
                        {protocol.start_date && (
                          <View style={styles.protocolDetailRow}>
                            <Ionicons name="calendar-outline" size={14} color={colors.text.secondary} />
                            <Text style={[styles.protocolDetail, { color: colors.text.secondary }]}>
                              Started {new Date(protocol.start_date).toLocaleDateString()}
                            </Text>
                          </View>
                        )}
                      </View>
                      {protocol.notes && (
                        <Text style={[styles.protocolNotes, { color: colors.text.muted }]} numberOfLines={2}>
                          {protocol.notes}
                        </Text>
                      )}
                    </View>
                  </Swipeable>
                ))
              )}
            </View>
          )}

          {/* Progress Tab */}
          {activeTab === 'progress' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Progress Tracking</Text>
              <View style={styles.emptyState}>
                <Ionicons name="trending-up" size={48} color={Colors.text.muted} />
                <Text style={styles.emptyText}>Track your progress over time</Text>
                <Text style={styles.emptySubtext}>
                  Log weight, measurements, energy levels, and more
                </Text>
              </View>
              
              {stats?.by_peptide && stats.by_peptide.length > 0 && (
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Usage Summary</Text>
                  {stats.by_peptide.map((item: any, i: number) => (
                    <View key={i} style={styles.usageRow}>
                      <Text style={styles.usagePeptide}>{item.name}</Text>
                      <View style={styles.usageStats}>
                        <Text style={styles.usageCount}>{item.count} doses</Text>
                        <Text style={styles.usageTotal}>
                          {(item.total_dose_mcg / 1000).toFixed(1)} mg total
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* AI Assistant Tab */}
          {activeTab === 'ai' && (
            <View style={styles.aiTabContainer}>
              {/* Header */}
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.aiHeader}
              >
                <MaterialCommunityIcons name="robot" size={32} color="#fff" />
                <Text style={styles.aiHeaderTitle}>AI Research Assistant</Text>
                <Text style={styles.aiHeaderSubtitle}>
                  Ask questions anytime and get research-backed insights on peptides, stacks, safety, and recovery
                </Text>
                <View style={styles.aiFeatures}>
                  <View style={styles.aiFeatureItem}>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.aiFeatureText}>Always Learning</Text>
                  </View>
                  <View style={styles.aiFeatureItem}>
                    <Ionicons name="checkmark-circle" size={14} color="#fff" />
                    <Text style={styles.aiFeatureText}>Always Up to Date</Text>
                  </View>
                </View>
              </LinearGradient>

              {/* Conversation Selector */}
              <View style={styles.conversationBar}>
                <TouchableOpacity 
                  style={[styles.conversationButton, { backgroundColor: colors.background.card }]}
                  onPress={() => setShowConversationPicker(true)}
                >
                  <Ionicons name="chatbubbles-outline" size={18} color={colors.text.secondary} />
                  <Text style={[styles.conversationButtonText, { color: colors.text.secondary }]}>
                    {savedConversations.length > 0 ? `${savedConversations.length} saved` : 'History'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.newConversationBtn, { backgroundColor: '#667eea' }]}
                  onPress={startNewConversation}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.newConversationText}>New Chat</Text>
                </TouchableOpacity>
              </View>

              {/* Chat Messages - Scrollable */}
              <ScrollView 
                ref={chatScrollRef}
                style={styles.chatScrollArea}
                contentContainerStyle={styles.chatScrollContent}
                showsVerticalScrollIndicator={true}
                onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: true })}
              >
                {aiChatHistory.length === 0 ? (
                  <View style={styles.aiSuggestions}>
                    <Text style={[styles.aiSuggestionsTitle, { color: colors.text.secondary }]}>Common Questions</Text>
                    {[
                      "What are the benefits of BPC-157?",
                      "How should I dose Semaglutide?",
                      "What's a good recovery stack?",
                      "Tell me about peptide safety",
                    ].map((suggestion, i) => (
                      <TouchableOpacity 
                        key={i} 
                        style={[styles.aiSuggestion, { backgroundColor: colors.background.card }]}
                        onPress={() => { setAiQuestion(suggestion); }}
                      >
                        <Ionicons name="bulb-outline" size={18} color="#667eea" />
                        <Text style={[styles.aiSuggestionText, { color: colors.text.primary }]}>{suggestion}</Text>
                        <Ionicons name="chevron-forward" size={16} color={colors.text.muted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <>
                    {aiChatHistory.map((msg, i) => (
                      <View 
                        key={i} 
                        style={[
                          styles.chatMessage,
                          msg.role === 'user' ? styles.chatMessageUser : styles.chatMessageAssistant,
                          { backgroundColor: msg.role === 'user' ? accent.primary : colors.background.card }
                        ]}
                      >
                        {msg.role === 'assistant' && (
                          <View style={styles.chatMessageHeader}>
                            <MaterialCommunityIcons name="robot" size={16} color="#667eea" />
                            <Text style={[styles.chatMessageRole, { color: '#667eea' }]}>AI Assistant</Text>
                          </View>
                        )}
                        <Text style={[
                          styles.chatMessageText,
                          { color: msg.role === 'user' ? '#fff' : colors.text.primary }
                        ]}>
                          {msg.content}
                        </Text>
                      </View>
                    ))}
                    {aiLoading && (
                      <View style={[styles.chatMessage, styles.chatMessageAssistant, { backgroundColor: colors.background.card }]}>
                        <ActivityIndicator size="small" color="#667eea" />
                        <Text style={[styles.chatMessageText, { color: colors.text.muted, marginLeft: 8 }]}>Researching...</Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              {/* Fixed Input Bar at Bottom */}
              <View style={[styles.aiInputFixed, { backgroundColor: colors.background.primary, borderTopColor: colors.border.primary }]}>
                <View style={[styles.aiInputContainer, { backgroundColor: colors.background.card }]}>
                  <TextInput
                    style={[styles.aiInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                    value={aiQuestion}
                    onChangeText={setAiQuestion}
                    placeholder="Ask about peptides, dosing, stacking, safety..."
                    placeholderTextColor={colors.text.muted}
                    multiline
                    maxLength={500}
                  />
                  <TouchableOpacity 
                    style={[styles.aiSendButton, { backgroundColor: aiQuestion.trim() ? '#667eea' : colors.background.elevated }]}
                    onPress={askAI}
                    disabled={aiLoading || !aiQuestion.trim()}
                  >
                    {aiLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="send" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
                <Text style={[styles.aiDisclaimer, { color: colors.text.muted }]}>
                  For educational purposes only. Consult a healthcare provider.
                </Text>
              </View>
            </View>
          )}

          {/* Conversation Picker Modal */}
          <Modal
            visible={showConversationPicker}
            animationType="slide"
            transparent
            onRequestClose={() => setShowConversationPicker(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { backgroundColor: colors.background.primary }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Saved Conversations</Text>
                  <TouchableOpacity onPress={() => setShowConversationPicker(false)}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <View style={styles.conversationInfoBanner}>
                  <Ionicons name="time-outline" size={16} color="#667eea" />
                  <Text style={styles.conversationInfoText}>
                    Conversations auto-delete after 12 hours
                  </Text>
                </View>
                <ScrollView style={{ maxHeight: 400 }}>
                  {savedConversations.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Ionicons name="chatbubbles-outline" size={40} color={colors.text.muted} />
                      <Text style={[styles.emptyText, { color: colors.text.secondary }]}>No saved conversations</Text>
                      <Text style={[styles.emptySubtext, { color: colors.text.muted }]}>
                        Start a chat and it will be saved here for 12 hours
                      </Text>
                    </View>
                  ) : (
                    savedConversations.map((conv, i) => (
                      <View 
                        key={i}
                        style={[styles.conversationItem, { backgroundColor: colors.background.card }]}
                      >
                        <TouchableOpacity 
                          style={styles.conversationItemContent}
                          onPress={() => loadConversation(conv)}
                        >
                          <View style={styles.conversationItemIcon}>
                            <Ionicons name="chatbubble" size={20} color="#667eea" />
                          </View>
                          <View style={styles.conversationItemText}>
                            <Text style={[styles.conversationTitle, { color: colors.text.primary }]} numberOfLines={1}>
                              {conv.title}
                            </Text>
                            <Text style={[styles.conversationMeta, { color: colors.text.muted }]}>
                              {conv.message_count || conv.messages?.length || 0} messages
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.conversationDeleteBtn}
                          onPress={() => confirmDeleteConversation(conv)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Log Injection Modal */}
        <Modal
          visible={logModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setLogModalVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setLogModalVisible(false)}
          >
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={(e) => e.stopPropagation()}
              style={[styles.modalContent, { backgroundColor: colors.background.card }]}
            >
              <View style={[styles.modalHeader, { borderBottomColor: colors.border.primary }]}>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Log Injection</Text>
                <TouchableOpacity onPress={() => setLogModalVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                <TouchableOpacity 
                  style={[styles.selectButton, { backgroundColor: colors.background.input }]}
                  onPress={() => {
                    setLogModalVisible(false);
                    setTimeout(() => {
                      openPeptideSelector((id) => {
                        setLogPeptide(id);
                        const p = peptideDatabase[id];
                        if (p && p.common_doses.length > 0) {
                          setLogDose(p.common_doses[0].toString());
                        }
                        setLogModalVisible(true);
                      });
                    }, 300);
                  }}
                >
                  <Text style={[styles.selectButtonText, { color: logPeptide ? colors.text.primary : colors.text.secondary }]}>
                    {logPeptide ? peptideDatabase[logPeptide]?.name : 'Select Peptide *'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color={colors.text.secondary} />
                </TouchableOpacity>

                <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Dose (mcg) *</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                  value={logDose}
                  onChangeText={setLogDose}
                  keyboardType="decimal-pad"
                  placeholder="250"
                  placeholderTextColor={colors.text.muted}
                />

                <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Injection Site *</Text>
                <View style={styles.siteOptions}>
                  {siteRotation.slice(0, 6).map(site => (
                    <TouchableOpacity
                      key={site.id}
                      style={[
                        styles.siteOption,
                        { backgroundColor: colors.background.input },
                        logSite === site.id && [styles.siteOptionSelected, { backgroundColor: accent.primary }]
                      ]}
                      onPress={() => setLogSite(site.id)}
                    >
                      <Text style={[
                        styles.siteOptionText,
                        { color: colors.text.primary },
                        logSite === site.id && styles.siteOptionTextSelected
                      ]}>
                        {site.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Notes</Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                  value={logNotes}
                  onChangeText={setLogNotes}
                  placeholder="Any notes..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                />

                <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Side Effects</Text>
                <TextInput
                  style={[styles.modalInput, styles.textArea, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                  value={logSideEffects}
                  onChangeText={setLogSideEffects}
                  placeholder="Any side effects..."
                  placeholderTextColor={colors.text.muted}
                  multiline
                />
              </ScrollView>

              <TouchableOpacity style={[styles.modalButton, { backgroundColor: accent.primary }]} onPress={logInjection}>
                <Text style={styles.modalButtonText}>Log Injection</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Peptide Selector Modal */}
        <Modal
          visible={selectorVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectorVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setSelectorVisible(false)}
          >
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={(e) => e.stopPropagation()}
              style={[styles.modalContent, { maxHeight: '80%', backgroundColor: colors.background.card }]}
            >
              <View style={[styles.modalHeader, { borderBottomColor: colors.border.primary }]}>
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Select Peptide</Text>
                <TouchableOpacity onPress={() => setSelectorVisible(false)}>
                  <Ionicons name="close" size={24} color={colors.text.primary} />
                </TouchableOpacity>
              </View>

              <ScrollView>
                {Object.entries(categories).map(([catId, catName]) => {
                  const peptides = Object.entries(peptideDatabase).filter(([_, p]) => p.category === catId);
                  if (peptides.length === 0) return null;
                  
                  return (
                    <View key={catId}>
                      <Text style={[styles.selectorCategory, { color: getCategoryColor(catId) }]}>
                        {catName}
                      </Text>
                      {peptides.map(([id, peptide]) => (
                        <TouchableOpacity
                          key={id}
                          style={[styles.selectorItem, { backgroundColor: colors.background.input }]}
                          onPress={() => selectPeptide(id)}
                        >
                          <Text style={[styles.selectorItemText, { color: colors.text.primary }]}>{peptide.name}</Text>
                          <Text style={[styles.selectorItemDose, { color: accent.primary }]}>
                            {peptide.common_doses[0]} {peptide.dose_unit}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Peptide Info Modal */}
        <Modal
          visible={infoModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setInfoModalVisible(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setInfoModalVisible(false)}
          >
            <TouchableOpacity 
              activeOpacity={1} 
              onPress={(e) => e.stopPropagation()}
              style={[styles.infoModalContent, { backgroundColor: colors.background.card }]}
            >
              {selectedPeptideInfo && (
                <>
                  <Text style={[styles.infoTitle, { color: colors.text.primary }]}>{selectedPeptideInfo.name}</Text>
                  <Text style={[styles.infoDescription, { color: colors.text.secondary }]}>{selectedPeptideInfo.description}</Text>
                  
                  <View style={styles.infoSection}>
                    <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Common Doses</Text>
                    <Text style={[styles.infoValue, { color: colors.text.primary }]}>
                      {selectedPeptideInfo.common_doses.join(', ')} {selectedPeptideInfo.dose_unit}
                    </Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Frequency</Text>
                    <Text style={[styles.infoValue, { color: colors.text.primary }]}>{selectedPeptideInfo.frequency}</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Duration</Text>
                    <Text style={[styles.infoValue, { color: colors.text.primary }]}>{selectedPeptideInfo.typical_duration}</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>Half-Life</Text>
                    <Text style={[styles.infoValue, { color: colors.text.primary }]}>{selectedPeptideInfo.half_life}</Text>
                  </View>
                  
                  <View style={styles.infoSection}>
                    <Text style={styles.infoLabel}>Common Uses</Text>
                    <View style={styles.usesTags}>
                      {selectedPeptideInfo.common_uses.map((use, i) => (
                        <View key={i} style={styles.useTag}>
                          <Text style={styles.useTagText}>{use}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  
                  <View style={styles.infoNote}>
                    <Ionicons name="information-circle" size={16} color={Colors.text.secondary} />
                    <Text style={styles.infoNoteText}>{selectedPeptideInfo.notes}</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Stack Creation Modal */}
        <Modal
          visible={showStackModal}
          animationType="slide"
          transparent
          onRequestClose={() => { setShowStackModal(false); setStackCreationMode(null); }}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { setShowStackModal(false); setStackCreationMode(null); }}
          >
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%' }}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
              <TouchableOpacity 
                activeOpacity={1} 
                onPress={(e) => e.stopPropagation()}
                style={[styles.modalContent, { backgroundColor: colors.background.primary, minHeight: 450, maxHeight: '85%' }]}
              >
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                    {stackCreationMode === 'ai' ? 'AI-Powered Stack Builder' : 'Manual Stack Builder'}
                  </Text>
                  <TouchableOpacity onPress={() => { setShowStackModal(false); setStackCreationMode(null); }}>
                    <Ionicons name="close" size={24} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  style={{ flex: 1 }} 
                  showsVerticalScrollIndicator={true} 
                  contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {stackCreationMode === 'ai' && (
                    // AI Stack Builder
                    <View style={styles.stackModalContent}>
                      <LinearGradient
                        colors={['#667eea', '#764ba2']}
                        style={styles.stackAiHeader}
                      >
                        <MaterialCommunityIcons name="robot" size={40} color="#fff" />
                        <Text style={styles.stackAiTitle}>Let AI Build Your Stack</Text>
                        <Text style={styles.stackAiSubtitle}>Describe your goals and we'll recommend the perfect combination</Text>
                      </LinearGradient>

                      <View style={styles.stackInputGroup}>
                        <Text style={[styles.stackInputLabel, { color: colors.text.primary }]}>What's your goal?</Text>
                        <TextInput
                          style={[styles.stackGoalInput, { backgroundColor: colors.background.card, color: colors.text.primary, minHeight: 100 }]}
                          value={newStackGoal}
                          onChangeText={setNewStackGoal}
                          placeholder="e.g., Muscle recovery after injury, weight loss, anti-aging..."
                          placeholderTextColor={colors.text.muted}
                          multiline
                          numberOfLines={4}
                          textAlignVertical="top"
                        />
                      </View>

                      <TouchableOpacity
                        style={[styles.stackGenerateBtn, { opacity: newStackGoal.trim() ? 1 : 0.5 }]}
                        disabled={aiStackLoading || !newStackGoal.trim()}
                        onPress={async () => {
                          if (!newStackGoal.trim()) return;
                          setAiStackLoading(true);
                          try {
                            const response = await axios.post(`${API_URL}/api/peptides/stacks/ai-generate`, {
                              user_id: userId,
                              goal: newStackGoal
                            });
                            if (response.data.success && response.data.stack) {
                              const stack = response.data.stack;
                              // Save the stack
                              await axios.post(`${API_URL}/api/peptides/stacks/save`, {
                                user_id: userId,
                                name: stack.name,
                                peptides: stack.peptides,
                                goal: newStackGoal,
                                created_by: 'ai'
                              });
                              
                              // Create protocols for each peptide in the stack
                              const today = new Date().toISOString().split('T')[0];
                              for (const peptideName of stack.peptides) {
                                try {
                                  const peptideInfo = peptideDatabase[peptideName];
                                  await axios.post(`${API_URL}/api/peptides/protocol`, {
                                    user_id: userId,
                                    protocol_name: `${stack.name} - ${peptideName}`,
                                    peptide_id: peptideName,
                                    peptide_name: peptideInfo?.name || peptideName,
                                    dose_mcg: peptideInfo?.common_doses?.[0] || 250,
                                    frequency: peptideInfo?.frequency || 'daily',
                                    start_date: today,
                                    notes: `Part of ${stack.name} stack. Goal: ${newStackGoal}`,
                                    active: true
                                  });
                                } catch (protocolError) {
                                  console.log('Protocol creation error:', protocolError);
                                }
                              }
                              
                              // Refresh stacks and protocols
                              const [stacksRes, protocolsRes] = await Promise.all([
                                axios.get(`${API_URL}/api/peptides/stacks/${userId}`),
                                axios.get(`${API_URL}/api/peptides/protocols/${userId}`)
                              ]);
                              setStacks(stacksRes.data.stacks || []);
                              setProtocols(protocolsRes.data.protocols || []);
                              
                              Alert.alert('Stack Created!', `${stack.name}\n\nPeptides: ${stack.peptides.join(', ')}\n\nProtocols have been added to your Protocols tab.`);
                              setShowStackModal(false);
                              setStackCreationMode(null);
                              setNewStackGoal('');
                            } else {
                              Alert.alert('Error', 'Could not generate stack. Please try again.');
                            }
                          } catch (error) {
                            console.error('Error generating stack:', error);
                            Alert.alert('Error', 'Failed to generate stack');
                          } finally {
                            setAiStackLoading(false);
                          }
                        }}
                      >
                        {aiStackLoading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <MaterialCommunityIcons name="magic-staff" size={20} color="#fff" />
                            <Text style={styles.stackGenerateBtnText}>Generate Stack</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                
                {stackCreationMode === 'manual' && (
                  // Manual Stack Builder
                  <View style={styles.stackModalContent}>
                    <View style={styles.stackInputGroup}>
                      <Text style={[styles.stackInputLabel, { color: colors.text.primary }]}>Stack Name</Text>
                      <TextInput
                        style={[styles.stackNameInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
                        value={newStackName}
                        onChangeText={setNewStackName}
                        placeholder="My Recovery Stack"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>

                    <View style={styles.stackInputGroup}>
                      <Text style={[styles.stackInputLabel, { color: colors.text.primary }]}>Goal / Purpose</Text>
                      <TextInput
                        style={[styles.stackGoalInput, { backgroundColor: colors.background.card, color: colors.text.primary }]}
                        value={newStackGoal}
                        onChangeText={setNewStackGoal}
                        placeholder="What is this stack for?"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>

                    <View style={styles.stackInputGroup}>
                      <Text style={[styles.stackInputLabel, { color: colors.text.primary }]}>Select Peptides</Text>
                      <View style={styles.peptideSelectionGrid}>
                        {Object.entries(peptideDatabase).map(([peptideName, peptide]) => {
                          const isSelected = selectedStackPeptides.includes(peptideName);
                          return (
                            <TouchableOpacity
                              key={peptideName}
                              style={[
                                styles.peptideSelectCard,
                                { backgroundColor: colors.background.card },
                                isSelected && { borderColor: accent.primary, borderWidth: 2 }
                              ]}
                              onPress={() => {
                                if (isSelected) {
                                  setSelectedStackPeptides(prev => prev.filter(p => p !== peptideName));
                                } else {
                                  setSelectedStackPeptides(prev => [...prev, peptideName]);
                                }
                              }}
                            >
                              {isSelected && (
                                <View style={[styles.peptideSelectCheck, { backgroundColor: accent.primary }]}>
                                  <Ionicons name="checkmark" size={12} color="#fff" />
                                </View>
                              )}
                              <Text style={[styles.peptideSelectName, { color: colors.text.primary }]}>{peptideName}</Text>
                              <Text style={[styles.peptideSelectCategory, { color: colors.text.muted }]}>{peptide.category}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[styles.stackSaveBtn, { backgroundColor: accent.primary, opacity: (newStackName.trim() && selectedStackPeptides.length > 0) ? 1 : 0.5 }]}
                      disabled={!newStackName.trim() || selectedStackPeptides.length === 0}
                      onPress={async () => {
                        try {
                          await axios.post(`${API_URL}/api/peptides/stacks/save`, {
                            user_id: userId,
                            name: newStackName,
                            peptides: selectedStackPeptides,
                            goal: newStackGoal,
                            created_by: 'manual'
                          });
                          
                          // Create protocols for each peptide in the stack
                          const today = new Date().toISOString().split('T')[0];
                          for (const peptideName of selectedStackPeptides) {
                            try {
                              const peptideInfo = peptideDatabase[peptideName];
                              await axios.post(`${API_URL}/api/peptides/protocol`, {
                                user_id: userId,
                                protocol_name: `${newStackName} - ${peptideName}`,
                                peptide_id: peptideName,
                                peptide_name: peptideInfo?.name || peptideName,
                                dose_mcg: peptideInfo?.common_doses?.[0] || 250,
                                frequency: peptideInfo?.frequency || 'daily',
                                start_date: today,
                                notes: `Part of ${newStackName} stack. Goal: ${newStackGoal}`,
                                active: true
                              });
                            } catch (protocolError) {
                              console.log('Protocol creation error:', protocolError);
                            }
                          }
                          
                          // Refresh stacks and protocols
                          const [stacksRes, protocolsRes] = await Promise.all([
                            axios.get(`${API_URL}/api/peptides/stacks/${userId}`),
                            axios.get(`${API_URL}/api/peptides/protocols/${userId}`)
                          ]);
                          setStacks(stacksRes.data.stacks || []);
                          setProtocols(protocolsRes.data.protocols || []);
                          
                          Alert.alert('Stack Saved!', `${newStackName} has been created.\n\nProtocols have been added to your Protocols tab.`);
                          setShowStackModal(false);
                          setStackCreationMode(null);
                          setNewStackName('');
                          setNewStackGoal('');
                          setSelectedStackPeptides([]);
                        } catch (error) {
                          Alert.alert('Error', 'Failed to save stack');
                        }
                      }}
                    >
                      <Ionicons name="save" size={20} color="#fff" />
                      <Text style={styles.stackSaveBtnText}>Save Stack ({selectedStackPeptides.length} peptides)</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </GestureHandlerRootView>
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
  // Ask FitTrax Peptide AI Button Styles
  askAiButton: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  askAiImageBg: {
    width: '100%',
    height: 90,
    justifyContent: 'center',
  },
  askAiImageBgStyle: {
    borderRadius: 16,
  },
  askAiOverlay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  askAiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  askAiTextContainer: {
    flex: 1,
  },
  askAiTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  askAiSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.95)',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  addButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  tabsScroll: {
    flexGrow: 0,
    marginBottom: 8,
  },
  tabsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 25,
    backgroundColor: '#F3F4F6',
    gap: 8,
    minHeight: 44,
  },
  tabActive: {
    backgroundColor: Colors.brand.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    letterSpacing: 0.3,
  },
  tabTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  selectButtonText: {
    fontSize: 15,
    color: Colors.text.secondary,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 6,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingRight: 12,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: Colors.text.primary,
  },
  inputUnit: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
  },
  calculateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 8,
  },
  calculateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  resultCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  resultMain: {
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  resultValue: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  resultSubtext: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
  },
  resultDetails: {
    gap: 8,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  resultDetailLabel: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  resultDetailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 12,
  },
  categorySection: {
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  peptideChips: {
    flexDirection: 'row',
    gap: 8,
  },
  peptideChip: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  peptideChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 13,
    color: '#B45309',
  },
  alertMore: {
    fontSize: 12,
    color: '#D97706',
    marginTop: 4,
  },
  recommendedSite: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 12,
  },
  recommendedSiteValue: {
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  siteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  siteCard: {
    width: (width - 64) / 2 - 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  siteCardRecommended: {
    backgroundColor: '#DBEAFE',
    borderWidth: 2,
    borderColor: Colors.brand.primary,
  },
  siteName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
    textAlign: 'center',
  },
  siteCount: {
    fontSize: 11,
    color: Colors.text.secondary,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: Colors.background.card,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
  emptyButton: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  injectionCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  injectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  injectionPeptide: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  injectionDose: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  injectionDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  injectionDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  injectionDetailText: {
    fontSize: 13,
    color: Colors.text.secondary,
  },
  injectionNotes: {
    fontSize: 13,
    color: Colors.text.secondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  protocolCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  protocolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  protocolName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text.primary,
    flex: 1,
    marginRight: 8,
  },
  protocolStatus: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  protocolStatusActive: {
    backgroundColor: '#D1FAE5',
  },
  protocolStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
  },
  protocolPeptide: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginBottom: 8,
  },
  protocolDetails: {
    marginTop: 8,
    gap: 6,
  },
  protocolDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  protocolDetail: {
    fontSize: 13,
    color: Colors.text.muted,
  },
  protocolNotes: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  usagePeptide: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  usageStats: {
    alignItems: 'flex-end',
  },
  usageCount: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand.primary,
  },
  usageTotal: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  aiHeader: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  aiHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 12,
  },
  aiHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
  aiInputContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
  },
  aiInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: Colors.text.primary,
    maxHeight: 100,
  },
  aiSendButton: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
  },
  aiResponseCard: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  aiResponseText: {
    fontSize: 15,
    color: Colors.text.primary,
    lineHeight: 22,
  },
  aiDisclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 6,
  },
  aiDisclaimerText: {
    fontSize: 12,
    color: Colors.text.muted,
    flex: 1,
  },
  aiSuggestions: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 16,
  },
  aiSuggestionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.secondary,
    marginBottom: 12,
  },
  aiSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  aiSuggestionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text.primary,
  },
  // AI Chat enhanced styles
  aiFeatures: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 16,
  },
  aiFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  aiFeatureText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  chatHistoryContainer: {
    marginBottom: 16,
  },
  chatHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  chatHistoryTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  chatHistory: {
    maxHeight: 300,
  },
  chatMessage: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    maxWidth: '85%',
  },
  chatMessageUser: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  chatMessageAssistant: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  chatMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    width: '100%',
  },
  chatMessageRole: {
    fontSize: 11,
    fontWeight: '600',
  },
  chatMessageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  // Stack builder styles
  createStackCard: {
    borderRadius: 16,
    padding: 20,
  },
  createStackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  createStackText: {
    marginLeft: 12,
  },
  createStackTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  createStackSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  stackOptions: {
    gap: 12,
  },
  stackOptionCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  stackOptionGradient: {
    padding: 16,
    alignItems: 'center',
  },
  stackOptionManual: {
    padding: 16,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  stackOptionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginTop: 8,
  },
  stackOptionDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: 4,
  },
  savedStackCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  savedStackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savedStackInfo: {
    flex: 1,
  },
  savedStackName: {
    fontSize: 16,
    fontWeight: '700',
  },
  savedStackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  savedStackBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  savedStackGoal: {
    fontSize: 14,
    marginTop: 8,
  },
  savedStackPeptides: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  peptideChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  peptideChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  modalScroll: {
    maxHeight: 400,
  },
  modalInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 16,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  siteOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  siteOption: {
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  siteOptionSelected: {
    backgroundColor: Colors.brand.primary,
  },
  siteOptionText: {
    fontSize: 13,
    color: Colors.text.primary,
  },
  siteOptionTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  modalButton: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  selectorCategory: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  selectorItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  selectorItemText: {
    fontSize: 16,
    color: Colors.text.primary,
  },
  selectorItemDose: {
    fontSize: 14,
    color: Colors.text.secondary,
  },
  infoModalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    margin: 20,
    maxHeight: '80%',
  },
  infoTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 8,
  },
  infoDescription: {
    fontSize: 15,
    color: Colors.text.secondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  infoSection: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.muted,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: Colors.text.primary,
  },
  usesTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  useTag: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  useTagText: {
    fontSize: 13,
    color: Colors.brand.primary,
  },
  infoNote: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    gap: 8,
  },
  infoNoteText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text.secondary,
    lineHeight: 18,
  },
  deleteAction: {
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    marginBottom: 12,
    borderRadius: 12,
    marginLeft: 8,
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  swipeHint: {
    fontSize: 11,
    color: Colors.text.muted,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'right',
  },
  // AI Tab Container - for fixed bottom input
  aiTabContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  // Conversation Bar
  conversationBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
    gap: 12,
  },
  conversationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
  },
  conversationButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  newConversationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  newConversationText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Chat scroll area
  chatScrollArea: {
    flex: 1,
    minHeight: 200,
  },
  chatScrollContent: {
    paddingBottom: 16,
  },
  // Fixed input at bottom
  aiInputFixed: {
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: 1,
  },
  // Conversation picker
  conversationInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  conversationInfoText: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '500',
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  conversationItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(102, 126, 234, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  conversationItemText: {
    flex: 1,
  },
  conversationTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  conversationMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  conversationDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  emptySubtext: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  // Stack modal styles
  stackModalContent: {
    padding: 16,
  },
  stackAiHeader: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
  },
  stackAiTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 12,
  },
  stackAiSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginTop: 4,
  },
  stackInputGroup: {
    marginBottom: 20,
  },
  stackInputLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  stackNameInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  stackGoalInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  stackGenerateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  stackGenerateBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  stackSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 20,
  },
  stackSaveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  peptideSelectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  peptideSelectCard: {
    width: '47%',
    padding: 12,
    borderRadius: 12,
    position: 'relative',
  },
  peptideSelectCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  peptideSelectName: {
    fontSize: 14,
    fontWeight: '600',
  },
  peptideSelectCategory: {
    fontSize: 11,
    marginTop: 2,
  },
  // Stack delete and details styles
  savedStackActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deleteStackBtn: {
    padding: 6,
  },
  stackDetailLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  stackDetailValue: {
    fontSize: 15,
    lineHeight: 22,
  },
  stackDetailPeptides: {
    marginTop: 12,
    gap: 8,
  },
  stackDetailPeptideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  stackDetailPeptideName: {
    fontSize: 15,
    fontWeight: '600',
  },
  deleteStackFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
  },
  deleteStackFullBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

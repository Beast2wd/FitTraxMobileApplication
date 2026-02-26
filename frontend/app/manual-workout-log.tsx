import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useUserStore } from '../stores/userStore';
import { useThemeStore } from '../stores/themeStore';
import { SwipeableRow } from '../components/SwipeableRow';
import axios from 'axios';
import { format, addDays, startOfWeek } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8001';

// Days of the week for columns (1-7)
const DAYS = ['1', '2', '3', '4', '5', '6', '7'];

// Days of week for scheduling
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface WorkoutTemplate {
  template_id: string;
  name: string;
  exercises: any[];
  source: string;
  created_at: string;
  times_used: number;
}

interface WorkoutEntry {
  entry_id: string;
  user_id: string;
  exercise_name: string;
  reps: { [key: string]: string };
  weight: { [key: string]: string };
  notes: string;
  created_at: string;
  updated_at: string;
  synced_to_calendar?: boolean;
}

export default function ManualWorkoutLogScreen() {
  const { userId } = useUserStore();
  const { theme } = useThemeStore();
  const colors = theme.colors;
  const accent = theme.accentColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [editingEntry, setEditingEntry] = useState<WorkoutEntry | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  // Form state - simplified to single reps/weight row across 7 days
  const [exerciseName, setExerciseName] = useState('');
  const [reps, setReps] = useState<{ [key: string]: string }>({});
  const [weight, setWeight] = useState<{ [key: string]: string }>({});
  const [notes, setNotes] = useState('');

  // Template & Scheduling state
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showLoadTemplateModal, setShowLoadTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [selectedColor, setSelectedColor] = useState('blue');
  const [selectedTemplateForSchedule, setSelectedTemplateForSchedule] = useState<WorkoutTemplate | null>(null);

  // Available colors for templates
  const WORKOUT_COLORS = [
    { id: 'blue', name: 'Blue', hex: '#3B82F6' },
    { id: 'purple', name: 'Purple', hex: '#8B5CF6' },
    { id: 'pink', name: 'Pink', hex: '#EC4899' },
    { id: 'red', name: 'Red', hex: '#EF4444' },
    { id: 'orange', name: 'Orange', hex: '#F59E0B' },
    { id: 'green', name: 'Green', hex: '#22C55E' },
    { id: 'teal', name: 'Teal', hex: '#14B8A6' },
    { id: 'indigo', name: 'Indigo', hex: '#6366F1' },
  ];

  const toggleExpand = (entryId: string) => {
    setExpandedEntryId(expandedEntryId === entryId ? null : entryId);
  };

  const loadEntries = useCallback(async () => {
    if (!userId) return;
    try {
      const [entriesRes, templatesRes] = await Promise.all([
        axios.get(`${API_URL}/api/manual-workout-log/${userId}`),
        axios.get(`${API_URL}/api/workout-templates/${userId}`),
      ]);
      setEntries(entriesRes.data.entries || []);
      setTemplates(templatesRes.data.templates || []);
    } catch (error) {
      console.error('Error loading workout log entries:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  };

  // Save current workout as template
  const saveAsTemplate = async () => {
    if (entries.length === 0) {
      Alert.alert('No Exercises', 'Add some exercises before saving as a template.');
      return;
    }
    if (!templateName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for your workout template.');
      return;
    }

    try {
      const templateData = {
        user_id: userId,
        name: templateName.trim(),
        exercises: entries.map(e => ({
          name: e.exercise_name,
          reps: e.reps,
          weight: e.weight,
          notes: e.notes,
        })),
        source: 'manual',
        color: selectedColor,
      };

      await axios.post(`${API_URL}/api/workout-templates`, templateData);
      
      Alert.alert('Template Saved!', `"${templateName}" has been saved. You can now schedule it on any day.`);
      setShowTemplateModal(false);
      setTemplateName('');
      setSelectedColor('blue');
      loadEntries();
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Error', 'Failed to save workout template.');
    }
  };

  // Schedule the current workout on selected days
  const scheduleWorkout = async () => {
    const templateToSchedule = selectedTemplateForSchedule || (templates.length > 0 ? templates[0] : null);
    
    if (!templateToSchedule) {
      Alert.alert('No Templates', 'Save your workout as a template first, then schedule it.');
      return;
    }
    if (selectedDays.length === 0) {
      Alert.alert('Select Days', 'Please select at least one day to schedule.');
      return;
    }
    
    try {
      const scheduleData = {
        user_id: userId,
        template_id: templateToSchedule.template_id,
        scheduled_days: selectedDays,
        time: scheduleTime,
      };

      await axios.post(`${API_URL}/api/workout-templates/schedule`, scheduleData);
      
      Alert.alert(
        'Workout Scheduled!',
        `"${templateToSchedule.name}" has been scheduled for ${selectedDays.length} day(s). Check your Calendar to see scheduled workouts.`,
        [
          { text: 'View Calendar', onPress: () => router.push('/schedule') },
          { text: 'OK', style: 'cancel' },
        ]
      );
      setShowScheduleModal(false);
      setSelectedDays([]);
      setSelectedTemplateForSchedule(null);
    } catch (error) {
      console.error('Error scheduling workout:', error);
      Alert.alert('Error', 'Failed to schedule workout.');
    }
  };

  // Open schedule modal for a specific template
  const openScheduleForTemplate = (template: WorkoutTemplate) => {
    setSelectedTemplateForSchedule(template);
    setShowScheduleModal(true);
  };

  // Load a template into the workout log
  const loadTemplate = async (template: WorkoutTemplate) => {
    try {
      await axios.post(`${API_URL}/api/workout-templates/load/${template.template_id}?user_id=${userId}`);
      
      Alert.alert('Template Loaded!', `"${template.name}" exercises have been added to your workout log.`);
      setShowLoadTemplateModal(false);
      loadEntries();
    } catch (error) {
      console.error('Error loading template:', error);
      Alert.alert('Error', 'Failed to load template.');
    }
  };

  // Delete a template
  const deleteTemplate = async (templateId: string) => {
    Alert.alert(
      'Delete Template',
      'Are you sure you want to delete this workout template?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/workout-templates/${templateId}`);
              loadEntries();
            } catch (error) {
              console.error('Error deleting template:', error);
              Alert.alert('Error', 'Failed to delete template.');
            }
          },
        },
      ]
    );
  };

  // Toggle day selection for scheduling
  const toggleDaySelection = (date: string) => {
    setSelectedDays(prev => 
      prev.includes(date) 
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  };

  // Get next 14 days for scheduling
  const getNextTwoWeeks = () => {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = addDays(today, i);
      days.push({
        date: format(date, 'yyyy-MM-dd'),
        label: format(date, 'EEE, MMM d'),
        isToday: i === 0,
      });
    }
    return days;
  };

  const resetForm = () => {
    setExerciseName('');
    setReps({});
    setWeight({});
    setNotes('');
    setEditingEntry(null);
    setIsEditing(false);
  };

  const saveEntry = async () => {
    if (!exerciseName.trim()) {
      Alert.alert('Error', 'Please enter an exercise name');
      return;
    }

    try {
      const entryData = {
        user_id: userId,
        exercise_name: exerciseName,
        reps: reps,
        weight: weight,
        notes: notes,
      };

      const savedExerciseName = exerciseName;

      if (editingEntry) {
        await axios.put(`${API_URL}/api/manual-workout-log/${editingEntry.entry_id}`, entryData);
        Alert.alert('Updated!', `${savedExerciseName} has been updated.`);
      } else {
        await axios.post(`${API_URL}/api/manual-workout-log`, entryData);
        Alert.alert(
          'Saved!', 
          `${savedExerciseName} added. Ready for next exercise.`,
          [{ text: 'OK' }],
          { cancelable: true }
        );
      }

      resetForm();
      loadEntries();
    } catch (error) {
      console.error('Error saving workout entry:', error);
      Alert.alert('Error', 'Failed to save workout entry');
    }
  };

  const editEntry = (entry: WorkoutEntry) => {
    setEditingEntry(entry);
    setExerciseName(entry.exercise_name);
    setReps(entry.reps || {});
    setWeight(entry.weight || {});
    setNotes(entry.notes || '');
    setIsEditing(true);
  };

  const deleteEntry = async (entryId: string) => {
    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this workout entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${API_URL}/api/manual-workout-log/${entryId}`);
              setEntries(entries.filter(e => e.entry_id !== entryId));
            } catch (error) {
              console.error('Error deleting entry:', error);
              Alert.alert('Error', 'Failed to delete entry');
            }
          },
        },
      ]
    );
  };

  const deleteAllEntries = async () => {
    if (entries.length === 0) {
      Alert.alert('No Entries', 'There are no workout entries to delete.');
      return;
    }

    Alert.alert(
      'Delete All Entries',
      `Are you sure you want to delete all ${entries.length} workout entries? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              // Use bulk delete endpoint
              const today = getLocalDate();
              await axios.delete(`${API_URL}/api/manual-workout-log/all/${userId}`, {
                params: { date: today }
              });
              setEntries([]);
              setExpandedEntryId(null);
              Alert.alert('Deleted', 'All workout entries have been removed.');
            } catch (error) {
              console.error('Error deleting all entries:', error);
              Alert.alert('Error', 'Failed to delete entries. Please try again.');
              loadEntries(); // Reload to get current state
            }
          },
        },
      ]
    );
  };

  // Get local date in YYYY-MM-DD format
  const getLocalDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const completeWorkout = async () => {
    if (entries.length === 0) {
      Alert.alert('No Entries', 'Add some exercises before completing your workout.');
      return;
    }

    const todayLocal = getLocalDate();
    const todayDisplay = format(new Date(), 'MMMM d, yyyy');

    Alert.alert(
      'Complete Workout',
      `This will sync all workout entries to your calendar for ${todayDisplay}. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              // Sync workout to calendar using LOCAL date
              const workoutSummary = {
                user_id: userId,
                workout_date: todayLocal,
                exercises: entries.map(e => ({
                  name: e.exercise_name,
                  reps: e.reps,
                  weight: e.weight,
                  notes: e.notes
                })),
                completed_at: new Date().toISOString(),
              };

              await axios.post(`${API_URL}/api/manual-workout-log/complete`, workoutSummary);
              
              Alert.alert(
                'Workout Complete! 💪',
                `Great job! ${entries.length} exercises have been synced to your calendar for ${todayDisplay}.`,
                [{ text: 'OK' }]
              );
              
              // Reload entries to show synced status
              loadEntries();
            } catch (error) {
              console.error('Error completing workout:', error);
              Alert.alert('Error', 'Failed to sync workout to calendar');
            }
          },
        },
      ]
    );
  };

  // Get summary of an entry for display
  const getEntrySummary = (entry: WorkoutEntry) => {
    const filledDays = Object.keys(entry.reps || {}).filter(d => entry.reps[d]);
    const maxWeight = Math.max(...Object.values(entry.weight || {}).map(w => parseFloat(w) || 0));
    return {
      days: filledDays.length,
      maxWeight: maxWeight > 0 ? maxWeight : null
    };
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent.primary} />
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
          <View style={[styles.header, { borderBottomColor: colors.border.primary }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>
              {isEditing ? 'Edit Workout' : 'Manual Workout Log'}
            </Text>
            {isEditing ? (
              <TouchableOpacity onPress={resetForm}>
                <Text style={[styles.cancelText, { color: accent.primary }]}>Cancel</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 50 }} />
            )}
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {/* Workout Entry Form */}
            <View style={[styles.card, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text.primary }]}>
                {isEditing ? 'Edit Exercise' : 'Add Exercise'}
              </Text>

              {/* Exercise Name */}
              <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Exercise Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                value={exerciseName}
                onChangeText={setExerciseName}
                placeholder="e.g., Bench Press"
                placeholderTextColor={colors.text.muted}
              />

              {/* Reps/Weight Table - Single Row */}
              <View style={styles.tableContainer}>
                <Text style={[styles.tableTitle, { color: colors.text.secondary }]}>
                  Reps & Weight (7-Day Tracker)
                </Text>

                {/* Table Header */}
                <View style={styles.tableHeader}>
                  <View style={styles.labelColumn}>
                    <Text style={[styles.headerCell, { color: colors.text.secondary }]}></Text>
                  </View>
                  {DAYS.map(day => (
                    <View key={day} style={styles.dayColumn}>
                      <Text style={[styles.headerCell, { color: colors.text.secondary }]}>Day {day}</Text>
                    </View>
                  ))}
                </View>

                {/* Reps Row */}
                <View style={[styles.tableRow, { backgroundColor: colors.background.input }]}>
                  <View style={styles.labelColumn}>
                    <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Reps</Text>
                  </View>
                  {DAYS.map(day => (
                    <View key={day} style={styles.dayColumn}>
                      <TextInput
                        style={[styles.cellInput, { color: colors.text.primary, borderColor: colors.border.primary }]}
                        value={reps[day] || ''}
                        onChangeText={(val) => setReps({ ...reps, [day]: val })}
                        keyboardType="number-pad"
                        placeholder="-"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                  ))}
                </View>

                {/* Weight Row */}
                <View style={[styles.tableRow, { backgroundColor: 'transparent' }]}>
                  <View style={styles.labelColumn}>
                    <Text style={[styles.rowLabel, { color: colors.text.primary }]}>Weight</Text>
                  </View>
                  {DAYS.map(day => (
                    <View key={day} style={styles.dayColumn}>
                      <TextInput
                        style={[styles.cellInput, { color: colors.text.primary, borderColor: colors.border.primary }]}
                        value={weight[day] || ''}
                        onChangeText={(val) => setWeight({ ...weight, [day]: val })}
                        keyboardType="number-pad"
                        placeholder="-"
                        placeholderTextColor={colors.text.muted}
                      />
                    </View>
                  ))}
                </View>
              </View>

              {/* Notes */}
              <Text style={[styles.inputLabel, { color: colors.text.secondary }]}>Notes</Text>
              <TextInput
                style={[styles.input, styles.notesInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any notes..."
                placeholderTextColor={colors.text.muted}
                multiline
              />

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: accent.primary }]}
                onPress={saveEntry}
              >
                <Ionicons name={isEditing ? 'checkmark' : 'add-circle'} size={20} color="#fff" />
                <Text style={styles.saveButtonText}>{isEditing ? 'Update Entry' : 'Add Exercise'}</Text>
              </TouchableOpacity>
            </View>

            {/* Saved Entries */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderLeft}>
                  <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                    Today's Workout ({entries.length})
                  </Text>
                  <Text style={[styles.sectionHint, { color: colors.text.muted }]}>
                    Tap to view details • Swipe left to delete
                  </Text>
                </View>
                {entries.length > 0 && (
                  <TouchableOpacity 
                    style={[styles.deleteAllButton, { borderColor: '#EF4444' }]}
                    onPress={deleteAllEntries}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    <Text style={styles.deleteAllText}>Delete All</Text>
                  </TouchableOpacity>
                )}
              </View>

              {entries.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: colors.background.card }]}>
                  <Ionicons name="clipboard-outline" size={48} color={colors.text.muted} />
                  <Text style={[styles.emptyText, { color: colors.text.primary }]}>No exercises yet</Text>
                  <Text style={[styles.emptySubtext, { color: colors.text.secondary }]}>
                    Add your first exercise above
                  </Text>
                </View>
              ) : (
                <>
                  {entries.map((entry) => {
                    const summary = getEntrySummary(entry);
                    const isExpanded = expandedEntryId === entry.entry_id;
                    return (
                      <SwipeableRow
                        key={entry.entry_id}
                        onDelete={() => deleteEntry(entry.entry_id)}
                      >
                        <View style={[styles.entryCard, { backgroundColor: colors.background.card }]}>
                          {/* Main Touchable Header */}
                          <TouchableOpacity
                            onPress={() => toggleExpand(entry.entry_id)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.entryHeader}>
                              <View style={styles.entryTitleRow}>
                                <Text style={[styles.entryName, { color: colors.text.primary }]}>
                                  {entry.exercise_name}
                                </Text>
                                {entry.synced_to_calendar && (
                                  <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
                                )}
                              </View>
                              <View style={styles.entryActions}>
                                <TouchableOpacity onPress={() => editEntry(entry)} style={styles.editButton}>
                                  <Ionicons name="pencil" size={18} color={accent.primary} />
                                </TouchableOpacity>
                                <Ionicons 
                                  name={isExpanded ? "chevron-up" : "chevron-down"} 
                                  size={20} 
                                  color={colors.text.muted} 
                                />
                              </View>
                            </View>
                            <View style={styles.entryStats}>
                              {summary.days > 0 && (
                                <Text style={[styles.entryStat, { color: colors.text.secondary }]}>
                                  {summary.days} day{summary.days > 1 ? 's' : ''} logged
                                </Text>
                              )}
                              {summary.maxWeight && (
                                <Text style={[styles.entryStat, { color: accent.primary }]}>
                                  Max: {summary.maxWeight} lbs
                                </Text>
                              )}
                            </View>
                            {entry.notes && !isExpanded && (
                              <Text style={[styles.entryNotes, { color: colors.text.muted }]} numberOfLines={1}>
                                {entry.notes}
                              </Text>
                            )}
                          </TouchableOpacity>
                          
                          {/* Expanded Details */}
                          {isExpanded && (
                            <View style={[styles.expandedSection, { borderTopColor: colors.border.primary }]}>
                              {/* Reps & Weight Grid */}
                              <Text style={[styles.expandedLabel, { color: colors.text.secondary }]}>
                                Reps & Weight by Day
                              </Text>
                              <View style={styles.expandedGrid}>
                                {DAYS.map(day => {
                                  const hasData = entry.reps[day] || entry.weight[day];
                                  return (
                                    <View 
                                      key={day} 
                                      style={[
                                        styles.dayCell, 
                                        { 
                                          backgroundColor: hasData ? `${accent.primary}15` : colors.background.input,
                                          borderColor: hasData ? accent.primary : colors.border.primary 
                                        }
                                      ]}
                                    >
                                      <Text style={[styles.dayCellHeader, { color: hasData ? accent.primary : colors.text.muted }]}>
                                        Day {day}
                                      </Text>
                                      <Text style={[styles.dayCellReps, { color: colors.text.primary }]}>
                                        {entry.reps[day] || '-'} reps
                                      </Text>
                                      <Text style={[styles.dayCellWeight, { color: colors.text.secondary }]}>
                                        {entry.weight[day] ? `${entry.weight[day]} lbs` : '-'}
                                      </Text>
                                    </View>
                                  );
                                })}
                              </View>
                              
                              {/* Notes */}
                              {entry.notes && (
                                <View style={styles.expandedNotes}>
                                  <Text style={[styles.expandedLabel, { color: colors.text.secondary }]}>Notes</Text>
                                  <Text style={[styles.expandedNotesText, { color: colors.text.primary }]}>
                                    {entry.notes}
                                  </Text>
                                </View>
                              )}
                              
                              {/* Edit Button */}
                              <TouchableOpacity
                                style={[styles.expandedEditButton, { backgroundColor: accent.primary }]}
                                onPress={() => editEntry(entry)}
                              >
                                <Ionicons name="create-outline" size={18} color="#fff" />
                                <Text style={styles.expandedEditButtonText}>Edit Reps & Weight</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </SwipeableRow>
                    );
                  })}

                  {/* Complete Workout Button */}
                  <TouchableOpacity
                    style={[styles.completeButton, { backgroundColor: '#22C55E' }]}
                    onPress={completeWorkout}
                  >
                    <Ionicons name="checkmark-done" size={24} color="#fff" />
                    <Text style={styles.completeButtonText}>Workout Complete</Text>
                  </TouchableOpacity>

                  {/* Save & Schedule Actions */}
                  <View style={styles.actionButtonsRow}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.background.card, borderColor: accent.primary }]}
                      onPress={() => setShowTemplateModal(true)}
                    >
                      <Ionicons name="bookmark-outline" size={20} color={accent.primary} />
                      <Text style={[styles.actionButtonText, { color: accent.primary }]}>Save Template</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: colors.background.card, borderColor: '#F59E0B' }]}
                      onPress={() => setShowScheduleModal(true)}
                    >
                      <Ionicons name="calendar-outline" size={20} color="#F59E0B" />
                      <Text style={[styles.actionButtonText, { color: '#F59E0B' }]}>Schedule</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>

            {/* Saved Templates Section */}
            {templates.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderLeft}>
                    <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
                      Saved Templates ({templates.length})
                    </Text>
                    <Text style={[styles.sectionHint, { color: colors.text.muted }]}>
                      Tap to load • Calendar icon to schedule
                    </Text>
                  </View>
                </View>

                {templates.map((template) => {
                  const templateColor = template.color_hex || WORKOUT_COLORS.find(c => c.id === template.color)?.hex || '#3B82F6';
                  return (
                    <TouchableOpacity
                      key={template.template_id}
                      style={[styles.templateCard, { backgroundColor: colors.background.card, borderLeftWidth: 4, borderLeftColor: templateColor }]}
                      onPress={() => loadTemplate(template)}
                    >
                      <View style={[styles.templateColorDot, { backgroundColor: templateColor }]} />
                      <View style={styles.templateInfo}>
                        <Text style={[styles.templateName, { color: colors.text.primary }]}>
                          {template.name}
                        </Text>
                        <Text style={[styles.templateMeta, { color: colors.text.secondary }]}>
                          {template.exercises.length} exercises • Used {template.times_used}x
                        </Text>
                      </View>
                      <View style={styles.templateActions}>
                        <TouchableOpacity 
                          style={styles.templateActionBtn}
                          onPress={() => openScheduleForTemplate(template)}
                        >
                          <Ionicons name="calendar" size={20} color="#F59E0B" />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={styles.templateActionBtn}
                          onPress={() => deleteTemplate(template.template_id)}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Save Template Modal */}
        <Modal
          visible={showTemplateModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTemplateModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background.card }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Save as Template</Text>
              <Text style={[styles.modalSubtitle, { color: colors.text.secondary }]}>
                Save this workout to reuse and schedule on any day
              </Text>
              
              <TextInput
                style={[styles.modalInput, { backgroundColor: colors.background.input, color: colors.text.primary }]}
                value={templateName}
                onChangeText={setTemplateName}
                placeholder="Workout name (e.g., Push Day)"
                placeholderTextColor={colors.text.muted}
              />

              {/* Color Selection */}
              <Text style={[styles.modalLabel, { color: colors.text.primary, marginTop: 12 }]}>Choose Color:</Text>
              <View style={styles.colorGrid}>
                {WORKOUT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color.id}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color.hex },
                      selectedColor === color.id && styles.colorOptionSelected
                    ]}
                    onPress={() => setSelectedColor(color.id)}
                  >
                    {selectedColor === color.id && (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.modalInfo, { color: colors.text.muted }]}>
                {entries.length} exercises will be saved
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.background.elevated }]}
                  onPress={() => setShowTemplateModal(false)}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text.primary }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: WORKOUT_COLORS.find(c => c.id === selectedColor)?.hex || accent.primary }]}
                  onPress={saveAsTemplate}
                >
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Save Template</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Schedule Modal */}
        <Modal
          visible={showScheduleModal}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setShowScheduleModal(false);
            setSelectedTemplateForSchedule(null);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: colors.background.card, maxHeight: '80%' }]}>
              <Text style={[styles.modalTitle, { color: colors.text.primary }]}>Schedule Workout</Text>
              <Text style={[styles.modalSubtitle, { color: colors.text.secondary }]}>
                {selectedTemplateForSchedule 
                  ? `Schedule "${selectedTemplateForSchedule.name}" on specific days`
                  : templates.length > 0 
                    ? `Schedule "${templates[0]?.name}" on specific days`
                    : 'Save a template first to schedule workouts'}
              </Text>

              {(selectedTemplateForSchedule || templates.length > 0) ? (
                <>
                  <Text style={[styles.modalLabel, { color: colors.text.primary }]}>Select Days:</Text>
                  <ScrollView style={styles.daysScrollView} showsVerticalScrollIndicator={false}>
                    <View style={styles.daysGrid}>
                      {getNextTwoWeeks().map((day) => (
                        <TouchableOpacity
                          key={day.date}
                          style={[
                            styles.dayOption,
                            { 
                              backgroundColor: selectedDays.includes(day.date) 
                                ? accent.primary 
                                : colors.background.input,
                              borderColor: selectedDays.includes(day.date) 
                                ? accent.primary 
                                : colors.border.primary,
                            }
                          ]}
                          onPress={() => toggleDaySelection(day.date)}
                        >
                          <Text style={[
                            styles.dayOptionText,
                            { color: selectedDays.includes(day.date) ? '#fff' : colors.text.primary }
                          ]}>
                            {day.label}
                          </Text>
                          {day.isToday && (
                            <Text style={[
                              styles.dayTodayBadge,
                              { color: selectedDays.includes(day.date) ? '#fff' : accent.primary }
                            ]}>
                              TODAY
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={[styles.selectedCount, { color: colors.text.secondary }]}>
                    {selectedDays.length} day(s) selected
                  </Text>
                </>
              ) : (
                <View style={styles.noTemplateMessage}>
                  <Ionicons name="bookmark-outline" size={48} color={colors.text.muted} />
                  <Text style={[styles.noTemplateText, { color: colors.text.secondary }]}>
                    Save your current workout as a template first
                  </Text>
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: colors.background.elevated }]}
                  onPress={() => {
                    setShowScheduleModal(false);
                    setSelectedDays([]);
                  }}
                >
                  <Text style={[styles.modalButtonText, { color: colors.text.primary }]}>Cancel</Text>
                </TouchableOpacity>
                {templates.length > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.modalButton, 
                      { backgroundColor: selectedDays.length > 0 ? '#F59E0B' : colors.background.elevated }
                    ]}
                    onPress={scheduleWorkout}
                    disabled={selectedDays.length === 0}
                  >
                    <Text style={[
                      styles.modalButtonText, 
                      { color: selectedDays.length > 0 ? '#fff' : colors.text.muted }
                    ]}>
                      Schedule
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  tableContainer: {
    marginTop: 16,
  },
  tableTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  labelColumn: {
    width: 55,
    justifyContent: 'center',
  },
  dayColumn: {
    flex: 1,
    alignItems: 'center',
  },
  headerCell: {
    fontSize: 11,
    fontWeight: '600',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  cellInput: {
    width: 36,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 14,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  section: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  deleteAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  deleteAllText: {
    color: '#EF4444',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    borderRadius: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  entryCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entryName: {
    fontSize: 16,
    fontWeight: '700',
  },
  entryStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 6,
  },
  entryStat: {
    fontSize: 13,
  },
  entryNotes: {
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
  },
  entryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  editButton: {
    padding: 4,
  },
  expandedSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  expandedLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayCell: {
    width: '13%',
    minWidth: 42,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayCellHeader: {
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4,
  },
  dayCellReps: {
    fontSize: 12,
    fontWeight: '600',
  },
  dayCellWeight: {
    fontSize: 10,
    marginTop: 2,
  },
  expandedNotes: {
    marginTop: 16,
  },
  expandedNotesText: {
    fontSize: 14,
    lineHeight: 20,
  },
  expandedEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  expandedEditButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
    gap: 10,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
  },
  templateColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  templateInfo: {
    flex: 1,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
  },
  templateMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  templateActions: {
    flexDirection: 'row',
    gap: 12,
  },
  templateActionBtn: {
    padding: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  modalInput: {
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  modalInfo: {
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  daysScrollView: {
    maxHeight: 250,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dayOption: {
    width: '47%',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  dayOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dayTodayBadge: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  selectedCount: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  noTemplateMessage: {
    alignItems: 'center',
    padding: 24,
  },
  noTemplateText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
});

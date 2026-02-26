import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart, BarChart, PieChart } from 'react-native-gifted-charts';
import { Colors } from '../constants/Colors';
import { useUserStore } from '../stores/userStore';
import { dashboardAPI, foodAPI, workoutAPI } from '../services/api';

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const { userId } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<any>(null);

  useEffect(() => {
    if (userId) {
      loadData();
    }
  }, [userId]);

  const loadData = async () => {
    try {
      const data = await dashboardAPI.getDashboard(userId!);
      setDashboardData(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
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

  // Prepare calorie trend data (last 7 days)
  const calorieData = dashboardData?.weekly_meals
    ?.reduce((acc: any[], meal: any) => {
      const date = meal.timestamp.split('T')[0];
      const existing = acc.find(item => item.date === date);
      if (existing) {
        existing.value += meal.calories;
      } else {
        acc.push({ date, value: meal.calories, label: new Date(date).getDate().toString() });
      }
      return acc;
    }, [])
    .slice(-7) || [];

  // Prepare workout frequency data
  const workoutData = dashboardData?.weekly_workouts
    ?.reduce((acc: any[], workout: any) => {
      const type = workout.workout_type;
      const existing = acc.find(item => item.label === type);
      if (existing) {
        existing.value += 1;
      } else {
        acc.push({ label: type, value: 1 });
      }
      return acc;
    }, []) || [];

  // Prepare macros data from today
  const today = dashboardData?.today || {};
  const macrosData = [
    { value: today.protein || 0, color: Colors.brand.primary, text: `${Math.round(today.protein || 0)}g` },
    { value: today.carbs || 0, color: Colors.status.success, text: `${Math.round(today.carbs || 0)}g` },
    { value: today.fat || 0, color: Colors.status.warning, text: `${Math.round(today.fat || 0)}g` },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Analytics & Insights</Text>

        {/* Calorie Trend */}
        {calorieData.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Calorie Intake Trend (7 Days)</Text>
            <LineChart
              data={calorieData}
              width={screenWidth - 80}
              height={220}
              color={Colors.brand.primary}
              thickness={3}
              dataPointsColor={Colors.brand.primary}
              startFillColor={Colors.brand.primary}
              startOpacity={0.3}
              endOpacity={0.1}
              areaChart
              curved
              hideRules
              yAxisTextStyle={{ color: Colors.text.secondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: Colors.text.secondary, fontSize: 10 }}
              noOfSections={4}
            />
          </View>
        )}

        {/* Today's Macros Breakdown */}
        {(today.protein || today.carbs || today.fat) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Today's Macros Breakdown</Text>
            <View style={styles.pieContainer}>
              <PieChart
                data={macrosData}
                donut
                radius={80}
                innerRadius={50}
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={styles.centerLabelValue}>
                      {Math.round(today.calories_consumed || 0)}
                    </Text>
                    <Text style={styles.centerLabelText}>calories</Text>
                  </View>
                )}
              />
            </View>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.brand.primary }]} />
                <Text style={styles.legendText}>Protein: {Math.round(today.protein || 0)}g</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.status.success }]} />
                <Text style={styles.legendText}>Carbs: {Math.round(today.carbs || 0)}g</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.status.warning }]} />
                <Text style={styles.legendText}>Fat: {Math.round(today.fat || 0)}g</Text>
              </View>
            </View>
          </View>
        )}

        {/* Workout Frequency */}
        {workoutData.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Workout Types (This Week)</Text>
            <BarChart
              data={workoutData.map((item: any, index: number) => ({
                value: item.value,
                label: item.label.substring(0, 3),
                frontColor: [Colors.brand.primary, Colors.status.success, Colors.status.warning, Colors.status.error][index % 4],
              }))}
              width={screenWidth - 80}
              height={200}
              barWidth={40}
              spacing={20}
              noOfSections={4}
              yAxisTextStyle={{ color: Colors.text.secondary, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: Colors.text.secondary, fontSize: 10 }}
              hideRules
            />
          </View>
        )}

        {/* Summary Stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Weekly Summary</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{dashboardData?.weekly_meals?.length || 0}</Text>
              <Text style={styles.statLabel}>Meals Logged</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{dashboardData?.weekly_workouts?.length || 0}</Text>
              <Text style={styles.statLabel}>Workouts</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {Math.round((dashboardData?.weekly_workouts?.reduce((sum: number, w: any) => sum + (w.calories_burned || 0), 0) || 0))}
              </Text>
              <Text style={styles.statLabel}>Calories Burned</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {Math.round((dashboardData?.weekly_meals?.reduce((sum: number, m: any) => sum + (m.calories || 0), 0) || 0) / 7)}
              </Text>
              <Text style={styles.statLabel}>Avg Daily Intake</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
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
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 20,
  },
  card: {
    backgroundColor: Colors.background.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text.primary,
    marginBottom: 16,
  },
  pieContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  centerLabel: {
    alignItems: 'center',
  },
  centerLabelValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  centerLabelText: {
    fontSize: 12,
    color: Colors.text.secondary,
  },
  legend: {
    marginTop: 16,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 14,
    color: Colors.text.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: Colors.background.light,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.brand.primary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
});
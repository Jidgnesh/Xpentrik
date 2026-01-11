import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { format, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { colors } from '../theme/colors';
import { getExpenses, DEFAULT_CATEGORIES } from '../utils/storage';
import ExpenseCard from '../components/ExpenseCard';
import { getSpendingInsights } from '../utils/insights';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AnalyticsScreen = () => {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('month'); // 'week', 'month', 'year'
  const [categoryData, setCategoryData] = useState([]);
  const [weeklyData, setWeeklyData] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [insights, setInsights] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getExpenses();
      setExpenses(data);
      
      // Filter by period
      const now = new Date();
      let startDate, endDate;
      
      if (selectedPeriod === 'week') {
        startDate = startOfWeek(now, { weekStartsOn: 1 });
        endDate = endOfWeek(now, { weekStartsOn: 1 });
      } else if (selectedPeriod === 'month') {
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
      } else {
        startDate = subMonths(now, 12);
        endDate = now;
      }

      const filtered = data.filter(e => {
        const date = new Date(e.date || e.createdAt);
        return date >= startDate && date <= endDate;
      });

      // Filter out income from expense calculations
      const expensesOnly = filtered.filter(e => !e.isIncome);

      // Calculate category totals (only expenses, not income)
      const categoryTotals = {};
      expensesOnly.forEach(e => {
        const cat = e.category || 'other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + (parseFloat(e.amount) || 0);
      });

      const total = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
      
      const categoryArray = Object.entries(categoryTotals)
        .map(([id, amount]) => {
          const category = DEFAULT_CATEGORIES.find(c => c.id === id) || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
          return {
            ...category,
            amount,
            percentage: total > 0 ? (amount / total) * 100 : 0,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      setCategoryData(categoryArray);

      // Calculate weekly breakdown for chart
      const weekStart = startOfWeek(now, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
      const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
      
      const dailyTotals = days.map(day => {
        const dayExpenses = data.filter(e => {
          const expenseDate = new Date(e.date || e.createdAt);
          const isToday = isSameDay(expenseDate, day);
          // Only count expenses, not income
          const isExpense = !e.isIncome;
          return isToday && isExpense;
        });
        const total = dayExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
        return {
          day: format(day, 'EEE'),
          date: format(day, 'd'),
          dateObj: day,
          total,
          isToday: isSameDay(day, now),
          expenses: dayExpenses,
        };
      });

      setWeeklyData(dailyTotals);
      
      // Load insights
      const insightsData = await getSpendingInsights();
      setInsights(insightsData);
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatCurrency = (amount) => {
    if (amount == null || isNaN(amount)) return '0';
    return amount.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const totalSpent = categoryData.reduce((sum, c) => sum + (c.amount || 0), 0);
  const maxDailySpend = Math.max(...weeklyData.map(d => d.total || 0), 1);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.subtitle}>Track your spending patterns</Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {['week', 'month', 'year'].map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                selectedPeriod === period && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(period)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period && styles.periodButtonTextActive,
                ]}
              >
                {period.charAt(0).toUpperCase() + period.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Total Card */}
        <LinearGradient
          colors={['#ff6b35', '#ff8c5a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.totalCard}
        >
          <Text style={styles.totalLabel}>Total Spent</Text>
          <View style={styles.totalAmountRow}>
            <Text style={styles.totalCurrency}>₹</Text>
            <Text style={styles.totalAmount}>{formatCurrency(totalSpent)}</Text>
          </View>
          <Text style={styles.totalPeriod}>
            {selectedPeriod === 'week' ? 'This Week' : selectedPeriod === 'month' ? 'This Month' : 'Last 12 Months'}
          </Text>
        </LinearGradient>

        {/* Weekly Chart */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Overview</Text>
          <View style={styles.chart}>
            {weeklyData.map((day, index) => (
              <TouchableOpacity
                key={index}
                style={styles.chartColumn}
                onPress={() => {
                  if (day.total > 0) {
                    setSelectedDay(day);
                    setDayModalVisible(true);
                  }
                }}
                activeOpacity={day.total > 0 ? 0.7 : 1}
              >
                <View style={styles.barContainer}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(0, ((day.total || 0) / maxDailySpend) * 100)}%`,
                        backgroundColor: day.isToday ? colors.primary : colors.surfaceLight,
                        opacity: day.total > 0 ? 1 : 0.3,
                      },
                    ]}
                  />
                  {day.total > 0 && (
                    <Text style={styles.barAmount}>₹{formatCurrency(day.total)}</Text>
                  )}
                </View>
                <Text style={[styles.chartDay, day.isToday && styles.chartDayActive]}>
                  {day.day}
                </Text>
                <Text style={styles.chartDate}>{day.date}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Category Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>By Category</Text>
          
          {categoryData.length === 0 ? (
            <View style={styles.emptyCategory}>
              <Text style={styles.emptyCategoryText}>No expenses in this period</Text>
            </View>
          ) : (
            categoryData.map((category, index) => (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryItem}
                onPress={() => {
                  setSelectedCategory(category);
                  setCategoryModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.categoryLeft}>
                  <View style={[styles.categoryIcon, { backgroundColor: `${category.color}20` }]}>
                    <Text style={styles.categoryEmoji}>{category.icon}</Text>
                  </View>
                  <View>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryPercentage}>
                      {(category.percentage || 0).toFixed(1)}% of total
                    </Text>
                  </View>
                </View>
                <Text style={styles.categoryAmount}>₹{formatCurrency(category.amount)}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Spending Insights */}
        {insights && (
          <View style={[styles.section, styles.insightsSection]}>
            <Text style={styles.sectionTitle}>💡 Spending Insights</Text>
            
            {/* Month Comparison */}
            <View style={styles.insightCard}>
              <Text style={styles.insightIcon}>📊</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Month Comparison</Text>
                <Text style={styles.insightValue}>
                  {(insights.monthOverMonthChange || 0) > 0 ? '+' : ''}
                  {(insights.monthOverMonthChange || 0).toFixed(1)}% vs last month
                </Text>
                <Text style={styles.insightSubtext}>
                  This month: ₹{formatCurrency(insights.currentMonthTotal || 0)} • 
                  Last month: ₹{formatCurrency(insights.lastMonthTotal || 0)}
                </Text>
              </View>
            </View>

            {/* Budget Status */}
            <View style={[
              styles.insightCard,
              insights.isOverBudget && styles.insightCardDanger,
              insights.isNearBudget && styles.insightCardWarning
            ]}>
              <Text style={styles.insightIcon}>
                {insights.isOverBudget ? '⚠️' : insights.isNearBudget ? '⚡' : '✅'}
              </Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Budget Status</Text>
                <Text style={styles.insightValue}>
                  {(insights.budgetProgress || 0).toFixed(0)}% used
                </Text>
                <Text style={styles.insightSubtext}>
                  {insights.daysRemaining || 0} days remaining
                </Text>
              </View>
            </View>

            {/* Projection */}
            <View style={styles.insightCard}>
              <Text style={styles.insightIcon}>🔮</Text>
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>Projected Monthly</Text>
                <Text style={styles.insightValue}>
                  ₹{formatCurrency(insights.projectedMonthly || 0)}
                </Text>
                <Text style={styles.insightSubtext}>
                  Avg daily: ₹{formatCurrency(insights.averageDailySpend || 0)}
                </Text>
              </View>
            </View>

            {/* Top Day */}
            {insights.topDay && insights.topDay.date && (
              <View style={styles.insightCard}>
                <Text style={styles.insightIcon}>📅</Text>
                <View style={styles.insightContent}>
                  <Text style={styles.insightTitle}>Highest Spending Day</Text>
                  <Text style={styles.insightValue}>
                    ₹{formatCurrency(insights.topDay.amount || 0)}
                  </Text>
                  <Text style={styles.insightSubtext}>
                    {insights.topDay.date ? new Date(insights.topDay.date).toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' }) : 'N/A'}
                  </Text>
                </View>
              </View>
            )}

            {/* Tips */}
            <View style={styles.tipsContainer}>
              <Text style={styles.tipsTitle}>💡 Tips</Text>
              {(insights.tips || []).map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Quick Insights (Legacy) */}
        <View style={[styles.section, styles.insightsSection]}>
          <Text style={styles.sectionTitle}>Quick Stats</Text>
          
          <View style={styles.insightCard}>
            <Text style={styles.insightIcon}>📈</Text>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Top Category</Text>
              <Text style={styles.insightValue}>
                {categoryData[0]?.name || 'N/A'} - ₹{formatCurrency(categoryData[0]?.amount || 0)}
              </Text>
            </View>
          </View>

          <View style={styles.insightCard}>
            <Text style={styles.insightIcon}>📊</Text>
            <View style={styles.insightContent}>
              <Text style={styles.insightTitle}>Total Transactions</Text>
              <Text style={styles.insightValue}>{expenses.length}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Category Transactions Modal */}
      <Modal
        visible={categoryModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCategoryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedCategory?.icon} {selectedCategory?.name}
              </Text>
              <TouchableOpacity
                onPress={() => setCategoryModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              ₹{formatCurrency(selectedCategory?.amount || 0)} • {(selectedCategory?.percentage || 0).toFixed(1)}% of total
            </Text>
            <FlatList
              data={expenses.filter(e => 
                e.category === selectedCategory?.id && !e.isIncome
              )}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ExpenseCard expense={item} />
              )}
              ListEmptyComponent={
                <View style={styles.emptyModal}>
                  <Text style={styles.emptyModalText}>No transactions in this category</Text>
                </View>
              }
              style={styles.modalList}
            />
          </View>
        </View>
      </Modal>

      {/* Day Transactions Modal */}
      <Modal
        visible={dayModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setDayModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDay ? format(selectedDay.dateObj, 'EEEE, MMMM d') : ''}
              </Text>
              <TouchableOpacity
                onPress={() => setDayModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              ₹{formatCurrency(selectedDay?.total || 0)} • {selectedDay?.expenses?.length || 0} transactions
            </Text>
            <FlatList
              data={selectedDay?.expenses || []}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <ExpenseCard expense={item} />
              )}
              ListEmptyComponent={
                <View style={styles.emptyModal}>
                  <Text style={styles.emptyModalText}>No transactions on this day</Text>
                </View>
              }
              style={styles.modalList}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 4,
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginVertical: 20,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  periodButtonActive: {
    backgroundColor: colors.primary,
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodButtonTextActive: {
    color: colors.text,
  },
  totalCard: {
    marginHorizontal: 20,
    borderRadius: 24,
    padding: 28,
    marginBottom: 24,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8,
  },
  totalCurrency: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginRight: 4,
    marginTop: 8,
  },
  totalAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -2,
  },
  totalPeriod: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 160,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    paddingBottom: 12,
  },
  chartColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    flex: 1,
    width: 24,
    justifyContent: 'flex-end',
    marginBottom: 8,
    alignItems: 'center',
  },
  bar: {
    width: '100%',
    borderRadius: 6,
    minHeight: 4,
  },
  chartDay: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  chartDayActive: {
    color: colors.primary,
  },
  chartDate: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  emptyCategory: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  categoryEmoji: {
    fontSize: 22,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  categoryPercentage: {
    fontSize: 13,
    color: colors.textMuted,
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  insightsSection: {
    paddingBottom: 20,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
  },
  insightIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  insightContent: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  insightValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  insightSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  insightCardDanger: {
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  insightCardWarning: {
    backgroundColor: colors.warningMuted,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  tipsContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  tipItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tipText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  barAmount: {
    fontSize: 8,
    fontWeight: '600',
    color: colors.text,
    marginTop: 2,
    textAlign: 'center',
    position: 'absolute',
    top: -16,
    width: 40,
    left: -8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  modalList: {
    paddingHorizontal: 16,
  },
  emptyModal: {
    padding: 40,
    alignItems: 'center',
  },
  emptyModalText: {
    fontSize: 15,
    color: colors.textMuted,
  },
});

export default AnalyticsScreen;


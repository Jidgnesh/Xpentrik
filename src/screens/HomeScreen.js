import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { colors } from '../theme/colors';
import ExpenseCard from '../components/ExpenseCard';
import StatCard from '../components/StatCard';
import AddExpenseModal from '../components/AddExpenseModal';
import SplitExpenseModal from '../components/SplitExpenseModal';
import { getExpenseSplit } from '../utils/splitting';
import { getExpenses, deleteExpense, getSettings, DEFAULT_CATEGORIES } from '../utils/storage';
import { getSMSStatus, scanForNewExpenses, startSmsListener, stopSmsListener, requestSMSPermission, processPendingSms, syncWeekSms } from '../services/smsService';

const HomeScreen = () => {
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [settings, setSettings] = useState({ currency: '₹', monthlyBudget: 50000 });
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [smsStatus, setSmsStatus] = useState(null);
  const [smsListenerId, setSmsListenerId] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [splitModalVisible, setSplitModalVisible] = useState(false);
  const [splittingExpense, setSplittingExpense] = useState(null);
  const [filters, setFilters] = useState({
    category: null,
    dateRange: null,
    minAmount: '',
    maxAmount: '',
  });
  const [filteredExpenses, setFilteredExpenses] = useState([]);

  // Handle new expense from SMS listener
  const handleNewSmsExpense = useCallback((expense) => {
    const typeEmoji = expense.isIncome ? '💰' : '💸';
    const typeText = expense.isIncome ? 'Income Received!' : 'Expense Detected!';
    Alert.alert(
      `${typeEmoji} ${typeText}`,
      `₹${expense.amount} - ${expense.description}`,
      [{ text: 'OK' }]
    );
    loadData();
  }, []);

  // Process pending SMS and start listener on mount
  useEffect(() => {
    const initSmsListener = async () => {
      const status = await getSMSStatus();
      setSmsStatus(status);

      if (status.supported && status.permissionGranted) {
        // Process any SMS received while app was closed
        const { newExpenses } = await processPendingSms();
        if (newExpenses.length > 0) {
          Alert.alert(
            '📱 SMS Synced!',
            `Found ${newExpenses.length} new transaction(s) from SMS received while app was closed.`,
            [{ text: 'OK' }]
          );
          loadData();
        }

        // Start listening for new SMS
        const listenerId = await startSmsListener(handleNewSmsExpense);
        setSmsListenerId(listenerId);
      } else if (status.supported && !status.permissionGranted) {
        // Request permission on first launch
        const granted = await requestSMSPermission();
        if (granted) {
          const listenerId = await startSmsListener(handleNewSmsExpense);
          setSmsListenerId(listenerId);
        }
      }
    };

    initSmsListener();

    return () => {
      if (smsListenerId) {
        stopSmsListener(smsListenerId);
      }
    };
  }, [handleNewSmsExpense]);

  const loadData = useCallback(async () => {
    try {
      const [expensesData, settingsData, smsStatusData] = await Promise.all([
        getExpenses(),
        getSettings(),
        getSMSStatus(),
      ]);

      // Check for splits and mark expenses
      const { getSplitExpenses } = require('../utils/splitting');
      const splits = await getSplitExpenses();
      const expenseIdsWithSplits = new Set(splits.map(s => s.expenseId));
      expensesData.forEach(e => {
        if (expenseIdsWithSplits.has(e.id)) {
          e.hasSplit = true;
        }
      });

      setExpenses(expensesData);
      setSettings(settingsData);
      setSmsStatus(smsStatusData);

      // Calculate monthly total (only expenses, not income)
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const monthExpenses = expensesData.filter(e => {
        const date = new Date(e.date || e.createdAt);
        const isInMonth = date >= monthStart && date <= monthEnd;
        // Only count expenses, not income
        const isExpense = !e.isIncome;
        return isInMonth && isExpense;
      });
      const monthTotal = monthExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      setMonthlyTotal(monthTotal);
      
      // Check budget and send notification if needed (async, don't wait)
      if (settingsData.monthlyBudget > 0) {
        const budgetPercentage = (monthTotal / settingsData.monthlyBudget) * 100;
        if (budgetPercentage >= 80) {
          sendBudgetAlert(budgetPercentage).catch(() => {});
        }
      }

      // Calculate today's total (only expenses, not income)
      const dayStart = startOfDay(now);
      const dayEnd = endOfDay(now);
      const todayExpenses = expensesData.filter(e => {
        const date = new Date(e.date || e.createdAt);
        const isToday = date >= dayStart && date <= dayEnd;
        // Only count expenses, not income
        const isExpense = !e.isIncome;
        return isToday && isExpense;
      });
      const dayTotal = todayExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
      setTodayTotal(dayTotal);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Re-apply filters when search or filters change
  useEffect(() => {
    applyFilters(expenses);
  }, [searchQuery, filters, expenses, applyFilters]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    
    // Try to scan for new SMS expenses on Android
    if (smsStatus?.supported && smsStatus?.permissionGranted) {
      try {
        const result = await scanForNewExpenses();
        if (result.newExpenses.length > 0) {
          Alert.alert(
            'SMS Sync Complete',
            `Found ${result.newExpenses.length} new expense(s) from your messages!`
          );
        }
      } catch (error) {
        console.error('SMS scan error:', error);
      }
    }

    await loadData();
    setRefreshing(false);
  }, [loadData, smsStatus]);

  const handleExpenseAdded = (expense) => {
    loadData();
    setEditingExpense(null);
  };

  const handleEditExpense = (expense) => {
    setEditingExpense(expense);
    setModalVisible(true);
  };

  const handleDeleteExpense = (expense) => {
    Alert.alert(
      'Delete Expense',
      `Are you sure you want to delete this ₹${expense.amount} expense?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteExpense(expense.id);
            loadData();
          },
        },
      ]
    );
  };

  // Sync week's SMS messages
  const handleSyncWeek = async () => {
    if (syncing) return;
    
    setSyncing(true);
    try {
      const result = await syncWeekSms(7);
      
      if (result.success) {
        if (result.newExpenses.length > 0) {
          Alert.alert(
            '✅ Sync Complete!',
            `Found ${result.newExpenses.length} new transaction(s) from the last 7 days.\n\nTotal scanned: ${result.totalScanned}\nAlready processed: ${result.alreadyProcessed}`,
            [{ text: 'OK' }]
          );
          loadData();
        } else {
          Alert.alert(
            '📱 Sync Complete',
            result.message || `Scanned ${result.totalScanned} messages. No new transactions found.`,
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert(
          '⚠️ Sync Failed',
          result.error || 'Unable to sync SMS. Please check permissions.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert(
        'Error',
        error.message || 'Failed to sync SMS messages.',
        [{ text: 'OK' }]
      );
    } finally {
      setSyncing(false);
    }
  };

  const formatCurrency = (amount) => {
    return amount.toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const budgetPercentage = settings.monthlyBudget > 0 
    ? Math.min((monthlyTotal / settings.monthlyBudget) * 100, 100)
    : 0;

  const budgetStatus = budgetPercentage >= 90 
    ? { color: colors.danger, text: 'Over budget!' }
    : budgetPercentage >= 70 
      ? { color: colors.warning, text: 'Getting close' }
      : { color: colors.success, text: 'On track' };

  const renderHeader = () => (
    <View style={styles.headerContent}>
      {/* Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.greetingText}>
          {format(new Date(), 'EEEE, MMMM d')}
        </Text>
        <Text style={styles.title}>Xpentrik</Text>
      </View>

      {/* Main Stats Card */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mainCard}
      >
        <View style={styles.mainCardHeader}>
          <Text style={styles.mainCardLabel}>This Month</Text>
          <View style={[styles.statusBadge, { backgroundColor: `${budgetStatus.color}20` }]}>
            <Text style={[styles.statusText, { color: budgetStatus.color }]}>
              {budgetStatus.text}
            </Text>
          </View>
        </View>
        
        <View style={styles.mainAmountRow}>
          <Text style={styles.mainCurrency}>₹</Text>
          <Text style={styles.mainAmount}>{formatCurrency(monthlyTotal)}</Text>
        </View>

        {/* Budget Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${budgetPercentage}%`,
                  backgroundColor: budgetStatus.color,
                }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>
            {budgetPercentage.toFixed(0)}% of ₹{formatCurrency(settings.monthlyBudget)} budget
          </Text>
        </View>
      </LinearGradient>

      {/* Quick Stats Row */}
      <View style={styles.statsRow}>
        <StatCard
          title="Today"
          value={`₹${formatCurrency(todayTotal)}`}
          icon="📅"
          style={styles.statCard}
        />
        <StatCard
          title="Transactions"
          value={expenses.length.toString()}
          icon="📊"
          style={styles.statCard}
        />
      </View>

      {/* SMS Status Banner */}
      {smsStatus && !smsStatus.permissionGranted && smsStatus.supported && (
        <TouchableOpacity style={styles.smsBanner} onPress={onRefresh}>
          <Text style={styles.smsBannerIcon}>📱</Text>
          <View style={styles.smsBannerContent}>
            <Text style={styles.smsBannerTitle}>Enable Auto-Read</Text>
            <Text style={styles.smsBannerText}>
              Tap to allow SMS reading for automatic expense tracking
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Sync Week Button - Shows when SMS is available */}
      {smsStatus?.supported && smsStatus?.permissionGranted && (
        <TouchableOpacity 
          style={[styles.syncWeekButton, syncing && styles.syncWeekButtonDisabled]} 
          onPress={handleSyncWeek}
          disabled={syncing}
        >
          <Text style={styles.syncWeekIcon}>{syncing ? '⏳' : '🔄'}</Text>
          <View style={styles.syncWeekContent}>
            <Text style={styles.syncWeekTitle}>
              {syncing ? 'Syncing...' : 'Sync Last 7 Days'}
            </Text>
            <Text style={styles.syncWeekText}>
              Scan SMS inbox for missed transactions
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Recent Expenses Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Expenses</Text>
        <TouchableOpacity>
          <Text style={styles.seeAllText}>See All</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>💸</Text>
      <Text style={styles.emptyTitle}>No expenses yet</Text>
      <Text style={styles.emptyText}>
        Tap the + button to add your first expense{'\n'}or pull down to sync from SMS
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      
      <FlatList
        data={filteredExpenses.slice(0, 50)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ExpenseCard
            expense={item}
            onPress={() => handleEditExpense(item)}
            onLongPress={() => handleDeleteExpense(item)}
          />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={colors.gradients.primary}
          style={styles.fabGradient}
        >
          <Text style={styles.fabText}>+</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Add/Edit Expense Modal */}
      <AddExpenseModal
        visible={modalVisible}
        onClose={() => {
          setModalVisible(false);
          setEditingExpense(null);
        }}
        onExpenseAdded={handleExpenseAdded}
        expenseToEdit={editingExpense}
      />

      {/* Split Expense Modal */}
      <SplitExpenseModal
        visible={splitModalVisible}
        onClose={() => {
          setSplitModalVisible(false);
          setSplittingExpense(null);
        }}
        expense={splittingExpense}
        onSplitAdded={loadData}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingBottom: 100,
  },
  headerContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  greeting: {
    marginBottom: 20,
  },
  greetingText: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 4,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
  },
  mainCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mainCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mainCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainAmountRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  mainCurrency: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
    marginRight: 4,
    marginTop: 8,
  },
  mainAmount: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -2,
  },
  progressContainer: {
    marginTop: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.surface,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
  },
  smsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  smsBannerIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  smsBannerContent: {
    flex: 1,
  },
  smsBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  smsBannerText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  syncWeekButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.success,
  },
  syncWeekButtonDisabled: {
    opacity: 0.6,
    borderColor: colors.border,
  },
  syncWeekIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  syncWeekContent: {
    flex: 1,
  },
  syncWeekTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.success,
    marginBottom: 2,
  },
  syncWeekText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabText: {
    fontSize: 32,
    fontWeight: '300',
    color: colors.text,
    marginTop: -2,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  clearIcon: {
    fontSize: 16,
    color: colors.textMuted,
    padding: 4,
  },
  filterButton: {
    width: 48,
    height: 48,
    backgroundColor: colors.surface,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterIcon: {
    fontSize: 20,
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  filterModalContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  filterModalClose: {
    fontSize: 20,
    color: colors.textMuted,
    padding: 8,
  },
  filterModalContent: {
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  categoryFilterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryFilterChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  categoryFilterChipActive: {
    backgroundColor: colors.primary,
  },
  categoryFilterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  dateFilterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dateFilterButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  dateFilterButtonActive: {
    backgroundColor: colors.primary,
  },
  dateFilterText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dateFilterTextActive: {
    color: colors.text,
  },
  amountFilterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  amountInputGroup: {
    flex: 1,
  },
  amountLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  clearFiltersButton: {
    backgroundColor: colors.dangerMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  clearFiltersText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
});

export default HomeScreen;


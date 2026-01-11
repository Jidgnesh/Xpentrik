import AsyncStorage from '@react-native-async-storage/async-storage';

const EXPENSES_KEY = '@xpentrik_expenses';
const CATEGORIES_KEY = '@xpentrik_categories';
const SETTINGS_KEY = '@xpentrik_settings';
const PROCESSED_SMS_KEY = '@xpentrik_processed_sms';

// Default categories with icons and colors
export const DEFAULT_CATEGORIES = [
  { id: 'income', name: 'Income', icon: '💰', color: '#00E676' },
  { id: 'food', name: 'Food & Dining', icon: '🍕', color: '#FF6B35' },
  { id: 'transport', name: 'Transport', icon: '🚗', color: '#4ECDC4' },
  { id: 'shopping', name: 'Shopping', icon: '🛍️', color: '#9B59B6' },
  { id: 'bills', name: 'Bills & Utilities', icon: '📄', color: '#3498DB' },
  { id: 'entertainment', name: 'Entertainment', icon: '🎬', color: '#E74C3C' },
  { id: 'health', name: 'Health', icon: '💊', color: '#2ECC71' },
  { id: 'groceries', name: 'Groceries', icon: '🛒', color: '#F39C12' },
  { id: 'transfer', name: 'Transfer', icon: '💸', color: '#1ABC9C' },
  { id: 'atm', name: 'ATM Withdrawal', icon: '🏧', color: '#34495E' },
  { id: 'other', name: 'Other', icon: '📌', color: '#95A5A6' },
];

// Expense operations
export const getExpenses = async () => {
  try {
    const data = await AsyncStorage.getItem(EXPENSES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting expenses:', error);
    return [];
  }
};

export const saveExpense = async (expense) => {
  try {
    const expenses = await getExpenses();
    const newExpense = {
      id: Date.now().toString(),
      ...expense,
      createdAt: new Date().toISOString(),
    };
    expenses.unshift(newExpense);
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
    
    // Send notification (async, don't wait) - using dynamic import to avoid circular dependency
    Promise.resolve().then(async () => {
      try {
        const { sendExpenseAddedNotification } = await import('../services/notifications');
        sendExpenseAddedNotification(newExpense);
      } catch (error) {
        // Ignore notification errors
      }
    });
    
    return newExpense;
  } catch (error) {
    console.error('Error saving expense:', error);
    throw error;
  }
};

export const updateExpense = async (id, updates) => {
  try {
    const expenses = await getExpenses();
    const index = expenses.findIndex(e => e.id === id);
    if (index !== -1) {
      expenses[index] = { ...expenses[index], ...updates };
      await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
      return expenses[index];
    }
    throw new Error('Expense not found');
  } catch (error) {
    console.error('Error updating expense:', error);
    throw error;
  }
};

export const deleteExpense = async (id) => {
  try {
    const expenses = await getExpenses();
    const filtered = expenses.filter(e => e.id !== id);
    await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting expense:', error);
    throw error;
  }
};

// Categories operations
export const getCategories = async () => {
  try {
    const data = await AsyncStorage.getItem(CATEGORIES_KEY);
    return data ? JSON.parse(data) : DEFAULT_CATEGORIES;
  } catch (error) {
    console.error('Error getting categories:', error);
    return DEFAULT_CATEGORIES;
  }
};

export const saveCategories = async (categories) => {
  try {
    await AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
    return true;
  } catch (error) {
    console.error('Error saving categories:', error);
    throw error;
  }
};

// Settings operations
export const getSettings = async () => {
  try {
    const data = await AsyncStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : {
      currency: '₹',
      autoReadSMS: true,
      monthlyBudget: 50000,
      darkMode: true,
    };
  } catch (error) {
    console.error('Error getting settings:', error);
    return { currency: '₹', autoReadSMS: true, monthlyBudget: 50000, darkMode: true };
  }
};

export const saveSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
};

// Processed SMS tracking (to avoid duplicates)
export const getProcessedSMSIds = async () => {
  try {
    const data = await AsyncStorage.getItem(PROCESSED_SMS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting processed SMS:', error);
    return [];
  }
};

export const markSMSAsProcessed = async (smsId) => {
  try {
    const processed = await getProcessedSMSIds();
    if (!processed.includes(smsId)) {
      processed.push(smsId);
      // Keep only last 1000 SMS IDs to prevent storage bloat
      if (processed.length > 1000) {
        processed.splice(0, processed.length - 1000);
      }
      await AsyncStorage.setItem(PROCESSED_SMS_KEY, JSON.stringify(processed));
    }
    return true;
  } catch (error) {
    console.error('Error marking SMS as processed:', error);
    throw error;
  }
};

// Analytics helpers
export const getExpensesByDateRange = async (startDate, endDate) => {
  try {
    const expenses = await getExpenses();
    return expenses.filter(e => {
      const date = new Date(e.date || e.createdAt);
      return date >= startDate && date <= endDate;
    });
  } catch (error) {
    console.error('Error filtering expenses:', error);
    return [];
  }
};

export const getExpensesByCategory = async (categoryId) => {
  try {
    const expenses = await getExpenses();
    return expenses.filter(e => e.category === categoryId);
  } catch (error) {
    console.error('Error filtering by category:', error);
    return [];
  }
};

export const getTotalSpent = async (startDate, endDate) => {
  try {
    const expenses = await getExpensesByDateRange(startDate, endDate);
    return expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  } catch (error) {
    console.error('Error calculating total:', error);
    return 0;
  }
};

// Clear all data (for testing/reset)
export const clearAllData = async () => {
  try {
    await AsyncStorage.multiRemove([
      EXPENSES_KEY,
      CATEGORIES_KEY,
      SETTINGS_KEY,
      PROCESSED_SMS_KEY,
    ]);
    return true;
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};


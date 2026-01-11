import AsyncStorage from '@react-native-async-storage/async-storage';

const SPLIT_EXPENSES_KEY = '@xpentrik_split_expenses';
const SPLIT_GROUPS_KEY = '@xpentrik_split_groups';

/**
 * Split an expense among multiple people
 */
export const splitExpense = async (expenseId, splits) => {
  try {
    const splitExpenses = await getSplitExpenses();
    const split = {
      id: Date.now().toString(),
      expenseId,
      splits,
      createdAt: new Date().toISOString(),
    };
    
    splitExpenses.push(split);
    await AsyncStorage.setItem(SPLIT_EXPENSES_KEY, JSON.stringify(splitExpenses));
    return split;
  } catch (error) {
    console.error('Error splitting expense:', error);
    throw error;
  }
};

/**
 * Get all split expenses
 */
export const getSplitExpenses = async () => {
  try {
    const data = await AsyncStorage.getItem(SPLIT_EXPENSES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Error getting split expenses:', error);
    return [];
  }
};

/**
 * Get split details for an expense
 */
export const getExpenseSplit = async (expenseId) => {
  try {
    const splitExpenses = await getSplitExpenses();
    return splitExpenses.find(s => s.expenseId === expenseId);
  } catch (error) {
    console.error('Error getting expense split:', error);
    return null;
  }
};

/**
 * Delete split for an expense
 */
export const deleteSplit = async (expenseId) => {
  try {
    const splitExpenses = await getSplitExpenses();
    const filtered = splitExpenses.filter(s => s.expenseId !== expenseId);
    await AsyncStorage.setItem(SPLIT_EXPENSES_KEY, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('Error deleting split:', error);
    throw error;
  }
};

/**
 * Calculate who owes what
 */
export const calculateSettlements = async () => {
  try {
    const splitExpenses = await getSplitExpenses();
    const { getExpenses } = require('./storage');
    const expenses = await getExpenses();
    
    const balances = {};
    
    splitExpenses.forEach(split => {
      const expense = expenses.find(e => e.id === split.expenseId);
      if (!expense) return;
      
      const totalAmount = expense.amount;
      const splitCount = split.splits.length;
      const perPerson = totalAmount / splitCount;
      
      split.splits.forEach(person => {
        if (!balances[person.name]) {
          balances[person.name] = { paid: 0, owes: 0 };
        }
        
        if (person.paid) {
          balances[person.name].paid += person.amount || perPerson;
        } else {
          balances[person.name].owes += person.amount || perPerson;
        }
      });
    });
    
    // Calculate net balances
    const settlements = Object.entries(balances).map(([name, balance]) => ({
      name,
      net: balance.paid - balance.owes,
      paid: balance.paid,
      owes: balance.owes,
    }));
    
    return settlements;
  } catch (error) {
    console.error('Error calculating settlements:', error);
    return [];
  }
};

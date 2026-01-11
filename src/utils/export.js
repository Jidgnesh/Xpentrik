import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getExpenses, getSettings } from './storage';
import { format } from 'date-fns';

/**
 * Export expenses to CSV format
 */
export const exportToCSV = async () => {
  try {
    const expenses = await getExpenses();
    const settings = await getSettings();
    
    // CSV Header
    let csv = 'Date,Description,Category,Amount,Type,Source\n';
    
    // CSV Rows
    expenses.forEach(expense => {
      const date = format(new Date(expense.date || expense.createdAt), 'yyyy-MM-dd HH:mm:ss');
      const description = (expense.description || '').replace(/,/g, ';');
      const category = expense.category || 'other';
      const amount = expense.amount || 0;
      const type = expense.isIncome ? 'Income' : 'Expense';
      const source = expense.source || 'manual';
      
      csv += `${date},${description},${category},${amount},${type},${source}\n`;
    });
    
    // Save to file
    const fileName = `Xpentrik_Export_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    
    await FileSystem.writeAsStringAsync(fileUri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    
    // Share the file
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Expenses',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
    
    return { success: true, fileUri };
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
};

/**
 * Create backup JSON
 */
export const createBackup = async () => {
  try {
    const expenses = await getExpenses();
    const settings = await getSettings();
    
    const backup = {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      expenses,
      settings,
    };
    
    const json = JSON.stringify(backup, null, 2);
    const fileName = `Xpentrik_Backup_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.json`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;
    
    await FileSystem.writeAsStringAsync(fileUri, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Backup Expenses',
      });
    }
    
    return { success: true, fileUri };
  } catch (error) {
    console.error('Backup error:', error);
    throw error;
  }
};

/**
 * Restore from backup JSON
 */
export const restoreFromBackup = async (backupJson) => {
  try {
    const backup = JSON.parse(backupJson);
    
    if (!backup.expenses || !Array.isArray(backup.expenses)) {
      throw new Error('Invalid backup format');
    }
    
    // Import expenses and settings - use dynamic import to avoid circular dependency
    const storageModule = await import('./storage');
    const { saveExpense, saveSettings, clearAllData } = storageModule;
    
    // Clear existing data first
    await clearAllData();
    
    // Restore expenses
    for (const expense of backup.expenses) {
      await saveExpense(expense);
    }
    
    // Restore settings
    if (backup.settings) {
      await saveSettings(backup.settings);
    }
    
    return { success: true, restored: backup.expenses.length };
  } catch (error) {
    console.error('Restore error:', error);
    throw error;
  }
};

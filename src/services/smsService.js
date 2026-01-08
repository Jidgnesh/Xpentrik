import { Platform, PermissionsAndroid, NativeModules } from 'react-native';
import { parseSMS, smsToExpense, generateSMSId } from '../utils/smsParser';
import { saveExpense, getProcessedSMSIds, markSMSAsProcessed } from '../utils/storage';

const { SmsModule } = NativeModules;

/**
 * Check if native SMS module is available
 */
export const isNativeModuleAvailable = () => {
  return Platform.OS === 'android' && SmsModule != null;
};

/**
 * Request SMS permissions
 */
export const requestSMSPermission = async () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);

    const allGranted = 
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;

    return allGranted;
  } catch (err) {
    console.error('Permission error:', err);
    return false;
  }
};

/**
 * Check if SMS permission is granted
 */
export const checkSMSPermission = async () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  // Try native module first
  if (isNativeModuleAvailable()) {
    try {
      const hasPermission = await SmsModule.checkPermission();
      return hasPermission;
    } catch (err) {
      console.error('Native permission check error:', err);
    }
  }

  // Fallback to PermissionsAndroid
  try {
    const readGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_SMS
    );
    const receiveGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
    );
    return readGranted && receiveGranted;
  } catch (err) {
    console.error('Permission check error:', err);
    return false;
  }
};

/**
 * Get pending SMS that were received while app was closed
 * These are saved by the native BroadcastReceiver
 */
export const getPendingSms = async () => {
  if (!isNativeModuleAvailable()) {
    return [];
  }

  try {
    const pendingSms = await SmsModule.getPendingSms();
    return pendingSms || [];
  } catch (error) {
    console.error('Error getting pending SMS:', error);
    return [];
  }
};

/**
 * Clear pending SMS after processing
 */
export const clearPendingSms = async () => {
  if (!isNativeModuleAvailable()) {
    return;
  }

  try {
    await SmsModule.clearPendingSms();
  } catch (error) {
    console.error('Error clearing pending SMS:', error);
  }
};

/**
 * Process pending SMS and create expenses
 * Call this when app opens to process SMS received while app was closed
 */
export const processPendingSms = async () => {
  const pendingSms = await getPendingSms();
  
  if (pendingSms.length === 0) {
    return { processed: 0, newExpenses: [] };
  }

  console.log(`Processing ${pendingSms.length} pending SMS...`);
  
  const processedIds = await getProcessedSMSIds();
  const newExpenses = [];

  for (const sms of pendingSms) {
    const smsId = generateSMSId(sms.body, new Date(sms.timestamp).toISOString());

    if (processedIds.includes(smsId)) {
      continue;
    }

    const parsed = parseSMS(sms.body, sms.sender, new Date(sms.timestamp).toISOString());
    const expense = smsToExpense(parsed);

    if (expense) {
      try {
        const saved = await saveExpense(expense);
        await markSMSAsProcessed(smsId);
        newExpenses.push(saved);
        console.log('Expense created from pending SMS:', saved.amount);
      } catch (error) {
        console.error('Error saving expense:', error);
      }
    } else {
      await markSMSAsProcessed(smsId);
    }
  }

  // Clear pending SMS after processing
  await clearPendingSms();

  return { processed: pendingSms.length, newExpenses };
};

/**
 * Start SMS listener (for when app is open)
 */
export const startSmsListener = async (onNewExpense) => {
  // Process any pending SMS first
  const { newExpenses } = await processPendingSms();
  
  if (newExpenses.length > 0 && onNewExpense) {
    newExpenses.forEach(expense => onNewExpense(expense));
  }

  // Set up interval to check for new pending SMS
  const intervalId = setInterval(async () => {
    const { newExpenses: newOnes } = await processPendingSms();
    if (newOnes.length > 0 && onNewExpense) {
      newOnes.forEach(expense => onNewExpense(expense));
    }
  }, 5000); // Check every 5 seconds

  return intervalId;
};

/**
 * Stop SMS listener
 */
export const stopSmsListener = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
  }
};

/**
 * Scan for new expenses (manual trigger)
 */
export const scanForNewExpenses = async () => {
  const { processed, newExpenses } = await processPendingSms();
  
  return {
    success: true,
    newExpenses,
    totalScanned: processed,
  };
};

/**
 * Sync week's SMS - scan last 7 days of messages and process any missed transactions
 */
export const syncWeekSms = async (days = 7) => {
  if (!isNativeModuleAvailable()) {
    return {
      success: false,
      error: 'Native SMS module not available. Please use the APK build.',
      newExpenses: [],
      totalScanned: 0,
      alreadyProcessed: 0,
    };
  }

  const hasPermission = await checkSMSPermission();
  if (!hasPermission) {
    return {
      success: false,
      error: 'SMS permission not granted. Please enable SMS permission.',
      newExpenses: [],
      totalScanned: 0,
      alreadyProcessed: 0,
    };
  }

  try {
    console.log(`Syncing last ${days} days of SMS...`);
    
    // Get transaction SMS from native module
    const messages = await SmsModule.getTransactionSms(days);
    
    if (!messages || messages.length === 0) {
      return {
        success: true,
        newExpenses: [],
        totalScanned: 0,
        alreadyProcessed: 0,
        message: 'No transaction messages found in the last week.',
      };
    }

    console.log(`Found ${messages.length} transaction SMS`);
    
    const processedIds = await getProcessedSMSIds();
    const newExpenses = [];
    let alreadyProcessed = 0;

    for (const sms of messages) {
      const timestamp = new Date(sms.timestamp).toISOString();
      const smsId = generateSMSId(sms.body, timestamp);

      if (processedIds.includes(smsId)) {
        alreadyProcessed++;
        continue;
      }

      const parsed = parseSMS(sms.body, sms.sender, timestamp);
      const expense = smsToExpense(parsed);

      if (expense) {
        try {
          const saved = await saveExpense(expense);
          await markSMSAsProcessed(smsId);
          newExpenses.push(saved);
          console.log('Expense synced:', saved.amount, saved.merchant);
        } catch (error) {
          console.error('Error saving synced expense:', error);
        }
      } else {
        // Mark as processed even if not a valid expense to avoid re-processing
        await markSMSAsProcessed(smsId);
      }
    }

    return {
      success: true,
      newExpenses,
      totalScanned: messages.length,
      alreadyProcessed,
      message: newExpenses.length > 0 
        ? `Synced ${newExpenses.length} new transactions!`
        : `All ${messages.length} messages already processed.`,
    };
  } catch (error) {
    console.error('Error syncing week SMS:', error);
    return {
      success: false,
      error: error.message || 'Failed to sync SMS',
      newExpenses: [],
      totalScanned: 0,
      alreadyProcessed: 0,
    };
  }
};

/**
 * Process SMS messages
 */
export const processSMSMessages = async (messages) => {
  const processedIds = await getProcessedSMSIds();
  const newExpenses = [];

  for (const sms of messages) {
    const smsId = generateSMSId(sms.body, sms.date);

    if (processedIds.includes(smsId)) {
      continue;
    }

    const parsed = parseSMS(sms.body, sms.address, sms.date);
    const expense = smsToExpense(parsed);

    if (expense) {
      try {
        const saved = await saveExpense(expense);
        await markSMSAsProcessed(smsId);
        newExpenses.push(saved);
      } catch (error) {
        console.error('Error saving expense from SMS:', error);
      }
    } else {
      await markSMSAsProcessed(smsId);
    }
  }

  return newExpenses;
};

/**
 * Manual SMS input
 */
export const processManualSMS = async (messageText, sender = 'MANUAL') => {
  const smsId = generateSMSId(messageText, new Date().toISOString());
  const processedIds = await getProcessedSMSIds();

  if (processedIds.includes(smsId)) {
    return { success: false, error: 'This message has already been processed' };
  }

  const parsed = parseSMS(messageText, sender, new Date().toISOString());
  const expense = smsToExpense(parsed);

  if (expense) {
    try {
      const saved = await saveExpense(expense);
      await markSMSAsProcessed(smsId);
      return { success: true, expense: saved, parsed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return {
    success: false,
    error: 'Could not extract transaction from message',
    parsed,
  };
};

/**
 * Get SMS reading status
 */
export const getSMSStatus = async () => {
  const isAndroid = Platform.OS === 'android';
  const hasNativeModule = isNativeModuleAvailable();
  const hasPermission = isAndroid ? await checkSMSPermission() : false;

  let message = '';
  if (!isAndroid) {
    message = 'SMS auto-read is only available on Android.';
  } else if (!hasNativeModule) {
    message = 'Install the APK build to enable SMS auto-read.';
  } else if (!hasPermission) {
    message = 'Tap to enable SMS permission for automatic tracking.';
  } else {
    message = '✅ SMS auto-read active! Bank SMS will be tracked even when app is closed.';
  }

  return {
    platform: Platform.OS,
    supported: isAndroid && hasNativeModule,
    permissionGranted: hasPermission,
    isExpoGo: !hasNativeModule,
    message,
  };
};

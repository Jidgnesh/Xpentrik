import { NativeModules, NativeEventEmitter, Platform, PermissionsAndroid } from 'react-native';
import { parseSMS, smsToExpense, generateSMSId } from '../utils/smsParser';
import { saveExpense, getProcessedSMSIds, markSMSAsProcessed } from '../utils/storage';

const { SmsModule } = NativeModules;

// Event emitter for real-time SMS
let smsEventEmitter = null;
let smsSubscription = null;

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

    return (
      granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED &&
      granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED
    );
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

  if (!isNativeModuleAvailable()) {
    return false;
  }

  try {
    const hasPermission = await SmsModule.checkPermission();
    return hasPermission;
  } catch (err) {
    console.error('Permission check error:', err);
    return false;
  }
};

/**
 * Read transaction SMS messages from device
 */
export const readSMSMessages = async (options = {}) => {
  const { maxCount = 100, minDate = null } = options;

  if (!isNativeModuleAvailable()) {
    console.log('SMS module not available');
    return [];
  }

  const hasPermission = await checkSMSPermission();
  if (!hasPermission) {
    const granted = await requestSMSPermission();
    if (!granted) {
      throw new Error('SMS permission denied');
    }
  }

  try {
    const minTimestamp = minDate ? new Date(minDate).getTime() : 0;
    const messages = await SmsModule.getTransactionMessages(maxCount, minTimestamp);
    
    return messages.map(sms => ({
      body: sms.body,
      address: sms.address,
      date: new Date(sms.date).toISOString(),
      id: sms.id,
    }));
  } catch (error) {
    console.error('Error reading SMS:', error);
    throw error;
  }
};

/**
 * Process SMS messages and extract expenses
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
 * Scan for new transaction SMS and create expenses
 */
export const scanForNewExpenses = async () => {
  if (!isNativeModuleAvailable()) {
    return {
      success: false,
      error: 'SMS module not available. Please use development build.',
      newExpenses: [],
      totalScanned: 0,
    };
  }

  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const messages = await readSMSMessages({
      maxCount: 200,
      minDate: sevenDaysAgo.toISOString(),
    });

    const newExpenses = await processSMSMessages(messages);

    return {
      success: true,
      newExpenses,
      totalScanned: messages.length,
    };
  } catch (error) {
    console.error('Error scanning for expenses:', error);
    return {
      success: false,
      error: error.message,
      newExpenses: [],
      totalScanned: 0,
    };
  }
};

/**
 * Start listening for real-time SMS
 */
export const startSmsListener = (onNewExpense) => {
  if (!isNativeModuleAvailable()) {
    console.log('SMS listener not available in Expo Go');
    return null;
  }

  try {
    if (!smsEventEmitter) {
      smsEventEmitter = new NativeEventEmitter(SmsModule);
    }

    // Remove existing subscription
    if (smsSubscription) {
      smsSubscription.remove();
    }

    smsSubscription = smsEventEmitter.addListener('onSmsReceived', async (event) => {
      console.log('SMS received:', event.sender);
      
      const smsId = generateSMSId(event.body, new Date(event.timestamp).toISOString());
      const processedIds = await getProcessedSMSIds();

      if (processedIds.includes(smsId)) {
        console.log('SMS already processed');
        return;
      }

      const parsed = parseSMS(event.body, event.sender, new Date(event.timestamp).toISOString());
      const expense = smsToExpense(parsed);

      if (expense) {
        try {
          const saved = await saveExpense(expense);
          await markSMSAsProcessed(smsId);
          console.log('Expense saved from SMS:', saved.amount);
          
          if (onNewExpense) {
            onNewExpense(saved);
          }
        } catch (error) {
          console.error('Error saving expense:', error);
        }
      }
    });

    console.log('SMS listener started');
    return smsSubscription;
  } catch (error) {
    console.error('Error starting SMS listener:', error);
    return null;
  }
};

/**
 * Stop listening for SMS
 */
export const stopSmsListener = () => {
  if (smsSubscription) {
    smsSubscription.remove();
    smsSubscription = null;
    console.log('SMS listener stopped');
  }
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
  const hasPermission = hasNativeModule ? await checkSMSPermission() : false;

  let message = '';
  if (!isAndroid) {
    message = 'SMS auto-read is only available on Android.';
  } else if (!hasNativeModule) {
    message = 'Running in Expo Go. Build APK for auto SMS reading.';
  } else if (!hasPermission) {
    message = 'Tap to enable SMS permission for automatic tracking.';
  } else {
    message = '✅ SMS auto-read enabled! Expenses are tracked automatically.';
  }

  return {
    platform: Platform.OS,
    supported: isAndroid && hasNativeModule,
    permissionGranted: hasPermission,
    isExpoGo: !hasNativeModule,
    message,
  };
};

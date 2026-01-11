import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_SETTINGS_KEY = '@xpentrik_notification_settings';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions
 */
export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      return false;
    }
    
    // Configure notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6B35',
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

/**
 * Schedule daily reminder notification
 */
export const scheduleDailyReminder = async (hour = 20, minute = 0) => {
  try {
    await requestNotificationPermissions();
    
    // Cancel existing daily reminders
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Schedule new daily reminder
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📝 Reminder: Log Your Expenses',
        body: 'Don\'t forget to track your expenses today!',
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      },
    });
    
    // Save settings
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify({
      dailyReminder: { enabled: true, hour, minute },
    }));
    
    return true;
  } catch (error) {
    console.error('Error scheduling daily reminder:', error);
    return false;
  }
};

/**
 * Cancel daily reminder
 */
export const cancelDailyReminder = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify({
      dailyReminder: { enabled: false },
    }));
    return true;
  } catch (error) {
    console.error('Error canceling reminder:', error);
    return false;
  }
};

/**
 * Send budget alert notification
 */
export const sendBudgetAlert = async (percentage) => {
  try {
    await requestNotificationPermissions();
    
    let title, body;
    if (percentage >= 100) {
      title = '⚠️ Budget Exceeded!';
      body = 'You\'ve exceeded your monthly budget. Review your spending.';
    } else if (percentage >= 90) {
      title = '⚡ Budget Warning';
      body = `You've used ${percentage.toFixed(0)}% of your budget. Be careful with spending.`;
    } else if (percentage >= 80) {
      title = '💡 Budget Update';
      body = `You've used ${percentage.toFixed(0)}% of your budget this month.`;
    } else {
      return; // Don't send notification for < 80%
    }
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // Send immediately
    });
    
    return true;
  } catch (error) {
    console.error('Error sending budget alert:', error);
    return false;
  }
};

/**
 * Get notification settings
 */
export const getNotificationSettings = async () => {
  try {
    const data = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    return data ? JSON.parse(data) : { dailyReminder: { enabled: false } };
  } catch (error) {
    return { dailyReminder: { enabled: false } };
  }
};

/**
 * Send expense added notification
 */
export const sendExpenseAddedNotification = async (expense) => {
  try {
    await requestNotificationPermissions();
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: expense.isIncome ? '💰 Income Added' : '💸 Expense Added',
        body: `₹${expense.amount} - ${expense.description || 'Transaction'}`,
        sound: true,
      },
      trigger: null,
    });
  } catch (error) {
    console.error('Error sending expense notification:', error);
  }
};

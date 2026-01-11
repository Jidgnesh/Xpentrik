import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  TextInput as TimeInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { getSettings, saveSettings, clearAllData, getExpenses } from '../utils/storage';
import { getSMSStatus, requestSMSPermission, scanForNewExpenses } from '../services/smsService';
import { exportToCSV, createBackup } from '../utils/export';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { restoreFromBackup } from '../utils/export';
import {
  requestNotificationPermissions,
  scheduleDailyReminder,
  cancelDailyReminder,
  getNotificationSettings,
} from '../services/notifications';

const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState({
    currency: '₹',
    autoReadSMS: true,
    monthlyBudget: 50000,
  });
  const [smsStatus, setSmsStatus] = useState(null);
  const [expenseCount, setExpenseCount] = useState(0);
  const [budgetInput, setBudgetInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({ dailyReminder: { enabled: false } });
  const [reminderTime, setReminderTime] = useState('20:00');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, smsStatusData, expenses, notifSettings] = await Promise.all([
        getSettings(),
        getSMSStatus(),
        getExpenses(),
        getNotificationSettings(),
      ]);
      setSettings(settingsData);
      setSmsStatus(smsStatusData);
      setExpenseCount(expenses.length);
      setBudgetInput(settingsData.monthlyBudget.toString());
      setNotificationSettings(notifSettings);
      if (notifSettings.dailyReminder?.enabled) {
        const hour = String(notifSettings.dailyReminder.hour || 20).padStart(2, '0');
        const minute = String(notifSettings.dailyReminder.minute || 0).padStart(2, '0');
        setReminderTime(`${hour}:${minute}`);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleSaveBudget = async () => {
    const budget = parseFloat(budgetInput);
    if (isNaN(budget) || budget <= 0) {
      Alert.alert('Invalid Budget', 'Please enter a valid budget amount');
      return;
    }

    try {
      const newSettings = { ...settings, monthlyBudget: budget };
      await saveSettings(newSettings);
      setSettings(newSettings);
      Alert.alert('Success', 'Budget updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save budget');
    }
  };

  const handleToggleAutoSMS = async (value) => {
    if (value && smsStatus && !smsStatus.permissionGranted) {
      const granted = await requestSMSPermission();
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'SMS permission is needed for automatic expense tracking'
        );
        return;
      }
      setSmsStatus({ ...smsStatus, permissionGranted: true });
    }

    const newSettings = { ...settings, autoReadSMS: value };
    await saveSettings(newSettings);
    setSettings(newSettings);
  };

  const handleScanSMS = async () => {
    if (!smsStatus?.permissionGranted) {
      const granted = await requestSMSPermission();
      if (!granted) {
        Alert.alert('Permission Required', 'SMS permission is needed to scan messages');
        return;
      }
    }

    setIsScanning(true);
    try {
      const result = await scanForNewExpenses();
      if (result.success) {
        Alert.alert(
          'Scan Complete',
          `Scanned ${result.totalScanned} messages.\nFound ${result.newExpenses.length} new expense(s).`
        );
        loadSettings();
      } else {
        Alert.alert('Scan Failed', result.error || 'Could not scan messages');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to scan SMS messages');
    } finally {
      setIsScanning(false);
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all your expenses and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllData();
              await loadSettings();
              Alert.alert('Success', 'All data has been cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (amount) => {
    return amount.toLocaleString('en-IN');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Customize your experience</Text>
        </View>

        {/* Budget Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Monthly Budget</Text>
          
          <View style={styles.card}>
            <View style={styles.budgetInputContainer}>
              <Text style={styles.currencySymbol}>₹</Text>
              <TextInput
                style={styles.budgetInput}
                value={budgetInput}
                onChangeText={setBudgetInput}
                keyboardType="numeric"
                placeholder="50000"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveBudget}>
              <Text style={styles.saveButtonText}>Save Budget</Text>
            </TouchableOpacity>

            <Text style={styles.budgetHint}>
              Current: ₹{formatCurrency(settings.monthlyBudget)}
            </Text>
          </View>
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Your Data</Text>
          
          <View style={styles.card}>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>Total Expenses</Text>
              <Text style={styles.dataValue}>{expenseCount}</Text>
            </View>

            <View style={styles.divider} />

            {/* Export CSV */}
            <TouchableOpacity
              style={styles.exportButton}
              onPress={async () => {
                setIsExporting(true);
                try {
                  await exportToCSV();
                  Alert.alert('Success', 'Expenses exported to CSV successfully!');
                } catch (error) {
                  Alert.alert('Error', 'Failed to export expenses: ' + error.message);
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
            >
              <Text style={styles.exportButtonText}>
                {isExporting ? 'Exporting...' : '📥 Export to CSV'}
              </Text>
            </TouchableOpacity>

            {/* Backup */}
            <TouchableOpacity
              style={styles.exportButton}
              onPress={async () => {
                setIsBackingUp(true);
                try {
                  await createBackup();
                  Alert.alert('Success', 'Backup created successfully!');
                } catch (error) {
                  Alert.alert('Error', 'Failed to create backup: ' + error.message);
                } finally {
                  setIsBackingUp(false);
                }
              }}
              disabled={isBackingUp}
            >
              <Text style={styles.exportButtonText}>
                {isBackingUp ? 'Backing up...' : '💾 Create Backup'}
              </Text>
            </TouchableOpacity>

            {/* Restore */}
            <TouchableOpacity
              style={styles.exportButton}
              onPress={async () => {
                Alert.alert(
                  'Restore Backup',
                  'This will replace all your current data with the backup. Continue?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Restore',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const result = await DocumentPicker.getDocumentAsync({
                            type: 'application/json',
                            copyToCacheDirectory: true,
                          });
                          
                          if (!result.canceled && result.assets[0]) {
                            const fileUri = result.assets[0].uri;
                            const fileContent = await FileSystem.readAsStringAsync(fileUri);
                            await restoreFromBackup(fileContent);
                            Alert.alert('Success', 'Backup restored successfully!');
                            loadSettings();
                          }
                        } catch (error) {
                          Alert.alert('Error', 'Failed to restore backup: ' + error.message);
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.exportButtonText}>📤 Restore from Backup</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
              <Text style={styles.dangerButtonText}>🗑️ Clear All Data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔔 Notifications</Text>
          
          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Daily Reminder</Text>
                <Text style={styles.settingDescription}>
                  Get reminded to log your expenses daily
                </Text>
              </View>
              <Switch
                value={notificationSettings.dailyReminder?.enabled || false}
                onValueChange={async (value) => {
                  if (value) {
                    const granted = await requestNotificationPermissions();
                    if (granted) {
                      const [hour, minute] = reminderTime.split(':').map(Number);
                      await scheduleDailyReminder(hour, minute);
                      await loadSettings();
                    } else {
                      Alert.alert('Permission Required', 'Please enable notifications in Settings');
                    }
                  } else {
                    await cancelDailyReminder();
                    await loadSettings();
                  }
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            </View>

            {notificationSettings.dailyReminder?.enabled && (
              <View style={styles.reminderTimeContainer}>
                <Text style={styles.reminderTimeLabel}>Reminder Time</Text>
                <TextInput
                  style={styles.reminderTimeInput}
                  value={reminderTime}
                  onChangeText={setReminderTime}
                  placeholder="20:00"
                  placeholderTextColor={colors.textMuted}
                  onBlur={async () => {
                    const [hour, minute] = reminderTime.split(':').map(Number);
                    if (!isNaN(hour) && !isNaN(minute) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
                      await scheduleDailyReminder(hour, minute);
                      await loadSettings();
                    } else {
                      Alert.alert('Invalid Time', 'Please enter time in HH:MM format');
                      setReminderTime('20:00');
                    }
                  }}
                />
              </View>
            )}
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ About</Text>
          
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>App Name</Text>
              <Text style={styles.aboutValue}>Xpentrik</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Purpose</Text>
              <Text style={styles.aboutValue}>Personal Expense Tracking</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
    paddingBottom: 24,
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginRight: 8,
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
  scanButton: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  scanButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  iosNote: {
    backgroundColor: colors.secondaryMuted,
    borderRadius: 12,
    padding: 14,
  },
  iosNoteText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 18,
  },
  budgetInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
    marginRight: 8,
  },
  budgetInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 16,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  budgetHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dataLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  dataValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  dangerButton: {
    backgroundColor: colors.dangerMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  dangerButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  aboutLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  exportButton: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  exportButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  reminderTimeContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reminderTimeLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  reminderTimeInput: {
    backgroundColor: colors.backgroundTertiary,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    fontFamily: 'monospace',
  },
});

export default SettingsScreen;


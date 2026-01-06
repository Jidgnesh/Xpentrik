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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { getSettings, saveSettings, clearAllData, getExpenses } from '../utils/storage';
import { getSMSStatus, requestSMSPermission, scanForNewExpenses } from '../services/smsService';

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

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [settingsData, smsStatusData, expenses] = await Promise.all([
        getSettings(),
        getSMSStatus(),
        getExpenses(),
      ]);
      setSettings(settingsData);
      setSmsStatus(smsStatusData);
      setExpenseCount(expenses.length);
      setBudgetInput(settingsData.monthlyBudget.toString());
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

        {/* SMS Settings Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📱 SMS Auto-Read</Text>
          
          <View style={styles.card}>
            {/* Status Message */}
            <View style={[
              styles.iosNote, 
              { backgroundColor: smsStatus?.permissionGranted ? colors.successMuted : colors.secondaryMuted }
            ]}>
              <Text style={[
                styles.iosNoteText, 
                { color: smsStatus?.permissionGranted ? colors.success : colors.secondary }
              ]}>
                {smsStatus?.message || 'Loading...'}
              </Text>
            </View>

            {/* Enable Permission Button */}
            {smsStatus?.supported && !smsStatus?.permissionGranted && (
              <TouchableOpacity
                style={[styles.scanButton, { marginTop: 12 }]}
                onPress={async () => {
                  const granted = await requestSMSPermission();
                  if (granted) {
                    Alert.alert('Success', 'SMS auto-read enabled! Expenses will be tracked automatically.');
                    loadSettings();
                  } else {
                    Alert.alert('Permission Denied', 'Please enable SMS permission in Settings.');
                  }
                }}
              >
                <Text style={styles.scanButtonText}>🔓 Enable SMS Permission</Text>
              </TouchableOpacity>
            )}

            {/* Scan Button */}
            {smsStatus?.supported && smsStatus?.permissionGranted && (
              <TouchableOpacity
                style={[styles.scanButton, { marginTop: 12 }]}
                onPress={handleScanSMS}
                disabled={isScanning}
              >
                <Text style={styles.scanButtonText}>
                  {isScanning ? 'Scanning...' : '🔍 Scan Past Messages'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Expo Go Notice */}
            {smsStatus?.isExpoGo && (
              <View style={[styles.iosNote, { backgroundColor: colors.warningMuted, marginTop: 12 }]}>
                <Text style={[styles.iosNoteText, { color: colors.warning }]}>
                  ⚠️ Running in Expo Go - SMS auto-read disabled.{'\n\n'}
                  Build APK for automatic SMS tracking:{'\n'}
                  <Text style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    eas build --platform android --profile preview
                  </Text>
                </Text>
              </View>
            )}

            {/* Manual Paste Info */}
            <View style={[styles.iosNote, { backgroundColor: colors.surface, marginTop: 12 }]}>
              <Text style={[styles.iosNoteText, { color: colors.textSecondary }]}>
                💡 You can also manually paste SMS:{'\n'}
                Tap + → "Paste SMS" → Paste bank message
              </Text>
            </View>
          </View>
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

            <TouchableOpacity style={styles.dangerButton} onPress={handleClearData}>
              <Text style={styles.dangerButtonText}>🗑️ Clear All Data</Text>
            </TouchableOpacity>
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
});

export default SettingsScreen;


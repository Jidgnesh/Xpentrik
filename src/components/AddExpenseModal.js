import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import CategoryPicker from './CategoryPicker';
import { saveExpense, updateExpense } from '../utils/storage';
import { processManualSMS } from '../services/smsService';

const AddExpenseModal = ({ visible, onClose, onExpenseAdded, expenseToEdit = null }) => {
  const [mode, setMode] = useState('manual'); // 'manual' or 'sms'
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [smsText, setSmsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);

  const isEditMode = expenseToEdit !== null;

  useEffect(() => {
    if (visible && expenseToEdit) {
      // Populate form with expense data for editing
      setAmount(expenseToEdit.amount.toString());
      setDescription(expenseToEdit.description || '');
      setCategory(expenseToEdit.category || 'other');
      setMode('manual'); // Always use manual mode for editing
    } else if (!visible) {
      // Reset form when modal closes
      setAmount('');
      setDescription('');
      setCategory('other');
      setSmsText('');
      setError('');
      setParsedPreview(null);
      setMode('manual');
    }
  }, [visible, expenseToEdit]);

  const handleSaveManual = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (isEditMode) {
        // Update existing expense
        const updated = await updateExpense(expenseToEdit.id, {
          amount: parseFloat(amount),
          description: description || 'Manual Entry',
          category,
        });
        onExpenseAdded(updated);
      } else {
        // Create new expense
        const expense = await saveExpense({
          amount: parseFloat(amount),
          description: description || 'Manual Entry',
          category,
          date: new Date().toISOString(),
          source: 'manual',
        });
        onExpenseAdded(expense);
      }
      onClose();
    } catch (err) {
      setError(isEditMode ? 'Failed to update expense' : 'Failed to save expense');
    } finally {
      setLoading(false);
    }
  };

  const handleParseSMS = async () => {
    if (!smsText.trim()) {
      setError('Please paste an SMS message');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await processManualSMS(smsText);
      
      if (result.success) {
        onExpenseAdded(result.expense);
        onClose();
      } else {
        setError(result.error || 'Could not extract transaction');
        if (result.parsed) {
          setParsedPreview(result.parsed);
        }
      }
    } catch (err) {
      setError('Failed to process SMS');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>{isEditMode ? 'Edit Expense' : 'Add Expense'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Mode Toggle - Hide in edit mode */}
          {!isEditMode && (
          <View style={styles.modeToggle}>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'manual' && styles.modeButtonActive]}
              onPress={() => setMode('manual')}
            >
              <Text style={[styles.modeButtonText, mode === 'manual' && styles.modeButtonTextActive]}>
                ✏️ Manual
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, mode === 'sms' && styles.modeButtonActive]}
              onPress={() => setMode('sms')}
            >
              <Text style={[styles.modeButtonText, mode === 'sms' && styles.modeButtonTextActive]}>
                📱 Paste SMS
              </Text>
            </TouchableOpacity>
          </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {mode === 'manual' ? (
              <>
                {/* Amount Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Amount</Text>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      autoFocus
                    />
                  </View>
                </View>

                {/* Description Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Description</Text>
                  <TextInput
                    style={styles.textInput}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What did you spend on?"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>

                {/* Category Picker */}
                <CategoryPicker
                  selectedCategory={category}
                  onSelect={setCategory}
                />
              </>
            ) : (
              <>
                {/* SMS Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Paste Bank SMS</Text>
                  <TextInput
                    style={[styles.textInput, styles.smsInput]}
                    value={smsText}
                    onChangeText={setSmsText}
                    placeholder="Paste your bank transaction SMS here..."
                    placeholderTextColor={colors.textMuted}
                    multiline
                    numberOfLines={5}
                    textAlignVertical="top"
                    autoFocus
                  />
                </View>

                {/* Parsed Preview */}
                {parsedPreview && (
                  <View style={styles.previewContainer}>
                    <Text style={styles.previewTitle}>Parsed Result:</Text>
                    <Text style={styles.previewText}>
                      Amount: ₹{parsedPreview.amount || 'Not found'}
                    </Text>
                    <Text style={styles.previewText}>
                      Type: {parsedPreview.type || 'Unknown'}
                    </Text>
                    <Text style={styles.previewText}>
                      Merchant: {parsedPreview.merchant || 'Not found'}
                    </Text>
                    <Text style={styles.previewText}>
                      Confidence: {parsedPreview.confidence}%
                    </Text>
                  </View>
                )}

                <View style={styles.smsHint}>
                  <Text style={styles.smsHintText}>
                    💡 Works best with bank transaction SMS containing amount, merchant, and transaction type.
                  </Text>
                </View>
              </>
            )}

            {/* Error Message */}
            {error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Save Button */}
          <TouchableOpacity
            onPress={mode === 'manual' ? handleSaveManual : handleParseSMS}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={colors.gradients.primary}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveButton}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.saveButtonText}>
                  {isEditMode ? 'Update Expense' : mode === 'manual' ? 'Save Expense' : 'Extract & Save'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '90%',
  },
  header: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.textMuted,
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    top: 28,
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  modeToggle: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: colors.primary,
  },
  modeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: colors.text,
  },
  content: {
    paddingHorizontal: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 10,
    marginLeft: 4,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.primary,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '800',
    color: colors.text,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.text,
  },
  smsInput: {
    minHeight: 120,
    paddingTop: 16,
  },
  previewContainer: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  previewText: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 4,
  },
  smsHint: {
    backgroundColor: colors.secondaryMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  smsHintText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 18,
  },
  errorContainer: {
    backgroundColor: colors.dangerMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: colors.danger,
    textAlign: 'center',
  },
  saveButton: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
});

export default AddExpenseModal;

